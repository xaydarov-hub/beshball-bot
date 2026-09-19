import type { OcrExtractionResult } from "@beshball/shared";
import type { OcrAdapter } from "./ocr.interface.js";

/**
 * Agar tashqi OCR xizmati sozlanmagan bo'lsa, ushbu adapter ANIQ
 * "muvaffaqiyatsiz/sozlanmagan" natija qaytaradi - hech qachon soxta
 * summa yoki soxta ishonch foizini o'ylab topmaydi. Chek har doim
 * PENDING_REVIEW holatiga tushib, inson tomonidan qo'lda kiritiladi.
 */
export class NotConfiguredOcrAdapter implements OcrAdapter {
  async extract(): Promise<OcrExtractionResult> {
    return {
      success: false,
      confidencePercent: 0,
      rawText: "",
      engine: "external-stub-not-configured",
    };
  }
}
