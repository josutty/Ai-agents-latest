/* global document, getComputedStyle, innerHeight, innerWidth, window, CSS, SVGElement, NodeFilter, Event -- functions passed to page.evaluate run in the browser */
// Prototype crawler: finds everything a static read of the HTML cannot see — screens reached by a click, the shared top bar,
// drawers / modals / popovers / toasts that JavaScript fills in, controls that change the page in place, hidden messages.
//   node tools/discover-interactions.mjs <design.html> [--out analysis] [--max 400]
// Writes analysis/interactions.md (+ .json) and screenshots in analysis/interactions/.
// How: opens the prototype in a real browser, finds every clickable thing, clicks each one in a FRESH page, and compares
// before/after (what appeared, what disappeared, what changed). New screens are explored in turn (sign-in → home → workbook …).
// Browser: `npx playwright install chromium` (or set CHROMIUM_PATH).
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

let pw;
try { pw = await import('@playwright/test'); } catch { pw = await import('playwright-core'); }
const { chromium } = pw;

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const positional = []; for (let i = 0; i < argv.length; i++) { if (argv[i] === '--out' || argv[i] === '--max') i++; else if (!argv[i].startsWith('--')) positional.push(argv[i]); }
const [file] = positional;
if (!file) { console.error('usage: node tools/discover-interactions.mjs <design.html> [--out analysis] [--max 400]'); process.exit(2); }
const OUT = flag('--out', 'analysis');
const MAX_CLICKS = Number(flag('--max', 400));
const VIEWPORT = { width: 1440, height: 900 };
const URL_ = pathToFileURL(resolve(file)).href;
const slug = (s) => (s || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
mkdirSync(`${OUT}/interactions`, { recursive: true });

// ── runs in the page: installs window.__c (collect / act / begin / end …) ──
function installLib() {
  const W = innerWidth, H = innerHeight;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'OPTION', 'BR', 'HEAD', 'META', 'LINK', 'TITLE']);
  const css = (el) => getComputedStyle(el);
  const txt = (t) => (t ?? '').replace(/\s+/g, ' ').trim();
  const shown = (el) => { const s = css(el); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.01) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const idUnique = new Map();
  const uniqueId = (id) => { if (!idUnique.has(id)) idUnique.set(id, document.querySelectorAll('#' + CSS.escape(id)).length === 1); return idUnique.get(id); };
  const pathOf = (el) => {
    const parts = []; let n = el;
    while (n && n.nodeType === 1 && n !== document.body) {
      if (n.id && uniqueId(n.id)) { parts.unshift('#' + CSS.escape(n.id)); return parts.join(' > '); }
      const same = [...n.parentElement.children].filter((c) => c.tagName === n.tagName);
      parts.unshift(n.tagName.toLowerCase() + (same.length > 1 ? `:nth-of-type(${same.indexOf(n) + 1})` : ''));
      n = n.parentElement;
    }
    return 'body > ' + parts.join(' > ');
  };
  const shortSel = (el) => {
    if (el.id && uniqueId(el.id)) return '#' + el.id;
    for (const c of String(el.className?.baseVal ?? el.className).split(/\s+/).filter(Boolean)) if (document.querySelectorAll('.' + CSS.escape(c)).length === 1) return '.' + c;
    return pathOf(el);
  };
  const nameOf = (el) => txt(el.getAttribute('aria-label') || el.getAttribute('title') || (el.tagName === 'INPUT' ? el.value : '') || (el.tagName === 'SELECT' ? (el.id && document.querySelector('label[for="' + el.id + '"]')?.textContent) || el.id : el.textContent)).slice(0, 60);
  const labelOf = (el) => txt(el.getAttribute('aria-label') || (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent.replace(el.textContent, '')) || el.closest('label')?.textContent || el.placeholder || el.name || '').slice(0, 60);
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; };
  const NOISE = '[id*=clock i],[id*=timer i],[id*=countdown i],[class*=clock i],[class*=countdown i],[class*=timer i]';
  const bodyText = () => { // visible text, without live clocks (they change on their own)
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let s = ''; let n;
    while ((n = w.nextNode())) { const p = n.parentElement; if (!p || SKIP.has(p.tagName) || p.closest(NOISE) || !p.getClientRects().length) continue; s += n.textContent; }
    return s.replace(/\s+/g, ' ');
  };

  // every element a person could click: interactive tags, onclick, cursor:pointer
  const candidates = () => {
    const set = new Set(document.body.querySelectorAll('button,a[href],[onclick],[role=button],[role=tab],[role=menuitem],[role=switch],summary,select,input[type=checkbox],input[type=radio],input[type=submit]'));
    for (const el of document.body.querySelectorAll('*')) { if (SKIP.has(el.tagName) || set.has(el) || el instanceof SVGElement) continue; if (css(el).cursor === 'pointer' && el.parentElement && css(el.parentElement).cursor !== 'pointer') set.add(el); }
    return [...set].filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true' && shown(el));
  };
  const collect = () => {
    const seen = new Map(); const out = [];
    candidates().forEach((el, i) => {
      const inRow = !!el.closest('tbody'); const name = nameOf(el); const handler = txt(el.getAttribute('onclick')).slice(0, 90);
      const within = el.parentElement?.closest('[id]')?.id ?? '';
      let ctx = ''; for (let a = el.parentElement, k = 0; a && k < 3 && !ctx; a = a.parentElement, k++) ctx = txt((a.innerText ?? '').replace(el.innerText ?? '', '')).slice(0, 40);
      const sig = [el.tagName, String(el.className).replace(/\b(on|active|selected|open|sel)\b/g, '').trim(), handler.replace(/\d+/g, 'N'), (inRow ? el.title || el.getAttribute('aria-label') || '' : name.replace(/\d+/g, 'N')), within].join('|');
      if (seen.has(sig)) { seen.get(sig).count++; return; }
      const href = el.getAttribute('href') ?? '';
      const d = { i, count: 1, tag: el.tagName.toLowerCase(), name, handler, within, inRow, ctx,
        kind: el.tagName === 'SELECT' ? 'select' : el.tagName === 'A' && href && !href.startsWith('#') && !/^javascript:/i.test(href) ? 'link' : 'click',
        href, options: el.tagName === 'SELECT' ? [...el.options].map((o) => txt(o.textContent)) : undefined, sel: shortSel(el) };
      seen.set(sig, d); out.push(d);
    });
    return out;
  };
  const act = (i) => {
    const el = candidates()[i]; if (!el) return false;
    if (el.tagName === 'SELECT') { el.selectedIndex = el.selectedIndex === 0 && el.options.length > 1 ? 1 : 0; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    else el.click();
    return true;
  };
  const fill = () => { // sign-in style forms: give empty fields a value so "Sign in" can go through
    if (![...document.querySelectorAll('input[type=password]')].some(shown)) return;
    for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]),textarea')) if (shown(el) && !el.value) { el.value = 'demo'; el.dispatchEvent(new Event('input', { bubbles: true })); }
  };

  const snapNow = () => {
    const items = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (SKIP.has(el.tagName) || el instanceof SVGElement) continue;
      const s = css(el); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.01) continue;
      const r = el.getBoundingClientRect(); if (r.width * r.height < 1500) continue;
      const fixed = s.position === 'fixed';
      items.push({ el, k: pathOf(el), pos: s.position, x: Math.round(r.x + (fixed ? 0 : window.scrollX)), y: Math.round(r.y + (fixed ? 0 : window.scrollY)), w: Math.round(r.width), h: Math.round(r.height), vx: Math.round(r.x), vy: Math.round(r.y) });
    }
    const attrs = (e) => Object.fromEntries([...e.attributes].map((a) => [a.name, a.value]));
    return { items, text: hash(bodyText()), geo: hash(items.map((i) => `${i.k}${i.x}${i.y}${i.w}${i.h}`).join()),
      html: attrs(document.documentElement), body: attrs(document.body),
      classes: [...document.body.querySelectorAll('[class]')].filter((e) => !(e instanceof SVGElement)).map((e) => ({ el: e, c: e.className })) };
  };
  const describe = (el) => {
    const s = css(el); const r = el.getBoundingClientRect();
    const heads = [...el.querySelectorAll('h1,h2,h3,h4,h5,h6,legend,[role=heading],caption')].filter(shown).map((h) => txt(h.textContent)).filter(Boolean);
    const lines = []; const seenT = new Set();
    for (const n of [el, ...el.querySelectorAll('*')]) {
      if (SKIP.has(n.tagName) || n instanceof SVGElement || !shown(n)) continue;
      const own = txt([...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join(' '));
      if (own && !seenT.has(own)) { seenT.add(own); lines.push(own.slice(0, 90)); }
    }
    return { title: heads[0] || el.getAttribute('aria-label') || '', headings: heads.slice(0, 20), lines: lines.slice(0, 80),
      buttons: [...el.querySelectorAll('button,a[href],[role=button],input[type=submit]')].filter(shown).map(nameOf).filter(Boolean).slice(0, 20),
      fields: [...el.querySelectorAll('input,select,textarea')].filter(shown).map((i) => ({ type: i.type || i.tagName.toLowerCase(), label: labelOf(i) })).slice(0, 20),
      tableHeads: [...el.querySelectorAll('th')].filter(shown).map((t) => txt(t.textContent)).slice(0, 30),
      box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      style: { background: s.backgroundColor, radius: s.borderTopLeftRadius, shadow: s.boxShadow === 'none' ? 'none' : s.boxShadow.slice(0, 80), font: s.fontFamily.split(',')[0].replace(/["']/g, '').trim(), fontSize: s.fontSize } };
  };
  const classify = (root, wrapper) => { // what kind of floating thing is this panel?
    const r = root.el.getBoundingClientRect(); const left = r.left <= 2, right = r.right >= W - 2, top = r.top <= 2, bottom = r.bottom >= H - 2;
    const centered = Math.abs((r.left + r.right) / 2 - W / 2) < W * 0.1 && Math.abs((r.top + r.bottom) / 2 - H / 2) < H * 0.25;
    if ((left || right) && r.height >= H * 0.8 && r.width < W * 0.7) return { kind: 'drawer', side: right ? 'right' : 'left' };
    if ((top || bottom) && r.width >= W * 0.8 && r.height < H * 0.7 && root.pos === 'fixed') return { kind: 'sheet', side: bottom ? 'bottom' : 'top' };
    if (wrapper && centered) return { kind: 'modal', side: 'center' };
    if (root.pos === 'fixed' && r.width * r.height < W * H * 0.1 && txt(root.el.textContent)) return { kind: 'notification', side: bottom ? 'bottom' : top ? 'top' : right ? 'right' : 'left' };
    return { kind: root.pos === 'fixed' ? 'floating panel' : 'popover', side: '' };
  };
  const viewSig = () => {
    const big = [...document.body.querySelectorAll('[id]')].filter((e) => !SKIP.has(e.tagName) && !(e instanceof SVGElement) && css(e).position !== 'fixed' && shown(e) && (() => { const r = e.getBoundingClientRect(); return r.width * r.height >= 0.25 * W * H; })());
    // a screen = a big block with a hidden sibling block (the screens are switched on and off); innermost one wins (#vHome inside #app)
    const views = big.filter((e) => [...e.parentElement.children].some((s) => s !== e && s.id && !SKIP.has(s.tagName) && css(s).display === 'none' && css(s).position !== 'fixed' && s.querySelectorAll('*').length >= 10));
    const pool = views.length ? views : big.filter((e) => !big.some((o) => o !== e && o.contains(e)));
    const leaf = pool.filter((e) => !pool.some((o) => o !== e && e.contains(o)));
    return leaf.map(shortSel).sort().join(',') || 'body';
  };
  const bar = () => { // the shared top bar / header, if the screen has one
    for (const el of document.body.querySelectorAll('*')) {
      if (SKIP.has(el.tagName) || el instanceof SVGElement || !shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.top <= 2 && r.width >= W * 0.9 && r.height >= 30 && r.height <= 130 && txt(el.textContent).length > 3) {
        const d = describe(el); return { sel: shortSel(el), height: Math.round(r.height), background: d.style.background, buttons: d.buttons, lines: d.lines.slice(0, 20) };
      }
    }
    return null;
  };
  const hiddenText = () => { // messages / panels that exist in the page but are not shown (errors, toasts, collapsed panels)
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (SKIP.has(el.tagName) || el instanceof SVGElement) continue;
      if (!(el.hidden || css(el).display === 'none')) continue;
      const p = el.parentElement; if (p && (p.hidden || css(p).display === 'none')) continue; // topmost hidden element only
      const t = txt(el.textContent); if (t.length < 3 || el.querySelectorAll('*').length > 60) continue;
      out.push({ sel: shortSel(el), text: t.slice(0, 140) });
    }
    return out;
  };

  const begin = () => { window.__s0 = snapNow(); };
  const end = () => {
    const B = window.__s0, A = snapNow();
    const kb = new Set(B.items.map((i) => i.k)), ka = new Set(A.items.map((i) => i.k));
    const appeared = A.items.filter((i) => !kb.has(i.k)), gone = B.items.filter((i) => !ka.has(i.k));
    const rootsOf = (arr) => arr.filter((i) => !arr.some((o) => o !== i && o.el && o.el.contains(i.el) && o.el !== i.el));
    const aroots = rootsOf(appeared); const BIG = 0.25 * W * H;
    const res = { sig: viewSig(), kind: 'none', overlays: [], effects: [] };
    for (const r of aroots) {
      if (r.pos === 'fixed' && r.w >= W * 0.9 && r.h >= H * 0.9) { // full-screen wrapper: a modal's overlay or a bare backdrop
        const inner = appeared.filter((i) => i !== r && r.el.contains(i.el) && i.w * i.h < 0.85 * W * H && txt(i.el.textContent)).sort((x, y) => y.w * y.h - x.w * x.h)[0];
        if (inner) res.overlays.push({ ...classify(inner, true), target: shortSel(inner.el), wrapper: shortSel(r.el), ...describe(inner.el) });
        else if (!txt(r.el.textContent)) res.backdrop = true; else res.overlays.push({ ...classify(r, false), target: shortSel(r.el), ...describe(r.el) });
      } else if (r.pos === 'fixed' || r.pos === 'absolute') {
        if (txt(r.el.textContent) || r.el.querySelector('input,button,table')) res.overlays.push({ ...classify(r, false), target: shortSel(r.el), ...describe(r.el) });
      }
    }
    res.toasts = res.overlays.filter((o) => o.kind === 'notification'); res.overlays = res.overlays.filter((o) => o.kind !== 'notification');
    const flow = aroots.filter((r) => r.pos !== 'fixed' && r.pos !== 'absolute');
    const bigNew = flow.filter((r) => r.w * r.h >= BIG), bigGone = gone.filter((g) => g.w * g.h >= BIG && g.pos !== 'fixed');
    if (res.overlays.length) res.kind = 'overlay';
    else if (bigNew.length && bigGone.length) { res.kind = 'view'; res.to = bigNew.map((r) => shortSel(r.el)).slice(0, 4); res.from = bigGone.map((r) => r.k).slice(0, 4); }
    else if (res.toasts.length) res.kind = 'notification';
    else if (flow.length) { res.kind = 'revealed'; res.revealed = flow.slice(0, 4).map((r) => ({ target: shortSel(r.el), text: txt(r.el.textContent).slice(0, 80) })); }
    // in-place changes (sort, filter, density, theme …)
    const diffAttrs = (name, x, y) => { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (x[k] !== y[k] && k !== 'style') res.effects.push(`${name}[${k}] ${x[k] ?? '∅'} → ${y[k] ?? '∅'}`); };
    diffAttrs('html', B.html, A.html); diffAttrs('body', B.body, A.body);
    let nc = 0;
    for (const { el, c } of B.classes) {
      if (nc >= 5 || !el.isConnected || String(el.className) === String(c)) continue;
      const x = String(c).split(/\s+/), y = String(el.className).split(/\s+/);
      const add = y.filter((v) => !x.includes(v)), del = x.filter((v) => !y.includes(v)); nc++;
      res.effects.push(`class on ${shortSel(el)}: ${[...add.map((v) => '+' + v), ...del.map((v) => '−' + v)].join(' ')}`);
    }
    if (B.text !== A.text) res.effects.push('visible text changed');
    if (B.geo !== A.geo && !res.effects.length) res.effects.push('layout changed');
    if (res.kind === 'none' && res.effects.length) res.kind = 'in-place';
    return res;
  };
  window.__c = { collect, act, fill, begin, end, viewSig, bar, hiddenText };
}

// ── node side ──
const launch = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: process.env.CHROMIUM_PATH ? ['--no-sandbox', '--single-process', '--no-zygote'] : [] });
const browser = await launch();
const events = [];
async function newPage(path = []) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce', acceptDownloads: true });
  await ctx.route(/^https?:/, (r) => r.abort()); // no network: remote fonts would only slow the crawl down
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('popup', () => events.push('popup'));
  page.on('download', () => events.push('download'));
  await page.goto(URL_, { waitUntil: 'load' });
  await page.evaluate(installLib);
  for (const step of path) {
    await page.evaluate(() => window.__c.fill());
    await page.evaluate((i) => window.__c.act(i), step.i);
    await page.waitForTimeout(150);
    if (!(await page.evaluate(() => !!window.__c).catch(() => false))) await page.evaluate(installLib);
  }
  await page.evaluate(() => window.__c.fill());
  return { page, ctx };
}

