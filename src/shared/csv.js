// CSV export. Pure, unit tested.

function cell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection, then quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Rows of objects to CSV text, columns in the given order. */
export function toCsv(rows, columns) {
  const head = columns.map((c) => cell(c.label ?? c.key)).join(",");
  const body = rows.map((r) =>
    columns.map((c) => cell(typeof c.get === "function" ? c.get(r) : r[c.key])).join(","),
  );
  return [head, ...body].join("\n") + "\n";
}
