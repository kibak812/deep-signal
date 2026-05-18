const enemy = (definition) => definition;

export const ENEMIES = [
  enemy({
    id: "silt_clerk",
    name: "실트 스캐너",
    tier: "normal",
    hp: [32, 38],
    sprite: "clerk",
    description: "오래된 로그를 무기로 삼는 하급 인덱스체.",
    moves: [
      { id: "stamp", label: "태그 샷", intent: "공격 7", type: "attack", damage: 7 },
      { id: "file", label: "캐시 방벽", intent: "방어 8", type: "defend", block: 8 },
      { id: "late_fee", label: "지연 패널티", intent: "취약 1", type: "debuff", applyToPlayer: [{ status: "vulnerable", amount: 1 }] }
    ]
  }),
  enemy({
    id: "lantern_crab",
    name: "랜턴 집게",
    tier: "normal",
    hp: [28, 34],
    sprite: "crab",
    description: "청색 신호를 흔들며 틈을 노리는 샐비지 기계.",
    moves: [
      { id: "snap", label: "집게질", intent: "공격 4 x2", type: "attack", damage: 4, hits: 2 },
      { id: "glow", label: "과열등", intent: "증폭 1", type: "buff", self: [{ status: "strength", amount: 1 }] },
      { id: "pinch", label: "압착", intent: "공격 10", type: "attack", damage: 10 }
    ]
  }),
  enemy({
    id: "index_wisp",
    name: "인덱스 글로우",
    tier: "normal",
    hp: [24, 30],
    sprite: "wisp",
    description: "패킷 사이에 숨어 약화 신호를 뿌린다.",
    moves: [
      { id: "static", label: "정전기", intent: "약화 2", type: "debuff", applyToPlayer: [{ status: "weak", amount: 2 }] },
      { id: "spark", label: "스파크", intent: "공격 9", type: "attack", damage: 9 },
      { id: "veil", label: "막 형성", intent: "방어 6", type: "defend", block: 6 }
    ]
  }),
  enemy({
    id: "rust_choir",
    name: "녹 성가대",
    tier: "normal",
    hp: [36, 44],
    sprite: "choir",
    description: "합창으로 감염 코드를 밀어 넣는 작은 기계 합창단.",
    moves: [
      { id: "chorus", label: "감염 성가", intent: "바이러스 2", type: "debuff", applyToPlayer: [{ status: "virus", amount: 2 }] },
      { id: "clash", label: "불협", intent: "공격 12", type: "attack", damage: 12 },
      { id: "hymn", label: "보호 찬가", intent: "방어 7, 증폭 1", type: "defend", block: 7, self: [{ status: "strength", amount: 1 }] },
      { id: "call_mite", label: "작은 합창", intent: "소환", type: "summon", summon: [{ enemyId: "ledger_mite", count: 1, hpScale: 0.6 }] }
    ]
  }),
  enemy({
    id: "glass_eel",
    name: "유리 장어",
    tier: "normal",
    hp: [26, 32],
    sprite: "eel",
    description: "얇은 몸체로 방어 틈을 파고드는 전도체.",
    moves: [
      { id: "slip", label: "미끄럼", intent: "공격 6, 약화 1", type: "attack", damage: 6, applyToPlayer: [{ status: "weak", amount: 1 }] },
      { id: "coil", label: "감기", intent: "방어 10", type: "defend", block: 10 },
      { id: "bite", label: "관통 이빨", intent: "공격 14", type: "attack", damage: 14 }
    ]
  }),
  enemy({
    id: "archive_leech",
    name: "로그 흡착자",
    tier: "normal",
    hp: [30, 36],
    sprite: "leech",
    description: "메모리 찌꺼기를 빨아들여 스스로를 복구한다.",
    moves: [
      { id: "drink", label: "흡착", intent: "공격 8, 회복 4", type: "attack", damage: 8, heal: 4 },
      { id: "clot", label: "응고", intent: "방어 9", type: "defend", block: 9 },
      { id: "sap", label: "탈력", intent: "약화 1, 균열 1", type: "debuff", applyToPlayer: [{ status: "weak", amount: 1 }, { status: "frail", amount: 1 }] }
    ]
  }),
  enemy({
    id: "brine_sentinel",
    name: "염수 파수기",
    tier: "normal",
    hp: [42, 50],
    sprite: "sentinel",
    description: "오래된 보안 명령만 남은 두꺼운 감시체.",
    moves: [
      { id: "guard", label: "경계 자세", intent: "방어 12", type: "defend", block: 12 },
      { id: "strike", label: "봉 타격", intent: "공격 13", type: "attack", damage: 13 },
      { id: "scan", label: "침입 판독", intent: "취약 2", type: "debuff", applyToPlayer: [{ status: "vulnerable", amount: 2 }] }
    ]
  }),
  enemy({
    id: "cipher_ray",
    name: "암호 가오리",
    tier: "normal",
    hp: [34, 40],
    sprite: "ray",
    description: "빛나는 암호막으로 공격 순서를 흐린다.",
    moves: [
      { id: "glide", label: "활강 절단", intent: "공격 10", type: "attack", damage: 10 },
      { id: "encrypt", label: "암호막", intent: "방어 7, 약화 1", type: "defend", block: 7, applyToPlayer: [{ status: "weak", amount: 1 }] },
      { id: "pulse", label: "파동", intent: "공격 4 x3", type: "attack", damage: 4, hits: 3 }
    ]
  }),
  enemy({
    id: "coral_hound",
    name: "산호 추적견",
    tier: "normal",
    hp: [30, 36],
    sprite: "hound",
    description: "붉은 산호 뼈대가 목표의 흔적을 쫓는다.",
    moves: [
      { id: "maul", label: "물어뜯기", intent: "공격 11", type: "attack", damage: 11 },
      { id: "sniff", label: "추적", intent: "표식 2", type: "debuff", applyToPlayer: [{ status: "mark", amount: 2 }] },
      { id: "pounce", label: "도약", intent: "공격 7 x2", type: "attack", damage: 7, hits: 2 }
    ]
  }),
  enemy({
    id: "drowned_page",
    name: "익사한 페이지",
    tier: "normal",
    hp: [20, 26],
    sprite: "page",
    description: "끊어진 패킷처럼 떠다니며 저주를 남긴다.",
    moves: [
      { id: "paper_cut", label: "데이터 베기", intent: "공격 6", type: "attack", damage: 6 },
      { id: "smear", label: "데이터 번짐", intent: "바이러스 1", type: "debuff", applyToPlayer: [{ status: "virus", amount: 1 }] },
      { id: "fold", label: "접힘 보호", intent: "방어 5", type: "defend", block: 5 }
    ]
  }),
  enemy({
    id: "barnacle_drone",
    name: "따개비 드론",
    tier: "normal",
    hp: [38, 46],
    sprite: "drone",
    description: "벽면에 붙어 보조 장갑을 계속 재생한다.",
    moves: [
      { id: "drill", label: "천공", intent: "공격 12", type: "attack", damage: 12 },
      { id: "plates", label: "장갑 재생", intent: "방어 14", type: "defend", block: 14 },
      { id: "rattle", label: "소음", intent: "약화 2", type: "debuff", applyToPlayer: [{ status: "weak", amount: 2 }] },
      { id: "bud", label: "따개비 분리", intent: "소환", type: "summon", summon: [{ enemyId: "ledger_mite", count: 1, hpScale: 0.7 }] }
    ]
  }),
  enemy({
    id: "null_squid",
    name: "제로 스퀴드",
    tier: "normal",
    hp: [32, 38],
    sprite: "squid",
    description: "촉수 끝에서 계산되지 않은 공백을 뿜는다.",
    moves: [
      { id: "ink", label: "무효 먹물", intent: "균열 2", type: "debuff", applyToPlayer: [{ status: "frail", amount: 2 }] },
      { id: "lash", label: "촉수 타격", intent: "공격 5 x2", type: "attack", damage: 5, hits: 2 },
      { id: "cloak", label: "흐림막", intent: "방어 8", type: "defend", block: 8 }
    ]
  }),
  enemy({
    id: "ledger_mite",
    name: "로그 진드기",
    tier: "normal",
    hp: [18, 24],
    sprite: "mite",
    description: "작지만 여러 번 달려들며 계산을 어지럽힌다.",
    moves: [
      { id: "nibble", label: "갉기", intent: "공격 2 x3", type: "attack", damage: 2, hits: 3 },
      { id: "hide", label: "로그 숨기", intent: "방어 6", type: "defend", block: 6 },
      { id: "itch", label: "간지럼 코드", intent: "약화 1", type: "debuff", applyToPlayer: [{ status: "weak", amount: 1 }] }
    ]
  }),
  enemy({
    id: "bell_diver",
    name: "종 잠수부",
    tier: "normal",
    hp: [44, 52],
    sprite: "diver",
    description: "낡은 잠수종 안에서 강공격을 충전한다.",
    moves: [
      { id: "charge", label: "종 울림 예고", intent: "증폭 3", type: "buff", self: [{ status: "strength", amount: 3 }] },
      { id: "slam", label: "강하 충돌", intent: "공격 18", type: "attack", damage: 18 },
      { id: "brace", label: "압력 버팀", intent: "방어 10", type: "defend", block: 10 }
    ]
  }),
  enemy({
    id: "mirror_jelly",
    name: "거울 해파리",
    tier: "normal",
    hp: [26, 34],
    sprite: "jelly",
    description: "방어막을 비추어 반격 기회를 만든다.",
    moves: [
      { id: "sting", label: "반사 침", intent: "공격 9", type: "attack", damage: 9 },
      { id: "mirror", label: "거울막", intent: "방어 8, 반격 2", type: "defend", block: 8, self: [{ status: "counter", amount: 2 }] },
      { id: "blur", label: "빛 번짐", intent: "취약 1", type: "debuff", applyToPlayer: [{ status: "vulnerable", amount: 1 }] }
    ]
  }),
  enemy({
    id: "axiom_bailiff",
    name: "공리 집행관",
    tier: "elite",
    hp: [86, 96],
    sprite: "bailiff",
    description: "전투 규칙을 강제로 집행하는 엘리트 관리자.",
    moves: [
      { id: "sentence", label: "판결", intent: "공격 15", type: "attack", damage: 15 },
      { id: "injunction", label: "금지명령", intent: "약화 2, 취약 1", type: "debuff", applyToPlayer: [{ status: "weak", amount: 2 }, { status: "vulnerable", amount: 1 }] },
      { id: "seal", label: "법정 봉인", intent: "방어 18, 증폭 2", type: "defend", block: 18, self: [{ status: "strength", amount: 2 }] }
    ]
  }),
  enemy({
    id: "coral_engine",
    name: "산호 엔진",
    tier: "elite",
    hp: [92, 104],
    sprite: "engine",
    description: "맞을수록 붉은 압력을 쌓는 장치.",
    moves: [
      { id: "pump", label: "압력 펌프", intent: "증폭 3, 방어 12", type: "defend", block: 12, self: [{ status: "strength", amount: 3 }] },
      { id: "burst", label: "압력 방출", intent: "공격 10 x2", type: "attack", damage: 10, hits: 2 },
      { id: "spores", label: "산호 포자", intent: "바이러스 3", type: "debuff", applyToPlayer: [{ status: "virus", amount: 3 }] }
    ]
  }),
  enemy({
    id: "mnemonic_knight",
    name: "기억 기사",
    tier: "elite",
    hp: [76, 86],
    sprite: "knight",
    description: "막고 되받아치며 오래된 맹세를 지킨다.",
    moves: [
      { id: "riposte", label: "회상 반격", intent: "방어 14, 반격 4", type: "defend", block: 14, self: [{ status: "counter", amount: 4 }] },
      { id: "lance", label: "기억 창", intent: "공격 17", type: "attack", damage: 17 },
      { id: "oath", label: "전투 맹세", intent: "증폭 1, 취약 1", type: "buff", self: [{ status: "strength", amount: 1 }], applyToPlayer: [{ status: "vulnerable", amount: 1 }] }
    ]
  }),
  enemy({
    id: "viral_cantor",
    name: "감염 선창자",
    tier: "elite",
    hp: [74, 84],
    sprite: "cantor",
    description: "감염을 축적한 뒤 큰 합창으로 폭발시킨다.",
    moves: [
      { id: "infect", label: "감염 선율", intent: "바이러스 3", type: "debuff", applyToPlayer: [{ status: "virus", amount: 3 }] },
      { id: "solo", label: "단독 성가", intent: "공격 7 x3", type: "attack", damage: 7, hits: 3 },
      { id: "ward", label: "음벽", intent: "방어 16", type: "defend", block: 16 },
      { id: "choir_call", label: "감염 복창", intent: "소환, 바이러스 1", type: "summon", summon: [{ enemyId: "rust_choir", count: 1, hpScale: 0.55 }], applyToPlayer: [{ status: "virus", amount: 1 }] }
    ]
  }),
  enemy({
    id: "anchor_colossus",
    name: "닻 거상",
    tier: "elite",
    hp: [104, 118],
    sprite: "colossus",
    description: "느리지만 강한 공격을 예고하는 거대 보초.",
    moves: [
      { id: "raise", label: "닻 들기", intent: "다음 강공격, 방어 10", type: "defend", block: 10, self: [{ status: "strength", amount: 1 }] },
      { id: "drop", label: "심해 낙하", intent: "공격 28", type: "attack", damage: 28 },
      { id: "chain", label: "사슬 끌기", intent: "공격 12, 균열 2", type: "attack", damage: 12, applyToPlayer: [{ status: "frail", amount: 2 }] }
    ]
  }),
  enemy({
    id: "the_cataloger",
    name: "대분류자 칼리스",
    tier: "boss",
    act: 1,
    hp: [128, 144],
    sprite: "cataloger",
    description: "모든 기억에 번호를 붙여 손패 흐름을 흐트러뜨린다.",
    mechanic: "카드를 충분히 뽑고 약화·취약·바이러스를 빨리 지워야 버틸 수 있습니다. 2단계부터는 졸개를 부르고 여러 번 공격합니다.",
    phaseName: "인덱스 폭주",
    phaseAt: 0.5,
    moves: [
      { id: "sort", label: "분류 명령", intent: "공격 10, 약화 1", type: "attack", damage: 10, applyToPlayer: [{ status: "weak", amount: 1 }] },
      { id: "shelve", label: "재서가", intent: "방어 18", type: "defend", block: 18 },
      { id: "overdue", label: "기한 초과", intent: "취약 1, 바이러스 1", type: "debuff", applyToPlayer: [{ status: "vulnerable", amount: 1 }, { status: "virus", amount: 1 }] },
      { id: "summon_pages", phase: 2, label: "쪽 분류", intent: "소환", type: "summon", summon: [{ enemyId: "drowned_page", count: 1, hpScale: 0.36 }] },
      { id: "phase_sort", phase: 2, label: "인덱스 폭주", intent: "공격 6 x3", type: "attack", damage: 6, hits: 3 }
    ]
  }),
  enemy({
    id: "drowned_algorithm",
    name: "익사한 알고리즘",
    tier: "boss",
    act: 2,
    hp: [166, 184],
    sprite: "algorithm",
    description: "무리한 선택의 대가를 되돌려 묻는 심층 계산체.",
    mechanic: "전투가 길어질수록 증폭과 바이러스로 체력을 갉아먹습니다. 2단계부터는 취약 뒤 연속 공격을 합니다.",
    phaseName: "심층 충돌",
    phaseAt: 0.45,
    moves: [
      { id: "compile", label: "낡은 조립", intent: "증폭 1, 방어 12", type: "defend", block: 12, self: [{ status: "strength", amount: 1 }] },
      { id: "overflow", label: "넘침", intent: "공격 16", type: "attack", damage: 16 },
      { id: "leak", label: "기억 누수", intent: "바이러스 2", type: "debuff", applyToPlayer: [{ status: "virus", amount: 2 }] },
      { id: "phase_crash", phase: 2, label: "심층 충돌", intent: "공격 9 x2, 취약 1", type: "attack", damage: 9, hits: 2, applyToPlayer: [{ status: "vulnerable", amount: 1 }] }
    ]
  }),
  enemy({
    id: "last_gate_choir",
    name: "마지막 문 성가대",
    tier: "boss",
    act: 3,
    hp: [230, 260],
    sprite: "lastgate",
    description: "데이터 심해의 마지막 문을 지키는 최종 보스.",
    mechanic: "바이러스, 큰 방어벽, 소환, 연속 강공격이 차례로 몰아칩니다. 2단계부터는 약화와 소환이 겹쳐 방어와 마무리 피해가 모두 필요합니다.",
    phaseName: "종말 레퀴엠",
    phaseAt: 0.5,
    moves: [
      { id: "intonation", label: "개문 선율", intent: "바이러스 3", type: "debuff", applyToPlayer: [{ status: "virus", amount: 3 }] },
      { id: "choir_wall", label: "합창벽", intent: "방어 21, 증폭 1", type: "defend", block: 21, self: [{ status: "strength", amount: 1 }] },
      { id: "gate_slam", label: "문 낙하", intent: "공격 22", type: "attack", damage: 22 },
      { id: "gate_call", phase: 2, label: "문지기 호출", intent: "소환, 약화 1", type: "summon", summon: [{ enemyId: "mirror_jelly", count: 1, hpScale: 0.7 }], applyToPlayer: [{ status: "weak", amount: 1 }] },
      { id: "phase_requiem", phase: 2, label: "종말 레퀴엠", intent: "공격 7 x4", type: "attack", damage: 7, hits: 4 }
    ]
  })
];

export const ENEMY_BY_ID = Object.fromEntries(ENEMIES.map((enemyDefinition) => [enemyDefinition.id, enemyDefinition]));
export const NORMAL_ENEMY_IDS = ENEMIES.filter((enemyDefinition) => enemyDefinition.tier === "normal").map((enemyDefinition) => enemyDefinition.id);
export const ELITE_ENEMY_IDS = ENEMIES.filter((enemyDefinition) => enemyDefinition.tier === "elite").map((enemyDefinition) => enemyDefinition.id);
export const BOSS_IDS = ENEMIES.filter((enemyDefinition) => enemyDefinition.tier === "boss").map((enemyDefinition) => enemyDefinition.id);
