// Resume assembly and one-page layout. Pure: text measurement is injected,
// so the same layout drives the PDF, the DOCX font size and the unit tests.
//
// ATS rules applied here: one column, standard section names, plain text bullets,
// no tables, images or text boxes, consistent "Mon YYYY - Mon YYYY" dates.

export const PAGES = {
  A4: { w: 595.28, h: 841.89 },
  Letter: { w: 612, h: 792 },
};
export const FONT_STEPS = [10.5, 10.25, 10, 9.75, 9.5, 9.25, 9];
const MIN_FONT_FOR_TRIM = 9.5;

/** Build the resume content from the master profile and (optionally) a tailoring. */
export function assembleResume(profile, tailored) {
  const roleBy = new Map((profile.experience || []).map((r) => [r.id, r]));
  const experience = tailored?.experience?.length
    ? tailored.experience.map((t) => ({ role: roleBy.get(t.id), t })).filter((x) => x.role)
    : (profile.experience || []).map((role) => ({ role, t: null }));

  const expItems = experience.map(({ role, t }, r) => {
    const byId = new Map((role.bullets || []).map((b) => [b.id, b]));
    const ids = t ? t.bulletIds : (role.bullets || []).map((b) => b.id);
    return {
      heading: [role.title, role.company].filter(Boolean).join(", "),
      dates: dateRange(role.start, role.end),
      sub: role.location || "",
      bullets: ids
        .map((id, i) => ({
          id,
          text: t?.rewrites?.[id] || byId.get(id)?.text,
          priority: r * 10 + i,
        }))
        .filter((b) => b.text),
    };
  });

  const skillsFlat = (profile.skills || []).flatMap((g) => g.items || []);
  const order = tailored?.skills?.length ? tailored.skills : [];
  const rank = (s) => {
    const i = order.findIndex((o) => o.toLowerCase() === s.toLowerCase());
    return i < 0 ? 1000 : i;
  };
  const skillLines = (profile.skills || []).map((g) => {
    const items = [...(g.items || [])].sort((a, b) => rank(a) - rank(b));
    return `${g.name}: ${items.join(", ")}`;
  });

  const sections = [];
  const summary = tailored?.summary || profile.summary;
  if (summary) sections.push({ title: "Summary", lines: [summary] });
  if (expItems.length) sections.push({ title: "Experience", items: expItems });
  if (profile.projects?.length)
    sections.push({
      title: "Projects",
      items: profile.projects.map((p, i) => ({
        heading: p.name,
        dates: "",
        sub: p.link || "",
        bullets: (p.bullets || []).map((b, j) => ({
          id: b.id,
          text: b.text,
          priority: 100 + i * 10 + j,
        })),
      })),
    });
  if (profile.education?.length)
    sections.push({
      title: "Education",
      items: profile.education.map((e) => ({
        heading: [e.degree, e.school].filter(Boolean).join(", "),
        dates: dateRange(e.start, e.end),
        sub: e.detail || "",
        bullets: [],
      })),
    });
  if (skillsFlat.length) sections.push({ title: "Skills", lines: skillLines });
  if (profile.certifications?.length)
    sections.push({ title: "Certifications", lines: profile.certifications });

  const c = profile.contact || {};
  return {
    name: profile.name || "Your Name",
    headline: profile.headline || "",
    contact: [c.location, c.email, c.phone, ...(c.links || [])].filter(Boolean).join("  |  "),
    sections,
  };
}

export function dateRange(start, end) {
  if (!start && !end) return "";
  return `${start || ""}${start || end ? " - " : ""}${end || ""}`.trim().replace(/^- /, "");
}

/** Greedy word wrap using the injected measure(text, size, bold). */
export function wrap(text, width, size, bold, measure) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next, size, bold) <= width || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Lay the resume out on one page. Returns draw ops and whether it overflows.
 * ops: {t:"text", x, y, size, bold, text, align?} | {t:"rule", x1, x2, y}
 */
