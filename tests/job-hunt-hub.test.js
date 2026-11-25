import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newJob,
  moveJob,
  followUpsDue,
  pipelineStats,
  classifyEmail,
  matchJob,
  isUsefulMove,
  normaliseThreads,
  parseTrackerTable,
  sameJob,
} from "../src/logic/pipeline.js";
import {
  numbersIn,
  numbersSubset,
  quoteIn,
  validateTailoring,
  validateAnalysis,
  validateProfile,
  wordCount,
} from "../src/logic/facts.js";
import {
  assembleResume,
  fitOnePage,
  layout,
  wrap,
  resumeText,
  PAGES,
} from "../src/logic/resume.js";

const DAY = 86400000;
const T0 = Date.UTC(2026, 10, 1);

const PROFILE = {
  name: "Asha Rao",
  summary: "Data engineer with 6 years building pipelines.",
  contact: { email: "asha@example.com", location: "Chennai" },
  experience: [
    {
      id: "r1",
      company: "Acme",
      title: "Senior Data Engineer",
      start: "Jan 2022",
      end: "Present",
      bullets: [
        { id: "r1b1", text: "Cut pipeline run time from 4h to 1.5h by rewriting the loader." },
        { id: "r1b2", text: "Led 8 engineers through a lakehouse migration." },
        { id: "r1b3", text: "Built data quality checks across 300 pipelines." },
      ],
    },
    {
      id: "r2",
      company: "Beta",
      title: "Data Engineer",
      start: "Jun 2019",
      end: "Dec 2021",
      bullets: [
        { id: "r2b1", text: "Moved 46 pipelines to a governed schema." },
        { id: "r2b2", text: "Wrote Spark jobs for daily reporting." },
      ],
    },
  ],
  skills: [{ name: "Tools", items: ["Spark", "Airflow", "Snowflake"] }],
  education: [
    { school: "Anna University", degree: "B.E. Computer Science", start: "2015", end: "2019" },
  ],
};

test("moveJob stamps the first entry date only", () => {
  const j = newJob({ id: "a", company: "Acme" }, T0);
  const m = moveJob(j, "Applied", T0 + DAY);
  assert.equal(m.stageDates.Applied, T0 + DAY);
  const back = moveJob(moveJob(m, "Saved", T0 + 2 * DAY), "Applied", T0 + 3 * DAY);
  assert.equal(back.stageDates.Applied, T0 + DAY);
  assert.equal(moveJob(j, "Nope", T0), j);
});

test("follow-ups fire after the rule's days, once, unless there was contact", () => {
  const applied = moveJob(newJob({ id: "a" }, T0), "Applied", T0);
  assert.equal(followUpsDue([applied], undefined, T0 + 6 * DAY).length, 0);
  assert.equal(followUpsDue([applied], undefined, T0 + 7 * DAY).length, 1);
  assert.equal(
    followUpsDue([{ ...applied, lastContactAt: T0 + DAY }], undefined, T0 + 8 * DAY).length,
    0,
  );
  assert.equal(
    followUpsDue([{ ...applied, followUpsDone: ["Applied"] }], undefined, T0 + 8 * DAY).length,
    0,
  );
  const iv = { ...moveJob(applied, "Interview", T0 + 9 * DAY), interviewAt: T0 + 10 * DAY };
  assert.equal(
    followUpsDue([iv], { afterAppliedDays: 7, afterInterviewDays: 3 }, T0 + 13 * DAY)[0].kind,
    "Interview",
  );
});

test("pipeline stats", () => {
  const a = moveJob(
    moveJob(newJob({ id: "a", source: "LinkedIn" }, T0), "Applied", T0),
    "Interview",
    T0 + 5 * DAY,
  );
  const b = moveJob(newJob({ id: "b", source: "LinkedIn" }, T0), "Applied", T0 + DAY);
  const c = newJob({ id: "c" }, T0);
  const s = pipelineStats([a, b, c], T0 + 10 * DAY);
  assert.equal(s.applied, 2);
  assert.equal(s.responseRate, 50);
  assert.equal(s.interviewRate, 50);
  assert.equal(
    s.perWeek.reduce((x, y) => x + y, 0),
    2,
  );
  assert.equal(s.bySource.LinkedIn.applied, 2);
  assert.equal(Math.round(s.timeInStage.Applied), 5);
});

