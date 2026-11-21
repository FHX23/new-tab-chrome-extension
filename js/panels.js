'use strict';
// Paneles: editor de accesos, carpeta abierta, ajustes de la pantalla, ajustes generales,
// barra de edición, buscador y bienvenida.

function setEditing(on) {
  editing = on;
  closeMenus();
  renderAll();
}

// ---------- carpeta ----------
// El evento 'close' del diálogo es asíncrono: comprobamos también que siga abierto.
const activeFolder = () => ($('#folderDlg').open && openFolderId ? locate(openFolderId)?.item : null);

// Tres estilos (Ajustes → Iconos): 'panel' centrada y modal, 'bubble' pegada a la carpeta,
// 'screen' ocupando el área de los iconos. Las dos últimas no bloquean la página.
function openFolder(id) {
  const dlg = $('#folderDlg');
  // Pasar de una carpeta a otra sin cerrar: el evento 'close' es asíncrono y llegaría tarde.
  const switching = dlg.open && openFolderId !== id;
  openFolderId = id;
  if (switching && pruneFolders(locate(id)?.item)) commit();
  const style = state.settings.folderStyle || 'panel';
  dlg.dataset.style = style;

  // Sincronizar tamaño de celdas con la pantalla actual
  const curPage = $$('#track > .page')[current];
  if (curPage) {
    const cs = getComputedStyle(curPage);
    dlg.style.setProperty('--page-cell', cs.getPropertyValue('--cell'));
    dlg.style.setProperty('--page-icon', cs.getPropertyValue('--icon'));
  }

  renderFolder();
  positionFolder();
  if (!dlg.open) {
    if (style === 'panel') dlg.showModal();
    else dlg.show();
  }
  document.body.classList.toggle('folder-screen', style === 'screen');
  if (style !== 'panel') positionFolder();
}

