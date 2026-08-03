import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Structural guarantees around the audit trail (Phase 6.4 / 6.9).
 *
 * These tests do not mock Prisma — they read the source, because the guarantees
 * being pinned are *architectural*: audit logs are append-only, the action names
 * in `docs/architecture/security.md` §5 actually exist in code, and nobody has
 * introduced an off-pattern action name. A runtime test would only see the
 * paths it was told to exercise; a source scan sees every path at once.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const srcRoot = join(repoRoot, "apps", "server", "src");

function listSourceFiles(dir = srcRoot): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Files whose `.action` values are not literal (template interpolation, etc.). */
const ALLOWED_NON_LITERAL = [
  // status-driven dynamic names, matched in referall.service.ts
  "REFERRAL_${status}",
];

function auditSections() {
  const srcFiles = listSourceFiles().filter((f) => !f.endsWith(".test.ts"));
  const srcText = srcFiles.map((f) => readFileSync(f, "utf8")).join("\n");

  // Literal action names, e.g.  action: "LOGIN_SUCCESS",
  const literalActions = new Set<string>();
  const re = /action:\s*"([A-Z0-9_]+)"/g;
  for (const m of srcText.matchAll(re)) literalActions.add(m[1]);

  // Dynamic action strings, e.g.  action: `REFERRAL_${status}`,
  const templateRe = /action:\s*`([^`]+)`/g;
  const templateActions = [...srcText.matchAll(templateRe)].map((m) => m[1]);

  // Append-only: no update or delete may ever touch the audit trail.
  const forbidden = [
    "auditLog.update",
    "auditLog.updateMany",
    "auditLog.delete",
    "auditLog.deleteMany",
    ".update({ where: { id: audit",
  ];
  const violations = forbidden.filter((frag) => srcText.includes(frag));

  return { srcFiles, literalActions, templateActions, violations };
}

/**
 * The documented actions live in security.md §5. Parsing the doc — rather than a
 * hand-maintained list — means the table and the code cannot drift apart: edit
 * one and the other must follow.
 */
function documentedActions(): string[] {
  const doc = readFileSync(join(repoRoot, "docs", "architecture", "security.md"), "utf8");
  const section = doc.split("## 5. Audit logging")[1]?.split("## 6.")[0] ?? "";
  const actions = new Set<string>();
  const re = /`([A-Z][A-Z0-9_]*)`/g;
  for (const m of section.matchAll(re)) {
    const token = m[1];
    // Skip non-action tokens in the prose (AuditLog, entity names).
    if (/^[A-Z][A-Z0-9_]*$/.test(token) && token.includes("_")) actions.add(token);
  }
  return [...actions];
}

describe("audit trail is append-only", () => {
  it("never updates or deletes an audit log anywhere in the source", () => {
    const { violations } = auditSections();
    expect(violations).toEqual([]);
  });

  it("only writes audit rows through a create", () => {
    const auditUtil = readFileSync(join(here, "audit.ts"), "utf8");
    expect(auditUtil).toMatch(/prisma\.auditLog\.create/);
    expect(auditUtil).not.toMatch(/prisma\.auditLog\.(update|delete)/);
  });
});

describe("audit-log coverage matrix (security.md §5 ↔ code)", () => {
  it("implements every action documented in security.md", () => {
    const { srcFiles } = auditSections();
    const srcText = srcFiles.map((f) => readFileSync(f, "utf8")).join("\n");
    const missing = documentedActions().filter(
      // String inclusion — not just `action: "X"` — because some sites write
      // action names inside ternaries (VERIFY_DOCTOR / REJECT_DOCTOR).
      (a) => !srcText.includes(`"${a}"`),
    );
    expect(missing).toEqual([]);
  });

  it("uses only all-caps action names at every literal call site", () => {
    const { literalActions } = auditSections();
    const pattern = /^[A-Z][A-Z0-9_]+$/;
    for (const action of literalActions) {
      expect(action, `action "${action}" breaks the all-caps convention`).toMatch(pattern);
    }
  });

  it("has no off-pattern dynamic action strings", () => {
    const { templateActions } = auditSections();
    const offPattern = templateActions.filter(
      (t) => !ALLOWED_NON_LITERAL.includes(t) && !/^[A-Z][A-Z0-9_]*\$\{[A-Z]+\}$/.test(t),
    );
    expect(offPattern).toEqual([]);
  });
});
