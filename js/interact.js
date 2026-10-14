'use strict';
// Interacción: arrastrar (mouse, táctil y lápiz), soltar enlaces de otras ventanas,
// menús de clic derecho, barra de marcadores y navegación entre pantallas.

// ---------- menús emergentes (clic derecho y carpetas de marcadores) ----------
// Son "popover": así quedan por encima incluso de una carpeta abierta.
let menus = [];

function closeMenus(level = 0) {
  while (menus.length > level) {
    const m = menus.pop();
    m.hidePopover?.();
    m.remove();
  }
}

// anchor: elemento (el menú se abre debajo, o a la derecha si es un submenú) o punto {x, y}.
function openMenu(nodes, anchor, level = 0, alignRight = false) {
  closeMenus(level);
  const m = el('div', { class: 'bm-menu', role: 'menu', popover: 'manual', dataset: { level } },
    nodes.length ? nodes : el('div', { class: 'bm-empty' }, t('empty')));
  m._anchor = anchor;
  document.body.append(m);
  m.showPopover();
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
  const mr = m.getBoundingClientRect();
  const point = !anchor.getBoundingClientRect;
  let left = level ? r.right - 2 : (alignRight ? r.right - mr.width : r.left);
  let top = level ? r.top - 6 : (point ? r.top : r.bottom + 2);
  if (left + mr.width > innerWidth - 8) left = level ? r.left - mr.width + 2 : innerWidth - mr.width - 8;
  if (top + mr.height > innerHeight - 8) top = Math.max(8, innerHeight - mr.height - 8);
  m.style.left = Math.max(8, left) + 'px';
  m.style.top = top + 'px';
  menus.push(m);
}

// Entrada de menú: { label, act } | { label, sub: [...] } | '-' (separador)
function entryEl(e) {
  if (e === '-') return el('div', { class: 'msep' });
  const b = el('button', { type: 'button', class: `bm mi${e.sub ? ' folder' : ''}${e.danger ? ' danger' : ''}`, disabled: e.disabled || null },
    el('span', { class: 'mcheck' }, e.checked ? '✓' : ''), el('span', { class: 'bt' }, e.label));
  if (e.sub) b._sub = e.sub;
  else b._act = e.act;
  return b;
}

const menuKids = b => b._bm ? b._bm.map(n => bmEl(n, true)) : b._sub ? b._sub.map(entryEl) : null;

document.addEventListener('mouseover', e => {
  const m = e.target.closest('.bm-menu');
  if (!m) return;
  const level = +m.dataset.level + 1;
  const b = e.target.closest('button.bm.folder');
  if (b) { if (menus[level]?._anchor !== b) openMenu(menuKids(b), b, level); }
  else if (e.target.closest('.bm')) closeMenus(level);
});

document.addEventListener('click', e => {
  const b = e.target.closest('.bm-menu button.bm');
  if (b?._act) { closeMenus(); b._act(); }
  else if (b && menuKids(b)) openMenu(menuKids(b), b, +b.closest('.bm-menu').dataset.level + 1); // táctil: sin hover
  else if (e.target.closest('.bm-menu a')) closeMenus();
});

document.addEventListener('pointerdown', e => {
  if (menus.length && !e.target.closest('.bm-menu, #bmbar button.bm')) closeMenus();
});

const openUrls = urls => urls.forEach(url => chrome.tabs.create({ url, active: false }));
const openEntries = url => [
  { label: t('openNewTab'), act: () => chrome.tabs.create({ url, active: false }) },
  { label: t('openNewWindow'), act: () => chrome.windows.create({ url }) },
  { label: t('openIncognito'), act: () => chrome.windows.create({ url, incognito: true }) },
];
const sizeLabel = sz => t('size_' + sz);

