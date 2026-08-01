-- Chat: real activity timestamp + the indexes the thread list and unread
-- badges actually read.
--
-- NOTE: Prisma's diff wanted to `DROP INDEX "document_chunks_embedding_idx"`
-- here. That is the pgvector HNSW index from Phase 5, created in raw SQL because
-- Prisma cannot express vector index types — it is invisible to the schema, so
-- every subsequent diff proposes dropping it. The drop has been removed
-- deliberately; letting it through would silently turn every RAG retrieval into
-- a sequential scan over the whole embedding table.

-- AlterTable
ALTER TABLE "chat_threads" ADD COLUMN     "lastMessageAt" TIMESTAMP(3);

-- Backfill: existing threads carry their newest message time, so the thread list
-- does not order every pre-existing conversation last on the day this ships.
-- Threads with no messages fall back to their creation time.
UPDATE "chat_threads" t
SET "lastMessageAt" = COALESCE(
  (SELECT MAX(m."sentAt") FROM "chat_messages" m WHERE m."threadId" = t.id),
  t."createdAt"
);

-- CreateIndex
CREATE INDEX "chat_messages_threadId_readAt_idx" ON "chat_messages"("threadId", "readAt");

-- CreateIndex
CREATE INDEX "chat_messages_senderUserId_idx" ON "chat_messages"("senderUserId");

-- CreateIndex
CREATE INDEX "chat_threads_lastMessageAt_idx" ON "chat_threads"("lastMessageAt");
