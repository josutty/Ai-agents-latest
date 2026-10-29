/* global document, getComputedStyle, innerHeight, innerWidth -- functions passed to page.evaluate run in the browser */
// Design fidelity tool (agent-docs/rules/design-fidelity.md). Renders in a real browser (Playwright).
//   node tools/design-spec.mjs extract <design.html[#screen-id]> [--out analysis/design-spec]
//   node tools/design-spec.mjs compare <design.html[#screen-id]> <url | /route> [--start] [--out plan/design-diff]
//   node tools/design-spec.mjs tokens <design.html> [more.html …] [--out analysis]
//     → analysis/design-tokens-raw.md + .json: every CSS variable of the design (light + dark), the fonts it uses and where it loads
//       them from. tools/check-tokens.mjs later checks that the build's tokens.css carries the same values and fonts.
// extract/compare also measure BLOCKS (cards and panels: heading, position, width, background, border, radius, shadow, padding,
// gaps between rows) and compare writes visual.png — the design with every area that looks different marked in red.
// Add  --open "<control name>"  to click that control first (aria-label, title or text) and measure what it opens — a drawer, modal,
// popover or toast (see analysis/interactions.md). Several names = several clicks in a row. The same name must exist in the build.
// A screen can be an id (dealer.html#vHome) or any CSS selector (dealer.html#.topbar).
// `#screen-id`: one screen inside a prototype file that holds several (e.g. dealer.html#login) — only that
// element is shown and measured. Severities: content / rule / layout block; style needs a reason; data = info.
// `--start` runs the dev server in mock mode for the comparison. Browser: `npx playwright install chromium`
// (or set CHROMIUM_PATH). Exit code 1 when compare finds mismatches beyond tolerance.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2); const [cmd] = argv; const rest = argv.slice(1); // flags may come anywhere
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const positional = []; for (let i = 1; i < argv.length; i++) { if (argv[i] === '--out' || argv[i] === '--open') i++; else if (!argv[i].startsWith('--')) positional.push(argv[i]); }
const [a, b] = positional;
const OPEN = argv.flatMap((x, i) => (x === '--open' ? [argv[i + 1]] : [])).filter(Boolean);
const openSuffix = OPEN.length ? `-open-${OPEN.join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}` : '';
const VIEWPORT = { width: 1440, height: 900 };

async function open(browser, target) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(/^https?:/.test(target) ? target : pathToFileURL(resolve(target)).href, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  return page;
}

