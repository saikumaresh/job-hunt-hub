// Guided tour: a spotlight that walks through the app one step at a time.
// Steps point at elements by selector; a step can switch views first.
// Keyboard: Right/Enter next, Left back, Esc ends.

import { esc } from "./dom.js";

/**
 * @typedef {object} TourStep
 * @property {string} title
 * @property {string} body
 * @property {string} [target]  CSS selector to spotlight; centred card when absent
 * @property {() => (void|Promise<void>)} [before]  e.g. switch to the right view
 */

/**
 * Run a tour. Resolves "done" or "skipped".
 * @param {TourStep[]} steps
 */
export function runTour(steps) {
  return new Promise((resolve) => {
    let i = 0;
    const layer = document.createElement("div");
    layer.className = "tour";
    layer.innerHTML = `<div class="tour-hole"></div>
      <div class="tour-card" role="dialog" aria-modal="true" aria-live="polite">
        <p class="tour-count"></p><h2 class="tour-title"></h2><p class="tour-body"></p>
        <div class="tour-actions">
          <button class="btn btn-ghost" data-act="skip">Skip tour</button>
          <span class="spacer"></span>
          <button class="btn" data-act="back">Back</button>
          <button class="btn btn-primary" data-act="next">Next</button>
        </div></div>`;
    document.body.appendChild(layer);
    const hole = layer.querySelector(".tour-hole");
    const card = layer.querySelector(".tour-card");

    const end = (how) => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      layer.remove();
      resolve(how);
    };

    function place() {
      const step = steps[i];
      const el = step.target ? document.querySelector(step.target) : null;
      if (el && el.getClientRects().length) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        const r = el.getBoundingClientRect();
        const pad = 6;
        Object.assign(hole.style, {
          display: "block",
          left: `${r.left - pad}px`,
          top: `${r.top - pad}px`,
          width: `${r.width + pad * 2}px`,
          height: `${r.height + pad * 2}px`,
        });
        const below = r.bottom + 16;
        const cardH = card.offsetHeight || 220;
        const fitsBelow = below + cardH < window.innerHeight;
        card.style.top = `${fitsBelow ? below : Math.max(12, r.top - cardH - 16)}px`;
        const left = Math.min(Math.max(12, r.left), window.innerWidth - card.offsetWidth - 12);
        card.style.left = `${left}px`;
        card.classList.remove("tour-center");
        layer.classList.remove("dim");
      } else {
        hole.style.display = "none";
        card.style.top = card.style.left = "";
        card.classList.add("tour-center");
        layer.classList.add("dim");
      }
    }

    async function show() {
      const step = steps[i];
      if (step.before) await step.before();
      card.querySelector(".tour-count").textContent = `Step ${i + 1} of ${steps.length}`;
      card.querySelector(".tour-title").textContent = step.title;
      card.querySelector(".tour-body").innerHTML = esc(step.body).replace(/\n/g, "<br>");
      card.querySelector('[data-act="back"]').disabled = i === 0;
      card.querySelector('[data-act="next"]').textContent =
        i === steps.length - 1 ? "Finish" : "Next";
      requestAnimationFrame(place);
      card.querySelector('[data-act="next"]').focus();
    }

    const go = (d) => {
      const n = i + d;
      if (n >= steps.length) return end("done");
      if (n < 0) return;
      i = n;
      show();
    };
    const onKey = (e) => {
      if (e.key === "Escape") end("skipped");
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    layer.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "next") go(1);
      else if (act === "back") go(-1);
      else if (act === "skip") end("skipped");
    });
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    show();
  });
}
