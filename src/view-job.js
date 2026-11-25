// Job detail panel: overview, analysis, tailored resume, cover note and follow-up for one role.

import { $, esc, toast, dialog, copyText } from "./shared/dom.js";
import { STAGES, followUpsDue } from "./logic/pipeline.js";
import { assembleResume, resumeText } from "./logic/resume.js";
import { state, jobById, updateJob, setStage, removeJob, saveVersion, changed } from "./state.js";
import { runAnalysis } from "./view-board.js";
import { tailorFor, coverNote, followUpDraft, aiMessage } from "./ai.js";
import { fitResume } from "./resume-export.js";
import { renderPreview, downloadResume, fileBase } from "./view-resume.js";

const TABS = [
  ["overview", "Overview"],
  ["analysis", "Analysis"],
  ["resume", "Resume"],
  ["cover", "Cover note"],
  ["followup", "Follow-up"],
];
let tab = "overview";
const drafts = new Map(); // jobId -> { tailored, dropped, cover, coverWarnings, followup }

export function openJob(id, startTab) {
  state.openJobId = id;
  tab = TABS.some(([k]) => k === startTab) ? startTab : "overview";
  $("#job").hidden = false;
  document.body.style.overflow = "hidden";
  renderJob();
  $("#job").scrollTop = 0;
}

export function closeJob() {
  state.openJobId = null;
  $("#job").hidden = true;
  document.body.style.overflow = "";
  changed();
}

const d = (id) => drafts.get(id) || drafts.set(id, {}).get(id);

export function renderJob() {
  const j = jobById(state.openJobId);
  if (!j) return closeJob();
  const el = $("#job");
  el.innerHTML = `<div class="job-head">
      <div><p class="small muted">${esc(j.company || "Company not set")}</p><h1 id="job-title">${esc(j.role || "Untitled role")}</h1></div>
      <div class="row">
        <label class="field" style="min-width:170px">Stage<select id="jb-stage">${STAGES.map((s) => `<option ${s === j.stage ? "selected" : ""}>${s}</option>`).join("")}</select></label>
        <button class="btn" id="jb-close">Close</button>
      </div></div>
    <div class="job-tabs" role="tablist">${TABS.map(
      ([k, l]) => `<button role="tab" data-jtab="${k}" aria-selected="${k === tab}">${l}</button>`,
    ).join("")}</div>
    <div id="jb-body"></div>`;
  ({ overview, analysis, resume, cover, followup })[tab](j, $("#jb-body"));
}

function overview(j, el) {
  const f = (k, label, type = "text") =>
    `<label class="field">${label}<input data-f="${k}" type="${type}" value="${esc(j[k] || "")}"></label>`;
  const dates = STAGES.filter((s) => j.stageDates?.[s])
    .map(
      (s) =>
        `<li><span class="mono">${new Date(j.stageDates[s]).toLocaleDateString()}</span> ${esc(s)}</li>`,
    )
    .join("");
  el.innerHTML = `<div class="fields">
      ${f("company", "Company")}${f("role", "Role")}${f("location", "Location")}${f("salary", "Salary band")}
      ${f("contact", "Contact (name or email)")}${f("link", "Link to posting", "url")}${f("nextAction", "Next action")}
      <label class="field">Interview date<input data-f="interviewAt" type="datetime-local" value="${j.interviewAt ? new Date(j.interviewAt - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""}"></label>
    </div>
    ${j.link ? `<p style="margin-top:10px"><a href="${esc(j.link)}" target="_blank" rel="noopener">Open the posting</a></p>` : ""}
    <label class="field" style="margin-top:14px">Notes<textarea data-f="notes">${esc(j.notes || "")}</textarea></label>
    <label class="field" style="margin-top:14px">Job post text<textarea data-f="postText" style="min-height:160px">${esc(j.postText || "")}</textarea></label>
    <div class="row" style="margin-top:14px">
      <button class="btn btn-primary" id="jb-save">Save</button>
      <button class="btn" id="jb-contact">I heard back today</button>
      <span class="spacer"></span>
      <button class="btn btn-ghost" id="jb-delete">Delete role</button>
    </div>
    <div class="panel" style="margin-top:22px"><h3>Timeline</h3><ul class="list-plain">${dates}</ul></div>`;
}

