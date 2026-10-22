// Piezas compartidas entre pantallas: fila de evento, detalle de una cita y aviso de demostración.
import { h, time, longDay, cap, openSheet, sameDay, addDays } from '../ui.js';

export function eventWhen(ev) {
  if (ev.allDay) {
    const last = addDays(ev.end, -1);
    return sameDay(ev.start, last) ? `${cap(longDay(ev.start))}, todo el día` : `Del ${longDay(ev.start)} al ${longDay(last)}`;
  }
  return sameDay(ev.start, ev.end)
    ? `${cap(longDay(ev.start))}, de ${time(ev.start)} a ${time(ev.end)}`
    : `Del ${longDay(ev.start)} a las ${time(ev.start)} al ${longDay(ev.end)} a las ${time(ev.end)}`;
}

export function showEvent(ev) {
  openSheet(h('div', { class: 'sheet-body' },
    h('span', { class: 'next-cal' }, h('i', { class: 'dot', style: { background: ev.cal.color } }), ev.cal.nombre),
    h('h2', {}, ev.title),
    h('p', { class: 'next-when' }, eventWhen(ev)),
    ev.location && h('p', { class: 'soft' }, `📍 ${ev.location}`),
    ev.description && h('p', { class: 'sheet-desc' }, ev.description),
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
    style: { '--c': ev.cal.color },
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