test("email classification", () => {
  assert.equal(classifyEmail({ subject: "Thank you for applying to Acme" }), "Applied");
  assert.equal(classifyEmail({ subject: "Interview invitation: Data Engineer" }), "Interview");
  assert.equal(
    classifyEmail({
      subject: "Your application",
      snippet: "Unfortunately we will not be moving forward",
    }),
    "Rejected",
  );
  assert.equal(classifyEmail({ subject: "Online assessment for Beta" }), "Screening");
  assert.equal(classifyEmail({ subject: "We are pleased to offer you the role" }), "Offer");
  assert.equal(classifyEmail({ subject: "Weekly newsletter" }), null);
});

test("matchJob uses company tokens and ignores filler words", () => {
  const jobs = [
    newJob({ id: "a", company: "Acme Technologies Pvt Ltd" }),
    newJob({ id: "b", company: "Beta Labs" }),
  ];
  assert.equal(matchJob(jobs, { sender: "careers@acme.com", subject: "Your application" }).id, "a");
  assert.equal(
    matchJob(jobs, { sender: "noreply@greenhouse.io", subject: "Beta: next steps" }).id,
    "b",
  );
  assert.equal(matchJob(jobs, { sender: "jobs@gamma.com", subject: "hello" }), null);
});

test("only forward moves are suggested", () => {
  const j = { stage: "Interview" };
  assert.equal(isUsefulMove(j, "Applied"), false);
  assert.equal(isUsefulMove(j, "Offer"), true);
  assert.equal(isUsefulMove(j, "Rejected"), true);
  assert.equal(isUsefulMove({ stage: "Saved" }, "Applied"), true);
});

test("normaliseThreads takes the latest message", () => {
  const t = normaliseThreads({
    threads: [
      {
        id: "t1",
        messages: [{ subject: "a" }, { subject: "b", sender: "x@y.com", date: "2026-11-01" }],
      },
    ],
  });
  assert.equal(t[0].subject, "b");
  assert.equal(t[0].sender, "x@y.com");
});

test("tracker table import", () => {
  const md = `# Tracker\n\n| Company | Role | Stage | Link |\n|---|---|---|---|\n| Acme | Data Engineer | applied | [post](https://acme.com/jobs/1) |\n| Beta | ML Engineer | ??? | |\n`;
  const rows = parseTrackerTable(md);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].stage, "Applied");
  assert.equal(rows[0].link, "https://acme.com/jobs/1");
  assert.equal(rows[1].stage, "Saved");
  assert.ok(sameJob({ company: "acme ", role: "Data engineer" }, rows[0]));
});

test("number guard", () => {
  assert.deepEqual(numbersIn("Saved 1,200 hours (40%) in 2024"), ["1200", "40", "2024"]);
  assert.ok(numbersSubset("Cut run time from 4h to 1.5h", "from 4h to 1.5h"));
  assert.ok(!numbersSubset("Cut run time by 70%", "from 4h to 1.5h"));
});

test("quotes must really appear in the posting", () => {
  assert.ok(quoteIn("5+ years of  Spark", "We need 5+ years of Spark experience"));
  assert.ok(!quoteIn("10 years of Spark", "We need 5+ years of Spark experience"));
});

