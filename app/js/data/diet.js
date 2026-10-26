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
  x = bigUnits(x);
  const n = (v) => Number(v).toLocaleString('es-ES', { maximumFractionDigits: 2 });
  const range = x.cantidad_max != null && x.cantidad_max !== x.cantidad ? `${n(x.cantidad)}–${n(x.cantidad_max)}` : n(x.cantidad);
  const u = x.unidad ? ` ${plural(x.unidad, x.cantidad_max ?? x.cantidad)}` : '';
  return range + u;
}
const SHORT = { 'cucharada sopera': 'cda.', cucharada: 'cda.', cucharadita: 'cdta.' };
const PLURAL = { 'ración': 'raciones', 'cda.': 'cdas.', 'cdta.': 'cdtas.', cucharadita: 'cucharaditas', loncha: 'lonchas', rebanada: 'rebanadas', pieza: 'piezas' };
const plural = (u, n) => { u = SHORT[u] || u; return (n > 1 && PLURAL[u]) || u; };
/** 1250 g → 1,25 kg; 1500 ml → 1,5 l (solo para mostrar). */
function bigUnits(x) {
  const big = { g: 'kg', ml: 'l' }[x.unidad];
  if (!big || x.cantidad == null || x.cantidad < 1000) return x;
  return { ...x, cantidad: x.cantidad / 1000, cantidad_max: x.cantidad_max != null ? x.cantidad_max / 1000 : undefined, unidad: big };
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

// ---------- Compra de la semana: agrupada por producto principal ----------
// Cada ingrediente del menú se convierte en el producto que se compra. Si el menú está repasado, lo dice el
// propio ingrediente (compra: {producto, factor, unidad}); si no, se aplican reglas: se quitan «asadas»,
// «cocida», «a la plancha»… y los pesos de cocinado se pasan a crudo (arroz cocido ×0,35, pollo cocido ×1,3…).
const PREP = /\b(a la plancha|a la brasa|a la parrilla|al horno|al vapor|asad[oa]s?|cocid[oa]s?|hervid[oa]s?|frit[oa]s?|fundid[oa]s?|light|a dados|en dados|troceado?s?|picad[oa]s? fin[oa]s?)\b/gi;
const CRUDO = [[/\barroz\b/, 0.35], [/\b(pasta|macarron|espagueti|fideo|tallarin)/, 0.4], [/\b(pollo|pechuga|pavo|ternera|carne|lomo|cerdo)/, 1.3], [/\b(lenteja|alubia|garbanzo)/, 0.4]];
const singular = (w) => (w.length > 4 && /es$/.test(w) && !/[aeiou]es$/.test(w) ? w.slice(0, -2) : w.length > 3 && /s$/.test(w) ? w.slice(0, -1) : w);

export function shoppingTarget(x) {
  if (x.compra?.producto) return { producto: x.compra.producto, factor: x.compra.factor ?? 1, unidad: x.compra.unidad ?? x.unidad };
  const name = String(x.ingrediente || '');
  // «A / B», «A o B»: se compra una de ellas → una línea «a elegir», tal cual
  if (/\s\/\s|\/|\so\s/.test(name)) return { producto: name, factor: 1, unidad: x.unidad };
  const plain = norm(name);
  let factor = 1;
  if (/\bcocid[oa]s?\b/.test(plain) && !/garbanzos? cocidos?|lentejas? cocidas?|alubias? cocidas?/.test(plain)) factor = CRUDO.find(([re]) => re.test(plain))?.[1] ?? 1;
  if (/\basad[oa]s?\b/.test(plain) && /patata/.test(plain)) factor = 1.2;
  if (/garbanzos? cocidos?|lentejas? cocidas?|alubias? cocidas?/.test(plain)) return { producto: `${name} (bote)`, factor: 1, unidad: x.unidad };
  const producto = name.replace(PREP, '').replace(/\s+(de|con|y)\s*$/i, '').replace(/\s+/g, ' ').trim() || name;
  return { producto: producto[0].toUpperCase() + producto.slice(1), factor, unidad: x.unidad };
}

const groupKey = (producto, unidad) => `${norm(producto).split(' ').map(singular).join(' ')}|${unidad === 'ml' ? 'g' : unidad || ''}`;
const round = (v, unidad, factor) => (v == null ? v : unidad === 'ud' || unidad === 'ración' ? Math.ceil(v - 1e-9)
  : factor !== 1 && (unidad === 'g' || unidad === 'ml') ? Math.round(v / 10) * 10 : Math.round(v * 100) / 100);

/**
 * Lista de la compra de una semana completa del menú, para todas las personas, agrupada por producto principal.
 * Cada línea lleva «desglose» (de dónde sale: «360 g + 830 g asadas…»). Lo «a voluntad» sale una vez sin cantidad;
 * las opciones de «elegir» se listan aparte; las tomas libres (pizza casera) no suman nada.
 */
export function weeklyShopping(plan) {
  const groups = new Map();
  const choices = [];
  const add = (x) => {
    if (!x?.ingrediente) return;
    const t = shoppingTarget(x);
    const key = groupKey(t.producto, x.cantidad == null ? '' : t.unidad);
    const altKey = groupKey(t.producto, t.unidad);
    // Lo que no tiene cantidad («opcional», «a voluntad») se une a la línea con cantidad del mismo producto, si la hay
    const g = groups.get(key) || (x.cantidad == null && [...groups.values()].find((v) => v.key.split('|')[0] === altKey.split('|')[0]))
      || { key, ingrediente: t.producto, cantidad: null, cantidad_max: null, unidad: x.cantidad == null ? x.unidad : t.unidad, partes: new Map(), factor: 1 };
    groups.set(g.key, g);
    if (x.cantidad != null) {
      const lo = x.cantidad * t.factor; const hi = (x.cantidad_max ?? x.cantidad) * t.factor;
      if (g.cantidad == null) { g.cantidad = 0; g.cantidad_max = 0; g.unidad = t.unidad; }
      g.cantidad += lo; g.cantidad_max += hi;
      if (t.factor !== 1) g.factor = t.factor;
    }
    const label = norm(x.ingrediente) === norm(t.producto) ? '' : x.ingrediente;
    const p = g.partes.get(label) || { ingrediente: label, cantidad: x.cantidad == null ? null : 0, cantidad_max: x.cantidad == null ? null : 0, unidad: x.unidad };
    if (x.cantidad != null) { p.cantidad = (p.cantidad ?? 0) + x.cantidad; p.cantidad_max = (p.cantidad_max ?? 0) + (x.cantidad_max ?? x.cantidad); p.unidad = x.unidad; }
    g.partes.set(label, p);
  };
  for (const p of plan.personas) {
    for (const day of DIAS) {
      for (const t of Object.values(p.semana?.[day] || {})) {
        if (!t || t.libre) continue;
        if (t.tipo === 'elegir') { choices.push(...(t.opciones || [])); continue; }
        (t.ingredientes || []).forEach(add);
        if (Array.isArray(t.postre)) t.postre.forEach(add);
      }
    }
  }
  const items = [...groups.values()].map((g) => {
    const cantidad = round(g.cantidad, g.unidad, g.factor);
    const max = round(g.cantidad_max, g.unidad, g.factor);
    const partes = [...g.partes.values()];
    // Desglose solo si hay más de un origen o si hubo conversión (para que se entienda la cifra)
    const conCantidad = partes.filter((q) => q.cantidad != null);
    const desglose = g.cantidad != null && (conCantidad.length > 1 || g.factor !== 1 || conCantidad[0]?.ingrediente)
      ? conCantidad.map((q) => `${qty({ ...q, cantidad_max: q.cantidad_max === q.cantidad ? null : q.cantidad_max })} ${(q.ingrediente || g.ingrediente).toLowerCase()}`).join(' + ')
      : '';
    return { ingrediente: g.ingrediente, cantidad, cantidad_max: max === cantidad ? null : max, unidad: g.unidad, desglose, crudo: g.factor !== 1 };
  }).sort((a, b) => a.ingrediente.localeCompare(b.ingrediente, 'es'));
  const opciones = [...new Map(choices.map((o) => [norm(o.ingrediente), o.ingrediente])).values()];
  return { items, opciones };
}

/** Días que quedan del ciclo (null si el menú no indica el final). */
export function cycleDaysLeft(plan, now = new Date()) {
  if (!plan?.fin) return null;
  const end = new Date(`${plan.fin}T23:59:59`);
  return Math.ceil((end - now) / 86400000);
}

