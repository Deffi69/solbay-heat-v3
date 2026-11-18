// SOLBAY HEAT — deterministic randomness helpers.
// The city, traffic and pedestrians are seeded, so a given ?seed= stages the same
// streets every time. Nothing here is copied from any other game.
export function makeRng(seed) {
  // mulberry32, a small well-known seeded PRNG.
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromText(text) {
  // FNV-1a hash: turns a seed string into a 32-bit number.
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickFrom(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function between(rng, low, high) {
  return low + rng() * (high - low);
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clamp(v, low, high) {
  return v < low ? low : v > high ? high : v;
}

export function mix(a, b, t) {
  return a + (b - a) * t;
}

// Shortest-arc interpolation between two headings.
export function turnToward(current, target, t) {
  let delta = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * t;
}

export function distSq(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}
