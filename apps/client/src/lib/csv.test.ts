import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

const columns = [
  { key: "section", label: "Section" },
  { key: "label", label: "Label" },
  { key: "value", label: "Value" },
];

describe("analytics CSV export", () => {
  it("writes a header row and one row per record", () => {
    const csv = toCsv(columns, [{ section: "Summary", label: "No-show rate (%)", value: 12.5 }]);
    expect(csv.split("\r\n")).toEqual([
      '"Section","Label","Value"',
      '"Summary","No-show rate (%)","12.5"',
    ]);
  });

  it("doubles embedded quotes so a quoted name cannot break the row", () => {
    const csv = toCsv(columns, [{ section: "Top diagnoses", label: 'Asthma "mild"', value: 3 }]);
    expect(csv).toContain('"Asthma ""mild"""');
  });

  it("keeps a value containing a comma inside one field", () => {
    const csv = toCsv(columns, [{ section: "Revenue", label: "Cardiology, West", value: 1200 }]);
    const rows = csv.split("\r\n");
    expect(rows[1]).toBe('"Revenue","Cardiology, West","1200"');
  });

  it("neutralises spreadsheet formula injection", () => {
    // A department renamed "=cmd|' /c calc'!A1" must not execute on open.
    const csv = toCsv(columns, [{ section: "Revenue", label: "=1+1", value: "@SUM(A1)" }]);
    expect(csv).toContain("\"'=1+1\"");
    expect(csv).toContain("\"'@SUM(A1)\"");
  });

  it("renders null and undefined as empty fields, not the string 'null'", () => {
    const csv = toCsv(columns, [{ section: "Stock", label: null, value: undefined }]);
    expect(csv.split("\r\n")[1]).toBe('"Stock",,');
  });

  it("emits only a header when there are no rows", () => {
    expect(toCsv(columns, [])).toBe('"Section","Label","Value"');
  });
});
