// Tu tarifa de la luz: PVPC (precio regulado que cambia cada hora), tres tramos (punta, llano, valle)
// o precio único. Los tramos son los del peaje 2.0TD de cualquier vivienda en la Península:
//   punta  10–14 y 18–22 h, de lunes a viernes
//   llano  8–10, 14–18 y 22–24 h, de lunes a viernes
//   valle  0–8 h de lunes a viernes, y todo el día los sábados, domingos y festivos nacionales de fecha fija
import { addDays, startOfDay } from '../ui.js';

/** Precios sin impuestos (€/kWh). Los de las ofertas son los del comparador de la CNMC (octubre de 2026). */
export const PRESETS = {
  pvpc: { tipo: 'pvpc', nombre: 'PVPC (precio regulado)' },
  repsol: { tipo: 'unico', nombre: 'Repsol, precio único', unico: 0.111681 },
  nufri: { tipo: 'tramos', nombre: 'Nufri, Con Horarios', punta: 0.175484, llano: 0.096446, valle: 0.063010 },
  iberdrola: { tipo: 'tramos', nombre: 'Iberdrola, Plan Online 3 Precios', punta: 0.217, llano: 0.162, valle: 0.129 },
};

/** Impuesto eléctrico (5,11 %) e IVA (21 %) sobre la energía. */
export const TAX = 1.0511269632 * 1.21;

export const PERIOD_LABEL = { punta: 'Punta', llano: 'Llano', valle: 'Valle' };
export const PERIOD_LEVEL = { punta: 'cara', llano: 'media', valle: 'barata' };

// Festivos nacionales de fecha fija (mes-día): en ellos todo el día es valle
const FESTIVOS = new Set(['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25']);

export function isValleDay(d) {
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return d.getDay() === 0 || d.getDay() === 6 || FESTIVOS.has(md);
}

export function periodAt(d) {
  if (isValleDay(d)) return 'valle';
  const hh = d.getHours();
  if (hh < 8) return 'valle';
  if ((hh >= 10 && hh < 14) || (hh >= 18 && hh < 22)) return 'punta';
  return 'llano';
}

/** Precio sin impuestos de tu tarifa a la hora [d]; con PVPC hace falta la lista de precios de REE. */
export function tariffPrice(t, d, pvpc = []) {
  if (t.tipo === 'unico') return t.unico;
  if (t.tipo === 'tramos') return t[periodAt(d)];
  const h = new Date(d); h.setMinutes(0, 0, 0);
  return pvpc.find((p) => +p.at === +h)?.eur ?? null;
}

/** Tramos seguidos de un día: [{start, end, period}] */
export function daySpans(day) {
  const s = startOfDay(day);
  const spans = [];
  for (let hh = 0; hh < 24; hh++) {
    const at = new Date(s); at.setHours(hh);
    const p = periodAt(at);
    const last = spans[spans.length - 1];
    if (last && last.period === p) last.end = new Date(+at + 3600000);
    else spans.push({ start: at, end: new Date(+at + 3600000), period: p });
  }
  return spans;
}

/** Cuándo cambia de tramo después de [now] y a cuál. */
export function nextChange(now) {
  const cur = periodAt(now);
  const t = new Date(now); t.setMinutes(0, 0, 0);
  for (let i = 1; i <= 72; i++) {
    const at = new Date(+t + i * 3600000);
    const p = periodAt(at);
    if (p !== cur) return { at, period: p };
  }
  return null;
}

/** Horas de [now] a [until] con el precio de tu tarifa: [{at, eur}] */
export function hourly(t, now, until, pvpc = []) {
  const out = [];
  const t0 = new Date(now); t0.setMinutes(0, 0, 0);
  for (let at = t0; at < until; at = new Date(+at + 3600000)) {
    const eur = tariffPrice(t, at, pvpc);
    if (eur != null) out.push({ at, eur });
  }
  return out;
}

/**
 * El tramo más barato de [hours] horas seguidas entre ahora y mañana por la noche.
 * Con precio único todas las horas valen lo mismo: devuelve null.
 * Ante empate, el que empieza antes (no tiene sentido esperar para pagar lo mismo).
 */
export function bestWindow(t, now, hours, pvpc = []) {
  if (t.tipo === 'unico') return null;
  const until = addDays(startOfDay(now), 2);
  const list = hourly(t, now, until, pvpc);
  let best = null;
  for (let i = 0; i + hours <= list.length; i++) {
    const w = list.slice(i, i + hours);
    if (!w.every((p, j) => j === 0 || p.at - w[j - 1].at === 3600000)) continue;
    const avg = w.reduce((s, p) => s + p.eur, 0) / hours;
    if (!best || avg < best.avg - 1e-9) best = { start: w[0].at, end: new Date(+w[hours - 1].at + 3600000), avg };
  }
  return best;
}

/** Precio medio de empezar ya con un aparato de [hours] horas. */
export function startNowAvg(t, now, hours, pvpc = []) {
  const until = new Date(+now + (hours + 1) * 3600000);
  const w = hourly(t, now, until, pvpc).slice(0, hours);
  return w.length === hours ? w.reduce((s, p) => s + p.eur, 0) / hours : null;
}

export function currentTariff(settings) {
  const t = settings.tarifa || {};
  if (t.tipo === 'tramos' && [t.punta, t.llano, t.valle].every((v) => v > 0)) return t;
  if (t.tipo === 'unico' && t.unico > 0) return t;
  return PRESETS.pvpc;
}
