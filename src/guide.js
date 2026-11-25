// Guided tour and "How to use" guide for Job Hunt Hub.

import { dialog } from "./shared/dom.js";
import { runTour } from "./shared/tour.js";
import { state, saveSettings } from "./state.js";

export function tourSteps(go) {
  return [
    {
      title: "Your board",
      body: "Every role you're considering, one column per stage. Drag a card to move it, or open it and pick a stage.",
      target: "#board",
      before: () => go("board"),
    },
    {
      title: "Add a role",
      body: "Paste the job post. Claude fills in the company, role and location, and scores the match against your profile.",
      target: "#add-role",
      before: () => go("board"),
    },
    {
      title: "Follow-ups surface here",
      body: "When a role has gone quiet for longer than your rule allows, it shows here in blue with a drafted note ready.",
      target: "#due-strip",
      before: () => go("board"),
    },
    {
      title: "Inbox",
      body: "Sync Gmail to find confirmations, interview invites and rejections. Each one is a suggestion; nothing moves until you accept.",
      target: "#sync-gmail",
      before: () => go("inbox"),
    },
    {
      title: "Interviews",
      body: 'Calendar events with "interview" in the next two weeks, linked to their role.',
      target: "#interviews",
      before: () => go("inbox"),
    },
    {
      title: "Your master profile",
      body: "The single source of truth for every resume. Edit it here. Tailored resumes can reorder and rephrase it, never add to it.",
      target: "#profile-panel",
      before: () => go("resume"),
    },
    {
      title: "One page, every time",
      body: "The preview is exactly what the PDF will look like. If a resume runs long, the font steps down, then the oldest bullets drop.",
      target: "#preview-panel",
      before: () => go("resume"),
    },
    {
      title: "Inside a role",
      body: "Open any card for five tabs: Overview, Analysis with quoted evidence, a tailored Resume, a Cover note and a Follow-up draft.",
      target: "#board",
      before: () => go("board"),
    },
    {
      title: "Stats",
      body: "Response rate, interview rate, time in each stage and which sources actually reply.",
      target: "#stat-kpis",
      before: () => go("stats"),
    },
    {
      title: "Settings",
      body: "Targets, follow-up rules, connectors, page size and desktop alerts. Run setup or this tour again from here.",
      target: "#settings-body",
      before: () => go("settings"),
    },
    {
      title: "You're ready",
      body: "Add a role, open it, and press Tailor my resume. Press Guide on any screen to see this again.",
      before: () => go("board"),
    },
  ];
}

export async function startTour(go) {
  await runTour(tourSteps(go));
  if (!state.settings.tourDone) await saveSettings({ tourDone: true });
}

export function openHelp() {
  const body = document.createElement("div");
  body.className = "help";
  body.innerHTML = `
    <h3>Getting started</h3>
    <ol>
      <li>Run setup: paste your resume, set your targets, connect Gmail and Calendar if you like.</li>
      <li>Add a role by pasting its job post. Claude analyses it.</li>
      <li>Open the role, Resume tab, press Tailor my resume. Check what changed, then download the PDF.</li>
      <li>Apply yourself on the company's site. Then move the card to Applied.</li>
    </ol>
    <h3>Every day</h3>
    <ul>
      <li>Inbox: press Sync Gmail and accept the suggestions that are right.</li>
      <li>Board: anything in blue needs a follow-up. Open it, Follow-up tab, Draft, copy, send from your email, press I sent it.</li>
    </ul>
    <h3>How the resume stays honest</h3>
    <p>Claude may only choose, order and lightly rephrase your own bullets. Every suggestion is checked: a number, skill or claim that isn't in your master profile is refused and your original line is kept. You see each refusal.</p>
    <h3>One page and ATS-safe</h3>
    <p>Single column, standard headings, real text (not an image), no tables or text boxes. The PDF is checked to be exactly one page.</p>
    <h3>Job sites</h3>
    <p>The app can't open web pages, so paste the post text. On the desktop app you can import a markdown tracker file in Settings.</p>
    <h3>Privacy</h3>
    <p>Your data is private to your Claude account. Claude reads it only when you press an AI button. Gmail and Calendar are read-only.</p>`;
  return dialog({ title: "How to use Job Hunt Hub", body });
}
