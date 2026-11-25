// Desktop alerts: due follow-ups and tomorrow's interviews, a menu bar count and a Dock badge.

import { followUpsDue } from "./logic/pipeline.js";
import { state, saveSettings } from "./state.js";

let timer = null;
let openFn = () => {};

async function perms() {
  return (await state.desktop?.permissions?.state().catch(() => null)) || {};
}

export async function requestDesktop() {
  await state.desktop?.permissions?.request(["notifications", "menu-bar"]).catch(() => null);
  await startDesktop(openFn);
}

export async function manageDesktop() {
  await state.desktop?.permissions?.manage().catch(() => {});
}

export async function refreshDesktop() {
  const d = state.desktop;
  if (!d?.notification) return;
  const due = followUpsDue(state.jobs, state.settings.rules);
  const p = await perms();
  d.app?.dock?.setBadge(due.length ? String(due.length) : "").catch(() => {});
  if (p["menu-bar"] === "granted") {
    d.tray
      .set({
        title: due.length ? `${due.length} due` : "Jobs",
        toolTip: `${due.length} follow-up(s) due · ${state.interviews.length} interview(s) in 14 days`,
        menu: [
          ...due.slice(0, 6).map((x) => ({
            label: `Follow up: ${x.job.company || x.job.role}`,
            click: () =>
              d.window
                .show()
                .then(() => openFn(x.job.id, "followup"))
                .catch(() => {}),
          })),
          ...(due.length ? [{ type: "separator" }] : []),
          { label: "Open Job Hunt Hub", click: () => d.window.show().catch(() => {}) },
        ],
      })
      .catch(() => {});
  }
  if (p.notifications !== "granted") return;
  const notified = new Set(state.settings.notified || []);
  const fresh = [];
  for (const x of due) {
    const key = `fu:${x.job.id}:${x.kind}`;
    if (notified.has(key)) continue;
    await d.notification
      .show({ body: `Follow-up due: ${x.job.role || "role"} at ${x.job.company || "company"}.` })
      .catch(() => {});
    fresh.push(key);
  }
  const soon = Date.now() + 36 * 3600000;
  for (const e of state.interviews.filter((i) => i.start > Date.now() && i.start < soon)) {
    const key = `iv:${e.id}`;
    if (notified.has(key)) continue;
    await d.notification
      .show({
        body: `Interview soon: ${e.title} at ${new Date(e.start).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}.`,
      })
      .catch(() => {});
    fresh.push(key);
  }
  if (fresh.length) await saveSettings({ notified: [...notified, ...fresh].slice(-400) });
}

export async function startDesktop(open) {
  openFn = open || openFn;
  if (!state.desktop?.notification) return;
  clearInterval(timer);
  timer = setInterval(refreshDesktop, 15 * 60000);
  refreshDesktop();
}
