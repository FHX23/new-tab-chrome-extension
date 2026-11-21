'use strict';
// Widgets sin internet ni permisos extra. Cada tipo define en WIDGETS:
//   icon     emoji para la vista compacta     size  tamaño inicial [ancho, alto]
//   defaults valores iniciales (o init())    cfg   ajustes que se editan en «Configurar…»
//   full()   dibujo completo                   mini() dibujo compacto (1×1 o fuera de la cuadrícula)
// Lo que cambia con el tiempo deja una función _tick en su contenedor: un solo temporizador
// la llama una vez por minuto (y se pausa si la pestaña no se ve).

const pad2 = n => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtCache = {};
const validTz = z => { try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch { return false; } };
const fmtTime = (d, tz) => {
  if (tz && !validTz(tz)) tz = ''; // una zona mal escrita muestra la hora local en vez de romper la página
  const k = `t${state.settings.clock24}${tz || ''}`;
  return (fmtCache[k] ||= new Intl.DateTimeFormat(LANG, { hour: 'numeric', minute: '2-digit', hourCycle: state.settings.clock24 ? 'h23' : 'h12', ...(tz ? { timeZone: tz } : {}) })).format(d);
};
const fmtWith = (key, opts) => (fmtCache[key] ||= new Intl.DateTimeFormat(LANG, opts));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const mmss = s => `${pad2(Math.floor(s / 60))}:${pad2(Math.floor(s % 60))}`;
const wbtn = (txt, title, fn, cls = '') => el('button', { type: 'button', class: `widget-ui wb ${cls}`, title, 'aria-label': title, onclick: e => { e.stopPropagation(); fn(); } }, txt);
const saveW = () => saveQuiet();
const cityOf = tz => tz.split('/').pop().replace(/_/g, ' ');

// Anillo de progreso (0–1) en SVG.
const ring = (p, label) => {
  const r = 42, c = 2 * Math.PI * r;
  const box = el('div', { class: 'ring' });
  box.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${r}" class="ring-bg"/><circle cx="50" cy="50" r="${r}" class="ring-fg" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/></svg>`;
  box.append(el('div', { class: 'ring-txt' }, label));
  return box;
};

// «Son las cinco y cuarto» / «It's quarter past five», redondeado a 5 minutos.
function timeInWords(d) {
  let h = d.getHours() % 12, m = Math.round(d.getMinutes() / 5) * 5;
  if (m === 60) { m = 0; h = (h + 1) % 12; }
  const late = m > 30, hour = ((late ? h + 1 : h) % 12) || 12;
  if (LANG === 'es') {
    const H = ['una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce'][hour - 1];
    const M = { 0: 'en punto', 5: 'y cinco', 10: 'y diez', 15: 'y cuarto', 20: 'y veinte', 25: 'y veinticinco', 30: 'y media',
      35: 'menos veinticinco', 40: 'menos veinte', 45: 'menos cuarto', 50: 'menos diez', 55: 'menos cinco' }[m];
    return [[hour === 1 ? 'Es la' : 'Son las', 'wd-s'], [H, 'wd-h'], [M, 'wd-m']];
  }
  const H = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][hour - 1];
  if (m === 0) return [["It's", 'wd-s'], [H, 'wd-h'], ["o'clock", 'wd-m']];
  const M = { 5: 'five', 10: 'ten', 15: 'quarter', 20: 'twenty', 25: 'twenty-five', 30: 'half' }[late ? 60 - m : m];
  return [["It's", 'wd-s'], [`${M} ${late ? 'to' : 'past'}`, 'wd-m'], [H, 'wd-h']];
}

