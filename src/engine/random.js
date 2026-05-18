export function hashSeed(input = `${Date.now()}`) {
  const text = String(input);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function nextRandom(state) {
  let value = state >>> 0;
  value += 0x6d2b79f5;
  let next = Math.imul(value ^ (value >>> 15), value | 1);
  next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
  return {
    state: value >>> 0,
    value: ((next ^ (next >>> 14)) >>> 0) / 4294967296
  };
}

export function random(run) {
  const result = nextRandom(run.rngState);
  run.rngState = result.state;
  return result.value;
}

export function randomInt(run, min, max) {
  return Math.floor(random(run) * (max - min + 1)) + min;
}

export function choice(run, values) {
  return values[Math.floor(random(run) * values.length)];
}

export function shuffle(run, values) {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random(run) * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

export function weightedChoice(run, entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random(run) * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return entries.at(-1).value;
}