function itemMenu(loc) {
  const it = loc.item, inFolder = !!loc.folder, sp = slotSpec(state.pages[loc.pageIdx]);
  const E = [];
  if (it.type === 'link') E.push(...openEntries(it.url), '-');
  if (it.type === 'folder' && it.items.length) {
    E.push({ label: t('openAll', it.items.length), act: () => openUrls(it.items.map(c => c.url)) },
      { label: t('openAllWindow'), act: () => chrome.windows.create({ url: it.items.map(c => c.url) }) }, '-');
  }
  if (it.type === 'widget' && WIDGETS[it.kind]) E.push({ label: t('open'), act: () => openWidget(it) });
  if (it.type !== 'widget') E.push({ label: t('edit'), act: () => openEditor(it) });
  if (!inFolder && sp.sized) E.push({ label: t('size'), sub: SIZES.map(sz => ({ label: sizeLabel(sz), checked: `${it.w || 1}x${it.h || 1}` === sz, act: () => setSize(it, sz) })) });
  if (it.type !== 'widget') {
    E.push({ label: t('shape'), sub: [{ label: t('shapeDefault'), checked: !it.shape, act: () => setShape(it, '') },
      ...Object.keys(SHAPES).map(k => ({ label: t('shape_' + k), checked: it.shape === k, act: () => setShape(it, k) }))] });
  }
  if (inFolder) E.push({ label: t('takeOut'), act: () => takeOut(it.id) });
  else {
    E.push({ label: t('moveTo'), sub: [...state.pages.map((_, i) => ({ label: pageLabel(i), disabled: i === loc.pageIdx, act: () => moveToPage(it.id, i) })),
      '-', { label: t('newScreen'), act: () => moveToPage(it.id, state.pages.length) }] });
  }
  E.push('-', { label: t('delete'), danger: true, act: () => removeItem(it.id) });
  return E;
}

const bmLinks = nodes => nodes.filter(n => n.u);

function bmMenu(b) {
  if (b._bm) {
    const links = bmLinks(b._bm);
    return [
      { label: t('openAll', links.length), disabled: !links.length, act: () => openUrls(links.map(n => n.u)) },
      { label: t('addFolderHere'), disabled: !links.length, act: () => addItem({ id: uid(), type: 'folder', title: b.textContent.trim(), w: 1, h: 1,
        items: links.map(n => ({ id: uid(), type: 'link', title: n.t || cleanTitle('', n.u), url: n.u, w: 1, h: 1 })) }) },
    ];
  }
  const url = b.getAttribute('href');
  return [...openEntries(url), '-',
    { label: t('addHere'), act: () => addItem({ id: uid(), type: 'link', title: b.textContent.trim() || cleanTitle('', url), url, w: 1, h: 1 }) }];
}

function pageMenu() {
  const s = state.settings;
  return [
    { label: t('addLink'), act: () => openEditor(null, 'link') },
    { label: t('addFolder'), act: () => openEditor(null, 'folder') },
    s.xWidgets && { label: t('addWidget'), sub: Object.keys(WIDGETS).map(k => ({ label: t('w_' + k), act: () => addItem(newWidget(k)) })) },
    { label: t('screenSettings'), act: openPageDlg },
    '-',
    { label: editing ? t('done') : t('customize'), act: () => setEditing(!editing) },
    { label: t('settings'), act: openSettings },
    undoStack.length && { label: t('undo'), act: undo },
  ].filter(Boolean);
}

document.addEventListener('contextmenu', e => {
  if (drag) return e.preventDefault();
  if (pressUsed) { pressUsed = false; return e.preventDefault(); } // táctil: la pulsación larga ya entró a editar
  if (e.target.closest('input, textarea, #settingsDlg, #editDlg, #askDlg, #pageDlg, #widgetDlg')) return;
  const node = e.target.closest('.item');
  const bm = e.target.closest('.bm:not(.mi)');
  let entries = null;
  if (node && locate(node.dataset.id)) entries = itemMenu(locate(node.dataset.id));
  else if (bm && bm.id !== 'bmMore' && bm.id !== 'bmOther') entries = bmMenu(bm);
  else if (e.target.closest('#pages')) entries = pageMenu();
  if (!entries) return;
  e.preventDefault();
  closeMenus();
  openMenu(entries.map(entryEl), { x: e.clientX, y: e.clientY });
});