function positionFolder() {
  const dlg = $('#folderDlg'), style = dlg.dataset.style;
  dlg.classList.remove('above');
  if (style === 'screen') {
    const r = $('#pages').getBoundingClientRect();
    Object.assign(dlg.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    return;
  }
  const anchor = $(`.page .item[data-id="${openFolderId}"] .tile`);
  if (!anchor) return;
  const a = anchor.getBoundingClientRect();
  if (style === 'panel') {
    return;
  }
  const d = dlg.getBoundingClientRect();
  const left = Math.max(12, Math.min(a.left + a.width / 2 - d.width / 2, innerWidth - d.width - 12));
  let top = a.bottom + 14;
  if (top + d.height > innerHeight - 12) { top = Math.max(12, a.top - d.height - 14); dlg.classList.add('above'); }
  Object.assign(dlg.style, { left: left + 'px', top: top + 'px' });
  dlg.style.setProperty('--ax', a.left + a.width / 2 - left + 'px'); // punta del globo apuntando a la carpeta
}

function renderFolder() {
  const f = locate(openFolderId)?.item;
  if (!f) return $('#folderDlg').close();
  const name = $('#folderName');
  if (document.activeElement !== name) name.value = f.title || '';
  name.readOnly = !editing;
  $('#folderDlg').classList.toggle('editing', editing);
  $('#folderBody').replaceChildren(buildFolderContainer(f.items, f.id));
  if ($('#folderDlg').open && $('#folderDlg').dataset.style === 'bubble') positionFolder();
}

let folderRenamed = false;
$('#folderName').addEventListener('input', e => {
  const f = locate(openFolderId)?.item;
  if (f) { f.title = e.target.value; folderRenamed = true; saveQuiet(); }
});
$('#folderClose').addEventListener('click', () => $('#folderDlg').close());
$('#folderBack').addEventListener('click', () => $('#folderDlg').close());
$('#folderAdd').addEventListener('click', () => openEditor(null, 'link'));
$('#folderDlg').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$('#folderDlg').addEventListener('close', () => {
  if ($('#folderDlg').open) return; // evento atrasado: la carpeta ya se volvió a abrir
  openFolderId = null;
  document.body.classList.remove('folder-screen');
  // Solo se redibuja si algo cambió (una carpeta quedó vacía o se le cambió el nombre).
  if (!drag && (pruneFolders() || folderRenamed)) commit();
  folderRenamed = false;
}); 

// ---------- editor de acceso ----------
let editId = null, editType = 'link', pendingIcon;
const editF = $('#editForm').elements;

for (const k of Object.keys(SHAPES)) $('#shapeSelect').append(el('option', { value: k }, t('shape_' + k)));

function openEditor(it, type = 'link') {
  editId = it?.id ?? null;
  editType = it?.type ?? type;
  pendingIcon = undefined;
  const inFolder = it ? !!locate(it.id).folder : (editType === 'link' && !!activeFolder());
  $('#editTitle').textContent = t((it ? 'edit_' : 'add_') + editType);
  editF.title.value = it?.title ?? (editType === 'folder' ? t('folder') : '');
  editF.url.value = it?.url ?? '';
  editF.url.required = editType === 'link';
  editF.glyph.value = it?.glyph ?? '';
  editF.size.value = `${it?.w || 1}x${it?.h || 1}`;
  editF.shape.value = it?.shape || '';
  $('#shapeHint').hidden = !editF.shape.value;
  $$('#editForm [data-for="link"]').forEach(n => { n.hidden = editType !== 'link'; });
  const itemPage = state.pages[it ? locate(it.id).pageIdx : current];
  $$('#editForm [data-for="size"]').forEach(n => { n.hidden = inFolder || pageCfg(itemPage).layout === 'list'; });
  updatePreview();
  $('#editDlg').showModal();
  (editType === 'link' && !it ? editF.url : editF.title).focus();
}

const currentIcon = () => (pendingIcon === undefined ? locate(editId)?.item.icon : pendingIcon);

function updatePreview() {
  const p = $('#iconPreview');
  setVars(p.style, shapeVars(editF.shape.value || state.settings.shape));
  if (editType === 'folder') {
    const f = locate(editId)?.item;
    return p.replaceChildren(f?.items.length ? iconFor(f, 4, false) : el('div', { class: 'mini' }, [0, 1, 2, 3].map(() => el('i', { class: 'mini-dot' }))));
  }
  const icon = currentIcon(), glyph = editF.glyph.value.trim(), url = editF.url.value.trim();
  p.replaceChildren(icon ? el('img', { src: icon, alt: '', class: 'custom' })
    : glyph ? el('span', { class: 'glyph' }, glyph)
    : url ? favImg(normUrl(url), 64, false) : '');
}

editF.url.addEventListener('change', updatePreview);
editF.glyph.addEventListener('input', updatePreview);
editF.shape.addEventListener('change', () => { $('#shapeHint').hidden = !editF.shape.value; updatePreview(); });

// Reduce una imagen manteniendo proporción; devuelve el canvas.
async function scaleImage(file, max) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = el('canvas', { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

// Ícono subido: 128 px en WebP para no inflar el almacenamiento.
async function fileToIcon(file) {
  const src = await scaleImage(file, 128);
  const c = el('canvas', { width: 128, height: 128 });
  c.getContext('2d').drawImage(src, (128 - src.width) / 2, (128 - src.height) / 2);
  return c.toDataURL('image/webp', 0.9);
}

$('#iconFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  pendingIcon = await fileToIcon(file);
  updatePreview();
});
$('#iconReset').addEventListener('click', () => { pendingIcon = null; editF.glyph.value = ''; updatePreview(); });

$('#editForm').addEventListener('submit', e => {
  if (e.submitter?.value !== 'ok') return;
  const [w, h] = editF.size.value.split('x').map(Number);
  const data = { title: editF.title.value.trim(), w, h };
  if (editType === 'link') data.url = normUrl(editF.url.value);

  let item;
  if (editId) {
    item = locate(editId)?.item;
    if (!item) return;
    Object.assign(item, data);
  } else {
    item = { id: uid(), type: editType, ...data };
    if (editType === 'folder') item.items = [];
  }
  const glyph = editF.glyph.value.trim();
  if (glyph) item.glyph = glyph;
  else delete item.glyph;
  if (editF.shape.value) item.shape = editF.shape.value;
  else delete item.shape;
  if (pendingIcon === null) delete item.icon;
  else if (pendingIcon) item.icon = pendingIcon;

  if (editId) commit();
  else {
    const folder = editType === 'link' ? activeFolder() : null;
    if (folder) { folder.items.push(item); commit(); }
    else addItem(item);
    if (editType === 'folder') openFolder(item.id);
  }
});

// ---------- ajustes de la pantalla actual (espacios, nombre y fondo) ----------
const pageF = $('#pageForm').elements;

let pendingPageBg = null; // { blob } o { remove: true }: se aplica solo al pulsar Guardar

function openPageDlg() {
  const p = state.pages[current], cfg = pageCfg(p);
  pendingPageBg = null;
  $('#pageNum').textContent = current + 1;
  pageF.cols.value = cfg.cols;
  pageF.rows.value = cfg.rows;
  pageF.pattern.value = cfg.pattern.join(',');
  pageF.layout.value = cfg.layout;
  pageF.name.value = p.name || '';
  $('#pageBgState').textContent = p.bg ? t('hasOwnBg') : '';
  note($('#pageSpacesNote'), ownCfg(p) ? t('notePageOwn') : t('notePageGlobal'), ownCfg(p) ? t('backToGlobal') : null, () => {
    for (const k of PAGE_KEYS) delete p[k];
    commit();
    openPageDlg();
  });
  updatePagePreview();
  $('#pageDlg').showModal();
}

const pageDraft = () => ({
  layout: pageF.layout.value,
  cols: clampInt(pageF.cols.value, 1, 12),
  rows: clampInt(pageF.rows.value, 1, 10),
  pattern: parsePattern(pageF.pattern.value).join(','),
});

// Dibujo de la pantalla con el tamaño elegido: un círculo por espacio, rellenos los ocupados.
function updatePagePreview() {
  const p = state.pages[current];
  const draft = { ...p, ...pageDraft(), items: p.items.map(it => ({ ...it })) };
  $$('#pageForm [data-lay]').forEach(n => { n.hidden = !n.dataset.lay.split(' ').includes(draft.layout); });
  const overflow = place(draft).length;
  const sp = slotSpec(draft), g = makeGrid(sp);
  for (const it of draft.items) { const [w, h] = sizeIn(it, sp); g.mark(it.x, it.y, w, h); }
  let cap = 0;
  $('#pagePreview').replaceChildren(...Array.from({ length: sp.rows }, (_, y) => el('div', {},
    Array.from({ length: sp.rowLen(y) }, (_, x) => { cap++; return el('i', { class: g.used[y * sp.cols + x] ? 'on' : null }); }))));
  $('#pageInfo').textContent = t('spacesInfo', cap, p.items.length) + (overflow ? ' · ' + t('willMove', overflow, current + 2) : '');
}

$('#pageForm').addEventListener('input', updatePagePreview);
$('#pageForm').addEventListener('submit', async e => {
  const v = e.submitter?.value;
  if (v !== 'ok' && v !== 'all') { pendingPageBg = null; return; }
  const d = pageDraft(), p = state.pages[current];
  if (pendingPageBg?.blob) {
    await Store.putPageBg(p.id, pendingPageBg.blob);
    p.bg = uid();
  } else if (pendingPageBg?.remove) {
    await Store.delPageBg(p.id).catch(() => {});
    delete p.bg;
  }
  pendingPageBg = null;
  if (v === 'all') {
    Object.assign(state.settings, { layout: d.layout, cols: d.cols, rows: d.rows, rowPattern: d.pattern });
    for (const q of state.pages) for (const k of PAGE_KEYS) delete q[k];
  } else {
    // Solo queda «personalizada» lo que difiere de Ajustes; igual a Ajustes = sigue a Ajustes.
    const s = state.settings, glob = { layout: s.layout, cols: s.cols, rows: s.rows, pattern: parsePattern(s.rowPattern).join(',') };
    for (const k of PAGE_KEYS) {
      if (d[k] === glob[k]) delete p[k];
      else p[k] = d[k];
    }
  }
  const name = pageF.name.value.trim();
  if (name) p.name = name;
  else delete p.name;
  commit();
});

$('#pageBgFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const c = await scaleImage(file, Math.round(Math.max(screen.width, screen.height) * Math.min(devicePixelRatio || 1, 2)));
  pendingPageBg = { blob: await new Promise(res => c.toBlob(res, 'image/webp', 0.86)) };
  $('#pageBgState').textContent = t('bgOnSave');
});

$('#pageBgRemove').addEventListener('click', () => {
  if (!state.pages[current].bg && !pendingPageBg?.blob) return;
  pendingPageBg = state.pages[current].bg ? { remove: true } : null;
  $('#pageBgState').textContent = pendingPageBg ? t('bgRemoveOnSave') : '';
});

// ---------- ajustes generales ----------
const setF = $('#setForm');

for (const k of Object.keys(SHAPES)) {
  const tile = el('span', { class: 'tile' });
  setVars(tile.style, shapeVars(k));
  $('#shapeChoices').append(el('label', { class: 'choice shape' }, el('input', { type: 'radio', name: 'shape', value: k }), tile, el('small', {}, t('shape_' + k))));
}

// ---------- selector de color reutilizable ----------
// Colores predefinidos (paleta de Tailwind CSS, la más usada en interfaces) + «Otro color…»,
// que abre la rueda de colores del sistema. Se aplica a todos los <input type="color"> de Ajustes.
const SWATCHES = [
  '#000000', '#030712', '#0f172a', '#1f2937', '#374151', '#6b7280', '#d1d5db', '#ffffff',
  '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

function colorPicker(input) {
  const box = el('div', { class: 'swatches', role: 'group' });
  const pick = hex => { input.value = hex; input.dispatchEvent(new Event('input', { bubbles: true })); syncSwatches(input); };
  for (const hex of SWATCHES) {
    box.append(el('button', { type: 'button', class: 'sw', style: { background: hex }, title: hex, 'aria-label': hex, dataset: { hex }, onclick: () => pick(hex) }));
  }
  box.append(el('button', { type: 'button', class: 'sw custom', title: t('customColor'), 'aria-label': t('customColor'),
    onclick: () => { try { input.showPicker(); } catch { input.click(); } } }));
  input.classList.add('cp-native');
  input.addEventListener('input', () => syncSwatches(input));
  input.after(box);
  input._swatches = box;
}

function syncSwatches(input) {
  const v = input.value.toLowerCase();
  let found = false;
  for (const b of input._swatches.querySelectorAll('.sw')) {
    const on = b.dataset.hex === v;
    found ||= on;
    b.classList.toggle('on', on);
  }
  const custom = input._swatches.querySelector('.custom');
  custom.classList.toggle('on', !found);
  custom.style.setProperty('--cur', v);
}

$$('#setForm input[type="color"]').forEach(colorPicker);

// Mientras se ajustan las flechas, la zona de clic se marca en la página (y el fondo del diálogo se aclara).
let peekTimer = null;
function peekZones() {
  document.body.classList.add('peek-zones');
  $('#settingsDlg').classList.add('peek');
  clearTimeout(peekTimer);
  peekTimer = setTimeout(() => {
    document.body.classList.remove('peek-zones');
    $('#settingsDlg').classList.remove('peek');
  }, 1500);
}

// Tabla legible de los sitios para buscar (la lista editable queda plegada debajo).
function renderKeysTable() {
  const keys = parseLines(state.settings.searchKeys).filter(k => k.url.includes('%s'));
  $('#keysTable').replaceChildren(keys.length
    ? el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, t('keysShortcut')), el('th', {}, t('keysSite')))),
        el('tbody', {}, keys.map(k => el('tr', {}, el('td', {}, el('kbd', {}, k.name)), el('td', {}, siteOf(k.url))))))
    : el('small', { class: 'hint' }, t('keysEmpty')));
}

