/**
 * Telegram Mini App initData haqiqiyligini tekshirish.
 * Rasmiy algoritm: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Faqat Node.js "crypto" moduli ishlatiladi - tashqi paket kerak emas,
 * shuning uchun bu fayl internetsiz muhitda ham to'g'ridan-to'g'ri
 * tekshirilishi mumkin.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramInitDataUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface VerifiedInitData {
  user: TelegramInitDataUser;
  authDateUnix: number;
  queryId?: string;
}

export class InitDataVerificationError extends Error {}

/**
 * @param initDataRaw Telegram.WebApp.initData qatoridan olingan xom qiymat
 * @param botToken Bot tokeni (.env dan, hech qachon logga chiqarilmaydi)
 * @param maxAgeSeconds initData qancha "eski" bo'lishi mumkinligi (soxta/eskirgan holatlarni bloklash uchun)
 */
export function verifyTelegramInitData(
  initDataRaw: string,
  botToken: string,
  maxAgeSeconds = 3600,
): VerifiedInitData {
  const params = new URLSearchParams(initDataRaw);
  if (!botToken || new Set(params.keys()).size !== [...params.keys()].length)
    throw new InitDataVerificationError("Noto‘g‘ri initData");
  const hash = params.get("hash");
  if (!hash) {
    throw new InitDataVerificationError("hash maydoni yo'q");
  }
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const computedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (
    !/^[a-f0-9]{64}$/.test(hash) ||
    !timingSafeEqual(Buffer.from(computedHash), Buffer.from(hash))
  ) {
    throw new InitDataVerificationError(
      "Imzo mos kelmadi - initData soxta bo'lishi mumkin",
    );
  }

  const authDateStr = params.get("auth_date");
  if (!authDateStr) {
    throw new InitDataVerificationError("auth_date yo'q");
  }
  const authDateUnix = Number(authDateStr);
  const nowUnix = Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(authDateUnix) ||
    authDateUnix > nowUnix + 30 ||
    nowUnix - authDateUnix > maxAgeSeconds
  ) {
    throw new InitDataVerificationError(
      "initData eskirgan (soxta/qayta ishlatilgan bo'lishi mumkin)",
    );
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new InitDataVerificationError("user maydoni yo'q");
  }
  let user: TelegramInitDataUser;
  try {
    user = JSON.parse(userRaw);
  } catch {
    throw new InitDataVerificationError("user maydoni JSON emas");
  }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new InitDataVerificationError("user.id noto'g'ri");
  }

  return {
    user,
    authDateUnix,
    queryId: params.get("query_id") ?? undefined,
  };
}