const splitTarget = (t) => { if (/^https?:/.test(t)) return [t, null]; const i = t.indexOf('#'); if (i < 0) return [t, null]; const rest = t.slice(i + 1); return [t.slice(0, i), /^[A-Za-z][\w-]*$/.test(rest) ? `#${rest}` : rest]; };
const screenName = (t) => { const [f, sc] = splitTarget(t); return `${basename(f, '.html')}${sc ? `-${sc.replace(/^#/, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')}` : ''}${openSuffix}`; };

// Runs inside the page: show only the scoped screen (its siblings hidden, it and its ancestors forced visible).
function showOnly(sel) {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`screen ${sel} not found in the design file`);
  // screens that are switched by a class (<div class="view on">): turn THIS one on and its peers off, instead of forcing display:block (which breaks flex/grid layouts)
  const peers = [...(el.parentElement?.children ?? [])].filter((x) => x !== el && [...x.classList].some((c) => el.classList.contains(c)));
  const onClasses = [...new Set(peers.flatMap((p) => [...p.classList]))].filter((c) => !el.classList.contains(c) && peers.some((p) => getComputedStyle(p).display !== 'none' && p.classList.contains(c)));
  for (const c of onClasses) { el.classList.add(c); for (const p of peers) p.classList.remove(c); }
  // other siblings are hidden — except fixed ones (drawer, modals, toast), which --open needs
  for (const sib of el.parentElement?.children ?? []) if (sib !== el && !['SCRIPT', 'STYLE', 'TEMPLATE'].includes(sib.tagName) && getComputedStyle(sib).position !== 'fixed') sib.style.setProperty('display', 'none', 'important');
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    n.hidden = false;
    if (getComputedStyle(n).display === 'none') n.style.setProperty('display', 'block', 'important');
  }
}

// Runs inside the page: returns the spec of the first data table + controls + palette + page layout + texts.
function readSpec(scope) {
  const root = (scope && document.querySelector(scope)) || document.body;
  const px = (v) => Math.round(parseFloat(v) * 10) / 10 || 0;
  const style = (el) => {
    const s = getComputedStyle(el);
    return { fontFamily: s.fontFamily.split(',')[0].replace(/["']/g, '').trim(), fontSize: px(s.fontSize), fontWeight: Number(s.fontWeight),
      color: s.color, background: s.backgroundColor, textAlign: s.textAlign, textTransform: s.textTransform,
      letterSpacing: s.letterSpacing === 'normal' ? 0 : px(s.letterSpacing), whiteSpace: s.whiteSpace,
      paddingX: px(s.paddingLeft), paddingY: px(s.paddingTop), borderRight: px(s.borderRightWidth) ? s.borderRightColor : 'none',
      borderRadius: px(s.borderTopLeftRadius), position: s.position, deco: decoOf(el), bgImage: gradientOf(el)?.raw ?? null };
  };
  const text = (el) => (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const parseRgb = (c) => { const m = (c ?? '').match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] ?? 1 }; };
  const where = (el) => (el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}${el.classList[0] ? `.${el.classList[0]}` : ''}`);
  const gradientOf = (el) => {   // gradients and background images live in background-image, NOT background-color
    const bi = getComputedStyle(el).backgroundImage; if (!bi || bi === 'none') return null;
    const g = bi.match(/^(linear|radial|conic)-gradient\(/);
    if (!g) return { type: 'image', stops: [], angle: null, raw: bi.slice(0, 80) };
    const ang = bi.match(/(-?[\d.]+)deg/);
    return { type: g[1], stops: [...bi.matchAll(/rgba?\([^)]*\)/g)].map((m) => m[0]), angle: ang ? Number(ang[1]) : null, raw: bi.slice(0, 200) };
  };
  const blend = (f, bg) => ({ r: f.r * f.a + bg.r * (1 - f.a), g: f.g * f.a + bg.g * (1 - f.a), b: f.b * f.a + bg.b * (1 - f.a), a: 1 });
  const effBg = (el) => {        // the colour really behind an element (gradients → average of their stops)
    for (let n = el; n; n = n.parentElement) {
      const g = gradientOf(n);
      if (g?.stops.length) { const cs = g.stops.map(parseRgb).filter(Boolean); const avg = (k) => cs.reduce((t, c) => t + c[k], 0) / cs.length; return { r: avg('r'), g: avg('g'), b: avg('b'), a: 1 }; }
      const c = parseRgb(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) return c.a >= 1 ? c : blend(c, effBg(n.parentElement));
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const lum = (c) => { const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const contrastOn = (fgStr, el) => { const fg = parseRgb(fgStr); if (!fg) return 21; const bg = effBg(el); const l1 = lum(blend(fg, bg)), l2 = lum(bg); return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 10) / 10; };
  const decoOf = (el) => { for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const s = getComputedStyle(n); if (/underline|line-through/.test(s.textDecorationLine)) return /line-through/.test(s.textDecorationLine) ? 'line-through' : 'underline'; if (s.display !== 'inline') break; } return 'none'; };
  const ownTextOf = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
  const out = { table: null, controls: [], decor: [], palette: {}, page: null, card: null, blocks: [], texts: [], inputs: [], gradients: [] };
  const table = [...root.querySelectorAll('table')].find((t) => t.getBoundingClientRect().width > 0) ?? null; // visible tables only
  if (table) {
    const headRows = [...table.querySelectorAll('thead tr')];
    const leafRow = headRows[headRows.length - 1];
    const groupRow = headRows.length > 1 ? headRows[0] : null;
    const firstBody = table.querySelector('tbody tr');
    const bodyRows = [...table.querySelectorAll('tbody tr')];
    const leaves = [...leafRow.children].map((th, i) => {
      const cells = bodyRows.map((r) => r.children[i]).filter(Boolean);
      const cell = cells[0];
      const valueEl = cell && (cell.querySelector('input, span, a') && !cell.querySelector('input') ? cell.querySelector('span, a') : cell);
      const colors = [...new Set(cells.map((c) => getComputedStyle(c.querySelector('span:not(.was)') ?? c).color))];
      const input = cell?.querySelector('input');
      const secondary = cell && [...cell.querySelectorAll('span, div, small')].find((e) => e !== valueEl && text(e) && input);
      return {
        label: text(th), width: Math.round(th.getBoundingClientRect().width), header: style(th),
        body: cell ? style(cell) : null, value: valueEl && valueEl !== cell ? style(valueEl) : null,
        conditionalColors: colors.length > 1 ? colors : [],
        emptyShownAs: cells.map((c) => text(c)).find((t) => /^[–—-]$/.test(t)) ?? null,
        input: input ? { ...style(input), width: Math.round(input.getBoundingClientRect().width), backgrounds: [...new Set(cells.map((c) => c.querySelector('input')).filter(Boolean).map((i) => getComputedStyle(i).backgroundColor))] } : null,
        secondary: secondary ? { sample: text(secondary), ...style(secondary) } : null,
        hasButton: cell ? [...cell.querySelectorAll('button')].map((x) => x.getAttribute('aria-label') ?? text(x))[0] ?? null : null,
      };
    });
    let col = 0;
    const groups = groupRow ? [...groupRow.children].map((th) => { const span = Number(th.getAttribute('colspan') ?? 1); const g = { label: text(th), from: col, span, style: style(th) }; col += span; return g; }) : [];
    out.table = { label: table.getAttribute('aria-label') ?? '', groups, leaves, rowHeight: firstBody ? Math.round(firstBody.getBoundingClientRect().height) : 0, headerRows: headRows.length };
  }
  for (const el of root.querySelectorAll('button, [role="button"], a[href], input[type="search"]')) { // links count as controls whether built as <a> or <button>
    if (el.closest('tbody') || !el.getBoundingClientRect().width) continue; // hidden screens' controls don't count
    const name = el.getAttribute('aria-label') ?? text(el) ?? el.getAttribute('placeholder');
    const group = el.closest('[role="group"], [role="radiogroup"], [role="toolbar"]');
    out.controls.push({ name: el.tagName === 'INPUT' ? `search: ${el.getAttribute('placeholder') ?? name}` : name,
      pressed: el.getAttribute('aria-pressed') ?? el.getAttribute('aria-checked') ?? el.getAttribute('data-state'), popup: el.getAttribute('aria-haspopup'), contrast: contrastOn(getComputedStyle(el).color, el), cy: Math.round(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2),
      inGroup: group?.getAttribute('aria-label') ?? null, height: Math.round(el.getBoundingClientRect().height), ...style(el) });
  }
  // decorated elements outside tables: chips, badges, bars (own background, short text)
  for (const el of root.querySelectorAll('*')) {
    if (el.closest('table, button, input, [role="menu"]') || ['BUTTON', 'INPUT'].includes(el.tagName)) continue;
    const s = getComputedStyle(el); const t = text(el);
    if (/rgba\(0, 0, 0, 0\)/.test(s.backgroundColor) || s.backgroundColor === 'rgb(255, 255, 255)' || !t || t.length > 40) continue;
    out.decor.push({ text: t, background: s.backgroundColor, color: s.color, radius: px(s.borderTopLeftRadius), fontSize: px(s.fontSize) });
  }
  for (const el of root.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    for (const c of [s.color, s.backgroundColor, s.borderTopColor]) if (!/rgba\(0, 0, 0, 0\)/.test(c)) out.palette[c] = (out.palette[c] ?? 0) + 1;
  }
  const seenG = new Set();
  for (let n = root; n; n = n.parentElement) { /* the screen element AND what it sits in */ const g = gradientOf(n); if (g && !seenG.has(where(n))) { seenG.add(where(n)); out.gradients.push({ where: where(n), ...g }); } }
  for (const n of root.querySelectorAll('*')) { const g = gradientOf(n); if (g && !seenG.has(where(n))) { seenG.add(where(n)); out.gradients.push({ where: where(n), ...g }); } }
  for (const g of out.gradients) for (const c of g.stops) out.palette[c] = (out.palette[c] ?? 0) + 1;
  // ── page level: what is behind everything, the main card/panel, where each text sits ──
  const transparent = (c) => !c || /rgba\(0, 0, 0, 0\)|transparent/.test(c);
  const bgOf = (el) => { const c = effBg(el); return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`; }; // gradient-aware: what is really behind it
  const probe = document.elementFromPoint(3, Math.round(innerHeight / 2)) ?? document.body; let pg = null, pc = null;
  for (let n = probe; n; n = n.parentElement) { if (!pg) { const g = gradientOf(n); if (g) pg = { ...g, on: where(n) }; } if (!pc) { const c = getComputedStyle(n).backgroundColor; if (!transparent(c)) pc = c; } if (pg && pc) break; }
  out.page = { background: pc ?? 'rgb(255, 255, 255)', gradient: pg };
  let card = null;
  for (const el of root.querySelectorAll('div, section, form, main, article')) {
    if (el.closest('table')) continue;
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (transparent(s.backgroundColor) || r.width < 240 || r.height < 120) continue;
    if (bgOf(el.parentElement ?? document.body) === s.backgroundColor) continue; // same as behind it → not a panel
    if (px(s.borderTopLeftRadius) < 4 && s.boxShadow === 'none') continue;
    if (!card || r.width * r.height > card.area) card = { el, area: r.width * r.height, background: s.backgroundColor, radius: px(s.borderTopLeftRadius), width: Math.round(r.width), centered: Math.abs(r.left - (innerWidth - r.right)) <= 16 };
  }
  out.card = card ? { background: card.background, radius: card.radius, width: card.width, centered: card.centered } : null;
  // ── blocks: every card / panel (own background, border or shadow) with its heading, place and look ──
  {
    const rr = root.getBoundingClientRect(); const found = [];
    // a border on ANY side marks a region too (a filter rail has only a right border, a bottom bar only a top one)
    const sideBorder = (s) => ['Top', 'Right', 'Bottom', 'Left'].map((k) => [px(s[`border${k}Width`]), s[`border${k}Color`]]).find(([w, c]) => w > 0 && !transparent(c))?.[1] ?? null;
    const boxed = (s) => (s.boxShadow !== 'none' && !/^rgba?\(0, 0, 0, 0\)/.test(s.boxShadow)) || !!sideBorder(s);
    for (const el of root.querySelectorAll('div, section, article, form, aside, nav, header, main, fieldset, details')) {
      if (el.closest('table, button, select, [role="menu"], [role="listbox"]')) continue;
      const s = getComputedStyle(el); const r = el.getBoundingClientRect();
      if (r.width < 160 || r.height < 44 || s.display === 'none') continue;
      const own = transparent(s.backgroundColor) ? null : s.backgroundColor;
      if (!(boxed(s) || (own && bgOf(el.parentElement ?? document.body) !== own))) continue;
      const lines = (el.innerText ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
      if (!lines.length) continue;
      const head = el.querySelector('h1, h2, h3, h4, h5, h6, legend, [class*="title"], [class*="head"], [class*="hd"], [class*="overline"]');
      const headText = text(head ?? { innerText: '', textContent: '' }) || lines.find((l) => /[A-Za-z]{3}/.test(l) && !/\d/.test(l)) || '';
      found.push({ el, label: headText.slice(0, 60), x: Math.round(r.left - rr.left), y: Math.round(r.top - rr.top), w: Math.round(r.width), h: Math.round(r.height),
        background: own ?? 'none', border: sideBorder(s) ?? 'none', radius: px(s.borderTopLeftRadius),
        shadow: s.boxShadow !== 'none', padding: Math.round((px(s.paddingTop) + px(s.paddingLeft)) / 2) });
    }
    // drop wrapper chains: a block inside another block of nearly the same size adds nothing
    const kept = found.filter((f) => !found.some((o) => o !== f && o.el.contains(f.el) && Math.abs(o.w - f.w) <= 6 && Math.abs(o.h - f.h) <= 6 && (o.background !== 'none' || o.border !== 'none' || o.shadow)));
    for (const f of kept) { f.depth = kept.filter((o) => o !== f && o.el.contains(f.el)).length; }
    kept.sort((p, q) => p.y - q.y || p.x - q.x);
    const top = kept.filter((f) => f.depth === 0); let row = 0, rowY = null;
    for (const f of top) { if (rowY === null || f.y - rowY > 12) { row++; rowY = f.y; } f.row = row; }
    for (const f of kept) if (f.depth > 0) { const p = top.find((t) => t.el.contains(f.el)); f.row = p?.row ?? 0; }
    const rows = [...new Set(top.map((t) => t.row))];
    for (const rw of rows) { const members = top.filter((t) => t.row === rw); const prev = top.filter((t) => t.row === rw - 1); const bottom = prev.length ? Math.max(...prev.map((t) => t.y + t.h)) : null; for (const t of members) t.gapAbove = bottom === null ? null : t.y - bottom; }
    out.blocks = kept.slice(0, 60).map((f) => ({ label: f.label, depth: f.depth, row: f.row, x: f.x, y: f.y, w: f.w, h: f.h, rootWidth: Math.round(rr.width), background: f.background, border: f.border, radius: f.radius, shadow: f.shadow, padding: f.padding, gapAbove: f.gapAbove ?? null }));
  }
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const texts = [];
  for (const el of root.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName) || el.closest('table, button, a[href], select, [role="menu"]') || !ownText(el)) continue;
    const rr = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => { const g = document.createRange(); g.selectNodeContents(n); return g.getBoundingClientRect(); });
    const r = { left: Math.min(...rr.map((x) => x.left)), right: Math.max(...rr.map((x) => x.right)), top: Math.min(...rr.map((x) => x.top)), bottom: Math.max(...rr.map((x) => x.bottom)) }; r.width = r.right - r.left; r.height = r.bottom - r.top;
    if (r.width <= 1 || r.height <= 1) continue; // invisible or screen-reader-only
    let c = el; while (c.parentElement && c.getBoundingClientRect().width < r.width + 16) c = c.parentElement;
    const cr = c.getBoundingClientRect(); const lg = r.left - cr.left, rg = cr.right - r.right; const s = getComputedStyle(el);
    texts.push({ el, mixed: [...el.children].some((ch) => (ch.textContent ?? '').trim()), text: ownTextOf(el).slice(0, 80), deco: decoOf(el), contrast: contrastOn(s.color, el), inCard: !!card && card.el.contains(el), align: [...el.children].some((ch) => (ch.textContent ?? '').trim()) ? 'mixed' : Math.abs(lg - rg) <= 8 ? 'center' : lg < rg ? 'left' : 'right',
      cy: Math.round(r.top + r.height / 2), fontSize: px(s.fontSize), fontWeight: Number(s.fontWeight), color: s.color });
  }
  for (const t of texts) { const p = texts.find((o) => o !== t && Math.abs(o.cy - t.cy) <= 4 && !o.el.contains(t.el) && !t.el.contains(o.el)); t.row = p ? p.text : null; }
  for (const c of out.controls) { const t = texts.find((o) => o.text && Math.abs(o.cy - c.cy) <= 4); c.row = t ? t.text : null; }
  out.texts = texts.map((t) => ({ text: t.text, deco: t.deco, contrast: t.contrast, inCard: t.inCard, align: t.align, cy: t.cy, row: t.row, fontSize: t.fontSize, fontWeight: t.fontWeight, color: t.color }));
  out.inputs = [...root.querySelectorAll('input:not([type="hidden"]):not([type="search"]), select, textarea')].filter((el) => !el.closest('table')).map((el) => {
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    return { name: (el.labels?.[0] ? ownTextOf(el.labels[0]) : null) ?? el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.type,
      background: s.backgroundColor, border: px(s.borderTopWidth) ? s.borderTopColor : 'none', radius: px(s.borderTopLeftRadius), height: Math.round(r.height), fontSize: px(s.fontSize) };
  });
  return out;
}

