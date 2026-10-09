import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FLEET, fleetTile, galaxyPreview } from './repo-galaxy.mjs';
import { COLOR, MONO, SANS, clamp, esc, fmt, mix, pct, r2, ramp, seeded, starfield, wordmark } from './svg-kit.mjs';

const LOGIN = process.env.GITHUB_USER || 'Lutif';
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = process.argv[2] || 'dist';

const QUERY = `query ($login: String!) {
  user(login: $login) {
    createdAt
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date weekday contributionCount } }
      }
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: { field: CREATED_AT, direction: ASC }) {
      nodes {
        name description url homepageUrl stargazerCount forkCount createdAt pushedAt isArchived diskUsage
        primaryLanguage { name color }
        repositoryTopics(first: 6) { nodes { topic { name } } }
      }
    }
  }
}`;

async function fetchProfile() {
  if (!TOKEN) throw new Error('GITHUB_TOKEN is not set');
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `bearer ${TOKEN}`,
      'content-type': 'application/json',
      'user-agent': 'mission-control',
    },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  if (!res.ok) throw new Error(`GitHub API answered ${res.status}: ${await res.text()}`);
  const { data, errors } = await res.json();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));
  const calendar = data.user.contributionsCollection.contributionCalendar;
  return {
    createdAt: new Date(data.user.createdAt),
    total: calendar.totalContributions,
    weeks: calendar.weeks.map((w) => w.contributionDays),
    repos: data.user.repositories.nodes
      .filter((r) => r.name.toLowerCase() !== LOGIN.toLowerCase())
      .map((r) => ({
        name: r.name,
        description: r.description ?? '',
        url: r.url,
        homepage: r.homepageUrl || '',
        stars: r.stargazerCount,
        forks: r.forkCount,
        language: r.primaryLanguage?.name ?? 'Other',
        color: r.primaryLanguage?.color ?? COLOR.dust,
        createdAt: r.createdAt,
        pushedAt: r.pushedAt,
        archived: r.isArchived,
        size: r.diskUsage ?? 0,
        topics: r.repositoryTopics.nodes.map((n) => n.topic.name),
      })),
  };
}

function summarize(weeks) {
  const days = weeks.flat();
  const peak = days.reduce((best, d) => (d.contributionCount >= best.contributionCount ? d : best));

  let i = days.length - 1;
  if (days[i].contributionCount === 0) i--;
  let streak = 0;
  for (; i >= 0 && days[i].contributionCount > 0; i--) streak++;

  const gold = new Set(
    [...days]
      .filter((d) => d.contributionCount > 0)
      .sort((a, b) => b.contributionCount - a.contributionCount || b.date.localeCompare(a.date))
      .slice(0, 7)
      .map((d) => d.date),
  );
  return { peak, streak, gold, max: Math.max(peak.contributionCount, 1), today: days.at(-1) };
}

const TILT = (-12 * Math.PI) / 180;
const PLANET = { x: 780, y: 190, r: 76 };
const MOONS = [
  { a: 122, b: 30, period: 19, phase: 0.6, badge: 'ts' },
  { a: 160, b: 43, period: 28, phase: 2.6, badge: 'go' },
  { a: 198, b: 57, period: 39, phase: 4.4, badge: 'gql' },
];

function orbitPoint({ a, b }, theta) {
  const x = a * Math.cos(theta);
  const y = b * Math.sin(theta);
  return {
    x: PLANET.x + x * Math.cos(TILT) - y * Math.sin(TILT),
    y: PLANET.y + x * Math.sin(TILT) + y * Math.cos(TILT),
    depth: Math.sin(theta),
  };
}

function halfOrbit(orbit, from) {
  const p0 = orbitPoint(orbit, from);
  const p1 = orbitPoint(orbit, from + Math.PI);
  const tilt = r2((TILT * 180) / Math.PI);
  return `M${r2(p0.x)} ${r2(p0.y)}A${orbit.a} ${orbit.b} ${tilt} 0 1 ${r2(p1.x)} ${r2(p1.y)}`;
}

