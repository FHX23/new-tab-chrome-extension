'use strict';
// Núcleo: utilidades, estado, ubicación de los iconos en cada pantalla, dibujo y deshacer.
// Los scripts del proyecto son clásicos (no módulos) y comparten el ámbito global; se cargan en orden:
// i18n → store → core → widgets → interact → panels → main.

const { uid, newPage, normalize, DEFAULT_SETTINGS } = Store;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const SIZES = ['1x1', '2x1', '1x2', '2x2', '3x2', '2x3', '3x3', '4x2', '4x3'];
const LOGO_COLORS = ['#8ab4f8', '#f28b82', '#fdd663', '#81c995', '#c58af9', '#78d9ec']; // paleta propia (la del ícono)
const STRUCTURAL = new Set(['layout', 'cols', 'rows', 'rowPattern']); // ajustes que obligan a reacomodar iconos
const FAV = chrome.runtime.getURL('/_favicon/');
const LIST_W = 280, LIST_H = 52; // tamaño natural de una fila en modo lista

// Nombres cortos para sitios conocidos (los títulos de pestaña suelen ser largos: "Recibidos (5.012) - …").
const BRANDS = {
  'mail.google.com': 'Gmail', 'drive.google.com': 'Drive', 'docs.google.com': 'Docs', 'calendar.google.com': 'Calendar',
  'gemini.google.com': 'Gemini', 'maps.google.com': 'Maps', 'photos.google.com': 'Photos', 'web.whatsapp.com': 'WhatsApp',
  'claude.ai': 'Claude', 'chatgpt.com': 'ChatGPT', 'outlook.live.com': 'Outlook',
};

const svgMask = d => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='${d}'/></svg>`)}")`;
// r = redondeo del borde, m = máscara SVG, s = tamaño del favicon dentro, y = desplazamiento vertical
const SHAPES = {
  circle:   { r: '50%' },
  rounded:  { r: '28%' },
  square:   { r: '8%' },
  hexagon:  { m: svgMask('M50 2 92 26v48L50 98 8 74V26z'), s: '46%' },
  star:     { m: svgMask('M50 3l14 30 33 4-24.5 22.5 6.7 32.5L50 75.5 20.8 92l6.7-32.5L3 37l33-4z'), s: '34%', y: '7%' },
  triangle: { m: svgMask('M50 5 97 93H3z'), s: '34%', y: '18%' },
  heart:    { m: svgMask('M50 93C21 72 3 55 3 33 3 17 15 6 29 6c9 0 16 5 21 13 5-8 12-13 21-13 14 0 26 11 26 27 0 22-18 39-47 60z'), s: '38%', y: '-2%' },
};
const shapeVars = name => {
  const s = SHAPES[name] || SHAPES.circle;
  return { '--r': s.r || '0', '--m': s.m || 'none', '--is': s.s || '50%', '--iy': s.y || '0%' };
};
const setVars = (style, vars) => { for (const k in vars) style.setProperty(k, vars[k]); };
const mix = (color, transparency) => `color-mix(in srgb, ${color} ${100 - transparency}%, transparent)`;

// ---------- utilidades ----------
function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') Object.assign(e.style, v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...children.flat().filter(c => c != null && c !== false));
  return e;
}

// API de favicons de MV3 (permiso "favicon"): caché de favicons del propio Chrome, sin red.
const faviconUrl = (pageUrl, size = 64) => `${FAV}?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`;
const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
// Nombre corto de un sitio de búsqueda: "google.com/maps", pero "youtube.com" (sin /results ni /search).
const siteOf = url => {
  try {
    const u = new URL(url.replace('%s', 'x')), seg = u.pathname.split('/')[1] || '';
    return hostOf(u.href) + (seg && !/^(search|results|w)$/.test(seg) && !seg.includes('.') ? '/' + seg : '');
  } catch { return url; }
};
const keyOf = url => { try { const u = new URL(url); return u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, ''); } catch { return url; } };
const normUrl = u => (u = u.trim()) && (/^([a-z][\w+.-]*:\/\/|mailto:|about:)/i.test(u) ? u : 'https://' + u);
const looksLikeUrl = q => !/\s/.test(q) && /^([a-z][\w+.-]*:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i.test(q);
const parsePattern = p => {
  const n = String(p).split(/[,\s]+/).map(Number).filter(x => x > 0 && x <= 20);
  return n.length ? n : [5];
};
const clampInt = (v, min, max) => Math.max(min, Math.min(max, Math.round(+v) || min));
const hashStr = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h; };
// Líneas "Nombre = URL" (los espacios alrededor del "=" son obligatorios; las URL también llevan "=")
const parseLines = text => String(text || '').split('\n')
  .map(l => l.match(/^\s*(.+?)\s+=\s+(\S+)\s*$/)).filter(Boolean).map(m => ({ name: m[1], url: m[2] }));

