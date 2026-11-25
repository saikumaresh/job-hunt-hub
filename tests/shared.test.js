import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayKey,
  fromDayKey,
  weekStart,
  isoWeek,
  weekDays,
  monthDays,
  daysBetween,
  fmtMinutes,
  localIso,
} from "../src/shared/dates.js";
import { toCsv } from "../src/shared/csv.js";
import { esc } from "../src/shared/dom.js";

test("dayKey round-trips through fromDayKey", () => {
  const d = new Date(2026, 10, 26, 15, 4);
  assert.equal(dayKey(d), "2026-11-26");
  assert.equal(dayKey(fromDayKey("2026-11-26")), "2026-11-26");
});

test("localIso has no offset", () => {
  assert.equal(localIso(new Date(2026, 0, 2, 9, 5)), "2026-01-02T09:05:00");
});

test("weekStart is Monday and weekDays has 7 days", () => {
  const thu = new Date(2026, 10, 26);
  assert.equal(dayKey(weekStart(thu)), "2026-11-23");
  assert.deepEqual(weekDays(thu)[0], "2026-11-23");
  assert.equal(weekDays(thu).length, 7);
  assert.equal(dayKey(weekStart(new Date(2026, 10, 29))), "2026-11-23"); // Sunday
});

test("isoWeek matches the ISO calendar", () => {
  assert.equal(isoWeek(new Date(2026, 10, 26)), "2026-W48");
  assert.equal(isoWeek(new Date(2027, 0, 1)), "2026-W53");
});

test("monthDays and daysBetween", () => {
  assert.equal(monthDays(new Date(2026, 1, 10)).length, 28);
  assert.equal(daysBetween(new Date(2026, 10, 1, 23), new Date(2026, 10, 8, 1)), 7);
});

test("fmtMinutes", () => {
  assert.equal(fmtMinutes(45), "45m");
  assert.equal(fmtMinutes(120), "2h");
  assert.equal(fmtMinutes(135), "2h 15m");
});

test("toCsv quotes and neutralises formulas", () => {
  const csv = toCsv(
    [{ a: 'say "hi", ok', b: "=SUM(A1)" }],
    [{ key: "a" }, { key: "b", label: "B" }],
  );
  assert.equal(csv, 'a,B\n"say ""hi"", ok",\'=SUM(A1)\n');
});

test("esc escapes markup", () => {
  assert.equal(esc(`<img src=x onerror="1">'`), "&lt;img src=x onerror=&quot;1&quot;&gt;&#39;");
});