// ---------- arrastrar con puntero (mouse, táctil y lápiz) ----------
let drag = null;          // arrastre en curso
let press = null;         // pulsación que todavía no es arrastre
let suppressClick = false;
let pressUsed = false;
let edgeTimer = null;
const DRAG_START = 6;     // px de movimiento para empezar a arrastrar
const LONG_PRESS = 450;   // ms para entrar al modo edición manteniendo presionado

document.addEventListener('pointerdown', e => {
  suppressClick = false;
  if (e.button !== 0 || e.target.closest('.ctrl, .widget-ui, input, textarea, select')) return;
  const node = e.target.closest('.item');
  const bm = e.target.closest('a.bm');
  if (!node && !(bm && editing)) return;
  press = { x: e.clientX, y: e.clientY, pointer: e.pointerId, node, bm, el: node || bm };
  if (!editing && node && state.settings.longPress) {
    press.timer = setTimeout(() => {
      if (!press) return;
      const id = node.dataset.id;
      setEditing(true);
      const fresh = $(`.item[data-id="${id}"]`);
      if (!fresh) { press = null; return; }
      press.node = press.el = fresh;
      suppressClick = pressUsed = true;
      navigator.vibrate?.(15);
      beginDrag(press.x, press.y); // queda "levantado", listo para moverlo
    }, LONG_PRESS);
  }
});

document.addEventListener('pointermove', e => {
  if (drag) return moveDrag(e.clientX, e.clientY);
  if (!press || e.pointerId !== press.pointer) return;
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_START) return;
  clearTimeout(press.timer);
  if (!editing) { press = null; return; } // fuera del modo edición, moverse no arrastra
  beginDrag(e.clientX, e.clientY);
});

document.addEventListener('pointerup', e => {
  if (press) clearTimeout(press.timer);
  press = null;
  if (drag) { finishDrag(e.clientX, e.clientY); suppressClick = true; }
});

document.addEventListener('pointercancel', () => {
  if (press) clearTimeout(press.timer);
  press = null;
  if (drag) cancelDrag();
});