function analogSvg(d) {
  const m = d.getMinutes(), h = (d.getHours() % 12) + m / 60;
  const pt = (deg, len) => [50 + len * Math.sin(deg * Math.PI / 180), 50 - len * Math.cos(deg * Math.PI / 180)].map(v => v.toFixed(2));
  const line = (deg, a, b, cls) => { const [x1, y1] = pt(deg, a), [x2, y2] = pt(deg, b); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`; };
  let ticks = '';
  for (let i = 0; i < 12; i++) ticks += line(i * 30, i % 3 ? 40 : 36, 44, i % 3 ? 'tk' : 'tk tk-b');
  return `<svg viewBox="0 0 100 100" class="analog" role="img" aria-label="${fmtTime(d)}"><circle cx="50" cy="50" r="47" class="face"/>${ticks}${line(h * 30, -6, 26, 'hh')}${line(m * 6, -8, 37, 'mh')}<circle cx="50" cy="50" r="2.6" class="pin"/></svg>`;
}

// Estado en memoria que sobrevive a los redibujos (no se guarda): temporizadores, calculadoras, calendarios…
const live = new Map();
const liveOf = (it, init) => { if (!live.has(it.id)) live.set(it.id, init()); return live.get(it.id); };

const CONVERSIONS = {
  'km-mi': v => v / 1.609344, 'mi-km': v => v * 1.609344, 'm-ft': v => v * 3.28084, 'ft-m': v => v / 3.28084,
  'cm-in': v => v / 2.54, 'in-cm': v => v * 2.54, 'kg-lb': v => v * 2.20462, 'lb-kg': v => v / 2.20462,
  'c-f': v => v * 9 / 5 + 32, 'f-c': v => (v - 32) * 5 / 9, 'l-gal': v => v / 3.78541, 'gal-l': v => v * 3.78541,
};

const WORLD_CITIES = [
  // América del Sur
  { name: ['Santiago', 'Santiago'], country: 'Chile', tz: 'America/Santiago' },
  { name: ['Buenos Aires', 'Buenos Aires'], country: 'Argentina', tz: 'America/Argentina/Buenos_Aires' },
  { name: ['Bogotá', 'Bogota'], country: 'Colombia', tz: 'America/Bogota' },
  { name: ['Lima', 'Lima'], country: 'Perú', tz: 'America/Lima' },
  { name: ['São Paulo', 'Sao Paulo'], country: 'Brasil', tz: 'America/Sao_Paulo' },
  { name: ['Río de Janeiro', 'Rio de Janeiro'], country: 'Brasil', tz: 'America/Sao_Paulo' },
  { name: ['Montevideo', 'Montevideo'], country: 'Uruguay', tz: 'America/Montevideo' },
  { name: ['Asunción', 'Asuncion'], country: 'Paraguay', tz: 'America/Asuncion' },
  { name: ['La Paz', 'La Paz'], country: 'Bolivia', tz: 'America/La_Paz' },
  { name: ['Quito', 'Quito'], country: 'Ecuador', tz: 'America/Guayaquil' },
  { name: ['Caracas', 'Caracas'], country: 'Venezuela', tz: 'America/Caracas' },
  // América del Norte y Central
  { name: ['Ciudad de México', 'Mexico City'], country: 'México', tz: 'America/Mexico_City' },
  { name: ['Guadalajara', 'Guadalajara'], country: 'México', tz: 'America/Mexico_City' },
  { name: ['Monterrey', 'Monterrey'], country: 'México', tz: 'America/Monterrey' },
  { name: ['Tijuana', 'Tijuana'], country: 'México', tz: 'America/Tijuana' },
  { name: ['Cancún', 'Cancun'], country: 'México', tz: 'America/Cancun' },
  { name: ['Nueva York', 'New York'], country: 'EE.UU.', tz: 'America/New_York' },
  { name: ['Los Ángeles', 'Los Angeles'], country: 'EE.UU.', tz: 'America/Los_Angeles' },
  { name: ['Miami', 'Miami'], country: 'EE.UU.', tz: 'America/New_York' },
  { name: ['Chicago', 'Chicago'], country: 'EE.UU.', tz: 'America/Chicago' },
  { name: ['San Francisco', 'San Francisco'], country: 'EE.UU.', tz: 'America/Los_Angeles' },
  { name: ['Washington D.C.', 'Washington D.C.'], country: 'EE.UU.', tz: 'America/New_York' },
  { name: ['Toronto', 'Toronto'], country: 'Canadá', tz: 'America/Toronto' },
  { name: ['Vancouver', 'Vancouver'], country: 'Canadá', tz: 'America/Vancouver' },
  { name: ['Montreal', 'Montreal'], country: 'Canadá', tz: 'America/Toronto' },
  { name: ['San José', 'San Jose'], country: 'Costa Rica', tz: 'America/Costa_Rica' },
  { name: ['Ciudad de Panamá', 'Panama City'], country: 'Panamá', tz: 'America/Panama' },
  { name: ['Santo Domingo', 'Santo Domingo'], country: 'Rep. Dominicana', tz: 'America/Santo_Domingo' },
  { name: ['San Juan', 'San Juan'], country: 'Puerto Rico', tz: 'America/Puerto_Rico' },
  { name: ['La Habana', 'Havana'], country: 'Cuba', tz: 'America/Havana' },
  // Europa
  { name: ['Madrid', 'Madrid'], country: 'España', tz: 'Europe/Madrid' },
  { name: ['Barcelona', 'Barcelona'], country: 'España', tz: 'Europe/Madrid' },
  { name: ['Londres', 'London'], country: 'Reino Unido', tz: 'Europe/London' },
  { name: ['París', 'Paris'], country: 'Francia', tz: 'Europe/Paris' },
  { name: ['Roma', 'Rome'], country: 'Italia', tz: 'Europe/Rome' },
  { name: ['Berlín', 'Berlin'], country: 'Alemania', tz: 'Europe/Berlin' },
  { name: ['Lisboa', 'Lisbon'], country: 'Portugal', tz: 'Europe/Lisbon' },
  { name: ['Ámsterdam', 'Amsterdam'], country: 'Países Bajos', tz: 'Europe/Amsterdam' },
  { name: ['Bruselas', 'Brussels'], country: 'Bélgica', tz: 'Europe/Brussels' },
  { name: ['Viena', 'Vienna'], country: 'Austria', tz: 'Europe/Vienna' },
  { name: ['Zúrich', 'Zurich'], country: 'Suiza', tz: 'Europe/Zurich' },
  { name: ['Atenas', 'Athens'], country: 'Grecia', tz: 'Europe/Athens' },
  { name: ['Dublín', 'Dublin'], country: 'Irlanda', tz: 'Europe/Dublin' },
  { name: ['Estocolmo', 'Stockholm'], country: 'Suecia', tz: 'Europe/Stockholm' },
  { name: ['Oslo', 'Oslo'], country: 'Noruega', tz: 'Europe/Oslo' },
  { name: ['Copenhague', 'Copenhagen'], country: 'Dinamarca', tz: 'Europe/Copenhagen' },
  { name: ['Varsovia', 'Warsaw'], country: 'Polonia', tz: 'Europe/Warsaw' },
  { name: ['Praga', 'Prague'], country: 'Rep. Checa', tz: 'Europe/Prague' },
  { name: ['Moscú', 'Moscow'], country: 'Rusia', tz: 'Europe/Moscow' },
  { name: ['Estambul', 'Istanbul'], country: 'Turquía', tz: 'Europe/Istanbul' },
  // Asia y Oceanía
  { name: ['Tokio', 'Tokyo'], country: 'Japón', tz: 'Asia/Tokyo' },
  { name: ['Seúl', 'Seoul'], country: 'Corea del Sur', tz: 'Asia/Seoul' },
  { name: ['Pekín', 'Beijing'], country: 'China', tz: 'Asia/Shanghai' },
  { name: ['Shanghái', 'Shanghai'], country: 'China', tz: 'Asia/Shanghai' },
  { name: ['Hong Kong', 'Hong Kong'], country: 'Hong Kong', tz: 'Asia/Hong_Kong' },
  { name: ['Singapur', 'Singapore'], country: 'Singapur', tz: 'Asia/Singapore' },
  { name: ['Bangkok', 'Bangkok'], country: 'Tailandia', tz: 'Asia/Bangkok' },
  { name: ['Nueva Delhi', 'New Delhi'], country: 'India', tz: 'Asia/Kolkata' },
  { name: ['Dubái', 'Dubai'], country: 'EAU', tz: 'Asia/Dubai' },
  { name: ['Doha', 'Doha'], country: 'Catar', tz: 'Asia/Qatar' },
  { name: ['Sídney', 'Sydney'], country: 'Australia', tz: 'Australia/Sydney' },
  { name: ['Melbourne', 'Melbourne'], country: 'Australia', tz: 'Australia/Melbourne' },
  { name: ['Auckland', 'Auckland'], country: 'Nueva Zelanda', tz: 'Pacific/Auckland' },
  { name: ['Honolulu', 'Honolulu'], country: 'Hawái', tz: 'Pacific/Honolulu' },
  // África
  { name: ['El Cairo', 'Cairo'], country: 'Egipto', tz: 'Africa/Cairo' },
  { name: ['Johannesburgo', 'Johannesburg'], country: 'Sudáfrica', tz: 'Africa/Johannesburg' },
  { name: ['Casablanca', 'Casablanca'], country: 'Marruecos', tz: 'Africa/Casablanca' },
];

function friendlyCity(tz) {
  const found = WORLD_CITIES.find(c => c.tz === tz);
  if (found) return LANG === 'es' ? found.name[0] : found.name[1];
  return cityOf(tz);
}

const NOTE_COLORS = ['yellow', 'pink', 'green', 'blue', 'purple', 'glass'];

const WIDGETS = {
  clock: {
    icon: '🕒', size: [2, 1], defaults: { design: 'digital' },
    cfg: [{ k: 'design', type: 'choice', opts: ['digital', 'analog', 'minimal', 'words'] }],
    mini: () => el('span', { class: 'clock-mini' }, fmtTime(new Date())),
    full(it, b) {
      const design = it.design || 'digital';
      b.classList.add('d-' + design);
      const draw = () => {
        const d = new Date();
        if (design === 'analog') b.innerHTML = analogSvg(d);
        else if (design === 'words') b.replaceChildren(el('div', { class: 'words' }, timeInWords(d).map(([txt, c]) => el('span', { class: c }, txt))));
        else b.replaceChildren(...[el('div', { class: 'clock-time' }, fmtTime(d)), design !== 'minimal' && el('div', { class: 'clock-date' }, cap(fmtWith('date', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)))].filter(Boolean));
      };
      draw();
      b._tick = draw;
    },
  },

  notes: {
    icon: '📝', size: [2, 1], tiny: true, defaults: { text: '', color: 'yellow' },
    cfg: [{ k: 'color', type: 'choice', opts: NOTE_COLORS }],
    mini: () => el('span', { class: 'glyph' }, '📝'),
    full(it, b, w, h) {
      b.className = 'wbody w-notes note-' + (it.color || 'yellow');
      const ta = el('textarea', {
        class: 'widget-ui notes',
        placeholder: t('notesPh'),
        spellcheck: 'false',
        readonly: editing || null,
        'aria-label': t('w_notes')
      });
      ta.value = it.text || '';
      ta.addEventListener('input', () => { it.text = ta.value; saveW(); });
      b.addEventListener('click', () => { if (!editing) ta.focus(); });
      b.replaceChildren(ta);
    },
  },

  todo: {
    icon: '✅', size: [2, 2], defaults: { todos: [] },
    mini: it => it.todos?.length ? el('span', { class: 'mini-num' }, `${it.todos.filter(x => x.done).length}/${it.todos.length}`) : null,
    full(it, b) {
      const count = el('span', { class: 'w-count' }), bar = el('i');
      const list = el('ul', { class: 'todo-list' });
      const draw = () => {
        const todos = it.todos || [], done = todos.filter(x => x.done).length;
        count.textContent = todos.length ? `${done}/${todos.length}` : '';
        bar.style.width = todos.length ? `${(done / todos.length) * 100}%` : '0';
        list.replaceChildren(...todos.map((td, i) => el('li', { class: td.done ? 'done' : null },
          el('label', {}, el('input', { type: 'checkbox', class: 'widget-ui', checked: td.done || null, onchange: e => { td.done = e.target.checked; saveW(); draw(); } }), el('span', {}, td.t)),
          wbtn('✕', t('delete'), () => { it.todos.splice(i, 1); saveW(); draw(); }, 'todo-del'))));
      };
      const input = el('input', {
        class: 'widget-ui todo-add', placeholder: t('todoPh'), maxlength: 140, 'aria-label': t('todoPh'),
        onkeydown: e => {
          if (e.key !== 'Enter' || !input.value.trim()) return;
          (it.todos ||= []).push({ t: input.value.trim(), done: false });
          input.value = '';
          saveW();
          draw();
        },
      });
      b.append(el('div', { class: 'w-head' }, el('b', {}, t('w_todo')), count), el('div', { class: 'w-bar' }, bar), list, input);
      draw();
    },
  },

  calendar: {
    icon: '📅', size: [2, 2],
    mini: () => { const d = new Date(); return el('span', { class: 'cal-mini' }, el('small', {}, fmtWith('wd', { weekday: 'short' }).format(d)), el('b', {}, d.getDate())); },
    full(it, b) {
      const st = liveOf(it, () => ({ off: 0 }));
      const draw = () => {
        const now = new Date(), ref = new Date(now.getFullYear(), now.getMonth() + st.off, 1);
        const first = LANG === 'es' ? 1 : 0; // la semana empieza el lunes en español
        const lead = (ref.getDay() - first + 7) % 7, days = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
        const names = Array.from({ length: 7 }, (_, i) => fmtWith('wdn', { weekday: 'narrow' }).format(new Date(2024, 0, 7 + first + i)));
        const cells = [...names.map(n => el('span', { class: 'cal-wd' }, n)), ...Array.from({ length: lead }, () => el('span'))];
        for (let d = 1; d <= days; d++) {
          const today = st.off === 0 && d === now.getDate();
          cells.push(el('span', { class: today ? 'cal-d today' : 'cal-d' }, d));
        }
        b.replaceChildren(
          el('div', { class: 'w-head' },
            wbtn('‹', t('calPrev'), () => { st.off--; draw(); }),
            el('b', { class: 'cal-title' }, cap(fmtWith('my', { month: 'long', year: 'numeric' }).format(ref))),
            wbtn('›', t('calNext'), () => { st.off++; draw(); })),
          el('div', { class: 'cal-grid' }, cells));
      };
      draw();
      b._tick = draw;
    },
  },

  countdown: {
    icon: '⏳', size: [2, 1], defaults: { label: '', date: '' },
    cfg: [{ k: 'label', type: 'text' }, { k: 'date', type: 'date' }],
    days: it => {
      if (!it.date) return null;
      const [y, m, d] = it.date.split('-').map(Number), now = new Date();
      return Math.round((new Date(y, m - 1, d) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
    },
    mini(it) { const n = this.days(it); return n == null ? null : el('span', { class: 'mini-num' }, Math.abs(n) + 'd'); },
    full(it, b) {
      const draw = () => {
        const n = WIDGETS.countdown.days(it), label = it.label || t('cdThatDay');
        if (n == null) return b.replaceChildren(el('div', { class: 'w-empty' }, el('span', {}, t('cdEmpty')), wbtn(t('configure'), t('configure'), () => openWidgetCfg(it), 'wb-text')));
        b.replaceChildren(el('div', { class: 'cd-num' }, n === 0 ? '🎉' : Math.abs(n)),
          el('div', { class: 'cd-txt' }, n === 0 ? t('cdToday', label) : n > 0 ? t(n === 1 ? 'cdLeft1' : 'cdLeft', label) : t(n === -1 ? 'cdAgo1' : 'cdAgo', label)));
      };
      draw();
      b._tick = draw;
    },
  },

  timer: {
    icon: '⏱️', size: [2, 2], defaults: { work: 25, rest: 5 },
    cfg: [{ k: 'work', type: 'number', min: 1, max: 180 }, { k: 'rest', type: 'number', min: 1, max: 60 }],
    mini(it) { const st = live.get(it.id); return st?.running ? el('span', { class: 'mini-num', dataset: { timer: it.id } }, mmss(st.left)) : null; },
    full(it, b) {
      const st = timerState(it);
      const time = el('div', { class: 'tm-time', dataset: { timer: it.id } });
      const ringBox = el('div', { class: 'tm-ring', dataset: { timerRing: it.id } });
      const mode = m => wbtn(t('tm_' + m), t('tm_' + m), () => { timerSet(it, m); draw(); }, 'chip' + (st.mode === m ? ' on' : ''));
      const draw = () => {
        b.replaceChildren(el('div', { class: 'tm-modes' }, mode('work'), mode('rest')), ringBox, el('div', { class: 'tm-btns' },
          wbtn(st.running ? '❚❚' : '▶', st.running ? t('pause') : t('start'), () => { timerToggle(it); draw(); }, 'wb-main'),
          wbtn('↺', t('restart'), () => { timerSet(it, st.mode); draw(); })));
        ringBox.replaceChildren(ring(st.left / st.total, ''), time);
        time.textContent = mmss(st.left);
      };
      draw();
    },
  },

  world: {
    icon: '🌍', size: [2, 1],
    init: () => {
      const here = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      return { zones: [here, ...['America/New_York', 'Europe/Madrid', 'Asia/Tokyo'].filter(z => z !== here)].slice(0, 3) };
    },
    cfg: [{ k: 'zones', type: 'zones' }],
    mini: it => el('span', { class: 'clock-mini' }, fmtTime(new Date(), it.zones?.[0])),
    full(it, b, w = 2, h = 1) {
      const draw = () => {
        const zones = (it.zones || []).filter(Boolean);
        // 4+ zonas: en tarjetas angostas va en una columna compacta; a partir de 3 de ancho, en dos columnas
        b.classList.toggle('dense', zones.length > 3);
        b.classList.toggle('two-col', zones.length > 3 && w >= 3);
        if (!zones.length) {
          b.replaceChildren(el('div', { class: 'w-empty' }, el('span', {}, t('world_empty'))));
          return;
        }
        const now = new Date(), today = fmtWith('ymd', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
        b.replaceChildren(...zones.map(z => {
          let other = '';
          try {
            const there = new Intl.DateTimeFormat(LANG, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: z }).format(now);
            if (there !== today) other = there > today ? t('tomorrow') : t('yesterday');
          } catch { return el('div', { class: 'wz' }, el('span', {}, z), el('b', {}, '—')); }
          return el('div', { class: 'wz' }, el('span', {}, friendlyCity(z), other ? el('small', {}, ' · ' + other) : null), el('b', {}, fmtTime(now, z)));
        }));
      };
      draw();
      b._tick = draw;
    },
  },

  progress: {
    icon: '📊', size: [2, 1], tiny: true, defaults: { scope: 'year' },
    cfg: [{ k: 'scope', type: 'choice', opts: ['day', 'week', 'month', 'year'] }],
    pct(scope) {
      const n = new Date();
      const span = {
        day: [new Date(n.getFullYear(), n.getMonth(), n.getDate()), new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1)],
        week: (() => { const s = new Date(n.getFullYear(), n.getMonth(), n.getDate() - ((n.getDay() + 6) % 7)); return [s, new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7)]; })(),
        month: [new Date(n.getFullYear(), n.getMonth(), 1), new Date(n.getFullYear(), n.getMonth() + 1, 1)],
        year: [new Date(n.getFullYear(), 0, 1), new Date(n.getFullYear() + 1, 0, 1)],
      }[scope];
      return (n - span[0]) / (span[1] - span[0]);
    },
    mini(it) { return el('span', { class: 'mini-num' }, Math.floor(this.pct(it.scope || 'year') * 100) + '%'); },
    full(it, b) {
      const draw = () => {
        const p = WIDGETS.progress.pct(it.scope || 'year');
        b.replaceChildren(ring(p, Math.floor(p * 100) + '%'), el('div', { class: 'pg-txt' }, t('prog_' + (it.scope || 'year'))));
      };
      draw();
      b._tick = draw;
    },
  },

  calc: {
    icon: '🧮', size: [2, 2], defaults: { hist: [], ans: null },
    full(it, b) {
      it.hist ||= [];
      const st = liveOf(it, () => ({ cur: '0', prev: null, op: null, fresh: true }));
      const histBox = el('div', { class: 'calc-hist' });
      const exprBox = el('div', { class: 'calc-expr' });
      const disp = el('div', { class: 'calc-disp' });
      const num = s => parseFloat(s) || 0;
      const cleanNum = v => Number.isFinite(v) ? +v.toPrecision(12) : NaN;
      const run = (a, op, c) => cleanNum({ '+': a + c, '−': a - c, '×': a * c, '÷': c === 0 ? NaN : a / c }[op]);
      const fmtVal = s => {
        const v = parseFloat(s);
        return /NaN|Infinity|Error/.test(s) ? 'Error' : String(s).length > 12 && Number.isFinite(v) ? String(+v.toPrecision(10)) : String(s);
      };
      const record = (a, op, c, res) => {
        if (!Number.isFinite(res)) return;
        const rStr = String(res);
        it.ans = rStr;
        (it.hist ||= []).push({ expr: `${fmtVal(a)} ${op} ${fmtVal(c)}`, res: rStr });
        if (it.hist.length > 8) it.hist.shift();
        saveW();
      };
      const opBtns = new Map();
      const ansBtnRef = { el: null };
      const show = () => {
        disp.textContent = fmtVal(st.cur);
        exprBox.textContent = st.op != null && st.prev != null
          ? `${fmtVal(st.prev)} ${st.op}`
          : (it.ans != null ? `Ans = ${fmtVal(it.ans)}` : '');
        const list = it.hist || [];
        if (!list.length) {
          histBox.replaceChildren(el('div', { class: 'calc-h-empty' }, t('calcHistEmpty')));
        } else {
          histBox.replaceChildren(...list.map(h => el('button', {
            type: 'button',
            class: 'widget-ui calc-hitem',
            title: t('calcHistUse'),
            onclick: e => { e.stopPropagation(); st.cur = String(h.res); st.fresh = false; show(); },
          }, `${h.expr} = `, el('b', {}, fmtVal(h.res)))));
          histBox.scrollTop = histBox.scrollHeight;
          // en el primer pintado la tarjeta aún no está en el DOM: bajar al final cuando ya tenga tamaño
          requestAnimationFrame(() => { histBox.scrollTop = histBox.scrollHeight; });
        }
        for (const [k, btn] of opBtns) btn.classList.toggle('active', st.op === k && st.fresh);
        if (ansBtnRef.el) {
          ansBtnRef.el.disabled = it.ans == null;
          ansBtnRef.el.title = it.ans != null ? `${t('calcAns')}: ${fmtVal(it.ans)}` : t('calcAns');
        }
      };
      const press = k => {
        if (/\d/.test(k)) {
          if (st.fresh || st.cur === '0' || /NaN|Infinity|Error/.test(st.cur)) { st.cur = k; st.fresh = false; }
          else if (st.cur.replace(/[-.]/g, '').length < 15) st.cur += k;
        } else if (k === ',') {
          if (st.fresh || /NaN|Infinity|Error/.test(st.cur)) { st.cur = '0.'; st.fresh = false; }
          else if (!st.cur.includes('.')) st.cur += '.';
        } else if (k === '⌫') {
          if (st.fresh || /NaN|Infinity|Error/.test(st.cur)) { st.cur = '0'; st.fresh = true; }
          else {
            st.cur = st.cur.slice(0, -1);
            if (!st.cur || st.cur === '-' || st.cur === '-0') { st.cur = '0'; st.fresh = true; }
          }
        } else if (k === 'AC') {
          if (st.cur === '0' && st.prev == null && !st.op && it.hist?.length) { it.hist = []; saveW(); }
          Object.assign(st, { cur: '0', prev: null, op: null, fresh: true });
        } else if (k === 'Ans') {
          if (it.ans != null) { st.cur = String(it.ans); st.fresh = false; }
        } else if (k === '±') {
          if (st.cur !== '0' && !/NaN|Infinity|Error/.test(st.cur)) st.cur = String(cleanNum(-num(st.cur)));
        } else if (k === '%') {
          if (!/NaN|Infinity|Error/.test(st.cur)) { st.cur = String(cleanNum(num(st.cur) / 100)); st.fresh = false; }
        } else if (k === '=') {
          if (st.op != null && st.prev != null) {
            const c = num(st.cur), res = run(st.prev, st.op, c);
            record(st.prev, st.op, c, res);
            st.cur = Number.isFinite(res) ? String(res) : 'Error';
            st.prev = null; st.op = null; st.fresh = true;
          }
        } else {
          if (st.op && !st.fresh) {
            const c = num(st.cur), res = run(st.prev, st.op, c);
            record(st.prev, st.op, c, res);
            st.cur = Number.isFinite(res) ? String(res) : 'Error';
          }
          st.prev = num(st.cur); st.op = k; st.fresh = true;
        }
        show();
      };
      const fnDefs = [
        ['AC', t('calcAC'), 'fn ac'],
        ['⌫', t('calcDel'), 'fn del'],
        ['Ans', t('calcAns'), 'fn ans'],
        ['±', t('calcSign'), 'fn'],
        ['%', t('calcPct'), 'fn'],
      ];
      const fnRow = el('div', { class: 'calc-fns' }, fnDefs.map(([k, title, cls]) => {
        const btn = wbtn(k, title, () => press(k), cls);
        if (k === 'Ans') ansBtnRef.el = btn;
        return btn;
      }));
      const keys = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', ',', '=', '+'];
      const keyGrid = el('div', { class: 'calc-keys' }, keys.map(k => {
        const isOp = /[÷×−+]/.test(k);
        const btn = wbtn(k, k, () => press(k), isOp ? 'op' : k === '=' ? 'eq' : '');
        if (isOp) opBtns.set(k, btn);
        return btn;
      }));
      const screen = el('div', { class: 'calc-screen' }, histBox, el('div', { class: 'calc-bottom' }, exprBox, disp));
      b.tabIndex = 0;
      b.addEventListener('keydown', e => {
        if (editing) return;
        const k = e.key;
        const map = { '+': '+', '-': '−', '*': '×', 'x': '×', 'X': '×', '/': '÷', '.': ',', ',': ',', '%': '%', '=': '=', Enter: '=', Backspace: '⌫', Delete: 'AC', Escape: 'AC', a: 'Ans', A: 'Ans' };
        const act = /\d/.test(k) ? k : map[k];
        if (!act) return;
        e.preventDefault();
        e.stopPropagation();
        press(act);
      });
      b.append(screen, fnRow, keyGrid);
      show();
    },
  },

  photos: {
    icon: '🖼️', size: [2, 2], defaults: { photos: [], every: 15 },
    cfg: [{ k: 'photos', type: 'photos' }, { k: 'every', type: 'number', min: 5, max: 3600 }],
    full(it, b) {
      if (!it.photos?.length) return b.append(el('div', { class: 'w-empty' }, el('span', {}, t('photosEmpty')), wbtn(t('photosAdd'), t('photosAdd'), () => openWidgetCfg(it), 'wb-text')));
      const st = liveOf(it, () => ({ i: 0, at: Date.now() }));
      const img = el('img', { alt: '', draggable: 'false' });
      const show = async () => {
        const url = await photoUrl(it.photos[st.i % it.photos.length]);
        if (url) img.src = url;
      };
      b._next = () => {
        if (Date.now() - st.at < (it.every || 15) * 1000) return;
        st.at = Date.now();
        st.i = (st.i + 1) % it.photos.length;
        img.classList.add('fade');
        setTimeout(() => { show(); img.classList.remove('fade'); }, 250);
      };
      b.append(img);
      show();
    },
  },


  habits: {
    icon: '🔁', size: [2, 2],
    init: () => ({ habits: t('habitsDefault'), log: {} }),
    cfg: [{ k: 'habits', type: 'lines' }],
    full(it, b) {
      const draw = () => {
        const now = new Date(), monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
        const week = Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
        const names = String(it.habits || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 6);
        const head = el('div', { class: 'hb-row hb-head' }, el('span'), week.map(d => el('span', { class: dayKey(d) === dayKey() ? 'today' : null }, fmtWith('wdn', { weekday: 'narrow' }).format(d))));
        const rows = names.map(name => {
          const log = (it.log ||= {})[name] ||= [];
          return el('div', { class: 'hb-row' }, el('span', { class: 'hb-name', title: name }, name), week.map(d => {
            const k = dayKey(d), on = log.includes(k), future = d > now;
            return el('button', {
              type: 'button', class: `widget-ui hb-dot${on ? ' on' : ''}${k === dayKey() ? ' today' : ''}`, disabled: future || null,
              'aria-label': `${name} · ${k}`, 'aria-pressed': on ? 'true' : 'false',
              onclick: e => {
                e.stopPropagation();
                const i = log.indexOf(k);
                if (i >= 0) log.splice(i, 1); else log.push(k);
                const old = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 70)); // guarda solo ~10 semanas
                it.log[name] = log.filter(x => x >= old);
                saveW();
                draw();
              },
            });
          }));
        });
        b.replaceChildren(head, ...(rows.length ? rows : [el('div', { class: 'w-empty' }, el('span', {}, t('habitsEmpty')))]));
      };
      draw();
      b._tick = draw;
    },
  },

  convert: {
    icon: '📐', size: [2, 1], defaults: { pair: 'km-mi', value: 1 },
    full(it, b) {
      const out = el('output', { class: 'cv-out' });
      const input = el('input', { type: 'number', class: 'widget-ui cv-in', step: 'any', value: it.value ?? 1, 'aria-label': t('cvValue') });
      const select = el('select', { class: 'widget-ui cv-sel', 'aria-label': t('cvUnits') }, Object.keys(CONVERSIONS).map(k => el('option', { value: k }, t('cv_' + k))));
      select.value = it.pair || 'km-mi';
      const calc = () => {
        const v = CONVERSIONS[select.value](parseFloat(input.value) || 0);
        out.textContent = (+v.toFixed(3)).toLocaleString(LANG) + ' ' + t('cv_' + select.value).split('→')[1].trim();
        it.value = parseFloat(input.value) || 0;
        it.pair = select.value;
        saveW();
      };
      input.addEventListener('input', calc);
      select.addEventListener('change', calc);
      b.append(el('div', { class: 'cv-row' }, input, select), out);
      calc();
    },
  },

  breathe: {
    icon: '🫁', size: [2, 2], tiny: true,
    full(it, b) {
      const st = liveOf(it, () => ({ on: false, phase: 0, timer: null }));
      b.dataset.br = it.id;
      b.append(el('div', { class: 'br-orb' }), el('div', { class: 'br-txt' }));
      b.addEventListener('click', e => {
        if (editing || e.target.closest('.wb')) return;
        st.on = !st.on;
        clearInterval(st.timer);
        st.phase = 0;
        if (st.on) {
          st.timer = setInterval(() => { // respiración cuadrada: 4 s por fase
            if (!$(`[data-br="${it.id}"]`)) return disposeWidget(it.id); // ya no está en la página
            st.phase = (st.phase + 1) % 4;
            breathePaint(it.id);
          }, 4000);
        }
        breathePaint(it.id);
      });
      b.classList.add('widget-ui');
      breathePaint(it.id, b);
    },
  },

  gdrive: {
    icon: '📁', size: [2, 2],
    full(it, b, w, h) {
      b.dataset.gdrive = it.id;
      b.classList.toggle('compact-h', h === 1);
      const draw = () => paintGDriveCard(it, b, w, h);
      draw();
      b._tick = draw;
      maybeAutoRefreshGDrive();
    },
  },

  gcal: {
    icon: '📆', size: [2, 2], defaults: { manual: [] },
    full(it, b, w, h) {
      b.dataset.gcal = it.id;
      b.classList.toggle('compact-h', h === 1);
      const draw = () => paintGCalCard(it, b, w, h);
      draw();
      b._tick = draw;
      maybeAutoRefreshGCal();
    },
  },
};

// ---------- Tarjetas de Google Drive y Google Calendar ----------
const GDRIVE_CACHE_KEY = 'ntp_gdrive_cache';
const GDRIVE_HIDDEN_KEY = 'ntp_gdrive_hidden';
const GCAL_CACHE_KEY = 'ntp_gcal_cache';

function readJsonCache(k, fallback = []) {
  try { return JSON.parse(localStorage.getItem(k)) || fallback; } catch { return fallback; }
}
function writeJsonCache(k, val) {
  try { localStorage.setItem(k, JSON.stringify(val)); } catch {}
}

function fmtDriveAgo(ts) {
  if (!ts) return '';
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 3) return t('gOpenedJustNow');
  if (diffMin < 60) return t('gOpenedMinAgo', diffMin);
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t('gOpenedHrAgo', diffHr);
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return t('gOpenedYesterday');
  if (diffDays < 30) return t('gOpenedDaysAgo', diffDays);
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths <= 1) return t('gOpenedLastMonth');
  if (diffMonths < 12) return t('gOpenedMonthsAgo', diffMonths);
  return t('gOpenedLastYear');
}

function driveTypeIcon(kind) {
  const box = el('span', { class: `gd-ico gd-${kind || 'doc'}` });
  const svgs = {
    doc: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M6 7h12v2H6zm0 4h12v2H6zm0 4h8v2H6z"/></svg>',
    sheet: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M10 5v5H5v3h5v6h3v-6h6v-3h-6V5z"/></svg>',
    slide: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M5 6h14v12H5V6zm3 3v6h8V9H8z"/></svg>',
    form: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M6 7h2v2H6zm4 0h8v2h-8zm-4 4h2v2H6zm4 0h8v2h-8zm-4 4h2v2H6zm4 0h5v2h-5z"/></svg>',
    pdf: '<span class="gd-pdf-txt">PDF</span>',
    drive: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M8 5h8l4 7-4 7H8L4 12z"/></svg>',
  };
  box.innerHTML = svgs[kind] || svgs.doc;
  return box;
}

function cleanDriveDocTitle(raw) {
  return String(raw || '')
    .replace(/\s*[-–—•·]\s*(Documentos|Hojas de cálculo|Presentaciones|Formularios|Dibujos)\s+de\s+Google.*$/i, '')
    .replace(/\s*[-–—•·]\s*Google\s+(Docs|Sheets|Slides|Forms|Drawings|Drive).*$/i, '')
    .replace(/\.(docx?|xlsx?|pptx?)$/i, '')
    .trim();
}

function classifyDriveUrl(url, rawTitle = '') {
  try {
    const u = new URL(url);
    if (u.hostname === 'docs.google.com') {
      const m = u.pathname.match(/\/(document|spreadsheets|presentation|forms)\/d\/([a-zA-Z0-9_-]{15,})/);
      if (!m) return null;
      const map = { document: 'doc', spreadsheets: 'sheet', presentation: 'slide', forms: 'form' };
      return { id: m[2], kind: map[m[1]] || 'doc', cleanUrl: `https://docs.google.com/${m[1]}/d/${m[2]}/edit` };
    }
    if (u.hostname === 'drive.google.com') {
      const m = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]{15,})/);
      if (m) {
        const isPdf = /\.pdf(\b|$)/i.test(rawTitle);
        return { id: m[1], kind: isPdf ? 'pdf' : 'drive', cleanUrl: `https://drive.google.com/file/d/${m[1]}/view` };
      }
    }
  } catch {}
  return null;
}

