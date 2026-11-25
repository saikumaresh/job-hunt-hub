// Every Claude call the hub makes, each followed by the fact checks in logic/facts.js.

import { askJson, askText } from "./shared/claude.js";
import {
  structureProfilePrompt,
  analysePrompt,
  tailorPrompt,
  coverNotePrompt,
  followUpPrompt,
} from "./logic/prompts.js";
import {
  validateProfile,
  validateAnalysis,
  validateTailoring,
  numbersSubset,
  profileCorpus,
  wordCount,
} from "./logic/facts.js";
import { state } from "./state.js";

export class AiUnavailable extends Error {}

const need = (v) => {
  if (v === null)
    throw new AiUnavailable("Claude is not available in this view. Open the app in Claude.");
  return v;
};

/** Human copy for a sample() rejection. */
export function aiMessage(e) {
  if (e instanceof AiUnavailable) return e.message;
  switch (e?.code) {
    case "not_granted":
      return "Allow this app to ask Claude, then try again.";
    case "rate_limited":
      return "Claude is busy. Try again in a minute.";
    default:
      return "Claude could not finish that. Try again.";
  }
}

export async function structureProfile(text) {
  const raw = need(await askJson(structureProfilePrompt(text)));
  return validateProfile(raw, text);
}

export async function analyseJob(job) {
  const raw = need(
    await askJson(analysePrompt(job.postText, state.profile, state.settings.targets)),
  );
  return validateAnalysis(raw, job.postText);
}

export async function tailorFor(job) {
  const raw = need(await askJson(tailorPrompt(state.profile, job), { tier: "complex" }));
  return validateTailoring(state.profile, raw);
}

export async function coverNote(job, tailored, onText) {
  const text = need(
    await askText(coverNotePrompt(state.profile, job, tailored), { onText }),
  ).trim();
  const words = wordCount(text);
  const warnings = [];
  if (words < 120 || words > 180) warnings.push(`It is ${words} words; the target is 120 to 180.`);
  if (!numbersSubset(text, profileCorpus(state.profile) + " " + job.postText))
    warnings.push(
      "It mentions a number that is not in your profile or the posting. Check it before using.",
    );
  return { text, warnings };
}

export async function followUpDraft(job, kind, onText) {
  return need(
    await askText(followUpPrompt(job, kind, state.profile), { onText, tier: "quick" }),
  ).trim();
}