test("tailoring refuses invented numbers, unknown bullets and skills", () => {
  const { tailored, dropped } = validateTailoring(PROFILE, {
    summary: "Data engineer with 6 years.",
    experience: [
      {
        id: "r1",
        bulletIds: ["r1b2", "r1b1", "zz"],
        rewrites: {
          r1b1: "Cut run time by 70% with a new loader.",
          r1b2: "Led 8 engineers through a lakehouse migration on AWS.",
        },
      },
    ],
    skills: ["Snowflake", "Kubernetes"],
  });
  assert.deepEqual(tailored.experience[0].bulletIds, ["r1b2", "r1b1"]);
  assert.equal(tailored.experience[0].rewrites.r1b1, undefined);
  assert.ok(tailored.experience[0].rewrites.r1b2);
  assert.equal(tailored.experience.length, 2); // r2 kept so dates stay continuous
  assert.deepEqual(tailored.skills, ["Snowflake"]);
  assert.ok(dropped.some((d) => d.includes("Kubernetes")));
  assert.ok(dropped.some((d) => d.includes("zz")));
});

test("analysis keeps only real quotes and zeroes the score without evidence", () => {
  const post = "You have 5+ years with Spark and Airflow.";
  const a = validateAnalysis(
    {
      score: 88,
      evidence: [
        { requirement: "Spark", quote: "5+ years with Spark", match: "strong" },
        { quote: "PhD required" },
      ],
    },
    post,
  );
  assert.equal(a.evidence.length, 1);
  assert.equal(a.score, 88);
  assert.equal(validateAnalysis({ score: 90, evidence: [] }, post).score, 0);
});

test("profile structuring flags numbers not in the source", () => {
  const src = "Acme. Cut run time from 4h to 1.5h.";
  const { profile, flagged } = validateProfile(
    {
      name: "A",
      experience: [
        { company: "Acme", bullets: ["Cut run time from 4h to 1.5h.", "Saved 90% cost"] },
      ],
    },
    src,
  );
  assert.equal(profile.experience[0].bullets.length, 2);
  assert.equal(flagged.length, 1);
  assert.ok(profile.experience[0].bullets[1].unverified);
  assert.equal(profile.experience[0].id, "r1");
});

// Rough Helvetica-like measure: 0.5em per char, bold 0.55em.
const measure = (t, size, bold) => String(t).length * size * (bold ? 0.55 : 0.5);

test("wrap respects width", () => {
  const lines = wrap("one two three four five six", 60, 10, false, measure);
  assert.ok(lines.every((l) => measure(l, 10) <= 60 || !l.includes(" ")));
  assert.equal(lines.join(" "), "one two three four five six");
});

test("resume fits one page and trims older bullets first", () => {
  const big = structuredClone(PROFILE);
  for (let i = 0; i < 40; i++)
    big.experience[1].bullets.push({
      id: `x${i}`,
      text: `Extra older achievement number ${i} with enough words to wrap across several lines, because a long bullet like this one keeps going well past the width of the page.`,
    });
  const doc = assembleResume(big, null);
  assert.ok(layout(doc, { size: 10.5, measure, page: PAGES.A4 }).overflow);
  const fit = fitOnePage(doc, { measure, page: PAGES.A4 });
  assert.equal(fit.overflow, false);
  assert.ok(fit.dropped.length > 0);
  assert.ok(fit.dropped.every((t) => t.startsWith("Extra older")));
  const exp = fit.doc.sections.find((s) => s.title === "Experience");
  assert.ok(exp.items.every((it) => it.bullets.length >= 1));
});

test("tailored resume uses chosen bullets and rewrites", () => {
  const doc = assembleResume(PROFILE, {
    summary: "S",
    experience: [
      {
        id: "r1",
        bulletIds: ["r1b3"],
        rewrites: { r1b3: "Built quality checks for 300 pipelines." },
      },
    ],
    skills: ["Snowflake"],
  });
  const exp = doc.sections.find((s) => s.title === "Experience");
  assert.equal(exp.items.length, 1);
  assert.equal(exp.items[0].bullets[0].text, "Built quality checks for 300 pipelines.");
  assert.ok(doc.sections.find((s) => s.title === "Skills").lines[0].startsWith("Tools: Snowflake"));
  assert.ok(resumeText(doc).includes("EXPERIENCE"));
});

test("word count", () => {
  assert.equal(wordCount(" one  two\nthree "), 3);
});
