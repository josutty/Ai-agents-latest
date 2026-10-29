#!/usr/bin/env node
// Scope slicer — every agent reads only what is in scope. Zero model tokens.
//   node tools/scope.mjs init "login page" [--keywords "login,sign in,password"]   write inputs/scope.md (edit it if you like)
//   node tools/scope.mjs slice [--also "forgot password"]                          write inputs/scoped/** from the full inputs
//   node tools/scope.mjs show                                                      what was kept / dropped, with sizes
// Why: planning agents re-read the whole FSD and every wireframe in their own session. With a one-screen scope that is
// mostly waste. After `slice`, point every agent at inputs/scoped/** (team-protocol §0b); the full inputs stay untouched.
// Slices: UX HTML (screens inside combined files, or whole files) · FSD / requirements markdown (by heading) ·
// OpenAPI yaml/json (matching paths + only the schemas they reference). Matching is by keyword — check the report.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const [cmd, ...rest] = process.argv.slice(2);
const opt = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : d; };
const tok = (s) => Math.ceil(s.length / 4);
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const die = (m) => { console.error(`✘ ${m}`); process.exit(1); };
const read = (p) => readFileSync(p, 'utf8');
const walk = (dir, ok, out = []) => { if (!existsSync(dir)) return out; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) { if (e.name !== 'scoped') walk(p, ok, out); } else if (ok(p)) out.push(p); } return out; };
const norm = (p) => p.split('\\').join('/');

const SYN = { login: ['login', 'log in', 'sign in', 'sign-in', 'signin', 'password', 'credential', 'authenticat', 'forgot password', 'remember me'],
  signup: ['sign up', 'signup', 'register', 'registration', 'create account'], dashboard: ['dashboard', 'overview', 'home'], profile: ['profile', 'account settings'] };
