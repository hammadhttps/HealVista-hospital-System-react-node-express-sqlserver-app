/**
 * PII stripping — the control that makes sending clinical text to an external LLM
 * acceptable at all (security.md §6).
 *
 * One tested helper, applied before **every** outbound call — embedding and
 * generation alike. Nothing here is optional: a regex that misses a name or a
 * phone number is how the free-tier caveat becomes a real breach.
 *
 * Matching is intentionally conservative — it strips a *superset* of what could be
 * identifying. Over-stripping costs the model a little context; under-stripping
 * costs the patient their privacy.
 */

const REDACTED_NAME = "[NAME]";
const REDACTED_PHONE = "[PHONE]";
const REDACTED_EMAIL = "[EMAIL]";
const REDACTED_ID = "[ID]";
const REDACTED_ADDRESS = "[ADDRESS]";
const REDACTED_DATE = "[DATE]";

/** Common given names — catches "John called yesterday" without a structured field. */
const COMMON_NAMES = new Set([
  "john",
  "james",
  "robert",
  "michael",
  "william",
  "david",
  "richard",
  "joseph",
  "thomas",
  "charles",
  "christopher",
  "daniel",
  "matthew",
  "anthony",
  "mark",
  "donald",
  "steven",
  "paul",
  "andrew",
  "joshua",
  "kenneth",
  "kevin",
  "brian",
  "george",
  "timothy",
  "ronald",
  "edward",
  "jason",
  "jeffrey",
  "ryan",
  "jacob",
  "gary",
  "nicholas",
  "eric",
  "jonathan",
  "stephen",
  "larry",
  "justin",
  "scott",
  "brandon",
  "benjamin",
  "samuel",
  "gregory",
  "alexander",
  "frank",
  "patrick",
  "raymond",
  "jack",
  "dennis",
  "jerry",
  "tyler",
  "aaron",
  "jose",
  "adam",
  "nathan",
  "henry",
  "douglas",
  "zachary",
  "peter",
  "kyle",
  "walter",
  "ethan",
  "jeremy",
  "harold",
  "keith",
  "christian",
  "roger",
  "noah",
  "gerald",
  "carl",
  "terry",
  "sean",
  "austin",
  "arthur",
  "lawrence",
  "jesse",
  "dylan",
  "bryan",
  "joe",
  "jordan",
  "billy",
  "bruce",
  "albert",
  "willie",
  "gabriel",
  "logan",
  "alan",
  "juan",
  "wayne",
  "roy",
  "ralph",
  "randy",
  "eugene",
  "vincent",
  "russell",
  "elijah",
  "louis",
  "bobby",
  "philip",
  "johnny",
  "mary",
  "patricia",
  "jennifer",
  "linda",
  "elizabeth",
  "barbara",
  "susan",
  "jessica",
  "sarah",
  "karen",
  "lisa",
  "nancy",
  "betty",
  "margaret",
  "sandra",
  "ashley",
  "kimberly",
  "emily",
  "donna",
  "michelle",
  "carol",
  "amanda",
  "dorothy",
  "melissa",
  "deborah",
  "stephanie",
  "rebecca",
  "sharon",
  "laura",
  "cynthia",
  "amy",
  "kathleen",
  "angela",
  "shirley",
  "anna",
  "brenda",
  "pamela",
  "emma",
  "nicole",
  "helen",
  "samantha",
  "katherine",
  "christine",
  "debra",
  "rachel",
  "carolyn",
  "janet",
  "catherine",
  "maria",
  "heather",
  "diane",
  "ruth",
  "julie",
  "olivia",
  "joyce",
  "virginia",
  "victoria",
  "kelly",
  "lauren",
  "christina",
  "joan",
  "evelyn",
  "judith",
  "megan",
  "andrea",
  "cheryl",
  "hannah",
  "jacqueline",
  "martha",
  "gloria",
  "teresa",
  "ann",
  "sara",
  "madison",
  "frances",
  "kathryn",
  "janice",
  "jean",
  "abigail",
  "alice",
  "julia",
  "judy",
  "sophia",
  "grace",
  "denise",
  "amber",
  "doris",
  "marilyn",
  "danielle",
  "beverly",
  "isabella",
  "theresa",
  "diana",
  "natalie",
  "brittany",
  "charlotte",
  "marie",
  "kayla",
  "alexis",
  "lori",
  "jane",
  "ahmed",
  "mohammed",
  "ali",
  "fatima",
  "omar",
  "hassan",
  "hussein",
  "yusuf",
  "ibrahim",
  "khalid",
  "amina",
  "zainab",
  "bilal",
  "nadia",
  "samir",
  "layla",
]);