// "Inicio • Threads" → "Threads", "New chat - Claude" → "Claude", "Weapons List • Wiki" → "Weapons List"
function cleanTitle(title, url) {
  let u;
  try { u = new URL(url); } catch { return title || url; }
  const host = u.hostname.replace(/^www\./, '');
  if (BRANDS[host]) return BRANDS[host];
  const main = host.split('.').slice(-2)[0] || host;
  const parts = String(title || '').replace(/\(\d[\d.,]*\)/g, '')
    .split(/\s+[-|•·–—]\s+/).map(s => s.split(': ')[0].trim()).filter(Boolean);
  const isBrand = p => p.toLowerCase().replace(/\s/g, '').includes(main);
  const root = u.pathname.length <= 1 && !u.search;
  const pick = root
    ? parts.find(isBrand) || parts.find(p => p.length <= 24)
    : parts.find(p => !isBrand(p) && p.length <= 28) || parts.find(isBrand);
  return pick || main[0].toUpperCase() + main.slice(1);
}

// ---------- estado ----------
let state;
let current = 0;          // pantalla visible (por pestaña, no se guarda)
let editing = false;
let openFolderId = null;

const hasPos = it => Number.isInteger(it.x) && Number.isInteger(it.y);
const allLinks = () => state.pages.flatMap(p => p.items.flatMap(it => it.type === 'folder' ? it.items : [it])).filter(it => it.type === 'link');

function locate(id) {
  for (const [pageIdx, p] of state.pages.entries()) {
    for (const [index, it] of p.items.entries()) {
      if (it.id === id) return { list: p.items, index, item: it, pageIdx, folder: null };
      if (it.type === 'folder') {
        const j = it.items.findIndex(c => c.id === id);
        if (j >= 0) return { list: it.items, index: j, item: it.items[j], pageIdx, folder: it };
      }
    }
  }
  return null;
}

// ---------- espacios de cada pantalla y colocación libre ----------
// Configuración de una pantalla: la propia si la tiene; si no, la de Ajustes.
const PAGE_KEYS = ['layout', 'cols', 'rows', 'pattern'];
function pageCfg(p) {
  const s = state.settings;
  return { layout: p.layout || s.layout, cols: p.cols || s.cols, rows: p.rows || s.rows, pattern: parsePattern(p.pattern || s.rowPattern) };
}

const copyCfg = (from, to) => {
  for (const k of PAGE_KEYS) if (from[k]) to[k] = from[k];
  return to;
};

// Describe los huecos de una pantalla. En "filas a medida" cada fila tiene su largo.
function slotSpec(p) {
  const cfg = pageCfg(p);
  if (cfg.layout === 'rows') {
    const pat = cfg.pattern;
    return { layout: 'rows', cols: Math.max(...pat), rows: pat.length, rowLen: y => pat[y] || 0, sized: false };
  }
  return { layout: cfg.layout, cols: cfg.cols, rows: cfg.rows, rowLen: () => cfg.cols, sized: cfg.layout === 'grid' };
}

// Tamaño efectivo en la cuadrícula (en modo lista, los widgets abiertos ocupan varias filas de alto).
const sizeIn = (it, sp) => {
  if (sp.sized) return [Math.min(it.w || 1, sp.cols), Math.min(it.h || 1, sp.rows)];
  if (sp.layout === 'list' && it.type === 'widget' && ((it.w || 1) > 1 || (it.h || 1) > 1)) {
    return [Math.min(Math.max(1, Math.floor((it.w || 2) / 2)), sp.cols), Math.min(Math.max(2, (it.h || 2) * 2), sp.rows)];
  }
  return [1, 1];
};

// Orden de lectura: por filas; la lista se llena por columnas.
const readOrder = sp => sp.layout === 'list'
  ? (a, b) => a.x - b.x || a.y - b.y
  : (a, b) => a.y - b.y || a.x - b.x;

