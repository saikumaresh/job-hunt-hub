// Small DOM helpers. Every value that came from a person, a connector or Claude
// goes through esc() or textContent, never straight into innerHTML.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape a value for safe use inside an HTML string. */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Query one element. */
export const $ = (sel, root = document) => root.querySelector(sel);

/** Query all elements as an array. */
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Show a short status message at the bottom of the screen. */
export function toast(message, { tone = "info", ms = 3200 } = {}) {
  let host = $("#toasts");
  if (!host) {
    host = document.createElement("div");
    host.id = "toasts";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${tone}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/** Copy text from a click handler; resolves true when it worked. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
    return true;
  } catch {
    toast("Copy is blocked here. Select the text and copy it by hand.", { tone: "warn" });
    return false;
  }
}

/** A modal dialog built into the page (alert/confirm are blocked in artifacts). */
export function dialog({ title, body, actions = [{ label: "Close", value: null }] }) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modal";
    wrap.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <h2 id="modal-title">${esc(title)}</h2>
      <div class="modal-body"></div>
      <div class="modal-actions">${actions
        .map(
          (a, i) =>
            `<button class="btn ${a.primary ? "btn-primary" : ""}" data-i="${i}">${esc(a.label)}</button>`,
        )
        .join("")}</div></div>`;
    const bodyEl = $(".modal-body", wrap);
    if (typeof body === "string") bodyEl.textContent = body;
    else if (body) bodyEl.appendChild(body);
    const close = (v) => {
      wrap.remove();
      document.removeEventListener("keydown", onKey);
      resolve(v);
    };
    const onKey = (e) => e.key === "Escape" && close(null);
    wrap.addEventListener("click", (e) => {
      const b = e.target.closest("[data-i]");
      if (b) close(actions[Number(b.dataset.i)].value);
      else if (e.target === wrap) close(null);
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(wrap);
    $("[data-i]", wrap)?.focus();
  });
}

/** Debounce a function. */
export function debounce(fn, ms = 400) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Short random id. */
export function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}
