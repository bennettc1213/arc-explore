/**
 * Chrome extension ES modules require a file extension on relative imports.
 * `tsc --module es2020` copies TypeScript specifiers as-is, so `./foo` dies
 * in the popup and the UI never leaves "checking this page…".
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "extension", "vendor");
for (const name of readdirSync(dir).filter((file) => file.endsWith(".js"))) {
  const path = join(dir, name);
  const next = readFileSync(path, "utf8").replace(
    /from\s+["'](\.[^"']+?)["']/g,
    (full, spec) => (spec.endsWith(".js") ? full : `from "${spec}.js"`),
  );
  writeFileSync(path, next);
}
