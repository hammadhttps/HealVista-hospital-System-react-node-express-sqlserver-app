import { prisma } from "../src/config/db.js";
import { embeddingsQueue, type EmbeddableSourceType } from "../src/config/bull.js";

/**
 * Backfills embeddings for an existing database.
 *
 * Enqueues every embeddable source to the `embeddings` queue so the worker's
 * throttling and backoff apply. Idempotent — re-running replaces chunks, never
 * duplicates them. Jobs are batched with `addBulk` because a per-row `queue.add`
 * over a remote Redis (Upstash) is a full round-trip each time.
 */
async function main() {
  if (!process.env.REDIS_URL) {
    console.warn("REDIS_URL is not set — the embeddings queue needs Redis to run.");
  }

  type JobPayload = { name: string; data: { sourceType: EmbeddableSourceType; sourceId: string } };

  const jobs: JobPayload[] = [];

  const notes = await prisma.consultationNote.findMany({
    where: { signedAt: { not: null } },
    select: { id: true },
  });
  for (const n of notes) {
    jobs.push({ name: "embed", data: { sourceType: "consultation_note", sourceId: n.id } });
  }

  const orders = await prisma.labOrder.findMany({
    where: { status: "VERIFIED" },
    select: { id: true },
  });
  for (const o of orders) {
    jobs.push({ name: "embed", data: { sourceType: "lab_report", sourceId: o.id } });
  }

  const prescriptions = await prisma.prescription.findMany({
    where: { isDraft: false },
    select: { id: true },
  });
  for (const p of prescriptions) {
    jobs.push({ name: "embed", data: { sourceType: "prescription", sourceId: p.id } });
  }

  const records = await prisma.medicalRecord.findMany({
    where: { extractedText: { not: null } },
    select: { id: true },
  });
  for (const r of records) {
    jobs.push({ name: "embed", data: { sourceType: "medical_record", sourceId: r.id } });
  }

  const articles = await prisma.kbArticle.findMany({
    where: { isPublished: true },
    select: { id: true },
  });
  for (const a of articles) {
    jobs.push({ name: "embed", data: { sourceType: "kb_article", sourceId: a.id } });
  }

  let enqueued = 0;
  if (embeddingsQueue && jobs.length > 0) {
    // addBulk is one pipeline; chunk it so a single command never gets huge.
    const CHUNK = 50;
    for (let i = 0; i < jobs.length; i += CHUNK) {
      await embeddingsQueue.addBulk(jobs.slice(i, i + CHUNK));
      enqueued += Math.min(CHUNK, jobs.length - i);
    }
  }

  console.log(
    `[db:embed] Enqueued ${enqueued} sources ` +
      `(notes ${notes.length}, labs ${orders.length}, rx ${prescriptions.length}, records ${records.length}, kb ${articles.length}). ` +
      "The embeddings worker will process them.",
  );
  if (!embeddingsQueue) {
    console.warn("[db:embed] No Redis connection — jobs were not enqueued.");
  }
}

main()
  .catch((err) => {
    console.error("[db:embed] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
