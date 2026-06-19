const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, rmSync } = require("node:fs");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const manifestPath = path.join(root, "manifest.json");

const packageEntries = [
  "manifest.json",
  "src",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png"
];

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const version = manifest.version;

  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) {
    throw new Error(`Manifest version is invalid: ${version}`);
  }

  for (const entry of packageEntries) {
    const fullPath = path.join(root, entry);
    if (!existsSync(fullPath)) {
      throw new Error(`Missing package entry: ${entry}`);
    }
  }

  mkdirSync(distDir, { recursive: true });

  const zipName = `focusd-${version}.zip`;
  const zipPath = path.join(distDir, zipName);
  rmSync(zipPath, { force: true });

  execFileSync("zip", ["-r", zipPath, ...packageEntries, "-x", "*.DS_Store"], {
    cwd: root,
    stdio: "inherit"
  });

  console.log(`Built ${path.relative(root, zipPath)}`);
}
