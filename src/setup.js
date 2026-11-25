// First-run setup wizard: six short steps from nothing to a working board.
// Progress is saved after every step, so it resumes where the person left off.

import { $, esc, toast } from "./shared/dom.js";
import { state, saveSettings, saveProfile, addJob } from "./state.js";
import { structureProfile, aiMessage } from "./ai.js";
import { testConnections } from "./view-settings.js";
import { runAnalysis } from "./view-board.js";

const STEPS = [
  "Welcome",
  "Your resume",
  "Your targets",
  "Inbox and calendar",
  "Follow-ups",
  "First role",
];
let step = 0;
let onDone = () => {};

export function startSetup(done) {
  if (done) onDone = done;
  step = Math.min(state.settings.setupStep || 0, STEPS.length - 1);
  $("#setup").hidden = false;
  $("#shell").inert = true;
  paint();
}

async function finish(skipTour = false) {
  await saveSettings({ setupDone: true, setupStep: 0 });
  $("#setup").hidden = true;
  $("#shell").inert = false;
  onDone(skipTour);
}

async function go(n) {
  step = Math.max(0, Math.min(STEPS.length - 1, n));
  await saveSettings({ setupStep: step });
  paint();
  $("#setup").scrollTop = 0;
}

function shell(title, lead, inner, { next = "Continue", back = true, skip = false } = {}) {
  return `<div class="setup-inner">
    <div class="steps" aria-hidden="true">${STEPS.map((_, i) => `<i class="${i <= step ? "on" : ""}"></i>`).join("")}</div>
    <p class="small muted">Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}</p>
    <h1 id="setup-title">${title}</h1><p class="lead">${lead}</p>
    <div class="stack-gap">${inner}</div>
    <div class="setup-nav">
      ${back && step > 0 ? `<button class="btn" data-s="back">Back</button>` : ""}
      <span class="spacer"></span>
      ${skip ? `<button class="btn btn-ghost" data-s="skip">Skip for now</button>` : ""}
      <button class="btn btn-primary" data-s="next">${next}</button>
    </div></div>`;
}

function paint() {
  const el = $("#setup");
  const s = state.settings;
  const views = [
    () =>
      shell(
        "Your whole job search, in one place.",
        "Track every role, read job emails, catch every follow-up, and build a tailored one-page resume for each application. Setup takes about three minutes.",
        `<div class="cols"><div class="panel"><h3>What it does</h3><ul class="list-plain">
            <li>A board for every role, from Saved to Offer</li>
            <li>Reads Gmail and Calendar to spot replies and interviews</li>
            <li>Reminds you when a follow-up is due</li>
            <li>Scores each posting against your profile, with quotes as evidence</li>
            <li>Builds a tailored, ATS-safe, one-page resume and a cover note</li></ul></div>
          <div class="panel"><h3>What it never does</h3><ul class="never">
            <li>Apply, submit or upload anything for you</li>
            <li>Send, reply to or delete an email</li>
            <li>Contact a recruiter or anyone else</li>
            <li>Invent a skill, number or job on your resume</li></ul></div></div>`,
        { next: "Start setup", back: false },
      ),
    () =>
      shell(
        "Add your resume once.",
        "It becomes your master profile: the only source of facts the app will ever use. Paste the text of your current resume.",
        state.profile
          ? `<div class="note">Profile saved for <b>${esc(state.profile.name || "you")}</b>: ${state.profile.experience?.length || 0} roles,
              ${(state.profile.experience || []).reduce((n, r) => n + r.bullets.length, 0)} bullets. You can edit it any time in the Resume tab.</div>
             <button class="btn" data-s="redo-profile">Paste a different resume</button>`
          : `<input type="file" id="su-file" accept=".txt,.md,text/plain" aria-label="Resume text file">
             <textarea id="su-resume" style="min-height:260px" placeholder="Open your resume, select all, copy, paste here"></textarea>
             <p class="small muted">PDF? Open it, select all and copy the text. Claude structures it into fields and flags any number it could not find in what you pasted.</p>`,
        { next: state.profile ? "Continue" : "Structure with Claude", skip: !state.profile },
      ),
    () =>
      shell(
        "What are you looking for?",
        "Used to judge each posting. All optional, and you can change them later in Settings.",
        `<label class="field">Target titles<input id="su-titles" value="${esc(s.targets.titles)}" placeholder="Senior Data Engineer, AI Engineer"></label>
         <label class="field">Locations<input id="su-locations" value="${esc(s.targets.locations)}" placeholder="Chennai, Bengaluru, Remote"></label>
         <label class="field">Work mode<select id="su-mode">${["Any", "Remote", "Hybrid", "On-site"].map((m) => `<option ${m === s.targets.workMode ? "selected" : ""}>${m}</option>`).join("")}</select></label>
         <div class="fields">
           <label class="field">Salary floor<input id="su-salary" value="${esc(s.targets.salaryFloor)}"></label>
           <label class="field">Notice period<input id="su-notice" value="${esc(s.targets.notice)}"></label>
           <label class="field">Resume page size<select id="su-page"><option ${s.pageSize === "A4" ? "selected" : ""}>A4</option><option ${s.pageSize === "Letter" ? "selected" : ""}>Letter</option></select></label>
         </div>`,
      ),
    () =>
      shell(
        "Connect your inbox and calendar.",
        "Optional, read-only. The app spots application confirmations, interview invites and rejections, and suggests the stage change. You accept each one.",
        `<label class="check"><input type="checkbox" id="su-gmail" ${s.gmailEnabled ? "checked" : ""}> Read job emails from Gmail</label>
         <label class="check"><input type="checkbox" id="su-cal" ${s.calendarEnabled ? "checked" : ""}> Show interviews from Google Calendar</label>
         <div class="row"><button class="btn" data-s="test">Test connections</button></div>
         <p class="small" id="su-test-out"></p>
         <p class="small muted">Claude asks you to allow each connector the first time. Not connected yet? Add Gmail and Google Calendar under claude.ai Settings, Connectors.</p>`,
        { skip: true },
      ),
    () =>
      shell(
        "Never miss a follow-up.",
        "The board marks a role when it's time to nudge, and the app drafts the note. You send it from your own email.",
        `<div class="fields">
           <label class="field">Days after applying with no reply<input type="number" min="1" max="60" id="su-a" value="${s.rules.afterAppliedDays}"></label>
           <label class="field">Days after an interview<input type="number" min="1" max="30" id="su-i" value="${s.rules.afterInterviewDays}"></label>
         </div>`,
      ),
    () =>
      shell(
        "Add your first role.",
        "Paste a job post you're interested in. Claude reads it, fills the card and scores the match. Or skip and add roles later.",
        `<label class="field">Link (optional)<input id="su-link" type="url" placeholder="https://"></label>
         <label class="field">Job post text<textarea id="su-post" style="min-height:200px"></textarea></label>`,
        { next: "Add and finish", skip: true },
      ),
  ];
  el.innerHTML = views[step]();
  const file = $("#su-file");
  if (file)
    file.onchange = async (e) => {
      const f = e.target.files?.[0];
      if (f) $("#su-resume").value = await f.text();
    };
}

