// Job Hunt Hub: pipeline logic. Pure functions, unit tested in tests/job-hunt-hub.test.js.

export const STAGES = [
  "Saved",
  "Applied",
  "Screening",
  "Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
];
export const OPEN_STAGES = ["Saved", "Applied", "Screening", "Interview", "Offer"];
const DAY = 86400000;

export const DEFAULT_RULES = Object.freeze({ afterAppliedDays: 7, afterInterviewDays: 3 });

/** A new job card with every field present. */
export function newJob(fields = {}, now = Date.now()) {
  const stage = STAGES.includes(fields.stage) ? fields.stage : "Saved";
  return {
    kind: "job",
    id: fields.id,
    company: "",
    role: "",
    link: "",
    location: "",
    salary: "",
    source: "Pasted",
    contact: "",
    notes: "",
    postText: "",
    analysis: null,
    resumeVersionId: null,
    nextAction: "",
    stageDates: { [stage]: now },
    lastContactAt: null,
    interviewAt: null,
    followUpsDone: [],
    createdAt: now,
    updatedAt: now,
    ...fields,
    stage,
  };
}

/** Move a job to a stage, stamping the date the first time it enters it. */
export function moveJob(job, stage, now = Date.now()) {
  if (!STAGES.includes(stage) || job.stage === stage) return job;
  return {
    ...job,
    stage,
    stageDates: { ...job.stageDates, [stage]: job.stageDates?.[stage] || now },
    updatedAt: now,
  };
}

/**
 * Follow-ups due now. A follow-up is due when:
 * - stage is Applied, it entered Applied `afterAppliedDays` ago, and there has been no contact since; or
 * - stage is Interview and the interview (or entering Interview) was `afterInterviewDays` ago with no contact since.
 * Each rule fires once per job and stage (tracked in followUpsDone).
 */
export function followUpsDue(jobs, rules = DEFAULT_RULES, now = Date.now()) {
  const out = [];
  for (const j of jobs) {
    const done = new Set(j.followUpsDone || []);
    if (j.stage === "Applied" && !done.has("Applied")) {
      const since = j.stageDates?.Applied;
      if (since && now - since >= rules.afterAppliedDays * DAY && !(j.lastContactAt > since)) {
        out.push({ job: j, kind: "Applied", dueSince: since + rules.afterAppliedDays * DAY });
      }
    }
    if (j.stage === "Interview" && !done.has("Interview")) {
      const since = j.interviewAt || j.stageDates?.Interview;
      if (since && now - since >= rules.afterInterviewDays * DAY && !(j.lastContactAt > since)) {
        out.push({ job: j, kind: "Interview", dueSince: since + rules.afterInterviewDays * DAY });
      }
    }
  }
  return out.sort((a, b) => a.dueSince - b.dueSince);
}

/** Pipeline numbers for the Stats view. */
export function pipelineStats(jobs, now = Date.now()) {
  const applied = jobs.filter((j) => j.stageDates?.Applied);
  const responded = applied.filter(
    (j) =>
      ["Screening", "Interview", "Offer", "Rejected"].some((s) => j.stageDates?.[s]) ||
      j.lastContactAt,
  );
  const interviewed = applied.filter((j) => j.stageDates?.Interview);
  const offers = applied.filter((j) => j.stageDates?.Offer);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  // Applications per week, last 8 weeks (index 7 = this week).
  const perWeek = Array(8).fill(0);
  for (const j of applied) {
    const w = Math.floor((now - j.stageDates.Applied) / (7 * DAY));
    if (w >= 0 && w < 8) perWeek[7 - w] += 1;
  }

  // Average days spent in each stage before moving on.
  const timeInStage = {};
  for (const s of STAGES.slice(0, 4)) {
    const spans = jobs
      .map((j) => {
        const start = j.stageDates?.[s];
        if (!start) return null;
        const later = STAGES.slice(STAGES.indexOf(s) + 1)
          .map((x) => j.stageDates?.[x])
          .filter(Boolean);
        return later.length ? (Math.min(...later) - start) / DAY : null;
      })
      .filter((x) => x !== null);
    timeInStage[s] = spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : null;
  }

  const bySource = {};
  for (const j of applied) {
    const src = j.source || "Other";
    const row = (bySource[src] ||= { applied: 0, responded: 0 });
    row.applied += 1;
    if (responded.includes(j)) row.responded += 1;
  }

  return {
    total: jobs.length,
    open: jobs.filter((j) => OPEN_STAGES.includes(j.stage)).length,
    applied: applied.length,
    responseRate: pct(responded.length, applied.length),
    interviewRate: pct(interviewed.length, applied.length),
    offers: offers.length,
    perWeek,
    timeInStage,
    bySource,
  };
}

/* ---------------- Email classification ---------------- */

