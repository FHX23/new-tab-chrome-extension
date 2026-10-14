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

function openFolder(id) {
  openFolderId = id;
  renderFolder();
  const dlg = $('#folderDlg');
  if (!dlg.open) dlg.showModal();
}

function renderFolder() {
  const f = locate(openFolderId)?.item;
  if (!f) return $('#folderDlg').close();
  const name = $('#folderName');
  if (document.activeElement !== name) name.value = f.title || '';
  name.readOnly = !editing;
  $('#folderDlg').classList.toggle('editing', editing);
  $('#folderBody').replaceChildren(buildFolderContainer(f.items, f.id));
}

$('#folderName').addEventListener('input', e => {
  const f = locate(openFolderId)?.item;
  if (f) { f.title = e.target.value; Store.save(state); }
});
$('#folderClose').addEventListener('click', () => $('#folderDlg').close());
$('#folderAdd').addEventListener('click', () => openEditor(null, 'link'));
$('#folderDlg').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$('#folderDlg').addEventListener('close', () => {
  openFolderId = null;
  pruneFolders();
  commit();
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
  $$('#editForm [data-for="link"]').forEach(n => { n.hidden = editType !== 'link'; });
  $$('#editForm [data-for="size"]').forEach(n => { n.hidden = inFolder || state.settings.layout !== 'grid'; });
  updatePreview();
  $('#editDlg').showModal();
  (editType === 'link' && !it ? editF.url : editF.title).focus();
}

const currentIcon = () => (pendingIcon === undefined ? locate(editId)?.item.icon : pendingIcon);

function updatePreview() {
  const p = $('#iconPreview');
  setVars(p.style, shapeVars(editF.shape.value || state.settings.shape));
  const icon = currentIcon(), glyph = editF.glyph.value.trim(), url = editF.url.value.trim();
  p.replaceChildren(icon ? el('img', { src: icon, alt: '', class: 'custom' })
    : glyph ? el('span', { class: 'glyph' }, glyph)
    : url ? favImg(normUrl(url), 64, false) : '');
}

editF.url.addEventListener('change', updatePreview);
editF.glyph.addEventListener('input', updatePreview);
editF.shape.addEventListener('change', updatePreview);

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

function openPageDlg() {
  const p = state.pages[current], cfg = pageCfg(p);
  $('#pageNum').textContent = current + 1;
  pageF.cols.value = cfg.cols;
  pageF.rows.value = cfg.rows;
  pageF.pattern.value = cfg.pattern.join(',');
  pageF.name.value = p.name || '';
  $$('#pageForm [data-lay]').forEach(n => { n.hidden = !n.dataset.lay.split(' ').includes(state.settings.layout); });
  $('#pageBgState').textContent = p.bg ? t('hasOwnBg') : '';
  updatePagePreview();
  $('#pageDlg').showModal();
}

const pageDraft = () => ({
  cols: clampInt(pageF.cols.value, 1, 12),
  rows: clampInt(pageF.rows.value, 1, 10),
  pattern: parsePattern(pageF.pattern.value).join(','),
});

// Dibujo de la pantalla con el tamaño elegido: un círculo por espacio, rellenos los ocupados.
function updatePagePreview() {
  const p = state.pages[current];
  const draft = { ...p, ...pageDraft(), items: p.items.map(it => ({ ...it })) };
  const overflow = place(draft).length;
  const sp = slotSpec(draft), g = makeGrid(sp);
  for (const it of draft.items) { const [w, h] = sizeIn(it, sp); g.mark(it.x, it.y, w, h); }
  let cap = 0;
  $('#pagePreview').replaceChildren(...Array.from({ length: sp.rows }, (_, y) => el('div', {},
    Array.from({ length: sp.rowLen(y) }, (_, x) => { cap++; return el('i', { class: g.used[y * sp.cols + x] ? 'on' : null }); }))));
  $('#pageInfo').textContent = t('spacesInfo', cap, p.items.length) + (overflow ? ' · ' + t('willMove', overflow, current + 2) : '');
}

$('#pageForm').addEventListener('input', updatePagePreview);
$('#pageForm').addEventListener('submit', e => {
  const v = e.submitter?.value;
  if (v !== 'ok' && v !== 'all') return;
  const d = pageDraft(), p = state.pages[current];
  if (v === 'all') {
    Object.assign(state.settings, { cols: d.cols, rows: d.rows, rowPattern: d.pattern });
    for (const q of state.pages) { delete q.cols; delete q.rows; delete q.pattern; }
  } else Object.assign(p, d);
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
  const blob = await new Promise(res => c.toBlob(res, 'image/webp', 0.86));
  const p = state.pages[current];
  await Store.putPageBg(p.id, blob);
  p.bg = uid();
  $('#pageBgState').textContent = t('hasOwnBg');
  commit();
});

$('#pageBgRemove').addEventListener('click', async () => {
  const p = state.pages[current];
  if (!p.bg) return;
  await Store.delPageBg(p.id).catch(() => {});
  delete p.bg;
  $('#pageBgState').textContent = '';
  commit();
});

// ---------- ajustes generales ----------
const setF = $('#setForm');

for (const k of Object.keys(SHAPES)) {
  const tile = el('span', { class: 'tile' });
  setVars(tile.style, shapeVars(k));
  $('#shapeChoices').append(el('label', { class: 'choice shape' }, el('input', { type: 'radio', name: 'shape', value: k }), tile, el('small', {}, t('shape_' + k))));
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
  }
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
  if (tg.name === 'showBookmarks' && v) refreshBookmarks();
  if (['xPages', 'xWidgets', 'clock24'].includes(tg.name)) return commit(true);
  commit(structural);
}
setF.addEventListener('input', onSetting);
setF.addEventListener('change', onSetting);