// Selector de color individual para cada enlace de arriba a la derecha.
function renderTopLinksColors() {
  const box = $('#topLinksPerColor');
  if (!box) return;
  const s = state.settings;
  const links = parseLines(s.topLinks);
  box.hidden = !links.length;
  if (!links.length) { box.replaceChildren(); return; }
  const tColors = s.topLinksColors ||= {};
  box.replaceChildren(...links.map((l, i) => {
    const curColor = (tColors[i] || tColors[l.name] || s.topLinksColor || s.textColor || '#ffffff').toLowerCase();
    const inp = el('input', {
      type: 'color',
      value: curColor,
      oninput: () => {
        s.topLinksColors ||= {};
        s.topLinksColors[i] = inp.value;
        s.topLinksColors[l.name] = inp.value;
        commit(false);
      },
    });
    const lbl = el('label', {}, el('span', {}, t('topLinkColorFor', l.name)), inp);
    colorPicker(inp);
    syncSwatches(inp);
    return lbl;
  }));
}

function openSettings() {
  fillSettings();
  let tab = 'icons';
  try { tab = localStorage.getItem('ntp_tab') || tab; } catch {}
  showTab(tab);
  $('#settingsDlg').showModal();
}

function showTab(name) {
  if (!$(`#setForm [data-tabpanel="${name}"]`)) name = 'icons';
  $$('#setForm [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('#setForm [data-tabpanel]').forEach(p => { p.hidden = p.dataset.tabpanel !== name; });
  try { localStorage.setItem('ntp_tab', name); } catch {}
  if (name === 'data') renderBackups();
  if (name === 'gcards') syncGCardsUi();
}

$('#setForm .tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (b) showTab(b.dataset.tab);
});

