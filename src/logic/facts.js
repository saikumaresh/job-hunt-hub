// Guardrails that keep Claude's output tied to real facts. Pure, unit tested.
//
// The resume builder may reorder, select and lightly rephrase the person's own bullets.
// It may never add a number, date, employer, title or skill that is not in the master profile.

/** Numbers in a string, normalised ("1,200" -> "1200", "40%" -> "40"). */
export function numbersIn(text) {
  return (String(text).match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, ""));
}

/** True when every number in `candidate` also appears in `source`. */
export function numbersSubset(candidate, source) {
  const allowed = new Set(numbersIn(source));
  return numbersIn(candidate).every((n) => allowed.has(n));
}

const norm = (s) =>
  String(s).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/** True when `quote` appears in `text`, ignoring case, curly quotes and spacing. */
export function quoteIn(quote, text) {
  const q = norm(quote);
  return q.length >= 4 && norm(text).includes(q);
}

/** All bullets in a profile as a Map id -> bullet. */
export function bulletIndex(profile) {
  const m = new Map();
  for (const role of profile?.experience || [])
    for (const b of role.bullets || []) m.set(b.id, { ...b, roleId: role.id });
  for (const p of profile?.projects || [])
    for (const b of p.bullets || []) m.set(b.id, { ...b, projectId: p.id });
  return m;
}