async function hasHistPerm() {
  try { return await chrome.permissions.contains({ permissions: ['history'] }); } catch { return false; }
}

function hideDriveFile(id, url) {
  const hidden = new Set(readJsonCache(GDRIVE_HIDDEN_KEY, []));
  hidden.add(id);
  writeJsonCache(GDRIVE_HIDDEN_KEY, [...hidden]);
  if (url && chrome.history?.deleteUrl) chrome.history.deleteUrl({ url }).catch(() => {});
  const cur = readJsonCache(GDRIVE_CACHE_KEY, []).filter(x => x.id !== id);
  writeJsonCache(GDRIVE_CACHE_KEY, cur);
  repaintGDriveCards();
}

// Lee automáticamente archivos de Docs, Sheets, Slides, PDFs y Drive desde el navegador.
async function scanDriveHistory() {
  if (!await hasHistPerm()) return null;
  const hidden = new Set(readJsonCache(GDRIVE_HIDDEN_KEY, []));
  const rows = await chrome.history.search({ text: 'google.com', maxResults: 500, startTime: 0 });
  const byId = new Map();
  for (const r of rows) {
    const info = classifyDriveUrl(r.url, r.title);
    if (!info || hidden.has(info.id)) continue;
    const title = cleanDriveDocTitle(r.title);
    // Si el título indica página de error o archivo eliminado/no encontrado, lo descarta
    if (!title || /^(Google Docs|Google Sheets|Google Slides|Google Drive|Documentos de Google|Hojas de cálculo de Google|Archivo no encontrado|File not found|Error 404)$/i.test(title)) continue;
    const prev = byId.get(info.id);
    const ts = r.lastVisitTime || Date.now();
    if (!prev || ts > prev.ts) {
      byId.set(info.id, { id: info.id, title, url: info.cleanUrl, kind: info.kind, ts });
    }
  }
  const list = [...byId.values()].sort((a, b) => b.ts - a.ts).slice(0, 12);
  writeJsonCache(GDRIVE_CACHE_KEY, list);
  repaintGDriveCards();
  return list;
}

