import { prisma } from "../src/config/db.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";

async function main() {
  const rows = await prisma.$queryRaw<
    Array<{ migration_name: string; checksum: string | null; finished: boolean }>
  >`SELECT migration_name, checksum, finished_at IS NOT NULL AS finished FROM _prisma_migrations ORDER BY started_at`;

  const dir = path.resolve("prisma/migrations");
  for (const r of rows) {
    const file = path.join(dir, r.migration_name, "migration.sql");
    let computed = null;
    try {
      const content = fs.readFileSync(file, "utf8");
      computed = crypto.createHash("sha256").update(content).digest("hex");
    } catch {
      computed = "MISSING FILE";
    }
    const match = computed === r.checksum ? "MATCH" : "MISMATCH";
    console.log(`${r.migration_name} ${match} finished=${r.finished}`);
    if (match === "MISMATCH") {
      console.log(`  stored:   ${r.checksum}`);
      console.log(`  computed: ${computed}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