function fillSettings() {
  for (const [k, v] of Object.entries(state.settings)) {
    const inp = setF.elements[k];
    if (!inp || inp.type === 'file') continue;
    if (inp.type === 'checkbox') inp.checked = !!v;
    else inp.value = v; // también sirve para grupos de radio (RadioNodeList)
    if (inp._swatches) syncSwatches(inp);
  }
  renderKeysTable();
  renderTopLinksColors();
  syncBgPresets();
  syncGCardsUi();
  syncNotes();
  syncSettingsUi();
}

// data-show="clave" (se ve si está activada) o data-show="clave:valor1 valor2"
function syncSettingsUi() {
  const s = state.settings;
  $$('[data-show]', setF).forEach(n => {
    const [key, vals] = n.dataset.show.split(':');
    n.hidden = vals ? !vals.split(' ').includes(String(s[key])) : !s[key];
  });
  $$('output[data-for]', setF).forEach(o => {
    o.textContent = Math.round(s[o.dataset.for] * (+o.dataset.scale || 1)) + o.dataset.unit;
  });
}

// Colores y tamaños se aplican en vivo ('input'); lo que reacomoda iconos entre pantallas
// solo al confirmar ('change'), para no mover todo mientras escribes un número.
function onSetting(e) {
  const tg = e.target;
  if (!tg.name || !(tg.name in DEFAULT_SETTINGS)) return;
  const structural = STRUCTURAL.has(tg.name);
  if (structural !== (e.type === 'change')) return;
  let v = tg.type === 'checkbox' ? tg.checked : (tg.type === 'number' || tg.type === 'range') ? Number(tg.value) : tg.value;
  if (tg.name === 'cols') v = clampInt(v, 1, 12);
  if (tg.name === 'rows') v = clampInt(v, 1, 10);
  state.settings[tg.name] = v;
  syncSettingsUi();
  if (['navZone', 'navZoneH', 'navSize'].includes(tg.name)) peekZones();
  if (tg.name === 'searchKeys') renderKeysTable();
  if (tg.name === 'topLinksColor') { state.settings.topLinksColors = {}; renderTopLinksColors(); }
  if (tg.name === 'topLinks') renderTopLinksColors();
  if (tg.name === 'bgRotate') {
    if (v && (!state.settings.bgPool || state.settings.bgPool.length < 2)) {
      state.settings.bgPool = [
        ...BG_PRESETS.map(([u]) => u),
        ...(state.settings.bgCustom || []).map(id => 'bgpool:' + id),
      ];
    }
    syncBgPresets();
    scheduleBgRotation();
  }
  if (tg.name === 'bgEvery') scheduleBgRotation();
  if (tg.name === 'showBookmarks' && v) refreshBookmarks();
  if (tg.name === 'folderStyle' && $('#folderDlg').open) $('#folderDlg').close();
  if (['xPages', 'xWidgets', 'clock24'].includes(tg.name)) commit(true);
  else commit(structural);
  syncNotes();
}

// ---------- mensajes «esto no cambiará…» ----------
// Avisan cuando algo personalizado (espacios o fondo de una pantalla, forma de un icono) no va a
// seguir a un ajuste general, con un botón para aplicarlo igual a todo.
function note(box, text, action, onAction) {
  box.hidden = !text;
  if (!text) return;
  box.replaceChildren(el('span', {}, text));
  if (action) box.append(el('button', { type: 'button', class: 'note-btn', onclick: onAction }, action));
}

// ¿La pantalla tiene configuración propia (disposición o espacios que se usen con su disposición)?
const ownCfg = pg => !!pg.layout || (pageCfg(pg).layout === 'rows' ? !!pg.pattern : !!(pg.cols || pg.rows));
const allItems = () => state.pages.flatMap(pg => pg.items.flatMap(it => it.type === 'folder' ? [it, ...it.items] : [it]));

