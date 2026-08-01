import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createKbArticle,
  updateKbArticle,
  deleteKbArticle,
  getKbArticle,
  askKb,
} from "./kb.service.js";
import { prisma } from "../config/db.js";
import { addEmbeddingJob } from "../config/bull.js";
import { deleteChunksForSource } from "./embeddings.service.js";
import { isAiConfigured } from "./index.js";
import { retrieve } from "./retrieval.js";
import { getCached } from "../config/redis.js";
import { writeAuditLog } from "../utils/audit.js";
import { AiGenerationError } from "./guardrails.js";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));

vi.mock("../config/db.js", () => ({
  prisma: {
    kbArticle: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("../config/bull.js", () => ({ addEmbeddingJob: vi.fn() }));
vi.mock("../utils/audit.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("./embeddings.service.js", () => ({ deleteChunksForSource: vi.fn() }));

vi.mock("./index.js", () => ({
  getProvider: () => ({
    embed: vi.fn(),
    generate: mockGenerate,
    lastUsage: vi.fn(() => ({})),
  }),
  isAiConfigured: vi.fn(),
}));

vi.mock("./retrieval.js", () => ({ retrieve: vi.fn() }));
vi.mock("./aiInteraction.service.js", () => ({ logInteraction: vi.fn() }));
vi.mock("../config/redis.js", () => ({
  redis: null,
  getCached: vi.fn(),
  setCached: vi.fn(),
}));

const admin = { userId: "a1", role: "ADMIN" };
const doctor = { userId: "d1", role: "DOCTOR" };

const input = {
  title: "Billing Policy",
  content: "Patients settle bills before the next visit.",
  category: "policy",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCached).mockResolvedValue(null);
  vi.mocked(prisma.kbArticle.findFirst).mockResolvedValue(null);
});

describe("createKbArticle", () => {
  it("creates a published article and enqueues it for embedding", async () => {
    vi.mocked(prisma.kbArticle.create).mockResolvedValue({
      id: "kb1",
      ...input,
      slug: "billing-policy",
      isPublished: true,
    } as never);

    const article = await createKbArticle({ ...input, isPublished: true }, admin);

    expect(article.id).toBe("kb1");
    expect(addEmbeddingJob).toHaveBeenCalledWith("kb_article", "kb1");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "KB_CREATE", targetId: "kb1" }),
    );
  });

  it("does not embed an unpublished draft", async () => {
    vi.mocked(prisma.kbArticle.create).mockResolvedValue({
      id: "kb2",
      ...input,
      slug: "billing-policy",
      isPublished: false,
    } as never);

    await createKbArticle(input, admin);

    expect(addEmbeddingJob).not.toHaveBeenCalled();
  });

  it("dedupes a colliding slug", async () => {
    vi.mocked(prisma.kbArticle.findFirst)
      .mockResolvedValueOnce({ id: "existing" } as never)
      .mockResolvedValueOnce(null);
    vi.mocked(prisma.kbArticle.create).mockResolvedValue({
      id: "kb1",
      ...input,
      slug: "billing-policy-2",
      isPublished: false,
    } as never);

    await createKbArticle(input, admin);

    const data = vi.mocked(prisma.kbArticle.create).mock.calls[0][0] as {
      data: { slug: string };
    };
    expect(data.data.slug).toBe("billing-policy-2");
  });
});

