import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";
import { hash, requireThat } from "./core.js";
import { SupabaseStorage } from "./supabase-storage.js";
const supabaseStorage =
  process.env.STORAGE_PROVIDER === "supabase"
    ? new SupabaseStorage(
        process.env.SUPABASE_STORAGE_URL ?? "",
        process.env.SUPABASE_SERVICE_KEY ?? "",
        process.env.S3_BUCKET ?? "beshball-receipts",
      )
    : undefined;
export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});
const bucket = process.env.S3_BUCKET ?? "beshball-receipts";
export async function initializeStorage() {
  if (supabaseStorage) return supabaseStorage.initialize();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (e) {
    if ((e as any).$metadata?.httpStatusCode !== 404) throw e;
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}
export async function decodeImage(base64: string) {
  requireThat(/^[A-Za-z0-9+/]+={0,2}$/.test(base64), "Base64 noto‘g‘ri");
  const buffer = Buffer.from(base64, "base64");
  requireThat(
    buffer.length > 0 && buffer.length <= 8 * 1024 * 1024,
    "Rasm 8 MB dan oshmasin",
  );
  const img = sharp(buffer, { limitInputPixels: 25_000_000 });
  const m = await img.metadata().catch(() => {
    requireThat(false, "Rasm buzilgan yoki rasm formati noto‘g‘ri");
  });
  requireThat(m, "Rasm o‘qilmadi");
  requireThat(
    ["jpeg", "png", "webp"].includes(m.format ?? ""),
    "Faqat JPG, PNG yoki WebP",
  );
  const pixels = await img
    .clone()
    .resize(9, 8, { fit: "fill" })
    .greyscale()
    .removeAlpha()
    .raw()
    .toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      bits += pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? "1" : "0";
  return {
    buffer,
    imageHash: hash(buffer),
    perceptualHash: BigInt("0b" + bits)
      .toString(16)
      .padStart(16, "0"),
    contentType: `image/${m.format}`,
  };
}
export function distance(a: string, b: string) {
  let n = BigInt("0x" + a) ^ BigInt("0x" + b),
    count = 0;
  while (n) {
    count += Number(n & 1n);
    n >>= 1n;
  }
  return count;
}
export async function upload(key: string, body: Buffer, contentType: string) {
  if (supabaseStorage) return supabaseStorage.upload(key, body, contentType);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}
export async function readImage(key: string) {
  if (supabaseStorage) return supabaseStorage.read(key);
  const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return Buffer.from(await r.Body!.transformToByteArray());
}
export async function signedImage(key: string) {
  if (supabaseStorage) return supabaseStorage.signed(key);
  const client = process.env.S3_PUBLIC_ENDPOINT
    ? new S3Client({
        endpoint: process.env.S3_PUBLIC_ENDPOINT,
        region: process.env.S3_REGION ?? "us-east-1",
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY ?? "",
          secretAccessKey: process.env.S3_SECRET_KEY ?? "",
        },
      })
    : s3;
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 60 },
  );
}
export async function deleteImage(key: string) {
  if (supabaseStorage) return supabaseStorage.delete(key);
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
