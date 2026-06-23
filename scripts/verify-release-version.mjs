import { readFileSync } from "node:fs";

const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const tauriVersion = JSON.parse(
  readFileSync("src-tauri/tauri.conf.json", "utf8"),
).version;
const cargoManifest = readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoVersion = cargoManifest.match(/^version = "([^"]+)"$/m)?.[1];

if (!cargoVersion) {
  throw new Error("Could not read the package version from src-tauri/Cargo.toml.");
}

const versions = {
  packageJson: packageVersion,
  tauriConfig: tauriVersion,
  cargoManifest: cargoVersion,
};

if (new Set(Object.values(versions)).size !== 1) {
  throw new Error(`Release versions do not match: ${JSON.stringify(versions)}`);
}

if (
  process.env.GITHUB_REF_TYPE === "tag" &&
  process.env.GITHUB_REF_NAME !== `v${packageVersion}`
) {
  throw new Error(
    `Release tag ${process.env.GITHUB_REF_NAME} must be v${packageVersion}.`,
  );
}

console.log(`Release version verified: ${packageVersion}`);
