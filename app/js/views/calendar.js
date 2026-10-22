// Calendario de pared: cinco semanas de lunes a domingo, con el tiempo de cada día cuando se conoce.
import { h, time, cap, monthYear, addDays, startOfWeek, startOfDay, sameDay, longDay, openSheet, statusNote } from '../ui.js';
import { eventsOn } from '../data/calendar.js';
import { describe } from '../data/weather.js';
import { eventRow, showEvent, demoBanner } from './common.js';

const WEEKS = 5;
const MAX_CHIPS = 4;
const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
let offset = 0; // semanas desplazadas respecto a la actual (-1 … +2: lo que hay cargado)

/** «Octubre de 2026» o, si las semanas cruzan de mes, «Octubre y noviembre de 2026». */
function title(a, b) {
  if (a.getMonth() === b.getMonth()) return cap(monthYear(a));
  const m = (d) => d.toLocaleDateString('es-ES', { month: 'long' });
  if (a.getFullYear() === b.getFullYear()) return `${cap(m(a))} y ${m(b)} de ${b.getFullYear()}`;
  return `${cap(monthYear(a))} y ${monthYear(b)}`;
}

function chip(ev) {
  return h('button', {
    type: 'button', class: 'chip' + (ev.allDay ? ' all-day' : ''), style: { '--c': ev.cal.color },
    onclick: () => showEvent(ev), title: ev.title,
  }, !ev.allDay && h('b', {}, time(ev.start)), ev.title.replace(/^(Menú|Comedor):\s*/i, '🏫 '));
}

function dayList(day, list, now) {
  openSheet(h('div', { class: 'sheet-body' },
    h('h2', {}, cap(longDay(day))),
    h('div', { class: 'wk-events', style: { marginTop: '8px' } }, list.map((e) => eventRow(e, now)))));
}

export function renderCalendar(state, rerender, reload) {
  const { now, cal, weather, demo } = state;
  const events = cal?.data?.events || [];
  const calendars = cal?.data?.calendars || [];
  const first = addDays(startOfWeek(now), offset * 7);
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(first, i));
  const fc = new Map((weather?.data?.days || []).map((d) => [d.date, d]));
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const go = (delta) => { offset = Math.max(-1, Math.min(2, offset + delta)); rerender(); };

  return h('div', {},
    demo && demoBanner(),
    h('header', { class: 'page-head' },
      h('div', {}, h('h1', {}, title(first, addDays(first, WEEKS * 7 - 1))),
        h('div', { class: 'legend', style: { marginTop: '6px' } }, calendars.map((c) => h('span', {}, h('i', { class: 'dot', style: { background: c.color } }), c.nombre)))),
      h('div', { class: 'cal-nav' },
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => go(-1), disabled: offset <= -1 }, 'Semana anterior'),
        offset !== 0 && h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { offset = 0; rerender(); } }, 'Hoy'),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => go(1), disabled: offset >= 2 }, 'Semana siguiente'),
        !demo && h('button', { type: 'button', class: 'btn btn-quiet', onclick: (e) => { e.currentTarget.disabled = true; e.currentTarget.textContent = 'Actualizando…'; reload({ force: true }); } }, 'Actualizar'))),
    h('div', { class: 'wall', role: 'grid' },
      DOW.map((d) => h('div', { class: 'wall-head', role: 'columnheader' }, d)),
      days.map((d) => {
        const list = eventsOn(events, d);
        const w = fc.get(key(d));
        const cls = ['wall-cell'];
        if (sameDay(d, now)) cls.push('is-today');
        if (d < startOfDay(now)) cls.push('other'); // días ya pasados, más apagados
        const shown = list.slice(0, MAX_CHIPS);
        return h('div', { class: cls.join(' '), role: 'gridcell' },
          h('div', { class: 'wall-num' }, h('b', {}, d.getDate()), w && h('small', { title: describe(w.code).text }, `${describe(w.code).icon} ${Math.round(w.max)}°`)),
          shown.map(chip),
          list.length > MAX_CHIPS && h('button', { type: 'button', class: 'chip-more', style: { border: 0, background: 'none', textAlign: 'left', cursor: 'pointer' }, onclick: () => dayList(d, list, now) }, `y ${list.length - MAX_CHIPS} más`));
      })),
    statusNote(cal, 'Calendario'),
    cal?.data?.errors?.length ? h('p', { class: 'note note-error' }, `No se pudo leer: ${cal.data.errors.join('; ')}`) : null);
}
