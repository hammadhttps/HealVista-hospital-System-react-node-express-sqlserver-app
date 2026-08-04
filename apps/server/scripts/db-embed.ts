import { prisma } from "../src/config/db.js";
import { embeddingsQueue, type EmbeddableSourceType } from "../src/config/bull.js";
import { embedSource } from "../src/ai/embeddings.service.js";

/**
 * Backfills embeddings for an existing database.
 *
 * Two modes, because Redis is optional in this deployment:
 *
 *  - **Queued** (default, when Redis is up): enqueues every source to the
 *    `embeddings` queue so the worker's throttling and backoff apply. Jobs are
 *    batched with `addBulk` — a per-row `queue.add` over a remote Redis is a
 *    full round trip each time.
 *
 *  - **Direct** (`--direct`, or automatically when there is no queue): embeds
 *    in-process, one source at a time. Without this the backfill was impossible
 *    whenever Redis was off — it enqueued to a queue that did not exist and
 *    reported success having done nothing, which left RAG retrieving from an
 *    empty table with no error anywhere to explain why.
 *
 * Idempotent either way: re-running replaces a source's chunks, never
 * duplicates them.
 */
async function main() {
  const direct = process.argv.includes("--direct") || !embeddingsQueue;

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

  const counts =
    `notes ${notes.length}, labs ${orders.length}, rx ${prescriptions.length}, ` +
    `records ${records.length}, kb ${articles.length}`;

  if (direct) {
    console.log(`[db:embed] Direct mode — embedding ${jobs.length} sources (${counts})`);
    let done = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        await embedSource(job.data.sourceType, job.data.sourceId);
        done += 1;
        // One line per source would bury the failures, so report periodically.
        if (done % 10 === 0) console.log(`[db:embed]   ${done}/${jobs.length}`);
      } catch (err) {
        failed += 1;
        // Keep going: one unembeddable source (empty text, provider hiccup)
        // must not abandon the rest of the backfill.
        console.warn(
          `[db:embed]   failed ${job.data.sourceType} ${job.data.sourceId}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    console.log(`[db:embed] Done — ${done} embedded, ${failed} failed.`);
    if (failed > 0) process.exitCode = 1;
    return;
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
    `[db:embed] Enqueued ${enqueued} sources (${counts}). ` +
      "The embeddings worker will process them.",
  );
}

main()
  .catch((err) => {
    console.error("[db:embed] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