function hexagon(radius) {
  return Array.from({ length: 6 }, (_, i) => {
    const t = ((i * 60 - 90) * Math.PI) / 180;
    return [r2(radius * Math.cos(t)), r2(radius * Math.sin(t))];
  });
}

const HEX = hexagon(8.5);
const BADGES = {
  ts: `<rect x="-13" y="-13" width="26" height="26" rx="4" fill="#3178c6"/><text x="10" y="10" text-anchor="end" class="badge">TS</text>`,
  go: `<circle r="14" fill="#00add8"/><text y="4" text-anchor="middle" class="badge" font-style="italic">GO</text>`,
  gql:
    `<circle r="14" fill="#1d1030" stroke="#e535ab" stroke-opacity=".55"/>` +
    `<path d="M${HEX.map((p) => p.join(' ')).join('L')}ZM${[HEX[0], HEX[2], HEX[4]].map((p) => p.join(' ')).join('L')}Z" fill="none" stroke="#e535ab" stroke-width="1.4" stroke-linejoin="round"/>` +
    HEX.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#e535ab"/>`).join(''),
};

function moonLayers() {
  const samples = 72;
  const css = [];
  const back = [];
  const front = [];
  MOONS.forEach((moon, i) => {
    const frames = { f: [], b: [] };
    let first;
    for (let k = 0; k <= samples; k++) {
      const p = orbitPoint(moon, moon.phase + (2 * Math.PI * k) / samples);
      const transform = `translate(${r2(p.x)}px,${r2(p.y)}px) scale(${r2(1 + 0.14 * p.depth)})`;
      const lit = clamp(0.5 + p.depth * 4, 0, 1);
      const at = pct((100 * k) / samples);
      frames.f.push(`${at}{transform:${transform};opacity:${r2(lit)}}`);
      frames.b.push(`${at}{transform:${transform};opacity:${r2((1 - lit) * 0.75)}}`);
      first ??= { transform, lit };
    }
    css.push(`@keyframes m${i}f{${frames.f.join('')}}`, `@keyframes m${i}b{${frames.b.join('')}}`);
    const layer = (side, opacity) =>
      `<g class="m" style="animation-name:m${i}${side};animation-duration:${moon.period}s;transform:${first.transform};opacity:${r2(opacity)}">${BADGES[moon.badge]}</g>`;
    back.push(`<path d="${halfOrbit(moon, Math.PI)}" class="orbit back"/>`, layer('b', (1 - first.lit) * 0.75));
    front.push(`<path d="${halfOrbit(moon, 0)}" class="orbit"/>`, layer('f', first.lit));
  });
  return { css: css.join('\n'), back: back.join(''), front: front.join('') };
}

function typingConsole(lines, { x, y, width, height }) {
  const advance = 10.2;
  const typeSpeed = 0.048;
  const hold = 2.6;
  const gap = 0.3;
  const slots = lines.map((text) => ({ text, type: text.length * typeSpeed }));
  const cycle = slots.reduce((sum, s) => sum + s.type + hold + gap, 0);
  const textX = x + 38;
  const baseline = y + height / 2 + 6;

  let clock = 0;
  const css = [];
  const groups = slots.map((slot, i) => {
    const start = (100 * clock) / cycle;
    const typed = (100 * (clock + slot.type)) / cycle;
    const end = (100 * (clock + slot.type + hold)) / cycle;
    clock += slot.type + hold + gap;
    const span = r2(slot.text.length * advance);

    css.push(
      i === 0
        ? `@keyframes ln${i}{0%,${pct(end)}{opacity:1}${pct(end + 0.01)},100%{opacity:0}}`
        : `@keyframes ln${i}{0%,${pct(start)}{opacity:0}${pct(start + 0.01)},${pct(end)}{opacity:1}${pct(end + 0.01)},100%{opacity:0}}`,
      `@keyframes cv${i}{0%{transform:translateX(0)}${pct(start)}{transform:translateX(0);animation-timing-function:steps(${slot.text.length},end)}${pct(typed)}{transform:translateX(${span}px)}100%{transform:translateX(${span}px)}}`,
    );

    const timing = `${r2(cycle)}s linear infinite`;
    return (
      `<g style="animation:ln${i} ${timing};opacity:${i === 0 ? 1 : 0}">` +
      `<text x="${textX}" y="${baseline}" class="mono line" textLength="${span}" lengthAdjust="spacing">${esc(slot.text)}</text>` +
      `<rect x="${textX - 1}" y="${y + 6}" width="${r2(span + 24)}" height="${height - 12}" fill="${COLOR.hull}" style="animation:cv${i} ${timing};transform:translateX(${span}px)"/>` +
      `<rect x="${textX + 1}" y="${baseline - 15}" width="9" height="19" fill="${COLOR.gold}" style="animation:cv${i} ${timing},blink 1.1s step-end infinite;transform:translateX(${span}px)"/>` +
      `</g>`
    );
  });

  const svg =
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="${COLOR.hull}" stroke="${COLOR.limb}" stroke-opacity=".16"/>` +
    `<text x="${x + 16}" y="${baseline + 1}" class="mono prompt">›</text>` +
    `<g clip-path="url(#console)">${groups.join('')}</g>`;
  return {
    svg,
    css: css.join('\n'),
    clip: `<clipPath id="console"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10"/></clipPath>`,
  };
}

