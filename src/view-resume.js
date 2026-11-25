// Resume view: the master profile editor, the base resume preview and saved versions.

import { $, esc, toast, dialog, copyText } from "./shared/dom.js";
import { saveFile } from "./shared/claude.js";
import { assembleResume, resumeText, PAGES } from "./logic/resume.js";
import { state, saveProfile } from "./state.js";
import { fitResume, resumePdf, resumeDocx } from "./resume-export.js";
import { structureProfile, aiMessage } from "./ai.js";

/** Draw a fitted layout as a scaled HTML page (same ops as the PDF). */
export function renderPreview(el, fit, pageName = "A4") {
  const page = PAGES[pageName] || PAGES.A4;
  const avail = Math.max(240, (el.clientWidth || 520) - 28);
  const scale = Math.min(1.2, avail / page.w);
  const ops = fit.ops
    .map((o) =>
      o.t === "rule"
        ? `<div class="rule" style="left:${o.x1}px;top:${o.y}px;width:${o.x2 - o.x1}px"></div>`
        : `<div class="op" style="left:${o.align === "right" ? "auto" : o.x + "px"};${o.align === "right" ? `right:${page.w - o.x}px;` : ""}top:${o.y - o.size * 0.8}px;font-size:${o.size}px;font-weight:${o.bold ? 700 : 400}">${esc(o.text)}</div>`,
    )
    .join("");
  el.innerHTML = `<div class="page-wrap" style="height:${page.h * scale + 28}px">
      <div class="page" style="width:${page.w}px;height:${page.h}px;transform:scale(${scale})">${ops}</div></div>
    <p class="small muted" style="margin-top:8px">One page, ${pageName}, ${fit.size}pt text.${
      fit.dropped?.length ? ` To fit, ${fit.dropped.length} older bullet(s) were left out.` : ""
    }</p>`;
}

/** Save the fitted resume as PDF or DOCX through Claude's downloads. */
export async function downloadResume(fit, kind, baseName) {
  try {
    const page = state.settings.pageSize;
    const blob = kind === "pdf" ? resumePdf(fit, page) : await resumeDocx(fit, page);
    const ok = await saveFile(`${baseName}.${kind}`, blob);
    if (!ok)
      toast(
        "Downloads are not available in this view. Open the app in Claude or the desktop app.",
        { tone: "warn" },
      );
    return ok;
  } catch (e) {
    toast(e.message || "Could not build the file.", { tone: "warn" });
    return false;
  }
}

export const fileBase = (name, extra = "") =>
  `${String(name || "resume").replace(/[^\w]+/g, "-")}${extra ? "-" + extra.replace(/[^\w]+/g, "-") : ""}`
    .replace(/-+/g, "-")
    .toLowerCase();

function profileEditor(p) {
  const roles = (p.experience || [])
    .map(
      (r, i) => `<div class="editor-role" data-role="${i}">
      <div class="fields">
        <label class="field">Title<input data-k="title" value="${esc(r.title)}"></label>
        <label class="field">Company<input data-k="company" value="${esc(r.company)}"></label>
        <label class="field">Start<input data-k="start" value="${esc(r.start)}"></label>
        <label class="field">End<input data-k="end" value="${esc(r.end)}"></label>
      </div>
      <label class="field">Bullets (one per line)<textarea data-k="bullets">${esc((r.bullets || []).map((b) => b.text).join("\n"))}</textarea></label>
      ${(r.bullets || []).some((b) => b.unverified) ? `<p class="warn-text">Check the numbers in this role: one or more did not appear in the text you pasted.</p>` : ""}
    </div>`,
    )
    .join("");
  return `<div class="stack-gap" style="display:grid;gap:14px">
    <div class="fields">
      <label class="field">Name<input id="pf-name" value="${esc(p.name)}"></label>
      <label class="field">Headline<input id="pf-headline" value="${esc(p.headline)}"></label>
      <label class="field">Email<input id="pf-email" value="${esc(p.contact?.email)}"></label>
      <label class="field">Phone<input id="pf-phone" value="${esc(p.contact?.phone)}"></label>
      <label class="field">Location<input id="pf-location" value="${esc(p.contact?.location)}"></label>
      <label class="field">Links (comma separated)<input id="pf-links" value="${esc((p.contact?.links || []).join(", "))}"></label>
    </div>
    <label class="field">Summary<textarea id="pf-summary">${esc(p.summary)}</textarea></label>
    <h3>Experience</h3>${roles || `<p class="small muted">No roles yet.</p>`}
    <label class="field">Skills (one group per line, "Group: a, b, c")<textarea id="pf-skills">${esc(
      (p.skills || []).map((g) => `${g.name}: ${g.items.join(", ")}`).join("\n"),
    )}</textarea></label>
    <label class="field">Certifications (one per line)<textarea id="pf-certs">${esc((p.certifications || []).join("\n"))}</textarea></label>
    <div class="row"><button class="btn btn-primary" id="pf-save">Save profile</button></div>
  </div>`;
}

