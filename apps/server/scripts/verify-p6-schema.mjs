import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const indexes = await prisma.$queryRaw`
  SELECT indexname FROM pg_indexes
  WHERE indexname IN ('patients_search_idx','doctors_search_idx','medicines_search_idx',
    'bills_search_idx','lab_orders_search_idx','appointments_search_idx','document_chunks_embedding_idx')
  ORDER BY indexname`;
console.log("search/embedding indexes present:");
for (const i of indexes) console.log("  -", i.indexname);

const tables = await prisma.$queryRaw`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN ('search_history','saved_searches','two_factor_recovery_codes')
  ORDER BY table_name`;
console.log("new tables present:");
for (const t of tables) console.log("  -", t.table_name);

const col = await prisma.$queryRaw`
  SELECT column_name FROM information_schema.columns
  WHERE table_name='audit_logs' AND column_name='correctionOfId'`;
console.log("audit_logs.correctionOfId:", col.length > 0 ? "present" : "MISSING");

await prisma.$disconnect();