// Mapa de celdas ocupadas de una pantalla.
function makeGrid(sp) {
  const used = new Uint8Array(sp.cols * sp.rows);
  const fits = (x, y, w, h) => {
    if (x < 0 || y < 0 || y + h > sp.rows) return false;
    for (let yy = y; yy < y + h; yy++) {
      if (x + w > sp.rowLen(yy)) return false;
      for (let xx = x; xx < x + w; xx++) if (used[yy * sp.cols + xx]) return false;
    }
    return true;
  };
  const mark = (x, y, w, h) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) used[yy * sp.cols + xx] = 1;
  };
  const first = (w, h) => {
    if (sp.layout === 'list') {
      for (let x = 0; x < sp.cols; x++) for (let y = 0; y < sp.rows; y++) if (fits(x, y, 1, 1)) return { x, y };
    } else {
      for (let y = 0; y < sp.rows; y++) for (let x = 0; x < sp.cols; x++) if (fits(x, y, w, h)) return { x, y };
    }
    return null;
  };
  return { used, fits, mark, first };
}

// Mapa con todos los iconos de la pantalla marcados, salvo los indicados en `ignore`.
function gridOf(p, ignore = []) {
  const sp = slotSpec(p), g = makeGrid(sp);
  for (const o of p.items) {
    if (!hasPos(o) || ignore.includes(o)) continue;
    const [w, h] = sizeIn(o, sp);
    g.mark(o.x, o.y, w, h);
  }
  return { sp, g };
}

// Respeta la posición de cada icono; los que chocan o no tienen lugar van al primer hueco libre.
// Devuelve los que no caben en la pantalla.
function place(p) {
  const sp = slotSpec(p), g = makeGrid(sp), order = readOrder(sp);
  const keep = [], pending = [], overflow = [];
  for (const it of p.items.filter(hasPos).sort(order)) {
    const [w, h] = sizeIn(it, sp);
    if (g.fits(it.x, it.y, w, h)) { g.mark(it.x, it.y, w, h); keep.push(it); }
    else pending.push(it);
  }
  pending.push(...p.items.filter(it => !hasPos(it)));
  for (const it of pending) {
    const [w, h] = sizeIn(it, sp);
    const spot = g.first(w, h);
    if (spot) { it.x = spot.x; it.y = spot.y; g.mark(spot.x, spot.y, w, h); keep.push(it); }
    else { delete it.x; delete it.y; overflow.push(it); }
  }
  p.items = keep.sort(order);
  return overflow;
}

// Lo que no cabe pasa a la pantalla siguiente (y se crea si hace falta), como en el celular.
function reflow() {
  let created = 0;
  for (let i = 0; i < state.pages.length; i++) {
    const extra = place(state.pages[i]);
    if (!extra.length) continue;
    if (i === state.pages.length - 1) { state.pages.push(copyCfg(state.pages[i], newPage())); created++; }
    state.pages[i + 1].items.push(...extra);
  }
  return created;
}

// Icono que ocupa la celda (x, y) de una pantalla.
function itemAt(p, x, y) {
  const sp = slotSpec(p);
  return p.items.find(o => {
    if (!hasPos(o)) return false;
    const [w, h] = sizeIn(o, sp);
    return x >= o.x && x < o.x + w && y >= o.y && y < o.y + h;
  });
}

function canPlace(p, it, x, y, ignore = []) {
  const { sp, g } = gridOf(p, ignore);
  const [w, h] = sizeIn(it, sp);
  return g.fits(x, y, w, h);
}

// ¿Se pueden intercambiar dos iconos de la misma pantalla (aunque tengan tamaños distintos)?
function canSwap(p, a, b) {
  const { sp, g } = gridOf(p, [a, b]);
  const [wa, ha] = sizeIn(a, sp), [wb, hb] = sizeIn(b, sp);
  if (!g.fits(b.x, b.y, wa, ha)) return false;
  g.mark(b.x, b.y, wa, ha);
  return g.fits(a.x, a.y, wb, hb);
}

// ---------- avisos, confirmaciones y deshacer ----------
const undoStack = [];
let lastJson = '';
const snap = () => JSON.stringify(state, (k, v) => (k === 'rev' ? undefined : v));

