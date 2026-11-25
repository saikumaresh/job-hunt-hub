// Date helpers that work in the viewer's local time. Pure functions, unit tested.

const pad = (n) => String(n).padStart(2, "0");

/** "2026-11-26" for a Date in local time. */
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse "2026-11-26" to a local Date at midnight. */
export function fromDayKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Local ISO without offset, as the Calendar connector expects: "2026-11-26T09:30:00". */
export function localIso(d) {
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

/** "09:30" */
export function hhmm(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Minutes since local midnight. */
export function minutesOfDay(d) {
  return d.getHours() * 60 + d.getMinutes();
}

/** "08:00" to 480. */
export function parseHHMM(s) {
  const [h, m] = String(s).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Add days to a Date, returning a new Date. */
export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Monday of the week containing d (local). */
export function weekStart(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Mon=0
  return addDays(x, -dow);
}

/** ISO week label such as "2026-W48". */
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(wk)}`;
}

/** The day keys of the 7 days starting at Monday of d's week. */
export function weekDays(d = new Date()) {
  const s = weekStart(d);
  return Array.from({ length: 7 }, (_, i) => dayKey(addDays(s, i)));
}

/** Day keys for the calendar month containing d. */
export function monthDays(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const n = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => dayKey(new Date(y, m, i + 1)));
}

/** Whole days between two Dates (b minus a), ignoring time of day. */
export function daysBetween(a, b) {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / 86400000);
}

/** "1h 45m" from minutes. */
export function fmtMinutes(min) {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** "26 Nov" */
export function shortDate(d) {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
