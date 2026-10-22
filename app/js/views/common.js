// Piezas compartidas entre pantallas: fila de evento, detalle de una cita y aviso de demostración.
import { h, time, longDay, cap, openSheet, sameDay, addDays, toast } from '../ui.js';
import { setEventTipo } from '../data/events.js';

export function eventWhen(ev) {
  if (ev.allDay) {
    const last = addDays(ev.end, -1);
    return sameDay(ev.start, last) ? `${cap(longDay(ev.start))}, todo el día` : `Del ${longDay(ev.start)} al ${longDay(last)}`;
  }
  return sameDay(ev.start, ev.end)
    ? `${cap(longDay(ev.start))}, de ${time(ev.start)} a ${time(ev.end)}`
    : `Del ${longDay(ev.start)} a las ${time(ev.start)} al ${longDay(ev.end)} a las ${time(ev.end)}`;
}

// Tipologías actuales (las pone main.js en cada repintado) para poder cambiar la de un evento desde su detalle
let tiposCfg = null;
export function setTiposCfg(cfg) { tiposCfg = cfg; }

function tipoPicker(ev) {
  if (!tiposCfg?.tipos?.length || !ev.uid || ev.cal.papel === 'menu') return null;
  const sel = h('select', { 'aria-label': 'Tipología' },
    h('option', { value: '', selected: !ev.tipo }, 'Sin tipología'),
    tiposCfg.tipos.map((t) => h('option', { value: t.id, selected: ev.tipo?.id === t.id }, t.nombre)));
  sel.addEventListener('change', async () => {
    sel.disabled = true;
    try {
      await setEventTipo(tiposCfg, ev.uid, sel.value);
      toast('Tipología guardada');
      window.dispatchEvent(new Event('casa:recargar'));
    } catch (e) { toast(`No se pudo guardar: ${e.message}`); }
    sel.disabled = false;
  });
  return h('div', { class: 'field', style: { marginTop: '6px' } }, h('label', {}, 'Tipología'), sel);
}

export function showEvent(ev) {
  openSheet(h('div', { class: 'sheet-body' },
    h('span', { class: 'next-cal' }, h('i', { class: 'dot', style: { background: ev.cal.color } }), ev.cal.nombre,
      ev.tipo && h('span', { class: 'tipo-tag', style: { '--c': ev.tipo.color } }, ev.tipo.nombre)),
    h('h2', {}, ev.title),
    h('p', { class: 'next-when' }, eventWhen(ev)),
    ev.location && h('p', { class: 'soft' }, `📍 ${ev.location}`),
    ev.description && h('p', { class: 'sheet-desc' }, ev.description),
    ev.pending && h('p', { class: 'note' }, 'Recién creado: aparecerá en tu iPhone en unos segundos.'),
    tipoPicker(ev),
  ));
}

/** Fila compacta: hora + título con la marca de color del calendario. */
export function eventRow(ev, now = new Date()) {
  if (ev.cal.papel === 'menu') {
    return h('button', { type: 'button', class: 'ev ev-menu-row', onclick: () => showEvent(ev), style: { gridTemplateColumns: '1fr' } },
      h('span', { class: 'ev-menu' }, ev.title.replace(/^(Menú|Comedor):\s*/i, '')));
  }
  return h('button', {
    type: 'button',
    class: 'ev' + (ev.end <= now ? ' past' : ''),
    style: { '--c': ev.color || ev.cal.color },
    onclick: () => showEvent(ev),
    'aria-label': `${ev.title}, ${eventWhen(ev)}`,
  },
  h('span', { class: 'ev-time' }, ev.allDay ? 'Día' : time(ev.start)),
  h('span', { class: 'ev-title' }, ev.title));
}

export function demoBanner() {
  return h('div', { class: 'banner' },
    h('span', {}, 'El calendario y la compra son de ejemplo hasta que conectes la app.'),
    h('a', { href: '#/ajustes' }, 'Conectar'));
}