let lastDriveAuto = 0;
async function maybeAutoRefreshGDrive(force = false) {
  if (!force && Date.now() - lastDriveAuto < 10000) return;
  lastDriveAuto = Date.now();
  await scanDriveHistory();
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && $('[data-gdrive]')) maybeAutoRefreshGDrive(true);
});

function repaintGDriveCards() {
  for (const b of $$('[data-gdrive]')) b._tick?.();
}

function paintGDriveCard(it, b, w = 2, h = 2) {
  const isPopup = b.classList.contains('in-modal') || !!b.closest('#widgetBody');
  const files = readJsonCache(GDRIVE_CACHE_KEY, []);
  const expandBtn = !isPopup && wbtn('⤢', t('open'), () => openWidget(it), 'gcard-dots');
  const menuBtn = wbtn('⋮', t('configure'), () => {
    openMenu([
      !isPopup && entryEl({ label: '⤢  ' + t('open'), act: () => openWidget(it) }),
      entryEl({ label: t('tabGCards') + '…', act: () => { openSettings(); showTab('gcards'); } }),
      entryEl('-'),
      entryEl({ label: t('gDriveOpen') + ' ↗', act: () => window.open('https://drive.google.com/', '_blank', 'noopener') }),
    ].filter(Boolean), menuBtn);
  }, 'gcard-dots');

  const moreLink = el('a', {
    class: 'widget-ui gcal-more',
    href: 'https://drive.google.com/',
    target: '_blank',
    rel: 'noopener',
    onclick: e => { e.stopPropagation(); if (editing) e.preventDefault(); },
  }, el('span', { class: 'gm-txt' }, t('gCalMore') + ' '), '↗');

  const head = el('div', { class: 'w-head gcard-head' },
    el('b', { class: 'gcard-title' }, t('w_gdrive')),
    el('div', { class: 'gcard-actions' }, moreLink, expandBtn, menuBtn)
  );

  if (!files.length) {
    const actBtn = wbtn(t('gDriveEnableBtn'), t('gDriveEnableBtn'), async () => {
      const ok = await chrome.permissions.request({ permissions: ['history'] }).catch(() => false);
      if (ok) await scanDriveHistory();
      else { openSettings(); showTab('gcards'); }
    }, 'wb-text gcard-cta');
    b.replaceChildren(head, el('div', { class: 'w-empty' }, el('span', {}, t('gDriveEmpty')), actBtn));
    return;
  }

  const maxItems = isPopup ? 12 : (h >= 3 ? 10 : (h === 1 ? 2 : 6));
  const listEl = el('div', { class: 'gd-list' }, files.slice(0, maxItems).map(f => el('a', {
    class: 'widget-ui gd-row',
    href: f.url,
    target: '_blank',
    rel: 'noopener',
    title: `${f.title}\n${fmtDriveAgo(f.ts)}`,
    onclick: e => { e.stopPropagation(); if (editing) e.preventDefault(); },
  },
    driveTypeIcon(f.kind),
    el('div', { class: 'gd-meta' },
      el('div', { class: 'gd-name' }, f.title),
      el('div', { class: 'gd-sub' }, fmtDriveAgo(f.ts))
    ),
    el('button', {
      type: 'button',
      class: 'widget-ui gd-hide',
      title: t('delete'),
      onclick: e => { e.preventDefault(); e.stopPropagation(); hideDriveFile(f.id, f.url); },
    }, '✕')
  )));
  b.replaceChildren(head, listEl);
}

