import type { UserRole } from "@beshball/shared";

/**
 * Har bir endpoint uchun ruxsat berilgan rollar shu yerda markazlashtiriladi.
 * MUHIM: bu tekshiruv FAQAT backendda ishlaydi. Frontend/Mini App faqat
 * UI ni yashiradi - haqiqiy ruxsat har doim shu funksiya orqali server
 * tomonida tasdiqlanadi (10-band talabi).
 */
export function assertRole(actualRole: UserRole, allowed: UserRole[]): void {
  if (!allowed.includes(actualRole)) {
    const err = new Error(
      `Ruxsat yo'q: ${actualRole} roli uchun bu amal taqiqlangan`,
    );
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }
}

/**
 * Xodimning filialga ruxsati bor-yo'qligini tekshiradi. SUPER_ADMIN
 * barcha filiallarga kirishi mumkin, qolganlar faqat staffBranchAccess
 * jadvalida ro'yxatdan o'tgan filiallarga.
 */
export function assertBranchAccess(
  role: UserRole,
  accessibleBranchIds: string[],
  targetBranchId: string,
): void {
  if (role === "SUPER_ADMIN") return;
  if (!accessibleBranchIds.includes(targetBranchId)) {
    const err = new Error("Bu filialga ruxsatingiz yo'q");
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }
}

export const ROLE_PERMISSIONS = {
  manageStaff: ["SUPER_ADMIN"] as UserRole[],
  manageCampaigns: ["SUPER_ADMIN", "MANAGER"] as UserRole[],
  manageGifts: ["SUPER_ADMIN", "MANAGER"] as UserRole[],
  reviewReceipts: ["SUPER_ADMIN", "MANAGER", "RECEIPT_REVIEWER"] as UserRole[],
  redeemGift: ["SUPER_ADMIN", "MANAGER", "CASHIER"] as UserRole[],
  manualBalanceAdjustment: ["SUPER_ADMIN"] as UserRole[],
  viewAuditLog: ["SUPER_ADMIN"] as UserRole[],
  sendBroadcast: ["SUPER_ADMIN", "MANAGER"] as UserRole[],
};
