import type { FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";
import { prisma, requireThat, secureEqual } from "../core.js";
import { env } from "../config.js";
import { verifyTelegramInitData } from "./telegram-init-data.js";
export async function staff(req: FastifyRequest, roles: UserRole[]) {
  let user;
  try {
    user = verifyTelegramInitData(
      String(req.headers["x-telegram-init-data"] ?? ""),
      env.botToken,
    ).user;
  } catch {
    throw Object.assign(new Error("Telegram orqali qayta oching"), {
      statusCode: 401,
    });
  }
  const s = await prisma.staffUser.findUnique({
    where: { telegramUserId: BigInt(user.id) },
    include: { branchAccess: true },
  });
  requireThat(s?.active, "Xodimga ruxsat yo‘q", 403);
  requireThat(roles.includes(s.role), "Bu amalga ruxsat yo‘q", 403);
  return s;
}
export type Staff = Awaited<ReturnType<typeof staff>>;
export function branchAccess(s: Staff, branchId: string | null) {
  requireThat(
    s.role === "SUPER_ADMIN" ||
      (branchId && s.branchAccess.some((b) => b.branchId === branchId)),
    "Bu filialga ruxsat yo‘q",
    403,
  );
}
export function branchFilter(s: Staff) {
  return s.role === "SUPER_ADMIN"
    ? {}
    : { branchId: { in: s.branchAccess.map((b) => b.branchId) } };
}
export function botAuth(req: FastifyRequest) {
  requireThat(
    env.botSecret.length >= 32 &&
      secureEqual(String(req.headers["x-bot-secret"] ?? ""), env.botSecret),
    "Bot autentifikatsiyasi kerak",
    401,
  );
}
export async function customerAuth(req: FastifyRequest, customerId: string) {
  botAuth(req);
  const c = await prisma.customer.findUnique({ where: { id: customerId } });
  requireThat(c, "Mijoz topilmadi", 404);
  requireThat(
    String(c.telegramUserId) === String(req.headers["x-telegram-user-id"]),
    "Mijozga ruxsat yo‘q",
    403,
  );
  return c;
}
export const allRoles: UserRole[] = [
  "SUPER_ADMIN",
  "MANAGER",
  "RECEIPT_REVIEWER",
  "CASHIER",
];
export const managers: UserRole[] = ["SUPER_ADMIN", "MANAGER"];
export const reviewers: UserRole[] = [
  "SUPER_ADMIN",
  "MANAGER",
  "RECEIPT_REVIEWER",
];
export const cashiers: UserRole[] = ["SUPER_ADMIN", "MANAGER", "CASHIER"];
