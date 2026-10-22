// Menú de la nutricionista: una semana tipo por persona que se repite durante el ciclo (p. ej. 4 semanas).
// Se guarda en Cloudflare (/api/dieta) — nunca en el repositorio, que es público — y se importa desde Ajustes.
// Formato: { inicio, fin, ciclo_semanas, tomas: [...], personas: [{ id, nombre, tupper: [dias], semana: { lunes: { desayuno: toma, … } } }] }
//   toma = { plato, ingredientes: [{ ingrediente, cantidad, cantidad_max?, unidad }], postre?: [...], tupper?, libre?, nota? }
//        | { tipo: 'elegir', opciones: [...] } | { tipo: 'vacio' }
import { server, cached } from '../api.js';
import { isDemo, cachePut } from '../store.js';

const MAX_AGE = 30 * 60000;
const KEY_LOCAL = 'casa.dieta.v1';

export const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
export const TOMAS = {
  desayuno: 'Desayuno', media_manana: 'Media mañana', comida: 'Comida', merienda: 'Merienda', cena: 'Cena', precama: 'Pre cama',
};
// Hasta qué hora «toca» cada toma (para «Ahora toca» en Hoy)
const HASTA = [['desayuno', 10.5], ['media_manana', 13.5], ['comida', 16.5], ['merienda', 19.5], ['cena', 22.5], ['precama', 24]];

export const dayKey = (d) => DIAS[(d.getDay() + 6) % 7];

export async function loadDiet({ force = false } = {}) {
  if (isDemo()) {
    try { const d = JSON.parse(localStorage.getItem(KEY_LOCAL) || 'null'); return { data: d, at: Date.now(), local: true }; } catch { return { data: null }; }
  }
  const res = await cached('dieta', MAX_AGE, async () => {
    try { return await server('dieta'); } catch (e) { if (e.status === 404) return null; throw e; }
  }, { force });
  return res;
}

export async function saveDiet(plan) {
  if (!plan || !Array.isArray(plan.personas)) throw new Error('El archivo no parece un menú');
  if (isDemo()) {
    try { localStorage.setItem(KEY_LOCAL, JSON.stringify(plan)); } catch { throw new Error('No se pudo guardar en este dispositivo'); }
    return;
  }
  await server('dieta', { method: 'PUT', body: plan });
  cachePut('dieta', plan);
}

/** Toma que toca a esta hora y la siguiente. */
export function currentToma(now = new Date()) {
  const hh = now.getHours() + now.getMinutes() / 60;
  const i = HASTA.findIndex(([, h]) => hh < h);
  const idx = i < 0 ? HASTA.length - 1 : i;
  return { actual: HASTA[idx][0], siguiente: HASTA[idx + 1]?.[0] || null };
}

/** «180 g», «2–3 ud», «a voluntad»… */
export function qty(x) {
  if (x.cantidad == null) return x.unidad || '';
  const n = (v) => Number(v).toLocaleString('es-ES', { maximumFractionDigits: 1 });
  const range = x.cantidad_max != null && x.cantidad_max !== x.cantidad ? `${n(x.cantidad)}–${n(x.cantidad_max)}` : n(x.cantidad);
  const u = x.unidad === 'g' || x.unidad === 'ml' ? ` ${x.unidad}` : x.unidad ? ` ${x.unidad}` : '';
  return range + u;
}

export const isEmpty = (t) => !t || t.tipo === 'vacio';

const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Suma de ingredientes de varias tomas (mismo nombre y unidad). Lo que no tiene cantidad se lista aparte. */
export function sumIngredients(lists) {
  const map = new Map();
  for (const x of lists.flat()) {
    if (!x?.ingrediente) continue;
    const key = `${norm(x.ingrediente)}|${x.cantidad == null ? '' : x.unidad || ''}`;
    const prev = map.get(key);
    if (!prev) { map.set(key, { ...x }); continue; }
    if (x.cantidad != null && prev.cantidad != null) {
      prev.cantidad += x.cantidad;
      if (x.cantidad_max != null || prev.cantidad_max != null) prev.cantidad_max = (prev.cantidad_max ?? prev.cantidad - x.cantidad) + (x.cantidad_max ?? x.cantidad);
    }
  }
  return [...map.values()];
}

/** Para cocinar: tomas en las que varias personas comen el mismo plato ese día (sumando sus cantidades). */
export function cookTogether(plan, day) {
  const out = [];
  for (const toma of ['comida', 'cena']) {
    const byDish = new Map();
    for (const p of plan.personas) {
      const t = p.semana?.[day]?.[toma];
      if (!t || !t.plato || t.libre) continue;
      const k = norm(t.plato);
      if (!byDish.has(k)) byDish.set(k, { plato: t.plato, toma, personas: [], ingredientes: [] });
      const g = byDish.get(k);
      g.personas.push(p.nombre);
      g.ingredientes.push(t.ingredientes || []);
    }
    for (const g of byDish.values()) {
      if (g.personas.length > 1) out.push({ ...g, ingredientes: sumIngredients(g.ingredientes) });
    }
  }
  return out;
}

/** Quién lleva tupper el día [day]. */
export function tupperOn(plan, day) {
  return plan.personas
    .filter((p) => (p.tupper || []).includes(day) || p.semana?.[day]?.comida?.tupper)
    .map((p) => ({ nombre: p.nombre, plato: p.semana?.[day]?.comida?.plato || 'comida' }));
}

/**
 * Lista de la compra de una semana completa del menú, para todas las personas.
 * Suma lo que tiene cantidad; lo «a voluntad» sale una vez sin cantidad; las opciones de «elegir» se listan
 * aparte para que cada uno decida cuántas comprar. Las tomas libres (pizza casera) no suman nada.
 */
export function weeklyShopping(plan) {
  const fixed = [];
  const choices = [];
  for (const p of plan.personas) {
    for (const day of DIAS) {
      for (const t of Object.values(p.semana?.[day] || {})) {
        if (!t || t.libre) continue;
        if (t.tipo === 'elegir') { choices.push(...(t.opciones || [])); continue; }
        fixed.push(t.ingredientes || []);
        if (Array.isArray(t.postre)) fixed.push(t.postre);
      }
    }
  }
  const items = sumIngredients(fixed).sort((a, b) => a.ingrediente.localeCompare(b.ingrediente, 'es'));
  const opciones = [...new Map(choices.map((o) => [norm(o.ingrediente), o.ingrediente])).values()];
  return { items, opciones };
}

/** Días que quedan del ciclo (null si el menú no indica el final). */
export function cycleDaysLeft(plan, now = new Date()) {
  if (!plan?.fin) return null;
  const end = new Date(`${plan.fin}T23:59:59`);
  return Math.ceil((end - now) / 86400000);
}

