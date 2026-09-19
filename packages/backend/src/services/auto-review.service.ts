import { prisma, atomic, settings, type Tx } from "../core.js";
import { isReceiptWithinAcceptanceWindow } from "@beshball/shared";
import { approveReceipt } from "./points.service.js";
import type { Staff } from "../auth/access.js";

/**
 * Chekni OCR natijasi asosida avtomatik tasdiqlaydi. Bu haqiqiy sotuvni
 * POS'da tekshirmaydi (ZimZim ulanmagan) - shuning uchun faqat OCR
 * natijasi ANIQ va ISHONCHLI bo'lgandagina ball avtomatik beriladi.
 * Kichik shubha bo'lsa ham operatorga yuboriladi - hech qachon "ehtimol
 * to'g'ri" asosida ball berilmaydi.
 */

// Haqiqiy Telegram foydalanuvchi ID'si hech qachon manfiy bo'lmaydi -
// shuning uchun bu qiymat real xodim bilan hech qachon to'qnashmaydi.
const AUTO_REVIEW_TELEGRAM_ID = -1n;

async function systemStaff(tx: Tx): Promise<Staff> {
  return tx.staffUser.upsert({
    where: { telegramUserId: AUTO_REVIEW_TELEGRAM_ID },
    update: {},
    create: {
      telegramUserId: AUTO_REVIEW_TELEGRAM_ID,
      fullName: "Avtomatik tizim (OCR)",
      role: "SUPER_ADMIN",
      active: true,
    },
    include: { branchAccess: true },
  }) as unknown as Staff;
}

async function flagForAdminReview(receiptId: string, reasons: string[]) {
  await atomic(async (tx) => {
    const r = await tx.receipt.findUniqueOrThrow({ where: { id: receiptId } });
    if (r.status !== "PENDING_REVIEW") return; // boshqa jarayon allaqachon o'zgartirgan
    const admins = await tx.staffUser.findMany({
      where: { role: { in: ["SUPER_ADMIN", "RECEIPT_REVIEWER"] }, active: true },
    });
    const amountText = r.ocrAmountSom
      ? `${r.ocrAmountSom.toLocaleString("uz-UZ")} so'm`
      : "aniqlanmadi";
    const text =
      `⚠️ Shubhali chek — qo'lda tekshiruv kerak\n` +
      `ID: ${r.id}\n` +
      `OCR summasi: ${amountText}\n` +
      `Ishonch: ${r.ocrConfidencePercent ?? 0}%\n` +
      `Sabab: ${reasons.join("; ")}`;
    for (const a of admins) {
      await tx.outbox.upsert({
        where: { key: `auto-flag:${r.id}:${a.id}` },
        update: {},
        create: {
          key: `auto-flag:${r.id}:${a.id}`,
          telegramId: String(a.telegramUserId),
          text,
        },
      });
    }
  });
}

export interface AutoApprovalConfig {
  autoApproveEnabled: number;
  autoApproveMinConfidence: number;
  autoApproveMinAmountSom: number;
  autoApproveMaxAmountSom: number;
  autoApproveMerchantNames: string[];
  receiptMinutes: number;
}

export interface AutoApprovalInput {
  ocrConfidencePercent: number | null;
  ocrAmountSom: number | null;
  ocrPurchasedAtMs: number | null;
  ocrRawText: string | null;
  firstReceivedAtMs: number;
  duplicateFlagCount: number;
  branchId: string | null;
  branchActive: boolean;
}

/**
 * Sof qaror funksiyasi - DB'siz test qilinadi. Bo'sh massiv qaytsa,
 * chekni avtomatik tasdiqlash mumkin; aks holda har bir element
 * operatorga ko'rsatiladigan aniq sababdir.
 */
export function evaluateAutoApproval(
  input: AutoApprovalInput,
  cfg: AutoApprovalConfig,
): string[] {
  const reasons: string[] = [];
  if (!cfg.autoApproveEnabled) reasons.push("Avtomatik tasdiqlash o'chirilgan");
  if ((input.ocrConfidencePercent ?? 0) < cfg.autoApproveMinConfidence)
    reasons.push(`OCR ishonchi past (${input.ocrConfidencePercent ?? 0}%)`);
  if (
    !input.ocrAmountSom ||
    input.ocrAmountSom < cfg.autoApproveMinAmountSom ||
    input.ocrAmountSom > cfg.autoApproveMaxAmountSom
  )
    reasons.push("Summa aniq o'qilmadi yoki ruxsat etilgan chegaradan tashqarida");
  if (!input.ocrPurchasedAtMs) reasons.push("Xarid sanasi/vaqti o'qilmadi");
  else if (
    !isReceiptWithinAcceptanceWindow(
      input.firstReceivedAtMs,
      input.ocrPurchasedAtMs,
      cfg.receiptMinutes,
    )
  )
    reasons.push("Chek vaqti qabul oynasidan tashqarida");
  if (input.duplicateFlagCount > 0)
    reasons.push("Boshqa chekka o'xshash rasm topildi");
  const merchantNames = cfg.autoApproveMerchantNames;
  if (
    merchantNames.length > 0 &&
    !merchantNames.some((name) =>
      (input.ocrRawText ?? "").toUpperCase().includes(name.toUpperCase()),
    )
  )
    reasons.push("Do'kon nomi tanilmadi");
  if (!input.branchId) reasons.push("Filial belgilanmagan");
  else if (!input.branchActive) reasons.push("Filial faol emas");
  return reasons;
}

export async function autoReview(receiptId: string) {
  const r = await prisma.receipt.findUniqueOrThrow({ where: { id: receiptId } });
  if (r.status !== "PENDING_REVIEW") return { autoApproved: false, reasons: [] };

  const cfg = await settings();
  const branch = r.branchId
    ? await prisma.branch.findUnique({ where: { id: r.branchId } })
    : null;
  const reasons = evaluateAutoApproval(
    {
      ocrConfidencePercent: r.ocrConfidencePercent,
      ocrAmountSom: r.ocrAmountSom,
      ocrPurchasedAtMs: r.ocrPurchasedAt?.getTime() ?? null,
      ocrRawText: r.ocrRawText,
      firstReceivedAtMs: r.firstReceivedAt.getTime(),
      duplicateFlagCount: ((r.duplicateFlags as unknown[]) ?? []).length,
      branchId: r.branchId,
      branchActive: branch?.active ?? false,
    },
    cfg,
  );

  if (reasons.length === 0) {
    try {
      const sys = await atomic((tx) => systemStaff(tx));
      await approveReceipt(
        receiptId,
        {
          purchaseSom: r.ocrAmountSom!,
          purchasedAt: r.ocrPurchasedAt!.toISOString(),
          branchId: r.branchId!,
          tillId: "OCR-AUTO",
          externalSaleId: `ocr-auto-${receiptId}`,
          reason: `Avtomatik tasdiqlandi (OCR ishonchi ${r.ocrConfidencePercent}%)`,
          saleVerified: true,
          paid: true,
          refunded: false,
          isDiscountedSet: false,
          bonusEligible: true,
          idempotencyKey: `auto-${receiptId}`,
        },
        sys,
      );
      return { autoApproved: true, reasons: [] };
    } catch (e) {
      reasons.push(
        `Avtomatik tasdiqlashda xato: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  await flagForAdminReview(receiptId, reasons);
  return { autoApproved: false, reasons };
}
