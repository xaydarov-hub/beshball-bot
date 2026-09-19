import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OcrExtractionResult } from "@beshball/shared";
import type { OcrAdapter } from "./ocr.interface.js";

/**
 * Mahalliy Tesseract: native executable yoki tesseract.js WebAssembly.
 * Ikkala yo'l ham haqiqiy rasmni o'qiydi; xato qo'lda tekshiruvga o'tadi.
 * Muhitda bajarilgan tekshiruvlar TEST_REPORT.md da qayd etiladi.
 */
export class TesseractOcrAdapter implements OcrAdapter {
  // "uzb" til paketi Debian/Ubuntu tesseract-ocr-uzb orqali mavjud bo'lishi
  // mumkin, lekin bu sinov muhitida tekshirilmagan - shuning uchun xavfsiz
  // standart qiymat sifatida eng+rus ishlatiladi. Serverda uzb paketi
  // o'rnatilgan bo'lsa, OCR_LANGUAGES=uzb+rus+eng qilib .env da o'zgartiring.
  constructor(
    private readonly languages: string = process.env.OCR_LANGUAGES ?? "eng+rus",
  ) {}

  async extract(imageBuffer: Buffer): Promise<OcrExtractionResult> {
    if (process.env.OCR_ENGINE === "wasm") {
      const { createWorker } = await import("tesseract.js");
      let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      try {
        const job = (async () => {
          worker = await createWorker(this.languages.split("+"), 1, {
            langPath: process.env.OCR_LANG_PATH,
            gzip: false,
            cacheMethod: "none",
          });
          if (timedOut) {
            await worker.terminate();
            throw new Error("OCR initialization timed out");
          }
          const result = await worker.recognize(imageBuffer);
          return result.data;
        })();
        const data = await Promise.race([
          job,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              timedOut = true;
              reject(new Error("OCR timeout"));
            }, 30000);
          }),
        ]);
        const parsed = parseReceiptText(data.text);
        return {
          ...parsed,
          success: true,
          rawText: data.text,
          confidencePercent: Math.max(
            0,
            Math.min(100, Math.floor(data.confidence)),
          ),
          engine: "tesseract-wasm",
        };
      } catch {
        return {
          success: false,
          confidencePercent: 0,
          rawText: "OCR o‘qiy olmadi. Xodim tekshirishi kerak.",
          engine: "tesseract-wasm",
        };
      } finally {
        clearTimeout(timer);
        await worker?.terminate();
      }
    }
    const dir = await mkdtemp(join(tmpdir(), "beshball-ocr-"));
    const inputPath = join(dir, "receipt.png");
    const outputBase = join(dir, "out");
    try {
      await writeFile(inputPath, imageBuffer);
      const rawText = await runTesseract(inputPath, outputBase, this.languages);
      const parsed = parseReceiptText(rawText);
      return {
        success: true,
        confidencePercent: parsed.confidencePercent,
        branchNameRaw: parsed.branchNameRaw,
        receiptExternalId: parsed.receiptExternalId,
        purchasedAtIso: parsed.purchasedAtIso,
        amountSom: parsed.amountSom,
        currencyGuess: parsed.currencyGuess,
        lineItemsRaw: parsed.lineItemsRaw,
        rawText,
        engine: "tesseract-local",
      };
    } catch (err) {
      return {
        success: false,
        confidencePercent: 0,
        rawText: err instanceof Error ? err.message : String(err),
        engine: "tesseract-local",
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

function runTesseract(
  inputPath: string,
  outputBase: string,
  languages: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("tesseract", [inputPath, outputBase, "-l", languages]);
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error("OCR timeout"));
    }, 30000);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Tesseract o‘rnatilmagan yoki ishga tushmadi"));
    });
    proc.on("close", async (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(`tesseract xato bilan yakunlandi (${code}): ${stderr}`),
        );
        return;
      }
      try {
        const text = await readFile(`${outputBase}.txt`, "utf-8");
        resolve(text);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  });
}

/**
 * OCR matnidan qat'iy maydonlarni ajratib olish - juda ehtiyotkorlik bilan,
 * chunki bu ISHONCHSIZ MANBA. Hech qanday ko'rsatma sifatida talqin qilinmaydi,
 * faqat summa/sana/raqam qidiruvi.
 */
export function parseReceiptText(rawText: string): {
  confidencePercent: number;
  branchNameRaw?: string;
  receiptExternalId?: string;
  purchasedAtIso?: string;
  amountSom?: number;
  currencyGuess?: string;
  lineItemsRaw?: string[];
} {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Juda oddiy evristika: "jami"/"итого"/"total" so'zi bilan bir qatordagi
  // eng katta sonni summa deb hisoblaydi. Bu ADMIN TASDIQLASHI SHART bo'lgan
  // taxmindir, avtomatik to'lov manbai emas (7-band talabi).
  let amountSom: number | undefined;
  for (const line of lines) {
    if (/jami|итого|total|summa|to'lov/i.test(line)) {
      const numbers = line.match(/[\d.,\s]{4,}/g);
      if (numbers) {
        const cleaned = numbers[numbers.length - 1]
          .trim()
          .replace(/[.,]\d{2}$/, "")
          .replace(/[.,\s]/g, "");
        const n = Number(cleaned);
        if (Number.isSafeInteger(n) && n > 0 && n <= 1_000_000_000)
          amountSom = n;
      }
    }
  }

  const dateMatch = rawText.match(
    /(\d{2})[./-](\d{2})[./-](\d{4})[ T](\d{2}):(\d{2})/,
  );
  let purchasedAtIso: string | undefined;
  if (dateMatch) {
    const local = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T${dateMatch[4]}:${dateMatch[5]}:00`;
    const parsedDate = new Date(`${local}+05:00`);
    // Date may normalize 31 February; accept only an exact calendar round-trip.
    if (
      Number.isFinite(+parsedDate) &&
      new Date(+parsedDate + 5 * 3600000).toISOString().slice(0, 19) === local
    )
      purchasedAtIso = parsedDate.toISOString();
  }

  const idMatch = rawText.match(
    /(chek|check|receipt)\s*#?\s*[:№]?\s*([A-Za-z0-9-]{3,})/i,
  );

  return {
    confidencePercent: amountSom ? 55 : 20, // past ishonch - har doim inson tekshiruvi kerak
    branchNameRaw: lines[0],
    receiptExternalId: idMatch?.[2],
    purchasedAtIso,
    amountSom,
    currencyGuess: /so'?m|сум|uzs/i.test(rawText) ? "UZS" : undefined,
    lineItemsRaw: lines.slice(1, -1),
  };
}
