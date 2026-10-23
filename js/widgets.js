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
    full(it, b) {
      const draw = () => {
        const zones = (it.zones || []).filter(Boolean);
        b.classList.toggle('dense', zones.length > 3);
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
    icon: '🧮', size: [2, 2],
    full(it, b) {
      const st = liveOf(it, () => ({ cur: '0', prev: null, op: null, fresh: true }));
      const disp = el('div', { class: 'calc-disp' });
      const num = s => parseFloat(s) || 0;
      const run = (a, op, c) => ({ '+': a + c, '−': a - c, '×': a * c, '÷': c === 0 ? NaN : a / c }[op]);
      const show = () => { const v = parseFloat(st.cur); disp.textContent = /NaN|Infinity/.test(st.cur) ? 'Error' : st.cur.length > 12 ? String(+v.toPrecision(10)) : st.cur; };
      const press = k => {
        if (/\d/.test(k)) { st.cur = st.fresh || st.cur === '0' ? k : st.cur + k; st.fresh = false; }
        else if (k === ',') { if (st.fresh) { st.cur = '0.'; st.fresh = false; } else if (!st.cur.includes('.')) st.cur += '.'; }
        else if (k === 'C') Object.assign(st, { cur: '0', prev: null, op: null, fresh: true });
        else if (k === '±') st.cur = String(-num(st.cur));
        else if (k === '%') st.cur = String(num(st.cur) / 100);
        else if (k === '=') { if (st.op) { st.cur = String(run(st.prev, st.op, num(st.cur))); st.op = null; st.fresh = true; } }
        else { if (st.op && !st.fresh) st.cur = String(run(st.prev, st.op, num(st.cur))); st.prev = num(st.cur); st.op = k; st.fresh = true; }
        show();
      };
      const keys = ['C', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', ',', '='];
      b.append(disp, el('div', { class: 'calc-keys' }, keys.map(k => wbtn(k, k, () => press(k), /[÷×−+=]/.test(k) ? 'op' : k === '0' ? 'zero' : ''))));
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
};

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

function renderWidget(it, w, h, roomy) {
  const def = WIDGETS[it.kind];
  if (!def) return [el('div', { class: 'tile' }, '?')];
  if (!roomy || (w === 1 && h === 1 && !def.tiny)) {
    const tile = el('div', { class: 'tile wmini' });
    const fill = () => tile.replaceChildren(def.mini?.call(def, it) || el('span', { class: 'glyph' }, def.icon));
    fill();
    tile._tick = fill;
    return [tile, el('span', { class: 'label' }, widgetTitle(it))];
  }
  const body = el('div', { class: `wbody w-${it.kind}` });
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

// ---------- ventana del widget (cuando está compacto) ----------
let widgetOpenId = null;
function openWidget(it) {
  const def = WIDGETS[it.kind];
  if (!def) return;
  widgetOpenId = it.id;
  const [w, h] = def.size;
  const wide = Math.max(2, w);
  const tall = it.kind === 'world' ? ((it.zones?.length || 0) > 3 ? 2 : 1) : Math.max(2, h);
  $('#widgetTitle').textContent = widgetTitle(it);
  $('#widgetCfgBtn').hidden = !def.cfg;
  const body = $('#widgetBody');
  body.style.width = wide * 150 + 'px';
  body.style.height = tall * 150 + 'px';
  body.replaceChildren(...renderWidget(it, wide, tall, true));
  if (!$('#widgetDlg').open) $('#widgetDlg').showModal();
}

$('#widgetClose').addEventListener('click', () => $('#widgetDlg').close());
$('#widgetCfgBtn').addEventListener('click', () => { const it = locate(widgetOpenId)?.item; if (it) openWidgetCfg(it); });
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
