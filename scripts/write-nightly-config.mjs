import { readFileSync, writeFileSync } from "node:fs";

const baseConfig = JSON.parse(
  readFileSync("src-tauri/tauri.conf.json", "utf8"),
);
const baseVersion = String(baseConfig.version).split(/[+-]/, 1)[0];
const runNumber = process.env.GITHUB_RUN_NUMBER || String(Date.now());
const version = `${baseVersion}-nightly.${runNumber}`;

const nightlyConfig = {
  $schema: "https://schema.tauri.app/config/2",
  productName: "Flow Nightly",
  version,
  identifier: "io.github.aedev.flow.desktop.nightly",
  bundle: {
    shortDescription: "Nightly testing build of Flow Desktop.",
    longDescription:
      "An automatically generated testing build of Flow Desktop. Nightly builds use isolated application data and may be unstable.",
  },
};

writeFileSync(
  "src-tauri/tauri.nightly.generated.json",
  `${JSON.stringify(nightlyConfig, null, 2)}\n`,
);

console.log(`Generated Flow Nightly configuration for version ${version}`);