// ---------- Google Calendar: Parser iCal (.ics) + OAuth API + Reuniones rápidas ----------
function parseIcsDate(val, params = '') {
  const clean = String(val || '').trim();
  const m = clean.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) return { ts: new Date(+y, +mo - 1, +d, 0, 0, 0).getTime(), allDay: true };
  const ts = z ? Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) : new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime();
  return { ts, allDay: false };
}

function unescapeIcs(s) {
  return String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
}

function extractMeetUrl(...texts) {
  const joined = texts.filter(Boolean).join(' ');
  const m = joined.match(/https:\/\/(?:meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}|[\w.-]*zoom\.us\/(?:j|my)\/[^\s"<>\n\\]+|teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>\n\\]+)/i);
  return m ? m[0] : '';
}

function parseIcsText(ics) {
  const unfolded = String(ics || '').replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const minEnd = startOfToday.getTime();
  const maxStart = now + 90 * 86400000;
  const events = [];
  const pastEvents = [];
  let cur = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.status !== 'CANCELLED' && cur.start) {
        const start = cur.start.ts;
        const end = cur.end?.ts || (start + (cur.start.allDay ? 86400000 : 3600000));
        const dur = Math.max(1800000, end - start);
        const meetUrl = extractMeetUrl(cur.conf, cur.location, cur.desc, cur.url);
        const makeEv = (sTs, eTs) => ({
          id: (cur.uid || uid()) + '_' + sTs,
          title: cur.summary || '(Sin título)',
          start: sTs,
          end: eTs,
          allDay: !!cur.start.allDay,
          location: cur.location && !cur.location.startsWith('http') ? cur.location : '',
          meetUrl,
        });
        const pushOcc = (sTs, eTs) => {
          if (eTs >= minEnd && sTs <= maxStart) events.push(makeEv(sTs, eTs));
          else if (eTs < minEnd && eTs >= now - 60 * 86400000) pastEvents.push(makeEv(sTs, eTs));
        };
        pushOcc(start, end);
        // Proyección para reuniones recurrentes activas (respeta UNTIL si existe)
        if (cur.rrule && start < now) {
          const untilM = cur.rrule.match(/UNTIL=(\d{8}(?:T\d{6}Z?)?)/i);
          const untilTs = untilM ? (parseIcsDate(untilM[1])?.ts ?? Infinity) : Infinity;
          if (untilTs >= minEnd) {
            const isDaily = /FREQ=DAILY/i.test(cur.rrule);
            const isWeekly = /FREQ=WEEKLY/i.test(cur.rrule);
            if (isDaily || isWeekly) {
              const step = isDaily ? 86400000 : 7 * 86400000;
              const k = Math.max(1, Math.floor((minEnd - start) / step));
              for (let j = k; j <= k + 4; j++) {
                const occStart = start + j * step;
                if (occStart <= untilTs) pushOcc(occStart, occStart + dur);
              }
            }
          }
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const rawKey = line.slice(0, idx), val = line.slice(idx + 1);
    const [k, ...p] = rawKey.split(';');
    const key = k.toUpperCase();
    if (key === 'SUMMARY') cur.summary = unescapeIcs(val);
    else if (key === 'DTSTART') cur.start = parseIcsDate(val, p.join(';'));
    else if (key === 'DTEND') cur.end = parseIcsDate(val, p.join(';'));
    else if (key === 'LOCATION') cur.location = unescapeIcs(val);
    else if (key === 'DESCRIPTION') cur.desc = unescapeIcs(val);
    else if (key === 'URL') cur.url = unescapeIcs(val);
    else if (key === 'X-GOOGLE-CONFERENCE') cur.conf = unescapeIcs(val);
    else if (key === 'STATUS') cur.status = val.trim().toUpperCase();
    else if (key === 'RRULE') cur.rrule = val.trim();
    else if (key === 'UID') cur.uid = val.trim();
  }
  // Ordena priorizando los que aún no terminan; si no hay futuros, muestra los más recientes de hoy/últimos días
  const upcoming = events.filter(e => e.end >= now - 15 * 60000).sort((a, b) => a.start - b.start);
  if (upcoming.length) return upcoming.slice(0, 15);
  const todayList = events.sort((a, b) => b.start - a.start);
  if (todayList.length) return todayList.slice(0, 10);
  return pastEvents.sort((a, b) => b.start - a.start).slice(0, 5);
}

// Descomprime un archivo .zip (incluidos los .ical.zip generados en streaming por Google Calendar,
// que guardan el tamaño comprimido real en el Central Directory al final del archivo).
async function unpackZipBuffer(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocdOff = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocdOff = i; break; }
  }
  const texts = [];
  if (eocdOff >= 0) {
    const entries = dv.getUint16(eocdOff + 10, true);
    let cd = dv.getUint32(eocdOff + 16, true);
    for (let e = 0; e < entries && cd + 46 <= buf.length; e++) {
      if (dv.getUint32(cd, true) !== 0x02014b50) break;
      const method = dv.getUint16(cd + 10, true);
      const cSize = dv.getUint32(cd + 20, true);
      const nLen = dv.getUint16(cd + 28, true);
      const xLen = dv.getUint16(cd + 30, true);
      const cLen = dv.getUint16(cd + 32, true);
      const lOff = dv.getUint32(cd + 42, true);
      cd += 46 + nLen + xLen + cLen;
      if (lOff + 30 > buf.length || dv.getUint32(lOff, true) !== 0x04034b50) continue;
      const lnLen = dv.getUint16(lOff + 26, true);
      const lxLen = dv.getUint16(lOff + 28, true);
      const dStart = lOff + 30 + lnLen + lxLen;
      const slice = buf.subarray(dStart, dStart + cSize);
      try {
        if (method === 0) {
          const out = new TextDecoder().decode(slice);
          if (out.includes('BEGIN:VCALENDAR')) texts.push(out);
        } else if (method === 8 && typeof DecompressionStream !== 'undefined' && slice.length > 0) {
          const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          const out = await new Response(stream).text();
          if (out.includes('BEGIN:VCALENDAR')) texts.push(out);
        }
      } catch {}
    }
  }
  return texts.join('\n');
}

