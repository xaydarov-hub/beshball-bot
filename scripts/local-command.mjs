import fs from "node:fs";
import { spawn } from "node:child_process";
const runtime = JSON.parse(fs.readFileSync(".runtime/runtime.json", "utf8"));
const args = process.argv.slice(2);
if (!args.length) throw new Error("Provide a Node script and its arguments");
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: { ...process.env, ...runtime },
});
child.on("exit", (code) => process.exit(code ?? 1));
