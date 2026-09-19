import type { OcrExtractionResult } from "@beshball/shared";

export interface OcrAdapter {
  extract(imageBuffer: Buffer): Promise<OcrExtractionResult>;
}
