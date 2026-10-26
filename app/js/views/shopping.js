// Compra y tareas de casa. Tocar un producto lo tacha (en Bring!, y de ahí en Alexa); se puede deshacer.
import { h, toast, statusNote, startOfDay, dayLabel, openSheet } from '../ui.js';
import { shoppingList, markBought, addItem, markAllBought, addMany } from '../data/shopping.js';
import { demoBanner } from './common.js';
import { SECCIONES, SECCION, classify, groupByAisle, setSeccion } from '../data/aisles.js';

function due(vence, now) {
  if (!vence) return null;
  const d = new Date(vence.length <= 10 ? `${vence}T12:00` : vence);
  if (isNaN(d)) return null;
  const late = startOfDay(d) < startOfDay(now);
  return h('span', { class: 'task-due' + (late ? ' late' : '') }, late ? 'Atrasada' : dayLabel(d, now));
}

let refocus = false; // tras añadir, el cursor sigue en la caja para seguir escribiendo

export function renderShopping(state, rerender, reload) {
  const { now, shop, demo } = state;
  const data = shop?.data;
  const list = shoppingList(data);
  const others = (data?.listas || []).slice(1);
  const aprendidas = shop?.secciones || {};

  // Cambiar la sección de un producto: se recuerda para la próxima vez (y en todos los dispositivos)
  const pickAisle = (item) => {
    const current = classify(item.producto, aprendidas);
    const choose = async (id) => {
      close();
      try {
        await setSeccion(item.producto, id, aprendidas);
        toast(`${item.producto}: ${SECCION[id].icono} ${SECCION[id].nombre}. Lo recordaré.`);
        reload();
      } catch (e) { toast(`No se pudo guardar: ${e.message}`); }
    };
    const close = openSheet(h('div', {},
      h('h2', {}, item.producto),
      h('p', { class: 'hint' }, '¿En qué sección del súper está? La app lo recordará para este producto.'),
      h('div', { class: 'aisle-pick' }, SECCIONES.map((s) => h('button', {
        type: 'button', 'aria-pressed': String(s.id === current), onclick: () => choose(s.id),
      }, h('span', {}, s.icono), s.nombre)))));
  };

  const buy = async (item, li) => {
    li.classList.add('done');
    try {
      await markBought(item.producto);
      setTimeout(() => { li.remove(); }, 450);
      toast(`${item.producto}: comprado`, {
        action: 'Deshacer',
        onAction: async () => { try { await addItem(item.producto); reload(); } catch (e) { toast(e.message); } },
      });
      setTimeout(() => reload(), 600);
    } catch (e) {
      li.classList.remove('done');
      toast(`No se pudo tachar: ${e.message}`);
    }
  };

  const input = h('input', { type: 'text', name: 'producto', placeholder: 'Añadir a la lista…', autocomplete: 'off', enterkeyhint: 'done', 'aria-label': 'Producto' });
  const submit = async (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    try {
      await addItem(v);
      input.value = '';
      refocus = true;
      const sec = SECCION[classify(v, aprendidas)];
      toast(`${v}: añadido a ${sec.icono} ${sec.nombre}`);
      reload();
    } catch (err) { toast(`No se pudo añadir: ${err.message}`); }
  };

  if (refocus) { refocus = false; setTimeout(() => input.focus({ preventScroll: true }), 0); }

  const markAll = async (e) => {
    const btn = e.currentTarget;
    const items = list?.items || [];
    if (!items.length) return;
    btn.disabled = true; btn.textContent = 'Marcando…';
    document.querySelectorAll('.items .item').forEach((li) => li.classList.add('done'));
    try {
      const done = await markAllBought(items);
      toast(`${done.length} ${done.length === 1 ? 'producto marcado' : 'productos marcados'} como comprados`, {
        action: 'Deshacer',
        ms: 8000, onAction: async () => { try { await addMany(done); reload(); } catch (err) { toast(err.message); } },
      });
    } catch (err) { toast(`No se pudieron marcar todos: ${err.message}`); }
    reload();
  };

  const shopPanel = h('section', { class: 'panel' },
    h('div', { class: 'list-head' },
      h('h2', {}, list?.nombre || 'Lista de la compra'),
      list?.items?.length > 1 && h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: markAll }, 'Marcar todos')),
    h('form', { class: 'add-row', onsubmit: submit }, input, h('button', { type: 'submit', class: 'btn' }, 'Añadir')),
    !list ? h('p', { class: 'empty' }, shop ? 'No se pudo cargar la lista.' : 'Cargando la lista…')
      : list.items.length === 0 ? h('p', { class: 'empty' }, 'No falta nada. Añade lo que se acabe o díselo a Alexa.')
        : groupByAisle(list.items, aprendidas).map((g) => h('div', { class: 'aisle' },
          h('h3', { class: 'aisle-head' }, h('span', { 'aria-hidden': 'true' }, g.icono), g.nombre, h('small', {}, g.items.length)),
          h('ul', { class: 'items' }, g.items.map((item) => {
            const li = h('li', { class: 'item' });
            li.append(
              h('button', { type: 'button', class: 'item-main', onclick: () => buy(item, li), 'aria-label': `Tachar ${item.producto}` },
                h('span', { class: 'check', 'aria-hidden': 'true' }, '✓'),
                h('span', {}, h('span', { class: 'item-name' }, item.producto), item.detalle && h('span', { class: 'item-detail' }, item.detalle))),
              h('button', { type: 'button', class: 'aisle-btn', onclick: () => pickAisle(item), 'aria-label': `Cambiar la sección de ${item.producto}`, title: 'Cambiar de sección' }, '⇄'));
            return li;
          })))),
    data?.frecuentes?.length ? [
      h('p', { class: 'note' }, 'Lo que más se pide y no está en la lista:'),
      h('div', { class: 'habituales' }, data.frecuentes.map((f) => h('button', {
        type: 'button',
        onclick: async () => { try { await addItem(f.producto); toast(`${f.producto}: añadido`); reload(); } catch (e) { toast(`No se pudo añadir: ${e.message}`); } },
      }, f.producto))),
    ] : null,
    statusNote(shop, 'Compra'));

  const otherPanels = others.map((l) => h('section', { class: 'panel' },
    h('h2', {}, h('i', { class: 'dot', style: { background: l.color, marginRight: '10px' } }), l.nombre),
    l.items.length ? h('div', {}, l.items.map((i) => h('div', { class: 'task-row' },
      h('span', {}, i.producto, i.detalle && h('span', { class: 'item-detail' }, i.detalle)), due(i.vence, now))))
      : h('p', { class: 'empty' }, 'Nada pendiente.'),
    h('p', { class: 'note' }, 'Se marcan como hechas en su app (Todoist) o pidiéndoselo a Alexa.')));

  return h('div', {},
    demo && demoBanner(),
    h('header', { class: 'page-head' }, h('h1', {}, 'Compra y tareas'),
      data?.actualizado && h('span', { class: 'sub' }, `Bring!, Alexa y Todoist`)),
    h('div', { class: 'lists' }, shopPanel, otherPanels));
}
