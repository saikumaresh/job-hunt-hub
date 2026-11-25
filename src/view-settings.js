// Settings view: targets, follow-up rules, connectors, page size, desktop, harness import and data.

import { $, esc, toast, dialog } from "./shared/dom.js";
import { saveFile, callConnector, connectorMessage } from "./shared/claude.js";
import { toCsv } from "./shared/csv.js";
import { parseTrackerTable, sameJob } from "./logic/pipeline.js";
import { state, saveSettings, addJob, deleteAll } from "./state.js";
import { GMAIL, CALENDAR, startInterviews } from "./view-inbox.js";

export function renderSettings() {
  const s = state.settings;
  const t = s.targets;
  const d = state.desktop;
  $("#settings-body").innerHTML = `
    <div class="panel"><h3>What you're looking for</h3>
      <div style="display:grid;gap:12px">
        <label class="field">Target titles<input data-t="titles" value="${esc(t.titles)}" placeholder="Senior Data Engineer, AI Engineer"></label>
        <label class="field">Locations<input data-t="locations" value="${esc(t.locations)}" placeholder="Chennai, Bengaluru, Remote"></label>
        <label class="field">Work mode<select data-t="workMode">${["Any", "Remote", "Hybrid", "On-site"].map((m) => `<option ${m === t.workMode ? "selected" : ""}>${m}</option>`).join("")}</select></label>
        <label class="field">Salary floor (optional)<input data-t="salaryFloor" value="${esc(t.salaryFloor)}"></label>
        <label class="field">Notice period<input data-t="notice" value="${esc(t.notice)}" placeholder="60 days"></label>
      </div></div>
    <div class="panel"><h3>Follow-up rules</h3>
      <label class="field">Days after applying with no reply<input type="number" min="1" max="60" data-r="afterAppliedDays" value="${s.rules.afterAppliedDays}"></label>
      <label class="field" style="margin-top:12px">Days after an interview<input type="number" min="1" max="30" data-r="afterInterviewDays" value="${s.rules.afterInterviewDays}"></label>
      <p class="small muted" style="margin-top:8px">The app drafts follow-ups. You send them yourself.</p></div>
    <div class="panel" id="set-connectors"><h3>Gmail and Calendar</h3>
      <label class="check"><input type="checkbox" id="st-gmail" ${s.gmailEnabled ? "checked" : ""}> Read job emails from Gmail</label>
      <label class="check"><input type="checkbox" id="st-cal" ${s.calendarEnabled ? "checked" : ""}> Show interviews from Google Calendar</label>
      <p class="small muted">Read-only. The app searches and reads; it never sends, replies, labels, deletes or creates events.</p>
      <div class="row"><button class="btn btn-sm" id="st-test">Test connections</button></div>
      <p class="small" id="st-test-out"></p></div>
    <div class="panel"><h3>Resume</h3>
      <label class="field">Page size<select id="st-page"><option ${s.pageSize === "A4" ? "selected" : ""}>A4</option><option ${s.pageSize === "Letter" ? "selected" : ""}>Letter</option></select></label>
      <p class="small muted" style="margin-top:8px">A4 for India, UK and Europe. Letter for the US and Canada.</p></div>
    <div class="panel"><h3>Desktop</h3>
      ${
        d?.notification
          ? `<p class="small">Notifications for due follow-ups and tomorrow's interviews, and a menu bar count.</p>
             <div class="row"><button class="btn btn-sm btn-primary" id="st-perm">Turn on desktop alerts</button><button class="btn btn-sm" id="st-perm-manage">Manage permissions</button></div>`
          : `<p class="small">Alerts and the menu bar count work in the installed desktop app. Open this artifact in the Claude desktop app and choose Install as app.</p>`
      }</div>
    <div class="panel"><h3>Import from a tracker file</h3>
      <p class="small">If you keep a job tracker as a markdown table (for example a job-search folder's tracker.md), import its rows as cards.
        Needs full computer access, which the desktop app asks for once.</p>
      <label class="field">File path<input id="st-path" placeholder="~/Documents/job-search/memory/tracker.md"></label>
      <div class="row" style="margin-top:8px"><button class="btn btn-sm" id="st-import" ${d?.fs ? "" : "disabled"}>Import</button></div>
      ${d?.fs ? "" : `<p class="small muted">Available in the installed desktop app.</p>`}</div>
    <div class="panel"><h3>Your data</h3>
      <p class="small muted">${state.store.kind === "db" ? "Private to your Claude account. The app's owner cannot read it." : "Preview mode: saved in this browser only."}</p>
      <div class="row">
        <button class="btn btn-sm" id="st-export">Export roles as CSV</button>
        <button class="btn btn-sm" id="st-tour">Replay the tour</button>
        <button class="btn btn-sm" id="st-help">How to use</button>
        <button class="btn btn-sm" id="st-setup">Run setup again</button>
        <button class="btn btn-sm btn-ghost" id="st-delete">Delete all my data</button>
      </div></div>`;
}

