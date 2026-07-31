import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import { prisma } from "../config/db.js";
import { signDeliveryUrl } from "../services/record.service.js";
import { writeAuditLog } from "../utils/audit.js";
import { logger } from "../utils/logger.js";

/**
 * Record text extraction worker.
 *
 * Runs after an upload: downloads the PDF behind its authenticated Cloudinary
 * delivery URL, extracts the text with pdfjs-dist, and stores it in
 * `MedicalRecord.extractedText`. Phase 5 retrieves those chunks for RAG over a
 * patient's documents, so this is where the searchable plain text is born.
 *
 * Best-effort by design — a scan that fails (unreadable PDF, transient download
 * error) leaves `extractedText` null and logs rather than blocking the upload that
 * triggered it. BullMQ retries the job three times before giving up.
 */
const MAX_EXTRACTED_CHARS = 100_000;

async function extractPdfText(publicId: string): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const signedUrl = signDeliveryUrl(publicId, "pdf");
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`Failed to download record (HTTP ${res.status})`);

  const task = getDocument({
    data: new Uint8Array(await res.arrayBuffer()),
    disableWorker: true,
    disableFontFace: true,
  });
  const pdf = await task.promise;

  let text = "";
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n";
  }

  return text.slice(0, MAX_EXTRACTED_CHARS);
}

export function startRecordWorker(): Worker | null {
  if (!redis) {
    logger.warn("[record-worker] Redis not available, worker disabled");
    return null;
  }

  const worker = new Worker(
    "record-extraction",
    async (job) => {
      const { recordId } = job.data as { recordId: string };

      const record = await prisma.medicalRecord.findUnique({ where: { id: recordId } });
      if (!record || record.deletedAt) {
        logger.warn({ recordId }, "[record-worker] Record not found or deleted");
        return;
      }
      if (record.extractedText) {
        logger.info({ recordId }, "[record-worker] Text already extracted, skipping");
        return;
      }
      if (record.fileType !== "pdf") {
        logger.info({ recordId, fileType: record.fileType }, "[record-worker] Not a PDF, skipping");
        return;
      }

      const text = await extractPdfText(record.fileUrl);
      if (!text.trim()) {
        logger.info({ recordId }, "[record-worker] No text extracted from PDF");
        return;
      }

      await prisma.medicalRecord.update({
        where: { id: recordId },
        data: { extractedText: text },
      });

      // The uploader is the actor for the audit trail; a record with no uploader
      // (seeded data) simply skips the audit row rather than inventing one.
      if (record.uploadedById) {
        await writeAuditLog({
          actorUserId: record.uploadedById,
          action: "MEDICAL_RECORD_TEXT_EXTRACTED",
          targetType: "medical_record",
          targetId: recordId,
          metadata: { patientId: record.patientId, chars: text.length },
        });
      }

      logger.info({ recordId, chars: text.length }, "[record-worker] Text extracted");
    },
    { connection: redis },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "[record-worker] Completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[record-worker] Failed");
  });

  return worker;
}