function analysis(j, el) {
  const a = j.analysis;
  if (!a) {
    el.innerHTML = `<p class="empty">Not analysed yet. Claude reads the post, lists must-haves and red flags, and scores the match with quotes from the post as evidence.</p>
      <div class="row" style="margin-top:12px"><button class="btn btn-primary" id="jb-analyse">Analyse this post</button></div>`;
    return;
  }
  const list = (xs) =>
    xs?.length
      ? `<ul class="list-plain">${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
      : `<p class="small muted">None found.</p>`;
  el.innerHTML = `<div class="cols">
      <div class="panel"><h3>Match</h3>
        <div class="score-big">${a.evidence.length ? a.score : "–"}</div>
        <p class="small muted">${a.evidence.length ? "Out of 100, from the evidence below." : "No quotes could be verified, so no score."}</p>
        <p style="margin-top:10px">${esc(a.summary)}</p></div>
      <div class="panel"><h3>Talking points</h3>${list(a.talkingPoints)}</div>
    </div>
    <div class="cols">
      <div class="panel"><h3>Must have</h3>${list(a.mustHave)}</div>
      <div class="panel"><h3>Nice to have</h3>${list(a.niceToHave)}</div>
      <div class="panel"><h3>Red flags</h3>${list(a.redFlags)}</div>
    </div>
    <div class="panel"><h3>Evidence from the post</h3>
      <ul class="evidence">${a.evidence
        .map(
          (
            e,
          ) => `<li><span class="tag ${esc(e.match)}">${esc(e.match)}</span><b>${esc(e.requirement)}</b>
          <q>${esc(e.quote)}</q>${e.profileFact ? `<span class="small">You: ${esc(e.profileFact)}</span>` : ""}</li>`,
        )
        .join("")}</ul></div>
    <div class="row"><button class="btn" id="jb-analyse">Analyse again</button></div>`;
}

function resume(j, el) {
  if (!state.profile) {
    el.innerHTML = `<p class="empty">Add your master profile in the Resume tab first. Tailoring only ever uses facts from it.</p>`;
    return;
  }
  const dr = d(j.id);
  if (!dr.tailored) {
    el.innerHTML = `<p>Claude picks and orders your most relevant bullets for this role and mirrors the post's words where they are true.
      Every change is checked: a new number, skill or claim is refused and your original text is kept.</p>
      <div class="row" style="margin-top:12px"><button class="btn btn-primary" id="jb-tailor" ${j.postText ? "" : "disabled"}>Tailor my resume</button></div>
      ${j.postText ? "" : `<p class="small muted" style="margin-top:8px">Paste the job post on the Overview tab first.</p>`}`;
    return;
  }
  const fit = fitResume(assembleResume(state.profile, dr.tailored), state.settings.pageSize);
  const byId = new Map(state.profile.experience.flatMap((r) => r.bullets.map((b) => [b.id, b])));
  const diff = dr.tailored.experience
    .map((t) => {
      const role = state.profile.experience.find((r) => r.id === t.id);
      return `<li><b>${esc(role.title)}, ${esc(role.company)}</b><ul>${t.bulletIds
        .map((id) =>
          t.rewrites[id]
            ? `<li><span class="old">${esc(byId.get(id)?.text)}</span><br><span class="new">${esc(t.rewrites[id])}</span></li>`
            : `<li class="kept">${esc(byId.get(id)?.text)}</li>`,
        )
        .join("")}</ul></li>`;
    })
    .join("");
  el.innerHTML = `<div class="resume-grid">
      <div class="panel"><h3>What changed</h3>
        ${dr.dropped?.length ? `<div class="note warn" style="margin-bottom:12px"><b>Refused to keep your facts true:</b><ul class="list-plain">${dr.dropped.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
        <p class="small muted" style="margin-bottom:8px">Struck-through lines are your originals; below each is the tailored wording.</p>
        <div class="diff"><ul>${diff}</ul></div>
      </div>
      <div class="panel"><h3>One-page preview</h3><div id="jb-preview"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn btn-primary btn-sm" id="jb-pdf">Download PDF</button>
          <button class="btn btn-sm" id="jb-docx">Download DOCX</button>
          <button class="btn btn-sm" id="jb-text">Copy as text</button>
          <button class="btn btn-sm btn-ghost" id="jb-tailor">Tailor again</button>
        </div></div></div>`;
  requestAnimationFrame(() => renderPreview($("#jb-preview"), fit, state.settings.pageSize));
}

function cover(j, el) {
  const dr = d(j.id);
  el.innerHTML = `<p>A 120 to 180 word note built from the same facts as your resume. Edit it freely; copy it into the application yourself.</p>
    <textarea id="jb-cover" style="min-height:260px;margin-top:12px">${esc(dr.cover || "")}</textarea>
    ${(dr.coverWarnings || []).map((w) => `<p class="warn-text">${esc(w)}</p>`).join("")}
    <div class="row" style="margin-top:12px">
      <button class="btn btn-primary" id="jb-cover-go" ${state.profile ? "" : "disabled"}>${dr.cover ? "Write again" : "Write cover note"}</button>
      <button class="btn" id="jb-cover-copy">Copy</button>
    </div>`;
}

function followup(j, el) {
  const due = followUpsDue([j], state.settings.rules);
  const kind = due[0]?.kind || (j.stage === "Interview" ? "Interview" : "Applied");
  const dr = d(j.id);
  el.innerHTML = `<p>${due.length ? `<b>A follow-up is due</b> (${kind === "Interview" ? `${state.settings.rules.afterInterviewDays} days after the interview` : `${state.settings.rules.afterAppliedDays} days after applying`}).` : "No follow-up is due yet."}
      The app drafts it; you send it from your own email. It never sends anything.</p>
    <textarea id="jb-fu" style="min-height:200px;margin-top:12px">${esc(dr.followup || "")}</textarea>
    <div class="row" style="margin-top:12px">
      <button class="btn btn-primary" id="jb-fu-go" data-kind="${kind}">${dr.followup ? "Draft again" : "Draft follow-up"}</button>
      <button class="btn" id="jb-fu-copy">Copy</button>
      <button class="btn" id="jb-fu-done" data-kind="${kind}">I sent it</button>
    </div>`;
}

export function bindJob() {
  const el = $("#job");
  el.addEventListener(
    "keydown",
    (ev) => ev.key === "Escape" && !document.querySelector(".modal") && closeJob(),
  );
  el.addEventListener("change", async (ev) => {
    if (ev.target.id === "jb-stage") {
      await setStage(state.openJobId, ev.target.value);
      toast(`Moved to ${ev.target.value}`);
      renderJob();
    }
  });
  el.addEventListener("click", async (ev) => {
    const id = state.openJobId;
    const j = jobById(id);
    const t = ev.target.closest("[data-jtab]");
    if (t) {
      tab = t.dataset.jtab;
      return renderJob();
    }
    switch (ev.target.id) {
      case "jb-close":
        return closeJob();
      case "jb-save": {
        const patch = {};
        el.querySelectorAll("[data-f]").forEach((i) => (patch[i.dataset.f] = i.value.trim()));
        patch.link = /^https:\/\//.test(patch.link) ? patch.link : "";
        patch.interviewAt = patch.interviewAt ? new Date(patch.interviewAt).getTime() : null;
        await updateJob(id, patch);
        toast("Saved");
        return renderJob();
      }
      case "jb-contact":
        await updateJob(id, { lastContactAt: Date.now() });
        return toast("Noted. Follow-up timers restart from today.");
      case "jb-delete": {
        const ok = await dialog({
          title: "Delete this role?",
          body: "The card, its notes and analysis are removed. Saved resume versions stay.",
          actions: [
            { label: "Cancel", value: false },
            { label: "Delete", value: true, primary: true },
          ],
        });
        if (ok) {
          await removeJob(id);
          closeJob();
        }
        return;
      }
      case "jb-analyse":
        await runAnalysis(id);
        return renderJob();
      case "jb-tailor": {
        ev.target.disabled = true;
        ev.target.textContent = "Tailoring…";
        try {
          const { tailored, dropped } = await tailorFor(j);
          Object.assign(d(id), { tailored, dropped });
        } catch (e) {
          toast(aiMessage(e), { tone: "warn" });
        }
        return renderJob();
      }
      case "jb-pdf":
      case "jb-docx":
      case "jb-text": {
        const dr = d(id);
        const fit = fitResume(assembleResume(state.profile, dr.tailored), state.settings.pageSize);
        if (ev.target.id === "jb-text") return copyText(resumeText(fit.doc));
        const kind = ev.target.id === "jb-pdf" ? "pdf" : "docx";
        const ok = await downloadResume(fit, kind, fileBase(state.profile.name, j.company));
        if (ok) {
          const v = await saveVersion({
            jobId: id,
            tailored: dr.tailored,
            dropped: dr.dropped,
            fitSize: fit.size,
          });
          await updateJob(id, { resumeVersionId: v.id });
        }
        return;
      }
      case "jb-cover-go": {
        const dr = d(id);
        ev.target.disabled = true;
        const box = $("#jb-cover");
        try {
          const res = await coverNote(j, dr.tailored, (txt) => (box.value = txt));
          Object.assign(dr, { cover: res.text, coverWarnings: res.warnings });
        } catch (e) {
          toast(aiMessage(e), { tone: "warn" });
        }
        return renderJob();
      }
      case "jb-cover-copy":
        return copyText($("#jb-cover").value);
      case "jb-fu-go": {
        const dr = d(id);
        ev.target.disabled = true;
        const box = $("#jb-fu");
        try {
          dr.followup = await followUpDraft(j, ev.target.dataset.kind, (txt) => (box.value = txt));
        } catch (e) {
          toast(aiMessage(e), { tone: "warn" });
        }
        return renderJob();
      }
      case "jb-fu-copy":
        return copyText($("#jb-fu").value);
      case "jb-fu-done":
        await updateJob(id, {
          followUpsDone: [...new Set([...(j.followUpsDone || []), ev.target.dataset.kind])],
          followedUpAt: Date.now(),
        });
        toast("Marked as sent.");
        return renderJob();
    }
  });
}
