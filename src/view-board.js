// Board view: the pipeline as columns (desktop) or a stage list (phone), plus "Add a role".

import { $, $$, esc, toast, dialog } from "./shared/dom.js";
import { daysBetween } from "./shared/dates.js";
import { STAGES, OPEN_STAGES, followUpsDue } from "./logic/pipeline.js";
import { state, addJob, setStage, updateJob, changed } from "./state.js";
import { analyseJob, aiMessage } from "./ai.js";

let openJob = () => {};
export function setJobOpener(fn) {
  openJob = fn;
}

function card(j, dueIds) {
  const since = j.stageDates?.[j.stage];
  const age = since ? daysBetween(new Date(since), new Date()) : 0;
  const score = j.analysis?.score;
  return `<button class="card ${dueIds.has(j.id) ? "due" : ""}" data-job="${esc(j.id)}" draggable="true" aria-label="${esc(
    `${j.role || "Role"} at ${j.company || "company"}`,
  )}">
    <b>${esc(j.role || "Untitled role")}</b>
    <span>${esc(j.company || "Company not set")}</span>
    <span class="meta">${esc(j.location || "")}${j.location ? " · " : ""}${age}d in ${esc(j.stage)}${dueIds.has(j.id) ? " · follow-up due" : ""}</span>
    ${Number.isFinite(score) && j.analysis?.evidence?.length ? `<span class="score">Match ${score}</span>` : ""}
  </button>`;
}

export function renderBoard() {
  const due = followUpsDue(state.jobs, state.settings.rules);
  const dueIds = new Set(due.map((d) => d.job.id));
  $("#board-sub").textContent = state.jobs.length
    ? `${state.jobs.filter((j) => OPEN_STAGES.includes(j.stage)).length} open roles. Drag a card, or open it to change its stage.`
    : "Paste a job post to add your first role. You decide every move.";

  $("#due-strip").innerHTML = due.length
    ? `<div class="due-strip"><b>${due.length} follow-up${due.length > 1 ? "s" : ""} due</b>${due
        .slice(0, 4)
        .map(
          (d) =>
            `<button class="btn btn-sm" data-job="${esc(d.job.id)}" data-tab="followup">${esc(d.job.company || d.job.role)}</button>`,
        )
        .join("")}</div>`
    : "";

  $("#stage-tabs").innerHTML = OPEN_STAGES.map((s) => {
    const n = state.jobs.filter((j) => j.stage === s).length;
    return `<button class="chip blue" role="tab" data-stagetab="${s}" aria-pressed="${s === state.boardStage}">${s} ${n}</button>`;
  }).join("");

  const cols = OPEN_STAGES.map((s) => {
    const jobs = state.jobs.filter((j) => j.stage === s);
    return `<div class="col ${s === state.boardStage ? "active" : ""}" data-stage="${s}">
      <h3>${s}<span>${jobs.length}</span></h3>
      ${jobs.map((j) => card(j, dueIds)).join("") || `<p class="small muted">Nothing here.</p>`}
    </div>`;
  }).join("");
  const closed = state.jobs.filter((j) => !OPEN_STAGES.includes(j.stage));
  $("#board").innerHTML =
    cols +
    (closed.length
      ? `<details class="closed-row" style="grid-column:1/-1"><summary>Closed (${closed.length}): rejected and withdrawn</summary>
          <div class="cols">${closed.map((j) => card(j, dueIds)).join("")}</div></details>`
      : "");
}

async function addRoleDialog() {
  const body = document.createElement("div");
  body.innerHTML = `<p class="small">Paste the whole job post. Links alone can't be opened from inside the app, so copy the text from the page too.</p>
    <label class="field">Link to the posting (optional)<input id="ar-link" type="url" placeholder="https://"></label>
    <label class="field">Job post text<textarea id="ar-text" style="min-height:180px" placeholder="Paste the full description"></textarea></label>
    <div class="fields">
      <label class="field">Company<input id="ar-company"></label>
      <label class="field">Role<input id="ar-role"></label>
      <label class="field">Source<select id="ar-source"><option>LinkedIn</option><option>Company site</option><option>Referral</option><option>Naukri</option><option>Recruiter</option><option>Other</option></select></label>
    </div>
    <p class="small muted">Leave company and role empty and Claude fills them from the post.</p>`;
  const act = await dialog({
    title: "Add a role",
    body,
    actions: [
      { label: "Cancel", value: null },
      { label: "Add without Claude", value: "plain" },
      { label: "Add and analyse", value: "ai", primary: true },
    ],
  });
  if (!act) return;
  const link = body.querySelector("#ar-link").value.trim();
  const postText = body.querySelector("#ar-text").value.trim();
  const fields = {
    link: /^https:\/\//.test(link) ? link : "",
    postText,
    company: body.querySelector("#ar-company").value.trim(),
    role: body.querySelector("#ar-role").value.trim(),
    source: body.querySelector("#ar-source").value,
  };
  if (!fields.company && !fields.role && !postText)
    return toast("Add the post text, or at least a company and role.", { tone: "warn" });
  const job = await addJob(fields);
  toast("Role added to Saved.");
  if (act === "ai" && postText) runAnalysis(job.id);
}

/** Analyse a job and fill blank fields from the result. */
export async function runAnalysis(id) {
  const job = state.jobs.find((j) => j.id === id);
  if (!job?.postText)
    return toast("Paste the job post text first (open the role, Overview).", { tone: "warn" });
  if (!state.profile) toast("Tip: add your resume in the Resume tab for a real match score.");
  toast("Claude is reading the post…");
  try {
    const a = await analyseJob(job);
    await updateJob(id, {
      analysis: { ...a, at: Date.now() },
      company: job.company || a.company,
      role: job.role || a.role,
      location: job.location || a.location,
      salary: job.salary || a.salary,
    });
    toast(
      `Analysed: ${a.role || job.role || "role"}${a.evidence.length ? `, match ${a.score}` : ""}.`,
    );
  } catch (e) {
    toast(aiMessage(e), { tone: "warn" });
  }
}

export function bindBoard() {
  $("#add-role").onclick = addRoleDialog;
  const view = $("#view-board");
  view.addEventListener("click", (ev) => {
    const c = ev.target.closest("[data-job]");
    const tab = ev.target.closest("[data-stagetab]");
    if (c) openJob(c.dataset.job, c.dataset.tab);
    if (tab) {
      state.boardStage = tab.dataset.stagetab;
      changed();
    }
  });
  // Drag and drop between columns (desktop).
  view.addEventListener("dragstart", (ev) => {
    const c = ev.target.closest("[data-job]");
    if (c) ev.dataTransfer.setData("text/plain", c.dataset.job);
  });
  view.addEventListener("dragover", (ev) => {
    const col = ev.target.closest(".col");
    if (!col) return;
    ev.preventDefault();
    $$(".col.drop").forEach((x) => x !== col && x.classList.remove("drop"));
    col.classList.add("drop");
  });
  view.addEventListener("dragleave", (ev) => ev.target.closest?.(".col")?.classList.remove("drop"));
  view.addEventListener("drop", async (ev) => {
    const col = ev.target.closest(".col");
    if (!col) return;
    ev.preventDefault();
    col.classList.remove("drop");
    const id = ev.dataTransfer.getData("text/plain");
    if (id && STAGES.includes(col.dataset.stage)) {
      await setStage(id, col.dataset.stage);
      toast(`Moved to ${col.dataset.stage}`);
    }
  });
}
