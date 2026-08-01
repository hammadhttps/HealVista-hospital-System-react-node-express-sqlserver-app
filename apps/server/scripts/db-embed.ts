import { prisma } from "../src/config/db.js";
import { addEmbeddingJob } from "../src/config/bull.js";

/**
 * Backfills embeddings for an existing database.
 *
 * Enqueues every embeddable source to the `embeddings` queue so the worker's
 * throttling and backoff apply. Idempotent — re-running replaces chunks, never
 * duplicates them.
 */
async function main() {
  if (!process.env.REDIS_URL) {
    console.warn("REDIS_URL is not set — the embeddings queue needs Redis to run.");
  }

  let enqueued = 0;

  const notes = await prisma.consultationNote.findMany({
    where: { signedAt: { not: null } },
    select: { id: true },
  });
  for (const n of notes) {
    await addEmbeddingJob("consultation_note", n.id);
    enqueued++;
  }

  const orders = await prisma.labOrder.findMany({
    where: { status: "VERIFIED" },
    select: { id: true },
  });
  for (const o of orders) {
    await addEmbeddingJob("lab_report", o.id);
    enqueued++;
  }

  const prescriptions = await prisma.prescription.findMany({
    where: { isDraft: false },
    select: { id: true },
  });
  for (const p of prescriptions) {
    await addEmbeddingJob("prescription", p.id);
    enqueued++;
  }

  const records = await prisma.medicalRecord.findMany({
    where: { extractedText: { not: null } },
    select: { id: true },
  });
  for (const r of records) {
    await addEmbeddingJob("medical_record", r.id);
    enqueued++;
  }

  const articles = await prisma.kbArticle.findMany({
    where: { isPublished: true },
    select: { id: true },
  });
  for (const a of articles) {
    await addEmbeddingJob("kb_article", a.id);
    enqueued++;
  }

  console.log(
    `[db:embed] Enqueued ${enqueued} sources ` +
      `(notes ${notes.length}, labs ${orders.length}, rx ${prescriptions.length}, records ${records.length}, kb ${articles.length}). ` +
      "The embeddings worker will process them.",
  );
}

main()
  .catch((err) => {
    console.error("[db:embed] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
