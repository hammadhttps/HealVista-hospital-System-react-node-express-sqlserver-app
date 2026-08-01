/**
 * Emergency detection — deterministic on purpose.
 *
 * A model that occasionally misses "chest pain" is not an acceptable triage layer
 * (ai-rag.md §6). This runs **before** any model call and short-circuits to an
 * emergency-services message. It never invents a diagnosis — it flags red-flag
 * phrasing and directs the user to emergency care.
 */

const EMERGENCY_PATTERNS: Array<{ pattern: RegExp; advice: string }> = [
  {
    pattern: /\b(chest\s*pain|chest\s*tightness|pressure\s*in\s*(the\s*)?chest)\b/i,
    advice: "Chest pain or pressure can be a sign of a heart emergency.",
  },
  {
    pattern:
      /\b(difficulty\s*breathing|trouble\s*breathing|shortness\s*of\s*breath|can'?t\s*breath(e|ing)?)\b/i,
    advice: "Breathing difficulty can be a sign of a life-threatening emergency.",
  },
  {
    pattern: /\b(suicid\w*|self.?harm|kill\s*myself|end\s*my\s*life)\b/i,
    advice: "Suicidal thoughts are a crisis. You deserve immediate help.",
  },
  {
    pattern: /\b(unconscious|passed\s*out|fainted\s*and\s*not\s*waking)\b/i,
    advice: "Loss of consciousness is an emergency.",
  },
  {
    pattern: /\b(severe\s*(bleeding|haemorrhage|hemorrhage)|bleeding\s*that\s*won'?t\s*stop)\b/i,
    advice: "Uncontrolled bleeding is an emergency.",
  },
  {
    pattern: /\b(stroke|facial\s*droop|slurred\s*speech|weakness\s*on\s*one\s*side)\b/i,
    advice: "Sudden stroke symptoms need emergency care right away.",
  },
  {
    pattern: /\b(seizure|convulsion)\b/i,
    advice: "Seizures can be emergencies, especially when prolonged.",
  },
  {
    pattern:
      /\b(anaphyla|severe\s*allergic\s*reaction|swelling\s*of\s*the\s*throat|throat\s*closing)\b/i,
    advice: "Signs of a severe allergic reaction need immediate emergency care.",
  },
];

export interface EmergencyResult {
  isEmergency: boolean;
  advice?: string;
}

/**
 * Deterministic keyword check. Returns `isEmergency: true` with the advice string
 * when the input contains a red-flag phrase. The caller must **skip the model
 * entirely** and return this message.
 */
export function detectEmergency(input: string): EmergencyResult {
  if (!input) return { isEmergency: false };

  // Match against the lowercase text so word boundaries hold for capitalised
  // input, while keeping the pattern source readable.
  const lower = input.toLowerCase();
  for (const { pattern, advice } of EMERGENCY_PATTERNS) {
    if (pattern.test(lower)) {
      return { isEmergency: true, advice };
    }
  }
  return { isEmergency: false };
}