// ─── Patterns ───────────────────────────────────────────────────────────────

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

/** International phone numbers: +923001234567, 0300-1234567, (021) 3456 7890, etc. */
const PHONE_RE = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4,6}\b/g;

/** National ids — 13-digit CNIC, 9-digit SSN with dashes, 8-10 digit passports. */
const ID_RE =
  /\b\d{5}[-.\s]?\d{7}[-.\s]?\d\b|\b\d{3}-\d{2}-\d{4}\b|\b\d{9}\b|\b\d{13}\b|\bMRN[:#.\s-]*\d{3,}/gi;

/** DOB markers — "DOB 05/17/1990", "date of birth: 1990-05-17". */
const DOB_RE = /\b(?:dob|date\s+of\s+birth|born)\b[:\s-]{0,3}\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}\b/gi;

/** Addresses — house number + street name. "221B Baker Street", "14 Park Road". */
const ADDRESS_RE =
  /\b(?:no\.?|plot|house|flat|apt\.?|suite|#)?\s*\d{1,4}[a-z]?[,\s]+(?:[A-Z][a-z]+[\s-]?){1,3}(?:street|st\.?|road|rd\.?|avenue|ave\.?|lane|ln\.?|drive|dr\.?|boulevard|blvd\.?|court|ct\.?|plaza|square|main|colony|nagar|town|gali|mohalla)\b/gi;

/** Salutation + name — "Dr. John Smith", "Mr Patel", "Mrs. Ayesha Khan". */
const TITLE_NAME_RE =
  /\b(?:dr\.?|mrs\.?|mr\.?|ms\.?|miss\.?|mx\.?|prof\.?|sir|madam|sheikh|syed|smt\.?|shri)\s+([A-Z][a-z]+(?:[\s-][A-Z][a-z]+)?)/gi;

/** Labelled names — "patient: John Smith", "referred to Dr. ...". */
const LABELED_NAME_RE =
  /\b(?:patient|guardian|attendant|caregiver|next\s+of\s+kin|referring\s+doctor|treating\s+doctor|consultant|attending|reported\s+by)\s*[:#]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/gi;

// ─── Implementation ─────────────────────────────────────────────────────────

export function stripPII(text: string): string {
  if (!text) return text;

  let out = text;

  // Emails first — they are unambiguous and their substrings (a local part could
  // look like a name) would otherwise be mangled by later passes.
  out = out.replace(EMAIL_RE, REDACTED_EMAIL);

  // DoB markers before generic dates so the labelled date is never left behind.
  out = out.replace(DOB_RE, (m) => m.replace(/\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}\b/, REDACTED_DATE));

  out = out.replace(ID_RE, REDACTED_ID);
  out = out.replace(PHONE_RE, REDACTED_PHONE);
  out = out.replace(ADDRESS_RE, REDACTED_ADDRESS);

  // Names: labelled first, then salutations, then the standalone given-name list.
  out = out.replace(
    LABELED_NAME_RE,
    (_m, names: string) =>
      `${_m.slice(0, _m.indexOf(names))}${names
        .split(/\s+/)
        .map(() => REDACTED_NAME)
        .join(" ")}`,
  );

  out = out.replace(TITLE_NAME_RE, (_m, name: string) =>
    _m.replace(
      name,
      name
        .split(/\s+/)
        .map(() => REDACTED_NAME)
        .join(" "),
    ),
  );

  out = out.replace(/(?<![A-Za-z])([A-Z][a-z]{2,})(?![A-Za-z])/g, (word) =>
    COMMON_NAMES.has(word.toLowerCase()) ? REDACTED_NAME : word,
  );

  return out;
}

export const PII_TEST_TOKENS = {
  REDACTED_NAME,
  REDACTED_PHONE,
  REDACTED_EMAIL,
  REDACTED_ID,
  REDACTED_ADDRESS,
  REDACTED_DATE,
};
