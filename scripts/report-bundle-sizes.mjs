import { readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "src-tauri/target");
const packageExtensions = new Set([
  ".appimage",
  ".deb",
  ".dmg",
  ".exe",
  ".msi",
  ".rpm",
]);

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }

    const extension = extname(entry.name).toLowerCase();
    if (!packageExtensions.has(extension)) continue;

    const bytes = statSync(path).size;
    const mebibytes = bytes / 1024 / 1024;
    console.log(`${mebibytes.toFixed(2)} MiB  ${relative(root, path)}`);
  }
}

walk(root);
