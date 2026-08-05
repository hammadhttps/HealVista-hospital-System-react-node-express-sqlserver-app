import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../config/db.js";
import { embedSource } from "./embeddings.service.js";

const { mockEmbed } = vi.hoisted(() => ({ mockEmbed: vi.fn() }));

vi.mock("../config/db.js", () => ({
  prisma: {
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    $executeRaw: vi.fn().mockResolvedValue(1),
    kbArticle: { findUnique: vi.fn() },
    documentChunk: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

vi.mock("./index.js", () => ({
  getProvider: () => ({
    embed: mockEmbed,
    generate: vi.fn(),
    lastUsage: vi.fn(() => ({})),
  }),
  isAiConfigured: vi.fn(() => true),
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const article = {
  id: "kb-1",
  title: "Fire Safety Policy",
  content: "In case of fire, leave the building immediately and call security.",
  departmentId: null,
};

/** The parameter values handed to `$executeRaw`, per call — one array per row. */
function insertValues(): unknown[][] {
  const executeRaw = prisma.$executeRaw as unknown as {
    mock: { calls: [strings: string[], sql: { values: unknown[] }][] };
  };
  return executeRaw.mock.calls.map(([, sql]) => sql.values);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.kbArticle.findUnique).mockResolvedValue(article as never);
  mockEmbed.mockResolvedValue([[0.1, 0.2, 0.3]]);
});

describe("embedSource", () => {
  it("deletes stale chunks then inserts fresh ones keyed by source", async () => {
    const count = await embedSource("kb_article", "kb-1");

    expect(count).toBe(1);
    expect(prisma.documentChunk.deleteMany).toHaveBeenCalledWith({
      where: { sourceType: "kb_article", sourceId: "kb-1" },
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);

    const values = insertValues()[0] ?? [];
    expect(values).toHaveLength(9);
    expect(values[1]).toBe("kb_article");
    expect(values[2]).toBe("kb-1");
    expect(values[3]).toBeNull();
    expect(values[4]).toBeNull();
    expect(values[5]).toBe(0);
    expect(String(values[6])).toContain("Fire Safety Policy");
    expect(values[8]).toBe("[0.1,0.2,0.3]");
  });

  it("is idempotent — re-embedding replaces chunks without accumulating", async () => {
    await embedSource("kb_article", "kb-1");
    const firstCallValues = insertValues()[0] ?? [];

    await embedSource("kb_article", "kb-1");

    // Same source: delete-then-insert each time, never appending.
    expect(prisma.documentChunk.deleteMany).toHaveBeenCalledTimes(2);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    const secondCallValues = insertValues()[1] ?? [];
    expect(secondCallValues).toHaveLength(firstCallValues.length);
    // Chunk indices restart at 0 rather than continuing a sequence.
    expect(secondCallValues[5]).toBe(0);
  });

  it("strips PII before storing chunk content", async () => {
    vi.mocked(prisma.kbArticle.findUnique).mockResolvedValue({
      ...article,
      title: "Contact List",
      content: "Call the ward at 555-123-4567 or email nurse@example.com for anything urgent.",
    } as never);

    await embedSource("kb_article", "kb-1");

    const values = insertValues()[0] ?? [];
    const content = String(values.map((v) => (typeof v === "string" ? v : "")).join(" "));
    expect(content).not.toContain("555-123-4567");
    expect(content).not.toContain("nurse@example.com");
  });

  it("returns 0 and does not call the provider when the source is gone", async () => {
    vi.mocked(prisma.kbArticle.findUnique).mockResolvedValue(null);
    const count = await embedSource("kb_article", "kb-missing");

    expect(count).toBe(0);
    expect(mockEmbed).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
