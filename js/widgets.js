'use strict';
// Widgets sin internet: reloj, notas y tareas. Ocupan espacios como un icono.
// En 1×1, o fuera de la cuadrícula, se ven compactos y al hacer clic se abren en una ventana.

const WIDGETS = {
  clock: { glyph: '🕒', size: [2, 1] },
  notes: { glyph: '📝', size: [2, 2] },
  todo:  { glyph: '✅', size: [2, 2] },
};

function newWidget(kind) {
  const [w, h] = WIDGETS[kind].size;
  return { id: uid(), type: 'widget', kind, w, h, ...(kind === 'notes' ? { text: '' } : kind === 'todo' ? { todos: [] } : {}) };
}

const widgetTitle = it => t('w_' + it.kind);

function renderWidget(it, w, h, roomy) {
  if (!roomy || (w === 1 && h === 1)) {
    const tile = el('div', { class: 'tile' }, it.kind === 'clock'
      ? el('span', { class: 'clock-mini', dataset: { clock: 'time' } })
      : el('span', { class: 'glyph' }, WIDGETS[it.kind]?.glyph || '?'));
    const done = (it.todos || []).filter(x => x.done).length;
    const label = it.kind === 'todo' && it.todos?.length ? `${widgetTitle(it)} ${done}/${it.todos.length}` : widgetTitle(it);
    return [tile, el('span', { class: 'label' }, label)];
  }
  const body = el('div', { class: `wbody w-${it.kind}` });
  if (it.kind === 'clock') body.append(el('div', { class: 'clock-time', dataset: { clock: 'time' } }), el('div', { class: 'clock-date', dataset: { clock: 'date' } }));
  else if (it.kind === 'notes') body.append(notesUi(it));
  else if (it.kind === 'todo') body.append(todoUi(it));
  return [body];
}

function notesUi(it) {
  const ta = el('textarea', { class: 'widget-ui notes', placeholder: t('notesPh'), spellcheck: 'false', readonly: editing || null });
  ta.value = it.text || '';
  ta.addEventListener('input', () => { it.text = ta.value; Store.save(state); });
  return ta;
}

function todoUi(it) {
  const list = el('ul', { class: 'todo-list' });
  const save = () => { Store.save(state); draw(); };
  const draw = () => list.replaceChildren(...(it.todos || []).map((td, i) => el('li', { class: td.done ? 'done' : null },
    el('label', {},
      el('input', { type: 'checkbox', class: 'widget-ui', checked: td.done || null, onchange: e => { td.done = e.target.checked; save(); } }),
      el('span', {}, td.t)),
    el('button', { type: 'button', class: 'widget-ui todo-del', title: t('delete'), onclick: () => { it.todos.splice(i, 1); save(); } }, '✕'))));
  const input = el('input', {
    class: 'widget-ui todo-add', placeholder: t('todoPh'), maxlength: 140,
    onkeydown: e => {
      if (e.key !== 'Enter' || !input.value.trim()) return;
      (it.todos ||= []).push({ t: input.value.trim(), done: false });
      input.value = '';
      save();
    },
  });
  draw();
  return el('div', { class: 'todo' }, list, input);
}

// Un solo temporizador para todos los relojes, alineado al cambio de minuto y en pausa si la pestaña no se ve.
let clockTimer = null, fmtKey = '', timeFmt, dateFmt;
function tickClocks() {
  clearTimeout(clockTimer);
  const nodes = $$('[data-clock]');
  if (!nodes.length || document.hidden) return;
  const key = LANG + state.settings.clock24;
  if (key !== fmtKey) {
    fmtKey = key;
    timeFmt = new Intl.DateTimeFormat(LANG, { hour: 'numeric', minute: '2-digit', hourCycle: state.settings.clock24 ? 'h23' : 'h12' });
    dateFmt = new Intl.DateTimeFormat(LANG, { weekday: 'long', day: 'numeric', month: 'long' });
  }
  const now = new Date(), time = timeFmt.format(now), date = dateFmt.format(now);
  for (const n of nodes) n.textContent = n.dataset.clock === 'date' ? date : time;
  clockTimer = setTimeout(tickClocks, 60000 - (now.getTime() % 60000) + 50);
}
document.addEventListener('visibilitychange', tickClocks);

function openWidget(it) {
  $('#widgetTitle').textContent = widgetTitle(it);
  $('#widgetBody').replaceChildren(...renderWidget(it, 4, 3, true));
  $('#widgetDlg').showModal();
  tickClocks();
}

$('#widgetClose').addEventListener('click', () => $('#widgetDlg').close());
$('#widgetDlg').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$('#widgetDlg').addEventListener('close', () => renderAll()); // refresca el contador compacto
