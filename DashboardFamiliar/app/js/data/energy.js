// Precio de la luz (PVPC) de hoy y de mañana, de la API pública de Red Eléctrica (REE), sin clave.
// El precio de mañana se publica sobre las 20:30. Primero se pide directamente a REE; si el navegador
// no puede (CORS o red), se pide a través del servidor de la familia (/api/luz), que devuelve lo mismo.
import { publicJson, server, cached } from '../api.js';
import { isDemo } from '../store.js';
import { demoPrices } from '../demo.js';
import { addDays, startOfDay } from '../ui.js';

const MAX_AGE = 30 * 60000;

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function reeUrl(from, to) {
  return 'https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real'
    + `?start_date=${ymd(from)}T00:00&end_date=${ymd(to)}T23:59&time_trunc=hour`;
}

/** Respuesta de REE → [{at: Date (inicio de la hora), eur: €/kWh}] ordenado. Agrupa por hora si REE da cuartos de hora. */
export function parseRee(json) {
  const pvpc = (json?.included || []).find((s) => String(s.type).toUpperCase() === 'PVPC');
  if (!pvpc) throw new Error('REE no ha devuelto el PVPC');
  const byHour = new Map();
  for (const v of pvpc.attributes.values) {
    const d = new Date(v.datetime);
    d.setMinutes(0, 0, 0);
    const k = d.getTime();
    const acc = byHour.get(k) || { sum: 0, n: 0 };
    acc.sum += v.value; acc.n += 1;
    byHour.set(k, acc);
  }
  return [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, { sum, n }]) => ({ at: new Date(k), eur: sum / n / 1000 }));
}

export async function loadPrices({ force = false } = {}) {
  const now = new Date();
  const from = startOfDay(now), to = addDays(from, 1);
  const res = await cached('luz', MAX_AGE, async () => {
    let json;
    try {
      json = await publicJson(reeUrl(from, to));
    } catch (e) {
      if (isDemo()) throw e; // sin servidor no hay plan B
      json = await server(`luz?desde=${ymd(from)}&hasta=${ymd(to)}`);
    }
    return parseRee(json).map((p) => ({ at: p.at.toISOString(), eur: p.eur }));
  }, { force });
  if (res.data) res.data = res.data.map((p) => ({ at: new Date(p.at), eur: p.eur }));
  // Sin red y sin servidor: una curva de ejemplo para que el panel se vea completo
  else if (isDemo()) return { data: demoPrices(now), demo: true, at: Date.now() };
  return res;
}

/** El tramo de [hours] horas seguidas más barato entre ahora y [until]; null si no hay datos o si sale más caro que la media del día. */
export function cheapestWindow(prices, now, hours, until) {
  const from = new Date(now); from.setMinutes(0, 0, 0);
  const list = prices.filter((p) => p.at >= from && p.at < until);
  let best = null;
  for (let i = 0; i + hours <= list.length; i++) {
    const w = list.slice(i, i + hours);
    const contiguous = w.every((p, j) => j === 0 || p.at - w[j - 1].at === 3600000);
    if (!contiguous) continue;
    const avg = w.reduce((s, p) => s + p.eur, 0) / hours;
    if (!best || avg < best.avg) best = { start: w[0].at, end: new Date(+w[hours - 1].at + 3600000), avg };
  }
  if (!best) return null;
  const dayAvg = average(prices.filter((p) => sameDate(p.at, best.start)));
  return best.avg <= dayAvg ? best : null;
}

/** El tramo de 3 horas más caro de lo que queda de hoy (para «mejor evitar»). */
export function priciestWindow(prices, now, hours = 3) {
  const from = new Date(now); from.setMinutes(0, 0, 0);
  const end = addDays(startOfDay(now), 1);
  const list = prices.filter((p) => p.at >= from && p.at < end);
  let worst = null;
  for (let i = 0; i + hours <= list.length; i++) {
    const w = list.slice(i, i + hours);
    const avg = w.reduce((s, p) => s + p.eur, 0) / hours;
    if (!worst || avg > worst.avg) worst = { start: w[0].at, end: new Date(+w[hours - 1].at + 3600000), avg };
  }
  return worst;
}

export function priceAt(prices, when = new Date()) {
  const h = new Date(when); h.setMinutes(0, 0, 0);
  return prices.find((p) => +p.at === +h) || null;
}

export function average(list) {
  return list.length ? list.reduce((s, p) => s + p.eur, 0) / list.length : NaN;
}

function sameDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Nivel de una hora respecto al día: barata / media / cara (tercios del rango del día). */
export function level(p, prices) {
  const day = prices.filter((x) => sameDate(x.at, p.at)).map((x) => x.eur);
  const min = Math.min(...day), max = Math.max(...day);
  const t = max > min ? (p.eur - min) / (max - min) : 0.5;
  return t < 1 / 3 ? 'barata' : t < 2 / 3 ? 'media' : 'cara';
}

export function tomorrowKnown(prices, now = new Date()) {
  const t = addDays(startOfDay(now), 1);
  return prices.some((p) => sameDate(p.at, t));
}

