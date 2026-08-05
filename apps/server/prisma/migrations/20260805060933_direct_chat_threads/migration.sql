-- Direct patient↔doctor chat threads (chat.service createOrGetDirectThread).
--
-- ChatThread previously existed only as the child of an appointment. Patients
-- can now start a conversation with any doctor, so a thread keeps its optional
-- appointment link (appointment threads still show the appointment number) and
-- additionally carries patientId/doctorId. Every thread gets both sides set —
-- appointment threads too — so participation checks never branch on "which kind".
--
-- NOTE: Prisma's diff proposed dropping "document_chunks_embedding_idx", the
-- Phase 5 pgvector HNSW index. It is created in raw SQL because Prisma cannot
-- express vector index types, so it is invisible to the schema and every future
-- diff keeps proposing this. The drop has been removed deliberately — letting
-- it through turns every RAG retrieval into a sequential scan.

-- AlterTable
ALTER TABLE "chat_threads" ADD COLUMN     "doctorId" TEXT,
ADD COLUMN     "patientId" TEXT,
ALTER COLUMN "appointmentId" DROP NOT NULL;

-- Backfill existing appointment threads so every row has both participants.
UPDATE "chat_threads" ct
SET "patientId" = a."patientId", "doctorId" = a."doctorId"
FROM "appointments" a
WHERE ct."appointmentId" = a."id";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_threads_patientId_doctorId_idx" ON "chat_threads"("patientId", "doctorId");

-- One direct thread per patient–doctor pair. Prisma has no partial index
-- syntax, so the uniqueness is enforced here: appointment threads (which may
-- legitimately repeat a pair across visits) are excluded by the WHERE clause.
CREATE UNIQUE INDEX "chat_threads_direct_unique"
  ON "chat_threads"("patientId", "doctorId")
  WHERE "appointmentId" IS NULL;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