async function readIcsOrZipFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.length > 30 && buf[0] === 0x50 && buf[1] === 0x4b) {
    return await unpackZipBuffer(buf);
  }
  return new TextDecoder().decode(buf);
}

// Si el usuario pegó por error el ID del calendario (correo), la URL pública embed o el código <iframe src="...">,
// extrae automáticamente el calendario y construye su dirección iCal (.ics).
function normalizeIcsInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/\.ics(\?.*)?$/i.test(s)) return s;
  const iframeMatch = s.match(/src=["']([^"']+)["']/i);
  const candidate = iframeMatch ? iframeMatch[1] : s;
  try {
    const u = new URL(candidate);
    const src = u.searchParams.get('src');
    if (src) return `https://calendar.google.com/calendar/ical/${encodeURIComponent(src)}/public/basic.ics`;
  } catch {}
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    return `https://calendar.google.com/calendar/ical/${encodeURIComponent(s)}/public/basic.ics`;
  }
  return s;
}

async function syncCalendarIcs(url, askPerm = true) {
  const u = normalizeIcsInput(url || state.settings.gCalIcsUrl || '');
  if (askPerm) {
    let origin = 'https://calendar.google.com/*';
    if (u) try { origin = new URL(u).origin + '/*'; } catch {}
    const ok = await chrome.permissions.request({ origins: [origin, 'https://calendar.google.com/*'] }).catch(() => false);
    if (!ok) { toast(t('gPermDenied')); return null; }
  }
  const tryFetchText = async target => {
    const res = await fetch(target, { cache: 'no-store', credentials: 'include' }).catch(() => null);
    if (!res?.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > 30 && buf[0] === 0x50 && buf[1] === 0x4b) {
      const unzipped = await unpackZipBuffer(buf);
      return unzipped.includes('BEGIN:VCALENDAR') ? unzipped : null;
    }
    const text = new TextDecoder().decode(buf);
    return text.includes('BEGIN:VCALENDAR') ? text : null;
  };
  let text = u ? await tryFetchText(u) : null;
  if (!text && u.includes('/public/basic.ics')) {
    text = await tryFetchText(u.replace('/public/basic.ics', '/private/basic.ics'));
  }
  // Si el enlace público falla porque el calendario es privado (¡no hace falta hacerlo público!),
  // intenta exportar directamente el paquete iCal privado de la sesión activa de Google Calendar en Chrome.
  if (!text) {
    text = await tryFetchText('https://calendar.google.com/calendar/u/0/exporticalzip');
  }
  if (!text) return null;
  const events = parseIcsText(text);
  writeJsonCache(GCAL_CACHE_KEY, events);
  repaintGCalCards();
  return events;
}

let lastCalAuto = 0;
async function maybeAutoRefreshGCal() {
  if (Date.now() - lastCalAuto < 300000) return;
  lastCalAuto = Date.now();
  if (state.settings.gCalIcsUrl) await syncCalendarIcs(state.settings.gCalIcsUrl, false);
}

function repaintGCalCards() {
  for (const b of $$('[data-gcal]')) b._tick?.();
}

function fmtEventBadge(ev, now) {
  if (now >= ev.start && now <= ev.end) return { text: t('gCalNow'), live: true };
  const diffMin = Math.round((ev.start - now) / 60000);
  if (diffMin >= 0 && diffMin <= 60) return { text: t('gCalInMin', Math.max(1, diffMin)), soon: true };
  const dStart = new Date(ev.start), dNow = new Date(now);
  if (dayKey(dStart) === dayKey(dNow)) return { text: t('gCalInHr', Math.max(1, Math.round(diffMin / 60))) };
  const tmr = new Date(dNow.getFullYear(), dNow.getMonth(), dNow.getDate() + 1);
  if (dayKey(dStart) === dayKey(tmr)) return { text: t('gCalTomorrow') };
  return { text: fmtWith('md', { day: 'numeric', month: 'short' }).format(dStart) };
}

let qevTargetId = null;
function openQuickEventPrompt(it) {
  const dlg = $('#qevDlg'), form = $('#qevForm');
  if (!dlg || !form) return;
  qevTargetId = it.id;
  form.elements.title.value = '';
  const nextHr = new Date(Date.now() + 3600000);
  form.elements.time.value = `${pad2(nextHr.getHours())}:00`;
  form.elements.url.value = '';
  dlg.showModal();
  form.elements.title.focus();
}

$('#qevForm')?.addEventListener('submit', e => {
  if (e.submitter?.value !== 'ok') return;
  const it = locate(qevTargetId)?.item;
  if (!it) return;
  const f = e.currentTarget.elements;
  const title = f.title.value.trim();
  if (!title) return;
  const [hh, mm] = (f.time.value || '15:00').split(':').map(n => parseInt(n, 10) || 0);
  const now = new Date();
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0).getTime();
  if (start + 3600000 < Date.now()) start += 86400000;
  const meetRaw = f.url.value.trim();
  const meetUrl = /^https?:\/\/\S+\.\S+/i.test(meetRaw) ? meetRaw : '';
  (it.manual ||= []).push({
    id: uid(),
    title,
    start,
    end: start + 3600000,
    allDay: false,
    location: meetUrl ? t('gCalVirtual') : '',
    meetUrl,
    isManual: true,
  });
  saveW();
  repaintGCalCards();
});