const states = [];           // one per distinct screen
const seenSigs = new Set();
const queue = [{ path: [], via: null }];
let clicks = 0;
console.log(`discover-interactions: ${file}`);
while (queue.length && clicks < MAX_CLICKS) {
  const st = queue.shift();
  const { page, ctx } = await newPage(st.path);
  const sig = await page.evaluate(() => window.__c.viewSig());
  if (states.some((s) => s.sig === sig)) { await ctx.close(); continue; }
  const state = { sig, via: st.via, path: st.path, name: sig, bar: await page.evaluate(() => window.__c.bar()), hidden: await page.evaluate(() => window.__c.hiddenText()), results: [], links: [] };
  state.slug = slug(sig);
  await page.screenshot({ path: `${OUT}/interactions/screen-${state.slug}.png` });
  const controls = await page.evaluate(() => window.__c.collect());
  await ctx.close();
  states.push(state);
  console.log(`  screen ${sig}: ${controls.length} distinct controls`);
  for (const ctl of controls) {
    if (ctl.kind === 'link') { state.links.push(ctl); continue; }
    if (clicks++ >= MAX_CLICKS) break;
    const r = await newPage(st.path);
    let res; let shot = null;
    try {
      await r.page.evaluate(() => window.__c.begin());
      await r.page.evaluate((i) => window.__c.act(i), ctl.i);
      await r.page.waitForTimeout(160);
      res = await r.page.evaluate(() => window.__c.end());
      res.events = events.splice(0);
      if (res.overlays.length) {
        const o = res.overlays[0]; shot = `interactions/${state.slug}--${slug(ctl.name || ctl.handler)}-${clicks}.png`;
        const c = { x: Math.max(0, o.box.x), y: Math.max(0, o.box.y), width: Math.min(o.box.w, VIEWPORT.width - Math.max(0, o.box.x)), height: Math.min(o.box.h, VIEWPORT.height - Math.max(0, o.box.y)) };
        await r.page.screenshot({ path: `${OUT}/${shot}`, clip: c });
      } else if (res.kind === 'view') {
        shot = `interactions/screen-${slug(res.sig)}.png`; await r.page.screenshot({ path: `${OUT}/${shot}` });
      }
    } catch (e) { res = { kind: 'navigates', sig, overlays: [], effects: [String(e.message).split('\n')[0].slice(0, 80)], events: events.splice(0) }; }
    await r.ctx.close();
    state.results.push({ ctl, res, shot });
    if (res.kind === 'view' && !seenSigs.has(res.sig) && !states.some((s) => s.sig === res.sig) && st.path.length < 4) {
      seenSigs.add(res.sig); queue.push({ path: [...st.path, { i: ctl.i }], via: { from: sig, control: ctl.name || ctl.handler } });
    }
  }
}
await browser.close();