document.addEventListener('click', e => {
  if (!suppressClick) return;
  suppressClick = false;
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);

function beginDrag(x, y) {
  const p = press;
  press = null;
  const src = p.node
    ? { kind: 'item', id: p.node.dataset.id }
    : { kind: 'bm', url: p.bm.getAttribute('href'), title: p.bm.textContent.trim() };
  if (src.kind === 'item' && !locate(src.id)) return;
  const r = p.el.getBoundingClientRect();
  const cell = parseFloat(getComputedStyle(p.el).getPropertyValue('--cell')) || r.width;
  const ghost = el('div', { class: 'drag-ghost', popover: 'manual', style: { width: r.width + 'px', height: r.height + 'px' } }, p.el.cloneNode(true));
  document.body.append(ghost);
  ghost.showPopover();
  drag = {
    src, ghost, srcEl: p.el, hit: null,
    grab: { dx: x - r.left, dy: y - r.top, cx: Math.floor((x - r.left) / cell), cy: Math.floor((y - r.top) / cell) },
  };
  p.el.classList.add('dragging');
  document.body.classList.add('dragging-active');
  closeMenus();
  moveDrag(x, y);
}

function moveDrag(x, y) {
  drag.ghost.style.transform = `translate(${x - drag.grab.dx}px, ${y - drag.grab.dy}px)`;
  const hit = hitTest(x, y);
  showHit(hit);
  drag.hit = hit;
}

const pageEl = () => $$('#track > .page')[current];

// Celda bajo el puntero, calculada con la geometría (sirve aunque no haya nada dibujado ahí).
function cellAt(x, y) {
  const box = pageEl()?.querySelector('.items');
  if (!box) return null;
  const sp = slotSpec(state.pages[current]), r = box.getBoundingClientRect();
  if (sp.layout === 'rows') {
    const cell = r.height / sp.rows, yy = Math.floor((y - r.top) / cell);
    if (yy < 0 || yy >= sp.rows) return null;
    const n = sp.rowLen(yy), left = r.left + (r.width - n * cell) / 2, xx = Math.floor((x - left) / cell);
    return xx >= 0 && xx < n ? { x: xx, y: yy } : null;
  }
  const xx = Math.floor((x - r.left) / (r.width / sp.cols)), yy = Math.floor((y - r.top) / (r.height / sp.rows));
  return xx >= 0 && xx < sp.cols && yy >= 0 && yy < sp.rows ? { x: xx, y: yy } : null;
}

// Rectángulo en pantalla de un grupo de celdas (para la vista previa de dónde caerá).
function cellsRect(x, y, w, h) {
  const box = pageEl()?.querySelector('.items');
  const sp = slotSpec(state.pages[current]), r = box.getBoundingClientRect();
  if (sp.layout === 'rows') {
    const cell = r.height / sp.rows, left = r.left + (r.width - sp.rowLen(y) * cell) / 2;
    return { left: left + x * cell, top: r.top + y * cell, width: cell, height: cell };
  }
  const cw = r.width / sp.cols, ch = r.height / sp.rows;
  return { left: r.left + x * cw, top: r.top + y * ch, width: cw * w, height: ch * h };
}

function hitTest(x, y) {
  const fd = $('#folderDlg');
  if (fd.open) {
    const r = fd.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      const node = document.elementFromPoint(x, y)?.closest('#folderBody .item');
      if (node && node.dataset.id !== drag.src.id) {
        const nr = node.getBoundingClientRect();
        return { kind: 'fitem', id: node.dataset.id, node, after: x > nr.left + nr.width / 2 };
      }
      return { kind: 'fbox' };
    }
    return { kind: 'leave-folder' };
  }
  const dot = document.elementFromPoint(x, y)?.closest('.dot');
  if (dot) return { kind: 'dot', page: +dot.dataset.page };
  const pr = $('#pages').getBoundingClientRect();
  if (y < pr.top || y > pr.bottom) return null;
  const s = state.settings;
  const zone = s.showArrows && state.pages.length > 1 ? Math.max(s.navZone, s.navSize) : 40;
  if (x < pr.left + zone) return { kind: 'edge', dir: -1 };
  if (x > pr.right - zone) return { kind: 'edge', dir: 1 };
  const c = cellAt(x, y);
  return c ? { kind: 'cell', ...c, px: x, py: y } : null;
}

// Qué pasaría al soltar en una celda: colocar, crear carpeta o intercambiar.
function resolveCell(hit) {
  const p = state.pages[current], src = drag.src;
  const loc = src.kind === 'item' ? locate(src.id) : null;
  const moving = loc ? loc.item : { type: 'link', w: 1, h: 1 };
  const occ = itemAt(p, hit.x, hit.y);
  if (occ && occ !== moving) {
    const node = $(`.page .item[data-id="${occ.id}"]`);
    const nr = node.getBoundingClientRect();
    const fx = (hit.px - nr.left) / nr.width, fy = (hit.py - nr.top) / nr.height;
    const center = fx > 0.22 && fx < 0.78 && fy > 0.18 && fy < 0.82;
    if (center && moving.type === 'link' && (occ.type === 'link' || occ.type === 'folder')) return { action: 'merge', target: occ, node };
    if (loc && !loc.folder && loc.pageIdx === current) return { action: 'swap', target: occ, node, ok: canSwap(p, moving, occ) };
    return { action: 'none', node };
  }
  const sp = slotSpec(p);
  const [w, h] = sizeIn(moving, sp);
  const x = Math.max(0, Math.min(hit.x - Math.min(drag.grab.cx, w - 1), sp.cols - w));
  const y = Math.max(0, Math.min(hit.y - Math.min(drag.grab.cy, h - 1), sp.rows - h));
  return { action: 'place', x, y, w, h, ok: canPlace(p, moving, x, y, loc ? [moving] : []) };
}

function clearHit() {
  $$('.drop-merge, .drop-swap, .drop-bad, .drop-before, .drop-after').forEach(n => n.classList.remove('drop-merge', 'drop-swap', 'drop-bad', 'drop-before', 'drop-after'));
  $('#dropPreview').hidden = true;
}

