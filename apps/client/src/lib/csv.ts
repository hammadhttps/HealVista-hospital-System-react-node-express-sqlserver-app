/**
 * CSV export for the analytics page (Phase 6.2).
 *
 * Values are already aggregated server-side; this only serialises what is on
 * screen. Fields are quoted and embedded quotes doubled, and a leading
 * `=+-@` is prefixed with an apostrophe so a spreadsheet treats it as text
 * rather than a formula.
 */

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(
  columns: { key: string; label: string }[],
  rows: Record<string, unknown>[],
): string {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeCell(row[c.key])).join(","));
  return [header, ...body].join("\r\n");
}

/** Triggers a client-side download. Revokes the object URL once the click fires. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