function syncNotes() {
  const custom = state.pages.map((pg, i) => ownCfg(pg) && pageLabel(i)).filter(Boolean);
  note($('#spacesNote'), custom.length && t(custom.length === 1 ? 'noteSpaces1' : 'noteSpaces', custom.join(', ')), t('useOnAll'), () => {
    for (const pg of state.pages) for (const k of PAGE_KEYS) delete pg[k];
    commit();
    syncNotes();
    toast(t('appliedAllScreens'), true);
  });
  const shaped = allItems().filter(it => it.shape).length;
  note($('#shapeNote'), shaped && t(shaped === 1 ? 'noteShape1' : 'noteShape', shaped), t('removeOwnShapes'), () => {
    for (const it of allItems()) delete it.shape;
    commit();
    syncNotes();
    toast(t('appliedAllIcons'), true);
  });
  const withBg = state.settings.xPages ? state.pages.map((pg, i) => pg.bg && pageLabel(i)).filter(Boolean) : [];
  note($('#bgNote'), withBg.length && t(withBg.length === 1 ? 'noteBg1' : 'noteBg', withBg.join(', ')));
}
setF.addEventListener('input', onSetting);
setF.addEventListener('change', onSetting);

// Fondos predefinidos incluidos en el paquete (100 % Dominio Público NASA/NPS + Vectores 4K propios)
// + Fotos subidas por el usuario en IndexedDB ('bgpool:<id>') + Rotación automática optimizada.
const BG_PRESETS = [
  ['bg/cosmic-cliffs.webp', 'bg_cosmic_cliffs'],
  ['bg/pillars-creation.webp', 'bg_pillars_creation'],
  ['bg/earth-aurora.webp', 'bg_earth_aurora'],
  ['bg/grand-teton.webp', 'bg_grand_teton'],
  ['bg/grand-canyon.webp', 'bg_grand_canyon'],
  ['bg/olympic-coast.webp', 'bg_olympic_coast'],
  ['bg/redwood-forest.webp', 'bg_redwood_forest'],
  ['bg/rainier-meadow.webp', 'bg_rainier_meadow'],
  ['bg/autumn-tundra.webp', 'bg_autumn_tundra'],
  ['bg/milky-way-dunes.webp', 'bg_milky_way_dunes'],
  ['bg/starry-arch.webp', 'bg_starry_arch'],
  ['bg/great-wave.webp', 'bg_great_wave'],
  ['bg/aurora-peaks.svg', 'bg_aurora_peaks'],
  ['bg/sunset-dunes.svg', 'bg_sunset_dunes'],
  ['bg/ocean-waves.svg', 'bg_ocean_waves'],
  ['bg/misty-forest.svg', 'bg_misty_forest'],
  ['bg/cyber-city.svg', 'bg_cyber_city'],
  ['bg/sakura-lake.svg', 'bg_sakura_lake'],
];

const bgThumbUrls = new Map();
async function bgThumbUrl(id) {
  if (bgThumbUrls.has(id)) return bgThumbUrls.get(id);
  const blob = await Store.getFile('bgpool:' + id).catch(() => null);
  const url = blob ? URL.createObjectURL(blob) : '';
  if (url) bgThumbUrls.set(id, url);
  return url;
}

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

async function applyBgKey(key) {
  if (!key) {
    await Store.setBg('');
    state.settings.bgImage = '';
    commit(false);
    applyBg();
    syncBgPresets();
    return;
  }
  let dataOrUrl = key;
  if (key.startsWith('bgpool:')) {
    const blob = await Store.getFile(key).catch(() => null);
    if (!blob) return;
    dataOrUrl = await blobToDataUrl(blob);
  }
  // Pre-decodifica la imagen antes de cambiar el fondo para evitar cualquier parpadeo
  const pre = new Image();
  pre.src = dataOrUrl;
  await pre.decode().catch(() => {});
  await Store.setBg(dataOrUrl);
  state.settings.bgImage = key;
  try { localStorage.setItem('ntp_bg_rot_ts', String(Date.now())); } catch {}
  commit(false);
  applyBg();
  syncBgPresets();
}

function renderBgPresets() {
  const box = $('#bgPresets');
  if (!box || !state) return;
  const customIds = state.settings.bgCustom ||= [];

  const makeCard = (key, label, isCustom = false, customId = '') => {
    const img = el('img', { alt: label, loading: 'lazy', decoding: 'async' });
    if (isCustom) bgThumbUrl(customId).then(u => { if (u) img.src = u; });
    else img.src = key;

    const delBtn = isCustom && el('button', {
      type: 'button',
      class: 'ctrl bg-del',
      title: t('delete'),
      onclick: async e => {
        e.stopPropagation();
        await Store.delFile('bgpool:' + customId).catch(() => {});
        state.settings.bgCustom = (state.settings.bgCustom || []).filter(x => x !== customId);
        state.settings.bgPool = (state.settings.bgPool || []).filter(x => x !== key);
        if (state.settings.bgImage === key) {
          const next = state.settings.bgPool[0] || '';
          await applyBgKey(next);
        }
        commit(false);
        renderBgPresets();
      },
    }, '✕');

    return el('button', {
      type: 'button',
      class: 'bg-card',
      dataset: { bg: key },
      title: label,
      onclick: async () => {
        const s = state.settings;
        if (s.bgRotate) {
          const pool = s.bgPool ||= [];
          const idx = pool.indexOf(key);
          if (idx >= 0) pool.splice(idx, 1);
          else pool.push(key);
          if (idx < 0 && s.bgImage !== key) await applyBgKey(key);
          else { commit(false); syncBgPresets(); }
        } else {
          const off = s.bgImage === key || Store.getBg() === key;
          await applyBgKey(off ? '' : key);
        }
      },
    },
      img,
      el('i', { class: 'bg-check' }, '✓'),
      delBtn,
      el('span', {}, label)
    );
  };

  const cards = [
    ...BG_PRESETS.map(([url, labelKey]) => makeCard(url, t(labelKey), false)),
    ...customIds.map((id, i) => makeCard('bgpool:' + id, t('bgMyPhoto', i + 1), true, id)),
  ];
  box.replaceChildren(...cards);
  syncBgPresets();
}

