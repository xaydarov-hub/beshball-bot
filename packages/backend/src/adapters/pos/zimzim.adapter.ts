import type { PosSaleRecord, PosAdapterStatus } from "@beshball/shared";
import type { PosAdapter } from "./pos.interface.js";

/**
 * ZimZim POS adapteri.
 *
 * MUHIM: Loyiha yaratilgan vaqtda ZimZim uchun RASMIY API HUJJATI VA
 * KIRISH RUXSATI BERILMAGAN. Shuning uchun bu klass:
 *   - hech qanday tayyor bo'lmagan endpointni o'ylab topmaydi;
 *   - scraping yoki boshqa norasmiy usul bilan kirishga urinmaydi;
 *   - har doim "NOT_CONFIGURED" statusini qaytaradi;
 *   - findSaleByExternalId chaqirilsa, aniq xato bilan rad etadi -
 *     hech qachon soxta/o'ylab topilgan savdo yozuvi qaytarmaydi.
 *
 * Kelajakda haqiqiy hujjat va ruxsat kelganda, shu klass ichida
 * process.env orqali berilgan ZIMZIM_API_BASE_URL / ZIMZIM_API_KEY
 * bilan haqiqiy HTTP so'rovlar yoziladi va status CONFIGURED_LIVE ga
 * o'tkaziladi (batafsil: ZIMZIM_INTEGRATION.md).
 */
export class ZimZimPosAdapter implements PosAdapter {
  async getStatus(): Promise<PosAdapterStatus> {
    return "NOT_CONFIGURED";
  }

  async findSaleByExternalId(): Promise<PosSaleRecord | null> {
    throw new Error(
      "ZimZim adapteri sozlanmagan: haqiqiy API hujjati va kirish ma'lumotlari kutilmoqda. " +
        "Hozircha faqat qo'lda (manual) tekshiruv rejimi ishlaydi.",
    );
  }
}
