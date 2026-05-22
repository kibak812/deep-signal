import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AUDIO_MIX_SOURCE_FILES, sourceFingerprint } from "./report-fingerprints.mjs";

const root = resolve(import.meta.dirname, "..");
const qaDir = resolve(root, "qa");
const source = await readFile(resolve(root, "src/main.js"), "utf8");

function objectBodyAfter(marker) {
  const start = source.indexOf(marker);
  if (start === -1) return "";
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return "";
}

function numberConst(name) {
  const match = source.match(new RegExp(`const ${name} = ([0-9.]+);`));
  return match ? Number(match[1]) : null;
}

const themeBody = objectBodyAfter("const MUSIC_THEMES =");
const cueBody = objectBodyAfter("const SOUND_CUES =");
const themeNames = [...themeBody.matchAll(/\n  ([a-zA-Z0-9_]+): \{/g)].map((match) => match[1]);
const cueNames = [...cueBody.matchAll(/\n  ([a-zA-Z0-9_]+): \{/g)].map((match) => match[1]);
const themeGains = [...themeBody.matchAll(/\n    gain: ([0-9.]+),/g)].map((match) => Number(match[1]));
const cueGains = [...cueBody.matchAll(/\n  [a-zA-Z0-9_]+: \{[^}]*gain: ([0-9.]+)/g)].map((match) => Number(match[1]));
const cueNoises = [...cueBody.matchAll(/noise: ([0-9.]+)/g)].map((match) => Number(match[1]));
const duckMinRatio = numberConst("MUSIC_DUCK_MIN_RATIO");
const duckRelease = numberConst("MUSIC_DUCK_RELEASE_SECONDS");
const duckAttack = numberConst("MUSIC_DUCK_ATTACK_SECONDS");
const musicGainScale = numberConst("MUSIC_GAIN_SCALE");
const maxThemeGain = Math.max(0, ...themeGains);
const maxCueGain = Math.max(0, ...cueGains);
const maxCueNoise = Math.max(0, ...cueNoises);

const checks = [
  {
    id: "theme-coverage",
    ok: themeNames.length >= 10 && themeNames.includes("boss_lastgate_phase2"),
    detail: "일반, 보스, 2단계, 승패 테마가 충분히 분리되어야 합니다."
  },
  {
    id: "cue-coverage",
    ok: cueNames.length >= 24 && ["attackCard", "enemyAttack", "bossPhase", "win", "lose"].every((name) => cueNames.includes(name)),
    detail: "전투, 보상, 상점, 보스 전환, 승패 효과음이 구분되어야 합니다."
  },
  {
    id: "music-headroom",
    ok: musicGainScale <= 0.35 && maxThemeGain <= 0.05,
    detail: "장시간 청감에서 배경음 기본 게인이 효과음을 덮지 않도록 여유를 둡니다."
  },
  {
    id: "sfx-headroom",
    ok: maxCueGain <= 0.065 && maxCueNoise <= 0.05,
    detail: "효과음 피크와 노이즈가 짧게 읽히되 과하게 튀지 않아야 합니다."
  },
  {
    id: "music-ducking",
    ok:
      duckMinRatio >= 0.5 &&
      duckMinRatio <= 0.65 &&
      duckAttack <= 0.035 &&
      duckRelease >= 0.35 &&
      duckRelease <= 0.55 &&
      source.includes("function duckMusicForCue(cue") &&
      source.includes("function musicDuckRatioForCue(cue)") &&
      source.includes("state.music.duckUntil"),
    detail: "효과음이 날 때 음악 버스가 짧게 내려갔다가 천천히 복귀해야 합니다."
  },
  {
    id: "mix-bus",
    ok:
      source.includes("createDynamicsCompressor") &&
      source.includes("compressor.threshold.setValueAtTime(-27") &&
      source.includes("filter.frequency.exponentialRampToValueAtTime(filterFrequency"),
    detail: "음악 버스에는 기본 저역 통과 필터와 컴프레서가 있어야 합니다."
  }
];

const report = {
  ok: checks.every((check) => check.ok),
  checkedAt: new Date().toISOString(),
  sourceFingerprint: await sourceFingerprint(AUDIO_MIX_SOURCE_FILES, { root }),
  sourceFiles: AUDIO_MIX_SOURCE_FILES,
  themeCount: themeNames.length,
  cueCount: cueNames.length,
  gain: {
    musicGainScale,
    maxThemeGain,
    maxCueGain,
    maxCueNoise,
    duckMinRatio,
    duckAttack,
    duckRelease
  },
  checks
};

await mkdir(qaDir, { recursive: true });
await writeFile(resolve(qaDir, "audio-mix-report.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`Audio mix report passed: ${checks.filter((check) => check.ok).length}/${checks.length}`);