describe("updateKbArticle", () => {
  it("re-embeds a published article after edit", async () => {
    vi.mocked(prisma.kbArticle.findUnique).mockResolvedValue({
      id: "kb1",
      slug: "billing-policy",
      isPublished: true,
    } as never);
    vi.mocked(prisma.kbArticle.update).mockResolvedValue({
      id: "kb1",
      slug: "billing-policy",
      isPublished: true,
      title: input.title,
      content: input.content,
      category: input.category,
    } as never);

    await updateKbArticle("kb1", { content: "Updated content." }, admin);

    expect(addEmbeddingJob).toHaveBeenCalledWith("kb_article", "kb1");
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "KB_UPDATE" }));
  });

  it("removes chunks when an article is unpublished", async () => {
    vi.mocked(prisma.kbArticle.findUnique).mockResolvedValue({
      id: "kb1",
      slug: "billing-policy",
      isPublished: true,
    } as never);
    vi.mocked(prisma.kbArticle.update).mockResolvedValue({
      id: "kb1",
      slug: "billing-policy",
      isPublished: false,
      title: input.title,
      content: input.content,
      category: input.category,
    } as never);

    await updateKbArticle("kb1", { isPublished: false }, admin);

    expect(deleteChunksForSource).toHaveBeenCalledWith("kb_article", "kb1");
    expect(addEmbeddingJob).not.toHaveBeenCalled();
  });
});

describe("deleteKbArticle", () => {
  it("soft-deletes (unpublishes) and removes chunks", async () => {
    vi.mocked(prisma.kbArticle.findUnique).mockResolvedValue({
      id: "kb1",
      isPublished: true,
    } as never);

    await deleteKbArticle("kb1", admin);

    expect(prisma.kbArticle.update).toHaveBeenCalledWith({
      where: { id: "kb1" },
      data: { isPublished: false },
    });
    expect(deleteChunksForSource).toHaveBeenCalledWith("kb_article", "kb1");
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "KB_DELETE" }));
  });
});

describe("getKbArticle", () => {
  it("hides unpublished articles from non-admins", async () => {
    vi.mocked(prisma.kbArticle.findUnique).mockResolvedValue({
      id: "kb1",
      isPublished: false,
    } as never);

    await expect(getKbArticle("kb1", doctor)).rejects.toMatchObject({ statusCode: 404 });
    expect(await getKbArticle("kb1", admin)).not.toBeNull();
  });
});

describe("askKb", () => {
  it("falls back to a keyword title search when AI is unconfigured", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(false);
    vi.mocked(prisma.kbArticle.findMany).mockResolvedValue([
      { id: "kb1", title: "Billing Policy" },
    ] as never);

    const result = await askKb("billing policy?", doctor);

    expect(result.fallback).toBe(true);
    expect(result.answer).toContain("Billing Policy");
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("answers from retrieved KB chunks with titled citations", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(true);
    vi.mocked(retrieve).mockResolvedValue([
      {
        id: "c1",
        content: "Patients settle bills before the next visit.",
        sourceType: "kb_article",
        sourceId: "kb1",
        patientId: null,
        chunkIndex: 0,
        similarity: 0.9,
      },
    ] as never);
    vi.mocked(prisma.kbArticle.findMany).mockResolvedValue([
      { id: "kb1", title: "Billing Policy" },
    ] as never);
    mockGenerate.mockResolvedValue({ answer: "Bills are settled before the next visit." });

    const result = await askKb("when do I pay?", doctor);

    expect(result.fallback).toBe(false);
    expect(result.answer).toContain("before the next visit");
    expect(result.citations[0].title).toBe("Billing Policy");
    expect(retrieve).toHaveBeenCalledWith(
      "when do I pay?",
      { patientIds: [] },
      expect.objectContaining({ kbOnly: true }),
    );
  });

  it("falls back to raw excerpts when generation fails", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(true);
    vi.mocked(retrieve).mockResolvedValue([
      {
        id: "c1",
        content: "Patients settle bills before the next visit.",
        sourceType: "kb_article",
        sourceId: "kb1",
        patientId: null,
        chunkIndex: 0,
        similarity: 0.9,
      },
    ] as never);
    vi.mocked(prisma.kbArticle.findMany).mockResolvedValue([] as never);
    mockGenerate.mockRejectedValue(new AiGenerationError("down"));

    const result = await askKb("when do I pay?", doctor);

    expect(result.fallback).toBe(true);
    expect(result.answer).toContain("before the next visit");
  });
});
