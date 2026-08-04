import { prisma } from "../src/config/db.js";
import { getProvider } from "../src/ai/index.js";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

(async () => {
  const q = "test single chunk";
  const vectors = await getProvider().embed([q]);
  console.log("vector type:", Array.isArray(vectors[0]), "dims:", vectors[0].length);

  // Single-value insert
  try {
    const values = Prisma.sql`(
      ${randomUUID()}, 'consultation_note', 'test-source-1', null, null, 0, ${q}, 10, ${vectors[0]}::vector
    )`;
    await prisma.$executeRaw`
      INSERT INTO document_chunks (id, "sourceType", "sourceId", "patientId", "departmentId", "chunkIndex", content, "tokenCount", embedding)
      VALUES ${values}
    `;
    console.log("single insert OK");
  } catch (e) {
    console.log("single insert ERROR:", (e as Error).message.slice(0, 220));
  } finally {
    await prisma.documentChunk.deleteMany({ where: { sourceId: "test-source-1" } });
  }

  // Multi-value via Prisma.join
  try {
    const vecs = await getProvider().embed(["chunk a", "chunk b"]);
    const values = vecs.map(
      (v, i) => Prisma.sql`(
        ${randomUUID()}, 'consultation_note', 'test-source-2', null, null, ${i}, 'chunk ${i}', 10, ${v}::vector
      )`,
    );
    await prisma.$executeRaw`
      INSERT INTO document_chunks (id, "sourceType", "sourceId", "patientId", "departmentId", "chunkIndex", content, "tokenCount", embedding)
      VALUES ${Prisma.join(values, ",")}
    `;
    console.log("multi insert OK");
  } catch (e) {
    console.log("multi insert ERROR:", (e as Error).message.slice(0, 220));
  } finally {
    await prisma.documentChunk.deleteMany({ where: { sourceId: "test-source-2" } });
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error("FATAL", e.message);
  process.exit(1);
});