const RULES = [
  {
    stage: "Offer",
    re: /\b(offer letter|pleased to offer|job offer|offer of employment|extend (an|the) offer)\b/i,
  },
  {
    stage: "Rejected",
    re: /\b(unfortunately|not (be )?moving forward|decided to (move|proceed) with other|not selected|regret to inform|position has been filled|will not be progressing|no longer under consideration)\b/i,
  },
  {
    stage: "Interview",
    re: /\b(interview|schedule (a|your) (call|chat|conversation)|availability for|calendly|meet the team|onsite|panel)\b/i,
  },
  {
    stage: "Screening",
    re: /\b(assessment|coding (test|challenge)|take[- ]home|hackerrank|codility|screening|next steps|recruiter)\b/i,
  },
  {
    stage: "Applied",
    re: /\b(thank(s| you) for (applying|your application|your interest)|application (received|submitted|confirmation)|we('ve| have) received your application)\b/i,
  },
];

/** Classify a job email by subject and snippet. Returns a stage or null. */
export function classifyEmail({ subject = "", snippet = "" }) {
  const text = `${subject} ${snippet}`;
  for (const r of RULES) if (r.re.test(text)) return r.stage;
  return null;
}

const STOP = new Set([
  "inc",
  "ltd",
  "llc",
  "limited",
  "pvt",
  "private",
  "the",
  "co",
  "corp",
  "technologies",
  "labs",
  "group",
  "india",
  "careers",
  "jobs",
  "team",
  "talent",
  "hiring",
  "noreply",
  "no",
  "reply",
  "mail",
  "gmail",
  "com",
  "io",
  "ai",
]);

export function companyTokens(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Find the job an email is about, by company name in the sender or subject. */
export function matchJob(jobs, { sender = "", subject = "", snippet = "" }) {
  const hay = new Set(
    companyTokens(`${sender} ${sender.split("@")[1] || ""} ${subject} ${snippet}`),
  );
  let best = null;
  let bestScore = 0;
  for (const j of jobs) {
    const toks = companyTokens(j.company);
    if (!toks.length) continue;
    const hits = toks.filter((t) => hay.has(t)).length;
    const score = hits / toks.length;
    if (score > bestScore) {
      best = j;
      bestScore = score;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

/** Only suggest moves that go forward, or to Rejected/Offer. */
export function isUsefulMove(job, stage) {
  if (!job || !stage || job.stage === stage) return false;
  if (["Rejected", "Offer"].includes(stage)) return true;
  return STAGES.indexOf(stage) > STAGES.indexOf(job.stage);
}

/** Normalise Gmail search_threads payload to a list of {threadId, subject, snippet, sender, date, viewUrl}. */
export function normaliseThreads(payload) {
  const threads = payload?.threads || (Array.isArray(payload) ? payload : []);
  return threads
    .map((t) => {
      const msgs = t.messages || [];
      const m = msgs[msgs.length - 1] || {};
      return {
        threadId: t.id,
        subject: m.subject || t.subject || "",
        snippet: m.snippet || t.snippet || "",
        sender: m.sender || m.from || "",
        date: Date.parse(m.date || t.date || "") || null,
        viewUrl: t.viewUrl || m.viewUrl || "",
      };
    })
    .filter((t) => t.threadId);
}

export const GMAIL_QUERY =
  'newer_than:45d -in:sent (subject:(application OR applying OR interview OR assessment OR offer OR candidacy OR "next steps" OR unfortunately) OR "thank you for applying" OR "received your application")';

/* ---------------- Tracker import (harness folder) ---------------- */

/** Parse the first markdown table in a file into job fields. */
export function parseTrackerTable(md) {
  const lines = String(md)
    .split(/\r?\n/)
    .filter((l) => /^\s*\|/.test(l));
  if (lines.length < 3) return [];
  const cells = (l) =>
    l
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
  const head = cells(lines[0]).map((h) => h.toLowerCase());
  const col = (...names) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const ci = {
    company: col("company"),
    role: col("role", "title", "position"),
    stage: col("stage", "status"),
    link: col("link", "url", "posting"),
  };
  if (ci.company < 0) return [];
  return lines
    .slice(2)
    .map(cells)
    .map((c) => {
      const stageRaw = ci.stage >= 0 ? c[ci.stage] : "";
      const stage =
        STAGES.find((s) => s.toLowerCase() === String(stageRaw).toLowerCase()) || "Saved";
      const link = ci.link >= 0 ? (c[ci.link].match(/https?:\/\/[^\s)>\]]+/) || [""])[0] : "";
      return {
        company: c[ci.company] || "",
        role: ci.role >= 0 ? c[ci.role] : "",
        stage,
        link,
        source: "Harness",
      };
    })
    .filter((j) => j.company && !/^-+$/.test(j.company));
}

/** Same company and role, case-insensitive. */
export function sameJob(a, b) {
  const k = (j) =>
    `${String(j.company).trim().toLowerCase()}|${String(j.role).trim().toLowerCase()}`;
  return k(a) === k(b);
}
