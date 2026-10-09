export const COLOR = {
  void: '#050812',
  hull: '#0b1129',
  limb: '#5cc8ff',
  gold: '#f5bd4f',
  star: '#e6ecff',
  dust: '#8a95b8',
};
export const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";
export const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const r2 = (x) => +x.toFixed(2);
export const pct = (x) => `${+x.toFixed(3)}%`;
export const fmt = (x) => x.toLocaleString('en-US');
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mix(a, b, t) {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

export function ramp(stops, t) {
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      return mix(c0, c1, (t - t0) / (t1 - t0));
    }
  }
  return stops.at(-1)[1];
}

export function starfield(rand, { count, width, height, avoid = () => false, twinkle = 0 }) {
  const stars = [];
  let twinkling = 0;
  while (stars.length < count) {
    const x = rand() * width;
    const y = rand() * height;
    const r = 0.35 + rand() ** 3 * 1.25;
    const opacity = 0.25 + rand() * 0.65;
    const tint = rand();
    if (avoid(x, y)) continue;
    const fill = tint > 0.94 ? '#ffe3ad' : tint > 0.82 ? '#cfe6ff' : COLOR.star;
    let anim = '';
    if (twinkling < twinkle && r > 0.8) {
      twinkling++;
      anim = ` class="tw" style="animation-delay:-${r2(rand() * 6)}s;animation-duration:${r2(3 + rand() * 4)}s"`;
    }
    stars.push(`<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="${fill}" opacity="${r2(opacity)}"${anim}/>`);
  }
  return stars.join('');
}

const GLYPHS = {
  L: { w: 40, d: 'M5 0V55H40' },
  U: { w: 42, d: 'M5 0V39A16 16 0 0 0 37 39V0' },
  T: { w: 42, d: 'M0 5H42M21 5V60' },
  I: { w: 10, d: 'M5 0V60' },
  F: { w: 38, d: 'M5 60V5H38M5 31H31' },
  A: { w: 46, poly: '19,0 27,0 46,60 35,60 23,20 11,60 0,60' },
};

export function wordmark(text, tracking = 14, space = 34) {
  let x = 0;
  const parts = [];
  for (const ch of text) {
    if (ch === ' ') {
      x += space - tracking;
      continue;
    }
    const g = GLYPHS[ch];
    parts.push(
      g.poly
        ? `<polygon transform="translate(${x})" points="${g.poly}"/>`
        : `<path transform="translate(${x})" d="${g.d}"/>`,
    );
    x += g.w + tracking;
  }
  return { svg: parts.join(''), width: x - tracking };
}
