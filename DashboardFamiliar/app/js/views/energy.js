// Luz: precio PVPC por horas (hoy y, desde las 20:30, mañana), mejores horas para cada aparato y ahorro estimado.
import { h, svg, time, eurKwh, euros, addDays, startOfDay, sameDay, statusNote } from '../ui.js';
import { priceAt, level, cheapestWindow, priciestWindow, average, tomorrowKnown } from '../data/energy.js';
import { demoBanner } from './common.js';

function chart(list, now) {
  const W = 960, H = 300, padL = 62, padB = 34, padT = 12;
  const max = Math.max(0.3, Math.ceil(Math.max(...list.map((p) => p.eur)) * 20) / 20);
  const n = list.length;
  const bw = (W - padL) / n;
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const nodes = [];
  for (let v = 0; v <= max + 1e-9; v += 0.05) {
    nodes.push(svg('line', { class: 'grid', x1: padL, x2: W, y1: y(v), y2: y(v) }));
    nodes.push(svg('text', { x: padL - 8, y: y(v) + 4, 'text-anchor': 'end' }, v.toFixed(2).replace('.', ',')));
  }
  const hourNow = new Date(now); hourNow.setMinutes(0, 0, 0);
  list.forEach((p, i) => {
    const x = padL + i * bw;
    const cls = `bar ${level(p, list)}${p.at < hourNow ? ' past' : ''}`;
    nodes.push(svg('rect', { class: cls, x: x + 1.5, y: y(p.eur), width: Math.max(1, bw - 3), height: Math.max(1, y(0) - y(p.eur)), rx: 3 },
      svg('title', {}, `${time(p.at)}: ${eurKwh(p.eur)} €/kWh`)));
    if (p.at.getHours() % 3 === 0) nodes.push(svg('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle' }, String(p.at.getHours()).padStart(2, '0')));
    if (i > 0 && p.at.getHours() === 0) {
      nodes.push(svg('line', { class: 'day-split', x1: x, x2: x, y1: padT, y2: H - padB }));
      nodes.push(svg("text", { x: x + 6, y: padT + 16 }, "mañana"));
    }
  });
  const iNow = list.findIndex((p) => +p.at === +hourNow);
  if (iNow >= 0) {
    const x = padL + (iNow + now.getMinutes() / 60) * bw;
    nodes.push(svg('line', { class: 'now-line', x1: x, x2: x, y1: padT, y2: H - padB }));
  }
  return svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Precio de la luz por horas' }, nodes);
}

function windowLabel(w, now) {
  const day = sameDay(w.start, now) ? '' : 'mañana ';
  return `${day}${time(w.start)}–${time(w.end)}`;
}

export function renderEnergy(state) {
  const { now, prices, settings, demo } = state;
  const list = prices?.data || [];
  const head = h('header', { class: 'page-head' }, h('h1', {}, 'Precio de la luz'), h('span', { class: 'sub' }, 'PVPC de Red Eléctrica, en €/kWh'));
  if (!list.length) {
    return h('div', {}, demo && demoBanner(), head,
      h('section', { class: 'panel' }, h('p', { class: 'empty' }, prices ? 'No hay precios disponibles ahora mismo.' : 'Cargando precios…'), statusNote(prices, 'Luz')));
  }
  const today = list.filter((p) => sameDay(p.at, now));
  const cur = priceAt(list, now);
  const minP = today.reduce((a, b) => (b.eur < a.eur ? b : a), today[0]);
  const maxP = today.reduce((a, b) => (b.eur > a.eur ? b : a), today[0]);
  const until = addDays(startOfDay(now), 2);
  const known = tomorrowKnown(list, now);

  const stats = h('div', { class: 'energy-now' },
    cur && h('div', {}, h('div', { class: 'big-figure' }, eurKwh(cur.eur), h('small', {}, '€/kWh ahora')),
      h('span', { class: `price-tag ${level(cur, list)}` }, { barata: 'Hora barata', media: 'Precio medio', cara: 'Hora cara' }[level(cur, list)])),
    h('div', { class: 'stat' }, h('span', {}, 'Media de hoy'), h('b', {}, eurKwh(average(today)))),
    h('div', { class: 'stat' }, h('span', {}, `Más barata (${time(minP.at)})`), h('b', { style: { color: 'var(--cheap)' } }, eurKwh(minP.eur))),
    h('div', { class: 'stat' }, h('span', {}, `Más cara (${time(maxP.at)})`), h('b', { style: { color: 'var(--dear)' } }, eurKwh(maxP.eur))));

  const rows = settings.aparatos.map((a) => {
    const w = cheapestWindow(list, now, a.horas, until);
    if (!w) {
      return h('div', { class: 'best-row' }, h('span', { class: 'emo', 'aria-hidden': 'true' }, a.emoji),
        h('div', {}, h('h3', {}, a.nombre), h('p', { class: 'soft' }, known ? 'Ningún tramo sale por debajo de la media.' : 'Lo que queda de hoy es caro: espera al precio de mañana.')));
    }
    const costBest = a.kwh * w.avg;
    const startNow = cheapestNowCost(list, now, a.horas);
    const saving = startNow != null ? a.kwh * startNow - costBest : 0;
    return h('div', { class: 'best-row' }, h('span', { class: 'emo', 'aria-hidden': 'true' }, a.emoji),
      h('div', {},
        h('h3', {}, a.nombre),
        h('p', { class: 'best-when' }, windowLabel(w, now)),
        h('p', { class: 'soft' }, `${a.horas} h a ${eurKwh(w.avg)} €/kWh, unos ${euros(costBest)}`),
        saving >= 0.05 && h('p', { class: 'best-save' }, `${euros(saving)} menos que empezar ahora`)));
  });
  const avoid = priciestWindow(list, now);
  if (avoid) {
    rows.push(h('div', { class: 'best-row warn' }, h('span', { class: 'emo', 'aria-hidden': 'true' }, '⛔'),
      h('div', {}, h('h3', {}, 'Mejor evitar'), h('p', { class: 'best-when' }, windowLabel(avoid, now)), h('p', { class: 'soft' }, `${eurKwh(avoid.avg)} €/kWh de media`))));
  }

  return h('div', {},
    demo && demoBanner(),
    head,
    h('div', { class: 'energy-grid' },
      h('section', { class: 'panel' }, stats, chart(list, now),
        !known && h('p', { class: 'note' }, 'El precio de mañana se publica hacia las 20:30.'),
        statusNote(prices, 'Luz')),
      h('section', { class: 'panel' }, h('h2', {}, 'Mejores horas'), h('div', { class: 'best' }, rows),
        h('p', { class: 'tip' }, 'El consumo de cada aparato se cambia en Ajustes. El ahorro es una estimación con el precio PVPC de cada hora.'))));
}

/** Coste medio (€/kWh) de empezar ahora mismo con un aparato de [hours] horas; null si no hay datos suficientes. */
function cheapestNowCost(list, now, hours) {
  const from = new Date(now); from.setMinutes(0, 0, 0);
  const w = list.filter((p) => p.at >= from).slice(0, hours);
  return w.length === hours ? w.reduce((s, p) => s + p.eur, 0) / hours : null;
}