let toastTimer = null;
function toast(msg, withUndo = false) {
  const box = $('#toast');
  box.replaceChildren(el('span', {}, msg));
  if (withUndo && undoStack.length) {
    box.append(el('button', { type: 'button', class: 'toast-btn', onclick: () => { box.classList.remove('show'); undo(); } }, t('undo')));
  }
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), withUndo ? 6000 : 3200);
}

// Cambios pequeños que no redibujan (texto de notas, tareas, hábitos, nombre de carpeta…).
// Además de guardar, actualizan la copia de referencia de Deshacer: si no, deshacer otra acción
// restauraría un estado anterior a lo que escribiste y lo borraría.
let quietTimer = null;
function saveQuiet() {
  Store.save(state);
  clearTimeout(quietTimer);
  quietTimer = setTimeout(() => { lastJson = snap(); }, 250);
}

// Guarda y vuelve a pintar. full=false solo actualiza variables CSS (mucho más barato).
function commit(full = true) {
  if (full) {
    const created = reflow();
    if (created) toast(created === 1 ? t('pageCreated', state.pages.length) : t('pagesCreated', created), true);
  }
  const json = snap();
  if (full && lastJson && json !== lastJson) {
    undoStack.push(lastJson);
    if (undoStack.length > 40) undoStack.shift();
  }
  lastJson = json;
  Store.save(state);
  if (full) renderAll();
  else { applySettings(); fitPages(); }
}

function undo() {
  const prev = undoStack.pop();
  if (!prev) return toast(t('nothingToUndo'));
  state = normalize(JSON.parse(prev));
  lastJson = prev;
  current = Math.min(current, state.pages.length - 1);
  if (openFolderId && !locate(openFolderId)) $('#folderDlg').close();
  Store.save(state);
  renderAll();
  toast(t('undone'));
}

// Confirmación propia (más rápida y bonita que confirm()).
function ask(msg, { ok = t('accept'), cancel = t('cancel'), danger = false } = {}) {
  const d = $('#askDlg');
  $('#askMsg').textContent = msg;
  $('#askYes').textContent = ok;
  $('#askYes').classList.toggle('danger-fill', danger);
  $('#askNo').hidden = !cancel;
  if (cancel) $('#askNo').textContent = cancel;
  d.returnValue = '';
  d.showModal();
  $('#askYes').focus();
  return new Promise(res => d.addEventListener('close', () => res(d.returnValue === 'yes'), { once: true }));
}

// ---------- íconos genéricos: inicial con color en vez del globo gris ----------
// Chrome devuelve un globo para los sitios que nunca visitaste. Lo detectamos comparando píxeles
// con el globo de un dominio inexistente (las imágenes son del mismo origen, el canvas se puede leer).
const GEN_KEY = 'ntp_generic';
const DAY = 864e5;
let generic = {};
try { generic = JSON.parse(localStorage.getItem(GEN_KEY)) || {}; } catch {}
const isGeneric = host => generic[host] && Date.now() - generic[host] < DAY;
const saveGeneric = () => { try { localStorage.setItem(GEN_KEY, JSON.stringify(generic)); } catch {} };

let hashCanvas = null;
function pixelHash(img) {
  hashCanvas ||= Object.assign(document.createElement('canvas'), { width: 16, height: 16 });
  const g = hashCanvas.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, 16, 16);
  g.drawImage(img, 0, 0, 16, 16);
  const d = g.getImageData(0, 0, 16, 16).data;
  let h = 5381;
  for (let i = 0; i < d.length; i += 3) h = (h * 33 ^ d[i]) >>> 0;
  return h;
}

const defaultHash = {};
const defaultFavHash = size => defaultHash[size] ||= new Promise(res => {
  const img = new Image();
  img.onload = () => res(pixelHash(img));
  img.onerror = () => res(null);
  img.src = faviconUrl('https://generic-favicon.invalid/', size);
});

async function checkGeneric(img, host, size) {
  const mine = pixelHash(img);
  if (mine !== await defaultFavHash(size)) {
    if (generic[host]) { delete generic[host]; saveGeneric(); }
    return;
  }
  generic[host] = Date.now();
  saveGeneric();
  if (img.isConnected) img.replaceWith(letterFor(host));
}

