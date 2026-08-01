import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../config/db.js";
import { embedSource } from "./embeddings.service.js";

const { mockEmbed } = vi.hoisted(() => ({ mockEmbed: vi.fn() }));

vi.mock("../config/db.js", () => ({
  prisma: {
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    kbArticle: { findUnique: vi.fn() },
    documentChunk: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
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

/** The `data` payloads handed to `documentChunk.createMany`, per call. */
function createManyData(): unknown[][] {
  const createMany = prisma.documentChunk.createMany as unknown as {
    mock: { calls: [args: { data: unknown[] }][] };
  };
  return createMany.mock.calls.map(([args]) => args.data);
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
    expect(prisma.documentChunk.createMany).toHaveBeenCalledTimes(1);

    const data = (createManyData()[0] ?? []) as Record<string, unknown>[];
    expect(data).toHaveLength(1);
    expect(data[0].chunkIndex).toBe(0);
    expect(data[0].sourceType).toBe("kb_article");
    expect(data[0].sourceId).toBe("kb-1");
    expect(data[0].patientId).toBeNull();
    expect(String(data[0].content)).toContain("Fire Safety Policy");
    expect(data[0].embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it("is idempotent — re-embedding replaces chunks without accumulating", async () => {
    await embedSource("kb_article", "kb-1");
    const firstCallChunks = createManyData()[0] ?? [];

    await embedSource("kb_article", "kb-1");

    // Same source: delete-then-create each time, never appending.
    expect(prisma.documentChunk.deleteMany).toHaveBeenCalledTimes(2);
    expect(prisma.documentChunk.createMany).toHaveBeenCalledTimes(2);
    const secondCallChunks = createManyData()[1] ?? [];
    expect(secondCallChunks).toHaveLength(firstCallChunks.length);
    // Chunk indices restart at 0 rather than continuing a sequence.
    expect((secondCallChunks[0] as { chunkIndex: number } | undefined)?.chunkIndex).toBe(0);
  });

  it("strips PII before storing chunk content", async () => {
    vi.mocked(prisma.kbArticle.findUnique).mockResolvedValue({
      ...article,
      title: "Contact List",
      content: "Call the ward at 555-123-4567 or email nurse@example.com for anything urgent.",
    } as never);

    await embedSource("kb_article", "kb-1");

    const data = (createManyData()[0] ?? []) as Record<string, unknown>[];
    const content = String(data.map((d) => d.content).join(" "));
    expect(content).not.toContain("555-123-4567");
    expect(content).not.toContain("nurse@example.com");
  });

  it("returns 0 and does not call the provider when the source is gone", async () => {
    vi.mocked(prisma.kbArticle.findUnique).mockResolvedValue(null);
    const count = await embedSource("kb_article", "kb-missing");

    expect(count).toBe(0);
    expect(mockEmbed).not.toHaveBeenCalled();
    expect(prisma.documentChunk.createMany).not.toHaveBeenCalled();
  });
});
