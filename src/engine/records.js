export function defaultRecords() {
  return {
    runs: 0,
    wins: 0,
    losses: 0,
    bestFloor: 0,
    bossesKilled: 0,
    bestDamage: 0,
    builds: {},
    bosses: {},
    difficulties: {},
    dailyContracts: { runs: 0, wins: 0, bestFloor: 0, history: [] },
    history: []
  };
}

export function normalizeRecords(raw) {
  const defaults = defaultRecords();
  if (!raw || typeof raw !== "object") return defaults;
  return {
    ...defaults,
    ...raw,
    builds: raw.builds ?? {},
    bosses: raw.bosses ?? {},
    difficulties: normalizeDifficultyRecords(raw.difficulties),
    dailyContracts: normalizeDailyContractRecords(raw.dailyContracts),
    history: Array.isArray(raw.history) ? raw.history.map(normalizeHistoryEntry).filter(Boolean).slice(0, 12) : []
  };
}

export function recordRunSummary(records, run, completedAt = Date.now()) {
  if (!run?.summary || run.summary.recorded) return records;
  const next = normalizeRecords(records);
  run.summary.recorded = true;
  next.runs += 1;
  if (run.summary.won) next.wins += 1;
  else next.losses += 1;
  next.bestFloor = Math.max(next.bestFloor, run.summary.floors);
  next.bossesKilled += run.summary.bossesDefeated;
  next.bestDamage = Math.max(next.bestDamage, run.summary.damageDealt);
  recordDifficultySummary(next, run, completedAt);
  recordDailyContractSummary(next, run, completedAt);

  for (const tag of run.summary.build) {
    next.builds[tag] = (next.builds[tag] ?? 0) + 1;
  }
  for (const boss of run.summary.killedBosses ?? []) {
    next.bosses[boss] = (next.bosses[boss] ?? 0) + 1;
  }

  next.history = [
    {
      id: run.id,
      completedAt,
      won: run.summary.won,
      reason: run.summary.reason,
      seed: run.summary.seed ?? run.seed,
      difficultyId: run.summary.difficultyId ?? run.difficulty ?? 0,
      difficulty: run.summary.difficulty ?? "표층",
      challenge: run.summary.challenge ?? null,
      challengeType: run.summary.challengeType ?? run.challenge?.type ?? null,
      challengeDate: run.summary.challengeDate ?? run.challenge?.date ?? null,
      challengeModifiers: Array.isArray(run.summary.challengeModifiers) ? run.summary.challengeModifiers : (run.challenge?.modifiers ?? []),
      challengeModifierNames: Array.isArray(run.summary.challengeModifierNames) ? run.summary.challengeModifierNames : [],
      durationSeconds: run.summary.durationSeconds ?? 0,
      floors: run.summary.floors,
      bossesDefeated: run.summary.bossesDefeated,
      killedBosses: run.summary.killedBosses ?? [],
      deckSize: run.summary.deckSize,
      relics: run.summary.relics,
      gold: run.summary.gold ?? run.player?.gold ?? 0,
      hp: run.summary.hp ?? run.player?.hp ?? 0,
      maxHp: run.summary.maxHp ?? run.player?.maxHp ?? 0,
      cardsAdded: run.summary.cardsAdded ?? 0,
      cardsRemoved: run.summary.cardsRemoved ?? 0,
      damageDealt: run.summary.damageDealt,
      damageTaken: run.summary.damageTaken ?? 0,
      route: normalizeRouteSummary(run.summary.route),
      build: run.summary.build
    },
    ...next.history
  ].slice(0, 12);

  return next;
}

function recordDailyContractSummary(records, run, completedAt) {
  const summary = run.summary;
  const type = summary.challengeType ?? run.challenge?.type;
  if (type !== "daily") return;
  const daily = normalizeDailyContractRecords(records.dailyContracts);
  const date = summary.challengeDate ?? run.challenge?.date ?? new Date(completedAt).toISOString().slice(0, 10);
  const modifiers = dailyModifierNames(run);
  daily.runs += 1;
  if (summary.won) daily.wins += 1;
  daily.bestFloor = Math.max(daily.bestFloor, summary.floors ?? 0);
  daily.history = [
    {
      id: run.id,
      completedAt,
      date,
      won: Boolean(summary.won),
      seed: summary.seed ?? run.seed ?? "",
      difficultyId: Number(summary.difficultyId ?? run.difficulty ?? 0),
      difficulty: summary.difficulty ?? "표층",
      floors: summary.floors ?? 0,
      bossesDefeated: summary.bossesDefeated ?? 0,
      modifiers,
      build: Array.isArray(summary.build) ? summary.build : []
    },
    ...daily.history
  ].slice(0, 10);
  records.dailyContracts = daily;
}

function dailyModifierNames(run) {
  const names = Array.isArray(run.summary.challengeModifierNames) ? run.summary.challengeModifierNames.filter(Boolean) : [];
  if (names.length) return names;
  const ids = Array.isArray(run.summary.challengeModifiers) ? run.summary.challengeModifiers : (run.challenge?.modifiers ?? []);
  return ids.filter(Boolean);
}

