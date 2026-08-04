import { prisma } from "../apps/server/src/config/db.js";
import { getProvider } from "../apps/server/src/ai/index.js";
import { resolveRetrievalScope } from "../apps/server/src/ai/retrieval.js";

(async () => {
  const doctor = await prisma.doctor.findFirst({
    where: { user: { email: "sarah@medicore.com" } },
  });
  if (!doctor) throw new Error("no doctor");
  const scope = await resolveRetrievalScope({
    userId: doctor.userId,
    role: "DOCTOR",
  });
  console.log("doctor scope patientIds count:", scope.patientIds.length);
  const q = "patient with high blood sugar";
  const vectors = await getProvider().embed([q]);
  const vector = vectors[0];
  try {
    const rows = await prisma.$queryRaw`
      SELECT id, 1 - (embedding <=> ${vector}::vector) AS similarity
      FROM document_chunks
      WHERE "patientId" = ANY(${scope.patientIds}::text[]) AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${12}
    `;
    console.log("searchall OK rows:", rows.length);
  } catch (e) {
    console.log("searchall ERROR:", (e as Error).message.slice(0, 300));
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error("FATAL", e.message);
  process.exit(1);
});
