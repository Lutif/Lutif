import { COLOR, SANS, clamp, esc, mix, pct, r2, seeded, starfield } from './svg-kit.mjs';

export const FLEET = [
  { name: 'go-dojo', tagline: 'Desktop IDE with 250+ Go exercises' },
  { name: 'slack-proofreader', tagline: 'Proofreads Slack messages with Claude' },
  { name: 'sentry-to-slack', tagline: 'Free Sentry error alerts in Slack' },
  { name: 'react-native-animated-rating', tagline: 'Animated star ratings for React Native' },
  { name: 'ProductiveU', tagline: 'Shows where your time goes' },
  { name: 'go-social', tagline: 'A social network backend in Go' },
];

const ROCKY = new Set(['Go', 'Rust', 'Other']);
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

function hashSeed(text) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shiftHue(hex, degrees, lighten) {
  const [r, g, b] = hex.match(/\w\w/g).map((h) => parseInt(h, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + degrees + 360) % 360;
  const L = clamp(l + lighten, 0.15, 0.85);
  const c = (1 - Math.abs(2 * L - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - c / 2;
  const [rr, gg, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[rr, gg, bb].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

export function systemsOf(repos) {
  const byLanguage = new Map();
  for (const repo of repos) {
    if (!byLanguage.has(repo.language)) byLanguage.set(repo.language, { language: repo.language, color: repo.color, repos: [] });
    byLanguage.get(repo.language).repos.push(repo);
  }
  return [...byLanguage.values()].sort((a, b) => b.repos.length - a.repos.length || a.language.localeCompare(b.language));
}

function bands(rand, r, light, deep) {
  return Array.from({ length: 8 }, (_, i) => {
    const y = -r + ((i + 0.5) * 2 * r) / 8 + (rand() - 0.5) * 8;
    const fill = rand() > 0.5 ? light : deep;
    return `<ellipse cx="${r2((rand() - 0.5) * 30)}" cy="${r2(y)}" rx="${r2(r * 1.7)}" ry="${r2(2.5 + rand() * 6)}" fill="${fill}" opacity="${r2(0.22 + rand() * 0.3)}"/>`;
  }).join('');
}

function craters(rand, r, light, deep) {
  return Array.from({ length: 11 }, () => {
    const cr = 3 + rand() * 9;
    const x = (rand() - 0.5) * 2.4 * r;
    const y = (rand() - 0.5) * 1.8 * r;
    return (
      `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(cr)}" fill="${deep}" opacity=".45"/>` +
      `<circle cx="${r2(x - cr * 0.18)}" cy="${r2(y - cr * 0.18)}" r="${r2(cr * 0.8)}" fill="none" stroke="${light}" stroke-opacity=".25" stroke-width="1.2"/>`
    );
  }).join('');
}

function ringArc(cx, cy, rx, ry, tiltDeg, front) {
  const t = (tiltDeg * Math.PI) / 180;
  const ax = r2(cx + rx * Math.cos(t));
  const ay = r2(cy + rx * Math.sin(t));
  const bx = r2(cx - rx * Math.cos(t));
  const by = r2(cy - rx * Math.sin(t));
  return `M${ax} ${ay}A${rx} ${ry} ${tiltDeg} 0 ${front ? 1 : 0} ${bx} ${by}`;
}

function fitFont(text, width, max, perChar) {
  return r2(Math.min(max, width / (text.length * perChar)));
}

export function fleetTile(repo, tagline) {
  const W = 300;
  const H = 330;
  const rand = seeded(hashSeed(repo.name));
  const cx = 150;
  const cy = 122;
  const r = 58;
  const hue = shiftHue(repo.color, (rand() - 0.5) * 70, (rand() - 0.5) * 0.16);
  const light = mix(hue, '#ffffff', 0.5);
  const deep = mix(hue, '#050812', 0.72);
  const tilt = r2(-16 + rand() * 12);
  const ringed = repo.stars >= 3;
  const spin = r2(26 + rand() * 20);
  const surface = ROCKY.has(repo.language) ? craters(rand, r, light, deep) : bands(rand, r, light, deep);

  const rings = (front) =>
    ringed
      ? `<path d="${ringArc(cx, cy, r * 1.78, r * 0.42, tilt, front)}" fill="none" stroke="${light}" stroke-opacity="${front ? 0.6 : 0.3}" stroke-width="8"/>` +
        `<path d="${ringArc(cx, cy, r * 1.5, r * 0.35, tilt, front)}" fill="none" stroke="${light}" stroke-opacity="${front ? 0.4 : 0.2}" stroke-width="3"/>`
      : '';

  let moon = { css: '', back: '', front: '' };
  if (repo.forks > 0) {
    const samples = 48;
    const a = r * 1.5;
    const b = r * 0.34;
    const t = (tilt * Math.PI) / 180;
    const phase = rand() * Math.PI * 2;
    const frames = { f: [], b: [] };
    let first;
    for (let k = 0; k <= samples; k++) {
      const th = phase + (2 * Math.PI * k) / samples;
      const lx = a * Math.cos(th);
      const ly = b * Math.sin(th);
      const x = cx + lx * Math.cos(t) - ly * Math.sin(t);
      const y = cy + lx * Math.sin(t) + ly * Math.cos(t);
      const lit = clamp(0.5 + Math.sin(th) * 4, 0, 1);
      const transform = `translate(${r2(x)}px,${r2(y)}px) scale(${r2(1 + 0.15 * Math.sin(th))})`;
      frames.f.push(`${pct((100 * k) / samples)}{transform:${transform};opacity:${r2(lit)}}`);
      frames.b.push(`${pct((100 * k) / samples)}{transform:${transform};opacity:${r2(1 - lit)}}`);
      first ??= { transform, lit };
    }
    const body = `<circle r="6.5" fill="#cfd8ee"/><circle r="6.5" fill="url(#night)"/>`;
    const layer = (side, opacity) =>
      `<g class="moon" style="animation-name:mn${side};transform:${first.transform};opacity:${r2(opacity)}">${body}</g>`;
    moon = {
      css: `@keyframes mnf{${frames.f.join('')}}@keyframes mnb{${frames.b.join('')}}`,
      back: layer('b', 1 - first.lit),
      front: layer('f', first.lit),
    };
  }

  const nameSize = fitFont(repo.name, 252, 21, 0.6);
  const tagSize = fitFont(tagline, 256, 14, 0.52);
  const stars = starfield(rand, {
    count: 34,
    width: W,
    height: 205,
    twinkle: 4,
    avoid: (x, y) => Math.hypot(x - cx, y - cy) < r + 14,
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t">
<title id="t">${esc(repo.name)}: ${esc(tagline)}</title>
<style>
.sans{font-family:${SANS}}
.name{font-size:${nameSize}px;font-weight:700;fill:${COLOR.star}}
.tag{font-size:${tagSize}px;fill:${COLOR.dust}}
.meta{font-size:13px;fill:${COLOR.dust}}
.starred{font-size:13px;font-weight:600;fill:${COLOR.gold}}
.surface{animation:drift ${spin}s ease-in-out infinite alternate}
.moon{animation-duration:${r2(spin * 0.6)}s;animation-timing-function:linear;animation-iteration-count:infinite}
.tw{animation:tw 4s ease-in-out infinite}
@keyframes drift{from{transform:translateX(-22px)}to{transform:translateX(22px)}}
@keyframes tw{0%,100%{opacity:.95}50%{opacity:.12}}
${moon.css}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<defs>
<clipPath id="frame"><rect width="${W}" height="${H}" rx="18"/></clipPath>
<clipPath id="body"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1230"/><stop offset=".7" stop-color="${COLOR.void}"/></linearGradient>
<radialGradient id="glow" cx=".5" cy=".37" r=".5"><stop offset="0" stop-color="${hue}" stop-opacity=".28"/><stop offset="1" stop-color="${hue}" stop-opacity="0"/></radialGradient>
<radialGradient id="surface" cx=".34" cy=".3" r=".8"><stop offset="0" stop-color="${light}"/><stop offset=".45" stop-color="${hue}"/><stop offset="1" stop-color="${deep}"/></radialGradient>
<radialGradient id="halo"><stop offset=".74" stop-color="${light}" stop-opacity="0"/><stop offset=".8" stop-color="${light}" stop-opacity=".45"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient>
<linearGradient id="night" x1=".2" y1=".1" x2=".9" y2=".95"><stop offset="0" stop-color="#02040c" stop-opacity="0"/><stop offset=".5" stop-color="#02040c" stop-opacity=".15"/><stop offset="1" stop-color="#02040c" stop-opacity=".9"/></linearGradient>
</defs>
<g clip-path="url(#frame)">
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
${stars}
${rings(false)}
${moon.back}
<circle cx="${cx}" cy="${cy}" r="${r + 16}" fill="url(#halo)"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#surface)"/>
<g clip-path="url(#body)"><g transform="translate(${cx} ${cy})"><g class="surface">${surface}</g></g></g>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#night)"/>
${rings(true)}
${moon.front}
<text x="24" y="238" class="sans name">${esc(repo.name)}</text>
<text x="24" y="264" class="sans tag">${esc(tagline)}</text>
<circle cx="29" cy="295" r="5" fill="${repo.color}"/>
<text x="41" y="300" class="sans meta">${esc(repo.language)}</text>
${repo.stars > 0 ? `<text x="276" y="300" text-anchor="end" class="sans starred">★ ${repo.stars}</text>` : ''}
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="17.5" fill="none" stroke="${COLOR.limb}" stroke-opacity=".14"/>
</svg>
`;
}

export function galaxyPreview(repos) {
  const W = 1000;
  const H = 340;
  const SQUASH = 0.42;
  const ROT = -8;
  const center = { x: 690, y: 166 };
  const systems = systemsOf(repos);
  const rand = seeded(1977);

  const placed = systems.map((system, i) => {
    const angle = 0.6 + i * 2.39996;
    const dist = 150 + i * 26;
    const starR = 4 + Math.sqrt(system.repos.length) * 1.9;
    const rings = Math.ceil(system.repos.length / 8);
    const x = clamp(Math.cos(angle) * dist, -265, 265);
    return { ...system, x, z: Math.sin(angle) * dist, starR, rings, outer: starR + 12 + (rings - 1) * 14 };
  });

  const project = (x, z) => {
    const t = (ROT * Math.PI) / 180;
    const y = z * SQUASH;
    return { x: center.x + x * Math.cos(t) - y * Math.sin(t), y: center.y + x * Math.sin(t) + y * Math.cos(t) };
  };

  const dust = [];
  for (let arm = 0; arm < 2; arm++) {
    for (let k = 0; k < 150; k++) {
      const th = (k / 150) * 3.2 * Math.PI;
      const rr = 20 * Math.exp(0.22 * th) + (rand() - 0.5) * 22;
      const a = th + arm * Math.PI + (rand() - 0.5) * 0.35;
      const tint = rand() > 0.7 ? '#9b7bff' : COLOR.limb;
      dust.push(`<circle cx="${r2(Math.cos(a) * rr)}" cy="${r2(Math.sin(a) * rr)}" r="${r2(0.8 + rand() * 1.8)}" fill="${tint}" opacity="${r2(0.08 + rand() * 0.22)}"/>`);
    }
  }

  const orbitsAndPlanets = placed
    .map((s) => {
      const parts = [];
      for (let j = 0; j < s.rings; j++) {
        parts.push(`<circle cx="${r2(s.x)}" cy="${r2(s.z)}" r="${r2(s.starR + 12 + j * 14)}" class="orbit" stroke="${s.color}"/>`);
      }
      s.repos.forEach((repo, k) => {
        const ring = k % s.rings;
        const radius = s.starR + 12 + ring * 14;
        const perRing = Math.ceil(s.repos.length / s.rings);
        const phase = r2(((Math.floor(k / s.rings) / perRing) * 360 + rand() * 25 + ring * 40) % 360);
        const period = r2(18 + radius * 0.9);
        const size = r2(2.4 + Math.log2(1 + repo.stars) * 1.1);
        const fill = mix(repo.color, '#ffffff', 0.25);
        parts.push(
          `<g transform="translate(${r2(s.x)} ${r2(s.z)}) rotate(${phase})"><g class="spin" style="animation-duration:${period}s">` +
            `<g transform="translate(${r2(radius)} 0)"><g class="spin rev" style="animation-duration:${period}s">` +
            `<g transform="rotate(${-phase}) scale(1 ${r2(1 / SQUASH)})"><circle r="${size}" fill="${fill}"/></g>` +
            `</g></g></g></g>`,
        );
      });
      return parts.join('');
    })
    .join('');

  const suns = placed
    .map(
      (s) =>
        `<circle cx="${r2(s.x)}" cy="${r2(s.z * SQUASH)}" r="${r2(s.starR * 2.8)}" fill="${s.color}" opacity=".18" filter="url(#bloom)"/>` +
        `<circle cx="${r2(s.x)}" cy="${r2(s.z * SQUASH)}" r="${r2(s.starR)}" fill="${mix(s.color, '#ffffff', 0.35)}"/>`,
    )
    .join('');

  const labels = placed
    .map((s) => {
      const p = project(s.x, s.z);
      return `<text x="${r2(p.x)}" y="${r2(p.y + s.outer * SQUASH + 16)}" text-anchor="middle" class="sans label">${esc(s.language)} ${s.repos.length}</text>`;
    })
    .join('');

  const count = repos.length;
  const systemWord = WORDS[systems.length] ?? String(systems.length);
  const stars = starfield(seeded(1996), { count: 120, width: W, height: H, twinkle: 10, avoid: (x, y) => x < 420 && y > 70 && y < 250 });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t">
<title id="t">${count} public repos as a galaxy. Click to explore it in 3D.</title>
<style>
.sans{font-family:${SANS}}
.title{font-size:34px;font-weight:700;fill:${COLOR.star}}
.sub{font-size:17px;fill:${COLOR.dust}}
.cta{font-size:16px;font-weight:700;fill:${COLOR.hull}}
.label{font-size:12px;fill:${COLOR.dust}}
.orbit{fill:none;stroke-opacity:.24;stroke-width:1;vector-effect:non-scaling-stroke}
.spin{animation:spin linear infinite}
.rev{animation-direction:reverse}
.arms{animation:spin 260s linear infinite}
.tw{animation:tw 4s ease-in-out infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes tw{0%,100%{opacity:.95}50%{opacity:.12}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<defs>
<clipPath id="frame"><rect width="${W}" height="${H}" rx="20"/></clipPath>
<linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070b1f"/><stop offset=".6" stop-color="${COLOR.void}"/><stop offset="1" stop-color="#03050c"/></linearGradient>
<radialGradient id="nebula" cx=".7" cy=".5" r=".45"><stop offset="0" stop-color="#2a2f7a" stop-opacity=".55"/><stop offset=".6" stop-color="#1a2a66" stop-opacity=".2"/><stop offset="1" stop-color="#1a2a66" stop-opacity="0"/></radialGradient>
<radialGradient id="core"><stop offset="0" stop-color="#fff6e0"/><stop offset=".25" stop-color="${COLOR.gold}" stop-opacity=".75"/><stop offset=".6" stop-color="#9b7bff" stop-opacity=".18"/><stop offset="1" stop-color="#9b7bff" stop-opacity="0"/></radialGradient>
<filter id="bloom" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6"/></filter>
</defs>
<g clip-path="url(#frame)">
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<rect width="${W}" height="${H}" fill="url(#nebula)"/>
${stars}
<g transform="translate(${center.x} ${center.y}) rotate(${ROT})">
<ellipse rx="90" ry="${r2(90 * SQUASH * 1.5)}" fill="url(#core)"/>
<g transform="scale(1 ${SQUASH})"><g class="arms">${dust.join('')}</g>${orbitsAndPlanets}</g>
${suns}
<circle r="4.5" fill="#fff6e0"/>
</g>
${labels}
<text x="52" y="122" class="sans title">${count} public repos</text>
<text x="52" y="156" class="sans sub">${systemWord} star systems, one per language.</text>
<text x="52" y="182" class="sans sub">Each planet is a repo, sized by its stars.</text>
<rect x="52" y="210" width="196" height="44" rx="22" fill="${COLOR.gold}"/>
<g transform="translate(78 232)" fill="none" stroke="${COLOR.hull}" stroke-width="2"><circle r="4"/><ellipse rx="11" ry="4.5" transform="rotate(-20)"/></g>
<text x="98" y="238" class="sans cta">Explore in 3D</text>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="19.5" fill="none" stroke="${COLOR.limb}" stroke-opacity=".12"/>
</svg>
`;
}
