import { createRequire } from "node:module";
const require = createRequire(
  new URL("../packages/backend/package.json", import.meta.url),
);
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
// Supabase's public Data API must never bypass the application's Telegram auth.
// Enable deny-by-default RLS only on BeshBall tables. The owning server role retains access.
const tables = [
  "branches",
  "customers",
  "staff_users",
  "staff_branch_access",
  "receipts",
  "ledger_entries",
  "gifts",
  "gift_branches",
  "gift_reservations",
  "campaigns",
  "broadcasts",
  "broadcast_recipient_logs",
  "feedback",
  "pos_adapter_config",
  "audit_logs",
  "app_settings",
  "idempotency_keys",
  "campaign_usage",
  "point_lots",
  "outbox",
  "telegram_updates",
  "bot_sessions",
];
try {
  // One atomic server-side statement avoids a network round trip per table.
  await prisma.$executeRawUnsafe(
    `DO $$ BEGIN ${tables.map((table) => `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`).join(" ")} END $$;`,
  );
  console.log("BeshBall database RLS enabled.");
} finally {
  await prisma.$disconnect();
}
