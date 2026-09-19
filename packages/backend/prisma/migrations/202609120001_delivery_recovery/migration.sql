ALTER TABLE "customers" ADD COLUMN "telegramBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "telegram_updates" ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "lockedAt" TIMESTAMPTZ(3),
  ADD COLUMN "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "telegram_updates_status_availableAt_idx" ON "telegram_updates" ("status", "availableAt");
