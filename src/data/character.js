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
    text: "적 체력과 피해가 기본값보다 조금 높습니다.",
    enemyHp: 1.04,
    enemyDamage: 1,
    gold: 1,
    playerMaxHp: 0
  },
  {
    id: 2,
    name: "무광층",
    text: "적 체력 +10%, 적 피해 +4%.",
    enemyHp: 1.1,
    enemyDamage: 1.04,
    gold: 1,
    playerMaxHp: 0
  },
  {
    id: 3,
    name: "압력층",
    text: "적이 강하고 시작 최대 체력이 5 감소합니다.",
    enemyHp: 1.15,
    enemyDamage: 1.07,
    gold: 1,
    playerMaxHp: -5
  },
  {
    id: 4,
    name: "무호흡층",
    text: "보상 크레딧 -12%, 시작 최대 체력 -8.",
    enemyHp: 1.2,
    enemyDamage: 1.1,
    gold: 0.88,
    playerMaxHp: -8
  },
  {
    id: 5,
    name: "최심층",
    text: "적 체력 +32%, 적 피해 +20%, 보상 크레딧 -20%, 시작 최대 체력 -14.",
    enemyHp: 1.32,
    enemyDamage: 1.2,
    gold: 0.8,
    playerMaxHp: -14
  }
];