function letterFor(host, mini = false) {
  const name = host.split('.').slice(-2)[0] || host || '?';
  return el('span', { class: mini ? 'letter mini-letter' : 'letter', style: { color: `hsl(${hashStr(host) % 360} 70% 70%)` } }, name[0].toUpperCase());
}

function favImg(url, size, lazy) {
  const host = hostOf(url);
  if (isGeneric(host)) return letterFor(host);
  const img = el('img', { src: faviconUrl(url, size), alt: '', draggable: 'false', decoding: 'async', loading: lazy ? 'lazy' : null });
  img.addEventListener('load', () => checkGeneric(img, host, size), { once: true });
  return img;
}

// ---------- dibujo ----------
function renderAll() {
  document.body.classList.toggle('editing', editing); // antes de medir: cambia el espacio disponible
  if ($('#undoBtn')) $('#undoBtn').disabled = !undoStack.length;
  applySettings();
  renderDots();
  renderPages();
  if (openFolderId) renderFolder();
  updatePageBg();
  tickClocks();
}

let logoKey = '', topKey = '';
function applySettings() {
  const s = state.settings;
  const root = document.documentElement, r = root.style;
  setVars(r, {
    '--cell': s.cell + 'px',
    '--icon': s.icon + 'px',
    '--text': s.textColor,
    '--tile': mix(s.tileColor, s.tileTr),
    '--dim': s.bgDim,
    '--nav-size': s.navSize + 'px',
    '--nav-zone': Math.max(s.navZone, s.navSize) + 'px',
    '--nav-zone-h': s.navZoneH + '%',
    '--nav-bg': mix(s.navBg, s.navBgTr),
    '--nav-fg': mix(s.navFg, s.navFgTr),
    '--nav-bg-h': mix(s.navBg, Math.min(s.navBgTr, 35)),
    '--nav-fg-h': s.navFg,
    '--bm-bg': mix(s.bmBg, s.bmTr),
    '--toplinks-color': s.topLinksColor || s.textColor,
    ...shapeVars(s.shape),
  });
  r.backgroundColor = s.bgColor;
  root.dataset.panel = s.panelTheme;
  const b = document.body.classList;
  b.toggle('no-logo', !s.showLogo);
  b.toggle('no-search', !s.showSearch);
  b.toggle('no-labels', !s.showLabels);
  b.toggle('no-arrows', !s.showArrows);
  b.toggle('no-bookmarks', !s.showBookmarks);
  b.toggle('no-wiggle', !s.wiggle);
  b.toggle('x-widgets', s.xWidgets);
  b.toggle('x-pages', s.xPages);
  b.toggle('x-search', s.xSearch);

  const text = s.logoText || t('logoDefault');
  if (text + s.logoColor !== logoKey) {
    logoKey = text + s.logoColor;
    $('#logo').replaceChildren(...[...text].map((ch, i) =>
      el('span', { style: s.logoColor ? { color: LOGO_COLORS[i % LOGO_COLORS.length] } : null }, ch)));
  }
  const tColors = s.topLinksColors || {};
  const tKey = s.topLinks + '\0' + (s.topLinksColor || '') + '\0' + JSON.stringify(tColors);
  if (tKey !== topKey) {
    topKey = tKey;
    $('#toplinks').replaceChildren(...parseLines(s.topLinks).map((l, i) => {
      const c = tColors[i] || tColors[l.name] || s.topLinksColor || s.textColor;
      return el('a', { href: normUrl(l.url), style: c ? { color: c } : null }, l.name);
    }));
  }
  try { if (localStorage.getItem('ntp_bg') !== s.bgColor) localStorage.setItem('ntp_bg', s.bgColor); } catch {}
}

function applyBg() {
  const url = Store.getBg();
  const html = document.documentElement;
  html.style.backgroundImage = url ? `url("${url}")` : '';
  html.classList.toggle('has-bg', !!url);
}

// Fondo propio de la pantalla visible (extra "Personalizar cada pantalla").
const pageBgUrls = new Map();
async function updatePageBg() {
  const p = state.pages[current], layer = $('#pagebg');
  const key = state.settings.xPages && p?.bg ? p.id + p.bg : '';
  layer.dataset.want = key;
  if (!key) {
    layer.classList.remove('on');
    document.documentElement.classList.remove('page-bg');
    return;
  }
  let url = pageBgUrls.get(key);
  if (!url) {
    const blob = await Store.getPageBg(p.id).catch(() => null);
    if (!blob) return;
    url = URL.createObjectURL(blob);
    pageBgUrls.set(key, url);
  }
  if (layer.dataset.want !== key) return; // ya se cambió de pantalla
  layer.style.backgroundImage = `url("${url}")`;
  layer.classList.add('on');
  document.documentElement.classList.add('page-bg');
}

