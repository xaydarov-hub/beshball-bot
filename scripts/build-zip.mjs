import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
const root = process.cwd();
const dest = path.join(root, "beshball.zip");
const output = fs.createWriteStream(dest);
const archive = archiver("zip", { zlib: { level: 9 } });
const completion = new Promise((resolve, reject) => {
  output.on("close", resolve);
  output.on("error", reject);
  archive.on("error", reject);
});
archive.pipe(output);
const denied = new Set([
  "node_modules",
  ".git",
  ".codex",
  ".agents",
  "dist",
  "build",
  "coverage",
  ".runtime",
  "backups",
  "test-results",
  "playwright-report",
  ".local",
  "artifacts",
  "beshball",
]);
const allowedRoot = new Set([
  "package.json",
  "package-lock.json",
  "tsconfig.base.json",
  "eslint.config.mjs",
  "docker-compose.yml",
  "docker-compose.prod.yml",
  ".env.example",
  ".gitignore",
  ".dockerignore",
  "Caddyfile.example",
  "Dockerfile.cloud",
  "render.yaml",
  "start-beshball.cmd",
]);
function add(dir) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (denied.has(d.name)) continue;
    const full = path.join(dir, d.name);
    const rel = path.relative(root, full).replaceAll("\\", "/");
    if (d.isDirectory()) {
      add(full);
      continue;
    }
    if (
      (d.name.startsWith(".env") && d.name !== ".env.example") ||
      /\.(zip|log|dump|gz|db|sqlite|png|jpg|jpeg|webp|tsbuildinfo)$/.test(
        d.name,
      )
    )
      continue;
    if (
      !rel.includes("/") &&
      !allowedRoot.has(d.name) &&
      !d.name.endsWith(".md")
    )
      continue;
    if (rel === "scripts/upgrade-base.cjs") continue;
    archive.file(full, { name: `beshball/${rel}` });
  }
}
add(root);
await archive.finalize();
await completion;
console.log(`ZIP yaratildi: ${dest} (${archive.pointer()} bytes)`);
