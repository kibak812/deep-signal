import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

export const AUDIO_MIX_SOURCE_FILES = [
  "src/main.js",
  "scripts/audio-mix-report.mjs"
];

export const RELEASE_PLAYTEST_SOURCE_FILES = [
  "src/engine/game.js",
  "src/data/cards.js",
  "src/data/enemies.js",
  "src/data/events.js",
  "src/data/relics.js",
  "src/engine/save-slots.js",
  "src/engine/settings.js",
  "scripts/balance-runner.mjs",
  "scripts/release-playtest-report.mjs"
];

export const KOREAN_COPY_SOURCE_FILES = [
  "src/main.js",
  "src/engine/game.js",
  "src/data/character.js",
  "src/data/cards.js",
  "src/data/events.js",
  "src/data/relics.js",
  "src/data/enemies.js",
  "src/data/keywords.js",
  "src/data/challenges.js",
  "index.html",
  "README.md",
  "scripts/korean-copy-report.mjs",
  "qa/browser-qa-title-identity.json"
];

export const BROWSER_QA_SOURCE_FILES = [
  "index.html",
  "src/main.js",
  "src/styles.css",
  "src/engine/game.js",
  "src/data/cards.js",
  "src/data/character.js",
  "src/data/enemies.js",
  "src/data/events.js",
  "src/data/relics.js",
  "scripts/generate-card-ui-icons.py",
  "scripts/generate-hud-icons.py",
  "scripts/generate-map-node-icons.py",
  "scripts/generate-relic-icons.py",
  "scripts/generate-resource-icons.py",
  "scripts/generate-shop-service-icons.py",
  "scripts/generate-status-icons.py",
  "scripts/generate-title-identity.py",
  "public/assets/favicon.svg",
  "public/assets/card-ui-icons.png",
  "public/assets/hud-icons.png",
  "public/assets/map-node-icons.png",
  "public/assets/relic-icons.png",
  "public/assets/resource-icons.png",
  "public/assets/shop-service-icons.png",
  "public/assets/status-icons.png",
  "public/assets/deep-signal-mark.png",
  "public/assets/echo-diver-emblem.png"
];

function stableRelative(root, path) {
  return relative(root, resolve(root, path)).split(sep).join("/");
}

export async function fileSha256(path) {
  const buffer = await readFile(path);
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

export async function sourceFingerprint(files, { root = resolve(import.meta.dirname, "..") } = {}) {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(stableRelative(root, file));
    hash.update("\0");
    hash.update(await readFile(resolve(root, file)));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

export async function buildBrowserQaManifest({ root = resolve(import.meta.dirname, ".."), qaDir = resolve(root, "qa") } = {}) {
  const files = (await readdir(qaDir).catch(() => []))
    .filter((file) => /^browser-qa-.+\.png$/.test(file))
    .sort();
  const records = await Promise.all(
    files.map(async (file) => {
      const path = resolve(qaDir, file);
      const fileStat = await stat(path);
      return {
        file,
        bytes: fileStat.size,
        sha256: await fileSha256(path)
      };
    })
  );
  return {
    generatedAt: new Date().toISOString(),
    sourceFingerprint: await sourceFingerprint(BROWSER_QA_SOURCE_FILES, { root }),
    sourceFiles: BROWSER_QA_SOURCE_FILES,
    fileCount: records.length,
    files: records
  };
}