/** Every string in the profile joined, used as the allowed-facts corpus. */
export function profileCorpus(profile) {
  const parts = [];
  const walk = (v) => {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(profile);
  return parts.join(" \n ");
}

/** Skills listed in the profile, lowercased. */
export function profileSkills(profile) {
  return new Set(
    (profile?.skills || [])
      .flatMap((g) => g.items || [])
      .map((s) => String(s).toLowerCase().trim()),
  );
}

/**
 * Check Claude's tailoring against the master profile.
 * Returns { tailored, dropped } where dropped explains every change that was refused.
 */
export function validateTailoring(profile, raw) {
  const bullets = bulletIndex(profile);
  const corpus = profileCorpus(profile);
  const skills = profileSkills(profile);
  const dropped = [];
  const roles = new Map((profile.experience || []).map((r) => [r.id, r]));

  const experience = (Array.isArray(raw?.experience) ? raw.experience : [])
    .filter((r) => roles.has(r?.id))
    .map((r) => {
      const ids = (Array.isArray(r.bulletIds) ? r.bulletIds : []).filter((id) => {
        const ok = bullets.get(id)?.roleId === r.id;
        if (!ok) dropped.push(`Unknown bullet ${id} in ${r.id}`);
        return ok;
      });
      const rewrites = {};
      for (const [id, text] of Object.entries(r.rewrites || {})) {
        const src = bullets.get(id);
        if (!src || !ids.includes(id)) continue;
        const t = String(text).trim();
        if (!t) continue;
        if (!numbersSubset(t, src.text)) {
          dropped.push(
            `Rewrite of "${src.text.slice(0, 50)}…" added a number; kept your original.`,
          );
          continue;
        }
        if (t.length > Math.max(260, src.text.length * 1.4)) {
          dropped.push(`Rewrite of "${src.text.slice(0, 50)}…" was too long; kept your original.`);
          continue;
        }
        rewrites[id] = t;
      }
      return { id: r.id, bulletIds: [...new Set(ids)], rewrites };
    });

  // Roles Claude left out still appear (with their top bullets) so dates stay continuous.
  for (const r of profile.experience || []) {
    if (!experience.some((e) => e.id === r.id)) {
      experience.push({
        id: r.id,
        bulletIds: (r.bullets || []).slice(0, 2).map((b) => b.id),
        rewrites: {},
      });
    }
  }
  const order = (profile.experience || []).map((r) => r.id);
  experience.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  let summary = String(raw?.summary || "").trim();
  if (summary && !numbersSubset(summary, corpus)) {
    dropped.push("The suggested summary added a number; kept your original summary.");
    summary = "";
  }

  const skillOrder = (Array.isArray(raw?.skills) ? raw.skills : []).filter((s) => {
    const ok = skills.has(String(s).toLowerCase().trim());
    if (!ok) dropped.push(`Skill "${s}" is not in your profile; left out.`);
    return ok;
  });

  return {
    tailored: {
      summary: summary || profile.summary || "",
      experience,
      skills: skillOrder,
      keywords: (Array.isArray(raw?.keywords) ? raw.keywords : []).map(String).slice(0, 20),
    },
    dropped,
  };
}

/** Keep only analysis evidence whose quote really appears in the posting. */
export function validateAnalysis(raw, postText) {
  const list = (xs) =>
    Array.isArray(xs) ? xs.map((x) => String(x).slice(0, 200)).slice(0, 12) : [];
  const evidence = (Array.isArray(raw?.evidence) ? raw.evidence : [])
    .filter((e) => e && quoteIn(e.quote, postText))
    .map((e) => ({
      requirement: String(e.requirement || "").slice(0, 120),
      quote: String(e.quote).slice(0, 240),
      match: ["strong", "partial", "gap"].includes(e.match) ? e.match : "partial",
      profileFact: String(e.profileFact || "").slice(0, 200),
    }));
  const score = Math.max(0, Math.min(100, Math.round(Number(raw?.score) || 0)));
  return {
    company: String(raw?.company || "").slice(0, 80),
    role: String(raw?.role || "").slice(0, 120),
    location: String(raw?.location || "").slice(0, 80),
    salary: String(raw?.salary || "").slice(0, 60),
    seniority: String(raw?.seniority || "").slice(0, 40),
    summary: String(raw?.summary || "").slice(0, 400),
    mustHave: list(raw?.mustHave),
    niceToHave: list(raw?.niceToHave),
    redFlags: list(raw?.redFlags),
    talkingPoints: list(raw?.talkingPoints).slice(0, 3),
    evidence,
    score: evidence.length ? score : 0,
  };
}

/** Word count, for the 120 to 180 word cover note rule. */
export const wordCount = (s) => (String(s).trim().match(/\S+/g) || []).length;

/**
 * Clean the profile Claude structured from pasted resume text.
 * Gives every role and bullet a stable id and flags any bullet whose numbers are not in the source.
 */
export function validateProfile(raw, sourceText) {
  const str = (v, n = 200) =>
    String(v ?? "")
      .trim()
      .slice(0, n);
  const flagged = [];
  let k = 0;
  const bulletsOf = (xs, prefix) =>
    (Array.isArray(xs) ? xs : [])
      .map((b) => (typeof b === "string" ? { text: b } : b))
      .filter((b) => b && str(b.text))
      .map((b) => {
        const text = str(b.text, 400);
        const unverified = sourceText ? !numbersSubset(text, sourceText) : false;
        if (unverified) flagged.push(text);
        return { id: `${prefix}b${++k}`, text, ...(unverified ? { unverified: true } : {}) };
      });
  const experience = (Array.isArray(raw?.experience) ? raw.experience : []).map((r, i) => ({
    id: `r${i + 1}`,
    company: str(r.company, 100),
    title: str(r.title, 100),
    location: str(r.location, 80),
    start: str(r.start, 20),
    end: str(r.end, 20) || "Present",
    bullets: bulletsOf(r.bullets, `r${i + 1}`),
  }));
  const projects = (Array.isArray(raw?.projects) ? raw.projects : []).map((p, i) => ({
    id: `p${i + 1}`,
    name: str(p.name, 100),
    link: /^https:\/\//.test(p.link || "") ? str(p.link, 200) : "",
    bullets: bulletsOf(p.bullets, `p${i + 1}`),
  }));
  return {
    profile: {
      kind: "profile",
      name: str(raw?.name, 80),
      headline: str(raw?.headline, 120),
      contact: {
        email: str(raw?.contact?.email, 100),
        phone: str(raw?.contact?.phone, 40),
        location: str(raw?.contact?.location, 80),
        links: (Array.isArray(raw?.contact?.links) ? raw.contact.links : [])
          .map((l) => str(l, 200))
          .filter((l) => /^https?:\/\//.test(l) || /\w+\.\w+/.test(l))
          .slice(0, 4),
      },
      summary: str(raw?.summary, 700),
      experience,
      projects,
      education: (Array.isArray(raw?.education) ? raw.education : []).map((e) => ({
        school: str(e.school, 120),
        degree: str(e.degree, 140),
        start: str(e.start, 20),
        end: str(e.end, 20),
        detail: str(e.detail, 200),
      })),
      skills: (Array.isArray(raw?.skills) ? raw.skills : [])
        .map((g) => ({
          name: str(g.name, 40) || "Skills",
          items: (g.items || []).map((x) => str(x, 40)).filter(Boolean),
        }))
        .filter((g) => g.items.length),
      certifications: (Array.isArray(raw?.certifications) ? raw.certifications : [])
        .map((c) => str(c, 140))
        .filter(Boolean),
    },
    flagged,
  };
}
