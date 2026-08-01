import { describe, it, expect } from "vitest";
import { chunkText, estimateTokens } from "./chunkText.js";

describe("chunkText", () => {
  it("returns an empty list for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("keeps short text in a single chunk", () => {
    const chunks = chunkText("A short consultation note.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].text).toBe("A short consultation note.");
    expect(chunks[0].tokenCount).toBe(estimateTokens(chunks[0].text));
  });

  it("splits long text into sequential chunks with shared overlap", () => {
    const para1 = "ONE " + "a".repeat(66);
    const para2 = "TWO " + "b".repeat(66);
    const chunks = chunkText(`${para1}\n\n${para2}`, { maxTokens: 20, overlapTokens: 4 });

    expect(chunks).toHaveLength(2);
    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
    expect(chunks[0].text).toBe(para1);
    // The tail of chunk 0 is carried as the head of chunk 1 — the overlap.
    expect(chunks[0].text.endsWith("a".repeat(16))).toBe(true);
    expect(chunks[1].text.startsWith("a".repeat(16))).toBe(true);
    expect(chunks[1].text).toContain(para2);
  });

  it("splits a single oversized paragraph on sentence boundaries", () => {
    const sentences = [
      "First sentence here for the test.",
      "Second sentence here for the test.",
      "Third sentence here for the test.",
      "Fourth sentence here for the test.",
      "Fifth sentence here for the test.",
    ];
    const chunk = chunkText(sentences.join(" "), { maxTokens: 20, overlapTokens: 4 });

    expect(chunk.length).toBeGreaterThanOrEqual(2);
    expect(chunk.map((c) => c.index)).toEqual(chunk.map((_, i) => i));
    for (const c of chunk) expect(c.text.length).toBeGreaterThan(0);
    // No single chunk carries the whole paragraph.
    const all = sentences.join(" ");
    for (const c of chunk) expect(c.text.length).toBeLessThan(all.length);
  });

  it("keeps a heading paragraph whole when a chunk break lands nearby", () => {
    const para1 = "Intro " + "x".repeat(70);
    const para2 = "### Heading";
    const para3 = "Body " + "y".repeat(70);
    const chunks = chunkText(`${para1}\n\n${para2}\n\n${para3}`, {
      maxTokens: 20,
      overlapTokens: 4,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // A heading never gets truncated mid-paragraph.
    for (const c of chunks) {
      if (c.text.includes("###")) expect(c.text).toContain("### Heading");
    }
    expect(chunks.some((c) => c.text.startsWith("### Heading"))).toBe(true);
  });
});