// ── report ──
const f = basename(file);
const target = (sel) => `${file.replace(/\\/g, '/')}#${/^#[A-Za-z][\w-]*$/.test(sel) ? sel.slice(1) : sel}`;
const ctlLabel = (c, s) => (c.name ? `"${c.name}"` : '(no accessible name)') + (c.count > 1 ? ` ×${c.count}` : '') + (s && c.ctx && s.results.filter((r) => r.ctl.name === c.name).length > 1 ? ` in "${c.ctx}"` : '');
const overlays = []; const inPlace = []; const none = []; const revealed = []; const toasts = [];
for (const s of states) for (const { ctl, res, shot } of s.results) {
  for (const t of res.toasts ?? []) toasts.push({ s, ctl, t });
  if (res.kind === 'overlay') overlays.push({ s, ctl, res, shot });
  else if (res.kind === 'in-place') inPlace.push({ s, ctl, res });
  else if (res.kind === 'revealed') revealed.push({ s, ctl, res });
  else if (res.kind === 'none' || res.kind === 'navigates') none.push({ s, ctl, res });
}
const L = [`# Interactions discovered in ${f}`, '',
  '_Generated by tools/discover-interactions.mjs — the prototype was opened in a browser and every control was clicked. Do not edit by hand._', '',
  `${states.length} screen(s) · ${overlays.length} overlay(s) (drawer / modal / popover) · ${toasts.length} toast(s) · ${inPlace.length} control(s) that change the page in place · ${revealed.length} that reveal a section · ${none.length} with no visible change · ${clicks} clicks.`, '',
  '**Every row below is a feature of the product.** wireframe-analyzer maps each row to a component, state or TASK; coverage-checker re-runs this script and blocks if one is missing.', '',
  '## Screens (each reached by a click — measure each one)', '', '| Screen | Reached by | Visible block | Measure it with | Evidence |', '|---|---|---|---|---|'];
