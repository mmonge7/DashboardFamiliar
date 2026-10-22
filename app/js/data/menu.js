// Menú de casa: comida y cena de cada día.
// Con conexión (Cloudflare o servidor de casa) se guarda allí y lo ve toda la familia en todos los dispositivos.
// Sin conexión se guarda solo en este dispositivo.
import { server, cached } from '../api.js';
import { getSettings, isDemo, cacheGet, cachePut } from '../store.js';

const KEY_LOCAL = 'casa.menu.v1';
const MAX_AGE = 2 * 60000;

export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readLocal() {
  try { return JSON.parse(localStorage.getItem(KEY_LOCAL) || '{}'); } catch { return {}; }
}
function writeLocal(dias) {
  try { localStorage.setItem(KEY_LOCAL, JSON.stringify(dias)); return true; } catch { return false; }
}

/** ¿Se comparte con el resto de la familia? */
export function isShared(s = getSettings()) {
  return !isDemo(s);
}

/** { data: { dias: { 'AAAA-MM-DD': { comida, cena } } }, shared, ... } */
export async function loadMenu({ force = false } = {}) {
  if (!isShared()) return { data: { dias: readLocal() }, shared: false, at: Date.now() };
  const res = await cached('menu', MAX_AGE, () => server('menu'), { force });
  return { ...res, shared: true };
}

export async function saveDay(fecha, { comida = '', cena = '' }) {
  const value = { comida: comida.trim().slice(0, 120), cena: cena.trim().slice(0, 120) };
  if (!isShared()) {
    const dias = readLocal();
    if (value.comida || value.cena) dias[fecha] = value; else delete dias[fecha];
    if (!writeLocal(dias)) throw new Error('No se pudo guardar en este dispositivo');
    return;
  }
  await server(`menu/${fecha}`, { method: 'PUT', body: value });
  const copy = cacheGet('menu');
  if (copy?.data) {
    copy.data.dias ||= {};
    if (value.comida || value.cena) copy.data.dias[fecha] = value; else delete copy.data.dias[fecha];
    cachePut('menu', copy.data);
  }
}

/** Platos ya usados (para sugerirlos al escribir), del más reciente al más antiguo. */
export function knownDishes(dias) {
  const seen = new Map();
  for (const fecha of Object.keys(dias || {}).sort().reverse()) {
    for (const k of ['comida', 'cena']) {
      const v = dias[fecha]?.[k]?.trim();
      if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
    }
  }
  return [...seen.values()].slice(0, 200);
}