const STOP = new Set(['page', 'screen', 'the', 'a', 'an', 'only', 'and', 'of', 'for', 'view', 'form']);
function keywordsFrom(words) {
  const set = new Set(); for (const w of words.toLowerCase().split(/[^a-z0-9-]+/).filter((x) => x && !STOP.has(x))) { set.add(w); for (const s of SYN[w] ?? []) set.add(s); }
  return [...set];
}
function loadScope() {
  if (!existsSync('inputs/scope.md')) die('inputs/scope.md not found — run: node tools/scope.mjs init "login page"');
  const t = read('inputs/scope.md'); const kw = (t.match(/^Keywords:\s*(.+)$/im)?.[1] ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const also = (opt('--also', '') ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const all = [...new Set([...kw, ...also])]; if (!all.length) die('inputs/scope.md has no "Keywords:" line');
  return { text: t, kw: all, re: new RegExp(all.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]*')).join('|'), 'i') };
}

function init() {
  const words = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--keywords').join(' ').trim(); if (!words) die('usage: node tools/scope.mjs init "login page" [--keywords "a,b"]');
  const kw = opt('--keywords') ? opt('--keywords').split(',').map((x) => x.trim()).filter(Boolean) : keywordsFrom(words);
  mkdirSync('inputs', { recursive: true });
  writeFileSync('inputs/scope.md', `# Scope\n\nIn scope: ${words}\nKeywords: ${kw.join(', ')}\nNot in scope: everything else — do not read, plan, design or build it. If something in scope needs it, say so instead of adding it.\n\nTeam rule (agent-docs/rules/team-protocol.md §0b): read inputs/scoped/** instead of inputs/**.\nRefresh the slice after editing this file: node tools/scope.mjs slice\n`);
  console.log(`✔ inputs/scope.md\n  keywords: ${kw.join(', ')}\n  next: node tools/scope.mjs slice`);
}

// ── UX HTML ──
const SCREEN_SEL = '[data-screen], [data-page], .screen, .page, [id^="screen-"], [id^="page-"], [id$="-screen"], [id$="-page"], [id^="view-"], [id$="-view"]';
async function sliceHtml(S, rep) {
  let JSDOM; try { ({ JSDOM } = await import('jsdom')); } catch { rep.push('⚠️ UX HTML: jsdom is not installed (npm i -D jsdom) — copied nothing; run app-bootstrap Run 1 first'); return; }
  for (const f of walk('inputs/ux', (p) => /\.html?$/i.test(p))) {
    const html = read(f); const dom = new JSDOM(html); const doc = dom.window.document;
    const all = [...doc.querySelectorAll(SCREEN_SEL)]; const top = all.filter((e) => !all.some((o) => o !== e && o.contains(e)));
    const hits = (e) => S.re.test([e.id, e.getAttribute('data-screen'), e.getAttribute('data-page'), e.getAttribute('aria-label'), e.getAttribute('title'), String(e.className), (e.querySelector('h1,h2,h3')?.textContent ?? '').slice(0, 80)].join(' '));
    const out = `inputs/scoped/${norm(relative('inputs', f))}`; let kept = []; let dropped = [];
    if (top.length >= 2) {
      for (const e of top) (hits(e) ? kept : dropped).push(e.id ? `#${e.id}` : e.getAttribute('data-screen') ?? e.tagName.toLowerCase());
      if (!kept.length) { rep.push(`UX  ${f}: no screen matched (${dropped.join(', ')}) — dropped`); continue; }
      for (const e of top) if (!hits(e)) e.remove();
    } else if (S.re.test(`${f} ${doc.title} ${(doc.querySelector('h1')?.textContent ?? '')} ${(doc.body?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 1500)}`)) kept = ['whole file'];
    else { rep.push(`UX  ${f}: not in scope — dropped (${fmt(tok(html))} tokens)`); continue; }
    const sliced = `<!doctype html>\n${doc.documentElement.outerHTML}\n`; mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, sliced);
    rep.push(`UX  ${f} → ${out}: kept ${kept.join(', ')}${dropped.length ? ` · dropped ${dropped.join(', ')}` : ''} · ${fmt(tok(html))} → ${fmt(tok(sliced))} tokens`);
    S.before += tok(html); S.after += tok(sliced);
  }
}

// ── FSD / requirements markdown ──
const GLOBAL = /^(overview|introduction|purpose|scope|glossary|definitions?|roles?|users?|personas?|actors?|non-?functional|nfr|security|authentication|authorization|technical|general|common|conventions?|navigation|layout|design system|theme|branding|accessibility|error|validation|integration|api)\b/i;
function sliceMarkdown(S, rep) {
  const files = walk('inputs', (p) => /\.md$/i.test(p) && !/(^|\/)(scope|README)\.md$/i.test(norm(p)) && !norm(p).startsWith('inputs/scoped/'));
  for (const f of files) {
    const text = read(f); const lines = text.split('\n'); const secs = []; let fence = false; let cur = { level: 0, title: '(preamble)', start: 0 };
    lines.forEach((l, i) => { if (/^```/.test(l)) fence = !fence; const m = !fence && l.match(/^(#{1,6})\s+(.+)/); if (m) { cur.end = i; secs.push(cur); cur = { level: m[1].length, title: m[2].trim(), start: i }; } });
    cur.end = lines.length; secs.push(cur);
    secs.forEach((s, i) => { s.body = lines.slice(s.start, s.end); s.parents = []; let lv = s.level; for (let j = i - 1; j >= 0 && lv > 1; j--) if (secs[j].level < lv) { s.parents.push(j); lv = secs[j].level; } });
    const keep = new Map(); // index → reason
    const mark = (i, why) => { if (!keep.has(i)) keep.set(i, why); };
    secs.forEach((s, i) => {
      const own = S.re.test(s.title); const inherited = s.parents.some((p) => S.re.test(secs[p].title));
      const bodyHits = (s.body.join('\n').match(new RegExp(S.re.source, 'gi')) ?? []).length;
      if (own || inherited) mark(i, 'matches scope');
      else if (bodyHits >= 2) mark(i, `mentions scope ${bodyHits}×`);
      else if (i === 0 && s.body.join('').trim()) mark(i, 'preamble');
      else if (GLOBAL.test(s.title.replace(/^[\d.\s]+/, ''))) mark(i, 'global (capped)');
    });
    for (const i of [...keep.keys()]) for (const p of secs[i].parents) mark(p, 'heading of a kept section');
    if (keep.size <= 1 && !keep.has(0)) { rep.push(`FSD ${f}: nothing matched the keywords — dropped (check inputs/scope.md Keywords)`); continue; }
    const out = []; const dropped = [];
    secs.forEach((s, i) => {
      const why = keep.get(i); if (!why) { if (s.level) dropped.push(s.title); return; }
      const cap = why.startsWith('global') ? 40 : why.startsWith('mentions') ? 80 : why === 'heading of a kept section' ? 3 : Infinity;
      out.push(...s.body.slice(0, cap)); if (s.body.slice(cap).some((l) => l.trim())) out.push(`<!-- scope: ${s.body.length - cap} more lines of "${s.title}" omitted — full text in ${f} -->`);
    });
    const o = `inputs/scoped/${norm(relative('inputs', f))}`; const body = `<!-- Scoped extract of ${f} for: ${S.kw.slice(0, 6).join(', ')}. Dropped sections are listed in inputs/scoped/SCOPE-REPORT.md -->\n${out.join('\n')}\n`;
    mkdirSync(dirname(o), { recursive: true }); writeFileSync(o, body);
    rep.push(`FSD ${f} → ${o}: ${keep.size} of ${secs.length} sections · ${fmt(tok(text))} → ${fmt(tok(body))} tokens`);
    if (dropped.length) rep.push(`    dropped: ${dropped.slice(0, 14).join(' | ')}${dropped.length > 14 ? ` | … +${dropped.length - 14}` : ''}`);
    S.before += tok(text); S.after += tok(body);
  }
}

// ── OpenAPI (yaml text or json) ──
const REFRE = /#\/components\/(\w+)\/([\w.-]+)/g;
function sliceApi(S, rep) {
  for (const f of walk('inputs', (p) => /\.(ya?ml|json)$/i.test(p) && /(api|openapi|swagger|spec)/i.test(p))) {
    const text = read(f); const o = `inputs/scoped/${norm(relative('inputs', f))}`; let out;
    if (/\.json$/i.test(f)) {
      let d; try { d = JSON.parse(text); } catch { continue; } if (!d.paths) continue;
      const paths = Object.fromEntries(Object.entries(d.paths).filter(([k, v]) => S.re.test(k) || S.re.test(JSON.stringify(v))));
      const need = new Map(); const grab = (obj) => { for (const m of JSON.stringify(obj).matchAll(REFRE)) { const key = `${m[1]}/${m[2]}`; if (!need.has(key)) { need.set(key, 1); const v = d.components?.[m[1]]?.[m[2]]; if (v) grab(v); } } };
      grab(paths); const comps = {}; for (const key of need.keys()) { const [a, b] = key.split('/'); if (d.components?.[a]?.[b]) (comps[a] ??= {})[b] = d.components[a][b]; }
      if (d.components?.securitySchemes) comps.securitySchemes = d.components.securitySchemes;
      out = JSON.stringify({ ...d, paths, components: comps }, null, 2); rep.push(`API ${f} → ${o}: ${Object.keys(paths).length} of ${Object.keys(d.paths).length} paths${Object.keys(paths).length ? '' : ' — NONE matched (hybrid-api-config will propose and mock one)'}`);
    } else {
      const L = text.split('\n'); const top = (k) => L.findIndex((l) => l.startsWith(`${k}:`));
      const pi = top('paths'); if (pi < 0) continue; const next = (from) => { const j = L.findIndex((l, i) => i > from && /^\S/.test(l) && !l.startsWith('#')); return j < 0 ? L.length : j; };
      const pe = next(pi); const ind = (L.slice(pi + 1, pe).find((l) => /^\s+\S/.test(l))?.match(/^\s*/)?.[0].length) ?? 2;
      const entries = []; let c = null; for (let i = pi + 1; i < pe; i++) { if (new RegExp(`^ {${ind}}\\S`).test(L[i]) && !L[i].trim().startsWith('#')) { c = { key: L[i].trim().replace(/:$/, ''), lines: [] }; entries.push(c); } c?.lines.push(L[i]); }
      const keptE = entries.filter((e) => S.re.test(e.key) || S.re.test(e.lines.join('\n')));
      const ci = top('components'); const blocks = {}; const cEnd = ci >= 0 ? next(ci) : -1; let secHead = {};
      if (ci >= 0) { let sec = null; let sInd = null; let name = null; for (let i = ci + 1; i < cEnd; i++) { const l = L[i]; const m = l.match(/^( +)([\w-]+):\s*$/); if (m && (sInd === null || m[1].length === sInd)) { sInd = m[1].length; sec = m[2]; blocks[sec] = {}; name = null; secHead[sec] = i; continue; } const e = sec && l.match(/^( +)([\w.-]+):/); if (sec && e && e[1].length === sInd + ind) { name = e[2]; blocks[sec][name] = []; } if (sec && name) blocks[sec][name].push(l); } }
      const need = new Set(); const grab = (txt) => { for (const m of txt.matchAll(REFRE)) { const key = `${m[1]}/${m[2]}`; if (!need.has(key)) { need.add(key); grab((blocks[m[1]]?.[m[2]] ?? []).join('\n')); } } };
      grab(keptE.map((e) => e.lines.join('\n')).join('\n'));
      const res = [...L.slice(0, pi + 1), ...(keptE.length ? keptE.flatMap((e) => e.lines) : [`${' '.repeat(ind)}{}  # no path matched the scope keywords`])];
      if (ci >= 0) { res.push(...L.slice(pe, ci + 1)); const sInd = ' '.repeat((L[ci + 1]?.match(/^ */)?.[0].length) ?? 2);
        for (const [sec, items] of Object.entries(blocks)) { const names = Object.keys(items).filter((n) => need.has(`${sec}/${n}`) || sec === 'securitySchemes'); if (names.length) { res.push(`${sInd}${sec}:`); for (const n of names) res.push(...items[n]); } }
        res.push(...L.slice(cEnd)); } else res.push(...L.slice(pe));
      out = res.join('\n'); rep.push(`API ${f} → ${o}: ${keptE.length} of ${entries.length} paths${keptE.length ? '' : ' — NONE matched (hybrid-api-config will propose and mock one)'}`);
    }
    mkdirSync(dirname(o), { recursive: true }); writeFileSync(o, out); rep.push(`    ${fmt(tok(text))} → ${fmt(tok(out))} tokens`); S.before += tok(text); S.after += tok(out);
  }
}

async function slice() {
  const S = loadScope(); S.before = 0; S.after = 0; const rep = [];
  rmSync('inputs/scoped', { recursive: true, force: true }); mkdirSync('inputs/scoped', { recursive: true });
  await sliceHtml(S, rep); sliceMarkdown(S, rep); sliceApi(S, rep);
  const head = `# Scope report\nKeywords: ${S.kw.join(', ')}\nInputs read in full: ${fmt(S.before)} tokens → in scope: ${fmt(S.after)} tokens (${S.before ? Math.round((1 - S.after / S.before) * 100) : 0}% less for every agent, every session)\n\nCheck it in 30 seconds: is anything you need listed under "dropped"? Add its words:  node tools/scope.mjs slice --also "<word>"\n\n`;
  writeFileSync('inputs/scoped/SCOPE-REPORT.md', `${head}${rep.map((r) => `- ${r}`).join('\n')}\n`);
  console.log(`${head}${rep.join('\n')}\n\n→ agents read inputs/scoped/** ; the full inputs are untouched.`);
}
const show = () => { if (!existsSync('inputs/scoped/SCOPE-REPORT.md')) die('no slice yet — node tools/scope.mjs slice'); console.log(read('inputs/scoped/SCOPE-REPORT.md')); };
if (cmd === 'init') init(); else if (cmd === 'slice') await slice(); else if (cmd === 'show') show();
else console.log(read(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')).split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
