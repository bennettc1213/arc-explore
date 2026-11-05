// Build a reproducible ZIP with Node's built-in ZIP primitives. Only explicitly
// named extension sources and compiled rule modules enter the package.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const extension = join(root, "extension");
const manifest = JSON.parse(readFileSync(join(extension, "manifest.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("Expected a three-part extension version.");
const files = ["manifest.json", "background.js", "content.js", "workspace.js", "popup.js", "popup.html", "popup.css", "README.md",
  "vendor/autofill.js", "vendor/apply-url.js", "vendor/frame-headers.js", "vendor/submitted.js", "vendor/extension-config.js"];
const parts = [];
const directory = [];
let offset = 0;
// Fixed timestamps make the same source produce the same archive.
const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
for (const path of files) {
  const name = Buffer.from(path);
  const data = readFileSync(join(extension, path));
  const compressed = deflateRawSync(data);
  const checksum = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(dosDate, 12);
  header.writeUInt32LE(checksum, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  parts.push(header, name, compressed);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50, 0);
  record.writeUInt16LE(20, 4);
  record.writeUInt16LE(20, 6);
  record.writeUInt16LE(0x800, 8);
  record.writeUInt16LE(8, 10);
  record.writeUInt16LE(dosDate, 14);
  record.writeUInt32LE(checksum, 16);
  record.writeUInt32LE(compressed.length, 20);
  record.writeUInt32LE(data.length, 24);
  record.writeUInt16LE(name.length, 28);
  record.writeUInt32LE(offset, 42);
  directory.push(record, name);
  offset += header.length + name.length + compressed.length;
}
const central = Buffer.concat(directory);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(central.length, 12);
end.writeUInt32LE(offset, 16);
const output = join(root, ".local", "extension-builds");
mkdirSync(output, { recursive: true });
const destination = join(output, `instela-extension-${manifest.version}.zip`);
writeFileSync(destination, Buffer.concat([...parts, central, end]));
console.log(`Packaged ${files.length} files: ${destination}`);
