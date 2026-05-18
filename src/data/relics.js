const relic = (definition) => definition;

export const RELICS = [
  relic({
    id: "salted_compass",
    name: "염분 나침반",
    rarity: "starter",
    icon: "compass",
    timing: "전투 시작",
    text: "첫 턴에 카드 1장을 추가로 뽑습니다."
  }),
  relic({
    id: "brass_compass",
    name: "황동 방향계",
    rarity: "common",
    icon: "compass",
    timing: "전투 시작",
    text: "전투 시작 시 전하 2를 얻습니다."
  }),
  relic({
    id: "salvaged_lens",
    name: "샐비지 렌즈",
    rarity: "common",
    icon: "lens",
    timing: "보상",
    text: "전투 보상 크레딧이 10 증가합니다."
  }),
  relic({
    id: "coral_seal",
    name: "산호 봉인",
    rarity: "common",
    icon: "coral",
    timing: "전투 시작",
    text: "전투 시작 시 도금 2를 얻습니다."
  }),
  relic({
    id: "cracked_anchor",
    name: "금 간 닻",
    rarity: "common",
    icon: "anchor",
    timing: "카드 사용",
    text: "매 전투 첫 공격 카드는 표식 2를 추가로 부여합니다."
  }),
  relic({
    id: "tide_metronome",
    name: "타이드 메트로놈",
    rarity: "common",
    icon: "meter",
    timing: "카드 사용",
    text: "한 턴에 카드 3장을 사용할 때마다 에너지 1을 얻습니다."
  }),
  relic({
    id: "glass_inkwell",
    name: "유리 카트리지",
    rarity: "common",
    icon: "ink",
    timing: "카드 사용",
    text: "한 턴에 두 번째 기술을 사용할 때 카드 1장을 뽑습니다."
  }),
  relic({
    id: "mnemonic_shell",
    name: "기억 소라",
    rarity: "common",
    icon: "shell",
    timing: "전투 시작",
    text: "전투 시작 시 방어도 6을 얻습니다."
  }),
  relic({
    id: "red_ledger",
    name: "레드 로그",
    rarity: "uncommon",
    icon: "ledger",
    timing: "지속 피해",
    text: "적의 바이러스 피해가 1 증가합니다."
  }),
  relic({
    id: "pearl_turbine",
    name: "진주 터빈",
    rarity: "uncommon",
    icon: "pearl",
    timing: "턴 시작",
    text: "전하가 있으면 턴 시작마다 방어도 3을 얻습니다."
  }),
  relic({
    id: "flooded_coin",
    name: "침수 크레딧",
    rarity: "common",
    icon: "coin",
    timing: "상점",
    text: "상점 가격이 15% 감소합니다."
  }),
  relic({
    id: "harmonic_spool",
    name: "화음 물레",
    rarity: "uncommon",
    icon: "spool",
    timing: "카드 사용",
    text: "동조 카드를 사용할 때 카드 1장을 뽑습니다."
  }),
  relic({
    id: "quarantine_tag",
    name: "격리 표찰",
    rarity: "common",
    icon: "tag",
    timing: "전투 시작",
    text: "모든 적에게 바이러스 2를 부여합니다."
  }),
  relic({
    id: "recursive_key",
    name: "재귀 열쇠",
    rarity: "uncommon",
    icon: "key",
    timing: "소멸",
    text: "매 전투 처음 카드를 소멸시킬 때 카드 1장을 뽑고 에너지 1을 얻습니다."
  }),
  relic({
    id: "abyssal_needle",
    name: "심연 바늘",
    rarity: "uncommon",
    icon: "needle",
    timing: "카드 사용",
    text: "공격 카드가 바이러스 1을 추가로 부여합니다."
  }),
  relic({
    id: "counterweight",
    name: "균형추",
    rarity: "uncommon",
    icon: "weight",
    timing: "방어",
    text: "한 번에 방어도 12 이상을 얻으면 반격 3을 얻습니다."
  }),
  relic({
    id: "dead_battery",
    name: "죽은 축전지",
    rarity: "rare",
    icon: "battery",
    timing: "항상",
    text: "최대 에너지 1 증가. 전투 시작 시 체력 2를 잃습니다."
  }),
  relic({
    id: "map_of_silt",
    name: "실트 지도",
    rarity: "uncommon",
    icon: "map",
    timing: "보상",
    text: "카드 보상이 4장 중 선택으로 바뀝니다."
  }),
  relic({
    id: "pressure_vial",
    name: "압력 유리병",
    rarity: "common",
    icon: "vial",
    timing: "전투 시작",
    text: "전투 시작 시 모든 적에게 취약 1을 부여하고 자신에게 균열 1을 얻습니다."
  }),
  relic({
    id: "clockwork_gill",
    name: "태엽 아가미",
    rarity: "uncommon",
    icon: "gill",
    timing: "턴 시작",
    text: "체력이 절반 이하이면 턴 시작마다 카드 1장을 추가로 뽑습니다."
  }),
  relic({
    id: "brittle_crown",
    name: "깨지기 쉬운 왕관",
    rarity: "rare",
    icon: "crown",
    timing: "획득",
    text: "획득 시 크레딧 90. 이후 전투 보상 크레딧이 25% 감소합니다."
  }),
  relic({
    id: "echo_chamber",
    name: "잔향실",
    rarity: "rare",
    icon: "echo",
    timing: "전투 시작",
    text: "매 전투 시작 시 잔향 1을 얻습니다."
  }),
  relic({
    id: "black_coral",
    name: "검은 산호",
    rarity: "rare",
    icon: "coral",
    timing: "상태 부여",
    text: "카드로 부여하는 바이러스가 1 증가합니다."
  }),
  relic({
    id: "diver_medal",
    name: "잠수부 훈장",
    rarity: "uncommon",
    icon: "medal",
    timing: "엘리트",
    text: "엘리트 전투 보상 크레딧이 35 증가합니다."
  }),
  relic({
    id: "lens_prism",
    name: "렌즈 프리즘",
    rarity: "uncommon",
    icon: "prism",
    timing: "공격",
    text: "표식의 추가 피해가 2 증가합니다."
  }),
  relic({
    id: "engine_oil",
    name: "엔진 오일",
    rarity: "common",
    icon: "oil",
    timing: "전투 시작",
    text: "첫 턴에 에너지 1을 추가로 얻습니다."
  }),
  relic({
    id: "archive_pass",
    name: "아카이브 패스",
    rarity: "common",
    icon: "pass",
    timing: "상점",
    text: "카드 제거 비용이 30 감소합니다."
  }),
  relic({
    id: "resting_gear",
    name: "정박 장비",
    rarity: "common",
    icon: "gear",
    timing: "휴식",
    text: "휴식 회복량이 10 증가합니다."
  }),
  relic({
    id: "austere_tablet",
    name: "검소한 석판",
    rarity: "rare",
    icon: "tablet",
    timing: "보상",
    text: "카드 보상을 받지 않으면 최대 체력 1을 얻습니다."
  }),
  relic({
    id: "choir_bell",
    name: "성가 종",
    rarity: "rare",
    icon: "bell",
    timing: "전투 시작",
    text: "전투 시작 시 성가 회로 1을 얻습니다."
  }),
  relic({
    id: "sealed_hourglass",
    name: "봉인 모래시계",
    rarity: "rare",
    icon: "hourglass",
    timing: "턴 시작",
    text: "세 번째 턴마다 모든 적에게 약화 1과 취약 1을 부여합니다."
  })
];

export const RELIC_BY_ID = Object.fromEntries(RELICS.map((relicDefinition) => [relicDefinition.id, relicDefinition]));

export const REWARD_RELIC_IDS = RELICS
  .filter((relicDefinition) => relicDefinition.rarity !== "starter")
  .map((relicDefinition) => relicDefinition.id);