function paintGCalCard(it, b, w = 2, h = 2) {
  const isPopup = b.classList.contains('in-modal') || !!b.closest('#widgetBody');
  const now = Date.now();
  const cached = readJsonCache(GCAL_CACHE_KEY, []);
  const manual = (it.manual || []).filter(e => e.end >= now - 15 * 60000).map(e => ({ ...e, isManual: true }));
  const all = [...manual, ...cached].filter(e => e.end >= now - 5 * 60000).sort((a, c) => a.start - c.start);

  const expandBtn = !isPopup && wbtn('⤢', t('open'), () => openWidget(it), 'gcard-dots');
  const menuBtn = wbtn('⋮', t('configure'), () => {
    openMenu([
      !isPopup && entryEl({ label: '⤢  ' + t('open'), act: () => openWidget(it) }),
      entryEl({ label: t('gCalAddQuick'), act: () => openQuickEventPrompt(it) }),
      entryEl({ label: t('gcardRefresh'), act: async () => {
        const list = await syncCalendarIcs(state.settings.gCalIcsUrl, true);
        if (list) toast(t('gIcsSynced', list.length));
      } }),
      entryEl({ label: t('tabGCards') + '…', act: () => { openSettings(); showTab('gcards'); } }),
      entryEl('-'),
      entryEl({ label: t('w_gcal') + ' ↗', act: () => window.open('https://calendar.google.com/', '_blank', 'noopener') }),
    ].filter(Boolean), menuBtn);
  }, 'gcard-dots');

  const moreLink = el('a', {
    class: 'widget-ui gcal-more',
    href: 'https://calendar.google.com/',
    target: '_blank',
    rel: 'noopener',
    onclick: e => { e.stopPropagation(); if (editing) e.preventDefault(); },
  }, el('span', { class: 'gm-txt' }, t('gCalMore') + ' '), '↗');

  const head = el('div', { class: 'w-head gcard-head' },
    el('b', { class: 'gcard-title' }, t('w_gcal')),
    el('div', { class: 'gcard-actions' }, moreLink, expandBtn, menuBtn)
  );

  if (!all.length) {
    const hasSource = !!(state.settings.gCalIcsUrl || cached.length);
    const cta = hasSource
      ? wbtn(t('gCalAddQuick'), t('gCalAddQuick'), () => openQuickEventPrompt(it), 'wb-text gcard-cta')
      : wbtn(t('gCalSetupBtn'), t('gCalSetupBtn'), () => { openSettings(); showTab('gcards'); }, 'wb-text gcard-cta');
    b.replaceChildren(head, el('div', { class: 'w-empty' }, el('span', {}, t('gCalEmpty')), cta));
    return;
  }

  const maxEvents = isPopup ? 12 : (h >= 3 ? 7 : (h === 1 ? 1 : 4));
  const items = all.slice(0, maxEvents).map((ev, idx) => {
    const badge = fmtEventBadge(ev, now);
    const dStart = new Date(ev.start);
    const isToday = dayKey(dStart) === dayKey(new Date(now));
    const datePrefix = !isToday ? fmtWith('md', { day: 'numeric', month: 'short' }).format(dStart) + ' · ' : '';
    const timeTxt = ev.allDay ? t('gCalAllDay') : (datePrefix + fmtTime(dStart));
    const locTxt = ev.location || (ev.meetUrl ? t('gCalVirtual') : '');
    const isFeatured = idx === 0 || isPopup;

    return el('div', {
      class: `gcal-item${badge.live ? ' is-live' : badge.soon ? ' is-soon' : ''}${idx === 0 ? ' is-first' : ''}`,
      onclick: e => {
        if (!editing && !isPopup && !e.target.closest('a, button')) openWidget(it);
      },
    },
      el('div', { class: 'gcal-meta' },
        el('span', { class: 'gcal-time' }, timeTxt),
        el('div', { class: 'gcard-actions' },
          el('span', { class: `gcal-pill${badge.live ? ' live' : badge.soon ? ' soon' : ''}` }, badge.text),
          ev.isManual && el('button', {
            type: 'button',
            class: 'widget-ui gd-hide',
            title: t('delete'),
            onclick: e => {
              e.stopPropagation();
              it.manual = (it.manual || []).filter(m => m.id !== ev.id);
              saveW();
              repaintGCalCards();
            },
          }, '✕')
        )
      ),
      el('div', { class: 'gcal-ev-title', title: ev.title }, ev.title),
      isFeatured && (locTxt || ev.meetUrl) && el('div', { class: 'gcal-subrow' },
        locTxt && el('span', { class: 'gcal-loc' }, '📍 ', locTxt),
        ev.meetUrl && el('a', {
          class: 'widget-ui gcal-join',
          href: ev.meetUrl,
          target: '_blank',
          rel: 'noopener',
          onclick: e => { e.stopPropagation(); if (editing) e.preventDefault(); },
        }, t('gCalJoin') + ' ↗')
      )
    );
  });

  b.replaceChildren(head, el('div', { class: 'gcal-box' }, items));
}

// Pinta todas las copias visibles del widget de respiración (en la pantalla y en su ventana).
function breathePaint(id, only) {
  const st = live.get(id) || { on: false, phase: 0 };
  const phases = ['brIn', 'brHold', 'brOut', 'brHold'];
  for (const b of only ? [only] : $$(`[data-br="${id}"]`)) {
    b.querySelector('.br-orb').className = 'br-orb' + (st.on ? ` p${st.phase}` : '');
    b.querySelector('.br-txt').textContent = st.on ? t(phases[st.phase]) : t('brStart');
  }
}

// ---------- temporizador (sigue corriendo aunque se redibuje la página) ----------
function timerState(it) {
  return liveOf(it, () => ({ mode: 'work', total: (it.work || 25) * 60, left: (it.work || 25) * 60, running: false, end: 0, iv: null }));
}

function timerSet(it, mode) {
  const st = timerState(it);
  clearInterval(st.iv);
  Object.assign(st, { mode, running: false, total: (it[mode] || (mode === 'work' ? 25 : 5)) * 60 });
  st.left = st.total;
  timerPaint(it);
}

function timerToggle(it) {
  const st = timerState(it);
  if (st.running) {
    st.running = false;
    clearInterval(st.iv);
    return;
  }
  // El audio se prepara aquí, durante el clic: Chrome no deja sonar audio creado sin un gesto del usuario.
  try { audioCtx ||= new AudioContext(); audioCtx.resume(); } catch {}
  st.running = true;
  st.end = Date.now() + st.left * 1000;
  st.iv = setInterval(() => {
    const cur = locate(it.id)?.item;
    if (!cur) return disposeWidget(it.id); // el widget se borró (o la pantalla, o se restableció todo)
    st.left = Math.max(0, Math.round((st.end - Date.now()) / 1000));
    timerPaint(cur);
    if (st.left > 0) return;
    beep();
    toast(t(st.mode === 'work' ? 'timerWorkDone' : 'timerRestDone'));
    timerSet(cur, st.mode === 'work' ? 'rest' : 'work');
    renderAll();
  }, 1000);
}

// Detiene lo que un widget tenga corriendo (temporizador, respiración) y olvida su estado en memoria.
function disposeWidget(id) {
  const st = live.get(id);
  if (st) { clearInterval(st.iv); clearInterval(st.timer); }
  live.delete(id);
}

function timerPaint(it) {
  const st = live.get(it.id);
  if (!st) return;
  for (const n of $$(`[data-timer="${it.id}"]`)) n.textContent = mmss(st.left);
  for (const n of $$(`[data-timer-ring="${it.id}"] .ring-fg`)) {
    const c = 2 * Math.PI * 42;
    n.setAttribute('stroke-dasharray', `${(c * st.left / st.total).toFixed(1)} ${c.toFixed(1)}`);
  }
}

let audioCtx = null;
function beep() {
  try {
    audioCtx ||= new AudioContext();
    audioCtx.resume();
    [0, 0.35, 0.7].forEach(at => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.18, audioCtx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + at + 0.3);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + at);
      o.stop(audioCtx.currentTime + at + 0.3);
    });
  } catch {}
}

// ---------- fotos (en IndexedDB, solo en este computador) ----------
const photoUrls = new Map();
async function photoUrl(id) {
  if (photoUrls.has(id)) return photoUrls.get(id);
  const blob = await Store.getFile('photo:' + id).catch(() => null);
  const url = blob ? URL.createObjectURL(blob) : '';
  photoUrls.set(id, url);
  return url;
}
setInterval(() => { if (!document.hidden) for (const b of $$('.w-photos')) b._next?.(); }, 1000);

// ---------- creación, etiquetas y dibujo ----------
function newWidget(kind) {
  const def = WIDGETS[kind], [w, h] = def.size;
  return { id: uid(), type: 'widget', kind, w, h, ...JSON.parse(JSON.stringify(def.defaults || {})), ...(def.init?.() || {}) };
}

const widgetTitle = it => (it.kind === 'countdown' && it.label) || t('w_' + it.kind);

