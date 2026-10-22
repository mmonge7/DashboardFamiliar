// Menú: comida y cena de cada día de la semana. Tocar un día lo edita.
import { h, cap, addDays, startOfWeek, sameDay, dayLabel, longDay, openSheet, toast, statusNote } from '../ui.js';
import { saveDay, knownDishes, ymd } from '../data/menu.js';
import { renderDiet, dietPeek } from './diet.js';

let offset = 0; // semanas respecto a la actual (-1 … +3)

function editDay(day, entry, dishes, reload) {
  const listId = 'platos-conocidos';
  const comida = h('input', { type: 'text', value: entry?.comida || '', list: listId, maxlength: 120, placeholder: '¿Qué hay de comer?', enterkeyhint: 'next' });
  const cena = h('input', { type: 'text', value: entry?.cena || '', list: listId, maxlength: 120, placeholder: '¿Y de cenar?', enterkeyhint: 'done' });
  let close;
  const submit = async (e) => {
    e.preventDefault();
    try {
      await saveDay(ymd(day), { comida: comida.value, cena: cena.value });
      close();
      toast('Menú guardado');
      reload();
    } catch (err) { toast(`No se pudo guardar: ${err.message}`); }
  };
  close = openSheet(h('form', { class: 'form', onsubmit: submit },
    h('h2', {}, cap(longDay(day))),
    h('datalist', { id: listId }, dishes.map((d) => h('option', { value: d }))),
    h('div', { class: 'field' }, h('label', {}, 'Comida'), comida),
    h('div', { class: 'field' }, h('label', {}, 'Cena'), cena),
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn' }, 'Guardar menú'))));
  setTimeout(() => (entry?.comida ? cena : comida).focus(), 50);
}

function dish(value, label) {
  return h('span', { class: 'menu-dish' + (value ? '' : ' empty-dish') },
    h('small', {}, label), value || 'Sin decidir');
}

export function renderMenu(state, rerender, reload) {
  if (state.diet?.data) return renderDiet(state, rerender, reload);
  return renderPlanner(state, rerender, reload);
}

function renderPlanner(state, rerender, reload) {
  const { now, menu } = state;
  const dias = menu?.data?.dias || {};
  const dishes = knownDishes(dias);
  const first = addDays(startOfWeek(now), offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
  const go = (d) => { offset = Math.max(-1, Math.min(3, offset + d)); rerender(); };
  const title = offset === 0 ? 'Esta semana' : offset === 1 ? 'La semana que viene' : offset === -1 ? 'La semana pasada' : `Semana del ${first.getDate()}`;

  return h('div', {},
    h('header', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Menú'), h('p', { class: 'sub' }, title)),
      h('div', { class: 'cal-nav' },
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => go(-1), disabled: offset <= -1 }, 'Semana anterior'),
        offset !== 0 && h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { offset = 0; rerender(); } }, 'Esta semana'),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => go(1), disabled: offset >= 3 }, 'Semana siguiente'))),
    h('div', { class: 'banner' },
      h('span', {}, '¿Tenéis menú de la nutricionista? Cárgalo en Ajustes y verás cada toma con sus cantidades.'),
      h('a', { href: '#/ajustes' }, 'Cargar menú')),
    menu && !menu.shared && h('div', { class: 'banner' },
      h('span', {}, 'El menú se guarda solo en este dispositivo. Para verlo en todos, conecta la app.'),
      h('a', { href: '#/ajustes' }, 'Conectar')),
    h('section', { class: 'panel menu-week' },
      days.map((d) => {
        const e = dias[ymd(d)];
        const today = sameDay(d, now);
        return h('button', {
          type: 'button', class: 'menu-day' + (today ? ' is-today' : '') + (d < now && !today ? ' past' : ''),
          onclick: () => editDay(d, e, dishes, reload), 'aria-label': `Editar el menú del ${longDay(d)}`,
        },
        h('span', { class: 'menu-date' }, dayLabel(d, now), h('small', {}, d.getDate())),
        dish(e?.comida, 'Comida'), dish(e?.cena, 'Cena'));
      })),
    statusNote(menu, 'Menú'));
}

/** Panel de «Hoy»: comida y cena de hoy; por la tarde destaca la cena y adelanta la comida de mañana. */
export function menuPeek(now, menu, diet) {
  if (diet?.data) return dietPeek(now, diet);
  const dias = menu?.data?.dias || {};
  const e = dias[ymd(now)] || {};
  const tarde = now.getHours() >= 16;
  const manana = dias[ymd(addDays(now, 1))];
  const box = h('a', { class: 'panel panel-link', href: '#/menu' }, h('h2', {}, 'Menú de hoy'));
  if (!e.comida && !e.cena) {
    box.append(h('p', { class: 'empty' }, menu ? 'Sin decidir. Toca para planificarlo.' : 'Cargando el menú…'));
  } else {
    box.append(h('div', { class: 'menu-today' },
      h('p', { class: tarde ? 'dim' : '' }, h('small', {}, 'Comida'), e.comida || 'Sin decidir'),
      h('p', {}, h('small', {}, 'Cena'), e.cena || 'Sin decidir')));
  }
  if (tarde && manana?.comida) box.append(h('p', { class: 'note' }, `Mañana: ${manana.comida}`));
  return box;
}
