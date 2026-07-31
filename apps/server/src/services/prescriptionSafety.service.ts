import { prisma } from "../config/db.js";

/**
 * Prescribing safety checks.
 *
 * **Deterministic, never AI.** A model hallucinating "no interaction found" on a real
 * contraindication is a patient-safety failure, so this is a seeded-table lookup with
 * no probabilistic step anywhere in it. See CLAUDE.md §7.
 */

export type Severity = "MILD" | "MODERATE" | "SEVERE";

export interface AllergyWarning {
  kind: "allergy";
  severity: Severity;
  medicineName: string;
  allergen: string;
  reaction: string | null;
  /** SEVERE cannot be overridden — the request is rejected outright. */
  blocking: boolean;
}

export interface InteractionWarning {
  kind: "interaction";
  severity: Severity;
  drugA: string;
  drugB: string;
  description: string;
  blocking: boolean;
}

export type SafetyWarning = AllergyWarning | InteractionWarning;

export interface SafetyReport {
  warnings: SafetyWarning[];
  blocking: SafetyWarning[];
  /** Warnings the prescriber must acknowledge explicitly before issuing. */
  acknowledgeable: SafetyWarning[];
  safe: boolean;
}

/**
 * Normalises a drug name for comparison.
 *
 * Matching is deliberately loose — "Amoxicillin 500mg", "amoxicillin", and
 * "AMOXICILLIN trihydrate" must all match a recorded amoxicillin allergy. A missed
 * match is a reaction; a false match is a dialog the doctor dismisses. The asymmetry
 * justifies erring toward matching.
 */
function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/\d+\s*(mg|ml|mcg|g|iu|%)\b/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokens that appear across unrelated drug names and therefore carry no identifying
 * information. Without this list "Folic acid" matches "Mefenamic acid" on `acid`,
 * and a stream of false warnings is how clinicians learn to click through real ones.
 */
const NON_DISTINGUISHING_TOKENS = new Set([
  "acid",
  "sodium",
  "potassium",
  "calcium",
  "magnesium",
  "chloride",
  "sulfate",
  "sulphate",
  "phosphate",
  "citrate",
  "hydrochloride",
  "hydrate",
  "trihydrate",
  "dihydrate",
  "monohydrate",
  "tablet",
  "tablets",
  "capsule",
  "capsules",
  "syrup",
  "injection",
  "solution",
  "suspension",
  "cream",
  "ointment",
  "oral",
  "topical",
  "extended",
  "release",
  "forte",
  "plus",
]);

function identifyingTokens(name: string): string[] {
  return name
    .split(" ")
    .filter((t) => t.length > 3 && !NON_DISTINGUISHING_TOKENS.has(t));
}

/** Whether a drug name plausibly refers to the same substance as an allergen. */
export function namesOverlap(drugName: string, allergen: string): boolean {
  const drug = normalise(drugName);
  const allergy = normalise(allergen);
  if (!drug || !allergy) return false;
  if (drug === allergy) return true;

  // Substring match in either direction catches "amoxicillin" vs
  // "amoxicillin trihydrate", and brand names containing the generic — but only on
  // the identifying part, so "Folic acid" cannot match on the shared "acid".
  const drugCore = identifyingTokens(drug).join(" ");
  const allergyCore = identifyingTokens(allergy).join(" ");
  if (!drugCore || !allergyCore) return false;
  if (drugCore === allergyCore) return true;
  if (drugCore.includes(allergyCore) || allergyCore.includes(drugCore)) return true;

  // Token overlap catches "co-amoxiclav amoxicillin" recorded against "amoxicillin".
  const drugTokens = new Set(identifyingTokens(drug));
  return identifyingTokens(allergy).some((token) => drugTokens.has(token));
}

/**
 * Checks a proposed medicine list against the patient's allergies and their active
 * medicines.
 *
 * `activeMedicines` are drugs the patient is already taking — interactions must be
 * checked against those too, not only within the new prescription.
 */
export async function checkPrescriptionSafety(
  patientId: string,
  proposedMedicines: string[],
): Promise<SafetyReport> {
  const [allergies, activeItems, interactions] = await Promise.all([
    prisma.patientAllergy.findMany({ where: { patientId } }),
    // Everything currently prescribed and not yet fully dispensed counts as active.
    prisma.prescriptionItem.findMany({
      where: {
        prescription: {
          isDraft: false,
          deletedAt: null,
          appointment: { patientId },
        },
      },
      select: { medicineName: true },
    }),
    prisma.drugInteraction.findMany(),
  ]);

  const warnings: SafetyWarning[] = [];

  // ─── Allergy checks ───────────────────────────────────────────────
  for (const medicine of proposedMedicines) {
    for (const allergy of allergies) {
      if (!namesOverlap(medicine, allergy.allergen)) continue;

      warnings.push({
        kind: "allergy",
        severity: allergy.severity as Severity,
        medicineName: medicine,
        allergen: allergy.allergen,
        reaction: allergy.reaction,
        // A severe allergy is an absolute contraindication. No override path.
        blocking: allergy.severity === "SEVERE",
      });
    }
  }

  // ─── Interaction checks ───────────────────────────────────────────
  // Every proposed drug against every other proposed drug, and against everything
  // the patient is already taking.
  const activeNames = [...new Set(activeItems.map((i) => i.medicineName))];
  const pairs: [string, string][] = [];

  for (let i = 0; i < proposedMedicines.length; i++) {
    for (let j = i + 1; j < proposedMedicines.length; j++) {
      pairs.push([proposedMedicines[i]!, proposedMedicines[j]!]);
    }
    for (const active of activeNames) {
      pairs.push([proposedMedicines[i]!, active]);
    }
  }

  for (const [a, b] of pairs) {
    for (const interaction of interactions) {
      // The table stores one row per pair; check both orderings.
      const forward =
        namesOverlap(a, interaction.drugA) && namesOverlap(b, interaction.drugB);
      const reverse =
        namesOverlap(a, interaction.drugB) && namesOverlap(b, interaction.drugA);
      if (!forward && !reverse) continue;

      // Avoid reporting the same pair twice when both orderings match.
      const already = warnings.some(
        (w) =>
          w.kind === "interaction" &&
          ((w.drugA === a && w.drugB === b) || (w.drugA === b && w.drugB === a)),
      );
      if (already) continue;

      warnings.push({
        kind: "interaction",
        severity: interaction.severity as Severity,
        drugA: a,
        drugB: b,
        description: interaction.description,
        // Interactions are a clinical judgement call — the prescriber may proceed
        // with an explicit, recorded acknowledgement. Allergies are not.
        blocking: false,
      });
    }
  }

  const blocking = warnings.filter((w) => w.blocking);

  return {
    warnings,
    blocking,
    acknowledgeable: warnings.filter((w) => !w.blocking),
    safe: warnings.length === 0,
  };
}