function renderPages() {
  $('#track').replaceChildren(...state.pages.map(renderPage));
  goToPage(current, false);
  fitPages();
}

// Cada pantalla tiene huecos fijos. En modo edición los libres se ven punteados.
function renderPage(p, i) {
  const sp = slotSpec(p);
  const opts = { inFolder: false, layout: sp.layout, lazy: i !== current };
  const box = el('div', { class: `items ${sp.layout}`, dataset: { page: i } });

  if (sp.layout === 'rows') {
    for (let y = 0; y < sp.rows; y++) {
      const row = el('div', { class: 'row' });
      for (let x = 0; x < sp.rowLen(y); x++) {
        const it = p.items.find(o => o.x === x && o.y === y);
        if (it) {
          const w = it.w || 1, h = it.h || 1;
          const n = renderItem(it, { ...opts, w, h });
          setVars(n.style, { '--iw': w, '--ih': h });
          row.append(n);
        } else {
          row.append(el('div', { class: editing ? 'slot' : 'gap' }));
        }
      }
      box.append(row);
    }
  } else {
    const list = sp.layout === 'list';
    const g = makeGrid(sp);
    box.style.gridTemplateColumns = `repeat(${sp.cols}, var(${list ? '--lw' : '--cell'}))`;
    box.style.gridTemplateRows = `repeat(${sp.rows}, var(${list ? '--lh' : '--cell'}))`;
    for (const it of p.items) {
      const [w, h] = sizeIn(it, sp);
      g.mark(it.x, it.y, w, h);
      const rw = list && it.type === 'widget' ? (it.w || 1) : w;
      const rh = list && it.type === 'widget' ? (it.h || 1) : h;
      const n = renderItem(it, { ...opts, w: rw, h: rh });
      n.style.gridArea = `${it.y + 1} / ${it.x + 1} / span ${h} / span ${w}`;
      box.append(n);
    }
    if (editing) {
      for (let k = 0; k < g.used.length; k++) {
        if (!g.used[k]) box.append(el('div', { class: 'slot', style: { gridArea: `${Math.floor(k / sp.cols) + 1} / ${k % sp.cols + 1}` } }));
      }
    }
  }
  const sec = el('section', { class: 'page', dataset: { page: i } });
  if (state.settings.xPages && p.name) sec.append(el('div', { class: 'page-name' }, p.name));
  sec.append(box);
  return sec;
}

// Achica celdas e iconos lo justo para que cada pantalla quepa entera (nunca hay scroll).
function fitPages() {
  const s = state.settings;
  const els = $$('#track > .page');
  if (!els.length) return;
  const cs = getComputedStyle(els[0]);
  const W = els[0].clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const H0 = els[0].clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (W <= 0 || H0 <= 0) return;
  els.forEach((node, i) => {
    const p = state.pages[i];
    if (!p) return;
    const name = node.querySelector('.page-name');
    const H = H0 - (name ? name.offsetHeight + 8 : 0);
    const sp = slotSpec(p);
    let rowsW = sp.cols, rowsH = sp.rows;
    if (sp.layout === 'rows') {
      rowsH = 0;
      for (let y = 0; y < sp.rows; y++) {
        let rw = 0, rh = 1;
        for (let x = 0; x < sp.rowLen(y); x++) {
          const it = p.items.find(o => o.x === x && o.y === y);
          rw += it ? (it.w || 1) : 1;
          if (it && (it.h || 1) > rh) rh = it.h || 1;
        }
        if (rw > rowsW) rowsW = rw;
        rowsH += rh;
      }
    }
    const [natW, natH] =
      sp.layout === 'grid' ? [sp.cols * s.cell, sp.rows * s.cell]
      : sp.layout === 'rows' ? [rowsW * s.cell, Math.max(sp.rows, rowsH) * s.cell]
      : [sp.cols * LIST_W + (sp.cols - 1) * 12, sp.rows * LIST_H];
    const k = Math.max(0.3, Math.min(1, W / natW, H / natH));
    setVars(node.style, {
      '--cell': s.cell * k + 'px', '--icon': s.icon * k + 'px',
      '--lw': LIST_W * k + 'px', '--lh': LIST_H * k + 'px', '--k': k,
    });
  });
}

