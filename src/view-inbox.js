// Inbox view: read-only Gmail sync that suggests stage changes, and upcoming interviews from Calendar.

import { $, esc, toast } from "./shared/dom.js";
import { callConnector, connectorMessage, getMcp } from "./shared/claude.js";
import { localIso, addDays } from "./shared/dates.js";
import {
  GMAIL_QUERY,
  normaliseThreads,
  classifyEmail,
  matchJob,
  isUsefulMove,
} from "./logic/pipeline.js";
import { state, saveInbox, setStage, updateJob, addJob, jobById, changed } from "./state.js";

export const GMAIL = "Gmail";
export const CALENDAR = "Google Calendar";

export function renderInbox() {
  const s = state.inbox;
  $("#sync-status").textContent = s.lastSync
    ? `Last synced ${new Date(s.lastSync).toLocaleString()}.`
    : state.settings.gmailEnabled
      ? "Not synced yet. Press Sync Gmail."
      : "Gmail is off. Turn it on in Settings, then press Sync Gmail.";
  const sug = s.suggestions.filter((x) => !x.done);
  const badge = $("#inbox-count");
  badge.hidden = !sug.length;
  badge.textContent = String(sug.length);
  $("#suggestions").innerHTML = sug.length
    ? `<table class="stack"><thead><tr><th>Email</th><th>Suggested</th><th></th></tr></thead><tbody>${sug
        .map((x) => {
          const job = x.jobId ? jobById(x.jobId) : null;
          const what = job
            ? `Move <b>${esc(job.company)} · ${esc(job.role)}</b> to <b>${esc(x.stage)}</b>`
            : `New role? <b>${esc(x.stage)}</b> email with no matching card`;
          return `<tr><td><b>${esc(x.subject || "(no subject)")}</b><br><span class="small muted">${esc(x.sender)} · ${x.date ? esc(new Date(x.date).toLocaleDateString()) : ""}</span>
              ${x.viewUrl && /^https:\/\//.test(x.viewUrl) ? `<br><a class="small" href="${esc(x.viewUrl)}" target="_blank" rel="noopener">Open in Gmail</a>` : ""}</td>
            <td>${what}</td>
            <td><div class="row"><button class="btn btn-sm btn-primary" data-accept="${esc(x.threadId)}">${job ? "Accept" : "Add card"}</button>
              <button class="btn btn-sm btn-ghost" data-dismiss="${esc(x.threadId)}">Dismiss</button></div></td></tr>`;
        })
        .join("")}</tbody></table>`
    : `<p class="empty">No suggestions right now. ${s.lastSync ? "New job emails show up here after a sync." : ""}</p>`;

  $("#interviews").innerHTML = !state.settings.calendarEnabled
    ? `<p class="small muted">Turn on Google Calendar in Settings to see interviews here.</p>`
    : state.interviews.length
      ? `<table class="stack"><thead><tr><th>When</th><th>Event</th><th>Role</th></tr></thead><tbody>${state.interviews
          .map((e) => {
            const job = matchJob(state.jobs, { subject: e.title });
            return `<tr><td class="mono">${esc(new Date(e.start).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</td>
            <td>${esc(e.title)}</td><td>${job ? `<button class="btn btn-sm" data-openjob="${esc(job.id)}">${esc(job.company)}</button>` : ""}</td></tr>`;
          })
          .join("")}</tbody></table>`
      : `<p class="small muted">No events with "interview" in the next 14 days.</p>`;
}

/** Search Gmail (read-only), classify, and queue suggestions. */
export async function syncGmail() {
  if (!state.settings.gmailEnabled)
    return toast("Turn on Gmail in Settings first.", { tone: "warn" });
  const btn = $("#sync-gmail");
  btn.disabled = true;
  btn.textContent = "Syncing…";
  try {
    const payload = await callConnector(GMAIL, "search_threads", {
      query: GMAIL_QUERY,
      pageSize: 50,
      view: "THREAD_VIEW_SUMMARY",
    });
    const threads = normaliseThreads(payload);
    const seen = new Set(state.inbox.seen);
    const fresh = [];
    for (const t of threads) {
      if (seen.has(t.threadId)) continue;
      seen.add(t.threadId);
      const stage = classifyEmail(t);
      if (!stage) continue;
      const job = matchJob(state.jobs, t);
      if (job && !isUsefulMove(job, stage)) {
        if (stage !== "Applied") await updateJob(job.id, { lastContactAt: t.date || Date.now() });
        continue;
      }
      fresh.push({ ...t, stage, jobId: job?.id || null, done: false });
    }
    await saveInbox({
      seen: [...seen],
      suggestions: [...fresh, ...state.inbox.suggestions.filter((x) => !x.done)].slice(0, 100),
      lastSync: Date.now(),
    });
    toast(fresh.length ? `${fresh.length} new suggestion(s).` : "No new job emails.");
  } catch (e) {
    toast(connectorMessage(e, GMAIL), { tone: "warn" });
  } finally {
    btn.disabled = false;
    btn.textContent = "Sync Gmail";
  }
}

/** Interviews in the next 14 days from the primary calendar (read-only). */
let unwatch = null;
export async function startInterviews() {
  if (unwatch) unwatch();
  unwatch = null;
  if (!state.settings.calendarEnabled) return;
  const mcp = await getMcp();
  if (!mcp) return;
  const now = new Date();
  unwatch = mcp.watchTool(
    CALENDAR,
    "list_events",
    {
      startTime: localIso(now),
      endTime: localIso(addDays(now, 14)),
      fullText: "interview",
      orderBy: "startTime",
      pageSize: 50,
    },
    (ev) => {
      if (ev.type === "data") {
        const raw = ev.result.payload?.events || ev.result.payload?.items || [];
        state.interviews = raw
          .map((e) => ({
            id: e.id,
            title: e.summary || "Interview",
            start: Date.parse(e.start?.dateTime || e.startTime || e.start?.date || ""),
          }))
          .filter((e) => Number.isFinite(e.start));
      } else if (
        [
          "needs_reauth",
          "server_not_connected",
          "not_in_manifest",
          "approval_required",
          "blocked_by_policy",
        ].includes(ev.error?.code)
      ) {
        state.interviews = [];
        toast(connectorMessage(ev.error, CALENDAR), { tone: "warn" });
      }
      changed();
    },
    { refetchInterval: 30 * 60000, cache: { staleTime: 10 * 60000, gcTime: 60 * 60000 } },
  );
}

export function bindInbox(openJob) {
  $("#sync-gmail").onclick = syncGmail;
  $("#view-inbox").addEventListener("click", async (ev) => {
    const acc = ev.target.closest("[data-accept]");
    const dis = ev.target.closest("[data-dismiss]");
    const oj = ev.target.closest("[data-openjob]");
    if (oj) openJob(oj.dataset.openjob);
    if (!acc && !dis) return;
    const id = (acc || dis).dataset.accept || (acc || dis).dataset.dismiss;
    const x = state.inbox.suggestions.find((s) => s.threadId === id);
    if (!x) return;
    if (acc) {
      if (x.jobId) {
        await setStage(x.jobId, x.stage);
        await updateJob(x.jobId, { lastContactAt: x.date || Date.now() });
        toast(`Moved to ${x.stage}`);
      } else {
        const company = (x.sender.match(/@([\w-]+)\./) || [])[1] || "";
        const job = await addJob({
          company: company.charAt(0).toUpperCase() + company.slice(1),
          role: x.subject.slice(0, 80),
          source: "Email",
          stage: x.stage,
          notes: `From email: ${x.subject}`,
        });
        toast("Card added. Open it to fix the company and role.");
        openJob(job.id);
      }
    }
    await saveInbox({
      suggestions: state.inbox.suggestions.map((s) =>
        s.threadId === id ? { ...s, done: true } : s,
      ),
    });
  });
}
