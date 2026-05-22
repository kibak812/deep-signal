import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { KOREAN_COPY_SOURCE_FILES, sourceFingerprint } from "./report-fingerprints.mjs";

const root = resolve(import.meta.dirname, "..");
const qaDir = resolve(root, "qa");
const reportPath = resolve(qaDir, "korean-copy-report.json");

const sourceFiles = [
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
  "README.md"
];

const bannedCopy = [
  "Abyssal Archive",
  "Echo Archivist",
  "Archive Codex",
  "Archive Recovered",
  "Signal Lost",
  "Final Deck",
  "Recovered Relics",
  "Archive Depths",
  "Choose Your Reward",
  "Refit at the Waystation",
  "Cards for Sale",
  "Relics for Sale",
  "Rest at the Waystation",
  "HP",
  "골드",
  "금화",
  "동력",
  "에너지 회수",
  "스킬",
  "초반 빌드 선언",
  "상태 대응",
  "덱 순환 압박",
  "빌드 축",
  "보스 기믹",
  "마무리 각",
  "자원 흐름",
  "심연 장서관",
  "색인관 조언",
  "맥동 창",
  "휴식 포드",
  "스테이션 상점",
  "전술 힌트",
  "서비스",
  "심해 네트워크",
  "신호 심해 탐사자",
  "마지막 신호를 끊"
];

const requiredCopy = [
  "딥 시그널",
  "에코 다이버",
  "심해 신호 추적자",
  "가라앉은 데이터 해역",
  "경로 선택",
  "보상 선택",
  "저장 삭제",
  "런 포기",
  "플레이 힌트",
  "피해",
  "방어도",
  "취약",
  "약화",
  "바이러스",
  "표식",
  "전하",
  "소멸",
  "보존",
  "강화"
];

function copyComparable(report) {
  return JSON.stringify({ ...report, generatedAt: null });
}

async function writeReportIfChanged(report) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  try {
    const existing = JSON.parse(await readFile(reportPath, "utf8"));
    if (copyComparable(existing) === copyComparable(report)) return false;
  } catch {
    // Missing or unreadable reports should be replaced with the latest copy audit.
  }
  await writeFile(reportPath, serialized);
  return true;
}

async function newestMtime(files) {
  const times = await Promise.all(
    files.map(async (file) => {
      try {
        return (await stat(resolve(root, file))).mtimeMs;
      } catch {
        return 0;
      }
    })
  );
  return Math.max(0, ...times);
}

function sourceViolations(sourceName, source) {
  return bannedCopy
    .filter((phrase) => new RegExp(`(^|[^A-Za-z가-힣])${escapeRegExp(phrase)}([^A-Za-z가-힣]|$)`).test(source))
    .map((phrase) => ({ source: sourceName, phrase }));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const sources = await Promise.all(
  sourceFiles.map(async (file) => ({
    file,
    source: await readFile(resolve(root, file), "utf8")
  }))
);
const combined = sources.map((item) => item.source).join("\n");
const violations = sources.flatMap((item) => sourceViolations(item.file, item.source));
const required = requiredCopy.map((phrase) => ({ phrase, present: combined.includes(phrase) }));
const missingRequired = required.filter((item) => !item.present).map((item) => item.phrase);
const titleIdentity = JSON.parse(await readFile(resolve(qaDir, "browser-qa-title-identity.json"), "utf8").catch(() => "null"));
const sourceFreshAfter = new Date(await newestMtime([...sourceFiles, "qa/browser-qa-title-identity.json"])).toISOString();

const report = {
  generatedAt: new Date().toISOString(),
  sourceFreshAfter,
  sourceFingerprint: await sourceFingerprint(KOREAN_COPY_SOURCE_FILES, { root }),
  sourceFiles,
  ok: violations.length === 0 && missingRequired.length === 0 && titleIdentity?.awkwardCopyGone === true && titleIdentity?.copyReady === true,
  summary: {
    checkedSources: sourceFiles.length,
    bannedPhrases: bannedCopy.length,
    violations: violations.length,
    requiredPhrases: required.length,
    missingRequired: missingRequired.length
  },
  checks: {
    bannedCopy: {
      ok: violations.length === 0,
      violations
    },
    requiredCopy: {
      ok: missingRequired.length === 0,
      required
    },
    titleCopy: {
      ok: titleIdentity?.awkwardCopyGone === true && titleIdentity?.copyReady === true,
      heroCopy: titleIdentity?.heroCopy ?? "",
      characterTitle: titleIdentity?.characterTitle ?? "",
      awkwardCopyGone: titleIdentity?.awkwardCopyGone ?? false,
      copyReady: titleIdentity?.copyReady ?? false
    }
  }
};

await mkdir(qaDir, { recursive: true });
const written = await writeReportIfChanged(report);
if (!report.ok) process.exitCode = 1;
console.log(`${written ? "Wrote" : "Report unchanged at"} ${reportPath}`);
