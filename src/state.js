// Job Hunt Hub state: settings, master profile, jobs, resume versions and inbox suggestions.

import { openStore } from "./shared/storage.js";
import { uid } from "./shared/dom.js";
import { DEFAULT_RULES, newJob, moveJob } from "./logic/pipeline.js";

const listeners = new Set();

export const DEFAULT_SETTINGS = Object.freeze({
  kind: "settings",
  setupDone: false,
  setupStep: 0,
  tourDone: false,
  targets: { titles: "", locations: "", workMode: "Any", salaryFloor: "", notice: "" },
  rules: { ...DEFAULT_RULES },
  pageSize: "A4",
  gmailEnabled: false,
  calendarEnabled: false,
  notified: [], // follow-up and interview ids already notified on desktop
});

export const state = {
  store: null,
  settings: { ...DEFAULT_SETTINGS },
  profile: null,
  jobs: [],
  versions: [],
  inbox: { kind: "inbox", seen: [], suggestions: [], lastSync: 0 },
  interviews: [],
  desktop: null,
  view: "board",
  openJobId: null,
  boardStage: "Applied", // phone view: which stage list is showing
};

export const changed = () => listeners.forEach((fn) => fn());
export const onChange = (fn) => listeners.add(fn);

export async function initState() {
  state.store = await openStore("job-hunt-hub");
  const [settings, profile, jobs, versions, inbox] = await Promise.all([
    state.store.get("settings"),
    state.store.get("profile"),
    state.store.list("job"),
    state.store.list("resume"),
    state.store.get("inbox"),
  ]);
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    rules: { ...DEFAULT_RULES, ...(settings?.rules || {}) },
  };
  state.profile = profile;
  state.jobs = jobs.sort((a, b) => b.updatedAt - a.updatedAt);
  state.versions = versions.sort((a, b) => b.createdAt - a.createdAt);
  if (inbox) state.inbox = { ...state.inbox, ...inbox };
}

export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  changed();
  await state.store.set("settings", state.settings);
}

export async function saveProfile(profile) {
  state.profile = { ...profile, kind: "profile", updatedAt: Date.now() };
  changed();
  await state.store.set("profile", state.profile);
}

export const jobById = (id) => state.jobs.find((j) => j.id === id);

export async function addJob(fields) {
  const job = newJob({ ...fields, id: uid("j") });
  state.jobs = [job, ...state.jobs];
  changed();
  await state.store.set(`job-${job.id}`, job);
  return job;
}

export async function updateJob(id, patch) {
  const cur = jobById(id);
  if (!cur) return null;
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  state.jobs = state.jobs.map((j) => (j.id === id ? next : j));
  changed();
  await state.store.set(`job-${id}`, next);
  return next;
}

export async function setStage(id, stage) {
  const cur = jobById(id);
  if (!cur) return null;
  return updateJob(id, moveJob(cur, stage));
}

export async function removeJob(id) {
  state.jobs = state.jobs.filter((j) => j.id !== id);
  changed();
  await state.store.remove(`job-${id}`);
}

export async function saveVersion(v) {
  const version = { kind: "resume", id: uid("v"), createdAt: Date.now(), ...v };
  state.versions = [version, ...state.versions];
  changed();
  await state.store.set(`resume-${version.id}`, version);
  return version;
}

export async function saveInbox(patch) {
  state.inbox = { ...state.inbox, ...patch, seen: (patch.seen || state.inbox.seen).slice(-1500) };
  changed();
  await state.store.set("inbox", state.inbox);
}

export async function deleteAll() {
  for (const kind of ["job", "resume"])
    for (const d of await state.store.list(kind)) await state.store.remove(d.key);
  for (const k of ["settings", "profile", "inbox"]) await state.store.remove(k);
  state.settings = { ...DEFAULT_SETTINGS };
  state.profile = null;
  state.jobs = [];
  state.versions = [];
  state.inbox = { kind: "inbox", seen: [], suggestions: [], lastSync: 0 };
  changed();
}