function readEditor(p) {
  const next = structuredClone(p);
  next.name = $("#pf-name").value.trim();
  next.headline = $("#pf-headline").value.trim();
  next.contact = {
    email: $("#pf-email").value.trim(),
    phone: $("#pf-phone").value.trim(),
    location: $("#pf-location").value.trim(),
    links: $("#pf-links")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
  next.summary = $("#pf-summary").value.trim();
  document.querySelectorAll("[data-role]").forEach((el) => {
    const r = next.experience[Number(el.dataset.role)];
    for (const k of ["title", "company", "start", "end"])
      r[k] = el.querySelector(`[data-k="${k}"]`).value.trim();
    const lines = el
      .querySelector('[data-k="bullets"]')
      .value.split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const old = new Map(r.bullets.map((b) => [b.text, b]));
    let n = r.bullets.reduce((m, b) => Math.max(m, Number(String(b.id).split("b").pop()) || 0), 0);
    // Keep ids for unchanged bullets so saved tailorings still point at the right text.
    r.bullets = lines.map((t) =>
      old.has(t) ? { id: old.get(t).id, text: t } : { id: `${r.id}b${++n}`, text: t },
    );
  });
  next.skills = $("#pf-skills")
    .value.split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, rest] = l.includes(":")
        ? [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1)]
        : ["Skills", l];
      return {
        name: name.trim(),
        items: rest
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
    });
  next.certifications = $("#pf-certs")
    .value.split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return next;
}

export function renderResume() {
  const p = state.profile;
  if (!p) {
    $("#profile-editor").innerHTML =
      `<p class="empty">No master profile yet. Press "Re-import from text" and paste your resume.</p>`;
    $("#base-preview").innerHTML = "";
  } else {
    $("#profile-editor").innerHTML = profileEditor(p);
    requestAnimationFrame(() =>
      renderPreview(
        $("#base-preview"),
        fitResume(assembleResume(p, null), state.settings.pageSize),
        state.settings.pageSize,
      ),
    );
  }
  $("#versions").innerHTML = state.versions.length
    ? `<table class="stack"><thead><tr><th>Date</th><th>For</th><th>Notes</th><th></th></tr></thead><tbody>${state.versions
        .map((v) => {
          const job = state.jobs.find((j) => j.id === v.jobId);
          return `<tr><td class="mono">${esc(new Date(v.createdAt).toLocaleDateString())}</td><td>${esc(job ? `${job.role} at ${job.company}` : v.label || "Base resume")}</td>
          <td class="small">${esc(v.dropped?.length ? `${v.dropped.length} change(s) refused` : "")}</td>
          <td><button class="btn btn-sm" data-ver="${esc(v.id)}" data-kind="pdf">PDF</button> <button class="btn btn-sm" data-ver="${esc(v.id)}" data-kind="docx">DOCX</button></td></tr>`;
        })
        .join("")}</tbody></table>`
    : `<p class="small muted">Tailored resumes you export are saved here, linked to their role.</p>`;
}

/** Paste resume text, let Claude structure it, return true when saved. */
export async function importProfileDialog() {
  const body = document.createElement("div");
  body.innerHTML = `<p class="small">Open your resume, select all, copy, and paste it here. A .txt or .md file works too.
    Claude copies your facts into fields. It does not add or improve anything.</p>
    <input type="file" id="imp-file" accept=".txt,.md,text/plain">
    <textarea id="imp-text" style="min-height:220px" placeholder="Paste your resume text"></textarea>`;
  body.querySelector("#imp-file").onchange = async (e) => {
    const f = e.target.files?.[0];
    if (f) body.querySelector("#imp-text").value = await f.text();
  };
  const ok = await dialog({
    title: "Import your resume",
    body,
    actions: [
      { label: "Cancel", value: false },
      { label: "Structure with Claude", value: true, primary: true },
    ],
  });
  const text = body.querySelector("#imp-text").value.trim();
  if (!ok || !text) return false;
  toast("Claude is structuring your resume…");
  try {
    const { profile, flagged } = await structureProfile(text);
    await saveProfile({ ...profile, sourceText: text.slice(0, 30000) });
    toast(
      flagged.length
        ? `Saved. Check ${flagged.length} bullet(s) marked in the editor.`
        : "Profile saved.",
    );
    return true;
  } catch (e) {
    toast(aiMessage(e), { tone: "warn" });
    return false;
  }
}

export function bindResume() {
  $("#reimport").onclick = importProfileDialog;
  const view = $("#view-resume");
  view.addEventListener("click", async (ev) => {
    if (ev.target.id === "pf-save") {
      await saveProfile(readEditor(state.profile));
      toast("Profile saved.");
    }
    const base = () => fitResume(assembleResume(state.profile, null), state.settings.pageSize);
    if (ev.target.id === "base-pdf" && state.profile)
      downloadResume(base(), "pdf", fileBase(state.profile.name, "resume"));
    if (ev.target.id === "base-docx" && state.profile)
      downloadResume(base(), "docx", fileBase(state.profile.name, "resume"));
    if (ev.target.id === "base-copy" && state.profile) copyText(resumeText(base().doc));
    const ver = ev.target.closest("[data-ver]");
    if (ver) {
      const v = state.versions.find((x) => x.id === ver.dataset.ver);
      if (v) {
        const fit = fitResume(assembleResume(state.profile, v.tailored), state.settings.pageSize);
        const job = state.jobs.find((j) => j.id === v.jobId);
        downloadResume(
          fit,
          ver.dataset.kind,
          fileBase(state.profile.name, job?.company || "resume"),
        );
      }
    }
  });
}
