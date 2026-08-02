-- Gemini is gone. Jina's jina-embeddings-v5-text-small returns 1024-dim vectors.
-- The HNSW index is not modeled in Prisma (Unsupported column), so it must be
-- dropped and recreated around the resize. The table is empty, so the resize is
-- a no-op on data.

DROP INDEX "document_chunks_embedding_idx";

ALTER TABLE "document_chunks" ALTER COLUMN "embedding" TYPE vector(1024);

CREATE INDEX "document_chunks_embedding_idx"
  ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);
