// Calendarios de la familia: el servidor guarda las direcciones iCal secretas de Google Calendar y
// las sirve por /api/ics/<clave>; aquí se leen con ical.js y se expanden las repeticiones (RRULE),
// con sus excepciones (EXDATE, RECURRENCE-ID).
import ICAL from '../../vendor/ical.min.js';
import { server, cached } from '../api.js';
import { isDemo, cacheGet } from '../store.js';
import { demoCalendar } from '../demo.js';
import { loadAppEvents } from './events.js';
import { addDays, startOfWeek } from '../ui.js';

const MAX_AGE = 5 * 60000;
const MAX_OCCURRENCES = 20000; // tope por evento repetido (evita bucles con reglas raras)

/** Ventana que se lee: desde el lunes de la semana pasada hasta 6 semanas después. */
export function calWindow(now = new Date()) {
  const from = addDays(startOfWeek(now), -7);
  return { from, to: addDays(from, 7 * 7) };
}

export function parseIcs(text, cal, from, to) {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try { ICAL.TimezoneService.register(tz); } catch { /* zona ya registrada */ }
  }
  const masters = new Map();
  const exceptions = [];
  for (const ve of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(ve);
    if (ve.hasProperty('recurrence-id')) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  const singles = [];
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master) master.relateException(ex);
    else singles.push(ex); // excepción sin evento principal: se trata como suelta
  }

  const out = [];
  const push = (item, start, end) => {
    if (end <= from || start >= to) return;
    const status = item.component.getFirstPropertyValue('status');
    if (status && String(status).toUpperCase() === 'CANCELLED') return;
    const categories = item.component.getAllProperties('categories').flatMap((p) => p.getValues()).map(String);
    out.push({
      id: `${cal.clave}:${item.uid}:${start.toISOString()}`,
      uid: item.uid,
      categories,
      tipoId: String(item.component.getFirstPropertyValue('x-casa-tipo') || ''),
      title: item.summary || '(sin título)',
      start, end,
      allDay: item.startDate.isDate,
      location: item.location || '',
      description: item.description || '',
      cal: { clave: cal.clave, nombre: cal.nombre, color: cal.color, papel: cal.papel || 'events' },
    });
  };

  for (const ev of [...masters.values(), ...singles]) {
    if (!ev.startDate) continue;
    if (!ev.isRecurring()) {
      const start = ev.startDate.toJSDate();
      const end = ev.endDate ? ev.endDate.toJSDate() : new Date(+start + (ev.startDate.isDate ? 86400000 : 3600000));
      push(ev, start, end);
      continue;
    }
    const it = ev.iterator();
    let next, n = 0;
    while ((next = it.next()) && n++ < MAX_OCCURRENCES) {
      if (next.toJSDate() >= to) break;
      const d = ev.getOccurrenceDetails(next);
      push(d.item, d.startDate.toJSDate(), d.endDate.toJSDate());
    }
  }
  return out;
}

function revive(list) {
  return list.map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));
}

/** Todos los eventos de la ventana, ordenados. Devuelve { data: {calendars, events}, stale, error, demo }. */
export async function loadCalendar({ force = false } = {}) {
  const now = new Date();
  if (isDemo()) {
    const demo = demoCalendar(now);
    return { data: demo, demo: true, at: Date.now() };
  }
  const { from, to } = calWindow(now);
  // Si la última copia no tenía calendarios (p. ej. antes de configurarlos), no se reutiliza
  const prev = cacheGet('calendario');
  if (prev && !prev.data?.calendars?.length) force = true;
  const res = await cached('calendario', MAX_AGE, async () => {
    const calendars = await server('calendarios');
    const events = [];
    const errors = [];
    await Promise.all(calendars.map(async (cal) => {
      try {
        const text = await server(`ics/${encodeURIComponent(cal.clave)}`, { as: 'text' });
        events.push(...parseIcs(text, cal, from, to));
      } catch (e) {
        errors.push(`${cal.nombre}: ${e.message}`);
      }
    }));
    if (calendars.length && errors.length === calendars.length) throw new Error(errors.join('; '));
    // Los creados desde la app se leen de iCloud directamente (al día y editables); sustituyen a su copia del
    // calendario público, y los borrados en el iPhone se ocultan aunque el calendario público aún no lo sepa.
    const app = await loadAppEvents();
    const hide = new Set([...(app.borrados || []), ...(app.eventos || []).map((e) => e.uid)]);
    const own = [];
    for (const e of app.eventos || []) {
      try {
        const cal = { clave: `app-${e.destino.id}`, nombre: e.destino.nombre, color: e.destino.color, papel: 'events' };
        for (const ev of parseIcs(e.ics, cal, from, to)) own.push({ ...ev, editable: true, destinoId: e.destino.id, tipoId: e.tipo || ev.tipoId });
      } catch { /* evento ilegible: se ignora */ }
    }
    const all = [...events.filter((ev) => !hide.has(ev.uid)), ...own];
    all.sort((a, b) => a.start - b.start || b.allDay - a.allDay);
    return { calendars, events: all, errors };
  }, { force });
  if (res.data) res.data = { ...res.data, events: revive(res.data.events) };
  return res;
}

/** Eventos que tocan el día [day] (los de varios días aparecen en cada uno). */
export function eventsOn(events, day) {
  const s = new Date(day); s.setHours(0, 0, 0, 0);
  const e = addDays(s, 1);
  return events.filter((ev) => ev.start < e && ev.end > s);
}

/** Lo que está pasando ahora (sin contar los de día completo) y lo siguiente. */
export function nowAndNext(events, now = new Date()) {
  const timed = events.filter((e) => !e.allDay);
  const current = timed.filter((e) => e.start <= now && e.end > now);
  const next = timed.find((e) => e.start > now) || null;
  return { current, next };
}
