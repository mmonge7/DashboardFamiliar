// Lista de la compra y tareas de casa. El servidor las saca de Home Assistant (Bring!, Todoist, Alexa)
// con servidor/scripts/compra_export.py y las sirve en /api/compra. Desde la app se puede
// tachar lo comprado, volver a pedirlo y añadir productos (van a Bring!, y de ahí a Alexa).
import { server, cached } from '../api.js';
import { isDemo, cacheGet, cachePut } from '../store.js';
import { demoShopping } from '../demo.js';
import { loadAprendidas } from './aisles.js';

const MAX_AGE = 60000;
let demoState = null; // en demostración los cambios viven solo en memoria

export async function loadShopping({ force = false } = {}) {
  const secciones = loadAprendidas({ force }).catch(() => ({}));
  if (isDemo()) {
    demoState ??= demoShopping();
    return { data: structuredClone(demoState), demo: true, at: Date.now(), secciones: await secciones };
  }
  const [res, apr] = await Promise.all([cached('compra', MAX_AGE, () => server('compra'), { force }), secciones]);
  return { ...res, secciones: apr };
}

/** La lista que se puede tocar (Bring!): la primera de «listas», o «items» en servidores antiguos. */
export function shoppingList(data) {
  if (!data) return null;
  return data.listas?.[0] || { nombre: 'Lista de la compra', color: '#2E7D5B', items: data.items || [] };
}

function patchCache(fn) {
  const copy = cacheGet('compra');
  if (copy?.data) { fn(copy.data); cachePut('compra', copy.data); }
}

export async function markBought(producto) {
  const drop = (d) => {
    const l = shoppingList(d);
    if (l) l.items = l.items.filter((i) => i.producto !== producto);
    if (d.items) d.items = d.items.filter((i) => i.producto !== producto);
  };
  if (isDemo()) { drop(demoState); return; }
  await server('compra/quitar', { method: 'POST', body: { producto } });
  patchCache(drop);
}

export async function addItem(producto) {
  producto = producto.trim().slice(0, 80);
  if (!producto) return;
  const add = (d) => {
    const l = shoppingList(d);
    if (l && !l.items.some((i) => i.producto.toLowerCase() === producto.toLowerCase())) {
      l.items.unshift({ producto, detalle: '', vence: '' });
    }
    if (d.frecuentes) d.frecuentes = d.frecuentes.filter((f) => f.producto.toLowerCase() !== producto.toLowerCase());
  };
  if (isDemo()) { add(demoState); return; }
  await server('compra/anadir', { method: 'POST', body: { producto } });
  patchCache(add);
}

/** Tacha todo lo de la lista. Devuelve los que se han tachado (para poder deshacer). */
export async function markAllBought(items) {
  const productos = items.map((i) => i.producto);
  if (!isDemo()) {
    try {
      const r = await server('compra/vaciar', { method: 'POST', body: { productos } });
      const gone = new Set(r.quitados);
      patchCache((d) => { const l = shoppingList(d); if (l) l.items = l.items.filter((i) => !gone.has(i.producto)); if (d.items) d.items = d.items.filter((i) => !gone.has(i.producto)); });
      return r.quitados;
    } catch (e) { if (e.status !== 404) throw e; } // servidor sin «vaciar»: uno a uno
  }
  const done = [];
  for (const i of items) {
    try { await markBought(i.producto); done.push(i.producto); } catch (e) { if (e.status !== 409) throw e; }
  }
  return done;
}

/** Vuelve a añadir varios productos (deshacer «Marcar todos»). */
export async function addMany(productos) {
  for (const p of [...productos].reverse()) await addItem(p);
}
