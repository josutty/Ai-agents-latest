// Checks that the build carries the DESIGN's colours and fonts (agent-docs/rules/design-fidelity.md, rule 11).
//   node tools/check-tokens.mjs [--raw analysis/design-tokens-raw.json] [--tokens src/shared/ui/theme/tokens.css]
// Input 1: analysis/design-tokens-raw.json   (node tools/design-spec.mjs tokens inputs/ux/<file>.html — wireframe-analyzer runs it)
// Input 2: the build's tokens.css            (styling-engineer) + package.json + the CSS that imports the fonts
// Checks, by VALUE (the design calls a colour --accent, the build may call it --color-accent):
//   · every design colour exists in tokens.css — light values in :root, dark values in .dark (a value the design shares between themes is checked once)
//   · every design font family is in a --font-* variable, its @fontsource package is installed (package.json) and its weights are imported
// Writes plan/token-check.md. Exit 1 = something is missing (2 = an input is missing). A human can accept a miss in plan/design-accepted.md
// with a line that names the variable or font (agents never edit that file).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const RAW = flag('--raw', 'analysis/design-tokens-raw.json');
const TOK = flag('--tokens', 'src/shared/ui/theme/tokens.css');
if (!existsSync(RAW)) { console.error(`✘ ${RAW} is missing — run: node tools/design-spec.mjs tokens inputs/ux/<file>.html (wireframe-analyzer does this in Step 5)`); process.exit(2); }
if (!existsSync(TOK)) { console.error(`✘ ${TOK} is missing — styling-engineer has not written the tokens yet`); process.exit(2); }
const raw = JSON.parse(readFileSync(RAW, 'utf8'));
const css = readFileSync(TOK, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// ── colours: "r,g,b" from #hex, rgb(), "R G B" ──
const toRgb = (v) => {
  v = String(v).trim();
  let m = v.match(/^#([0-9a-f]{3,8})$/i);
  if (m) { let h = m[1]; if (h.length <= 4) h = [...h].map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i); if (m) return [m[1], m[2], m[3]].map(Number);
  m = v.match(/^([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(\s*\/\s*[\d.%]+)?$/); if (m) return [m[1], m[2], m[3]].map(Number);
  return null;
};
const isColourVar = (v) => /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i.test(String(v).trim()) && !/rgba?\([^)]*,\s*0?\.\d+\)$/i.test(String(v).trim()); // solid colours only (not translucent overlays)
const decls = (body) => [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, n, v]) => [n, v.trim()]);
const blocks = (re) => [...css.matchAll(re)].map((m) => m[1]).join('\n');
const rootDecl = decls(blocks(/:root\s*\{([^}]*)\}/g)), darkDecl = decls(blocks(/(?:\.dark|\[data-theme=["']?dark["']?\])\s*\{([^}]*)\}/g));
const darkNames = new Set(darkDecl.map(([n]) => n));
const lightSet = rootDecl.map(([n, v]) => ({ n, rgb: toRgb(v) })).filter((x) => x.rgb);
const darkSet = [...darkDecl.map(([n, v]) => ({ n, rgb: toRgb(v) })), ...rootDecl.filter(([n]) => !darkNames.has(n)).map(([n, v]) => ({ n, rgb: toRgb(v) }))].filter((x) => x.rgb);
const dist = (p, q) => Math.max(...p.map((v, i) => Math.abs(v - q[i])));
const nearest = (set, rgb) => set.map((x) => ({ ...x, d: dist(x.rgb, rgb) })).sort((a, b) => a.d - b.d)[0];

const accepted = existsSync('plan/design-accepted.md') ? readFileSync('plan/design-accepted.md', 'utf8').toLowerCase().split('\n') : [];
const isAccepted = (...names) => accepted.some((l) => names.some((n) => l.includes(String(n).toLowerCase())));
const rows = []; let bad = 0, near = 0;
const add = (status, where, what, design, build) => { if (status === '✘' && isAccepted(where, design)) status = 'accepted'; if (status === '✘') bad++; if (status === '⚠') near++; rows.push({ status, where, what, design, build }); };

const names = [...new Set([...Object.keys(raw.light), ...Object.keys(raw.dark ?? {})])];
let colours = 0;
for (const n of names) {
  const lv = raw.light[n] ?? raw.dark?.[n]; if (!isColourVar(lv ?? '')) continue; colours++;
  const dv = raw.dark?.[n] ?? lv;
  for (const [theme, v, set] of [['light', lv, lightSet], ['dark', dv, darkSet]]) {
    if (theme === 'dark' && toRgb(dv).join() === toRgb(lv).join() && !raw.dark?.[n]) continue; // the design shares it between themes
    const want = toRgb(v); if (!want) continue;
    const hit = nearest(set, want);
    if (!hit) add('✘', `${n} (${theme})`, 'colour', v, 'tokens.css has no colour tokens');
    else if (hit.d === 0) add('✔', `${n} (${theme})`, 'colour', v, `--${hit.n.replace(/^--/, '')}`);
    else if (hit.d <= 12) add('⚠', `${n} (${theme})`, 'colour is close, not equal — only default tokens may be adjusted for contrast; a measured design value is kept (rule 7)', v, `${hit.n} = ${hit.rgb.join(' ')}`);
    else add('✘', `${n} (${theme})`, 'colour missing from tokens.css', v, `nearest is ${hit.n} = ${hit.rgb.join(' ')}`);
  }
}

// ── fonts ──
const fonts = raw.fontList ?? [];
const fontVars = rootDecl.filter(([n]) => /font/i.test(n));
let pkg = {}; try { pkg = JSON.parse(readFileSync('package.json', 'utf8')); } catch { /* no package.json yet */ }
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const cssFiles = []; const walk = (dir) => { if (!existsSync(dir)) return; for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) { if (f !== 'node_modules') walk(p); } else if (/\.css$/.test(f)) cssFiles.push(p); } };
walk('src'); const allCss = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n') + (existsSync('index.html') ? readFileSync('index.html', 'utf8') : '');
for (const f of fonts) {
  const slug = f.package.replace('@fontsource/', ''); const variable = `@fontsource-variable/${slug}`;
  const inVar = fontVars.some(([, v]) => v.toLowerCase().includes(f.family.toLowerCase()));
  inVar ? add('✔', `font "${f.family}"`, 'in a --font-* variable', f.family, fontVars.find(([, v]) => v.toLowerCase().includes(f.family.toLowerCase()))[0])
    : add('✘', `font "${f.family}"`, 'not used by any --font-* variable in tokens.css', f.family, fontVars.map(([n, v]) => `${n}: ${v}`).join(' · ') || 'no --font-* variable');
  const installed = deps[f.package] ? f.package : deps[variable] ? variable : null; const faceInCss = new RegExp(`@font-face[^}]*${f.family.replace(/ /g, '\\s*')}`, 'i').test(allCss);
  if (!installed && !faceInCss) { add('✘', `font "${f.family}"`, `not installed — ${f.package} must be approved at Gate 1 (plan/library-decisions.md) and installed by app-bootstrap Run L`, f.package, 'not in package.json'); continue; }
  add('✔', `font "${f.family}"`, 'installed', f.package, installed ?? '@font-face in CSS');
  if (installed === variable) continue; // a variable font carries every weight
  if (installed) {
    const imports = [...allCss.matchAll(new RegExp(`@fontsource/${slug}/([\\w-]+)\\.css`, 'g'))].map((m) => m[1]);
    const rootImport = new RegExp(`@fontsource/${slug}['"]`).test(allCss) || new RegExp(`@fontsource/${slug}\\s*\\)`).test(allCss);
    if (!imports.length && !rootImport) { add('✘', `font "${f.family}"`, 'installed but never imported (base.css: @import \'@fontsource/…/<weight>.css\')', f.package, 'no import found'); continue; }
    const missing = f.weights.filter((w) => !imports.some((i) => i === String(w) || i.startsWith(`${w}-`)));
    if (missing.length && !(rootImport && f.weights.length === 1 && f.weights[0] === 400)) add('✘', `font "${f.family}"`, `weights the design uses but the build does not import: ${missing.join(', ')}`, f.weights.join(', '), imports.join(', ') || 'only the default weight (400)');
    else add('✔', `font "${f.family}"`, 'weights imported', f.weights.join(', '), imports.join(', ') || '400');
  }
}

const mark = (s) => s;
const out = ['# Token check — design vs build', '', `Design: ${RAW} (${colours} colour variables, ${fonts.length} font famil${fonts.length === 1 ? 'y' : 'ies'}) · Build: ${TOK}`, '',
  '| | Where | What | Design | Build |', '|---|---|---|---|---|', ...rows.map((r) => `| ${mark(r.status)} | ${r.where} | ${r.what} | ${r.design} | ${r.build} |`), '',
  bad ? `**${bad} missing.** Fix tokens.css / the font setup, run again until 0. A difference the human accepts goes into plan/design-accepted.md (a line naming the variable or font — humans only).` : '**Everything from the design is in the build.**', ''].join('\n');
mkdirSync('plan', { recursive: true }); writeFileSync('plan/token-check.md', out);
for (const r of rows.filter((x) => x.status !== '✔')) console.log(`${r.status} ${r.where} — ${r.what} · design ${r.design} · build ${r.build}`);
console.log(`${bad ? '✘' : '✔'} ${colours} colour variable(s), ${fonts.length} font(s) checked · ${bad} missing · ${near} close-but-different → plan/token-check.md`);
process.exit(bad ? 1 : 0);