// Runs inside the page: click the named controls, then return a selector for what opened (a visible fixed-position block with text).
function openByName(names) {
  const norm = (v) => (v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const vis = (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  for (const name of names) {
    const el = [...document.querySelectorAll('button,a,[role=button],[role=tab],[role=menuitem],summary,[onclick],input[type=button],input[type=submit]')].filter(vis)
      .find((e) => [e.getAttribute('aria-label'), e.getAttribute('title'), e.textContent, e.value].some((v) => norm(v) === norm(name)));
    if (!el) throw new Error(`--open: no visible control named "${name}" (a build must give it an aria-label or title with that text)`);
    el.click();
  }
  const fixed = [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).position === 'fixed' && vis(e) && (e.innerText ?? '').trim());
  const top = fixed.filter((e) => !fixed.some((o) => o !== e && o.contains(e))).pop();
  if (!top) throw new Error(`--open "${names.join(' > ')}": nothing opened (no visible fixed-position block with text)`);
  top.setAttribute('data-spec-scope', '1');
  return '[data-spec-scope]';
}

// one browser per page: robust everywhere (and required by some sandboxed Chromium builds)
async function snapshot(target, shot) {
  const browser = await launch();
  const [file, scope] = splitTarget(target);
  try {
    const page = await open(browser, file);
    if (scope) { await page.evaluate(showOnly, scope); await page.waitForTimeout(100); }
    let readScope = scope;
    if (OPEN.length) { readScope = await page.evaluate(openByName, OPEN); await page.waitForTimeout(250); }
    const spec = await page.evaluate(readSpec, readScope);
    if (shot) await page.screenshot({ path: shot, fullPage: true });
    return spec;
  }
  finally { await browser.close(); }
}
const launch = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: process.env.CHROMIUM_PATH ? ['--no-sandbox', '--single-process', '--no-zygote'] : [] });