function syncBgPresets() {
  const box = $('#bgPresets');
  if (!box || !state) return;
  const s = state.settings;
  const expectedCount = BG_PRESETS.length + (s.bgCustom?.length || 0);
  if (box.children.length !== expectedCount) return renderBgPresets();
  const curKey = s.bgImage || Store.getBg();
  const pool = new Set(s.bgPool || []);
  box.classList.toggle('rot-mode', !!s.bgRotate);
  $$('#bgPresets .bg-card').forEach(b => {
    const key = b.dataset.bg;
    const isCur = key === curKey;
    const inPool = s.bgRotate ? pool.has(key) : isCur;
    b.classList.toggle('on', isCur);
    b.classList.toggle('in-pool', inPool);
    b.setAttribute('aria-pressed', inPool ? 'true' : 'false');
  });
}

let bgRotTimer = null;
async function advanceBgRotation(force = false) {
  const s = state.settings;
  if (!s.bgRotate) return;
  const pool = (s.bgPool || []).filter(Boolean);
  if (pool.length < 2) return;
  const everyMs = Number(s.bgEvery || 0) * 1000;
  const lastTs = Number(localStorage.getItem('ntp_bg_rot_ts') || 0);
  if (!force && everyMs > 0 && Date.now() - lastTs < everyMs) return;
  const curIdx = pool.indexOf(s.bgImage);
  const nextKey = pool[(curIdx + 1) % pool.length];
  await applyBgKey(nextKey);
}

function scheduleBgRotation() {
  clearInterval(bgRotTimer);
  const s = state.settings;
  if (!s.bgRotate || !s.bgEvery || Number(s.bgEvery) <= 0) return;
  const ms = Math.max(5000, Number(s.bgEvery) * 1000);
  bgRotTimer = setInterval(() => {
    if (!document.hidden) advanceBgRotation(true);
  }, ms);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.settings.bgRotate && Number(state.settings.bgEvery) > 0) {
    advanceBgRotation(false);
  }
});

$('#bgSelectAll')?.addEventListener('click', () => {
  const allKeys = [
    ...BG_PRESETS.map(([u]) => u),
    ...(state.settings.bgCustom || []).map(id => 'bgpool:' + id),
  ];
  const pool = state.settings.bgPool || [];
  state.settings.bgPool = pool.length >= allKeys.length ? (state.settings.bgImage ? [state.settings.bgImage] : []) : allKeys;
  commit(false);
  syncBgPresets();
});

$('#bgNextNow')?.addEventListener('click', () => advanceBgRotation(true));

// ---------- pestaña «Drive y Calendar» ----------
const hasWidgetKind = kind => state.pages.some(p => p.items.some(it => it.type === 'widget' && it.kind === kind));

async function syncGCardsUi() {
  if (!$('#addGDriveCard')) return;
  const hasDrive = hasWidgetKind('gdrive');
  const hasCal = hasWidgetKind('gcal');
  $('#gDriveStatus').textContent = t(hasDrive ? 'gStatusOnScreen' : 'gStatusNotAdded');
  $('#gDriveStatus').classList.toggle('on', hasDrive);
  $('#gCalStatus').textContent = t(hasCal ? 'gStatusOnScreen' : 'gStatusNotAdded');
  $('#gCalStatus').classList.toggle('on', hasCal);

  const calIcs = !!state.settings.gCalIcsUrl || readJsonCache(GCAL_CACHE_KEY, []).length > 0;
  const cBadge = $('#gCalIcsBadge');
  if (cBadge) {
    cBadge.textContent = t(calIcs ? 'gBadgeActive' : 'gBadgePending');
    cBadge.classList.toggle('on', calIcs);
  }
  if ($('#gCalClearBtn')) $('#gCalClearBtn').hidden = !calIcs;
}

$('#addGDriveCard')?.addEventListener('click', async () => {
  state.settings.xWidgets = true;
  if (!await hasHistPerm()) {
    await chrome.permissions.request({ permissions: ['history'] }).catch(() => false);
  }
  await scanDriveHistory();
  if (!hasWidgetKind('gdrive')) addItem(newWidget('gdrive'));
  else commit();
  fillSettings();
  toast(t('gCardAddedToast'), true);
});

$('#gDriveRefreshBtn')?.addEventListener('click', async () => {
  if (!await hasHistPerm()) {
    const ok = await chrome.permissions.request({ permissions: ['history'] }).catch(() => false);
    if (!ok) return toast(t('gPermDenied'));
  }
  const list = await scanDriveHistory();
  syncGCardsUi();
  toast(t('gDriveUpdated', list?.length || 0));
});

$('#addGCalCard')?.addEventListener('click', () => {
  state.settings.xWidgets = true;
  if (!hasWidgetKind('gcal')) addItem(newWidget('gcal'));
  else commit();
  fillSettings();
  toast(t('gCardAddedToast'), true);
});