// Las carpetas abiertas crecen libremente (4 columnas).
function buildFolderContainer(items, folderId) {
  const box = el('div', { class: 'items grid', dataset: { folder: folderId } });
  box.style.gridTemplateColumns = `repeat(${Math.min(4, Math.max(items.length, 1))}, var(--cell))`;
  box.append(...items.map(it => renderItem(it, { inFolder: true, layout: 'grid', lazy: false })));
  return box;
}

function renderItem(it, { inFolder, layout, lazy, w = 1, h = 1 }) {
  const isLink = it.type === 'link';
  const node = el(isLink ? 'a' : 'div', {
    class: `item ${it.type} w${w} h${h}${it.kind ? ' kind-' + it.kind : ''}`,
    href: isLink ? it.url : null,
    title: isLink ? `${it.title || ''}\n${it.url}`.trim() : (it.title || null),
    draggable: editing ? 'false' : null,
    dataset: { id: it.id },
  });
  if (it.type === 'widget') {
    const isRoomy = !inFolder;
    node.append(...renderWidget(it, w, h, isRoomy));
  } else {
    const big = w * h >= 4;
    const tile = el('div', { class: 'tile' }, iconFor(it, big ? 9 : 4, lazy, big ? 128 : 64));
    if (it.shape) setVars(tile.style, shapeVars(it.shape));
    node.append(tile, el('span', { class: 'label' }, it.title || hostOf(it.url || '')));
  }
  if (editing) node.append(ctrlsFor(it, inFolder, layout));
  return node;
}

const MIN2X2_KINDS = new Set(['calc', 'calendar', 'timer', 'todo', 'habits', 'gdrive', 'gcal', 'photos', 'breathe']);

function sizesFor(it) {
  if (it?.type === 'widget') {
    if (MIN2X2_KINDS.has(it.kind)) return ['1x1', '2x2', '3x2', '2x3', '3x3', '4x2', '4x3'];
    if (it.kind !== 'notes') return ['1x1', '2x1', '2x2', '3x2', '3x3', '4x2', '4x3'];
  }
  return SIZES;
}

function ctrlsFor(it, inFolder, layout) {
  const btn = (txt, title, fn, dis = false) => el('button', {
    type: 'button', class: 'ctrl', title, disabled: dis || null,
    onclick: e => { e.preventDefault(); e.stopPropagation(); if (!dis) fn(); },
  }, txt);
  const canResize = !inFolder && (layout !== 'list' || it.type === 'widget');
  const list = sizesFor(it);
  const curIdx = list.indexOf(`${it.w || 1}x${it.h || 1}`);
  return el('div', { class: 'ctrls' },
    it.type !== 'widget' && btn('✎', t('edit'), () => openEditor(it)),
    it.type === 'widget' && WIDGETS[it.kind]?.cfg && btn('⚙', t('configure'), () => openWidgetCfg(it)),
    canResize && btn('−', t('shrinkSize'), () => stepSize(it, -1), curIdx === 0),
    canResize && btn('+', t('growSize'), () => stepSize(it, 1), curIdx === list.length - 1),
    inFolder && btn('⇱', t('takeOut'), () => takeOut(it.id)),
    btn('✕', t('delete'), () => removeItem(it.id)),
  );
}

function iconFor(it, max, lazy, size = 64) {
  if (it.type === 'folder') {
    return el('div', { class: `mini${max > 4 ? ' big' : ''}` }, it.items.slice(0, max).map(c => {
      if (c.icon) return el('img', { src: c.icon, alt: '', draggable: 'false', decoding: 'async' });
      if (c.glyph) return el('span', { class: 'mini-glyph' }, c.glyph);
      const host = hostOf(c.url);
      return isGeneric(host) ? letterFor(host, true)
        : el('img', { src: faviconUrl(c.url, 32), alt: '', draggable: 'false', decoding: 'async', loading: lazy ? 'lazy' : null });
    }));
  }
  if (it.icon) return el('img', { src: it.icon, alt: '', class: 'custom', draggable: 'false', decoding: 'async' });
  if (it.glyph) return el('span', { class: 'glyph' }, it.glyph);
  return favImg(it.url, size, lazy);
}

