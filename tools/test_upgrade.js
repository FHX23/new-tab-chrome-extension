#!/usr/bin/env node
'use strict';
/**
 * Suite automática de pruebas de actualización, migración de datos e integridad.
 * Simula que usuarios reales en versiones anteriores (v0.4.0, v0.5.0, etc.) actualizan
 * directamente al código actual SIN haber hecho respaldo manual.
 *
 * Uso:  node tools/test_upgrade.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m ${name}\n    ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function latestDistZip() {
  const distDir = path.join(ROOT, 'dist');
  if (!fs.existsSync(distDir)) return null;
  const zips = fs.readdirSync(distDir)
    .filter(f => /^mi-nueva-pestana-\d+\.\d+\.\d+\.zip$/.test(f))
    .sort((a, b) => {
      const pa = a.match(/(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number);
      const pb = b.match(/(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number);
      for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
      return 0;
    });
  return zips.length ? path.join(distDir, zips[zips.length - 1]) : null;
}

function readFileFromZip(zipPath, innerPath) {
  return execFileSync('python', [
    '-c',
    'import sys, zipfile; z=zipfile.ZipFile(sys.argv[1]); sys.stdout.buffer.write(z.read(sys.argv[2]))',
    zipPath,
    innerPath,
  ], { encoding: 'utf8' });
}

function makeSandbox(uiLang) {
  const effectiveLang = uiLang.toLowerCase().startsWith('es') ? 'es' : 'en';
  const msgs = readJson(`_locales/${effectiveLang}/messages.json`);
  const ls = new Map();
  const cStorage = {};
  const ctx = {
    console, Math, Date, JSON, Object, Array, Set, Map, Uint8Array, Number, String, Boolean, RegExp, Error, Promise, URL, Intl,
    setTimeout, clearTimeout,
    localStorage: {
      getItem: k => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => ls.set(k, String(v)),
      removeItem: k => ls.delete(k),
    },
    addEventListener: () => {},
    chrome: {
      runtime: { getURL: p => 'chrome-extension://test-ext-id' + p },
      i18n: {
        getUILanguage: () => uiLang,
        getMessage: (k, subs) => {
          const entry = msgs[k];
          if (!entry) return '';
          let s = entry.message;
          if (Array.isArray(subs)) s = s.replace(/\$(\d+)/g, (_, i) => subs[+i - 1] ?? '');
          return s;
        },
      },
      storage: {
        local: {
          get: async k => ({ [k]: cStorage[k] }),
          set: async obj => Object.assign(cStorage, obj),
        },
      },
    },
    navigator: { language: uiLang },
    document: {
      documentElement: { lang: '', style: { setProperty() {} }, classList: { toggle() {} }, dataset: {} },
      body: { classList: { toggle() {} } },
      title: '',
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, dataset: {}, append() {}, setAttribute() {}, addEventListener() {} }),
    },
    _ls: ls,
    _cStorage: cStorage,
  };
  vm.createContext(ctx);
  for (const file of ['js/i18n.js', 'js/store.js', 'js/core.js']) {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8')
      .replace(/^const /gm, 'var ')
      .replace(/^let /gm, 'var ');
    vm.runInContext(code, ctx, { filename: file });
  }
  // Extrae solo migrate() y migrateV4() desde js/main.js sin disparar el arranque DOM
  const mainSrc = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
  const migEnd = mainSrc.indexOf('// Instalación nueva:');
  assert(migEnd > 0, 'No se encontró la sección migrate() en js/main.js');
  vm.runInContext(mainSrc.slice(0, migEnd), ctx, { filename: 'js/main.js#migrate' });
  return ctx;
}

// =========================================================================
console.log('\n1. Sintaxis, empaquetado y política de Chrome Web Store');
// =========================================================================

test('Sintaxis JS válida en todos los archivos de js/', () => {
  const jsDir = path.join(ROOT, 'js');
  for (const f of fs.readdirSync(jsDir).filter(x => x.endsWith('.js'))) {
    execFileSync(process.execPath, ['--check', path.join(jsDir, f)], { stdio: 'pipe' });
  }
});

test('Validación de tools/build_zip.py (manifest, íconos, _locales y placeholders)', () => {
  execFileSync('python', [
    '-c',
    'import json, sys; sys.path.insert(0, "tools"); import build_zip; m=json.load(open("manifest.json", encoding="utf-8")); p=build_zip.check(m); assert not p, p',
  ], { cwd: ROOT, stdio: 'pipe' });
});

const prevZip = latestDistZip();
if (prevZip) {
  const prevName = path.basename(prevZip);

  test(`Sin permisos obligatorios nuevos respecto a ${prevName} (actualización silenciosa)`, () => {
    const prevManifest = JSON.parse(readFileFromZip(prevZip, 'manifest.json'));
    const curManifest = readJson('manifest.json');
    const prevPerms = new Set(prevManifest.permissions || []);
    const addedPerms = (curManifest.permissions || []).filter(p => !prevPerms.has(p));
    assert(addedPerms.length === 0, `Permisos obligatorios nuevos detectados (desactivarían la extensión al actualizar): ${addedPerms.join(', ')}`);
    const prevHosts = new Set(prevManifest.host_permissions || []);
    const addedHosts = (curManifest.host_permissions || []).filter(h => !prevHosts.has(h));
    assert(addedHosts.length === 0, `host_permissions obligatorios nuevos detectados: ${addedHosts.join(', ')}`);
  });

  test(`Claves de almacenamiento (localStorage / chrome.storage / IndexedDB) intactas vs ${prevName}`, () => {
    const prevStore = readFileFromZip(prevZip, 'js/store.js');
    const curStore = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
    for (const pat of [/const KEY = '([^']+)'/, /const BG = '([^']+)'/, /const BACKUPS = '([^']+)'/, /indexedDB\.open\('([^']+)',\s*(\d+)\)/]) {
      const mPrev = prevStore.match(pat);
      const mCur = curStore.match(pat);
      assert(mPrev && mCur, `Patrón faltante: ${pat}`);
      assert(mPrev[0] === mCur[0], `Cambió clave de almacenamiento: "${mPrev[0]}" -> "${mCur[0]}"`);
    }
  });
}

// =========================================================================
console.log('\n2. Cobertura de internacionalización (es / en / fallback)');
// =========================================================================

test('Todas las claves data-i18n* de newtab.html existen en es y en', () => {
  const es = readJson('_locales/es/messages.json');
  const en = readJson('_locales/en/messages.json');
  const html = fs.readFileSync(path.join(ROOT, 'newtab.html'), 'utf8');
  const missing = [];
  for (const m of html.matchAll(/data-i18n(?:|-ph|-title)="([^"]+)"/g)) {
    const k = m[1].replace(/-/g, '_');
    if (!es[k] || !en[k]) missing.push(m[1]);
  }
  assert(missing.length === 0, `Faltan claves HTML: ${missing.join(', ')}`);
});

test('Claves estáticas t(...) de js/*.js y todos los prefijos dinámicos existen en es y en', () => {
  const es = readJson('_locales/es/messages.json');
  const en = readJson('_locales/en/messages.json');
  const dynamicPrefixes = new Set(['w_', 'size_', 'shape_', 'tm_', 'prog_', 'cv_', 'preset_']);
  const missing = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(x => x.endsWith('.js'))) {
    const txt = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    for (const m of txt.matchAll(/\bt\(\s*'([a-zA-Z0-9_-]+)'/g)) {
      if (dynamicPrefixes.has(m[1])) continue;
      const k = m[1].replace(/-/g, '_');
      if (!es[k] || !en[k]) missing.push(`${f}:${m[1]}`);
    }
  }
  // Verificar explícitamente las 12 conversiones con guion
  for (const pair of ['km-mi', 'mi-km', 'm-ft', 'ft-m', 'cm-in', 'in-cm', 'kg-lb', 'lb-kg', 'c-f', 'f-c', 'l-gal', 'gal-l']) {
    const k = 'cv_' + pair.replace(/-/g, '_');
    if (!es[k] || !en[k]) missing.push(k);
  }
  assert(missing.length === 0, `Faltan claves JS: ${missing.join(', ')}`);
});

test('Todos los códigos ISO de países en WORLD_CITIES se traducen en es y en', () => {
  const w = fs.readFileSync(path.join(ROOT, 'js/widgets.js'), 'utf8');
  const ccs = [...new Set([...w.matchAll(/cc:\s*'([A-Z]{2})'/g)].map(m => m[1]))];
  assert(ccs.length >= 40, `Se esperaban >= 40 países en WORLD_CITIES, encontrados: ${ccs.length}`);
  const dnEs = new Intl.DisplayNames(['es'], { type: 'region' });
  const dnEn = new Intl.DisplayNames(['en'], { type: 'region' });
  const invalid = ccs.filter(c => dnEs.of(c) === c || dnEn.of(c) === c);
  assert(invalid.length === 0, `Códigos ISO inválidos: ${invalid.join(', ')}`);
});

test('js/i18n.js optimizado (< 3 KB, sin diccionario embebido)', () => {
  const bytes = fs.statSync(path.join(ROOT, 'js/i18n.js')).size;
  assert(bytes < 3072, `js/i18n.js demasiado grande (${bytes} bytes)`);
});

// =========================================================================
console.log('\n3. Simulación de actualización sin respaldo (v0.4.0 y v0.5.0 -> actual)');
// =========================================================================

const V040_LEGACY_STATE = {
  v: 3,
  v3: false,
  seeded: true,
  welcomed: true,
  settings: {
    layout: 'grid',
    cols: 5,
    rows: 2,
    showTopLinks: true,
    engine: 'google',
    tabIcon: 'custom',
    textColor: '#f0f0f0',
    bgColor: '#112233',
  },
  pages: [
    {
      id: 'old1',
      items: [
        { id: 'a1', type: 'link', title: 'Recibidos (120) - Gmail', url: 'https://mail.google.com/' },
        { id: 'sp1', type: 'spacer' },
        { id: 'q1', type: 'widget', kind: 'quote', w: 2, h: 1 },
        { id: 'a2', type: 'link', title: 'GitHub', url: 'https://github.com/' },
      ],
    },
  ],
};

const V050_FULL_STATE = {
  v: 7,
  seeded: true,
  welcomed: true,
  settings: {
    layout: 'grid',
    cols: 7,
    rows: 3,
    rowPattern: '3,4',
    cell: 112,
    icon: 48,
    shape: 'circle',
    folderStyle: 'bubble',
    showLabels: true,
    showLogo: true,
    logoText: 'hola',
    logoColor: true,
    showSearch: true,
    topLinks: 'Gmail = https://mail.google.com/\nDrive = https://drive.google.com/',
    topLinksColor: '#ffffff',
    topLinksColors: { 0: '#ff0000', Gmail: '#ff0000' },
    bgColor: '#202124',
    bgImage: 'bgpool:custom01',
    bgRotate: true,
    bgEvery: 300,
    bgPool: ['bg/cosmic-cliffs.webp', 'bgpool:custom01'],
    bgCustom: ['custom01'],
    bgDim: 0.2,
    textColor: '#ffffff',
    tileColor: '#35363a',
    tileTr: 15,
    panelTheme: 'dark',
    showArrows: true,
    navSize: 44,
    navZone: 96,
    navZoneH: 60,
    navBg: '#000000',
    navBgTr: 65,
    navFg: '#ffffff',
    navFgTr: 0,
    showBookmarks: true,
    bmBg: '#000000',
    bmTr: 75,
    longPress: true,
    wiggle: true,
    xWidgets: true,
    clock24: true,
    xPages: true,
    xSearch: true,
    gCalIcsUrl: 'https://calendar.google.com/calendar/ical/example/basic.ics',
  },
  pages: [
    {
      id: 'p1',
      name: 'Principal',
      bg: 'bgrev1',
      items: [
        { id: 'l1', type: 'link', title: 'YouTube', url: 'https://youtube.com', x: 0, y: 0, w: 1, h: 1, shape: 'rounded' },
        {
          id: 'f1', type: 'folder', title: 'Trabajo', x: 1, y: 0, w: 1, h: 1,
          items: [
            { id: 'l2', type: 'link', title: 'GitHub', url: 'https://github.com', w: 1, h: 1 },
            { id: 'l3', type: 'link', title: 'Docs', url: 'https://docs.google.com', w: 1, h: 1 },
          ],
        },
        { id: 'w1', type: 'widget', kind: 'notes', x: 2, y: 0, w: 2, h: 2, text: 'No perder esta nota', color: 'yellow' },
        { id: 'w2', type: 'widget', kind: 'todo', x: 4, y: 0, w: 2, h: 2, list: [{ text: 'Probar update', done: false }] },
        { id: 'w5', type: 'widget', kind: 'habits', x: 0, y: 1, w: 2, h: 2, habits: 'Agua\nLeer', log: { Agua: ['2026-11-24'] } },
        { id: 'w3', type: 'widget', kind: 'world', x: 2, y: 2, w: 2, h: 1, zones: ['America/Santiago', 'Asia/Tokyo'] },
        { id: 'w4', type: 'widget', kind: 'convert', x: 4, y: 2, w: 2, h: 1, pair: 'km-mi', value: 42 },
      ],
    },
    {
      id: 'p2',
      layout: 'rows',
      pattern: '2,3',
      items: [
        { id: 'l4', type: 'link', title: 'Claude', url: 'https://claude.ai', x: 0, y: 0, w: 1, h: 1 },
      ],
    },
  ],
};

for (const [uiLang, expectedLang] of [['es-CL', 'es'], ['en-US', 'en'], ['fr-FR', 'en'], ['ja-JP', 'en']]) {
  test(`Upgrade v0.5.0 -> actual en Chrome "${uiLang}" (resuelve a "${expectedLang}")`, () => {
    const ctx = makeSandbox(uiLang);
    assert(ctx.LANG === expectedLang, `Esperaba LANG=${expectedLang}, obtuvo ${ctx.LANG}`);

    ctx._ls.set('ntp_state_v1', JSON.stringify(V050_FULL_STATE));
    ctx._ls.set('ntp_bgimg', 'data:image/webp;base64,USER_BG');
    ctx.state = ctx.Store.readCache();
    ctx.migrate();
    const created = ctx.reflow();

    assert(created === 0, `reflow creó ${created} pantallas inesperadas`);
    assert(ctx.state.v === 7, `v cambió a ${ctx.state.v}`);
    assert(ctx.state.settings.gridY === 0, 'gridY debe iniciar en 0 para usuarios previos');
    assert(ctx.state.settings.logoText === 'hola', 'logoText perdido');
    assert(ctx.state.settings.folderStyle === 'bubble', 'folderStyle perdido');
    assert(ctx.state.settings.bgImage === 'bgpool:custom01', 'bgImage perdido');
    assert(ctx.state.settings.bgCustom[0] === 'custom01', 'bgCustom perdido');
    assert(ctx.state.settings.topLinksColors[0] === '#ff0000', 'topLinksColors perdido');
    assert(ctx.Store.getBg() === 'data:image/webp;base64,USER_BG', 'fondo cacheado perdido');

    const p1 = ctx.state.pages[0];
    assert(p1.name === 'Principal' && p1.bg === 'bgrev1', 'metadatos de pantalla 1 perdidos');
    assert(p1.items.length === 7, `se esperaban 7 items en p1, hay ${p1.items.length}`);
    assert(p1.items.find(i => i.id === 'w1').text === 'No perder esta nota', 'nota perdida');
    assert(p1.items.find(i => i.id === 'w2').list[0].text === 'Probar update', 'tarea perdida');
    assert(p1.items.find(i => i.id === 'f1').items.length === 2, 'carpeta dañada');
    assert(p1.items.find(i => i.id === 'w3').zones.length === 2, 'reloj mundial dañado');
    assert(p1.items.find(i => i.id === 'w4').pair === 'km-mi', 'conversor dañado');
    assert(p1.items.find(i => i.id === 'w5').log.Agua[0] === '2026-11-24', 'hábitos dañados');

    // Verificar resolución i18n con guion y placeholders
    assert(ctx.t('cv_km-mi') === 'km → mi', 't("cv_km-mi") falló');
    assert(ctx.t('deleted', 'YouTube').includes('YouTube'), 'placeholder $1 falló');
    assert(ctx.t('gridY') !== 'gridY', 'falta traducción gridY');
  });
}

test('Upgrade desde versión muy antigua (v0.3/v0.4 -> actual) sin pérdida de accesos', () => {
  const ctx = makeSandbox('es-ES');
  ctx._ls.set('ntp_state_v1', JSON.stringify(V040_LEGACY_STATE));
  ctx.state = ctx.Store.readCache();
  ctx.migrate();
  ctx.reflow();
  assert(ctx.state.v === 7, `se esperaba v=7, obtuvo ${ctx.state.v}`);
  assert(ctx.state.settings.gridY === 0, 'gridY default faltante');
  assert(!('engine' in ctx.state.settings), 'engine obsoleto no se limpió');
  assert(!('tabIcon' in ctx.state.settings), 'tabIcon obsoleto no se limpió');
  assert(ctx.state.settings.topLinksColor === '#f0f0f0', 'herencia topLinksColor falló');
  const links = ctx.state.pages[0].items.filter(i => i.type === 'link');
  assert(links.length === 2, `se perdieron accesos al migrar desde v3: ${links.length}`);
  assert(links[0].title === 'Gmail', `cleanTitle esperaba Gmail, obtuvo ${links[0].title}`);
});

test('Altura por pantalla (gridY=0 explícito sobre global=50) y copyCfg()', () => {
  const ctx = makeSandbox('es-CL');
  ctx.state = ctx.Store.defaultState();
  ctx.state.settings.gridY = 50;
  ctx.state.pages[0].gridY = 0; // override explícito en 0 (arriba)
  assert(ctx.pageCfg(ctx.state.pages[0]).gridY === 0, 'gridY=0 explícito fue pisado por global=50');
  const cloned = ctx.copyCfg(ctx.state.pages[0], ctx.Store.newPage());
  assert(cloned.gridY === 0, 'copyCfg() perdió gridY=0 explícito');
  const pDefault = ctx.Store.newPage();
  assert(ctx.pageCfg(pDefault).gridY === 50, 'pantalla sin override no heredó global=50');
});

// =========================================================================
console.log('\n4. Pruebas de regresión de bugs corregidos');
// =========================================================================

test('Store.flush() prioriza ntp_state_v1 si localStorage está lleno por ntp_bgimg', () => {
  const ctx = makeSandbox('es-CL');
  ctx._ls.set('ntp_bgimg', 'HEAVY_BG');
  let blockedOnce = false;
  const origSet = ctx.localStorage.setItem;
  ctx.localStorage.setItem = (k, v) => {
    if (k === 'ntp_state_v1' && ctx._ls.has('ntp_bgimg') && !blockedOnce) {
      blockedOnce = true;
      throw new Error('QuotaExceededError');
    }
    return origSet(k, v);
  };
  const s = ctx.Store.defaultState();
  s.settings.logoText = 'guardado';
  ctx.Store.save(s);
  ctx.Store.flush();
  assert(!ctx._ls.has('ntp_bgimg'), 'debió liberar ntp_bgimg para hacer sitio al estado');
  const saved = JSON.parse(ctx._ls.get('ntp_state_v1'));
  assert(saved.settings.logoText === 'guardado', 'ntp_state_v1 no se guardó tras liberar ntp_bgimg');
  assert(typeof saved.savedAt === 'number' && saved.savedAt > 0, 'faltó marca savedAt');
});

test('Reloj mundial distingue ciudades con misma zona horaria (Barcelona/Madrid, Miami/NY)', () => {
  const wSrc = fs.readFileSync(path.join(ROOT, 'js/widgets.js'), 'utf8');
  const wEnd = wSrc.indexOf('const NOTE_COLORS =');
  assert(wEnd > 0, 'No se encontró WORLD_CITIES en js/widgets.js');
  for (const [uiLang, expectedNy, expectedBcn, expectedMad] of [
    ['es-CL', 'Nueva York', 'Barcelona', 'Madrid'],
    ['en-US', 'New York', 'Barcelona', 'Madrid'],
  ]) {
    const ctx = makeSandbox(uiLang);
    vm.runInContext(wSrc.slice(0, wEnd).replace(/^const /gm, 'var '), ctx, { filename: 'js/widgets.js#cities' });
    assert(ctx.zoneTz('Europe/Madrid|Barcelona') === 'Europe/Madrid', 'zoneTz falló con formato tz|city');
    assert(ctx.friendlyCity('Europe/Madrid|Barcelona') === expectedBcn, 'Barcelona no preservada');
    assert(ctx.friendlyCity('Europe/Madrid') === expectedMad, 'compatibilidad legacy Madrid falló');
    assert(ctx.friendlyCity('America/New_York|Miami') === 'Miami', 'Miami no preservada');
    assert(ctx.friendlyCity('America/New_York|New York') === expectedNy, 'New York traducido falló');
  }
});

test('Google Drive no borra historial de Chrome al ocultar tarjeta y Calendar valida dominio .ics', () => {
  const wSrc = fs.readFileSync(path.join(ROOT, 'js/widgets.js'), 'utf8');
  assert(!wSrc.includes('chrome.history.deleteUrl') && !wSrc.includes('history?.deleteUrl'), 'hideDriveFile no debe llamar chrome.history.deleteUrl');
  const m = wSrc.match(/function isGoogleCalUrl\(u\)\s*\{[\s\S]*?\n\}/);
  assert(m, 'No se encontró isGoogleCalUrl() en js/widgets.js');
  const ctx = makeSandbox('es-CL');
  vm.runInContext(m[0], ctx);
  assert(ctx.isGoogleCalUrl('') === true, 'URL vacía debe permitirse (sesión)');
  assert(ctx.isGoogleCalUrl('https://calendar.google.com/calendar/ical/x/basic.ics') === true, 'calendar.google.com debe permitirse');
  assert(ctx.isGoogleCalUrl('https://outlook.live.com/owa/calendar/x.ics') === false, 'outlook.live.com debe rechazarse con aviso claro');
  assert(ctx.isGoogleCalUrl('https://p12-caldav.icloud.com/published/2/x') === false, 'icloud.com debe rechazarse con aviso claro');
});

test('No queda setInterval global incondicional para el widget Fotos', () => {
  const wSrc = fs.readFileSync(path.join(ROOT, 'js/widgets.js'), 'utf8');
  assert(wSrc.includes('function ensurePhotosTicker()'), 'falta ensurePhotosTicker()');
  assert(!/^setInterval\(/m.test(wSrc), 'hay un setInterval de nivel superior corriendo siempre');
});

test('Instalación nueva arranca con estilo Aurora + widgets activos, sin alterar usuarios previos', () => {
  const ctx = makeSandbox('es-CL');
  const fresh = ctx.Store.defaultState();
  assert(fresh.settings.bgImage === 'bg/aurora-peaks.svg', 'instalación nueva debe traer fondo Aurora');
  assert(fresh.settings.logoColor === true, 'instalación nueva debe traer logo a colores');
  assert(fresh.settings.glass === true, 'instalación nueva debe traer efecto vidrio');
  assert(fresh.settings.xWidgets === true, 'instalación nueva debe traer widgets activos');
  // Usuario previo de v0.5.0 sin estos campos mantiene sus valores neutros
  const old = ctx.Store.normalize({ v: 7, settings: { bgImage: '', logoColor: false, xWidgets: false }, pages: [{ id: 'p1', items: [] }] });
  assert(old.settings.bgImage === '', 'usuario previo perdió su fondo vacío');
  assert(old.settings.glass === false, 'usuario previo no debe recibir glass forzado');
  assert(old.settings.dockBar === false, 'usuario previo no debe recibir dockBar forzado');
  assert(old.settings.gapX === 0 && old.settings.gapY === 0, 'gapX/gapY deben iniciar en 0');
  assert(old.settings.logoGreeting === false, 'logoGreeting debe iniciar apagado para usuarios previos');
});

test('Saludo dinámico y claves de los 4 estilos rápidos (ES y EN)', () => {
  const es = readJson('_locales/es/messages.json');
  const en = readJson('_locales/en/messages.json');
  for (const id of ['aurora', 'minimal', 'focus', 'dock']) {
    assert(es['preset_' + id] && en['preset_' + id], 'falta nombre de preset ' + id);
    assert(es['preset_' + id + '_tip'] && en['preset_' + id + '_tip'], 'falta tip de preset ' + id);
  }
  const ctxEs = makeSandbox('es-CL');
  const g1 = ctxEs.logoTextFor({ logoGreeting: true, logoText: '' });
  const g2 = ctxEs.logoTextFor({ logoGreeting: true, logoText: 'Matías' });
  assert(/^(Buenos días|Buenas tardes|Buenas noches)$/.test(g1), 'saludo ES inválido: ' + g1);
  assert(g2 === `${g1}, Matías`, 'saludo ES con nombre inválido: ' + g2);
  const ctxEn = makeSandbox('en-US');
  const gEn = ctxEn.logoTextFor({ logoGreeting: true, logoText: 'Alex' });
  assert(/^(Good morning|Good afternoon|Good evening), Alex$/.test(gEn), 'saludo EN inválido: ' + gEn);
});

test('Apariencia individual (color, transparencia y vidrio) en iconos, carpetas y widgets + caché ntp_fav_ok', () => {
  const ctx = makeSandbox('es-CL');
  ctx.state = ctx.Store.defaultState();
  ctx.state.settings.glass = false;
  ctx.state.settings.tileColor = '#35363a';
  ctx.state.settings.tileTr = 0;

  // Elemento normal: 0 estilos inline ni clases extra
  const normalNode = { classList: { added: [], add(c) { this.added.push(c); } }, style: { vars: {}, setProperty(k, v) { this.vars[k] = v; } } };
  ctx.applyItemLook(normalNode, { id: 'i1', type: 'link' });
  assert(normalNode.classList.added.length === 0 && Object.keys(normalNode.style.vars).length === 0, 'elemento sin apariencia propia no debe tocar DOM');

  // Widget único con vidrio activado aunque el global esté apagado
  const glassNode = { classList: { added: [], add(c) { this.added.push(c); } }, style: { vars: {}, setProperty(k, v) { this.vars[k] = v; } } };
  ctx.applyItemLook(glassNode, { id: 'w1', type: 'widget', kind: 'calc', tileGlass: 'on' });
  assert(glassNode.classList.added.includes('glass-on'), 'faltó clase glass-on');
  assert(glassNode.style.vars['--tile'].includes('32%'), 'vidrio individual debe usar translucidez automática (68% tr -> 32% opacidad): ' + glassNode.style.vars['--tile']);

  // Icono con color propio sólido y vidrio apagado aunque el global esté encendido
  ctx.state.settings.glass = true;
  const solidNode = { classList: { added: [], add(c) { this.added.push(c); } }, style: { vars: {}, setProperty(k, v) { this.vars[k] = v; } } };
  ctx.applyItemLook(solidNode, { id: 'i2', type: 'folder', tileColor: '#ef4444', tileTr: 10, tileGlass: 'off' });
  assert(solidNode.classList.added.includes('glass-off'), 'faltó clase glass-off');
  assert(solidNode.style.vars['--tile'].includes('#ef4444') && solidNode.style.vars['--tile'].includes('90%'), 'color/transparencia individual mal calculados');

  // Inicialización perezosa en panels.js y caché ntp_fav_ok en core.js
  const panelsSrc = fs.readFileSync(path.join(ROOT, 'js/panels.js'), 'utf8');
  assert(panelsSrc.includes('function ensureSettingsUi()') && panelsSrc.includes('function ensureEditUi()'), 'falta inicialización diferida de diálogos');
  const coreSrc = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  assert(coreSrc.includes('ntp_fav_ok') && coreSrc.includes('!isFavOk(host)'), 'falta caché ntp_fav_ok para evitar pixelHash repetido');
});

// =========================================================================
console.log(`\nResultado: ${passed} pasadas, ${failed} fallidas.\n`);
process.exit(failed > 0 ? 1 : 0);
