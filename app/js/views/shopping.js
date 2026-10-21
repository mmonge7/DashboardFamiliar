// Compra y tareas de casa. Tocar un producto lo tacha (en Bring!, y de ahí en Alexa); se puede deshacer.
import { h, toast, statusNote, startOfDay, dayLabel } from '../ui.js';
import { shoppingList, markBought, addItem } from '../data/shopping.js';
import { demoBanner } from './common.js';

function due(vence, now) {
  if (!vence) return null;
  const d = new Date(vence.length <= 10 ? `${vence}T12:00` : vence);
  if (isNaN(d)) return null;
  const late = startOfDay(d) < startOfDay(now);
  return h('span', { class: 'task-due' + (late ? ' late' : '') }, late ? 'Atrasada' : dayLabel(d, now));
}

export function renderShopping(state, rerender, reload) {
  const { now, shop, demo } = state;
  const data = shop?.data;
  const list = shoppingList(data);
  const others = (data?.listas || []).slice(1);

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
      toast(`${v}: añadido`);
      reload();
    } catch (err) { toast(`No se pudo añadir: ${err.message}`); }
  };

  const shopPanel = h('section', { class: 'panel' },
    h('h2', {}, list?.nombre || 'Lista de la compra'),
    h('form', { class: 'add-row', onsubmit: submit }, input, h('button', { type: 'submit', class: 'btn' }, 'Añadir')),
    !list ? h('p', { class: 'empty' }, shop ? 'No se pudo cargar la lista.' : 'Cargando la lista…')
      : list.items.length === 0 ? h('p', { class: 'empty' }, 'No falta nada. Añade lo que se acabe o díselo a Alexa.')
        : h('ul', { class: 'items' }, list.items.map((item) => {
          const li = h('li', { class: 'item' });
          li.append(h('button', { type: 'button', onclick: () => buy(item, li), 'aria-label': `Tachar ${item.producto}` },
            h('span', { class: 'check', 'aria-hidden': 'true' }, '✓'),
            h('span', {}, h('span', { class: 'item-name' }, item.producto), item.detalle && h('span', { class: 'item-detail' }, item.detalle))));
          return li;
        })),
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
