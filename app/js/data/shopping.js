// Lista de la compra y tareas de casa. El servidor las saca de Home Assistant (Bring!, Todoist, Alexa)
// con servidor/scripts/compra_export.py y las sirve en /api/compra. Desde la app se puede
// tachar lo comprado, volver a pedirlo y añadir productos (van a Bring!, y de ahí a Alexa).
import { server, cached } from '../api.js';
import { isDemo, cacheGet, cachePut } from '../store.js';
import { demoShopping } from '../demo.js';

const MAX_AGE = 60000;
let demoState = null; // en demostración los cambios viven solo en memoria

export async function loadShopping({ force = false } = {}) {
  if (isDemo()) {
    demoState ??= demoShopping();
    return { data: structuredClone(demoState), demo: true, at: Date.now() };
  }
  return cached('compra', MAX_AGE, () => server('compra'), { force });
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
