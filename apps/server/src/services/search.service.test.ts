import { describe, it, expect } from "vitest";
import { toPrefixTsQuery, visibleTypesForRole } from "./search.service.js";

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
