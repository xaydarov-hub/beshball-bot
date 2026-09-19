import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../packages/backend/package.json", import.meta.url),
);
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
try {
  const directory = "packages/backend/prisma/migrations";
  const expected = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      checksums: (() => {
        const sql = fs
          .readFileSync(
            path.join(directory, entry.name, "migration.sql"),
            "utf8",
          )
          .replaceAll("\r\n", "\n");
        return [sql, sql.replaceAll("\n", "\r\n")].map((text) =>
          createHash("sha256").update(text).digest("hex"),
        );
      })(),
    }));
  const applied =
    await prisma.$queryRaw`SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  const migrationsReady = expected.every((entry) =>
    applied.some(
      (row) =>
        row.migration_name === entry.name &&
        entry.checksums.includes(row.checksum),
    ),
  );
  if (!migrationsReady) process.exitCode = 2;
  else {
    const [ready] = await prisma.$queryRaw`
      SELECT EXISTS(SELECT 1 FROM app_settings WHERE key = 'business') AS seeded,
        NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind='r' AND c.relname <> '_prisma_migrations' AND NOT c.relrowsecurity) AS secured
    `;
    process.exitCode = ready.seeded && ready.secured ? 0 : 2;
  }
  console.log(
    process.exitCode === 0
      ? "Database ready; skipping repeated bootstrap."
      : "Database bootstrap required.",
  );
} catch (error) {
  if (error.meta?.code === "42P01") process.exitCode = 2;
  else {
    console.error(
      "Database readiness check failed:",
      error.code ?? "connection error",
    );
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
