// Job Hunt Hub: entry point. Setup wizard on first run, then the board.

import { $, $$, toast } from "./shared/dom.js";
import { setupDesktop } from "./shared/claude.js";
import { state, initState, onChange } from "./state.js";
import { renderBoard, bindBoard, setJobOpener } from "./view-board.js";
import { openJob, renderJob, bindJob } from "./view-job.js";
import { renderInbox, bindInbox, startInterviews } from "./view-inbox.js";
import { renderResume, bindResume } from "./view-resume.js";
import { renderStats } from "./view-stats.js";
import { renderSettings, bindSettings } from "./view-settings.js";
import { startSetup, bindSetup } from "./setup.js";
import { startTour, openHelp } from "./guide.js";
import { startDesktop, refreshDesktop, requestDesktop, manageDesktop } from "./desktop.js";

const VIEWS = ["board", "inbox", "resume", "stats", "settings"];
const RENDER = {
  board: renderBoard,
  inbox: renderInbox,
  resume: renderResume,
  stats: renderStats,
  settings: renderSettings,
};

function go(view) {
  if (!VIEWS.includes(view)) view = "board";
  state.view = view;
  $$(".nav button").forEach((b) =>
    b.dataset.view === view
      ? b.setAttribute("aria-current", "page")
      : b.removeAttribute("aria-current"),
  );
  VIEWS.forEach((v) => ($(`#view-${v}`).hidden = v !== view));
  if (location.hash.slice(1) !== view) history.replaceState(null, "", `#${view}`);
  render();
  window.scrollTo(0, 0);
}

function render() {
  try {
    RENDER[state.view]();
    // The inbox badge lives in the nav, so keep it fresh on every view.
    const n = state.inbox.suggestions.filter((x) => !x.done).length;
    const badge = $("#inbox-count");
    badge.hidden = !n;
    badge.textContent = String(n);
    if (state.openJobId && !$("#job").hidden && document.activeElement?.closest?.("#job") === null)
      renderJob();
  } catch (e) {
    console.error(e);
  }
}

async function boot() {
  $$(".nav button").forEach((b) => (b.onclick = () => go(b.dataset.view)));
  $$(".guide-btn").forEach((b) => (b.onclick = () => startTour(go)));
  setJobOpener(openJob);
  bindBoard();
  bindJob();
  bindInbox(openJob);
  bindResume();
  bindSetup();
  bindSettings({
    startTour: () => startTour(go),
    openHelp,
    startSetup: () => startSetup(afterSetup),
    requestDesktop,
    manageDesktop,
  });

  const slow = setTimeout(() => toast("Still loading your data…"), 10000);
  await initState();
  clearTimeout(slow);
  $("#storage-note").textContent =
    state.store.kind === "db"
      ? "Saved privately to your Claude account."
      : "Preview mode: saved in this browser only.";

  onChange(() => {
    render();
    refreshDesktop();
  });
  window.addEventListener("hashchange", () => go(location.hash.slice(1)));

  state.desktop = await setupDesktop({
    letters: "JH",
    installSlot: $("#install"),
    windowSize: [1240, 820],
  });
  await startDesktop(openJob);
  startInterviews();
  go(location.hash.slice(1) || "board");

  if (!state.settings.setupDone) startSetup(afterSetup);
  else if (!state.settings.tourDone) setTimeout(() => startTour(go), 400);
}

function afterSetup(skipTour) {
  go("board");
  if (!state.settings.tourDone && !skipTour) setTimeout(() => startTour(go), 300);
}

boot();