function recordDifficultySummary(records, run, completedAt) {
  const difficultyId = Number(run.summary.difficultyId ?? run.difficulty ?? 0);
  const key = String(difficultyId);
  const entry = normalizeDifficultyEntry(records.difficulties[key]);
  entry.id = difficultyId;
  entry.name = run.summary.difficulty ?? entry.name ?? "표층";
  entry.runs += 1;
  if (run.summary.won) entry.wins += 1;
  else entry.losses += 1;
  entry.bestFloor = Math.max(entry.bestFloor, run.summary.floors ?? 0);
  entry.bossesKilled += run.summary.bossesDefeated ?? 0;
  entry.bestDamage = Math.max(entry.bestDamage, run.summary.damageDealt ?? 0);
  entry.lastSeed = run.summary.seed ?? run.seed ?? "";
  entry.lastCompletedAt = completedAt;
  entry.lastWon = Boolean(run.summary.won);
  records.difficulties[key] = entry;
}

function normalizeDifficultyRecords(raw) {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw)
      .map(([key, value]) => [key, normalizeDifficultyEntry(value)])
      .filter(([, value]) => value)
  );
}

function normalizeDifficultyEntry(entry) {
  const source = entry && typeof entry === "object" ? entry : {};
  return {
    id: Number.isFinite(Number(source.id)) ? Number(source.id) : 0,
    name: typeof source.name === "string" ? source.name : "",
    runs: Number(source.runs) || 0,
    wins: Number(source.wins) || 0,
    losses: Number(source.losses) || 0,
    bestFloor: Number(source.bestFloor) || 0,
    bossesKilled: Number(source.bossesKilled) || 0,
    bestDamage: Number(source.bestDamage) || 0,
    lastSeed: typeof source.lastSeed === "string" ? source.lastSeed : "",
    lastCompletedAt: Number(source.lastCompletedAt) || 0,
    lastWon: Boolean(source.lastWon)
  };
}

function normalizeDailyContractRecords(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    runs: Number(source.runs) || 0,
    wins: Number(source.wins) || 0,
    bestFloor: Number(source.bestFloor) || 0,
    history: Array.isArray(source.history) ? source.history.map(normalizeDailyContractEntry).filter(Boolean).slice(0, 10) : []
  };
}

function normalizeDailyContractEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    id: typeof entry.id === "string" ? entry.id : "",
    completedAt: Number(entry.completedAt) || 0,
    date: typeof entry.date === "string" ? entry.date : "",
    won: Boolean(entry.won),
    seed: typeof entry.seed === "string" ? entry.seed : "",
    difficultyId: Number.isFinite(Number(entry.difficultyId)) ? Number(entry.difficultyId) : 0,
    difficulty: typeof entry.difficulty === "string" ? entry.difficulty : "표층",
    floors: Number(entry.floors) || 0,
    bossesDefeated: Number(entry.bossesDefeated) || 0,
    modifiers: Array.isArray(entry.modifiers) ? entry.modifiers.filter(Boolean) : [],
    build: Array.isArray(entry.build) ? entry.build : []
  };
}

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    ...entry,
    killedBosses: Array.isArray(entry.killedBosses) ? entry.killedBosses : [],
    build: Array.isArray(entry.build) ? entry.build : [],
    seed: typeof entry.seed === "string" ? entry.seed : "",
    difficultyId: Number.isFinite(Number(entry.difficultyId)) ? Number(entry.difficultyId) : 0,
    challengeType: typeof entry.challengeType === "string" ? entry.challengeType : null,
    challengeDate: typeof entry.challengeDate === "string" ? entry.challengeDate : null,
    challengeModifiers: Array.isArray(entry.challengeModifiers) ? entry.challengeModifiers : [],
    challengeModifierNames: Array.isArray(entry.challengeModifierNames) ? entry.challengeModifierNames : [],
    durationSeconds: Number(entry.durationSeconds) || 0,
    cardsAdded: Number(entry.cardsAdded) || 0,
    cardsRemoved: Number(entry.cardsRemoved) || 0,
    damageTaken: Number(entry.damageTaken) || 0,
    gold: Number(entry.gold) || 0,
    hp: Number(entry.hp) || 0,
    maxHp: Number(entry.maxHp) || 0,
    route: normalizeRouteSummary(entry.route)
  };
}

function normalizeRouteSummary(route) {
  const source = route && typeof route === "object" ? route : {};
  const acts = Array.isArray(source.acts) ? source.acts : [];
  return {
    totalFloors: Number(source.totalFloors) || 0,
    elites: Number(source.elites) || 0,
    events: Number(source.events) || 0,
    shops: Number(source.shops) || 0,
    rests: Number(source.rests) || 0,
    bosses: Number(source.bosses) || 0,
    acts: [1, 2, 3].map((act) => normalizeRouteAct(acts.find((entry) => Number(entry?.act) === act), act))
  };
}

function normalizeRouteAct(entry, act) {
  const source = entry && typeof entry === "object" ? entry : {};
  const stoppedAt = source.stoppedAt && typeof source.stoppedAt === "object"
    ? {
        floor: Number(source.stoppedAt.floor) || 0,
        type: typeof source.stoppedAt.type === "string" ? source.stoppedAt.type : "",
        completed: Boolean(source.stoppedAt.completed)
      }
    : null;
  return {
    act,
    floors: Number(source.floors) || 0,
    lastFloor: Number(source.lastFloor) || 0,
    stoppedAt,
    boss: ["defeated", "reached", "unseen"].includes(source.boss) ? source.boss : "unseen",
    combat: Number(source.combat) || 0,
    elite: Number(source.elite) || 0,
    event: Number(source.event) || 0,
    shop: Number(source.shop) || 0,
    rest: Number(source.rest) || 0
  };
}
