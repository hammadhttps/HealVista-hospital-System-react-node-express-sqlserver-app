import { Worker } from "bullmq";
import PDFDocument from "pdfkit";
import { redis } from "../config/redis.js";
import { complianceQueue } from "../config/bull.js";
import { prisma } from "../config/db.js";
import cloudinary from "../config/cloudinary.js";
import { logger } from "../utils/logger.js";
import { anonymiseAccount } from "../services/compliance.service.js";
import { buildExportPayload } from "../services/dataExport.service.js";

/**
 * Compliance worker (Phase 6.4).
 *
 * Two jobs:
 *  - `export`  — builds a subject's full data export and attaches a signed,
 *                time-limited URL to their `DataExportRequest`.
 *  - `anonymise` — runs once a deletion request's grace period has expired.
 *
 * Export runs here rather than in the request because assembling a full history
 * across a dozen tables and rendering a PDF is far too slow to hold a request
 * open, and the archive must never be built twice for one click.
 */

/** How long a generated export stays downloadable. */
const EXPORT_TTL_SECONDS = 7 * 24 * 60 * 60;

export function startComplianceWorker(): Worker | null {
  if (!redis) {
    logger.warn("[compliance-worker] Redis not available, worker disabled");
    return null;
  }

  const worker = new Worker(
    "compliance",
    async (job) => {
      if (job.name === "export") {
        await runExport(job.data.requestId as string);
      } else if (job.name === "anonymise") {
        await runAnonymise(job.data.userId as string);
      }
    },
    { connection: redis },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, name: job.name }, "[compliance-worker] Completed");
  });

  worker.on("failed", async (job, err) => {
    logger.error({ jobId: job?.id, name: job?.name, err }, "[compliance-worker] Failed");
    // Surface the failure to the subject rather than leaving them watching a
    // spinner forever. Only once retries are exhausted.
    if (job?.name === "export" && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await prisma.dataExportRequest
        .update({ where: { id: job.data.requestId }, data: { status: "failed" } })
        .catch(() => undefined);
    }
  });

  return worker;
}

async function runExport(requestId: string): Promise<void> {
  const request = await prisma.dataExportRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status === "ready") return;

  await prisma.dataExportRequest.update({
    where: { id: requestId },
    data: { status: "processing" },
  });

  const payload = await buildExportPayload(request.userId);
  const pdf = await renderExportPdf(payload);

  const publicId = `exports/${request.userId}/${requestId}`;

  // `type: authenticated` keeps the archive unreachable without a signature, so
  // a leaked id is not a leaked medical history.
  const uploaded = await new Promise<{ public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, type: "authenticated", resource_type: "raw", overwrite: true },
      (error, result) => (error || !result ? reject(error) : resolve(result)),
    );
    stream.end(pdf);
  });

  const expiresAt = new Date(Date.now() + EXPORT_TTL_SECONDS * 1000);
  const fileUrl = cloudinary.url(uploaded.public_id, {
    type: "authenticated",
    resource_type: "raw",
    sign_url: true,
    secure: true,
    expires_at: Math.floor(expiresAt.getTime() / 1000),
  });

  await prisma.dataExportRequest.update({
    where: { id: requestId },
    data: { status: "ready", fileUrl, expiresAt },
  });
}

async function runAnonymise(userId: string): Promise<void> {
  const request = await prisma.accountDeletionRequest.findUnique({ where: { userId } });
  // Cancelled during the grace period, or already done — either way, nothing to do.
  if (!request || request.cancelledAt || request.completedAt) return;
  if (request.scheduledFor > new Date()) return;

  await anonymiseAccount(userId);
}

/** Renders the JSON payload into the human-readable half of the export. */
function renderExportPdf(payload: Awaited<ReturnType<typeof buildExportPayload>>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Personal data export", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Generated ${new Date().toISOString()}`, { align: "center" });
    doc.moveDown(1.5);

    for (const [section, rows] of Object.entries(payload.sections)) {
      doc.fontSize(13).text(section);
      doc.moveDown(0.2);
      doc.fontSize(9);
      if (rows.length === 0) {
        doc.text("  (none)");
      } else {
        for (const row of rows) {
          doc.text(`  ${JSON.stringify(row)}`, { width: 500 });
        }
      }
      doc.moveDown(0.8);
    }

    // The machine-readable half, so the export is portable and not just printable.
    doc.addPage();
    doc.fontSize(13).text("Machine-readable (JSON)");
    doc.moveDown(0.4);
    doc.fontSize(7).text(JSON.stringify(payload, null, 2), { width: 500 });

    doc.end();
  });
}

/** Enqueues an export build. No-op without Redis, leaving the request pending. */
export async function enqueueExport(requestId: string): Promise<void> {
  if (!complianceQueue) return;
  await complianceQueue.add("export", { requestId });
}

/** Schedules anonymisation to fire when the grace period expires. */
export async function enqueueAnonymise(userId: string, scheduledFor: Date): Promise<void> {
  if (!complianceQueue) return;
  await complianceQueue.add(
    "anonymise",
    { userId },
    { delay: Math.max(0, scheduledFor.getTime() - Date.now()), jobId: `anonymise:${userId}` },
  );
}