$('#gCalSyncIcsBtn')?.addEventListener('click', async () => {
  const raw = setF.elements.gCalIcsUrl?.value.trim() || '';
  const url = normalizeIcsInput(raw);
  if (setF.elements.gCalIcsUrl && url) setF.elements.gCalIcsUrl.value = url;
  state.settings.gCalIcsUrl = url;
  Store.save(state);
  const events = await syncCalendarIcs(url, true);
  if (events) {
    state.settings.xWidgets = true;
    if (!hasWidgetKind('gcal')) addItem(newWidget('gcal'));
    else commit();
    fillSettings();
    toast(t('gIcsSynced', events.length));
  } else {
    syncGCardsUi();
    ask(t('gIcsError'), { cancel: null });
  }
});

$('#gCalIcsFile')?.addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const text = await readIcsOrZipFile(file);
  if (!text.includes('BEGIN:VCALENDAR')) return ask(t('gIcsError'), { cancel: null });
  const events = parseIcsText(text);
  writeJsonCache(GCAL_CACHE_KEY, events);
  state.settings.xWidgets = true;
  if (!hasWidgetKind('gcal')) addItem(newWidget('gcal'));
  else repaintGCalCards();
  fillSettings();
  toast(t('gIcsSynced', events.length));
});

$('#gCalClearBtn')?.addEventListener('click', () => {
  state.settings.gCalIcsUrl = '';
  if (setF.elements.gCalIcsUrl) setF.elements.gCalIcsUrl.value = '';
  try { localStorage.removeItem(GCAL_CACHE_KEY); } catch {}
  Store.save(state);
  repaintGCalCards();
  syncGCardsUi();
  toast(t('gIcsCleared'));
});

// Fondo general: escalado al tamaño de tu pantalla y comprimido (carga y decodifica mucho más rápido).
async function imageToDataUrl(file) {
  const c = await scaleImage(file, Math.round(Math.max(screen.width, screen.height) * Math.min(devicePixelRatio || 1, 2)));
  let q = 0.86, url;
  do { url = c.toDataURL('image/webp', q); q -= 0.12; } while (url.length > 3_500_000 && q > 0.3);
  return url;
}

$('#bgFile').addEventListener('change', async e => {
  const files = [...(e.target.files || [])].slice(0, 20);
  e.target.value = '';
  if (!files.length) return;
  try {
    const maxDim = Math.round(Math.max(screen.width, screen.height) * Math.min(devicePixelRatio || 1, 2));
    let lastKey = '';
    for (const file of files) {
      const c = await scaleImage(file, maxDim);
      const blob = await new Promise(res => c.toBlob(res, 'image/webp', 0.85));
      const id = uid();
      await Store.putFile('bgpool:' + id, blob);
      (state.settings.bgCustom ||= []).push(id);
      lastKey = 'bgpool:' + id;
      if (state.settings.bgRotate) (state.settings.bgPool ||= []).push(lastKey);
    }
    if (files.length > 1 && !state.settings.bgRotate) {
      state.settings.bgRotate = true;
      state.settings.bgPool = (state.settings.bgCustom || []).map(id => 'bgpool:' + id);
      if (setF.elements.bgRotate) setF.elements.bgRotate.checked = true;
      syncSettingsUi();
      scheduleBgRotation();
    }
    await applyBgKey(lastKey);
    renderBgPresets();
  } catch {
    ask(t('bgTooBig'), { cancel: null });
  }
});

$('#bgRemove').addEventListener('click', async () => {
  state.settings.bgRotate = false;
  if (setF.elements.bgRotate) setF.elements.bgRotate.checked = false;
  syncSettingsUi();
  scheduleBgRotation();
  await applyBgKey('');
});

$('#importTop').addEventListener('click', async () => {
  const sites = await topSitesNotIn(new Set(allLinks().map(l => keyOf(l.url))));
  state.pages[current].items.push(...sites);
  commit();
  toast(sites.length ? t('addedN', sites.length) : t('haveAllTop'), !!sites.length);
});

$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: t('backupFile') + '.json' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

function loadState(data) {
  const incomingBg = data.settings?.bgImage;
  const isPreset = typeof incomingBg === 'string' && incomingBg.startsWith('bg/');
  if (isPreset) Store.setBg(incomingBg);
  state = normalize({ ...data, v: data.v || 3, seeded: true, welcomed: true, settings: { ...data.settings, bgImage: isPreset ? incomingBg : state.settings.bgImage } });
  migrate();
  current = 0;
  commit();
  applyBg();
  fillSettings();
}

$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.pages)) throw new Error(t('noScreens'));
    loadState(data);
    toast(t('imported'), true);
  } catch (err) {
    ask(t('badBackup', err.message), { cancel: null });
  }
});

async function renderBackups() {
  const list = await Store.getBackups();
  const fmt = new Intl.DateTimeFormat(LANG, { dateStyle: 'medium', timeStyle: 'short' });
  $('#backupList').replaceChildren(...(list.length ? list.map(b => el('div', { class: 'brow' },
    el('span', {}, fmt.format(b.t)),
    el('small', {}, t('backupCount', b.state.pages?.length || 0, b.state.pages?.reduce((n, p) => n + p.items.length, 0) || 0)),
    el('button', { type: 'button', class: 'btn', onclick: async () => {
      if (!await ask(t('restoreAsk', fmt.format(b.t)), { ok: t('restore') })) return;
      loadState(b.state);
      toast(t('restored'), true);
    } }, t('restore')))) : [el('small', { class: 'hint' }, t('noBackups'))]));
}

