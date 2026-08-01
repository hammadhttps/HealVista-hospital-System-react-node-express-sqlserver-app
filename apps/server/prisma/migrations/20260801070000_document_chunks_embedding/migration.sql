-- Enable pgvector (idempotent — already enabled per docs/setup/neon-postgres.md)
CREATE EXTENSION IF NOT EXISTS vector;

-- The embedding column lives on document_chunks, the dedicated vector store
-- (docs/architecture/ai-rag.md §2). Keeping it out of the domain tables means
-- re-embedding never rewrites clinical rows.
ALTER TABLE document_chunks ADD COLUMN embedding vector(768);

-- HNSW over IVFFlat: better recall, no training step, fine at this data volume.
CREATE INDEX document_chunks_embedding_idx
  ON document_chunks USING hnsw (embedding vector_cosine_ops);
