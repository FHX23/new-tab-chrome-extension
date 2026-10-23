'use strict';
// Persistencia.
// - localStorage: copia rápida. Se lee de forma síncrona, así la página se pinta completa al instante.
// - chrome.storage.local: copia duradera de respaldo y copias automáticas.
// - IndexedDB: fondos propios de cada pantalla (imágenes pesadas).
const Store = (() => {
  const KEY = 'ntp_state_v1';
  const BG = 'ntp_bgimg';
  const BACKUPS = 'ntp_backups';

  const uid = () => Math.random().toString(36).slice(2, 10);

  const hour12 = /h1[12]/.test(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle || '');

  const DEFAULT_SETTINGS = {
    layout: 'grid',       // 'grid' | 'rows' | 'list'
    cols: 5,              // espacios por defecto de cada pantalla (cada una puede tener los suyos)
    rows: 3,
    rowPattern: '3,4',
    cell: 112,
    icon: 48,
    shape: 'circle',
    folderStyle: 'panel', // 'panel' (centrada, como iPhone) | 'bubble' (junto a la carpeta) | 'screen' (como una pantalla)
    showLabels: true,
    showLogo: true,
    logoText: '',         // vacío = nombre neutro según idioma
    logoColor: false,
    showSearch: true,
    topLinks: '',         // "Nombre = URL", uno por línea
    bgColor: '#202124',
    bgImage: '',          // '1' si hay imagen de fondo guardada
    bgDim: 0.15,
    textColor: '#ffffff',
    tileColor: '#35363a',
    tileTr: 0,            // transparencia 0–100 %
    panelTheme: 'auto',   // 'auto' | 'dark' | 'light'
    showArrows: true,
    navSize: 44,
    navZone: 96,          // ancho de la zona de clic de cada flecha (px)
    navZoneH: 60,         // alto de la zona de clic (% del área de iconos)
    navBg: '#000000',
    navBgTr: 65,
    navFg: '#ffffff',
    navFgTr: 0,
    showBookmarks: true,
    bmBg: '#000000',
    bmTr: 75,
    longPress: true,      // mantener presionado un icono entra al modo edición
    wiggle: true,
    // Extras: vienen apagados para que la página quede simple.
    xWidgets: false,
    clock24: !hour12,
    xPages: false,
    xSearch: false,
    searchKeys: [
      'yt = https://www.youtube.com/results?search_query=%s',
      'w = https://www.wikipedia.org/search-redirect.php?search=%s',
      'g = https://www.google.com/search?q=%s',
      'd = https://duckduckgo.com/?q=%s',
      'gh = https://github.com/search?q=%s',
      'm = https://www.google.com/maps/search/%s',
    ].join('\n'),
  };

  const link = (title, url) => ({ id: uid(), type: 'link', title, url, w: 1, h: 1 });
  const newPage = () => ({ id: uid(), items: [] });

  const DEFAULT_LINKS = [
    ['Gmail', 'https://mail.google.com/'], ['YouTube', 'https://www.youtube.com/'], ['GitHub', 'https://github.com/'],
    ['Claude', 'https://claude.ai/'], ['ChatGPT', 'https://chatgpt.com/'], ['Gemini', 'https://gemini.google.com/'],
    ['Drive', 'https://drive.google.com/'], ['Maps', 'https://maps.google.com/'], ['Wikipedia', 'https://www.wikipedia.org/'],
    ['Reddit', 'https://www.reddit.com/'],
  ];

  function defaultState() {
    return {
      v: 6,
      fresh: true,        // instalación nueva: al iniciar se reemplaza por tus sitios más visitados
      settings: { ...DEFAULT_SETTINGS },
      pages: [{ id: uid(), items: DEFAULT_LINKS.map(([t, u]) => link(t, u)) }],
    };
  }

  // Asegura ids y campos mínimos (estado antiguo o respaldo importado).
  function normalize(s) {
    const fix = it => {
      it.id ||= uid();
      it.w ||= 1;
      it.h ||= 1;
      if (it.type === 'folder') it.items = (it.items || []).filter(c => c.type === 'link').map(fix);
      return it;
    };
    return {
      ...s,
      settings: { ...DEFAULT_SETTINGS, ...s.settings },
      pages: (s.pages?.length ? s.pages : [newPage()]).map(p => ({ ...p, id: p.id || uid(), items: (p.items || []).map(fix) })),
    };
  }

  function readCache() {
    try {
      const s = localStorage.getItem(KEY);
      return s ? normalize(JSON.parse(s)) : null;
    } catch { return null; }
  }

  async function loadDurable() {
    const { [KEY]: s } = await chrome.storage.local.get(KEY);
    return s ? normalize(s) : null;
  }

  let timer = null, pending = null;

  function save(state) {
    pending = state;
    clearTimeout(timer);
    timer = setTimeout(flush, 150);
  }

  function flush() {
    if (!pending) return;
    clearTimeout(timer);
    pending.rev = uid();
    try { localStorage.setItem(KEY, JSON.stringify(pending)); } catch {}
    chrome.storage.local.set({ [KEY]: pending });
    pending = null;
  }

  // El evento 'storage' llega a las OTRAS pestañas abiertas cuando una guarda.
  function onExternalChange(cb) {
    addEventListener('storage', e => {
      if (e.key === KEY && e.newValue) try { cb(normalize(JSON.parse(e.newValue))); } catch {}
    });
  }

  // ---- fondo general (data URL en localStorage para pintarlo antes del primer frame) ----
  const getBg = () => { try { return localStorage.getItem(BG) || ''; } catch { return ''; } };

  async function setBg(dataUrl) {
    if (dataUrl) localStorage.setItem(BG, dataUrl); // lanza error si no cabe
    else localStorage.removeItem(BG);
    await chrome.storage.local.set({ [BG]: dataUrl || '' });
  }

  async function restoreBg() {
    const { [BG]: url } = await chrome.storage.local.get(BG);
    if (url) try { localStorage.setItem(BG, url); } catch {}
    return url || '';
  }

  // ---- copias automáticas (una por día, se guardan las últimas 7) ----
  async function getBackups() {
    const { [BACKUPS]: list } = await chrome.storage.local.get(BACKUPS);
    return list || [];
  }

  async function addBackup(state, force = false) {
    const list = await getBackups();
    if (!force && list[0] && Date.now() - list[0].t < 20 * 3600e3) return false;
    const copy = JSON.parse(JSON.stringify(state));
    delete copy.rev;
    list.unshift({ t: Date.now(), state: copy });
    await chrome.storage.local.set({ [BACKUPS]: list.slice(0, 7) });
    return true;
  }

  // ---- IndexedDB: fondo propio de cada pantalla ----
  let dbp;
  function db() {
    return dbp ||= new Promise((res, rej) => {
      const r = indexedDB.open('ntp', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }

  async function idb(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction('files', mode);
      const req = fn(tx.objectStore('files'));
      tx.oncomplete = () => res(req?.result);
      tx.onerror = () => rej(tx.error);
    });
  }

  const putPageBg = (id, blob) => idb('readwrite', s => s.put(blob, 'page:' + id));
  const getPageBg = id => idb('readonly', s => s.get('page:' + id));
  const delPageBg = id => idb('readwrite', s => s.delete('page:' + id));
  const getOldBg = () => idb('readonly', s => s.get('bg')); // versión 0.1 guardaba el fondo aquí
  const putFile = (key, blob) => idb('readwrite', s => s.put(blob, key));
  const getFile = key => idb('readonly', s => s.get(key));
  const delFile = key => idb('readwrite', s => s.delete(key));
  const fileKeys = () => idb('readonly', s => s.getAllKeys());

  return {
    KEY, BG, uid, DEFAULT_SETTINGS, DEFAULT_LINKS, newPage, defaultState, normalize, readCache, loadDurable,
    save, flush, onExternalChange, getBg, setBg, restoreBg, getBackups, addBackup,
    putPageBg, getPageBg, delPageBg, getOldBg, putFile, getFile, delFile, fileKeys,
  };
})();
