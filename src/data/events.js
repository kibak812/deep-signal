const event = (definition) => definition;

export const EVENTS = [
  event({
    id: "singing_server",
    name: "노래하는 서버랙",
    text: "물먹은 서버랙이 낮은 화음을 낸다. 가까이 갈수록 머릿속 신호가 또렷해진다.",
    choices: [
      { label: "화음을 기록한다", detail: "체력 6을 잃고 무작위 카드를 2장 강화합니다.", effects: [{ op: "loseHp", amount: 6 }, { op: "upgradeRandomDeck", amount: 2 }] },
      { label: "전원을 뽑는다", detail: "크레딧 45를 얻습니다.", effects: [{ op: "gainGold", amount: 45 }] },
      { label: "지나간다", detail: "아무 일도 일어나지 않습니다.", effects: [] }
    ]
  }),
  event({
    id: "coral_contract",
    name: "산호 계약서",
    text: "붉은 산호가 자란 계약서가 맥박처럼 접혔다 펴진다.",
    choices: [
      { label: "서명한다", detail: "희귀 유물 1개를 얻고 저주를 받습니다.", effects: [{ op: "gainRelic", rarity: "rare" }, { op: "addCard", cardId: "dead_letter" }] },
      { label: "작은 글씨만 베낀다", detail: "카드 보상을 받습니다.", effects: [{ op: "cardReward" }] },
      { label: "불태운다", detail: "체력 4를 회복합니다.", effects: [{ op: "heal", amount: 4 }] }
    ]
  }),
  event({
    id: "pressure_gate",
    name: "압력문",
    text: "문 너머에는 짧은 길과 긴 길이 동시에 열린다. 한쪽은 더 깊고 더 위험하다.",
    choices: [
      { label: "비상 밸브를 연다", detail: "체력 8을 잃고 유물 1개를 얻습니다.", effects: [{ op: "loseHp", amount: 8 }, { op: "gainRelic" }] },
      { label: "우회한다", detail: "크레딧 25를 얻습니다.", effects: [{ op: "gainGold", amount: 25 }] }
    ]
  }),
  event({
    id: "forgotten_diver",
    name: "잊힌 잠수복",
    text: "주인 없는 잠수복이 의자에 앉아 있다. 헬멧 안에는 아직 공기가 남아 있다.",
    choices: [
      { label: "산소를 나눈다", detail: "최대 체력 6을 얻고 체력 6을 회복합니다.", effects: [{ op: "gainMaxHp", amount: 6 }, { op: "heal", amount: 6 }] },
      { label: "장비를 챙긴다", detail: "크레딧 55를 얻고 균열 상태로 다음 전투를 시작합니다.", effects: [{ op: "gainGold", amount: 55 }, { op: "gainRunFlag", flag: "startFrail", amount: 2, scope: "nextCombat" }] }
    ]
  }),
  event({
    id: "index_mirror",
    name: "인덱스 미러",
    text: "거울 속 손패가 실제보다 한 장 더 많아 보인다.",
    choices: [
      { label: "반사를 붙잡는다", detail: "덱의 카드를 1장 복제합니다.", effects: [{ op: "duplicateCard" }] },
      { label: "거울을 깨뜨린다", detail: "덱에서 카드를 1장 제거합니다. 체력 3을 잃습니다.", effects: [{ op: "removeCard" }, { op: "loseHp", amount: 3 }] }
    ]
  }),
  event({
    id: "archive_whale",
    name: "아카이브 웨일",
    text: "거대한 저장체가 천천히 지나가며 일부 기억을 삼켜 준다고 제안한다.",
    choices: [
      { label: "가벼운 기억을 맡긴다", detail: "카드를 1장 제거합니다.", effects: [{ op: "removeCard" }] },
      { label: "무거운 기억을 맡긴다", detail: "카드를 2장 제거하고 저주를 받습니다.", effects: [{ op: "removeCard" }, { op: "removeCard" }, { op: "addCard", cardId: "waterlogged_doubt" }] },
      { label: "거절한다", detail: "카드 보상을 받습니다.", effects: [{ op: "cardReward" }] }
    ]
  }),
  event({
    id: "broken_printer",
    name: "고장난 패턴 프린터",
    text: "패턴 프린터가 금속성 데이터를 토하며 아직 작동 중이다.",
    choices: [
      { label: "공격 패턴 출력", detail: "무작위 공격 카드 1장을 얻습니다.", effects: [{ op: "addRandomCard", type: "attack" }] },
      { label: "방어 패턴 출력", detail: "무작위 기술 카드 1장을 얻습니다.", effects: [{ op: "addRandomCard", type: "skill" }] },
      { label: "카트리지를 판다", detail: "크레딧 35를 얻습니다.", effects: [{ op: "gainGold", amount: 35 }] }
    ]
  }),
  event({
    id: "frozen_choir",
    name: "얼어붙은 성가대",
    text: "정지한 합창단의 입 안에 반짝이는 회로가 보인다.",
    choices: [
      { label: "회로를 꺼낸다", detail: "유물 1개를 얻고 체력 7을 잃습니다.", effects: [{ op: "gainRelic" }, { op: "loseHp", amount: 7 }] },
      { label: "같이 노래한다", detail: "카드 1장을 강화하고 체력 4를 회복합니다.", effects: [{ op: "upgradeRandomDeck", amount: 1 }, { op: "heal", amount: 4 }] }
    ]
  }),
  event({
    id: "tidal_lottery",
    name: "해류 복권",
    text: "번호가 없는 복권 단말기가 물결과 함께 깜빡인다.",
    choices: [
      { label: "크레딧 30을 넣는다", detail: "50% 확률로 유물 1개, 아니면 아무것도 없습니다.", effects: [{ op: "loseGold", amount: 30 }, { op: "chanceRelic", chance: 0.5 }] },
      { label: "단말기를 해킹한다", detail: "바이러스 카드 보상을 받지만 저주를 받을 수 있습니다.", effects: [{ op: "addRandomCard", tag: "virus" }, { op: "chanceCurse", chance: 0.35 }] },
      { label: "떠난다", detail: "아무 일도 일어나지 않습니다.", effects: [] }
    ]
  }),
  event({
    id: "warm_current",
    name: "따뜻한 난류",
    text: "희미한 온기가 장갑 안쪽을 채운다.",
    choices: [
      { label: "몸을 맡긴다", detail: "체력 18을 회복합니다.", effects: [{ op: "heal", amount: 18 }] },
      { label: "온기를 병에 담는다", detail: "회복 대신 크레딧 40을 얻습니다.", effects: [{ op: "gainGold", amount: 40 }] }
    ]
  }),
  event({
    id: "null_confessional",
    name: "제로 고해실",
    text: "검은 문 너머에서 지나간 실수 하나쯤은 지울 수 있다고 속삭인다.",
    choices: [
      { label: "고백한다", detail: "카드를 1장 제거하고 최대 체력 4를 잃습니다.", effects: [{ op: "removeCard" }, { op: "loseMaxHp", amount: 4 }] },
      { label: "침묵한다", detail: "최대 체력 4를 얻습니다.", effects: [{ op: "gainMaxHp", amount: 4 }] }
    ]
  }),
  event({
    id: "deep_archive",
    name: "심층 터미널",
    text: "잠긴 터미널에 아직 검증되지 않은 패치 노트가 남아 있다.",
    choices: [
      { label: "패치 노트 실행", detail: "희귀 카드 보상을 받습니다. 체력 5를 잃습니다.", effects: [{ op: "cardReward", rarity: "rare" }, { op: "loseHp", amount: 5 }] },
      { label: "미리보기만 확인", detail: "카드 보상을 받습니다.", effects: [{ op: "cardReward" }] }
    ]
  }),
  event({
    id: "suture_station",
    name: "봉합 정거장",
    text: "자동 수술 팔이 정중하게 비용을 표시한다.",
    choices: [
      { label: "정밀 봉합", detail: "크레딧 45를 내고 체력 22를 회복합니다.", effects: [{ op: "loseGold", amount: 45 }, { op: "heal", amount: 22 }] },
      { label: "불법 개조", detail: "크레딧 60을 내고 최대 체력 8을 얻습니다.", effects: [{ op: "loseGold", amount: 60 }, { op: "gainMaxHp", amount: 8 }] },
      { label: "돌아선다", detail: "아무 일도 일어나지 않습니다.", effects: [] }
    ]
  }),
  event({
    id: "living_margin",
    name: "살아있는 프롬프트",
    text: "깜박이는 프롬프트가 손목 센서를 붙잡고 새 명령을 요구한다.",
    choices: [
      { label: "체력으로 승인", detail: "체력 7을 잃고 카드를 2장 강화합니다.", effects: [{ op: "loseHp", amount: 7 }, { op: "upgradeRandomDeck", amount: 2 }] },
      { label: "크레딧으로 승인", detail: "크레딧 65를 잃고 유물 1개를 얻습니다.", effects: [{ op: "loseGold", amount: 65 }, { op: "gainRelic" }] },
      { label: "비워 둔다", detail: "저주를 받고 최대 체력 10을 얻습니다.", effects: [{ op: "addCard", cardId: "dead_letter" }, { op: "gainMaxHp", amount: 10 }] }
    ]
  }),
  event({
    id: "misfiled_relic",
    name: "오분류된 유물함",
    text: "잘못된 라벨이 붙은 유물함 세 개가 떠 있다.",
    choices: [
      { label: "가벼운 함", detail: "일반 유물 1개를 얻습니다.", effects: [{ op: "gainRelic", rarity: "common" }] },
      { label: "무거운 함", detail: "희귀 유물일 수 있지만 체력 9를 잃습니다.", effects: [{ op: "loseHp", amount: 9 }, { op: "gainRelic", rarity: "rare" }] },
      { label: "봉인을 판다", detail: "크레딧 50을 얻습니다.", effects: [{ op: "gainGold", amount: 50 }] }
    ]
  }),
  event({
    id: "echo_bazaar",
    name: "잔향 시장",
    text: "상인 없는 시장에 가격표만 남아 있다.",
    choices: [
      { label: "싼 기억을 산다", detail: "크레딧 30을 내고 카드 보상을 받습니다.", effects: [{ op: "loseGold", amount: 30 }, { op: "cardReward" }] },
      { label: "비싼 기억을 산다", detail: "크레딧 75를 내고 희귀 카드 보상을 받습니다.", effects: [{ op: "loseGold", amount: 75 }, { op: "cardReward", rarity: "rare" }] },
      { label: "가격표를 훔친다", detail: "크레딧 25를 얻고 다음 전투 시작 시 취약 2.", effects: [{ op: "gainGold", amount: 25 }, { op: "gainRunFlag", flag: "startVulnerable", amount: 2, scope: "nextCombat" }] }
    ]
  }),
  event({
    id: "cracked_bell",
    name: "금 간 종",
    text: "종을 치면 덱 전체가 한 번 흔들릴 것 같다.",
    choices: [
      { label: "세게 친다", detail: "모든 카드 중 3장을 무작위 강화하고 체력 10을 잃습니다.", effects: [{ op: "upgradeRandomDeck", amount: 3 }, { op: "loseHp", amount: 10 }] },
      { label: "살짝 친다", detail: "무작위 카드 1장을 강화합니다.", effects: [{ op: "upgradeRandomDeck", amount: 1 }] },
      { label: "종을 판다", detail: "크레딧 35를 얻습니다.", effects: [{ op: "gainGold", amount: 35 }] }
    ]
  }),
  event({
    id: "suspended_trial",
    name: "정지된 재판",
    text: "시간이 멈춘 법정에서 판결문만 움직인다.",
    choices: [
      { label: "무죄를 주장한다", detail: "전투를 치르고 승리하면 유물 1개를 얻습니다.", effects: [{ op: "eventCombat", rewardRelic: true }] },
      { label: "벌금을 낸다", detail: "크레딧 45를 잃고 카드를 1장 제거합니다.", effects: [{ op: "loseGold", amount: 45 }, { op: "removeCard" }] }
    ]
  }),
  event({
    id: "ink_reef",
    name: "블랙 데이터 암초",
    text: "검은 데이터가 카드의 구조를 바꾸려 한다.",
    choices: [
      { label: "덱을 담근다", detail: "무작위 카드 1장을 희귀 카드로 변환합니다.", effects: [{ op: "transformCard", rarity: "rare" }] },
      { label: "손끝만 담근다", detail: "카드 1장을 강화합니다.", effects: [{ op: "upgradeRandomDeck", amount: 1 }] },
      { label: "떠난다", detail: "체력 3을 회복합니다.", effects: [{ op: "heal", amount: 3 }] }
    ]
  }),
  event({
    id: "final_waystation",
    name: "라스트 스테이션",
    text: "깊은 층으로 내려가기 전, 오래된 스테이션이 마지막 정비를 허락한다.",
    choices: [
      { label: "전투 기록 정리", detail: "카드 1장을 제거하고 크레딧 20을 얻습니다.", effects: [{ op: "removeCard" }, { op: "gainGold", amount: 20 }] },
      { label: "비상 전원 충전", detail: "최대 체력 5와 전투 시작 전하 보너스를 얻습니다.", effects: [{ op: "gainMaxHp", amount: 5 }, { op: "gainRunFlag", flag: "startCharge", amount: 2 }] },
      { label: "휴식", detail: "체력 14를 회복합니다.", effects: [{ op: "heal", amount: 14 }] }
    ]
  })
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((eventDefinition) => [eventDefinition.id, eventDefinition]));
