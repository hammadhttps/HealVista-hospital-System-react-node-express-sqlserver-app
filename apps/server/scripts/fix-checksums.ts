import { prisma } from "../src/config/db.js";

async function main() {
  const del = await prisma.$executeRaw`
    DELETE FROM _prisma_migrations
    WHERE migration_name = '20260731143000_lab_order_relations' AND finished_at IS NULL`;
  console.log("deleted stale rows:", del);

  const rows = await prisma.$queryRaw<
    Array<{ migration_name: string; finished: boolean }>
  >`SELECT migration_name, finished_at IS NOT NULL AS finished FROM _prisma_migrations ORDER BY started_at`;
  for (const r of rows) console.log(r.migration_name, r.finished ? "OK" : "PENDING");
}

main().finally(() => prisma.$disconnect());