async function next() {
  const val = (id) => $(id)?.value.trim() ?? "";
  switch (step) {
    case 1: {
      if (state.profile) return go(2);
      const text = val("#su-resume");
      if (!text) return toast("Paste your resume text, or press Skip for now.", { tone: "warn" });
      const btn = document.querySelector('[data-s="next"]');
      btn.disabled = true;
      btn.textContent = "Structuring…";
      try {
        const { profile, flagged } = await structureProfile(text);
        await saveProfile({ ...profile, sourceText: text.slice(0, 30000) });
        if (flagged.length)
          toast(`Saved. ${flagged.length} bullet(s) have numbers to check in the Resume tab.`);
        return paint();
      } catch (e) {
        toast(aiMessage(e), { tone: "warn" });
        btn.disabled = false;
        btn.textContent = "Structure with Claude";
        return;
      }
    }
    case 2:
      await saveSettings({
        targets: {
          titles: val("#su-titles"),
          locations: val("#su-locations"),
          workMode: val("#su-mode"),
          salaryFloor: val("#su-salary"),
          notice: val("#su-notice"),
        },
        pageSize: val("#su-page") || "A4",
      });
      return go(3);
    case 3:
      await saveSettings({
        gmailEnabled: $("#su-gmail").checked,
        calendarEnabled: $("#su-cal").checked,
      });
      return go(4);
    case 4:
      await saveSettings({
        rules: {
          afterAppliedDays: Math.max(1, Number(val("#su-a")) || 7),
          afterInterviewDays: Math.max(1, Number(val("#su-i")) || 3),
        },
      });
      return go(5);
    case 5: {
      const post = val("#su-post");
      if (post) {
        const link = val("#su-link");
        const job = await addJob({
          postText: post,
          link: /^https:\/\//.test(link) ? link : "",
          source: "Pasted",
        });
        runAnalysis(job.id);
      }
      return finish();
    }
    default:
      return go(step + 1);
  }
}

export function bindSetup() {
  $("#setup").addEventListener("click", async (ev) => {
    const a = ev.target.closest("[data-s]")?.dataset.s;
    if (!a) return;
    if (a === "back") go(step - 1);
    if (a === "next") next();
    if (a === "skip") step === STEPS.length - 1 ? finish() : go(step + 1);
    if (a === "redo-profile") {
      state.profile = null;
      paint();
    }
    if (a === "test") {
      await saveSettings({
        gmailEnabled: $("#su-gmail").checked,
        calendarEnabled: $("#su-cal").checked,
      });
      $("#su-test-out").textContent = "Testing…";
      await testConnections($("#su-test-out"));
    }
  });
}