export function bindSettings({ startTour, openHelp, startSetup, requestDesktop, manageDesktop }) {
  const root = $("#settings-body");
  root.addEventListener("change", async (ev) => {
    const el = ev.target;
    if (el.dataset.t)
      await saveSettings({
        targets: { ...state.settings.targets, [el.dataset.t]: el.value.trim() },
      });
    if (el.dataset.r) {
      const n = Math.max(1, Math.min(60, Number(el.value) || 7));
      await saveSettings({ rules: { ...state.settings.rules, [el.dataset.r]: n } });
    }
    if (el.id === "st-gmail") await saveSettings({ gmailEnabled: el.checked });
    if (el.id === "st-cal") {
      await saveSettings({ calendarEnabled: el.checked });
      startInterviews();
    }
    if (el.id === "st-page") await saveSettings({ pageSize: el.value });
  });
  root.addEventListener("click", async (ev) => {
    switch (ev.target.id) {
      case "st-test":
        return testConnections($("#st-test-out"));
      case "st-perm":
        return requestDesktop();
      case "st-perm-manage":
        return manageDesktop();
      case "st-import":
        return importTracker($("#st-path").value.trim());
      case "st-export":
        return exportCsv();
      case "st-tour":
        return startTour();
      case "st-help":
        return openHelp();
      case "st-setup":
        return startSetup();
      case "st-delete": {
        const ok = await dialog({
          title: "Delete all your Job Hunt Hub data?",
          body: "Every role, note, resume version and setting is removed from your account. This cannot be undone.",
          actions: [
            { label: "Cancel", value: false },
            { label: "Delete everything", value: true, primary: true },
          ],
        });
        if (ok) {
          await deleteAll();
          toast("All data deleted.");
          startSetup();
        }
      }
    }
  });
}

/** One read-only call per connector, so Claude asks for consent and we can show status. */
export async function testConnections(out) {
  const lines = [];
  if (state.settings.gmailEnabled) {
    try {
      await callConnector(GMAIL, "search_threads", {
        query: "newer_than:1d",
        pageSize: 1,
        view: "THREAD_VIEW_IDS_ONLY",
      });
      lines.push("Gmail: connected.");
    } catch (e) {
      lines.push(`Gmail: ${connectorMessage(e, GMAIL)}`);
    }
  }
  if (state.settings.calendarEnabled) {
    try {
      await callConnector(CALENDAR, "list_events", { pageSize: 1 });
      lines.push("Calendar: connected.");
    } catch (e) {
      lines.push(`Calendar: ${connectorMessage(e, CALENDAR)}`);
    }
  }
  if (out) out.textContent = lines.join(" ") || "Turn on Gmail or Calendar first.";
  return lines;
}

async function importTracker(path) {
  if (!state.desktop?.fs)
    return toast("Open the installed desktop app to import files.", { tone: "warn" });
  if (!path) return toast("Enter the file path.", { tone: "warn" });
  let text;
  try {
    text = await state.desktop.fs.readFile(path, "utf8");
  } catch (e) {
    const code = String(e.message || "").split(":")[0];
    return toast(
      code === "ENOENT"
        ? "No file at that path."
        : code === "EPERM"
          ? "Full access was not allowed, so the file can't be read."
          : `Could not read the file (${code}).`,
      { tone: "warn" },
    );
  }
  const rows = parseTrackerTable(text);
  const fresh = rows.filter((r) => !state.jobs.some((j) => sameJob(j, r)));
  for (const r of fresh) await addJob(r);
  toast(
    rows.length
      ? `Imported ${fresh.length} new role(s); ${rows.length - fresh.length} already on the board.`
      : "No table with a Company column found in that file.",
  );
}

async function exportCsv() {
  if (!state.jobs.length) return toast("No roles yet.");
  const csv = toCsv(state.jobs, [
    { key: "company" },
    { key: "role" },
    { key: "stage" },
    { key: "location" },
    { key: "salary" },
    { key: "source" },
    { key: "link" },
    {
      label: "applied",
      get: (j) =>
        j.stageDates?.Applied ? new Date(j.stageDates.Applied).toISOString().slice(0, 10) : "",
    },
    { label: "match", get: (j) => (j.analysis?.evidence?.length ? j.analysis.score : "") },
    { key: "nextAction" },
    { key: "notes" },
  ]);
  const ok = await saveFile(`job-hunt-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  if (!ok) toast("Downloads are not available in this view.", { tone: "warn" });
}
