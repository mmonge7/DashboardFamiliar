// Luz: lo que pagas ahora con tu tarifa, cuándo cambia de tramo, las mejores horas para cada aparato
// (con su coste e impuestos) y, como referencia, el PVPC del día.
import { h, svg, time, eurKwh, euros, addDays, startOfDay, sameDay, dayLabel, countdown, statusNote } from '../ui.js';
import { priceAt, level, average, tomorrowKnown, priciestWindow } from '../data/energy.js';
import {
  PRESETS, TAX, PERIOD_LABEL, PERIOD_LEVEL, periodAt, daySpans, nextChange, bestWindow, startNowAvg, currentTariff,
} from '../data/tariff.js';
import { demoBanner } from './common.js';

function pvpcChart(list, now) {
  const W = 960, H = 300, padL = 62, padB = 34, padT = 12;
  const max = Math.max(0.3, Math.ceil(Math.max(...list.map((p) => p.eur)) * 20) / 20);
  const bw = (W - padL) / list.length;
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const nodes = [];
  for (let v = 0; v <= max + 1e-9; v += 0.05) {
    nodes.push(svg('line', { class: 'grid', x1: padL, x2: W, y1: y(v), y2: y(v) }));
    nodes.push(svg('text', { x: padL - 8, y: y(v) + 4, 'text-anchor': 'end' }, v.toFixed(2).replace('.', ',')));
  }
  const hourNow = new Date(now); hourNow.setMinutes(0, 0, 0);
  list.forEach((p, i) => {
    const x = padL + i * bw;
    nodes.push(svg('rect', { class: `bar ${level(p, list)}${p.at < hourNow ? ' past' : ''}`, x: x + 1.5, y: y(p.eur), width: Math.max(1, bw - 3), height: Math.max(1, y(0) - y(p.eur)), rx: 3 },
      svg('title', {}, `${time(p.at)}: ${eurKwh(p.eur)} €/kWh`)));
    if (p.at.getHours() % 3 === 0) nodes.push(svg('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle' }, String(p.at.getHours()).padStart(2, '0')));
    if (i > 0 && p.at.getHours() === 0) {
      nodes.push(svg('line', { class: 'day-split', x1: x, x2: x, y1: padT, y2: H - padB }));
      nodes.push(svg('text', { x: x + 6, y: padT + 16 }, 'mañana'));
    }
  });
  const iNow = list.findIndex((p) => +p.at === +hourNow);
  if (iNow >= 0) {
    const x = padL + (iNow + now.getMinutes() / 60) * bw;
    nodes.push(svg('line', { class: 'now-line', x1: x, x2: x, y1: padT, y2: H - padB }));
  }
  return svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Precio PVPC por horas' }, nodes);
}

/** Franja de 24 h con los tramos del día y la hora actual marcada. */
export function periodStrip(day, now, { compact = false } = {}) {
  const spans = daySpans(day);
  const isToday = sameDay(day, now);
  const pct = ((now - startOfDay(now)) / 86400000) * 100;
  return h('div', { class: 'strip' + (compact ? ' strip-compact' : ''), role: 'img', 'aria-label': spans.map((s) => `${PERIOD_LABEL[s.period]} de ${time(s.start)} a ${time(s.end)}`).join(', ') },
    spans.map((s) => h('div', {
      class: `strip-seg ${PERIOD_LEVEL[s.period]}`,
      style: { flexGrow: (s.end - s.start) / 3600000 },
    }, !compact && h('span', {}, PERIOD_LABEL[s.period]), !compact && h('small', {}, `${s.start.getHours()}–${s.end.getHours() || 24} h`))),
    isToday && h('i', { class: 'strip-now', style: { left: `${pct}%` } }));
}

function rangeLabel(w, now) {
  const day = sameDay(w.start, now) ? '' : `${dayLabel(w.start, now).toLowerCase()} `;
  return `${day}${time(w.start)}–${time(w.end)}`;
}