function toMarkdown(name, spec) {
  const t = spec.table; const L = [`# Design spec — ${name}`, '', '_Generated by tools/design-spec.mjs from the rendered design. Copy labels and order EXACTLY._', ''];
  if (t) {
    L.push(`## Table "${t.label}" — ${t.headerRows} header rows, row height ${t.rowHeight}px`, '');
    if (t.groups.length) L.push('Group headers: ' + t.groups.map((g) => `${g.label ? `"${g.label}"` : '(empty)'}×${g.span}`).join(' · ') + `  — style ${g0(t.groups)}`, '');
    L.push('| # | Label | Width | Header | Body align / font | Value colors | Empty shown as | Extra |', '|---|---|---|---|---|---|---|---|');
    t.leaves.forEach((c, i) => L.push(`| ${i + 1} | "${c.label}" | ${c.width}px | ${c.header.fontSize}px/${c.header.fontWeight}${c.header.textTransform !== 'none' ? ' ' + c.header.textTransform : ''} | ${c.body ? `${c.body.textAlign} ${c.body.fontFamily} ${c.body.fontSize}px/${c.body.fontWeight} ${c.body.color}${c.body.position === 'sticky' ? ' **sticky**' : ''} nowrap=${c.body.whiteSpace === 'nowrap'}` : '—'} | ${c.conditionalColors.length ? 'CONDITIONAL: ' + c.conditionalColors.join(', ') : c.value ? c.value.color : '—'} | ${c.emptyShownAs ?? '—'} | ${[c.input && `input ${c.input.width}px ${c.input.fontSize}px r${c.input.borderRadius}`, c.secondary && `secondary "${c.secondary.sample}" ${c.secondary.fontSize}px ${c.secondary.color}`, c.hasButton && `button "${c.hasButton}"`].filter(Boolean).join('; ') || '—'} |`));
    L.push('', `Cell padding ${t.leaves[0]?.body?.paddingY}px × ${t.leaves[0]?.body?.paddingX}px · vertical lines: ${t.leaves[0]?.body?.borderRight}`, '');
  }
  L.push('## Controls (outside the table)', '', '| Name | Group | State | Popup | Font | Colors | Border/radius | Height |', '|---|---|---|---|---|---|---|---|');
  for (const c of spec.controls) L.push(`| "${c.name}" | ${c.inGroup ?? '—'} | ${c.pressed ?? '—'} | ${c.popup ?? '—'} | ${c.fontSize}px/${c.fontWeight}${c.deco !== 'none' ? ` ${c.deco}` : ''} | ${c.color} on ${c.background}${c.bgImage ? ` (${c.bgImage.slice(0, 40)}…)` : ''} | ${c.borderRight} r${c.borderRadius} | ${c.height}px |`);
  L.push('', '## Decorated elements (chips, badges, bars)', '', ...(spec.decor ?? []).map((x) => `- "${x.text}" — ${x.background} text ${x.color} ${x.fontSize}px r${x.radius}`));
  if (spec.page) { const g = spec.page.gradient; L.push('', '## Page', '', `Page background: ${g ? `**${g.type === 'image' ? 'image' : 'gradient'}** on ${g.on} — ${g.type}${g.angle !== null ? ` ${g.angle}deg` : ''} ${g.stops.join(' → ') || g.raw} (flat colour behind it: ${spec.page.background})` : spec.page.background}` + (spec.card ? ` · main card ${spec.card.background}, radius ${spec.card.radius}px, ${spec.card.width}px wide, ${spec.card.centered ? 'centered' : 'not centered'}` : ' · no card/panel')); }
  if (spec.gradients?.length) L.push('', '## Gradients and background images (one token each — never approximate with a flat colour)', '', ...spec.gradients.map((g) => `- ${g.where}: ${g.type}${g.angle !== null ? ` ${g.angle}deg` : ''} ${g.stops.join(' → ') || g.raw}`));
  if (spec.texts?.length) { L.push('', '## Texts (copy exactly; placement matters)', '', '| Text | Where | Align | Same line as | Font | Color | Decoration | Contrast |', '|---|---|---|---|---|---|---|---|');
    for (const t of spec.texts) L.push(`| "${t.text}" | ${spec.card ? (t.inCard ? 'in card' : 'on page') : '—'} | ${t.align} | ${t.row ? `"${t.row.slice(0, 30)}"` : '—'} | ${t.fontSize}px/${t.fontWeight} | ${t.color} | ${t.deco} | ${t.contrast}:1 |`); }
  if (spec.inputs?.length) { L.push('', '## Inputs', '', '| Field | Background | Border | Radius | Height |', '|---|---|---|---|---|');
    for (const i of spec.inputs) L.push(`| "${i.name}" | ${i.background} | ${i.border} | ${i.radius}px | ${i.height}px |`); }
  if (spec.blocks?.length) { L.push('', '## Blocks (cards / panels — build each as one container; x, y and width are relative to the screen)', '', '| # | Heading | Level | Row | x | y | Width | Height | Background | Border | Radius | Shadow | Padding | Gap above |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    spec.blocks.forEach((k, i) => L.push(`| ${i + 1} | ${k.label ? `"${k.label}"` : '(no heading)'} | ${k.depth === 0 ? 'top' : `inside (${k.depth})`} | ${k.row} | ${k.x} | ${k.y} | ${k.w}px | ${k.h}px | ${k.background} | ${k.border} | ${k.radius}px | ${k.shadow ? 'yes' : 'no'} | ${k.padding}px | ${k.gapAbove ?? '—'} |`));
    L.push('', 'Blocks on the same Row sit side by side. Width is compared as a share of the screen width (±15%).'); }
  L.push('', '## Palette (color → uses)', '', Object.entries(spec.palette).sort((x, y) => y[1] - x[1]).map(([c, n]) => `${c} ×${n}`).join(' · '), '');
  return L.join('\n');
}
const g0 = (gs) => { const s = gs.find((g) => g.label)?.style; return s ? `${s.fontSize}px/${s.fontWeight} ${s.textTransform} spacing ${s.letterSpacing}px ${s.color}` : '—'; };

// ── compare: only design properties, never data values ──
const near = (x, y, tol) => Math.abs((x ?? 0) - (y ?? 0)) <= tol;
const rgb = (c) => (c?.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
const colorDist = (x, y) => { const p = rgb(x), q = rgb(y); return p.length === 3 && q.length === 3 ? Math.max(...p.map((v, i) => Math.abs(v - q[i]))) : 0; };
const dsev = (x, y) => { const dist = colorDist(x, y); return dist <= 12 ? null : dist <= 40 ? 'style' : 'look'; }; // small shifts need a reason, big ones are a different look
const sameColor = (x, y) => { const p = rgb(x), q = rgb(y); return p.length === 3 && q.length === 3 && p.every((v, i) => Math.abs(v - q[i]) <= 12); };
function diff(d, b) {
  const m = []; const add = (severity, where, what, design, build) => m.push({ severity, where, what, design, build });
  if (!d.table || !b.table) { if (d.table) add('content', 'table', 'missing', 'present', 'absent'); }
  else {
    const dl = d.table.leaves.map((c) => c.label), bl = b.table.leaves.map((c) => c.label);
    if (dl.join('|') !== bl.join('|')) add('content', 'table', 'columns (order + labels)', dl.join(' · '), bl.join(' · '));
    const dg = d.table.groups.map((g) => `${g.label}×${g.span}`).join(' · '), bg = b.table.groups.map((g) => `${g.label}×${g.span}`).join(' · ');
    if (dg !== bg) add('content', 'table', 'group headers', dg, bg);
    if (!near(d.table.rowHeight, b.table.rowHeight, 4)) add('style', 'table', 'row height', `${d.table.rowHeight}px`, `${b.table.rowHeight}px`);
    for (const dc of d.table.leaves) {
      const bc = b.table.leaves.find((c) => c.label === dc.label); if (!bc) continue;
      const w = `column "${dc.label}"`;
      if (!near(dc.width, bc.width, Math.max(12, dc.width * 0.15))) add('style', w, 'width', `${dc.width}px`, `${bc.width}px`);
      for (const k of ['fontSize', 'fontWeight', 'textTransform']) if (String(dc.header[k]) !== String(bc.header[k])) add('style', w, `header ${k}`, dc.header[k], bc.header[k]);
      if (dc.body && bc.body) {
        for (const k of ['textAlign', 'whiteSpace', 'position', 'fontWeight']) if (String(dc.body[k]) !== String(bc.body[k])) add('style', w, `cell ${k}`, dc.body[k], bc.body[k]);
        if (!near(dc.body.fontSize, bc.body.fontSize, 0.5)) add('style', w, 'cell fontSize', dc.body.fontSize, bc.body.fontSize);
        if (/mono/i.test(dc.body.fontFamily) !== /mono/i.test(bc.body.fontFamily)) add('style', w, 'cell font family', dc.body.fontFamily, bc.body.fontFamily);
        if (!sameColor(dc.body.color, bc.body.color) && !dc.conditionalColors.length) add('style', w, 'cell color', dc.body.color, bc.body.color);
        if ((dc.body.borderRight === 'none') !== (bc.body.borderRight === 'none')) add('style', w, 'vertical line', dc.body.borderRight, bc.body.borderRight);
        if (!near(dc.body.paddingX, bc.body.paddingX, 2) || !near(dc.body.paddingY, bc.body.paddingY, 2)) add('style', w, 'cell padding', `${dc.body.paddingY}×${dc.body.paddingX}`, `${bc.body.paddingY}×${bc.body.paddingX}`);
      }
      if (dc.conditionalColors.length && bc.conditionalColors.length < 2) add('rule', w, 'conditional value colors', dc.conditionalColors.join(', '), bc.conditionalColors.join(', ') || 'none');
      if (dc.emptyShownAs && dc.emptyShownAs !== bc.emptyShownAs) add('rule', w, 'empty value shown as', dc.emptyShownAs, bc.emptyShownAs ?? '(not seen)');
      if (!!dc.input !== !!bc.input) add('content', w, 'editable input', !!dc.input, !!bc.input);
      if (dc.secondary && !bc.secondary) add('content', w, 'secondary text under value', dc.secondary.sample, 'missing');
      if (dc.hasButton && !bc.hasButton) add('content', w, 'button in cell', dc.hasButton, 'missing');
    }
  }
  for (const dd of d.decor ?? []) {
    const bd = (b.decor ?? []).find((x) => x.text.replace(/\d+/g, '#') === dd.text.replace(/\d+/g, '#'));
    if (!bd) { add('content', 'decorated element', `"${dd.text}"`, `${dd.background}`, 'missing'); continue; }
    if (!sameColor(dd.background, bd.background)) add('style', `"${dd.text}"`, 'background', dd.background, bd.background);
    if (!sameColor(dd.color, bd.color)) add('style', `"${dd.text}"`, 'text color', dd.color, bd.color);
  }
  if (d.table && b.table) for (const dc of d.table.leaves) {
    const bc = b.table.leaves.find((c) => c.label === dc.label);
    if (dc.input && bc?.input) { const extra = bc.input.backgrounds.filter((x) => !dc.input.backgrounds.some((y) => sameColor(x, y)));
      if (extra.length) add('rule', `column "${dc.label}"`, 'input background (state styling not in the design?)', dc.input.backgrounds.join(', '), bc.input.backgrounds.join(', ')); }
  }
  if (d.page && b.page) {
    const gd = d.page.gradient, gb = b.page.gradient, gs = (g) => `${g.type}${g.angle !== null ? ` ${g.angle}deg` : ''} ${g.stops.join(' → ') || g.raw}`;
    if (gd && !gb) add('look', 'page', 'background', `gradient ${gs(gd)}`, `flat ${b.page.background}`);
    else if (!gd && gb) add('look', 'page', 'background', `flat ${d.page.background}`, `gradient ${gs(gb)}`);
    else if (gd && gb) { const f = gd.stops.length && gb.stops.length ? dsev(gd.stops[0], gb.stops[0]) : null, l = gd.stops.length && gb.stops.length ? dsev(gd.stops.at(-1), gb.stops.at(-1)) : null; const sv = f === 'look' || l === 'look' ? 'look' : f || l; if (sv) add(sv, 'page', 'gradient colours', gs(gd), gs(gb)); if (gd.angle !== null && gb.angle !== null && Math.abs(gd.angle - gb.angle) > 25) add('style', 'page', 'gradient angle', `${gd.angle}deg`, `${gb.angle}deg`); }
    else { const sv = dsev(d.page.background, b.page.background); if (sv) add(sv, 'page', 'background', d.page.background, b.page.background); }
  }
  if (d.card && !b.card) add('layout', 'page', 'card / panel', `${d.card.background}, radius ${d.card.radius}px, ${d.card.width}px`, 'missing (no distinct panel)');
  if (d.card && b.card) {
    { const sv = dsev(d.card.background, b.card.background); if (sv) add(sv, 'card', 'background', d.card.background, b.card.background); }
    if (!near(d.card.radius, b.card.radius, 4)) add('style', 'card', 'corner radius', `${d.card.radius}px`, `${b.card.radius}px`);
    if (!near(d.card.width, b.card.width, Math.max(16, d.card.width * 0.1))) add('style', 'card', 'width', `${d.card.width}px`, `${b.card.width}px`);
    if (d.card.centered !== b.card.centered) add('layout', 'card', 'centered', d.card.centered, b.card.centered);
  }
  const key = (t) => (t ?? '').replace(/\d+/g, '#').toLowerCase();
  // ── blocks: cards / panels, matched by their heading ──
  {
    const db = (d.blocks ?? []).filter((k) => k.label), bb = (b.blocks ?? []).filter((k) => k.label);
    const pairs = []; const usedB = new Set();
    for (const k of db) {
      const m = bb.find((x) => !usedB.has(x) && key(x.label) === key(k.label)); const w = `block "${k.label.slice(0, 40)}"`;
      if (!m) {
        // the heading text itself missing is reported as a text difference; here: it exists but is not inside its own card / panel
        if ((b.texts ?? []).some((t) => key(t.text) === key(k.label))) add('layout', w, 'card / panel', `own container (${k.w}px wide, ${k.shadow ? 'shadow' : k.border !== 'none' ? 'border' : 'background'})`, 'heading is not inside a card / panel of its own');
        continue;
      }
      usedB.add(m); pairs.push([k, m]);
      const dw = k.w / k.rootWidth, bw = m.w / m.rootWidth, dx = k.x / k.rootWidth, bx = m.x / m.rootWidth;
      if (Math.abs(dx - bx) > 0.08) add('layout', w, 'horizontal position (which column it sits in)', `${Math.round(dx * 100)}% from the left`, `${Math.round(bx * 100)}% from the left`);
      if (Math.abs(dw - bw) > 0.15) add('layout', w, 'width (share of the screen)', `${Math.round(dw * 100)}% (${k.w}px)`, `${Math.round(bw * 100)}% (${m.w}px)`);
      else if (Math.abs(dw - bw) > 0.05) add('style', w, 'width (share of the screen)', `${Math.round(dw * 100)}%`, `${Math.round(bw * 100)}%`);
      if (k.shadow !== m.shadow && k.border === 'none' === (m.border === 'none')) add('style', w, 'shadow', k.shadow ? 'yes' : 'no', m.shadow ? 'yes' : 'no');
      if ((k.border === 'none') !== (m.border === 'none')) add('style', w, 'border', k.border, m.border);
      else if (k.border !== 'none') { const sv = dsev(k.border, m.border); if (sv) add(sv, w, 'border colour', k.border, m.border); }
      { const sv = k.background === 'none' || m.background === 'none' ? (k.background === m.background ? null : 'style') : dsev(k.background, m.background); if (sv) add(sv, w, 'background', k.background, m.background); }
      if (!near(k.radius, m.radius, 2)) add('style', w, 'corner radius', `${k.radius}px`, `${m.radius}px`);
      if (!near(k.padding, m.padding, 3)) add('style', w, 'inner padding', `${k.padding}px`, `${m.padding}px`);
      if (k.depth === 0 && k.gapAbove !== null && m.gapAbove !== null && !near(k.gapAbove, m.gapAbove, 12)) add('style', w, 'gap above (to the row before)', `${k.gapAbove}px`, `${m.gapAbove}px`);
    }
    // order down the page, and which blocks share a row
    const topPairs = pairs.filter(([k]) => k.depth === 0);
    const dOrder = [...topPairs].sort((p, q) => p[0].y - q[0].y || p[0].x - q[0].x).map(([k]) => key(k.label));
    const bOrder = [...topPairs].sort((p, q) => p[1].y - q[1].y || p[1].x - q[1].x).map(([, m]) => key(m.label));
    if (dOrder.join('|') !== bOrder.join('|')) add('layout', 'blocks', 'order down the page', dOrder.join(' → '), bOrder.join(' → '));
    for (let i = 0; i < topPairs.length; i++) for (let j = i + 1; j < topPairs.length; j++) {
      const [k1, m1] = topPairs[i], [k2, m2] = topPairs[j]; const dSame = k1.row === k2.row, bSame = Math.abs(m1.y - m2.y) <= 40;
      if (dSame && !bSame) add('layout', `block "${k1.label.slice(0, 30)}"`, `side by side with "${k2.label.slice(0, 30)}"`, 'yes (same row)', 'no (on different rows)');
    }
  }
  const used = new Set();
  for (const dt of d.texts ?? []) {
    const bt = (b.texts ?? []).find((x) => !used.has(x) && key(x.text) === key(dt.text));
    if (!bt) { add(/\d/.test(dt.text) ? 'data' : 'content', 'text', `"${dt.text}"`, 'present', 'missing'); continue; }
    used.add(bt);
    const w = `text "${dt.text.slice(0, 40)}"`;
    if (d.card && b.card && dt.inCard !== bt.inCard) add('layout', w, 'placement', dt.inCard ? 'inside the card' : 'on the page, outside the card', bt.inCard ? 'inside the card' : 'outside the card');
    if (dt.align !== bt.align && dt.align !== 'mixed' && bt.align !== 'mixed') add('layout', w, 'alignment', dt.align, bt.align);
    if (dt.row) { const bp = (b.texts ?? []).find((x) => key(x.text) === key(dt.row)); if (bp && Math.abs(bp.cy - bt.cy) > 4) add('layout', w, `same line as "${dt.row.slice(0, 30)}"`, 'yes', 'no'); }
    if (!near(dt.fontSize, bt.fontSize, 0.5) || dt.fontWeight !== bt.fontWeight) add('style', w, 'font', `${dt.fontSize}px/${dt.fontWeight}`, `${bt.fontSize}px/${bt.fontWeight}`);
    { const sv = dsev(dt.color, bt.color); if (sv) add(sv, w, 'color', dt.color, bt.color); }
    if ((dt.deco ?? 'none') !== (bt.deco ?? 'none')) add('look', w, 'text decoration', dt.deco, bt.deco);
    if (bt.contrast < 1.6 && !(dt.contrast < 1.6)) add('look', w, 'text visibility (hard to see on its background)', `${dt.contrast}:1`, `${bt.contrast}:1`);
  }
  for (const bt of b.texts ?? []) if (!used.has(bt) && !(d.texts ?? []).some((x) => key(x.text) === key(bt.text))) add(/\d/.test(bt.text) ? 'data' : 'content', 'text', `extra "${bt.text.slice(0, 50)}"`, 'absent', 'present');
  for (const bt of b.texts ?? []) if (!used.has(bt) && bt.contrast < 1.6 && !(d.texts ?? []).some((x) => key(x.text) === key(bt.text))) add('look', `text "${bt.text.slice(0, 40)}"`, 'text visibility (hard to see on its background)', '—', `${bt.contrast}:1`);
  for (const di of d.inputs ?? []) {
    const bi = (b.inputs ?? []).find((x) => key(x.name) === key(di.name)); const w = `input "${di.name}"`;
    if (!bi) { add('content', w, 'field', 'present', 'missing'); continue; }
    { const sv = dsev(di.background, bi.background); if (sv) add(sv, w, 'background', di.background, bi.background); }
    if ((di.border === 'none') !== (bi.border === 'none')) add('style', w, 'border', di.border, bi.border);
    else if (di.border !== 'none') { const sv = dsev(di.border, bi.border); if (sv) add(sv, w, 'border colour', di.border, bi.border); }
    if (!near(di.radius, bi.radius, 2)) add('style', w, 'corner radius', `${di.radius}px`, `${bi.radius}px`);
    if (!near(di.height, bi.height, 4)) add('style', w, 'height', `${di.height}px`, `${bi.height}px`);
  }
  const norm = (n) => n.replace(/\s+/g, ' ').replace(/ for .*$/, '').trim().toLowerCase();
  for (const dc of d.controls) {
    const bc = b.controls.find((c) => norm(c.name) === norm(dc.name));
    if (!bc) { add('content', 'controls', `control "${dc.name}"`, 'present', 'missing'); continue; }
    const w = `control "${dc.name}"`;
    if ((dc.inGroup ?? '') !== (bc.inGroup ?? '') && dc.inGroup) add('content', w, 'grouped as', dc.inGroup, bc.inGroup ?? 'not grouped');
    if (dc.popup && !bc.popup) add('content', w, 'opens a menu', dc.popup, 'no');
    if (!near(dc.fontSize, bc.fontSize, 0.5) || dc.fontWeight !== bc.fontWeight) add('style', w, 'font', `${dc.fontSize}px/${dc.fontWeight}`, `${bc.fontSize}px/${bc.fontWeight}`);
    // rgb(0, 0, 0) on an input = the browser default (the design never set a color) → not a design decision
    { const sv = dsev(dc.color, bc.color); if (sv && !(dc.name.startsWith('search:') && dc.color === 'rgb(0, 0, 0)')) add(sv, w, 'text color', dc.color, bc.color); }
    if ((dc.deco ?? 'none') !== (bc.deco ?? 'none')) add('look', w, 'text decoration', dc.deco, bc.deco);
    if (dc.row) { const bt = (b.texts ?? []).find((x) => key(x.text) === key(dc.row)); if (bt && Math.abs(bt.cy - bc.cy) > 4) add('layout', w, `same line as "${dc.row.slice(0, 30)}"`, 'yes', 'no'); }
    if (bc.contrast < 1.6 && !(dc.contrast < 1.6)) add('look', w, 'text visibility (hard to see on its background)', `${dc.contrast}:1`, `${bc.contrast}:1`);
    { const sv = dsev(dc.background, bc.background); if (sv) add(sv, w, 'background', dc.background, bc.background); }
    if (!!dc.bgImage !== !!bc.bgImage) add('look', w, 'gradient / background image', dc.bgImage ?? 'none', bc.bgImage ?? 'none');
    if (!near(dc.height, bc.height, 4)) add('style', w, 'height', `${dc.height}px`, `${bc.height}px`);
  }
  for (const bc of b.controls) if (!d.controls.some((c) => norm(c.name) === norm(bc.name))) add('content', 'controls', `extra control "${bc.name}"`, 'absent', 'present');
  return m;
}

// ── tokens: the design's own CSS variables and fonts (runs in the page) ──
function readTokens() {
  const out = { light: {}, dark: {}, fonts: [], faces: [], links: [], used: {} };
  const rootish = (sel) => /(^|,)\s*(:root|html|body)\b/.test(sel) || /\[data-theme|\.dark\b|\.light\b/.test(sel);
  const take = (rule, dark) => { for (const p of rule.style) if (p.startsWith('--')) (dark ? out.dark : out.light)[p] = rule.style.getPropertyValue(p).trim(); };
  const walk = (rules, darkMedia) => {
    for (const r of rules) {
      if (r.type === 1 && rootish(r.selectorText)) take(r, darkMedia || /dark/i.test(r.selectorText) && !/not\(\[data-theme=.?dark/i.test(r.selectorText));
      else if (r.type === 4) walk(r.cssRules, darkMedia || /prefers-color-scheme:\s*dark/.test(r.media.mediaText));
      else if (r.type === 5) out.faces.push({ family: r.style.getPropertyValue('font-family').replace(/["']/g, '').trim(), weight: r.style.getPropertyValue('font-weight') || 'normal', src: r.style.getPropertyValue('src').slice(0, 100) });
      else if (r.type === 3 && /fonts\./.test(r.href)) out.links.push(r.href);
    }
  };
  for (const sh of document.styleSheets) { try { walk(sh.cssRules, false); } catch { /* cross-origin sheet: its <link> is read below */ } }
  for (const l of document.querySelectorAll('link[rel="stylesheet"][href*="fonts."]')) out.links.push(l.href);
  const count = {};
  for (const el of document.querySelectorAll('body, body *')) { if (!el.getClientRects().length) continue; const f = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim(); count[f] = (count[f] ?? 0) + 1; }
  out.used = count;
  return out;
}
const SYSTEM_FONT = /^(system-ui|-apple-system|blinkmacsystemfont|segoe ui|roboto|helvetica( neue)?|arial|sans-serif|serif|monospace|ui-monospace|ui-sans-serif|ui-serif|menlo|consolas|courier( new)?|sf mono|times( new roman)?|georgia|verdana|tahoma|cursive|fantasy|inherit|initial)$/i;
function fontsOf(raw) {
  const fam = new Map();
  const slot = (name) => { if (!fam.has(name)) fam.set(name, { family: name, weights: new Set(), sources: new Set(), used: 0 }); return fam.get(name); };
  for (const href of raw.links) {
    let u; try { u = new URL(href); } catch { continue; }
    if (/fonts\.googleapis\.com/.test(u.host)) for (const part of u.search.slice(1).split('&').filter((p) => p.startsWith('family='))) {
      const [name, spec] = decodeURIComponent(part.slice(7)).replace(/\+/g, ' ').split(':'); const f = slot(name); f.sources.add('Google Fonts link');
      for (const w of (spec ?? '').replace(/^[a-z,]*@/i, '').split(';')) { const m = w.match(/(\d{3})$/); if (m) f.weights.add(Number(m[1])); }
    }
  }
  for (const face of raw.faces) { const f = slot(face.family); f.sources.add('@font-face'); const m = String(face.weight).match(/\d{3}/); if (m) f.weights.add(Number(m[0])); }
  for (const [name, n] of Object.entries(raw.used)) if (!SYSTEM_FONT.test(name)) slot(name).used += n;
  return [...fam.values()].filter((f) => !SYSTEM_FONT.test(f.family)).map((f) => ({
    family: f.family, role: /mono|code/i.test(f.family) ? 'mono' : 'sans/serif', weights: [...f.weights].sort(), loadedBy: [...f.sources].join(', ') || 'NOT loaded by the design (installed on the machine?)', used: f.used,
    package: `@fontsource/${f.family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` }));
}
const isColour = (v) => /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i.test(v.trim());
function tokensMarkdown(files, t) {
  const names = [...new Set([...Object.keys(t.light), ...Object.keys(t.dark)])];
  const kind = (n, v) => (isColour(v ?? '') ? 'colour' : /shadow/i.test(n) ? 'shadow' : /font|ui|mono/i.test(n) || /['"]/.test(v ?? '') ? 'font stack' : /radius|rad\b/i.test(n) ? 'radius' : 'other');
  const L = [`# Design tokens (raw) — ${files.join(', ')}`, '', '_Generated by `node tools/design-spec.mjs tokens`. Do not edit by hand. styling-engineer must carry EVERY colour below into tokens.css (light AND dark) — `node tools/check-tokens.mjs` checks it._', '',
    '## CSS variables', '', '| Variable | Light | Dark | Kind |', '|---|---|---|---|'];
  for (const n of names) L.push(`| \`${n}\` | ${t.light[n] ?? '—'} | ${t.dark[n] ?? '(same as light)'} | ${kind(n, t.light[n] ?? t.dark[n])} |`);
  L.push('', '## Fonts', '', '| Family | Role | Weights used | Loaded by the design from | Elements using it (first screen) | Package to propose (library-advisor) |', '|---|---|---|---|---|---|');
  for (const f of t.fontList) L.push(`| ${f.family} | ${f.role} | ${f.weights.join(', ') || '—'} | ${f.loadedBy} | ${f.used} | \`${f.package}\` |`);
  if (!t.fontList.length) L.push('| (only system fonts) | | | | | none needed |');
  L.push('', 'The package is a proposal: library-advisor checks it with `tools/lib-facts.mjs`, the human approves it at Gate 1, app-bootstrap Run L installs it, styling-engineer imports the weights above.', '');
  return L.join('\n');
}

// ── visual diff: design vs build as a coarse picture — red = this area looks different (information, never blocking) ──
async function visualDiff(designPng, buildPng, outPng) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const r = await page.evaluate(async ([d, b]) => {
      const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = `data:image/png;base64,${s}`; });
      const [A, B] = await Promise.all([load(d), load(b)]);
      const W = Math.min(A.width, B.width), H = Math.min(A.height, B.height, 3000), C = 40;
      const grab = (img) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return { c, x, px: x.getImageData(0, 0, W, H).data }; };
      const ga = grab(A), gb = grab(B); let flagged = 0, cells = 0; const bands = {};
      const mean = (px, cx, cy) => { let r = 0, g = 0, bl = 0, n = 0; for (let y = cy; y < Math.min(cy + C, H); y += 2) for (let x = cx; x < Math.min(cx + C, W); x += 2) { const i = (y * W + x) * 4; r += px[i]; g += px[i + 1]; bl += px[i + 2]; n++; } return [r / n, g / n, bl / n]; };
      ga.x.fillStyle = 'rgba(220, 0, 0, 0.35)';
      for (let cy = 0; cy < H; cy += C) for (let cx = 0; cx < W; cx += C) {
        cells++; const p = mean(ga.px, cx, cy), q = mean(gb.px, cx, cy);
        if (Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2])) > 30) { flagged++; ga.x.fillRect(cx, cy, C, C); const band = Math.floor(cy / 200) * 200; bands[band] = (bands[band] ?? 0) + 1; }
      }
      const perBand = Math.ceil(W / C) * (200 / C);
      return { pct: Math.round((flagged / cells) * 100), bands: Object.entries(bands).map(([y, n]) => ({ y: Number(y), pct: Math.round((n / perBand) * 100) })).sort((x, y) => y.pct - x.pct).slice(0, 4), heights: [A.height, B.height], png: ga.c.toDataURL('image/png').split(',')[1] };
    }, [readFileSync(designPng).toString('base64'), readFileSync(buildPng).toString('base64')]);
    writeFileSync(outPng, Buffer.from(r.png, 'base64'));
    return r;
  } finally { await browser.close(); }
}

async function withServer(start, fn) {
  if (!start) return fn();
  const port = 5181;
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort'], { env: { ...process.env, VITE_API_MODE: 'mock', VITE_API_BASE_URL: '' }, stdio: 'ignore', shell: process.platform === 'win32' });
  for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${port}`); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
  try { return await fn(port); } finally { child.kill(); }
}

if (cmd === 'tokens' && a) {
  const outDir = flag('--out', 'analysis'); mkdirSync(outDir, { recursive: true });
  const merged = { light: {}, dark: {}, faces: [], links: [], used: {} };
  const browser = await launch();
  try {
    for (const f of positional) {
      const page = await open(browser, f.split('#')[0]); const t = await page.evaluate(readTokens);
      Object.assign(merged.light, t.light); Object.assign(merged.dark, t.dark); merged.faces.push(...t.faces); merged.links.push(...t.links);
      for (const [k, v] of Object.entries(t.used)) merged.used[k] = (merged.used[k] ?? 0) + v;
    }
  } finally { await browser.close(); }
  merged.fontList = fontsOf(merged);
  writeFileSync(`${outDir}/design-tokens-raw.json`, JSON.stringify(merged, null, 2));
  writeFileSync(`${outDir}/design-tokens-raw.md`, tokensMarkdown(positional, merged));
  const nc = Object.values({ ...merged.light, ...merged.dark }).filter(isColour).length;
  console.log(`wrote ${outDir}/design-tokens-raw.md and .json — ${Object.keys(merged.light).length} light + ${Object.keys(merged.dark).length} dark variables (${nc} colours), ${merged.fontList.length} font family(ies): ${merged.fontList.map((f) => f.family).join(', ') || 'system only'}`);
} else if (cmd === 'extract' && a) {
  const outDir = flag('--out', 'analysis/design-spec'); mkdirSync(outDir, { recursive: true });
  const spec = await snapshot(a);
  const name = screenName(a);
  writeFileSync(`${outDir}/${name}.json`, JSON.stringify(spec, null, 2)); writeFileSync(`${outDir}/${name}.md`, toMarkdown(name, spec));
  console.log(`wrote ${outDir}/${name}.md and .json — ${spec.table ? spec.table.leaves.length + ' columns, ' : ''}${spec.controls.length} controls`);
} else if (cmd === 'compare' && a && b) {
  const outDir = `${flag('--out', 'plan/design-diff')}/${screenName(a)}`; mkdirSync(outDir, { recursive: true });
  const result = await withServer(rest.includes('--start'), async (port) => {
    const url = /^https?:/.test(b) ? b : `http://localhost:${port ?? 5173}${b}`;
    const d = await snapshot(a, `${outDir}/design.png`);
    const bs = await snapshot(url, `${outDir}/build.png`);
    return diff(d, bs);
  });
  // the picture: where does the build look different from the design? (information — never blocking; data and fonts add noise)
  try {
    const v = await visualDiff(`${outDir}/design.png`, `${outDir}/build.png`, `${outDir}/visual.png`);
    if (v.pct >= 8) result.push({ severity: 'visual', where: 'whole page', what: `${v.pct}% of the picture looks different — open visual.png (red = different)`, design: `page height ${v.heights[0]}px`, build: `page height ${v.heights[1]}px` });
    for (const bd of v.bands) if (bd.pct >= 25) result.push({ severity: 'visual', where: `area ${bd.y}–${bd.y + 200}px from the top`, what: `${bd.pct}% of this strip looks different`, design: 'see visual.png', build: '' });
  } catch (e) { result.push({ severity: 'visual', where: 'whole page', what: `picture check could not run: ${String(e.message).split('\n')[0].slice(0, 80)}`, design: '', build: '' }); }
  // differences the HUMAN accepted on purpose (plan/design-accepted.md: a line naming the place and the thing, e.g. `input "email" · border colour`)
  const accFile = 'plan/design-accepted.md';
  if (existsSync(accFile)) { const acc = readFileSync(accFile, 'utf8').toLowerCase().split('\n'); for (const r of result) if (['content', 'rule', 'layout', 'look'].includes(r.severity) && acc.some((l) => l.includes(r.where.toLowerCase()) && l.includes(r.what.toLowerCase()))) r.severity = 'accepted'; }
  const lines = ['| Severity | Where | What | Design | Build |', '|---|---|---|---|---|', ...result.map((r) => `| ${r.severity} | ${r.where} | ${r.what} | ${r.design} | ${r.build} |`)];
  writeFileSync(`${outDir}/differences.md`, `# Design vs build — ${a}\n\nBlocking: content, rule, layout, look. Style: needs a one-line reason. Data: sample values, information only. Accepted: listed in plan/design-accepted.md (only a human adds lines there).\n\nScreenshots: design.png, build.png, visual.png (the design with every area that looks different marked red). visual rows are information: look at visual.png at Gate 3.\n\n${result.length ? lines.join('\n') : 'No differences beyond tolerance.'}\n`);
  const count = (s) => result.filter((r) => r.severity === s).length;
  const blocking = count('content') + count('rule') + count('layout') + count('look');
  console.log(`${result.length} difference(s): content ${count('content')}, rules ${count('rule')}, layout ${count('layout')}, look ${count('look')} (blocking: ${blocking}) · style ${count('style')} · data ${count('data')} · visual ${count('visual')} · accepted ${count('accepted')} → ${outDir}/differences.md`);
  process.exit(blocking ? 1 : 0);
} else { console.error('usage: tokens <design.html> [more.html …] | extract <design.html[#screen]> [--open "<control>"] | compare <design.html[#screen]> <url|/route> [--start] [--open "<control>"]'); process.exit(2); }
