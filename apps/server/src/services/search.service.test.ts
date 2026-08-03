import { describe, it, expect, vi, beforeEach } from "vitest";
import { toPrefixTsQuery, visibleTypesForRole, globalSearch } from "./search.service.js";
import { prisma } from "../config/db.js";
import { writeAuditLog } from "../utils/audit.js";

vi.mock("../config/db.js", () => ({
  prisma: {
    patient: { findUnique: vi.fn() },
    doctor: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

vi.mock("../utils/audit.js", () => ({ writeAuditLog: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

interface RawCall {
  sql: string;
  values: unknown[];
}

function captureRaw(rowsByFragment: Record<string, unknown[]> = {}) {
  const calls: RawCall[] = [];
  vi.mocked(prisma.$queryRaw).mockImplementation(((...args: unknown[]) => {
    const strings = args[0] as TemplateStringsArray;
    const values = args.slice(1);
    const sql = strings.join("?");
    calls.push({ sql, values });
    const frag = Object.keys(rowsByFragment).find((f) => sql.includes(f));
    return Promise.resolve(frag ? (rowsByFragment[frag] as never) : []) as never;
  }) as never);
  return calls;
}

/**
 * Global search reaches across six tables, so *what a role may match at all* is
 * the security boundary. These pin the rule that a pharmacist searching a drug
 * name gets medicines and never patient data.
 */
describe("search visibility by role", () => {
  it("gives a pharmacist medicines only — never patients, appointments or labs", () => {
    expect(visibleTypesForRole("PHARMACIST")).toEqual(["medicine"]);
  });

  it("never lets a patient search the patient directory", () => {
    // A patient may look up their own appointments and bills, but must not be
    // able to discover that another patient exists.
    expect(visibleTypesForRole("PATIENT")).not.toContain("patient");
  });

  it("keeps clinical types away from front-desk and accounts roles", () => {
    for (const role of ["RECEPTIONIST", "ACCOUNTANT"]) {
      expect(visibleTypesForRole(role)).not.toContain("labOrder");
      expect(visibleTypesForRole(role)).not.toContain("medicine");
    }
  });

  it("gives an admin every type", () => {
    expect(visibleTypesForRole("ADMIN")).toEqual([
      "patient",
      "doctor",
      "appointment",
      "medicine",
      "labOrder",
      "invoice",
    ]);
  });

  it("denies an unknown role everything rather than defaulting open", () => {
    expect(visibleTypesForRole("INTERN")).toEqual([]);
    expect(visibleTypesForRole("")).toEqual([]);
  });
});

/**
 * The query string becomes a `tsquery`. It is passed as a bound parameter, but
 * the sanitiser is still the thing standing between user input and the tsquery
 * grammar, so its behaviour is pinned.
 */
describe("prefix tsquery building", () => {
  it("ANDs tokens and makes each a prefix match", () => {
    expect(toPrefixTsQuery("john smith")).toBe("john:* & smith:*");
  });

  it("matches a single partial word", () => {
    expect(toPrefixTsQuery("ibu")).toBe("ibu:*");
  });

  it("strips tsquery operators so a user cannot craft their own query", () => {
    // Without stripping, "a & b | c:*" would be injected as query syntax.
    expect(toPrefixTsQuery("a&b|c:*!")).toBe("a:* & b:* & c:*");
  });

  it("keeps digits so MRNs and bill numbers match", () => {
    expect(toPrefixTsQuery("MRN-00421")).toBe("mrn:* & 00421:*");
  });

  it("returns null when nothing searchable remains", () => {
    expect(toPrefixTsQuery("!!!")).toBeNull();
    expect(toPrefixTsQuery("   ")).toBeNull();
  });
});

/**
 * `visibleTypesForRole` decides *which tables* a role may query; the SQL scope
 * predicates decide *which rows within a table*. A patient's appointment query
 * must be bound to their own patient id — the leak that post-filtering would
 * allow is precisely what these tests pin.
 */
describe("globalSearch row scoping", () => {
  it("binds a patient's queries to their own patient id", async () => {
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({ id: "p-pat" } as never);
    const calls = captureRaw();

    await globalSearch("u1", "PATIENT", "INV-1");

    const appointmentSql = calls.find((c) => c.sql.includes("FROM appointments a"));
    const labSql = calls.find((c) => c.sql.includes("FROM lab_orders lo"));
    const invoiceSql = calls.find((c) => c.sql.includes("FROM bills b"));

    // All three scoped queries receive the caller's own patient id.
    for (const c of [appointmentSql, labSql, invoiceSql]) {
      expect(c, "expected a scoped query").toBeTruthy();
      expect(c!.values).toContain("p-pat");
    }
  });

  it("binds a doctor's queries to their own doctor id", async () => {
    vi.mocked(prisma.doctor.findUnique).mockResolvedValue({ id: "doc-1" } as never);
    const calls = captureRaw();

    await globalSearch("u1", "DOCTOR", "SMITH");

    const appointmentSql = calls.find((c) => c.sql.includes("FROM appointments a"));
    const labSql = calls.find((c) => c.sql.includes("FROM lab_orders lo"));

    for (const c of [appointmentSql, labSql]) {
      expect(c, "expected a scoped query").toBeTruthy();
      expect(c!.values).toContain("doc-1");
    }
  });

  it("queries only the tables its role is allowed to see", async () => {
    captureRaw();
    await globalSearch("u1", "PHARMACIST", "ibu");

    const calls = vi.mocked(prisma.$queryRaw).mock.calls;
    expect(calls.length).toBe(1);
    expect(String(calls[0][0])).toContain("FROM medicines m");
  });

  it("audits a search that returns patient or lab-order rows", async () => {
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({ id: "p-pat" } as never);
    captureRaw({
      "FROM lab_orders lo": [
        { id: "lo1", orderNumber: "LAB-1", status: "COMPLETED", patientName: "A" },
      ],
    });

    await globalSearch("u1", "PATIENT", "LAB-1");

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PATIENT_DATA_SEARCHED", targetId: "u1" }),
    );
  });

  it("does not audit a search that matched no clinical rows", async () => {
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({ id: "p-pat" } as never);
    captureRaw({
      "FROM bills b": [
        { id: "b1", billNumber: "INV-1", status: "paid", balance: "0", patientName: "A" },
      ],
    });

    await globalSearch("u1", "PATIENT", "INV-1");

    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("returns no groups and writes no history for an empty query", async () => {
    const res = await globalSearch("u1", "PATIENT", "!!!");
    expect(res).toEqual({ query: "!!!", groups: [], total: 0 });
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