function showHit(hit) {
  clearHit();
  if (hit?.kind !== 'edge') cancelEdge();
  if (!hit) return;
  if (hit.kind === 'cell') {
    const res = hit.res = resolveCell(hit);
    if (res.action === 'merge') res.node.classList.add('drop-merge');
    else if (res.action === 'swap') res.node.classList.add(res.ok ? 'drop-swap' : 'drop-bad');
    else if (res.action === 'none') res.node.classList.add('drop-bad');
    else {
      const pv = $('#dropPreview'), rc = cellsRect(res.x, res.y, res.w, res.h);
      Object.assign(pv.style, { left: rc.left + 'px', top: rc.top + 'px', width: rc.width + 'px', height: rc.height + 'px' });
      pv.classList.toggle('bad', !res.ok);
      pv.hidden = false;
    }
  } else if (hit.kind === 'edge') scheduleEdge(hit.dir);
  else if (hit.kind === 'dot' && hit.page !== current) goToPage(hit.page);
  else if (hit.kind === 'fitem') hit.node.classList.add(hit.after ? 'drop-after' : 'drop-before');
  else if (hit.kind === 'leave-folder') $('#folderDlg').close(); // sacar de la carpeta arrastrando hacia afuera
}

function cancelEdge() { clearTimeout(edgeTimer); edgeTimer = null; }

function scheduleEdge(dir) {
  if (edgeTimer) return;
  edgeTimer = setTimeout(() => {
    edgeTimer = null;
    const n = current + dir;
    if (n < 0) return;
    if (n >= state.pages.length) {
      const last = state.pages[state.pages.length - 1];
      if (last.auto && !last.items.length) return;
      const p = { ...copyCfg(state.pages[current], newPage()), auto: true };
      state.pages.push(p);
      $('#track').append(renderPage(p, state.pages.length - 1));
      renderDots();
      fitPages();
    }
    goToPage(n);
  }, 650);
}

function applyDrop(hit) {
  if (!hit) return false;
  const src = drag.src;
  const loc = src.kind === 'item' ? locate(src.id) : null;
  if (src.kind === 'item' && !loc) return false;
  const take = () => {
    if (loc) { loc.list.splice(loc.index, 1); return loc.item; }
    return { id: uid(), type: 'link', title: src.title || cleanTitle('', src.url), url: src.url, w: 1, h: 1 };
  };

  if (hit.kind === 'dot') {
    if (loc && !loc.folder && loc.pageIdx === hit.page) return false;
    const it = take();
    delete it.x; delete it.y;
    state.pages[hit.page].items.push(it);
    return true;
  }
  if (hit.kind === 'fitem' || hit.kind === 'fbox') {
    const f = locate(openFolderId)?.item;
    if (!f || (loc && loc.folder !== f)) return false;
    const it = take();
    if (hit.kind === 'fitem') f.items.splice(f.items.findIndex(c => c.id === hit.id) + (hit.after ? 1 : 0), 0, it);
    else f.items.push(it);
    return true;
  }
  if (hit.kind !== 'cell') return false;
  const res = resolveCell(hit);
  if (res.action === 'merge') {
    const it = take();
    delete it.x; delete it.y;
    if (res.target.type === 'folder') res.target.items.push(it);
    else {
      const tl = locate(res.target.id);
      const folder = { id: uid(), type: 'folder', title: t('folder'), x: res.target.x, y: res.target.y, w: res.target.w || 1, h: res.target.h || 1, items: [res.target, it] };
      delete res.target.x; delete res.target.y;
      tl.list.splice(tl.index, 1, folder);
    }
    return true;
  }
  if (res.action === 'swap' && res.ok) {
    const a = loc.item, b = res.target;
    [a.x, b.x] = [b.x, a.x];
    [a.y, b.y] = [b.y, a.y];
    return true;
  }
  if (res.action === 'place' && res.ok) {
    const it = take();
    it.x = res.x;
    it.y = res.y;
    state.pages[current].items.push(it);
    return true;
  }
  return false;
}

function endDrag() {
  if (!drag) return;
  drag.ghost.hidePopover?.();
  drag.ghost.remove();
  drag.srcEl.classList.remove('dragging');
  document.body.classList.remove('dragging-active');
  clearHit();
  cancelEdge();
  drag = null;
}