function applianceRows(t, now, settings, pvpc) {
  return settings.aparatos.map((a) => {
    const nowAvg = startNowAvg(t, now, a.horas, pvpc);
    const costNow = nowAvg != null ? a.kwh * nowAvg * TAX : null;
    const w = bestWindow(t, now, a.horas, pvpc);
    const emo = h('span', { class: 'emo', 'aria-hidden': 'true' }, a.emoji);
    if (!w) {
      // Precio único: da igual la hora
      return h('div', { class: 'best-row' }, emo, h('div', {},
        h('h3', {}, a.nombre),
        h('p', { class: 'best-when' }, 'A cualquier hora'),
        costNow != null && h('p', { class: 'soft' }, `Unos ${euros(costNow)} con impuestos (${a.kwh.toLocaleString('es-ES')} kWh)`)));
    }
    const costBest = a.kwh * w.avg * TAX;
    const saving = costNow != null ? costNow - costBest : 0;
    const startsNow = w.start <= now;
    return h('div', { class: 'best-row' }, emo, h('div', {},
      h('h3', {}, a.nombre),
      h('p', { class: 'best-when' }, startsNow ? `Ya: hasta las ${time(w.end)}` : rangeLabel(w, now)),
      h('p', { class: 'soft' }, `Unos ${euros(costBest)} con impuestos`),
      saving >= 0.05 && h('p', { class: 'best-save' }, `${euros(saving)} menos que empezar ahora`)));
  });
}

/** Con precio único: cuánto costaría cargar el coche (el primer aparato) en el valle de una tarifa de tres tramos. */
function tramosHint(settings) {
  const a = settings.aparatos[0];
  const t = settings.tarifa;
  if (!a || t.tipo !== 'unico') return null;
  const ref = PRESETS.nufri;
  const mine = a.kwh * t.unico * TAX;
  const valle = a.kwh * ref.valle * TAX;
  if (mine - valle < 0.1) return null;
  return h('p', { class: 'tip' },
    `Con precio único, la hora no cambia lo que pagas. Con una tarifa de tres tramos (por ejemplo ${ref.nombre}, valle a ${eurKwh(ref.valle)} €/kWh), `
    + `«${a.nombre.toLowerCase()}» de madrugada costaría ${euros(valle)} en lugar de ${euros(mine)}.`);
}

function tariffPanel(t, now, settings, pvpc) {
  const parts = [];
  if (t.tipo === 'tramos') {
    const p = periodAt(now);
    const nc = nextChange(now);
    const price = t[p];
    parts.push(
      h('div', { class: 'energy-now' },
        h('div', {},
          h('div', { class: 'big-figure' }, eurKwh(price * TAX), h('small', {}, '€/kWh ahora')),
          h('span', { class: `price-tag ${PERIOD_LEVEL[p]}` }, PERIOD_LABEL[p])),
        ['valle', 'llano', 'punta'].map((k) => h('div', { class: 'stat' }, h('span', {}, PERIOD_LABEL[k]), h('b', { style: { color: `var(--${{ valle: 'cheap', llano: 'mid', punta: 'dear' }[k]})` } }, eurKwh(t[k] * TAX))))),
      nc && h('p', { class: 'next-when', style: { marginBottom: '14px' } }, `${PERIOD_LABEL[nc.period]} ${countdown(nc.at, now)}`),
      h('div', { class: 'strips' },
        [0, 1].map((i) => {
          const d = addDays(startOfDay(now), i);
          return h('div', { class: 'strip-row' }, h('span', { class: 'strip-day' }, dayLabel(d, now)), periodStrip(d, now));
        })),
      h('p', { class: 'note' }, 'Precios con impuesto eléctrico e IVA. Sábados, domingos y festivos nacionales son valle todo el día.'));
  } else if (t.tipo === 'unico') {
    parts.push(
      h('div', { class: 'energy-now' },
        h('div', {},
          h('div', { class: 'big-figure' }, eurKwh(t.unico * TAX), h('small', {}, '€/kWh a cualquier hora')),
          h('span', { class: 'price-tag media' }, 'Precio único')),
        h('div', { class: 'stat' }, h('span', {}, 'Sin impuestos'), h('b', {}, eurKwh(t.unico)))),
      h('p', { class: 'note' }, 'Con impuesto eléctrico e IVA. Si tu compañía cambia el precio, actualízalo en Ajustes.'));
  }
  return h('section', { class: 'panel' }, parts,
    pvpc?.length ? [h('h2', { style: { marginTop: '22px' } }, 'PVPC de hoy, como referencia'), pvpcChart(pvpc, now)] : null);
}

