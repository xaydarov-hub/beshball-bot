import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
const [mode, directory] = process.argv.slice(2);
if (!["backup", "restore"].includes(mode) || !directory)
  throw new Error(
    "Usage: node scripts/storage-backup.mjs backup|restore DIRECTORY",
  );
const root = path.resolve(directory);
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});
const bucket = process.env.S3_BUCKET ?? "beshball-receipts";
if (mode === "backup") {
  await fs.mkdir(root, { recursive: true });
  const manifest = [];
  let continuation;
  do {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuation,
      }),
    );
    for (const object of list.Contents ?? []) {
      const key = object.Key;
      const result = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      const bytes = Buffer.from(await result.Body.transformToByteArray());
      const file = createHash("sha256").update(key).digest("hex") + ".bin";
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      await fs.writeFile(path.join(root, file), bytes);
      manifest.push({ key, file, sha256, contentType: result.ContentType });
    }
    continuation = list.NextContinuationToken;
  } while (continuation);
  await fs.writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`Storage backup complete: ${manifest.length} objects`);
} else {
  const manifest = JSON.parse(
    await fs.readFile(path.join(root, "manifest.json"), "utf8"),
  );
  for (const entry of manifest) {
    if (!/^[a-f0-9]{64}\.bin$/.test(entry.file))
      throw new Error("Invalid backup filename");
    const bytes = await fs.readFile(path.join(root, entry.file));
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256)
      throw new Error("Backup checksum mismatch");
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: entry.key,
        Body: bytes,
        ContentType: entry.contentType,
      }),
    );
  }
  console.log(`Storage restore complete: ${manifest.length} objects`);
}