function finishDrag(x, y) {
  const hit = hitTest(x, y);
  const changed = applyDrop(hit);
  const fromBm = drag.src.kind === 'bm';
  endDrag();
  pruneAutoPages();
  commit();
  if (changed && fromBm) toast(t('linkAdded'), true);
}

function cancelDrag() {
  endDrag();
  if (state.pages.some(p => p.auto)) { pruneAutoPages(); renderAll(); }
}

// ---------- soltar enlaces desde otras ventanas o desde la barra de marcadores ----------
let selfDrag = false;
document.addEventListener('dragstart', e => {
  if (editing && e.target.closest?.('.item, a.bm, img')) return e.preventDefault(); // en edición arrastramos nosotros
  selfDrag = !!e.target.closest?.('.item');                                      // no duplicar nuestros propios iconos
});
document.addEventListener('dragend', () => { selfDrag = false; });

function droppedUrl(dt) {
  const uri = (dt.getData('text/uri-list') || '').split(/\r?\n/).find(l => l && !l.startsWith('#'));
  if (uri) return uri;
  const txt = dt.getData('text/plain').trim();
  return looksLikeUrl(txt) ? normUrl(txt) : '';
}

document.addEventListener('dragover', e => {
  if (selfDrag || !e.target.closest('#pages') || !e.dataTransfer.types.includes('text/uri-list')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

document.addEventListener('drop', e => {
  if (selfDrag || !e.target.closest('#pages')) return;
  const url = droppedUrl(e.dataTransfer);
  if (!url || /^javascript:/i.test(url)) return;
  e.preventDefault();
  const html = e.dataTransfer.getData('text/html');
  const text = html ? new DOMParser().parseFromString(html, 'text/html').body.textContent.trim() : '';
  const it = { id: uid(), type: 'link', title: (text && text.length <= 40 ? text : '') || cleanTitle('', url), url, w: 1, h: 1 };
  const p = state.pages[current], c = cellAt(e.clientX, e.clientY), occ = c && itemAt(p, c.x, c.y);
  if (occ?.type === 'folder') occ.items.push(it);
  else {
    if (c && !occ) { it.x = c.x; it.y = c.y; }
    p.items.push(it);
  }
  commit();
  toast(t('linkAdded'), true);
});

// ---------- clics en iconos ----------
document.addEventListener('click', e => {
  const node = e.target.closest('.item');
  if (node) {
    const it = locate(node.dataset.id)?.item;
    if (!it) return;
    if (it.type === 'folder') { e.preventDefault(); return openFolder(it.id); }
    if (it.type === 'widget') {
      if (!editing && node.querySelector(':scope > .tile')) openWidget(it); // compacto: abre en ventana
      return;
    }
    if (editing) return e.preventDefault();
  }
  // Las páginas chrome:// no se pueden abrir con un <a> normal desde una extensión.
  const a = e.target.closest('a[href]');
  if (a && /^(chrome|edge|about):/i.test(a.getAttribute('href'))) {
    e.preventDefault();
    closeMenus();
    if (e.ctrlKey || e.metaKey) chrome.tabs.create({ url: a.getAttribute('href'), active: false });
    else chrome.tabs.update({ url: a.getAttribute('href') });
  }
});

// ---------- barra de marcadores ----------
const BM_KEY = 'ntp_bm';
let bmBar = [];
let bmOverflow = [];

// Versión mínima del árbol (título, url, hijos) para guardarla en caché.
const slimBm = nodes => nodes
  .filter(n => n.children || (n.url && !/^javascript:/i.test(n.url)))
  .map(n => n.children ? { t: n.title, c: slimBm(n.children) } : { t: n.title, u: n.url });

function loadBmCache() {
  try { bmBar = JSON.parse(localStorage.getItem(BM_KEY)) || []; } catch { bmBar = []; }
}

async function bmTree() {
  const [root] = await chrome.bookmarks.getTree();
  return root.children;
}

let bmTimer = null;
function refreshBookmarks() {
  clearTimeout(bmTimer);
  bmTimer = setTimeout(async () => {
    const roots = await bmTree();
    const bar = roots.find(n => n.id === '1') || roots[0];
    bmBar = slimBm(bar?.children || []);
    try { localStorage.setItem(BM_KEY, JSON.stringify(bmBar)); } catch {}
    renderBookmarks();
  }, 50);
}

function bmEl(n, inMenu) {
  if (n.c) {
    const b = el('button', { type: 'button', class: 'bm folder', title: n.t }, el('span', { class: 'ficon' }), el('span', { class: 'bt' }, n.t));
    b._bm = n.c;
    return b;
  }
  return el('a', { class: 'bm', href: n.u, title: `${n.t}\n${n.u}`.trim() },
    el('img', { src: faviconUrl(n.u, 32), alt: '', draggable: editing ? 'false' : null, decoding: 'async', loading: inMenu ? 'lazy' : null }),
    (n.t || inMenu) ? el('span', { class: 'bt' }, n.t || hostOf(n.u)) : null);
}

function renderBookmarks() {
  if (!state.settings.showBookmarks) return;
  $('#bmItems').replaceChildren(...bmBar.map(n => bmEl(n, false)));
  requestAnimationFrame(fitBookmarks);
}

// Oculta los que no caben y los manda al menú "»", igual que Chrome.
function fitBookmarks() {
  const box = $('#bmItems');
  const kids = [...box.children];
  kids.forEach(k => { k.hidden = false; });
  const max = box.clientWidth;
  const cut = kids.findIndex(k => k.offsetLeft + k.offsetWidth > max);
  bmOverflow = cut < 0 ? [] : bmBar.slice(cut);
  if (cut >= 0) for (let i = cut; i < kids.length; i++) kids[i].hidden = true;
  $('#bmMore').hidden = !bmOverflow.length;
}

$('#bmbar').addEventListener('click', async e => {
  const b = e.target.closest('button.bm');
  if (!b) return;
  if (menus[0]?._anchor === b) return closeMenus();
  if (b.id === 'bmMore') return openMenu(bmOverflow.map(n => bmEl(n, true)), b);
  if (b.id === 'bmOther') {
    const roots = await bmTree();
    const other = roots.find(n => n.id === '2') || roots[1];
    return openMenu(slimBm(other?.children || []).map(n => bmEl(n, true)), b, 0, true);
  }
  openMenu(menuKids(b), b);
});

// Con un menú abierto, pasar el mouse por otra carpeta de la barra la abre (como en Chrome).
$('#bmbar').addEventListener('mouseover', e => {
  const b = e.target.closest('button.bm.folder');
  if (b?._bm && menus.length && menus[0]._anchor !== b) openMenu(menuKids(b), b);
});

// ---------- navegación entre pantallas ----------
const anyDialogOpen = () => !!$('dialog[open]');

$('#prev').addEventListener('click', () => goToPage(current - 1));
$('#next').addEventListener('click', () => goToPage(current + 1));

let wheelLock = 0;
$('#pages').addEventListener('wheel', e => {
  if (state.pages.length < 2 || anyDialogOpen() || e.target.closest('.widget-ui')) return;
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(d) < 25) return;
  const now = Date.now();
  if (now < wheelLock) return;
  wheelLock = now + 450;
  goToPage(current + Math.sign(d));
}, { passive: true });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && menus.length) return closeMenus();
  if (anyDialogOpen() || e.target.matches('input, textarea, select')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return undo(); }
  if (e.key === 'ArrowRight') goToPage(current + 1);
  else if (e.key === 'ArrowLeft') goToPage(current - 1);
  else if (e.key === 'Escape' && editing) setEditing(false);
  else if (e.key === '/' && state.settings.xSearch && state.settings.showSearch) { e.preventDefault(); $('#q').focus(); }
});

let fitRaf = 0;
addEventListener('resize', () => {
  closeMenus();
  cancelAnimationFrame(fitRaf);
  fitRaf = requestAnimationFrame(() => { fitBookmarks(); fitPages(); });
});
