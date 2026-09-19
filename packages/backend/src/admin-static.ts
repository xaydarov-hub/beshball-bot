import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";

const pages = new Set([
  "/",
  "/cheklar",
  "/kassir",
  "/mijozlar",
  "/sovgalar",
  "/aksiyalar",
  "/xabarlar",
  "/xodimlar",
  "/filiallar",
  "/fikrlar",
  "/audit",
  "/sozlamalar",
]);
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export function registerAdminStatic(app: FastifyInstance, directory: string) {
  const root = resolve(directory);
  app.setNotFoundHandler(async (req, reply) => {
    if (!["GET", "HEAD"].includes(req.method))
      return reply.code(404).send({ error: "Topilmadi" });
    let pathname: string;
    try {
      pathname = decodeURIComponent(req.url.split("?")[0]);
    } catch {
      return reply.code(400).send({ error: "Noto‘g‘ri manzil" });
    }
    const relative = pages.has(pathname)
      ? "index.html"
      : pathname.startsWith("/assets/")
        ? pathname.slice(1)
        : null;
    if (!relative) return reply.code(404).send({ error: "Topilmadi" });
    const file = resolve(root, relative);
    if (
      !file.startsWith(root + sep) ||
      !types[extname(file)] ||
      relative.includes("..") ||
      relative.includes("\\")
    )
      return reply.code(404).send({ error: "Topilmadi" });
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) return reply.code(404).send({ error: "Topilmadi" });
    reply.header("Referrer-Policy", "no-referrer");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org;",
    );
    return reply.type(types[extname(file)]).send(createReadStream(file));
  });
}