function renderWidget(it, w, h, roomy, inModal = false) {
  const def = WIDGETS[it.kind];
  if (!def) return [el('div', { class: 'tile' }, '?')];
  if (!roomy || (w === 1 && h === 1 && !def.tiny)) {
    const tile = el('div', { class: 'tile wmini' });
    const fill = () => tile.replaceChildren(def.mini?.call(def, it) || el('span', { class: 'glyph' }, def.icon));
    fill();
    tile._tick = fill;
    return [tile, el('span', { class: 'label' }, widgetTitle(it))];
  }
  const body = el('div', { class: `wbody w-${it.kind}${inModal ? ' in-modal' : ''}` });
  def.full(it, body, w, h);
  return [body];
}

// Un solo temporizador para todo lo que cambia con el tiempo, alineado al cambio de minuto.
let tickTimer = null;
function tickClocks() {
  clearTimeout(tickTimer);
  if (document.hidden) return;
  for (const n of $$('.wbody, .wmini')) n._tick?.();
  tickTimer = setTimeout(tickClocks, 60000 - (Date.now() % 60000) + 50);
}
document.addEventListener('visibilitychange', tickClocks);

// ---------- ventana del widget (cuando está compacto o al ampliar) ----------
let widgetOpenId = null;
function openWidget(it) {
  const def = WIDGETS[it.kind];
  if (!def) return;
  widgetOpenId = it.id;
  const isGCard = it.kind === 'gcal' || it.kind === 'gdrive';
  const [w, h] = def.size;
  const wide = Math.max(2, w);
  const tall = it.kind === 'world' ? ((it.zones?.length || 0) > 3 ? 2 : 1) : Math.max(2, h);
  $('#widgetTitle').textContent = widgetTitle(it);
  $('#widgetCfgBtn').hidden = !def.cfg && !isGCard;
  const body = $('#widgetBody');
  body.style.width = (isGCard ? 440 : wide * 150) + 'px';
  body.style.height = (isGCard ? 420 : tall * 150) + 'px';
  body.replaceChildren(...renderWidget(it, wide, tall, true, true));
  if (!$('#widgetDlg').open) $('#widgetDlg').showModal();
}

$('#widgetClose').addEventListener('click', () => $('#widgetDlg').close());
$('#widgetCfgBtn').addEventListener('click', () => {
  const it = locate(widgetOpenId)?.item;
  if (!it) return;
  if (it.kind === 'gcal' || it.kind === 'gdrive') { openSettings(); showTab('gcards'); }
  else openWidgetCfg(it);
});
$('#widgetDlg').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$('#widgetDlg').addEventListener('close', () => { widgetOpenId = null; renderAll(); }); // refresca la vista compacta

// ---------- «Configurar…»: formulario armado a partir de def.cfg ----------
let cfgId = null, cfgDraft = null;
let tzList = null;

function openWidgetCfg(it) {
  const def = WIDGETS[it.kind];
  if (!def?.cfg) return;
  cfgId = it.id;
  cfgDraft = JSON.parse(JSON.stringify(it));
  $('#wcfgTitle').textContent = t('configureW', widgetTitle(it));
  const box = $('#wcfgFields');
  box.replaceChildren(...def.cfg.map(f => cfgField(it.kind, f)));
  $('#wcfgDlg').showModal();
}

function cfgField(kind, f) {
  const label = t(`${kind}_${f.k}`), val = cfgDraft[f.k];
  if (f.type === 'choice') {
    return el('fieldset', { class: 'cfg-choice' }, el('legend', {}, label), el('div', { class: 'choices cfg-opts' }, f.opts.map(o => el('label', { class: `choice cfg-${kind}-${o}` },
      el('input', { type: 'radio', name: 'cfg-' + f.k, value: o, checked: (val || f.opts[0]) === o || null, onchange: () => { cfgDraft[f.k] = o; } }),
      el('span', { class: `cfg-pic pic-${kind}-${o}` }),
      el('b', {}, t(`${kind}_${f.k}_${o}`))))));
  }
  if (f.type === 'zones') {
    const box = el('div', { class: 'stack' });
    const zones = cfgDraft.zones ||= [];

    const drawList = () => {
      box.replaceChildren();
      box.append(el('span', { class: 'cfg-lbl' }, label));

      const list = el('div', { class: 'cfg-zones-list' });
      const now = new Date();

      if (!zones.length) {
        list.append(el('div', { class: 'w-empty' }, el('span', {}, t('world_empty'))));
      } else {
        zones.forEach((z, i) => {
          const row = el('div', { class: 'cfg-zone-row' },
            el('span', {}, friendlyCity(z)),
            el('time', {}, fmtTime(now, z)),
            el('button', {
              type: 'button', class: 'cfg-zone-del', title: t('delete'),
              onclick: () => { zones.splice(i, 1); drawList(); }
            }, '✕')
          );
          list.append(row);
        });
      }
      box.append(list);

      if (zones.length < 6) {
        const searchWrap = el('div', { class: 'cfg-zone-search' });
        const input = el('input', {
          type: 'search',
          placeholder: t('world_search_ph'),
          autocomplete: 'off'
        });
        const results = el('div', { class: 'cfg-zone-results', hidden: true });

        const search = q => {
          const query = q.trim().toLowerCase();
          if (!query) { results.hidden = true; return; }
          const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          const nq = norm(query);

          const matches = [];
          for (const c of WORLD_CITIES) {
            const nameEs = norm(c.name[0]), nameEn = norm(c.name[1]), country = norm(c.country), tz = norm(c.tz);
            if (nameEs.includes(nq) || nameEn.includes(nq) || country.includes(nq) || tz.includes(nq)) {
              matches.push({ title: LANG === 'es' ? c.name[0] : c.name[1], subtitle: c.country, tz: c.tz });
            }
          }

          if (matches.length < 6 && Intl.supportedValuesOf) {
            for (const z of Intl.supportedValuesOf('timeZone')) {
              if (matches.some(m => m.tz === z)) continue;
              const nz = norm(z);
              if (nz.includes(nq)) {
                matches.push({ title: cityOf(z), subtitle: z.split('/')[0] || '', tz: z });
                if (matches.length >= 8) break;
              }
            }
          }

          if (!matches.length) { results.hidden = true; return; }

          results.replaceChildren(...matches.slice(0, 8).map(m => el('button', {
            type: 'button',
            class: 'cfg-zone-item',
            onclick: () => {
              if (!zones.includes(m.tz)) {
                zones.push(m.tz);
                drawList();
              } else {
                input.value = '';
                results.hidden = true;
              }
            }
          },
            el('span', {}, m.title, el('small', {}, ` · ${m.subtitle}`)),
            el('time', {}, fmtTime(now, m.tz))
          )));
          results.hidden = false;
        };

        input.addEventListener('input', () => search(input.value));
        input.addEventListener('keydown', e => { if (e.key === 'Escape') results.hidden = true; });

        searchWrap.append(input, results);
        box.append(searchWrap);
      } else {
        box.append(el('small', { class: 'hint' }, t('world_max')));
      }

      box.append(el('small', { class: 'hint' }, t('zonesTip')));
    };

    drawList();
    return box;
  }
  if (f.type === 'lines') {
    const ta = el('textarea', { rows: 5, spellcheck: 'false', oninput: e => { cfgDraft[f.k] = e.target.value; } });
    ta.value = val || '';
    return el('label', {}, el('span', {}, label), ta, el('small', { class: 'hint' }, t(`${kind}_${f.k}Tip`)));
  }
  if (f.type === 'photos') {
    const grid = el('div', { class: 'cfg-photos' });
    const draw = () => grid.replaceChildren(...(cfgDraft.photos || []).map((id, i) => {
      const img = el('img', { alt: '' });
      photoUrl(id).then(u => { img.src = u; });
      return el('div', { class: 'cfg-ph' }, img, el('button', { type: 'button', class: 'ctrl', title: t('delete'), onclick: () => { cfgDraft.photos.splice(i, 1); draw(); } }, '✕'));
    }));
    const input = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: async e => {
      for (const file of [...e.target.files].slice(0, 30)) {
        const c = await scaleImage(file, 1280);
        const blob = await new Promise(res => c.toBlob(res, 'image/webp', 0.85));
        const id = uid();
        await Store.putFile('photo:' + id, blob);
        (cfgDraft.photos ||= []).push(id);
      }
      e.target.value = '';
      draw();
    } });
    draw();
    return el('div', { class: 'stack' }, el('span', { class: 'cfg-lbl' }, label), grid,
      el('label', { class: 'btn' }, el('span', {}, t('photosAdd')), input), el('small', { class: 'hint' }, t('photosTip')));
  }
  return el('label', {}, el('span', {}, label), el('input', {
    type: f.type, value: val ?? '', min: f.min, max: f.max, maxlength: f.type === 'text' ? 40 : null,
    oninput: e => { cfgDraft[f.k] = f.type === 'number' ? clampInt(e.target.value, f.min, f.max) : e.target.value; },
  }));
}

$('#wcfgForm').addEventListener('submit', e => {
  if (e.submitter?.value !== 'ok') return;
  const it = locate(cfgId)?.item;
  if (!it) return;
  if (cfgDraft.zones) {
    const bad = cfgDraft.zones.filter(z => z && !validTz(z));
    cfgDraft.zones = cfgDraft.zones.filter(z => z && validTz(z));
    if (bad.length) toast(t('zonesInvalid', bad.join(', ')));
  }
  Object.assign(it, cfgDraft);
  if (it.kind === 'timer') disposeWidget(it.id); // aplica los minutos nuevos (y detiene el que corría)
  commit();
  if ($('#widgetDlg').open && widgetOpenId === it.id) openWidget(it);
});