$('#backupNow').addEventListener('click', async () => {
  await Store.addBackup(state, true);
  renderBackups();
  toast(t('backupDone'));
});

$('#resetBtn').addEventListener('click', async () => {
  if (!await ask(t('resetAsk'), { ok: t('reset'), danger: true })) return;
  await Store.setBg('');
  try {
    ['ntp_gdrive_cache', 'ntp_gdrive_hidden', 'ntp_gcal_cache', 'ntp_bg_rot_ts'].forEach(k => localStorage.removeItem(k));
  } catch {}
  Store.fileKeys().then(keys => {
    for (const k of keys) if (String(k).startsWith('bgpool:') || String(k).startsWith('photo:')) Store.delFile(k);
  }).catch(() => {});
  state = Store.defaultState();
  state.pages[0].items = await freshItems();
  state.seeded = state.welcomed = true;
  delete state.fresh;
  current = 0;
  scheduleBgRotation();
  commit();
  fillSettings();
  renderBgPresets();
  applyBg();
  toast(t('resetDone'), true);
});

// ---------- barra de edición ----------
$('#editBtn').addEventListener('click', () => setEditing(!editing));
$('#toolbar').addEventListener('click', async e => {
  const b = e.target.closest('button');
  const act = b?.dataset.act;
  if (act === 'undo') undo();
  else if (act === 'add-link') openEditor(null, 'link');
  else if (act === 'add-folder') openEditor(null, 'folder');
  else if (act === 'add-widget') openMenu(Object.keys(WIDGETS).map(k => entryEl({ label: `${WIDGETS[k].icon}  ${t('w_' + k)}`, act: () => addItem(newWidget(k)) })), b);
  else if (act === 'page') openPageDlg();
  else if (act === 'add-page') {
    if (!await ask(t('newScreenAsk', state.pages.length + 1), { ok: t('create') })) return;
    state.pages.push(copyCfg(state.pages[current], newPage()));
    current = state.pages.length - 1;
    commit();
  } else if (act === 'del-page') {
    const p = state.pages[current];
    if (state.pages.length < 2) return ask(t('keepOneScreen'), { cancel: null });
    const msg = p.items.length ? t('delScreenItemsAsk', pageLabel(current), p.items.length) : t('delScreenAsk', pageLabel(current));
    if (!await ask(msg, { ok: t('delete'), danger: true })) return;
    state.pages.splice(current, 1);
    current = Math.max(0, current - 1);
    commit();
    toast(t('screenDeleted'), true);
  } else if (act === 'settings') openSettings();
  else if (act === 'done') setEditing(false);
});

// ---------- buscador ----------
// Por política de la Chrome Web Store, la búsqueda usa SIEMPRE el buscador predeterminado de Chrome
// (chrome.search). Con el extra "Buscador avanzado" se puede elegir otro solo para la búsqueda actual,
// con el menú ⌄ o con un atajo ("yt gatos"); después vuelve al de Chrome.
let keysSrc = null, keysCache = [], oneShot = null;

function searchKeys() {
  const src = state.settings.searchKeys;
  if (keysSrc !== src) { keysSrc = src; keysCache = parseLines(src).filter(k => k.url.includes('%s')); }
  return keysCache;
}

function searchKey(q) {
  if (!state.settings.xSearch) return null;
  const m = q.match(/^(\S+)\s+(.+)$/);
  const k = m && searchKeys().find(x => x.name.toLowerCase() === m[1].toLowerCase());
  return k ? { url: k.url, rest: m[2] } : null;
}

function setOneShot(k) {
  oneShot = k;
  const b = $('#engineBtn');
  b.textContent = k ? siteOf(k.url) + ' ✕' : '⌄';
  b.classList.toggle('picked', !!k);
  b.title = k ? t('engineBack') : t('engineChoose');
  b.setAttribute('aria-label', b.title);
}
setOneShot(null);

$('#engineBtn').addEventListener('click', e => {
  if (oneShot) return setOneShot(null);
  openMenu([
    entryEl({ label: t('engineChrome'), checked: true, act: () => setOneShot(null) }),
    entryEl('-'),
    ...searchKeys().map(k => entryEl({ label: `${siteOf(k.url)}  ·  ${k.name}`, act: () => { setOneShot(k); $('#q').focus(); } })),
  ], e.currentTarget);
});

$('#q').addEventListener('input', () => {
  const k = searchKey($('#q').value);
  $('#qhint').textContent = k ? '→ ' + siteOf(k.url) : '';
  $('#qhint').hidden = !k;
});

$('#search').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (!q) return;
  const k = searchKey(q);
  if (k) location.href = k.url.replace('%s', encodeURIComponent(k.rest));
  else if (looksLikeUrl(q)) location.href = normUrl(q);
  else if (oneShot && state.settings.xSearch) {
    const url = oneShot.url.replace('%s', encodeURIComponent(q));
    setOneShot(null);
    location.href = url;
  } else chrome.search.query({ text: q, disposition: 'CURRENT_TAB' }); // buscador predeterminado de Chrome
});

// ---------- bienvenida (solo la primera vez) ----------
function showWelcome() {
  $('#welcome').hidden = false;
  $('#welcomeOk').focus();
}
$('#welcomeOk').addEventListener('click', () => {
  $('#welcome').hidden = true;
  state.welcomed = true;
  Store.save(state);
});