for (const s of states) L.push(`| ${cell(s.name)} | ${s.via ? `${cell(s.via.control)} (from ${cell(s.via.from)})` : 'initial page'} | ${cell(s.sig)} | \`node tools/design-spec.mjs extract ${target(s.sig.split(',')[0])}\` | interactions/screen-${s.slug}.png |`);
L.push('', '## Shared chrome (top bar / header)', '');
const bars = states.filter((s) => s.bar);
if (!bars.length) L.push('None found.');
else {
  const sels = [...new Set(bars.map((s) => s.bar.sel))];
  for (const sel of sels) {
    const on = bars.filter((s) => s.bar.sel === sel); const b = on[0].bar;
    L.push(`- **${sel}** — ${b.height}px high, background ${b.background}; on: ${on.map((s) => s.name).join(', ')}${states.length - on.length ? `; absent on: ${states.filter((s) => !on.includes(s)).map((s) => s.name).join(', ')}` : ''}`,
      `  - Controls: ${b.buttons.map((x) => `"${x}"`).join(' · ') || '—'}`, `  - Text: ${b.lines.map((x) => `"${x}"`).join(' · ')}`,
      `  - Measure it with: \`node tools/design-spec.mjs extract ${target(sel)}\` — build it ONCE as a shared layout component, not per page.`);
  }
}
L.push('', '## Overlays — drawers, modals, popovers, toasts (content is generated by JavaScript, absent from the static HTML)', '');
if (!overlays.length) L.push('None found.');
for (const { s, ctl, res, shot } of overlays) for (const o of res.overlays) {
  const big = ['drawer', 'modal', 'sheet'].includes(o.kind); const capN = big ? 80 : 25;
  L.push(`### ${o.kind}${o.side ? ` (${o.side})` : ''}: ${o.title ? `"${cell(o.title)}"` : `opened by ${ctlLabel(ctl, s)}`}`, '',
    `- **Opened by:** ${ctlLabel(ctl, s)} on screen ${cell(s.name)}${ctl.handler ? ` · handler \`${cell(ctl.handler)}\`` : ''}${ctl.inRow ? ' · one per table row' : ''}`,
    `- **Size / place:** ${o.box.w}×${o.box.h}px at (${o.box.x}, ${o.box.y}) · background ${o.style.background} · radius ${o.style.radius} · shadow ${o.style.shadow} · ${o.style.font} ${o.style.fontSize}${res.backdrop || o.wrapper ? ' · dims the page behind it (scrim)' : ''}`,
    `- **Headings (in order):** ${o.headings.map((h) => `"${cell(h)}"`).join(' · ') || '—'}`,
    `- **Controls inside:** ${o.buttons.slice(0, 12).map((b) => `"${cell(b).slice(0, 40)}"`).join(' · ') || '—'}${o.buttons.length > 12 ? ' · …' : ''}`,
    `- **Fields:** ${o.fields.map((x) => `${x.type} "${cell(x.label)}"`).join(' · ') || '—'}`,
    ...(o.tableHeads.length ? [`- **Table columns:** ${o.tableHeads.map((h) => `"${cell(h)}"`).join(' · ')}`] : []),
    `- **All visible text (labels verbatim; numbers are sample data):** ${o.lines.slice(0, capN).map((x) => `"${cell(x)}"`).join(' · ')}${o.lines.length > capN ? ' · …' : ''}`,
    `- **Evidence:** ${shot ?? '—'}`,
    `- **Measure it with:** ${!ctl.name ? '⚠ the trigger has no accessible name — the build needs an aria-label, then measure by hand'
      : s.results.filter((r) => r.ctl.name === ctl.name).length > 1 ? '⚠ several controls share this name — measure by hand (open it in the browser, compare with the screenshot)'
        : `\`node tools/design-spec.mjs extract ${target(s.sig.split(',')[0])} --open "${ctl.name.replace(/"/g, '')}"\``}`, '');
}
L.push('## Toasts / notifications (short messages after an action)', '');
if (!toasts.length) L.push('None found.'); else L.push('| Screen | Control | Handler | Message (sample data) | Placement |', '|---|---|---|---|---|');
for (const { s, ctl, t } of toasts) L.push(`| ${cell(s.name)} | ${cell(ctlLabel(ctl, s))} | ${cell(ctl.handler) || '—'} | ${cell(t.lines.join(' '))} | ${t.side} · ${t.box.w}×${t.box.h}px · ${t.style.background} |`);
L.push('', '## Controls that change the page in place (sort, filter, density, theme, persona …)', '');
if (!inPlace.length) L.push('None found.'); else L.push('| Screen | Control | Handler | Effect |', '|---|---|---|---|');
for (const { s, ctl, res } of inPlace) L.push(`| ${cell(s.name)} | ${cell(ctlLabel(ctl, s))} | ${cell(ctl.handler) || '—'} | ${cell(res.effects.join('; '))} |`);
L.push('', '## Controls that reveal a section (expand / collapse / accordion)', '');
if (!revealed.length) L.push('None found.'); else L.push('| Screen | Control | Handler | Reveals |', '|---|---|---|---|');
for (const { s, ctl, res } of revealed) L.push(`| ${cell(s.name)} | ${cell(ctlLabel(ctl, s))} | ${cell(ctl.handler) || '—'} | ${cell(res.revealed.slice(0, 2).map((r) => `${r.target}: "${r.text.slice(0, 40)}…"`).join('; '))} |`);
L.push('', '## Selects (options the build must offer)', '');
const sels = states.flatMap((s) => s.results.filter((r) => r.ctl.kind === 'select').map((r) => ({ s, ctl: r.ctl })));
if (!sels.length) L.push('None found.'); else for (const { s, ctl } of sels) L.push(`- ${cell(s.name)} · ${ctlLabel(ctl)}: ${ctl.options.map((o) => `"${cell(o)}"`).join(' · ')}`);
L.push('', '## Hidden text in the page (error messages, toasts, collapsed panels, dialog shells)', '');
const wrappers = new Map(overlays.flatMap(({ ctl, res }) => res.overlays.filter((o) => o.wrapper).map((o) => [o.wrapper, ctl.name])));
const hid = states.flatMap((s) => s.hidden.map((h) => ({ s, ...h }))).filter((h) => !states.some((x) => x.sig.split(',').includes(h.sel)) && !overlays.some(({ res }) => res.overlays.some((o) => o.target === h.sel)));
const hidSeen = new Set(); const hidU = hid.filter((h) => (hidSeen.has(h.sel) ? false : hidSeen.add(h.sel)));
if (!hidU.length) L.push('None found.'); else L.push('| Where | Text | Probably shown when |', '|---|---|---|');
for (const h of hidU) L.push(`| ${cell(h.sel)} | ${cell(h.text)} | ${wrappers.has(h.sel) ? `dialog shell — opened by "${wrappers.get(h.sel)}"` : /err|invalid|wrong|⚠/i.test(h.sel + h.text) ? 'a validation message — show it when the check fails' : 'a state — see the overlays and controls above'} |`);
L.push('', '## Controls with NO visible change (a human decides: not built yet in the prototype, or an external link?)', '');
if (!none.length && !states.some((s) => s.links.length)) L.push('None.'); else L.push('| Screen | Control | Handler / link |', '|---|---|---|');
for (const { s, ctl, res } of none) L.push(`| ${cell(s.name)} | ${cell(ctlLabel(ctl, s))} | ${cell(ctl.handler) || '—'}${res.events?.length ? ` (${res.events.join(', ')})` : ''} |`);
for (const s of states) for (const l of s.links) L.push(`| ${cell(s.name)} | ${cell(ctlLabel(l))} | link → ${cell(l.href)} (not clicked) |`);
L.push('', '## Not detectable by clicking (check by eye at Gate 3)', '', '- hover-only tooltips and menus · drag and drop · keyboard shortcuts · scroll-triggered effects · behaviour that needs a different login or role (e.g. the persona select lists other roles — each role may have its own screens in another file).', '');
writeFileSync(`${OUT}/interactions.md`, L.join('\n'));
writeFileSync(`${OUT}/interactions.json`, JSON.stringify({ file, screens: states.map(({ name, sig, via, bar }) => ({ name, sig, via, bar })), overlays: overlays.map(({ s, ctl, res }) => ({ screen: s.name, trigger: ctl.name, handler: ctl.handler, overlays: res.overlays.map(({ kind, side, title, headings, buttons, box }) => ({ kind, side, title, headings, buttons, box })) })), inPlace: inPlace.length, none: none.length }, null, 2));
console.log(`wrote ${OUT}/interactions.md — ${states.length} screens, ${overlays.length} overlays, ${inPlace.length} in-place, ${revealed.length} reveal, ${none.length} no-change`);