export function layout(doc, { size, measure, page = PAGES.A4, margin = 42 }) {
  const ops = [];
  const W = page.w - margin * 2;
  const lh = (s) => s * 1.28;
  let y = margin;
  const text = (x, s, bold, str, align) => {
    ops.push({ t: "text", x, y: y + s * 0.8, size: s, bold, text: str, align });
  };

  const nameSize = size * 2.1;
  text(margin, nameSize, true, doc.name);
  y += lh(nameSize);
  if (doc.headline) {
    text(margin, size + 0.5, false, doc.headline);
    y += lh(size + 0.5);
  }
  for (const l of wrap(doc.contact, W, size - 0.5, false, measure)) {
    text(margin, size - 0.5, false, l);
    y += lh(size - 0.5);
  }

  for (const sec of doc.sections) {
    y += size * 0.7;
    const ts = size + 1;
    text(margin, ts, true, sec.title.toUpperCase());
    y += lh(ts) - 2;
    ops.push({ t: "rule", x1: margin, x2: margin + W, y });
    y += size * 0.45;
    for (const line of sec.lines || []) {
      for (const l of wrap(line, W, size, false, measure)) {
        text(margin, size, false, l);
        y += lh(size);
      }
    }
    for (const it of sec.items || []) {
      const dw = it.dates ? measure(it.dates, size, false) + 10 : 0;
      const head = wrap(it.heading, W - dw, size, true, measure);
      head.forEach((l, i) => {
        text(margin, size, true, l);
        if (i === 0 && it.dates) text(margin + W, size, false, it.dates, "right");
        y += lh(size);
      });
      if (it.sub) {
        text(margin, size - 0.5, false, it.sub);
        y += lh(size - 0.5);
      }
      for (const b of it.bullets) {
        const lines = wrap(b.text, W - 12, size, false, measure);
        lines.forEach((l, i) => {
          if (i === 0) text(margin + 2, size, false, "•");
          text(margin + 12, size, false, l);
          y += lh(size);
        });
      }
      y += size * 0.3;
    }
  }
  return { ops, height: y + margin, overflow: y + margin > page.h, size, page };
}

/**
 * Fit on exactly one page: shrink the font a step at a time, then drop the
 * lowest-priority bullets (older roles, later bullets), keeping at least one per role.
 */
export function fitOnePage(doc, { measure, page = PAGES.A4 }) {
  for (const size of FONT_STEPS) {
    const l = layout(doc, { size, measure, page });
    if (!l.overflow) return { ...l, dropped: [], doc };
  }
  const work = structuredClone(doc);
  const dropped = [];
  const candidates = () =>
    work.sections
      .flatMap((s) => (s.items || []).map((it) => ({ it })))
      .filter(({ it }) => it.bullets.length > 1)
      .flatMap(({ it }) => it.bullets.slice(1).map((b) => ({ it, b })))
      .sort((a, b) => b.b.priority - a.b.priority);
  for (let guard = 0; guard < 200; guard++) {
    const l = layout(work, { size: MIN_FONT_FOR_TRIM, measure, page });
    if (!l.overflow) return { ...l, dropped, doc: work };
    const [next] = candidates();
    if (!next) return { ...l, dropped, doc: work };
    next.it.bullets = next.it.bullets.filter((b) => b !== next.b);
    dropped.push(next.b.text);
  }
  return { ...layout(work, { size: MIN_FONT_FOR_TRIM, measure, page }), dropped, doc: work };
}

/** Plain text version (for copy-paste into application forms). */
export function resumeText(doc) {
  const out = [doc.name, doc.headline, doc.contact, ""];
  for (const s of doc.sections) {
    out.push(s.title.toUpperCase());
    for (const l of s.lines || []) out.push(l);
    for (const it of s.items || []) {
      out.push(`${it.heading}${it.dates ? `  (${it.dates})` : ""}`);
      if (it.sub) out.push(it.sub);
      for (const b of it.bullets) out.push(`- ${b.text}`);
    }
    out.push("");
  }
  return out.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}
