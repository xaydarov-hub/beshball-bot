import type { PosSaleRecord, PosAdapterStatus } from "@beshball/shared";

export interface PosAdapter {
  getStatus(): Promise<PosAdapterStatus>;
  /** Faqat CONFIGURED_LIVE holatida chaqirilishi mumkin. */
  findSaleByExternalId(
    externalSaleId: string,
    branchOrTillId: string,
  ): Promise<PosSaleRecord | null>;
}
