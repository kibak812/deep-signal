export const CHALLENGE_MODIFIERS = [
  {
    id: "salvage_quota",
    name: "샐비지 할당",
    text: "시작 크레딧 +40. 전투 보상 크레딧 -15%.",
    tone: "economy",
    effects: { startingGold: 40, rewardGoldMultiplier: 0.85 }
  },
  {
    id: "ion_current",
    name: "이온 커런트",
    text: "전투 시작마다 전하 2. 적 체력 +6%.",
    tone: "charge",
    effects: { startCharge: 2, enemyHpMultiplier: 1.06 }
  },
  {
    id: "quarantine_breach",
    name: "격리 누수",
    text: "전투 시작마다 모든 적에게 바이러스 2. 자신은 취약 1.",
    tone: "virus",
    effects: { enemyStartVirus: 2, startVulnerable: 1 }
  },
  {
    id: "thin_oxygen",
    name: "희박 산소",
    text: "시작 최대 체력 -6. 카드 보상이 1장 늘어납니다.",
    tone: "risk",
    effects: { maxHp: -6, rewardCardBonus: 1 }
  },
  {
    id: "static_archive",
    name: "정전 아카이브",
    text: "첫 턴 카드 +1장. 전투 시작마다 약화 1.",
    tone: "draw",
    effects: { firstTurnDraw: 1, startWeak: 1 }
  },
  {
    id: "expedition_tax",
    name: "원정세",
    text: "상점 가격 +12%. 엘리트 보상 크레딧 +30.",
    tone: "elite",
    effects: { shopPriceMultiplier: 1.12, eliteGoldBonus: 30 }
  }
];

export const CHALLENGE_MODIFIER_BY_ID = Object.fromEntries(CHALLENGE_MODIFIERS.map((modifier) => [modifier.id, modifier]));
