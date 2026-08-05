import { prisma } from "../config/db.js";
import { logger } from "../utils/logger.js";
import type { EmbeddableSourceType } from "../config/bull.js";
import { stripPII } from "./pii.js";
import { chunkText, estimateTokens } from "./chunkText.js";
import { getProvider } from "./index.js";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

/**
 * The embedding pipeline core.
 *
 * Load → strip PII → chunk → batch embed → upsert. Runs inside the BullMQ
 * worker (never in a request) and is **idempotent**: the upsert is keyed on
 * `(sourceType, sourceId, chunkIndex)`, so re-embedding a source replaces its
 * chunks cleanly instead of duplicating them.
 *
 * PII stripping happens here, before embedding, and again is the only copy of
 * that rule for the pipeline — every chunk stored is already stripped.
 */

export interface EmbeddableSource {
  text: string;
  patientId?: string | null;
  departmentId?: string | null;
}

/** Loads the plain-text representation of an embeddable source. */
export async function loadSource(
  sourceType: EmbeddableSourceType,
  sourceId: string,
): Promise<EmbeddableSource | null> {
  switch (sourceType) {
    case "consultation_note": {
      const note = await prisma.consultationNote.findUnique({
        where: { id: sourceId },
        include: {
          appointment: { select: { patientId: true, slot: { select: { startTime: true } } } },
          addenda: { orderBy: { createdAt: "asc" } },
        },
      });
      if (!note || note.signedAt === null) return null; // unsigned notes are not embedded
      const addenda = note.addenda.map((a) => `[Addendum] ${a.content}`).join("\n");
      const text = [
        `Consultation note for visit of ${note.appointment.slot.startTime.toISOString().slice(0, 10)}`,
        `S: ${note.subjective}`,
        `O: ${note.objective}`,
        `A: ${note.assessment}`,
        `P: ${note.plan}`,
        addenda,
      ]
        .filter(Boolean)
        .join("\n");
      return { text, patientId: note.appointment.patientId };
    }

    case "lab_report": {
      const order = await prisma.labOrder.findUnique({
        where: { id: sourceId },
        include: { items: { include: { labTest: { select: { name: true, code: true } } } } },
      });
      if (!order) return null;
      const lines = order.items.map(
        (i) =>
          `${i.labTest.code} ${i.labTest.name}: ${i.resultValue ?? "pending"} ${i.unit ?? ""}${i.referenceRange ? ` (ref ${i.referenceRange})` : ""}${i.flag ? ` [${i.flag}]` : ""}`,
      );
      return {
        text: [`Lab order ${order.orderNumber}`, ...lines].join("\n"),
        patientId: order.patientId,
      };
    }

    case "prescription": {
      const prescription = await prisma.prescription.findUnique({
        where: { id: sourceId },
        include: {
          items: true,
          appointment: { select: { patientId: true } },
        },
      });
      if (!prescription || prescription.isDraft) return null; // drafts are not embedded
      const lines = prescription.items.map(
        (i) =>
          `${i.medicineName} — ${i.dosage}, ${i.frequency} for ${i.durationDays} day(s)${i.instructions ? ` (${i.instructions})` : ""}`,
      );
      return {
        text: [`Prescription`, ...lines, prescription.notes ? `Notes: ${prescription.notes}` : ""]
          .filter(Boolean)
          .join("\n"),
        patientId: prescription.appointment.patientId,
      };
    }

    case "medical_record": {
      const record = await prisma.medicalRecord.findUnique({ where: { id: sourceId } });
      if (!record || !record.extractedText || !record.extractedText.trim()) return null;
      return {
        text: `${record.title}\n\n${record.extractedText}`,
        patientId: record.patientId,
      };
    }

    case "kb_article": {
      const article = await prisma.kbArticle.findUnique({ where: { id: sourceId } });
      if (!article) return null;
      return {
        text: `${article.title}\n\n${article.content}`,
        departmentId: article.departmentId,
      };
    }

    default:
      return null;
  }
}

/**
 * Upserts a source's chunks. Deletes any stale chunks for the source first, then
 * inserts fresh ones — the `(sourceType, sourceId, chunkIndex)` unique key makes
 * this safe under concurrent retries.
 */
export async function embedSource(
  sourceType: EmbeddableSourceType,
  sourceId: string,
): Promise<number> {
  const source = await loadSource(sourceType, sourceId);
  if (!source) {
    logger.info({ sourceType, sourceId }, "[embeddings] Nothing to embed");
    return 0;
  }

  const cleanText = stripPII(source.text);
  const chunks = chunkText(cleanText);
  if (chunks.length === 0) {
    await deleteChunksForSource(sourceType, sourceId);
    return 0;
  }

  const vectors = await getProvider().embed(chunks.map((c) => c.text));
  if (vectors.length !== chunks.length) {
    throw new Error(`[embeddings] Embedding count mismatch: ${vectors.length} vs ${chunks.length}`);
  }

  // The vector column is `Unsupported()` in Prisma, so it is not on the client —
  // writes go through raw SQL exactly like reads do (docs/architecture/ai-rag.md §2).
  // The embedding is passed as pgvector's text literal (`[a,b,c]`) and cast, never
  // as a JS array — Prisma cannot coerce a bind-array into the `vector` type.
  const values = chunks.map(
    (chunk, i) => Prisma.sql`(
      ${randomUUID()},
      ${sourceType},
      ${sourceId},
      ${source.patientId ?? null},
      ${source.departmentId ?? null},
      ${chunk.index},
      ${chunk.text},
      ${chunk.tokenCount},
      ${`[${vectors[i].join(",")}]`}::vector
    )`,
  );

  await prisma.$transaction([
    prisma.documentChunk.deleteMany({
      where: { sourceType, sourceId },
    }),
    prisma.$executeRaw`
      INSERT INTO document_chunks (id, "sourceType", "sourceId", "patientId", "departmentId", "chunkIndex", content, "tokenCount", embedding)
      VALUES ${Prisma.join(values, ",")}
    `,
  ]);

  logger.info({ sourceType, sourceId, chunks: chunks.length }, "[embeddings] Embedded source");
  return chunks.length;
}

/** Removes a source's chunks — used when a source is soft-deleted. */
export async function deleteChunksForSource(
  sourceType: EmbeddableSourceType,
  sourceId: string,
): Promise<void> {
  await prisma.documentChunk.deleteMany({ where: { sourceType, sourceId } });
}

export { estimateTokens };
