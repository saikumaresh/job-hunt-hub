// Stats view.

import { $, esc } from "./shared/dom.js";
import { pipelineStats } from "./logic/pipeline.js";
import { state } from "./state.js";

function bars(rows, fmt = String) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows
    .map(
      (r) =>
        `<div class="bar ${r.key ? "key" : ""}"><span>${esc(r.name)}</span><i style="width:${((r.value / max) * 100).toFixed(1)}%"></i><span>${esc(fmt(r.value))}</span></div>`,
    )
    .join("");
}

export function renderStats() {
  const s = pipelineStats(state.jobs);
  $("#stat-kpis").innerHTML = [
    ["Applied", s.applied, "hero"],
    ["Response rate", `${s.responseRate}%`],
    ["Interview rate", `${s.interviewRate}%`],
    ["Open roles", s.open],
    ["Offers", s.offers],
  ]
    .map(([l, v, c]) => `<div class="kpi ${c || ""}"><b>${esc(v)}</b><span>${esc(l)}</span></div>`)
    .join("");
  const labels = ["7 wks ago", "6", "5", "4", "3", "2", "Last week", "This week"];
  $("#stat-weeks").innerHTML = s.applied
    ? bars(s.perWeek.map((v, i) => ({ name: labels[i], value: v, key: i === 7 })))
    : `<p class="empty">Move a card to Applied and it counts here.</p>`;
  const stageRows = Object.entries(s.timeInStage)
    .filter(([, v]) => v !== null)
    .map(([name, value]) => ({ name, value }));
  $("#stat-stage").innerHTML = stageRows.length
    ? bars(stageRows, (v) => `${v.toFixed(1)}d`)
    : `<p class="empty">Shows once roles move between stages.</p>`;
  const src = Object.entries(s.bySource).sort((a, b) => b[1].applied - a[1].applied);
  $("#stat-sources").innerHTML = src.length
    ? `<table><thead><tr><th>Source</th><th class="num">Applied</th><th class="num">Heard back</th><th class="num">Rate</th></tr></thead><tbody>${src
        .map(
          ([
            name,
            r,
          ]) => `<tr><td>${esc(name)}</td><td class="num">${r.applied}</td><td class="num">${r.responded}</td>
          <td class="num">${r.applied ? Math.round((r.responded / r.applied) * 100) : 0}%</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="empty">No applications yet.</p>`;
}
