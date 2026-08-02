import { prisma } from "../config/db.js";
import { writeAuditLog } from "../utils/audit.js";
import { getDependentPatientIds, type Actor } from "../services/access.service.js";
import { stripPII } from "./pii.js";
import { getProvider } from "./index.js";

/**
 * Retrieval & authorisation — the security core of the RAG layer.
 *
 * Two rules here are non-negotiable:
 *
 * 1. **Scope is resolved before retrieval, never after.** `resolveRetrievalScope`
 *    returns the patient ids this caller may read, and `retrieve` puts them in the
 *    SQL `WHERE` clause (`"patientId" = ANY(...)`). The vector search cannot even
 *    *see* unauthorised rows — a post-hoc filter would leave a breach waiting for
 *    one bug.
 * 2. **Admin is not unrestricted here.** The general clinical gate
 *    (`access.service.getAccessiblePatientIds`) grants admin every patient; the AI
 *    layer deliberately does not. An admin's AI reads the knowledge base and
 *    aggregates only, never a patient's chunks.
 */

export interface RetrievalScope {
  patientIds: string[];
}

export interface RetrievedChunk {
  id: string;
  content: string;
  sourceType: string;
  sourceId: string;
  patientId: string | null;
  chunkIndex: number;
  similarity: number;
}

export interface RetrieveOptions {
  /** Top-k chunks to return. */
  k?: number;
  /** Cosine similarity floor — below it, chunks are irrelevant and must not be shown. */
  minSimilarity?: number;
  /** Search only non-patient content (KB articles). Requires an empty clinical scope. */
  kbOnly?: boolean;
  /** When provided, every patient whose chunks are read gets an audit row. */
  actor?: Actor;
  feature?: string;
}

interface ChunkRow {
  id: string;
  content: string;
  sourceType: string;
  sourceId: string;
  patientId: string | null;
  chunkIndex: number;
  similarity: number | string;
}

/**
 * The patient ids a caller's AI may read chunks for.
 *
 * | Caller | Scope |
 * |---|---|
 * | Patient | Self + dependants they may view records for |
 * | Doctor | Shared appointments + accepted referrals |
 * | Everyone else | None |
 */
export async function resolveRetrievalScope(actor: Actor): Promise<RetrievalScope> {
  if (actor.role === "PATIENT") {
    const patient = await prisma.patient.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (!patient) return { patientIds: [] };
    const dependants = await getDependentPatientIds(patient.id, "records");
    return { patientIds: [patient.id, ...dependants] };
  }

  if (actor.role === "DOCTOR") {
    const doctor = await prisma.doctor.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (!doctor) return { patientIds: [] };

    // Shared appointment, or a referral this doctor accepted. The referral grant is
    // broader than the note-sized read in `access.service` because AI retrieval is
    // over the whole record — matching the retrieval rule in docs/architecture/ai-rag.md.
    const [appointments, referrals] = await Promise.all([
      prisma.appointment.findMany({
        where: { doctorId: doctor.id, deletedAt: null },
        select: { patientId: true },
        distinct: ["patientId"],
      }),
      prisma.referral.findMany({
        where: { toDoctorId: doctor.id, status: "ACCEPTED" },
        select: { patientId: true },
        distinct: ["patientId"],
      }),
    ]);

    const patientIds = new Set<string>();
    for (const a of appointments) patientIds.add(a.patientId);
    for (const r of referrals) patientIds.add(r.patientId);
    return { patientIds: [...patientIds] };
  }

  // Receptionist, Accountant, Admin, Pharmacist, Lab Technician — no clinical
  // retrieval. Admin's AI is KB + aggregates only (a separate, scope-free path).
  return { patientIds: [] };
}

/**
 * Cosine search over the chunk store with the caller's scope in the `WHERE` clause.
 *
 * Returns `[]` when the caller has no clinical scope and KB mode is not requested —
 * never a broad retrieval. Every returned chunk carries its `sourceType`/`sourceId`
 * citation so an answer can link back to the records it came from.
 */
export async function retrieve(
  question: string,
  scope: RetrievalScope,
  opts: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const k = opts.k ?? 8;
  const minSimilarity = opts.minSimilarity ?? 0.3;

  const clinical = scope.patientIds.length > 0;
  const kbMode = !clinical && Boolean(opts.kbOnly);

  // No scope and no KB mode means nothing is retrievable — return before embedding.
  if (!clinical && !kbMode) return [];

  const vectors = await getProvider().embed([stripPII(question)]);
  if (vectors.length !== 1) {
    throw new Error("[retrieval] Embedding the query returned an unexpected shape");
  }
  const [vector] = vectors;

  const rows: ChunkRow[] = clinical
    ? await prisma.$queryRaw`
        SELECT id, content, "sourceType", "sourceId", "patientId", "chunkIndex",
               1 - (embedding <=> ${vector}::vector) AS similarity
        FROM document_chunks
        WHERE "patientId" = ANY(${scope.patientIds}::text[]) AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vector}::vector
        LIMIT ${k}
      `
    : await prisma.$queryRaw`
        SELECT id, content, "sourceType", "sourceId", "patientId", "chunkIndex",
               1 - (embedding <=> ${vector}::vector) AS similarity
        FROM document_chunks
        WHERE "patientId" IS NULL AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vector}::vector
        LIMIT ${k}
      `;

  const results = rows
    .filter((r) => Number(r.similarity) >= minSimilarity)
    .map((r) => ({
      id: r.id,
      content: r.content,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      patientId: r.patientId,
      chunkIndex: r.chunkIndex,
      similarity: Number(r.similarity),
    }));

  // Any read of patient clinical data is audited — one row per patient whose chunks
  // were actually surfaced, best-effort so retrieval never fails on a log write.
  if (opts.actor && clinical) {
    const patientsTouched = [...new Set(results.map((c) => c.patientId).filter(Boolean))];
    await Promise.all(
      patientsTouched.map((patientId) =>
        writeAuditLog({
          actorUserId: opts.actor!.userId,
          action: "AI_RETRIEVAL",
          targetType: "patient",
          targetId: patientId!,
          metadata: { feature: opts.feature ?? null, chunks: results.length, k },
        }).catch(() => undefined),
      ),
    );
  }

  return results;
}
