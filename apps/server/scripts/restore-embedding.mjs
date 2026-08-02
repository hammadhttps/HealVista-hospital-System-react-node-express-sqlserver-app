import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import fs from "fs";
import path from "path";
const prisma = new PrismaClient();

const hasCol = await prisma.$queryRaw`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'document_chunks' AND column_name = 'embedding'`;
console.log("embedding column exists:", hasCol.length > 0);

if (hasCol.length === 0) {
  await prisma.$executeRawUnsafe("ALTER TABLE document_chunks ADD COLUMN embedding vector(1024)");
  await prisma.$executeRawUnsafe(
    "CREATE INDEX document_chunks_embedding_idx ON document_chunks USING hnsw (embedding vector_cosine_ops)",
  );
  console.log("restored embedding column + HNSW index");
}

// Re-record checksum for the edited migration so it matches the file on disk.
const migrationName = "20260801034300_phase6_search_2fa_audit_corrections";
const file = path.resolve("prisma/migrations", migrationName, "migration.sql");
const content = fs.readFileSync(file, "utf8");
const checksum = crypto.createHash("sha256").update(content).digest("hex");
await prisma.$executeRaw`
  UPDATE _prisma_migrations SET checksum = ${checksum}
  WHERE migration_name = ${migrationName}`;
console.log("updated checksum for", migrationName);

await prisma.$disconnect();
