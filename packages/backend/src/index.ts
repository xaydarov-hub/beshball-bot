import { env, assertConfiguration } from "./config.js";
import { buildServer } from "./server.js";
import { prisma } from "./core.js";
import { fileURLToPath } from "node:url";
assertConfiguration();
const app = buildServer({
  adminDirectory:
    process.env.SERVE_ADMIN === "true"
      ? fileURLToPath(new URL("../../admin/dist/", import.meta.url))
      : undefined,
});
await app.listen({ port: env.port, host: process.env.HOST ?? "127.0.0.1" });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app
      .close()
      .then(() => prisma.$disconnect())
      .then(() => process.exit(0));
  });
