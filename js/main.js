'use strict';
// Arranque: idioma, migraciones, primer dibujo (antes del primer frame) y tareas en segundo plano.

// Ajusta estados de versiones anteriores.
function migrate() {
  const s = state.settings;
  if ((state.v || 0) < 4) migrateV4(s);
  // v5: la búsqueda vuelve siempre al buscador de Chrome (política de la tienda): sin selector permanente
  if (state.v < 5) { delete s.engine; delete s.engineUrl; state.v = 5; }
  // v6: se quitó el ícono de pestaña personalizado (Chrome siempre mostraba un instante el de la extensión)
  if (state.v < 6) {
    delete s.tabIcon;
    delete s.tabIconData;
    try { localStorage.removeItem('ntp_tabicon'); } catch {}
    state.v = 6;
  }
  // v7: se quitó el widget de frase del día
  if (state.v < 7) {
    for (const p of state.pages) p.items = p.items.filter(it => it.kind !== 'quote');
    state.v = 7;
  }
}

function migrateV4(s) {
  // v3: títulos de pestaña largos → nombres cortos
  if (!state.v3) for (const l of allLinks()) if (/\s[-|•·–—]\s|\(\d/.test(l.title || '')) l.title = cleanTitle(l.title, l.url);
  // v4: colocación libre. Cada icono se queda donde estaba en el orden anterior y los "Espacio" dejan su hueco.
  reflow();
  for (const p of state.pages) p.items = p.items.filter(it => it.type !== 'spacer');
  // v4: los enlaces de arriba a la derecha ahora son editables
  if (s.showTopLinks !== false && !s.topLinks) s.topLinks = `Gmail = https://mail.google.com/mail/\n${t('images')} = https://www.google.com/imghp`;
  delete s.showTopLinks;
  delete state.v3;
  state.v = 4;
}

// Instalación nueva: tus sitios más visitados; si son pocos, se completan con algunos conocidos.
async function freshItems() {
  const have = new Set();
  const items = await topSitesNotIn(have);
  for (const [title, url] of Store.DEFAULT_LINKS) {
    if (items.length >= 10) break;
    if (have.has(keyOf(url))) continue;
    have.add(keyOf(url));
    items.push({ id: uid(), type: 'link', title, url, w: 1, h: 1 });
  }
  return items;
}

async function restoreBackground() {
  let url = await Store.restoreBg();
  if (!url) { // versión 0.1: la imagen estaba en IndexedDB
    const blob = await Store.getOldBg().catch(() => null);
    if (blob) {
      url = await imageToDataUrl(blob);
      await Store.setBg(url).catch(() => {});
    }
  }
  applyBg();
}

// ---------- primer dibujo (síncrono) ----------
applyI18n();
const cached = Store.readCache();
state = cached || Store.defaultState();
migrate();
reflow();
if (state.settings.showBookmarks) loadBmCache();
renderAll();
renderBookmarks();
lastJson = snap();

// ---------- lo que no es urgente va después de la carga, cuando el navegador está libre ----------
// Chrome procesa el ícono de la pestaña justo al terminar la carga; si en ese momento la página está
// ocupada (marcadores, copia automática, limpieza de fotos…), el ícono de la extensión se ve más tiempo.
function whenIdleAfterLoad(fn) {
  const go = () => setTimeout(() => requestIdleCallback(fn, { timeout: 1000 }), 250);
  if (document.readyState === 'complete') go();
  else addEventListener('load', go, { once: true });
}

whenIdleAfterLoad(async () => {
  if (!cached) {
    const durable = await Store.loadDurable();
    if (durable) { state = durable; migrate(); reflow(); Store.save(state); renderAll(); }
  }
  if (state.fresh) {
    state.pages[0].items = await freshItems();
    delete state.fresh;
    state.seeded = true;
    commit();
  } else if (!state.seeded) {
    state.seeded = true;
    state.pages[0].items.push(...await topSitesNotIn(new Set(allLinks().map(l => keyOf(l.url)))));
    commit();
  }
  undoStack.length = 0;
  lastJson = snap();
  if (state.settings.bgImage && !Store.getBg()) restoreBackground();
  if (state.settings.showBookmarks) refreshBookmarks();
  for (const ev of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered']) {
    chrome.bookmarks[ev].addListener(() => { if (state.settings.showBookmarks) refreshBookmarks(); });
  }
  if (!state.welcomed) showWelcome();
  Store.addBackup(state).catch(() => {});
  // Fotos de widgets eliminados: se borran de IndexedDB.
  // Se conservan las que usa el estado actual o alguna copia automática (para poder restaurarlas).
  Promise.all([Store.fileKeys(), Store.getBackups()]).then(([keys, backups]) => {
    const photosOf = s => (s?.pages || []).flatMap(p => p.items || []).flatMap(it => it.photos || []);
    const used = new Set([state, ...backups.map(b => b.state)].flatMap(photosOf).map(id => 'photo:' + id));
    for (const k of keys) if (String(k).startsWith('photo:') && !used.has(k)) Store.delFile(k);
  }).catch(() => {});
});

Store.onExternalChange(next => {
  if (drag) return; // no interrumpir un arrastre; se sincroniza en el próximo cambio
  state = next;
  lastJson = snap();
  current = Math.min(current, state.pages.length - 1);
  renderAll();
});
addEventListener('storage', e => { if (e.key === Store.BG) applyBg(); });
addEventListener('pagehide', Store.flush);
