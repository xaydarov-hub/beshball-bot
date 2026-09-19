// Umumiy tiplar - backend, bot va admin orasida bo'lishiladi.

export type Locale = "uz" | "ru";

export type UserRole =
  | "SUPER_ADMIN"
  | "MANAGER"
  | "RECEIPT_REVIEWER"
  | "CASHIER";

export type ReceiptStatus =
  | "RECEIVED"
  | "READING"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "REVERSED";

export type ReservationStatus = "ACTIVE" | "REDEEMED" | "EXPIRED" | "CANCELLED";

export interface CustomerBalance {
  /** to'liq foydalanish mumkin bo'lgan ball (band qilinmagan) */
  availableBalls: number;
  /** vaqtincha band qilingan ball (faol rezervlar) */
  reservedBalls: number;
  /** keyingi ballgacha progress, foizda (0-99) */
  nextBallProgressPercent: number;
  /** keyingi ballgacha qolgan progress, birlikda */
  nextBallProgressUnits: number;
}

export interface MoneyAmountSom {
  amountSom: number; // butun so'm, tiyin yo'q
}

export interface GiftCatalogItem {
  id: string;
  nameUz: string;
  nameRu?: string;
  descriptionUz?: string;
  imageUrl?: string;
  priceBalls: number;
  menuPriceSom: number;
  realCostSom?: number | null; // kiritilmagan bo'lishi mumkin
  active: boolean;
  branchIds: string[];
  temporarilyUnavailable: boolean;
  dailyLimit?: number | null;
}

/** OCR adapteri qaytaradigan qat'iy schema - ishonchsiz manba, faqat shu maydonlar. */
export interface OcrExtractionResult {
  success: boolean;
  confidencePercent: number; // 0-100
  branchNameRaw?: string;
  receiptExternalId?: string;
  purchasedAtIso?: string;
  amountSom?: number;
  currencyGuess?: string;
  lineItemsRaw?: string[];
  rawText: string;
  engine: "tesseract-local" | "tesseract-wasm" | "external-stub-not-configured";
}

/** ZimZim (yoki boshqa POS) adapterining umumiy interfeysi. */
export interface PosSaleRecord {
  externalSaleId: string;
  branchOrTillId: string;
  paidAtIso: string;
  amountSom: number;
  lineItems?: { name: string; priceSom: number }[];
  discountsSom?: number;
  refunded: boolean;
  linkedCustomerExternalId?: string | null;
}

export type PosAdapterStatus =
  | "NOT_CONFIGURED"
  | "CONFIGURED_MANUAL_ONLY"
  | "CONFIGURED_LIVE";
