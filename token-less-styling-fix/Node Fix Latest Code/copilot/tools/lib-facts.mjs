#!/usr/bin/env node
// Current facts about npm packages, for library decisions (agent-docs/rules/libraries.md). Zero model tokens.
// Usage: node tools/lib-facts.mjs <pkg>[@<range>] [...more] [--json] [--strict]
//   e.g. node tools/lib-facts.mjs @tiptap/react@^3 react-dropzone leaflet@^1
// For each package: the exact version to install (newest stable release that is at least 14 days old — supply-chain rule),
// the latest release, license, React 19 support (peerDependencies), bundled types, last publish, weekly downloads,
// unpacked size and red flags. Reads registry.npmjs.org (+ api.npmjs.org for downloads). Offline → says so; never guesses.
// ✘ = hard flag (license not allowed, no React 19, deprecated, not found) · ⚠ = warning to justify (stale, no types, pin note).
// --strict exits 1 when any package has a ✘.
const args = process.argv.slice(2);
const json = args.includes('--json'); const strict = args.includes('--strict');
const specs = args.filter((a) => !a.startsWith('--'));
if (!specs.length) { console.error('usage: node tools/lib-facts.mjs <pkg>[@range] [...] [--json] [--strict]'); process.exit(2); }

const LICENSES_OK = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Unlicense', 'BlueOak-1.0.0']);
const FONT_PKG = /^@fontsource(-variable)?\//;
const MIN_AGE_DAYS = 14; const STALE_DAYS = 365; const DAY = 86400000; const now = Date.now();

// ── tiny semver (enough for version picking and peer ranges) ──
const parse = (v) => { const m = String(v).trim().replace(/^[=v]+/, '').match(/^(\d+)(?:\.(\d+|[x*]))?(?:\.(\d+|[x*]))?(?:-([\w.-]+))?/i); if (!m) return null;
  const n = (x) => (x === undefined || /[x*]/i.test(x) ? null : Number(x)); return { major: Number(m[1]), minor: n(m[2]), patch: n(m[3]), pre: m[4] ?? null }; };
const cmp = (a, b) => { for (const k of ['major', 'minor', 'patch']) { const d = (a[k] ?? 0) - (b[k] ?? 0); if (d) return d; }
  if (a.pre === b.pre) return 0; if (!a.pre) return 1; if (!b.pre) return -1; return a.pre < b.pre ? -1 : 1; };
const V = (major, minor = 0, patch = 0, pre = null) => ({ major, minor, patch, pre });
function comparators(tok) {
  const m = tok.match(/^(\^|~|>=|<=|>|<|=)?\s*(.+)$/); if (!m) return [];
  const op = m[1] ?? ''; const p = parse(m[2]); if (!p) return [];
  const lo = V(p.major, p.minor ?? 0, p.patch ?? 0, p.pre);
  if (op === '^') { const hi = p.major > 0 || p.minor === null ? V(p.major + 1) : p.minor > 0 || p.patch === null ? V(0, p.minor + 1) : V(0, 0, p.patch + 1); return [['>=', lo], ['<', hi]]; }
  if (op === '~') return [['>=', lo], ['<', p.minor === null ? V(p.major + 1) : V(p.major, p.minor + 1)]];
  if (op === '' || op === '=') { if (p.minor === null) return [['>=', lo], ['<', V(p.major + 1)]]; if (p.patch === null) return [['>=', lo], ['<', V(p.major, p.minor + 1)]]; return [['=', lo]]; }
  if (op === '<=' && (p.minor === null || p.patch === null)) return [['<', p.minor === null ? V(p.major + 1) : V(p.major, p.minor + 1)]];
  if (op === '>' && (p.minor === null || p.patch === null)) return [['>=', p.minor === null ? V(p.major + 1) : V(p.major, p.minor + 1)]];
  return [[op, lo]];
}
function satisfies(version, range) {
  const v = parse(version); if (!v) return false; const r = String(range ?? '').trim();
  if (!r || r === '*' || r === 'x' || r === 'latest') return !v.pre;
  return r.split('||').some((set) => {
    const s = set.trim().replace(/^(\S+)\s+-\s+(\S+)$/, '>=$1 <=$2').replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1');
    if (!s || s === '*' || s === 'x') return true;
    const cs = s.split(/\s+/).flatMap(comparators); if (!cs.length) return false;
    return cs.every(([op, b]) => { const d = cmp(v, b); return op === '>=' ? d >= 0 : op === '>' ? d > 0 : op === '<=' ? d <= 0 : op === '<' ? d < 0 : d === 0; });
  });
}

