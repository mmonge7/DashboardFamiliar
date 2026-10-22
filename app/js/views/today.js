// Hoy: franja de cielo (hora, fecha, tiempo de 7 días), lo próximo, la semana, la luz y la compra.
import { h, time, longDay, cap, dayLabel, shortDay, countdown, eurKwh, addDays, startOfDay, statusNote } from '../ui.js';
import { describe } from '../data/weather.js';
import { eventsOn, nowAndNext } from '../data/calendar.js';
import { priceAt, level, cheapestWindow } from '../data/energy.js';
import { currentTariff, periodAt, nextChange, bestWindow, TAX, PERIOD_LABEL, PERIOD_LEVEL } from '../data/tariff.js';
import { periodStrip } from './energy.js';
import { menuPeek } from './menu.js';
import { openNewEvent } from './newEvent.js';
import { shoppingList } from '../data/shopping.js';
import { eventRow, eventWhen, showEvent, demoBanner } from './common.js';

/** Fase del cielo y posición del sol según el amanecer y el atardecer de hoy. */
export function skyPhase(now, day) {
  if (!day) {
    const hh = now.getHours();
    return { phase: hh < 7 || hh >= 21 ? 'noche' : hh < 9 ? 'alba' : hh < 18 ? 'dia' : 'tarde', x: 70, y: 22 };
  }
  const rise = new Date(day.sunrise), set = new Date(day.sunset);
  const m = 60000;
  let phase = 'noche';
  if (now >= rise - 45 * m && now < +rise + 60 * m) phase = 'alba';
  else if (now >= +rise + 60 * m && now < set - 75 * m) phase = 'dia';
  else if (now >= set - 75 * m && now < +set + 40 * m) phase = 'tarde';
  const t = Math.min(1, Math.max(0, (now - rise) / (set - rise)));
  return { phase, x: 12 + t * 76, y: 78 - Math.sin(t * Math.PI) * 62 };
}

function sky(now, weather) {
  const w = weather?.data;
  const sp = skyPhase(now, w?.days?.[0]);
  const forecast = w ? h('div', { class: 'forecast', 'aria-label': 'Previsión de 7 días' },
    w.days.map((d, i) => {
      const date = new Date(`${d.date}T12:00`);
      const { icon, text } = describe(d.code, true);
      return h('div', { class: 'fc-day', title: text },
        h('div', { class: 'fc-name' }, i === 0 ? 'Hoy' : cap(shortDay(date).split(' ')[0])),
        h('div', { class: 'fc-ico', 'aria-label': text }, icon),
        h('div', { class: 'fc-temp' }, `${Math.round(d.max)}°`, h('span', {}, ` ${Math.round(d.min)}°`)),
        h('div', { class: 'fc-rain' }, d.rain >= 20 ? `💧${d.rain}%` : ''));
    })) : h('div', { class: 'forecast' });
  const nowW = w ? describe(w.code, w.isDay) : null;
  return h('section', { class: 'sky', 'data-phase': sp.phase, style: { '--sun-x': `${sp.x}%`, '--sun-y': `${sp.y}%` } },
    h('div', { class: 'sky-sun', 'aria-hidden': 'true' }),
    h('div', {},
      h('div', { class: 'clock', 'aria-label': `Son las ${time(now)}` }, time(now)),
      h('div', { class: 'date' }, cap(longDay(now))),
      nowW && h('div', { class: 'now-weather' }, h('b', {}, `${Math.round(w.temp)}°`), h('span', {}, `${nowW.icon} ${nowW.text}`))),
    forecast);
}

function nextPanel(now, cal) {
  const events = cal?.data?.events || [];
  const { current, next } = nowAndNext(events, now);
  const box = h('section', { class: 'panel' }, h('h2', {}, current.length ? 'Ahora' : 'Lo próximo'));
  const show = current[0] || next;
  if (!show) {
    box.append(h('p', { class: 'empty' }, cal?.data ? 'Nada más en el calendario estas semanas.' : 'Cargando el calendario…'));
  } else {
    const isNow = current.includes(show);
    box.append(
      h('span', { class: 'next-cal' }, h('i', { class: 'dot', style: { background: show.cal.color } }), show.cal.nombre, show.tipo && ` · ${show.tipo.nombre}`),
      h('button', { type: 'button', class: 'panel-link', style: { border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', width: '100%' }, onclick: () => showEvent(show) },
        h('p', { class: 'next-title' }, show.title)),
      h('p', { class: 'next-when' },
        isNow ? [h('span', { class: 'now-badge' }, 'Ahora'), `hasta las ${time(show.end)}`] : cap(countdown(show.start, now))),
      h('p', { class: 'next-meta' }, eventWhen(show)),
      show.location && h('p', { class: 'next-meta' }, `📍 ${show.location}`),
    );
    if (isNow && next) box.append(h('p', { class: 'note' }, `Después: ${next.title}, ${countdown(next.start, now)}`));
  }
  const note = statusNote(cal, 'Calendario');
  if (note) box.append(note);
  return box;
}

function weekPanel(now, cal, tipos) {
  const events = cal?.data?.events || [];
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(now), i));
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', {}, 'Esta semana'),
      h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => openNewEvent(null, tipos) }, '+ Evento')),
    h('div', { class: 'week' }, days.map((d, i) => {
      const list = eventsOn(events, d);
      const menu = list.filter((e) => e.cal.papel === 'menu');
      const rest = list.filter((e) => e.cal.papel !== 'menu');
      return h('div', { class: 'wk-day' + (i === 0 ? ' is-today' : '') },
        h('div', { class: 'wk-label' }, dayLabel(d, now), h('span', {}, d.getDate() + (i < 2 ? ` ${cap(shortDay(d).split(' ')[0])}` : ''))),
        h('div', { class: 'wk-events' },
          rest.length || menu.length ? [...rest.map((e) => eventRow(e, now)), ...menu.map((e) => eventRow(e, now))] : h('span', { class: 'muted' }, 'Libre')));
    })));
}