const pageLabel = i => (state.settings.xPages && state.pages[i]?.name) || t('screenN', i + 1);

function renderDots() {
  $('#dots').classList.toggle('hidden', state.pages.length < 2 && !editing);
  $('#dots').replaceChildren(...state.pages.map((_, i) => el('button', {
    type: 'button', class: `dot${i === current ? ' active' : ''}`, dataset: { page: i },
    title: pageLabel(i), 'aria-label': pageLabel(i), onclick: () => goToPage(i),
  })));
}

function goToPage(i, animate = true) {
  const last = state.pages.length - 1;
  const prev = current;
  current = Math.max(0, Math.min(i, last));
  const track = $('#track');
  track.classList.toggle('instant', !animate);
  track.style.transform = `translateX(${-100 * current}%)`;
  $$('#dots .dot').forEach((d, j) => d.classList.toggle('active', j === current));
  $('#prev').disabled = current === 0;
  $('#next').disabled = current === last;
  document.body.classList.toggle('single-page', last === 0);
  if (prev !== current) updatePageBg();
}

// ---------- acciones sobre iconos ----------
function setSize(it, size) {
  [it.w, it.h] = size.split('x').map(Number);
  commit();
}

function stepSize(it, dir) {
  const list = sizesFor(it);
  let idx = list.indexOf(`${it.w || 1}x${it.h || 1}`);
  if (idx < 0) idx = 0;
  const next = list[Math.max(0, Math.min(list.length - 1, idx + dir))];
  if (next) setSize(it, next);
}

const cycleSize = it => stepSize(it, 1);

function setShape(it, shape) {
  if (shape) it.shape = shape;
  else delete it.shape;
  commit();
}

function removeItem(id) {
  const loc = locate(id);
  if (!loc) return;
  loc.list.splice(loc.index, 1);
  if (loc.item.type === 'widget') disposeWidget(id);
  commit();
  toast(t('deleted', loc.item.title || (loc.item.kind ? t('w_' + loc.item.kind) : hostOf(loc.item.url || ''))), true);
}

function takeOut(id) {
  const loc = locate(id);
  if (!loc?.folder) return;
  loc.list.splice(loc.index, 1);
  delete loc.item.x;
  delete loc.item.y;
  state.pages[loc.pageIdx].items.push(loc.item);
  if (!loc.folder.items.length) $('#folderDlg').close();
  commit();
}

function moveToPage(id, i) {
  const loc = locate(id);
  if (!loc) return;
  loc.list.splice(loc.index, 1);
  if (i >= state.pages.length) state.pages.push(copyCfg(state.pages[loc.pageIdx], newPage()));
  delete loc.item.x;
  delete loc.item.y;
  state.pages[i].items.push(loc.item);
  commit();
  toast(t('movedTo', pageLabel(locate(id)?.pageIdx ?? i)), true);
}

// Agrega en el primer hueco libre de la pantalla actual (o en la siguiente con espacio).
function addItem(item, pageIdx = current) {
  state.pages[pageIdx].items.push(item);
  commit();
  const now = locate(item.id)?.pageIdx;
  if (now != null && now !== pageIdx) toast(t('addedOn', pageLabel(now)), true);
}

// Quita carpetas vacías (salvo `keep`). Devuelve true si quitó alguna.
function pruneFolders(keep = null) {
  let removed = false;
  for (const p of state.pages) {
    const n = p.items.length;
    p.items = p.items.filter(it => it.type !== 'folder' || it.items.length || it === keep);
    removed ||= p.items.length !== n;
  }
  return removed;
}

// Quita pantallas vacías creadas automáticamente al arrastrar a un borde.
function pruneAutoPages() {
  state.pages = state.pages.filter(p => !(p.auto && !p.items.length));
  state.pages.forEach(p => delete p.auto);
  if (!state.pages.length) state.pages.push(newPage());
  current = Math.min(current, state.pages.length - 1);
}

async function topSitesNotIn(have) {
  const out = [];
  for (const s of await chrome.topSites.get()) {
    const k = keyOf(s.url);
    if (have.has(k)) continue;
    have.add(k);
    out.push({ id: uid(), type: 'link', title: cleanTitle(s.title, s.url), url: s.url, w: 1, h: 1 });
  }
  return out;
}
