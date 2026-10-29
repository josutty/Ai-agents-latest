// Usage: node tools/detect-ui-capabilities.mjs <file.html> [...more] [--json]
// Finds the UI capabilities in wireframes that decide which library a component needs
// (agent-docs/rules/libraries.md). Deterministic: the same HTML always gives the same report.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const args = process.argv.slice(2);
const json = args.includes('--json');
const files = args.filter((a) => a !== '--json');
if (!files.length) { console.error('usage: node tools/detect-ui-capabilities.mjs <file.html> [...] [--json]'); process.exit(2); }

const report = [];
const add = (file, capability, library, where, evidence) => report.push({ file, capability, library, where, evidence });
const cls = (el) => (el.getAttribute('class') ?? '').toLowerCase();
const has = (el, re) => re.test(cls(el)) || re.test(el.id ?? '');
const label = (el) => {
  const id = el.id ? `#${el.id}` : ''; const c = el.getAttribute('class') ? `.${el.getAttribute('class').trim().split(/\s+/)[0]}` : '';
  const dc = el.getAttribute('data-component'); return `${el.tagName.toLowerCase()}${id}${c}${dc ? `[data-component="${dc}"]` : ''}`;
};

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  const doc = new JSDOM(html).window.document;
  const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('\n')
    + [...doc.querySelectorAll('[style]')].map((e) => `${label(e)}{${e.getAttribute('style')}}`).join('\n');
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim(), body: body.toLowerCase() }));
  const stickySel = rules.filter((r) => /position\s*:\s*sticky/.test(r.body)).map((r) => r.sel);
  const scrollX = rules.filter((r) => /overflow(-x)?\s*:\s*(auto|scroll)/.test(r.body)).map((r) => r.sel);

  // ── tables / grids ──
  for (const t of doc.querySelectorAll('table, [role="grid"], [role="table"]')) {
    const where = label(t);
    const headRows = t.querySelectorAll('thead tr').length;
    const grouped = [...t.querySelectorAll('thead th, thead td')].some((c) => Number(c.getAttribute('colspan') ?? 1) > 1);
    const bodyRows = t.querySelectorAll('tbody tr').length;
    const editable = t.querySelectorAll('tbody td input, tbody td select, tbody td textarea, tbody td [contenteditable="true"]').length;
    const frozenCol = stickySel.some((s) => /(td|th|col)\b|first-child|frozen|pinned|sticky/i.test(s) && !/thead\b(?!.*(td|th))/i.test(s))
      || [...t.querySelectorAll('th, td')].some((c) => has(c, /frozen|pinned|sticky/));
    const stickyHeader = stickySel.some((s) => /thead/i.test(s));
    const sortable = [...t.querySelectorAll('thead th')].some((c) => c.hasAttribute('aria-sort') || has(c, /sort/) || /[▲▼↑↓⇅]/.test(c.textContent));
    const secondary = [...t.querySelectorAll('tbody td')].some((c) => c.querySelector('input, select, textarea') && c.textContent.trim().length > 0);
    const totals = !!t.querySelector('tfoot') || !!doc.querySelector('.summary, .totals, [data-totals]');
    const hScroll = scrollX.length > 0 || has(t.parentElement ?? t, /scroll/);
    const features = [];
    if (frozenCol) features.push('frozen column'); if (stickyHeader) features.push('sticky header');
    if (grouped || headRows > 1) features.push(`grouped headers (${headRows} header rows)`);
    if (editable) features.push(`${editable} editable cells`); if (secondary) features.push('editable cell with secondary text (e.g. previous value)');
    if (sortable) features.push('sortable columns'); if (totals) features.push('totals/summary'); if (hScroll) features.push('horizontal scroll');
    const advanced = frozenCol || stickyHeader || grouped || headRows > 1 || editable > 0 || sortable;
    add(file, advanced ? 'data-grid' : 'simple-table', advanced ? '@tanstack/react-table' : 'none (plain <table> + Tailwind)', where,
      `${bodyRows} rows in wireframe; ${features.join(', ') || 'no interactive features'}`);
    if (bodyRows >= 200) add(file, 'virtual-list', '@tanstack/react-virtual', where, `${bodyRows} rows`);
  }
  // ── overlays & widgets ──
  const scan = (selector, test, capability, library, why) => {
    for (const el of doc.querySelectorAll(selector)) if (test(el)) add(file, capability, library, label(el), why(el));
  };
  scan('dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"], [class*="modal"], [class*="drawer"]', () => true, 'dialog', 'radix-ui (Dialog / AlertDialog)', (e) => `modal-like element "${e.textContent.trim().slice(0, 40)}"`);
  scan('[aria-haspopup], [role="menu"], [class*="dropdown"], [class*="menu"]', (e) => !e.closest('nav') && !/\bcolumns?\b/i.test(e.textContent), 'dropdown-menu', 'radix-ui (DropdownMenu)', () => 'menu trigger or menu');
  scan('[role="group"], [role="radiogroup"], [class*="segmented"], [class*="toggle-group"]',
    (e) => e.querySelectorAll('button, [role="radio"]').length >= 2 && (!!e.querySelector('[aria-pressed], [role="radio"]') || /segmented|toggle/.test(cls(e))),
    'toggle-group', 'radix-ui (ToggleGroup)', (e) => `options: ${[...e.querySelectorAll('button, [role="radio"]')].map((x) => x.textContent.trim()).join(' / ')}`);
  scan('button, [role="button"]', (e) => /\bcolumns?\b/i.test(e.textContent) && (e.hasAttribute('aria-haspopup') || /column/.test(cls(e))),
    'column-visibility', '@tanstack/react-table + radix-ui (DropdownMenu)', () => 'column picker');
  scan('[role="tablist"], [class*="tabs"]', () => true, 'tabs', 'radix-ui (Tabs)', () => 'tab list');
  scan('[role="tooltip"], [class*="tooltip"], button[title], [data-tooltip]', () => true, 'tooltip', 'radix-ui (Tooltip)', (e) => `hint "${(e.getAttribute('title') ?? e.textContent).trim().slice(0, 30)}"`);
  scan('[role="combobox"], input[list], [class*="autocomplete"], [class*="combobox"]', () => true, 'combobox', 'cmdk', () => 'autocomplete / searchable select');
  scan('input[type="date"], input[type="month"], [class*="date-picker"], [class*="datepicker"], [class*="calendar"]', () => true, 'date-picker', 'react-day-picker', () => 'date input');
  scan('canvas, svg[class*="chart"], [class*="chart"]', () => true, 'chart', 'recharts', () => 'chart area');
  scan('[draggable="true"], [class*="drag"], [class*="sortable"]', () => true, 'drag-drop', '@dnd-kit/core', () => 'draggable items');
  scan('[class*="toast"], [class*="snackbar"]', () => true, 'toast', 'sonner', () => 'toast notification');
  // ── content & integration capabilities (added 22 Oct) ──
  const txt = (e) => e.textContent.replace(/\s+/g, ' ').trim();
  scan('[contenteditable="true"], [class*="rich-text"], [class*="richtext"], [class*="wysiwyg"], [class*="editor"]:not(input):not(textarea)',
    (e) => !e.closest('table') && !e.closest('[class*="rich-text"],[class*="richtext"],[class*="wysiwyg"]')?.isSameNode?.(e.parentElement), 'rich-text', '@tiptap/react', (e) => `editable rich text area${e.closest('form, section')?.querySelector('[role="toolbar"], [class*="toolbar"]') ? ' with a formatting toolbar' : ''}`);
  scan('[role="toolbar"], [class*="toolbar"]', (e) => !e.parentElement?.querySelector('[contenteditable="true"], [class*="editor"]') && [...e.querySelectorAll('button')].filter((b) => /^(b|i|u|bold|italic|underline|h1|h2|link|bullet|list|quote)$/i.test(txt(b) || b.getAttribute('aria-label') || b.getAttribute('title') || '')).length >= 2,
    'rich-text', '@tiptap/react', () => 'text-formatting toolbar (bold / italic / list …)');
  for (const el of doc.querySelectorAll('input[type="file"], [class*="dropzone"], [class*="drop-zone"], [class*="upload"], [data-dropzone]')) {
    const zone = /drop|drag/i.test(`${cls(el)} ${txt(el.parentElement ?? el)}`) || el.matches('[class*="dropzone"], [class*="drop-zone"], [data-dropzone]');
    const multi = el.matches('input[multiple]') || !!el.querySelector?.('input[multiple]');
    if (el.tagName === 'INPUT' && el.parentElement?.closest('[class*="dropzone"], [class*="drop-zone"], [data-dropzone], [class*="upload"]')) continue; // reported with its zone
    if (el.matches('[class*="upload"]') && !zone && !el.querySelector('input[type="file"]') && el.tagName !== 'INPUT') continue;
    add(file, 'file-upload', zone ? 'react-dropzone' : 'none (native <input type="file">)', label(el), `${zone ? 'drag-and-drop zone' : 'file picker'}${multi ? ', multiple files' : ''}${el.getAttribute('accept') ? `, accepts ${el.getAttribute('accept')}` : ''}`);
  }
  scan('#map, [id$="-map"], [class~="map"], [class*="map-"], [class*="-map"], [data-map], iframe[src*="maps"]', (e) => !/sitemap|roadmap|heatmap|mapping/i.test(`${cls(e)} ${e.id}`),
    'map', 'maplibre-gl + @vis.gl/react-maplibre', (e) => (e.tagName === 'IFRAME' ? 'embedded map iframe' : 'map container'));
  scan('button, a, [role="button"], [role="menuitem"]', (e) => /\b(export|download)\b.*\b(csv|excel|xlsx|xls|pdf)\b|\b(csv|excel|xlsx|pdf)\b.*\b(export|download)\b|^print\b/i.test(txt(e)),
    'export', 'see libraries.md → export', (e) => `"${txt(e).slice(0, 40)}"`);
  scan('[class*="carousel"], [class*="slider"]:not(input), [aria-roledescription="carousel"], [class*="swiper"]', (e) => e.tagName !== 'INPUT',
    'carousel', 'embla-carousel-react', (e) => `slides: ${e.querySelectorAll('[class*="slide"], li, figure').length}`);
  const langRe = /^(en|hi|fr|de|es|ar|ta|te|kn|ml|mr|bn|gu|pa|ja|zh|english|hindi|français|deutsch|español|العربية|தமிழ்|తెలుగు)$/i;
  scan('select, [class*="lang"], [class*="locale"], [data-lang], nav, header', (e) => {
    if (e.matches('nav, header') && e.querySelector('select, [class*="lang"], [class*="locale"], [data-lang]')) return false; // the switcher itself is reported
    const opts = [...e.querySelectorAll('option, button, a, li')].map(txt).filter((x) => langRe.test(x));
    return (/lang|locale/i.test(`${cls(e)} ${e.id} ${e.getAttribute('name') ?? ''}`) && opts.length >= 1) || opts.length >= 2;
  }, 'i18n', 'react-i18next + i18next', (e) => `language switcher: ${[...e.querySelectorAll('option, button, a, li')].map(txt).filter((x) => langRe.test(x)).slice(0, 4).join(' / ')}`);
  if (/dir\s*=\s*["']rtl/i.test(html)) add(file, 'i18n', 'react-i18next + i18next', 'html[dir=rtl]', 'right-to-left layout');
  for (const list of doc.querySelectorAll('ul, ol')) if (list.children.length >= 200) add(file, 'virtual-list', '@tanstack/react-virtual', label(list), `${list.children.length} items`);
}

// one row per capability per element (tooltips: collapse repeats)
const byEvidence = new Set(['tooltip']); const withEvidence = new Set(['export', 'file-upload', 'rich-text', 'map', 'carousel', 'i18n']);
const seen = new Set(); const rows = report.filter((r) => { const k = `${r.file}|${r.capability}|${byEvidence.has(r.capability) ? r.evidence : withEvidence.has(r.capability) ? `${r.where}|${r.evidence}` : r.where}`; return seen.has(k) ? false : seen.add(k); });
if (json) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
console.log('| Screen | Capability | Library (catalog) | Element | Evidence |\n|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.file.split(/[\\/]/).pop()} | ${r.capability} | ${r.library} | \`${r.where}\` | ${r.evidence} |`);
if (!rows.length) console.log('| — | none | plain JSX + Tailwind | — | no complex widgets found |');
