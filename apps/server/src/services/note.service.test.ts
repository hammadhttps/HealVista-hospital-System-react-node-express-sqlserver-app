import { describe, it, expect } from "vitest";
import { isLocked, LOCK_WINDOW_MS } from "./note.service.js";

/**
 * The lock window is the rule that makes a consultation note a record rather than a
 * document. These tests pin the boundary because "roughly a day" is not a
 * specification a medico-legal review accepts.
 */
describe("consultation note locking", () => {
  it("leaves an unsigned draft editable indefinitely", () => {
    expect(isLocked({ signedAt: null, lockedAt: null })).toBe(false);
  });

  it("keeps a just-signed note editable", () => {
    const signedAt = new Date();
    expect(isLocked({ signedAt, lockedAt: new Date(signedAt.getTime() + LOCK_WINDOW_MS) })).toBe(
      false,
    );
  });

  it("keeps a note editable at 23 hours — the next-morning typo fix", () => {
    const signedAt = new Date(Date.now() - 23 * 60 * 60 * 1000);
    expect(isLocked({ signedAt, lockedAt: new Date(signedAt.getTime() + LOCK_WINDOW_MS) })).toBe(
      false,
    );
  });

  it("locks a note once 24 hours have passed", () => {
    const signedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect(isLocked({ signedAt, lockedAt: new Date(signedAt.getTime() + LOCK_WINDOW_MS) })).toBe(
      true,
    );
  });

  it("locks exactly at the boundary, not a moment after", () => {
    const signedAt = new Date(Date.now() - LOCK_WINDOW_MS);
    expect(isLocked({ signedAt, lockedAt: new Date(signedAt.getTime() + LOCK_WINDOW_MS) })).toBe(
      true,
    );
  });

  it("derives the lock from signedAt when lockedAt was never written", () => {
    // Rows signed before lockedAt existed must still lock — falling back to "not
    // locked" would leave old notes permanently editable.
    const signedAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
    expect(isLocked({ signedAt, lockedAt: null })).toBe(true);
  });

  it("respects an explicitly stored lockedAt over the derived one", () => {
    // A deliberately shortened window must win, otherwise the stored value is decorative.
    const signedAt = new Date(Date.now() - 60 * 60 * 1000);
    const lockedAt = new Date(Date.now() - 30 * 60 * 1000);
    expect(isLocked({ signedAt, lockedAt })).toBe(true);
  });
});
