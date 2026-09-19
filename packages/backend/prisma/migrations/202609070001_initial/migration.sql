-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'MANAGER', 'RECEIPT_REVIEWER', 'CASHIER');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('RECEIVED', 'READING', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('PURCHASE_BASE', 'PURCHASE_BONUS', 'REFERRAL_BONUS', 'REDEMPTION', 'REDEMPTION_REVERSAL', 'MANUAL_ADJUSTMENT', 'RECEIPT_REVERSAL', 'EXPIRY');

-- CreateEnum
CREATE TYPE "PosAdapterStatusEnum" AS ENUM ('NOT_CONFIGURED', 'CONFIGURED_MANUAL_ONLY', 'CONFIGURED_LIVE');

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "telegramUserId" BIGINT NOT NULL,
    "phoneE164" TEXT,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "fullName" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'uz',
    "birthDate" TIMESTAMPTZ(3),
    "dataConsentAt" TIMESTAMPTZ(3),
    "marketingConsentAt" TIMESTAMPTZ(3),
    "marketingUnsubscribed" BOOLEAN NOT NULL DEFAULT false,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" TEXT,
    "riskHold" BOOLEAN NOT NULL DEFAULT false,
    "deletionRequestedAt" TIMESTAMPTZ(3),
    "referredByCustomerId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_users" (
    "id" TEXT NOT NULL,
    "telegramUserId" BIGINT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_branch_access" (
    "id" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "staff_branch_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "branchId" TEXT,
    "imageStorageKey" TEXT NOT NULL,
    "imageHash" TEXT NOT NULL,
    "perceptualHash" TEXT,
    "duplicateFlags" JSONB,
    "manualVerificationNote" TEXT,
    "isDiscountedSet" BOOLEAN NOT NULL DEFAULT false,
    "bonusEligible" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'RECEIVED',
    "ocrEngine" TEXT,
    "ocrConfidencePercent" INTEGER,
    "ocrRawText" TEXT,
    "ocrExternalReceiptId" TEXT,
    "ocrPurchasedAt" TIMESTAMPTZ(3),
    "ocrAmountSom" INTEGER,
    "confirmedAmountSom" INTEGER,
    "confirmedPurchasedAt" TIMESTAMPTZ(3),
    "externalSaleId" TEXT,
    "tillId" TEXT,
    "firstReceivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByStaffId" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "rejectionReason" TEXT,
    "appliedCampaignKind" TEXT,
    "appliedCampaignPercent" INTEGER,
    "offPeakMultiplierApplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "unitsDelta" INTEGER NOT NULL,
    "relatedReceiptId" TEXT,
    "relatedReservationId" TEXT,
    "operationKey" TEXT,
    "reasonNote" TEXT,
    "createdByStaffId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gifts" (
    "id" TEXT NOT NULL,
    "nameUz" TEXT NOT NULL,
    "nameRu" TEXT,
    "descriptionUz" TEXT,
    "descriptionRu" TEXT,
    "imageUrl" TEXT,
    "priceBalls" INTEGER NOT NULL,
    "menuPriceSom" INTEGER NOT NULL,
    "realCostSom" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "temporarilyUnavailable" BOOLEAN NOT NULL DEFAULT false,
    "dailyLimit" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "gifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_branches" (
    "id" TEXT NOT NULL,
    "giftId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "gift_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_reservations" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "giftId" TEXT NOT NULL,
    "priceBallsAtReserve" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "qrTokenHash" TEXT NOT NULL,
    "backupCode" TEXT NOT NULL,
    "backupCodeAttempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "redeemedAt" TIMESTAMPTZ(3),
    "redeemedByCashierId" TEXT,
    "branchId" TEXT,
    "menuPriceSomAtReserve" INTEGER NOT NULL DEFAULT 0,
    "realCostSomAtReserve" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "nameUz" TEXT NOT NULL,
    "bonusPercent" INTEGER,
    "multiplierNum" INTEGER,
    "multiplierDen" INTEGER,
    "minAmountSom" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "audienceNote" TEXT,
    "budgetSom" INTEGER,
    "usageLimitTotal" INTEGER,
    "usageLimitPerCustomer" INTEGER,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" TEXT NOT NULL,
    "titleInternal" TEXT NOT NULL,
    "bodyUz" TEXT NOT NULL,
    "bodyRu" TEXT,
    "imageUrl" TEXT,
    "buttonLabel" TEXT,
    "buttonUrl" TEXT,
    "onlyConsented" BOOLEAN NOT NULL DEFAULT true,
    "scheduledAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "audienceBranchId" TEXT,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_recipient_logs" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "deliveryError" TEXT,
    "buttonClickedAt" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptedAt" TIMESTAMPTZ(3),

    CONSTRAINT "broadcast_recipient_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_adapter_config" (
    "id" TEXT NOT NULL,
    "providerName" TEXT NOT NULL DEFAULT 'zimzim',
    "status" "PosAdapterStatusEnum" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "notes" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pos_adapter_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "staffUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "requestHash" TEXT,
    "response" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "campaign_usage" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "costSom" INTEGER NOT NULL,
    "referrerCustomerId" TEXT,
    "reversed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_lots" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "receiptId" TEXT,
    "ledgerId" TEXT NOT NULL,
    "remaining" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "remindedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "customerId" TEXT,
    "telegramId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "imageUrl" TEXT,
    "buttonLabel" TEXT,
    "buttonUrl" TEXT,
    "broadcastId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_updates" (
    "id" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_sessions" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bot_sessions_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_telegramUserId_key" ON "customers"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phoneE164_key" ON "customers"("phoneE164");

-- CreateIndex
CREATE INDEX "customers_phoneE164_idx" ON "customers"("phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_telegramUserId_key" ON "staff_users"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_branch_access_staffUserId_branchId_key" ON "staff_branch_access"("staffUserId", "branchId");

-- CreateIndex
CREATE INDEX "receipts_imageHash_idx" ON "receipts"("imageHash");

-- CreateIndex
CREATE INDEX "receipts_customerId_status_idx" ON "receipts"("customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_branchId_tillId_externalSaleId_key" ON "receipts"("branchId", "tillId", "externalSaleId");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_imageHash_key" ON "receipts"("imageHash");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_operationKey_key" ON "ledger_entries"("operationKey");

-- CreateIndex
CREATE INDEX "ledger_entries_customerId_createdAt_idx" ON "ledger_entries"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "gift_branches_giftId_branchId_key" ON "gift_branches"("giftId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "gift_reservations_qrTokenHash_key" ON "gift_reservations"("qrTokenHash");

-- CreateIndex
CREATE INDEX "gift_reservations_customerId_status_idx" ON "gift_reservations"("customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "broadcast_recipient_logs_broadcastId_customerId_key" ON "broadcast_recipient_logs"("broadcastId", "customerId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "campaign_usage_campaignId_customerId_idx" ON "campaign_usage"("campaignId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_usage_campaignId_receiptId_key" ON "campaign_usage"("campaignId", "receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "point_lots_ledgerId_key" ON "point_lots"("ledgerId");

-- CreateIndex
CREATE INDEX "point_lots_customerId_expiresAt_idx" ON "point_lots"("customerId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_key_key" ON "outbox"("key");

-- CreateIndex
CREATE INDEX "outbox_status_availableAt_idx" ON "outbox"("status", "availableAt");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_referredByCustomerId_fkey" FOREIGN KEY ("referredByCustomerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_branch_access" ADD CONSTRAINT "staff_branch_access_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_branch_access" ADD CONSTRAINT "staff_branch_access_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_reviewedByStaffId_fkey" FOREIGN KEY ("reviewedByStaffId") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_relatedReceiptId_fkey" FOREIGN KEY ("relatedReceiptId") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_relatedReservationId_fkey" FOREIGN KEY ("relatedReservationId") REFERENCES "gift_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_branches" ADD CONSTRAINT "gift_branches_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "gifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_branches" ADD CONSTRAINT "gift_branches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_reservations" ADD CONSTRAINT "gift_reservations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_reservations" ADD CONSTRAINT "gift_reservations_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "gifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_reservations" ADD CONSTRAINT "gift_reservations_redeemedByCashierId_fkey" FOREIGN KEY ("redeemedByCashierId") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_recipient_logs" ADD CONSTRAINT "broadcast_recipient_logs_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "broadcasts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_recipient_logs" ADD CONSTRAINT "broadcast_recipient_logs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