function pvpcPanel(list, now, prices) {
  const today = list.filter((p) => sameDay(p.at, now));
  const cur = priceAt(list, now);
  const minP = today.reduce((a, b) => (b.eur < a.eur ? b : a), today[0]);
  const maxP = today.reduce((a, b) => (b.eur > a.eur ? b : a), today[0]);
  return h('section', { class: 'panel' },
    h('div', { class: 'energy-now' },
      cur && h('div', {}, h('div', { class: 'big-figure' }, eurKwh(cur.eur), h('small', {}, '€/kWh ahora')),
        h('span', { class: `price-tag ${level(cur, list)}` }, { barata: 'Hora barata', media: 'Precio medio', cara: 'Hora cara' }[level(cur, list)])),
      h('div', { class: 'stat' }, h('span', {}, 'Media de hoy'), h('b', {}, eurKwh(average(today)))),
      h('div', { class: 'stat' }, h('span', {}, `Más barata (${time(minP.at)})`), h('b', { style: { color: 'var(--cheap)' } }, eurKwh(minP.eur))),
      h('div', { class: 'stat' }, h('span', {}, `Más cara (${time(maxP.at)})`), h('b', { style: { color: 'var(--dear)' } }, eurKwh(maxP.eur)))),
    pvpcChart(list, now),
    !tomorrowKnown(list, now) && h('p', { class: 'note' }, 'El precio de mañana se publica hacia las 20:30. Precios sin impuestos.'),
    statusNote(prices, 'Luz'));
}

export function renderEnergy(state) {
  const { now, prices, settings, demo } = state;
  const t = currentTariff(settings);
  const pvpc = prices?.data || [];
  const head = h('header', { class: 'page-head' }, h('h1', {}, 'Luz'), h('span', { class: 'sub' }, t.nombre || PRESETS.pvpc.nombre));

  if (t.tipo === 'pvpc' && !pvpc.length) {
    return h('div', {}, demo && demoBanner(), head,
      h('section', { class: 'panel' }, h('p', { class: 'empty' }, prices ? 'No hay precios disponibles ahora mismo.' : 'Cargando precios…'), statusNote(prices, 'Luz')));
  }

  const rows = applianceRows(t, now, settings, pvpc);
  if (t.tipo === 'tramos') {
    const nc = periodAt(now) === 'punta' ? null : nextChange(now);
    if (nc?.period === 'punta') rows.push(h('div', { class: 'best-row warn' }, h('span', { class: 'emo', 'aria-hidden': 'true' }, '⛔'),
      h('div', {}, h('h3', {}, 'Empieza la punta'), h('p', { class: 'best-when' }, `${time(nc.at)}`), h('p', { class: 'soft' }, `${eurKwh(t.punta * TAX)} €/kWh con impuestos`))));
  } else if (t.tipo === 'pvpc') {
    const avoid = priciestWindow(pvpc, now);
    if (avoid) rows.push(h('div', { class: 'best-row warn' }, h('span', { class: 'emo', 'aria-hidden': 'true' }, '⛔'),
      h('div', {}, h('h3', {}, 'Mejor evitar'), h('p', { class: 'best-when' }, rangeLabel(avoid, now)), h('p', { class: 'soft' }, `${eurKwh(avoid.avg)} €/kWh de media`))));
  }

  return h('div', {},
    demo && demoBanner(),
    head,
    h('div', { class: 'energy-grid' },
      t.tipo === 'pvpc' ? pvpcPanel(pvpc, now, prices) : tariffPanel(t, now, settings, pvpc),
      h('section', { class: 'panel' }, h('h2', {}, t.tipo === 'unico' ? 'Lo que cuesta cada aparato' : 'Mejores horas'), h('div', { class: 'best' }, rows),
        tramosHint(settings),
        h('p', { class: 'tip' }, 'La tarifa y el consumo de cada aparato se cambian en Ajustes.'))));
}