// Fondo general: escalado al tamaño de tu pantalla y comprimido (carga y decodifica mucho más rápido).
async function imageToDataUrl(file) {
  const c = await scaleImage(file, Math.round(Math.max(screen.width, screen.height) * Math.min(devicePixelRatio || 1, 2)));
  let q = 0.86, url;
  do { url = c.toDataURL('image/webp', q); q -= 0.12; } while (url.length > 3_500_000 && q > 0.3);
  return url;
}

$('#bgFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    await Store.setBg(await imageToDataUrl(file));
    state.settings.bgImage = '1';
    commit(false);
    applyBg();
  } catch {
    ask(t('bgTooBig'), { cancel: null });
  }
});

$('#bgRemove').addEventListener('click', async () => {
  await Store.setBg('');
  state.settings.bgImage = '';
  commit(false);
  applyBg();
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
  state = normalize({ ...data, v: data.v || 3, seeded: true, welcomed: true, settings: { ...data.settings, bgImage: state.settings.bgImage } });
  migrate();
  current = 0;
  commit();
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
  state = Store.defaultState();
  state.pages[0].items = await freshItems();
  state.seeded = state.welcomed = true;
  delete state.fresh;
  current = 0;
  commit();
  fillSettings();
  applyBg();
  toast(t('resetDone'), true);
});

// ---------- barra de edición ----------
$('#editBtn').addEventListener('click', () => setEditing(!editing));
$('#toolbar').addEventListener('click', async e => {
  const b = e.target.closest('button');
  const act = b?.dataset.act;
  if (act === 'add-link') openEditor(null, 'link');
  else if (act === 'add-folder') openEditor(null, 'folder');
  else if (act === 'add-widget') openMenu(Object.keys(WIDGETS).map(k => entryEl({ label: t('w_' + k), act: () => addItem(newWidget(k)) })), b);
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
  b.textContent = k ? hostOf(k.url) + ' ✕' : '⌄';
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
    ...searchKeys().map(k => entryEl({ label: `${hostOf(k.url)}  ·  ${k.name}`, act: () => { setOneShot(k); $('#q').focus(); } })),
  ], e.currentTarget);
});

$('#q').addEventListener('input', () => {
  const k = searchKey($('#q').value);
  $('#qhint').textContent = k ? '→ ' + hostOf(k.url) : '';
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