const splitSpec = (s) => { const at = s.lastIndexOf('@'); return at > 0 ? [s.slice(0, at), s.slice(at + 1)] : [s, '']; };
const enc = (name) => name.replace('/', '%2F');
async function get(url, accept = 'application/json') {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
  try { const r = await fetch(url, { headers: { accept }, signal: ctl.signal }); return r.ok ? await r.json() : { __status: r.status }; }
  catch (e) { return { __error: e.name === 'AbortError' ? 'timeout' : e.message }; } finally { clearTimeout(t); }
}
const days = (iso) => (iso ? Math.floor((now - Date.parse(iso)) / DAY) : null);
const age = (d) => (d === null ? '?' : d < 1 ? 'today' : d < 60 ? `${d} d ago` : d < 730 ? `${Math.round(d / 30)} mo ago` : `${(d / 365).toFixed(1)} y ago`);
const kb = (b) => (b ? (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} kB`) : '?');
const licenseOf = (m) => { const l = m?.license ?? m?.licenses; return typeof l === 'string' ? l : l?.type ?? (Array.isArray(l) ? l.map((x) => x.type ?? x).join(' OR ') : 'none'); };
const licenseOk = (l) => l.replace(/[()]/g, '').split(/\s+OR\s+/i).some((x) => LICENSES_OK.has(x.trim()));

async function facts(spec) {
  const [name, range] = splitSpec(spec);
  const doc = await get(`https://registry.npmjs.org/${enc(name)}`);
  if (doc.__error) return { name, error: `registry unreachable (${doc.__error}) — facts unverified` };
  if (doc.__status) return { name, error: doc.__status === 404 ? 'not on npm (typo, or private package)' : `registry HTTP ${doc.__status}` };
  const time = doc.time ?? {}; const latest = doc['dist-tags']?.latest;
  const stable = Object.keys(doc.versions ?? {}).filter((v) => !parse(v)?.pre && !doc.versions[v].deprecated && (!range || satisfies(v, range)))
    .sort((a, b) => cmp(parse(b), parse(a)));
  if (!stable.length) return { name, error: `no stable, non-deprecated version${range ? ` matches ${range}` : ''}` };
  const newest = stable[0]; const pin = stable.find((v) => (days(time[v]) ?? 0) >= MIN_AGE_DAYS) ?? newest;
  const m = doc.versions[pin]; const lic = licenseOf(m);
  const peer = m.peerDependencies ?? {}; const reactPeer = peer.react ?? peer['react-dom'];
  const react19 = reactPeer === undefined ? 'n/a' : satisfies('19.0.0', reactPeer) ? 'yes' : `NO (${reactPeer})`;
  let types = m.types || m.typings || /"types"/.test(JSON.stringify(m.exports ?? {})) ? 'bundled' : null;
  if (!types && !name.startsWith('@types/')) { const t = await get(`https://registry.npmjs.org/@types%2F${name.replace(/^@/, '').replace('/', '__')}`, 'application/vnd.npm.install-v1+json'); types = t.__status || t.__error ? 'none' : '@types package'; }
  const dl = await get(`https://api.npmjs.org/downloads/point/last-week/${name}`);
  const lastPublish = days(time[latest] ?? time.modified);
  const flags = [];
  if (!licenseOk(lic) && !(FONT_PKG.test(name) && licenseOk(lic.replace(/OFL-1\.1/g, 'MIT')))) flags.push(`license ${lic} not on the allowlist`); // font packages carry the FONT's licence: SIL OFL 1.1 is fine for fonts
  if (react19.startsWith('NO')) flags.push('no React 19 in peerDependencies');
  if (doc.versions[latest]?.deprecated) flags.push('latest is deprecated');
  const notes = []; // warnings: the advisor must justify the pick (finished, widely used, no advisories) or choose another
  if (lastPublish !== null && lastPublish > STALE_DAYS) notes.push(`last release ${age(lastPublish)} — finished, or abandoned?`);
  if (types === 'none') notes.push('no TypeScript types');
  if (pin !== newest) notes.push(`newest ${newest} is ${days(time[newest])} d old → pin ${pin}`);
  if (latest && latest !== newest && !range) notes.push(`dist-tag latest = ${latest}`);
  return { name, range: range || null, pin, install: `${name}@${pin}`, /* exact: npm i must not float to a newer, unchecked release */ newest, license: lic, react19, types,
    lastPublish: age(lastPublish), weeklyDownloads: typeof dl.downloads === 'number' ? dl.downloads : null, unpackedSize: kb(m.dist?.unpackedSize),
    repo: (m.repository?.url ?? m.repository ?? '').toString().replace(/^git\+|\.git$/g, '') || null, flags, notes };
}

const results = []; for (const s of specs) results.push(await facts(s)); // sequential: polite to the registry
if (json) console.log(JSON.stringify(results, null, 2));
else {
  console.log('| Package | Install (pin) | License | React 19 | Types | Last release | Weekly downloads | Size | Flags / notes |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    if (r.error) { console.log(`| ${r.name} | — | — | — | — | — | — | — | ✘ ${r.error} |`); continue; }
    const fl = [...r.flags.map((f) => `✘ ${f}`), ...r.notes.map((n) => `⚠ ${n}`)].join('; ') || '✔';
    console.log(`| ${r.name} | \`${r.install}\` | ${r.license} | ${r.react19} | ${r.types} | ${r.lastPublish} | ${r.weeklyDownloads?.toLocaleString('en-US') ?? 'n/a'} | ${r.unpackedSize} | ${fl} |`);
  }
  console.log(`\nAllowlist: ${[...LICENSES_OK].join(', ')} · pin = newest stable release ≥ ${MIN_AGE_DAYS} days old · stale = no release in ${STALE_DAYS} days.`);
}
process.exit(strict && results.some((r) => r.error || r.flags?.length) ? 1 : 0);