function energyPeek(now, prices, settings) {
  const t = currentTariff(settings);
  const list = prices?.data || [];
  const box = h('a', { class: 'panel panel-link', href: '#/luz' }, h('h2', {}, 'Luz ahora'));
  const first = settings.aparatos[0];

  if (t.tipo === 'tramos') {
    const p = periodAt(now);
    const nc = nextChange(now);
    box.append(
      h('div', { class: 'big-figure' }, eurKwh(t[p] * TAX), h('small', {}, '€/kWh')),
      h('span', { class: `price-tag ${PERIOD_LEVEL[p]}` }, PERIOD_LABEL[p]),
      periodStrip(now, now, { compact: true }),
      nc && h('p', { class: 'note' }, `${PERIOD_LABEL[nc.period]} ${countdown(nc.at, now)}`));
    const best = first && bestWindow(t, now, first.horas, list);
    if (best && best.start > now) box.append(h('p', { class: 'note' }, `${first.emoji} ${first.nombre}: mejor de ${time(best.start)} a ${time(best.end)}`));
    return box;
  }
  if (t.tipo === 'unico') {
    box.append(
      h('div', { class: 'big-figure' }, eurKwh(t.unico * TAX), h('small', {}, '€/kWh')),
      h('span', { class: 'price-tag media' }, 'Precio único'),
      h('p', { class: 'note' }, 'Igual a cualquier hora, con impuestos.'));
    return box;
  }

  const p = priceAt(list, now);
  if (!p) { box.append(h('p', { class: 'empty' }, prices ? 'Sin precio para esta hora.' : 'Cargando precios…'), statusNote(prices, 'Luz') || ''); return box; }
  const lv = level(p, list);
  box.append(
    h('div', { class: 'big-figure' }, eurKwh(p.eur), h('small', {}, '€/kWh')),
    h('span', { class: `price-tag ${lv}` }, { barata: 'Hora barata', media: 'Precio medio', cara: 'Hora cara' }[lv]));
  const from = new Date(now); from.setMinutes(0, 0, 0);
  const next12 = list.filter((x) => x.at >= from).slice(0, 12);
  const max = Math.max(...next12.map((x) => x.eur));
  box.append(h('div', { class: 'minibars', 'aria-hidden': 'true' },
    next12.map((x, i) => h('i', { class: `${level(x, list)}${i === 0 ? ' now' : ''}`, style: { height: `${Math.max(10, (x.eur / max) * 100)}%` } }))));
  const best = first && cheapestWindow(list, now, first.horas, addDays(startOfDay(now), 2));
  if (best) box.append(h('p', { class: 'note' }, `${first.emoji} ${first.nombre}: mejor de ${time(best.start)} a ${time(best.end)}`));
  return box;
}

function shopPeek(shop) {
  const l = shoppingList(shop?.data);
  const box = h('a', { class: 'panel panel-link', href: '#/compra' }, h('h2', {}, 'Compra'));
  if (!l) { box.append(h('p', { class: 'empty' }, shop?.error ? shop.error.message : 'Cargando la lista…')); return box; }
  const n = l.items.length;
  box.append(h('div', { class: 'big-figure' }, n, h('small', {}, n === 1 ? 'cosa' : 'cosas')));
  if (n) box.append(h('ul', { class: 'shop-peek' }, l.items.slice(0, 4).map((i) => h('li', {}, i.producto))));
  else box.append(h('p', { class: 'note' }, 'La lista está vacía.'));
  return box;
}

export function renderToday(state) {
  const { now, cal, prices, weather, shop, settings, demo } = state;
  return h('div', { class: 'today' },
    demo && demoBanner(),
    sky(now, weather),
    h('div', { class: 'today-grid' },
      h('div', { class: 'today-left' },
        nextPanel(now, cal),
        menuPeek(now, state.menu),
        h('div', { class: 'summary-row' }, energyPeek(now, prices, settings), shopPeek(shop))),
      weekPanel(now, cal, state.tipos)));
}
