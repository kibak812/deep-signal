import { STARTER_DECK } from "./cards.js";

export const CHARACTER = {
  id: "echo_archivist",
  name: "에코 다이버",
  title: "신호 심해 탐사자",
  maxHp: 92,
  gold: 99,
  energy: 3,
  starterRelic: "salted_compass",
  starterDeck: STARTER_DECK,
  mechanics: [
    "전하: 모았다가 큰 공격이나 방어에 씁니다.",
    "표식: 먼저 찍고 싼 공격을 이어 씁니다.",
    "바이러스: 오래 버티는 적을 천천히 깎습니다."
  ]
};

export const DIFFICULTIES = [
  {
    id: 0,
    name: "표층",
    text: "처음 내려가기 좋은 난이도입니다. 적 피해가 조금 낮습니다.",
    enemyHp: 1,
    enemyDamage: 0.95,
    gold: 1,
    playerMaxHp: 0
  },
  {
    id: 1,
    name: "냉수층",
    text: "적 체력 +12%, 적 피해 +6%.",
    enemyHp: 1.12,
    enemyDamage: 1.06,
    gold: 1,
    playerMaxHp: 0
  },
  {
    id: 2,
    name: "무광층",
    text: "적 체력 +13%, 적 피해 +8%.",
    enemyHp: 1.13,
    enemyDamage: 1.08,
    gold: 1,
    playerMaxHp: 0
  },
  {
    id: 3,
    name: "압력층",
    text: "적 체력 +18%, 적 피해 +8%, 시작 최대 체력 -5.",
    enemyHp: 1.18,
    enemyDamage: 1.08,
    gold: 1,
    playerMaxHp: -5
  },
  {
    id: 4,
    name: "무호흡층",
    text: "보상 크레딧 -12%, 시작 최대 체력 -8.",
    enemyHp: 1.26,
    enemyDamage: 1.14,
    gold: 0.88,
    playerMaxHp: -8
  },
  {
    id: 5,
    name: "최심층",
    text: "적 체력 +30%, 적 피해 +18%, 최종 보스 체력 +21%, 보상 크레딧 -16%, 시작 최대 체력 -12.",
    enemyHp: 1.3,
    enemyDamage: 1.18,
    finalBossHp: 1.21,
    gold: 0.84,
    playerMaxHp: -12
  }
];
