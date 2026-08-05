import { z } from "zod";
import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import { addEmbeddingJob } from "../config/bull.js";
import { deleteChunksForSource } from "./embeddings.service.js";
import { retrieve } from "./retrieval.js";
import { getProvider, isAiConfigured } from "./index.js";
import { generateValidated, AiGenerationError } from "./guardrails.js";
import { stripPII } from "./pii.js";
import { logInteraction } from "./aiInteraction.service.js";
import { answerCacheKey, getCachedAnswer, setCachedAnswer } from "./answerCache.js";
import type { Actor } from "../services/access.service.js";
import type { KbArticleInput, KbArticleUpdateInput } from "@healvista/shared";

/**
 * Hospital knowledge assistant (Phase 5.5).
 *
 * `kb_articles` hold policies, FAQs, and guidelines with **no patient scope** —
 * anyone staff may read and ask. Writing is ADMIN-only, and every save re-enqueues
 * the article for embedding so the RAG layer tracks edits. Delete is a soft
 * unpublish (isPublished=false) plus chunk removal: the article leaves the
 * assistant without destroying the record's history.
 */

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
  return slug || "article";
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let candidate = base;
  let n = 2;
  while (
    await prisma.kbArticle.findFirst({
      where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
  ) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

export async function listKbArticles(actor: Actor) {
  const articles = await prisma.kbArticle.findMany({
    where: actor.role === "ADMIN" ? {} : { isPublished: true },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      category: true,
      isPublished: true,
      departmentId: true,
      updatedAt: true,
    },
  });
  return articles;
}

export async function getKbArticle(id: string, actor: Actor) {
  const article = await prisma.kbArticle.findUnique({ where: { id } });
  if (!article || (!article.isPublished && actor.role !== "ADMIN")) {
    throw new AppError("Article not found", 404);
  }
  return article;
}

export async function createKbArticle(input: KbArticleInput, actor: Actor) {
  const slug = await uniqueSlug(input.slug ?? slugify(input.title));
  const article = await prisma.kbArticle.create({
    data: {
      title: input.title,
      slug,
      content: input.content,
      category: input.category,
      departmentId: input.departmentId ?? null,
      isPublished: input.isPublished ?? false,
    },
  });

  if (article.isPublished) await addEmbeddingJob("kb_article", article.id);
  await writeAuditLog({
    actorUserId: actor.userId,
    action: "KB_CREATE",
    targetType: "kb_article",
    targetId: article.id,
  });
  return article;
}

export async function updateKbArticle(id: string, input: KbArticleUpdateInput, actor: Actor) {
  const existing = await prisma.kbArticle.findUnique({ where: { id } });
  if (!existing) throw new AppError("Article not found", 404);

  const slug = await uniqueSlug(input.slug ?? existing.slug, id);

  const article = await prisma.kbArticle.update({
    where: { id },
    data: {
      title: input.title ?? existing.title,
      slug,
      content: input.content ?? existing.content,
      category: input.category ?? existing.category,
      departmentId: input.departmentId === undefined ? existing.departmentId : input.departmentId,
      isPublished: input.isPublished ?? existing.isPublished,
    },
  });

  // Published articles track edits in the vector store; unpublishing removes them.
  if (article.isPublished) await addEmbeddingJob("kb_article", article.id);
  else await deleteChunksForSource("kb_article", article.id);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "KB_UPDATE",
    targetType: "kb_article",
    targetId: id,
  });
  return article;
}

export async function deleteKbArticle(id: string, actor: Actor) {
  const existing = await prisma.kbArticle.findUnique({ where: { id } });
  if (!existing) throw new AppError("Article not found", 404);

  await prisma.kbArticle.update({ where: { id }, data: { isPublished: false } });
  await deleteChunksForSource("kb_article", id);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "KB_DELETE",
    targetType: "kb_article",
    targetId: id,
  });
}

// ─── KB assistant (RAG over policies/FAQs/guidelines) ───────────────────────

const kbAnswerSchema = z.object({
  answer: z.string().min(1).max(2000),
});

export interface KbCitation {
  sourceType: string;
  sourceId: string;
  title: string | null;
}

export interface KbAskResult {
  answer: string;
  citations: KbCitation[];
  fallback: boolean;
}

async function articleTitles(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const articles = await prisma.kbArticle.findMany({
    where: { id: { in: unique } },
    select: { id: true, title: true },
  });
  return new Map(articles.map((a) => [a.id, a.title]));
}

/** Deterministic title search — the KB answer's non-AI fallback. */
async function keywordKbSearch(question: string, limit: number) {
  return prisma.kbArticle.findMany({
    where: {
      isPublished: true,
      OR: [
        { title: { contains: question, mode: "insensitive" } },
        { content: { contains: question, mode: "insensitive" } },
      ],
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true },
  });
}

export async function askKb(question: string, actor: Actor): Promise<KbAskResult> {
  const feature = "kb-assistant";
  const cacheKey = answerCacheKey(feature, question.trim().toLowerCase());
  const cached = await getCachedAnswer<KbAskResult>(cacheKey);
  if (cached) return cached;

  if (!isAiConfigured()) {
    const matches = await keywordKbSearch(question, 3);
    return {
      answer: matches.length
        ? `The knowledge base is searchable even when the AI is unavailable. Closest articles:\n${matches
            .map((a) => `• ${a.title}`)
            .join("\n")}`
        : "The knowledge assistant is not available right now.",
      citations: [],
      fallback: true,
    };
  }

  const chunks = await retrieve(
    question,
    { patientIds: [] },
    { k: 6, minSimilarity: 0.3, kbOnly: true },
  );

  if (chunks.length === 0) {
    await logInteraction({ userId: actor.userId, feature, question, wasFallback: false });
    return {
      answer: "I couldn't find anything in the knowledge base covering this.",
      citations: [],
      fallback: false,
    };
  }

  const titleById = await articleTitles(chunks.map((c) => c.sourceId));
  const citations: KbCitation[] = chunks.map((c) => ({
    sourceType: c.sourceType,
    sourceId: c.sourceId,
    title: titleById.get(c.sourceId) ?? null,
  }));
  const context = chunks.map((c) => `[${c.sourceType} ${c.sourceId}]\n${c.content}`).join("\n\n");

  try {
    const result = await generateValidated(getProvider(), {
      feature,
      prompt: `Question:\n"${stripPII(question)}"\n\nKnowledge base excerpts:\n${context}`,
      schema: kbAnswerSchema,
      system:
        "Answer from the knowledge base excerpts only — hospital policies, FAQs, and guidelines. If they do not cover the question, say so. Cite the [source] markers you used. Answer in the same language the user asked in. Prefer short paragraphs and bullet points.",
      maxTokens: 512,
    });

    const usage = getProvider().lastUsage();
    await logInteraction({
      userId: actor.userId,
      feature,
      question,
      responseRef: result.answer,
      citedChunks: chunks.map((c) => c.id),
      latencyMs: usage.latencyMs,
      tokensUsed: usage.tokensUsed,
      wasFallback: false,
    });

    const out: KbAskResult = { answer: result.answer, citations, fallback: false };
    await setCachedAnswer(cacheKey, out);
    return out;
  } catch (err) {
    if (!(err instanceof AiGenerationError)) throw err;
    await logInteraction({ userId: actor.userId, feature, question, wasFallback: true });
    const answer = chunks
      .slice(0, 3)
      .map((c) => c.content.slice(0, 300))
      .join("\n\n");
    return { answer, citations, fallback: true };
  }
}
