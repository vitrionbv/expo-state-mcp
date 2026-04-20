import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, "..", "dist", "cli", "cli.js");
const text = readFileSync(cli, "utf8");
if (!text.startsWith("#!")) {
  writeFileSync(cli, "#!/usr/bin/env node\n" + text);
}
chmodSync(cli, 0o755);