function header({ total, createdAt }) {
  const W = 1000;
  const H = 372;
  const { r } = PLANET;
  const consoleBox = { x: 52, y: 254, width: 500, height: 46 };
  const lines = [
    'Porting GraphQL resolvers to NestJS',
    `${fmt(total)} contributions in the last 12 months`,
    'Off-hours: 250+ Go exercises in go-dojo',
    'Proofreading Slack messages with Claude',
  ];
  const typing = typingConsole(lines, consoleBox);
  const moons = moonLayers();
  const mark = wordmark('LUTIF ALI');
  const since = createdAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const rand = seeded(1508);
  const stars = starfield(rand, {
    count: 170,
    width: W,
    height: H,
    twinkle: 14,
    avoid: (x, y) =>
      Math.hypot(x - PLANET.x, y - PLANET.y) < r + 8 ||
      (x < 560 && y > 50 && y < 222) ||
      (x > consoleBox.x - 6 && x < consoleBox.x + consoleBox.width + 6 && y > consoleBox.y - 6 && y < consoleBox.y + consoleBox.height + 6),
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t">
<title id="t">Lutif Ali, software engineer at Fireflies.ai</title>
<style>
.sans{font-family:${SANS}}
.mono{font-family:${MONO}}
.role{font-size:24px;font-weight:600;fill:${COLOR.star}}
.sub{font-size:17px;fill:${COLOR.dust}}
.since{font-size:14px;fill:${COLOR.dust}}
.line{font-size:17px;fill:${COLOR.star}}
.prompt{font-size:20px;fill:${COLOR.gold}}
.badge{font-family:${SANS};font-size:11px;font-weight:700;fill:#fff}
.wm path{fill:none;stroke:url(#ink);stroke-width:10;stroke-linejoin:miter;stroke-linecap:butt}
.wm polygon{fill:url(#ink)}
.orbit{fill:none;stroke:${COLOR.limb};stroke-opacity:.32;stroke-width:1}
.orbit.back{stroke-opacity:.14}
.m{animation-timing-function:linear;animation-iteration-count:infinite}
.tw{animation:tw 4s ease-in-out infinite}
.drift{animation:drift 40s ease-in-out infinite alternate}
@keyframes tw{0%,100%{opacity:.95}50%{opacity:.12}}
@keyframes drift{from{transform:translateX(-24px)}to{transform:translateX(24px)}}
@keyframes blink{0%,50%{opacity:1}50.01%,100%{opacity:0}}
${moons.css}
${typing.css}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<defs>
<clipPath id="frame"><rect width="${W}" height="${H}" rx="20"/></clipPath>
<clipPath id="planet-clip"><circle r="${r}"/></clipPath>
${typing.clip}
<linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#081028"/><stop offset=".55" stop-color="${COLOR.void}"/><stop offset="1" stop-color="#03050c"/></linearGradient>
<radialGradient id="backglow"><stop offset="0" stop-color="#1a3a80" stop-opacity=".55"/><stop offset="1" stop-color="#1a3a80" stop-opacity="0"/></radialGradient>
<radialGradient id="surface" cx=".34" cy=".3" r=".8"><stop offset="0" stop-color="#c4ecff"/><stop offset=".22" stop-color="#58b4f5"/><stop offset=".5" stop-color="#2160c4"/><stop offset=".8" stop-color="#0d2058"/><stop offset="1" stop-color="#070e2c"/></radialGradient>
<radialGradient id="halo"><stop offset=".74" stop-color="${COLOR.limb}" stop-opacity="0"/><stop offset=".79" stop-color="${COLOR.limb}" stop-opacity=".5"/><stop offset=".87" stop-color="${COLOR.limb}" stop-opacity=".14"/><stop offset="1" stop-color="${COLOR.limb}" stop-opacity="0"/></radialGradient>
<linearGradient id="night" x1=".2" y1=".1" x2=".9" y2=".95"><stop offset="0" stop-color="#02040c" stop-opacity="0"/><stop offset=".5" stop-color="#02040c" stop-opacity=".12"/><stop offset="1" stop-color="#02040c" stop-opacity=".88"/></linearGradient>
<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8f3ff" stop-opacity=".9"/><stop offset=".45" stop-color="#d8f3ff" stop-opacity="0"/></linearGradient>
<linearGradient id="ink" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="60"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#a9c9ff"/></linearGradient>
<filter id="band" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="28"/></filter>
<filter id="haze" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter>
<filter id="glow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feColorMatrix in="b" values="0 0 0 0 .36  0 0 0 0 .78  0 0 0 0 1  0 0 0 .55 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<g clip-path="url(#frame)">
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<ellipse cx="520" cy="160" rx="600" ry="64" transform="rotate(-14 520 160)" fill="#2a3474" opacity=".3" filter="url(#band)"/>
<circle cx="${PLANET.x}" cy="${PLANET.y}" r="260" fill="url(#backglow)"/>
${stars}
${moons.back}
<g transform="translate(${PLANET.x} ${PLANET.y})">
<circle r="${r + 22}" fill="url(#halo)"/>
<circle r="${r}" fill="url(#surface)"/>
<g clip-path="url(#planet-clip)"><g class="drift" filter="url(#haze)" fill="#e3f6ff" opacity=".2">
<ellipse cx="-14" cy="-38" rx="104" ry="5"/><ellipse cx="22" cy="-14" rx="120" ry="8"/><ellipse cx="-6" cy="12" rx="96" ry="4"/><ellipse cx="18" cy="36" rx="88" ry="7"/><ellipse cx="-20" cy="58" rx="70" ry="4"/>
</g></g>
<circle r="${r}" fill="url(#night)"/>
<circle r="${r - 0.8}" fill="none" stroke="url(#rim)" stroke-width="1.6"/>
</g>
${moons.front}
<g class="wm" transform="translate(52 60) scale(1.15)" filter="url(#glow)">${mark.svg}</g>
<text x="52" y="176" class="sans role">Software engineer at Fireflies.ai</text>
<text x="52" y="208" class="sans sub">Mostly backend: TypeScript, NestJS, GraphQL and Go.</text>
${typing.svg}
<text x="52" y="338" class="sans since">In orbit since ${esc(since)}</text>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="19.5" fill="none" stroke="${COLOR.limb}" stroke-opacity=".12"/>
</svg>
`;
}

function skyline({ total, weeks }, stats) {
  const W = 1000;
  const H = 490;
  const U = [13, 3.7];
  const V = [-7.4, 5.2];
  const HMAX = 112;
  const GAP = 0.09;
  const nw = weeks.length;
  const x0 = W / 2 - (nw * U[0] + 7 * V[0]) / 2 - 40;
  const y0 = 196;
  const P = (w, d, h = 0) => [r2(x0 + w * U[0] + d * V[0]), r2(y0 + w * U[1] + d * V[1] - h)];
  const pts = (list) => list.map((p) => p.join(',')).join(' ');
  const heightOf = (c) => (c === 0 ? 0 : 5 + (HMAX - 5) * Math.sqrt(c / stats.max));
  const blues = [
    [0, '#1d3570'],
    [0.3, '#2a64c4'],
    [0.6, '#46a8f0'],
    [0.85, '#9fdcff'],
    [1, '#e8f7ff'],
  ];

  const cells = weeks.flatMap((days, w) => days.map((day) => ({ ...day, w, d: day.weekday })));
  cells.sort((a, b) => a.w + a.d - (b.w + b.d) || a.w - b.w);

  const tiles = [];
  const towers = [];
  for (const c of cells) {
    const { w, d, contributionCount: count } = c;
    const foot = [P(w + GAP, d + GAP), P(w + 1 - GAP, d + GAP), P(w + 1 - GAP, d + 1 - GAP), P(w + GAP, d + 1 - GAP)];
    if (count === 0) {
      tiles.push(`<polygon points="${pts(foot)}"/>`);
      continue;
    }
    const h = heightOf(count);
    const top = [P(w + GAP, d + GAP, h), P(w + 1 - GAP, d + GAP, h), P(w + 1 - GAP, d + 1 - GAP, h), P(w + GAP, d + 1 - GAP, h)];
    const isGold = stats.gold.has(c.date);
    const base = isGold ? COLOR.gold : ramp(blues, Math.sqrt(count / stats.max));
    const [ox, oy] = P(w + 0.5, d + 0.5);
    towers.push(
      `<g class="t" style="transform-origin:${ox}px ${oy}px;animation-delay:${r2(w * 0.022)}s"${isGold ? ' filter="url(#gold-glow)"' : ''}>` +
        `<polygon points="${pts([foot[1], foot[2], top[2], top[1]])}" fill="${mix(base, '#03050d', 0.34)}"/>` +
        `<polygon points="${pts([foot[3], foot[2], top[2], top[3]])}" fill="${mix(base, '#03050d', 0.56)}"/>` +
        `<polygon points="${pts(top)}" fill="${base}"/>` +
        `</g>`,
    );
  }

  const angle = r2((Math.atan2(U[1], U[0]) * 180) / Math.PI);
  const months = [];
  let lastMonth = -1;
  weeks.forEach((days, w) => {
    const month = new Date(`${days[0].date}T00:00:00Z`).getUTCMonth();
    if (month !== lastMonth && w < nw - 2) {
      const [x, y] = P(w, 7);
      const label = new Date(Date.UTC(2000, month, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
      months.push(`<text transform="translate(${r2(x + 2)} ${r2(y + 17)}) rotate(${angle})" class="sans month">${label}</text>`);
    }
    lastMonth = month;
  });

  const cellOf = (date) => cells.find((c) => c.date === date);
  const topCenter = (c) => P(c.w + 0.5, c.d + 0.5, heightOf(c.contributionCount));

  const peak = cellOf(stats.peak.date);
  const [px, py] = topCenter(peak);
  const peakDate = new Date(`${peak.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const peakText = `Busiest day: ${fmt(peak.contributionCount)} on ${peakDate}`;
  const labelY = Math.max(112, py - 64);
  const flip = px + 12 + peakText.length * 7.6 > W - 24;
  const peakCallout =
    `<path d="M${px} ${py}V${labelY + 6}" class="lead"/><circle cx="${px}" cy="${py}" r="2.6" fill="${COLOR.gold}"/>` +
    `<text x="${flip ? px - 8 : px + 8}" y="${labelY}" text-anchor="${flip ? 'end' : 'start'}" class="sans note">${esc(peakText)}</text>`;

  const today = cellOf(stats.today.date);
  const [tx, ty] = topCenter(today);
  const [edgeX] = P(nw, 0);
  const noteX = r2(edgeX + 26);
  const streakText =
    stats.streak > 1 ? [`${stats.streak}-day streak`, 'and counting'] : stats.streak === 1 ? ['Shipping', 'today'] : ['Today', ''];
  const todayCallout =
    `<path d="M${tx} ${ty}H${noteX - 8}" class="lead"/><circle cx="${tx}" cy="${ty}" r="2.6" fill="${COLOR.gold}"/>` +
    `<text x="${noteX}" y="${r2(ty + 5)}" class="sans note">${esc(streakText[0])}</text>` +
    (streakText[1] ? `<text x="${noteX}" y="${r2(ty + 24)}" class="sans note dim">${esc(streakText[1])}</text>` : '');

  const corners = [P(0, 0), P(nw, 0), P(nw, 7), P(0, 7)];
  const rand = seeded(2026);
  const stars = starfield(rand, { count: 70, width: W, height: H });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">${fmt(total)} contributions in the last 12 months</title>
<desc id="d">A 3D skyline of daily GitHub contributions. ${esc(peakText)}.</desc>
<style>
.sans{font-family:${SANS}}
.title{font-size:26px;font-weight:650;fill:${COLOR.star}}
.sub{font-size:15px;fill:${COLOR.dust}}
.month{font-size:12px;fill:${COLOR.dust}}
.note{font-size:14px;fill:${COLOR.star}}
.note.dim{fill:${COLOR.dust}}
.lead{fill:none;stroke:${COLOR.gold};stroke-width:1;stroke-opacity:.85}
.tiles polygon{fill:#121b3d}
.t{animation:rise .8s cubic-bezier(.2,.8,.2,1) both}
@keyframes rise{from{transform:scaleY(.02);opacity:0}to{transform:scaleY(1);opacity:1}}
@media (prefers-reduced-motion:reduce){.t{animation:none}}
</style>
<defs>
<clipPath id="frame"><rect width="${W}" height="${H}" rx="20"/></clipPath>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03050c"/><stop offset=".6" stop-color="${COLOR.void}"/><stop offset="1" stop-color="#0a1538"/></linearGradient>
<radialGradient id="cityglow" cx=".55" cy=".72" r=".55"><stop offset="0" stop-color="#1c3f8c" stop-opacity=".45"/><stop offset="1" stop-color="#1c3f8c" stop-opacity="0"/></radialGradient>
<filter id="gold-glow" x="-100%" y="-50%" width="300%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feColorMatrix in="b" values="0 0 0 0 .96  0 0 0 0 .74  0 0 0 0 .31  0 0 0 .7 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<g clip-path="url(#frame)">
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<rect width="${W}" height="${H}" fill="url(#cityglow)"/>
${stars}
<polygon points="${pts(corners)}" fill="#0a1230" stroke="${COLOR.limb}" stroke-opacity=".14"/>
<g class="tiles">${tiles.join('')}</g>
${towers.join('\n')}
${months.join('')}
${peakCallout}
${todayCallout}
<text x="36" y="54" class="sans title">${fmt(total)} contributions in the last 12 months</text>
<text x="36" y="82" class="sans sub">One tower per day. Gold towers are the seven busiest days.</text>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="19.5" fill="none" stroke="${COLOR.limb}" stroke-opacity=".12"/>
</svg>
`;
}

const profile = await fetchProfile();
const stats = summarize(profile.weeks);
await mkdir(join(OUT, 'fleet'), { recursive: true });
await writeFile(join(OUT, 'header.svg'), header(profile));
await writeFile(join(OUT, 'skyline.svg'), skyline(profile, stats));
await writeFile(join(OUT, 'galaxy.svg'), galaxyPreview(profile.repos));
await writeFile(
  join(OUT, 'repos.json'),
  JSON.stringify({ login: LOGIN, generatedAt: new Date().toISOString(), repos: profile.repos }, null, 1),
);
for (const { name, tagline } of FLEET) {
  const repo = profile.repos.find((r) => r.name === name);
  if (!repo) {
    console.warn(`Skipping fleet tile for ${name}: not a public repo of ${LOGIN}`);
    continue;
  }
  await writeFile(join(OUT, 'fleet', `${name}.svg`), fleetTile(repo, tagline));
}
console.log(`Rendered ${fmt(profile.total)} contributions and ${profile.repos.length} repos into ${OUT}/`);
