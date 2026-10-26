// Menú de la nutricionista: el día elegido, por toma y persona; cantidades para cocinar; compra de la semana.
import { h, openSheet, toast, addDays, startOfWeek } from '../ui.js';
import { DIAS, TOMAS, dayKey, qty, isEmpty, cookTogether, tupperOn, weeklyShopping, cycleDaysLeft, currentToma } from '../data/diet.js';
import { addItem } from '../data/shopping.js';

const NOMBRE_DIA = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo' };
let selected = null; // día elegido en la pestaña (por defecto, hoy)

const fdate = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric' });

function ingList(list, { compact = false } = {}) {
  if (!list?.length) return null;
  return h('ul', { class: 'ing' + (compact ? ' ing-compact' : '') }, list.map((x) => h('li', {},
    h('span', {}, x.ingrediente), qty(x) && h('b', { class: x.cantidad == null ? 'free' : '' }, qty(x)))));
}

/** Una toma de una persona. */
export function tomaBlock(t, { compact = false } = {}) {
  if (isEmpty(t)) return h('p', { class: 'muted' }, '—');
  if (t.tipo === 'elegir') {
    return h('div', { class: 'toma' },
      h('p', { class: 'toma-plato' }, 'A elegir'),
      h('p', { class: 'soft toma-opciones' }, t.opciones.map((o) => o.ingrediente + (o.cantidad ? ` (${qty(o)})` : '')).join(' · ')));
  }
  return h('div', { class: 'toma' },
    h('p', { class: 'toma-plato' }, t.plato, t.tupper && h('span', { class: 'tag-tupper' }, '🥡 tupper')),
    t.libre ? h('p', { class: 'soft' }, 'Libre: la preparáis a vuestro gusto.') : ingList(t.ingredientes, { compact }),
    Array.isArray(t.postre) && t.postre.length && h('div', {}, h('p', { class: 'toma-sub' }, 'Postre'), ingList(t.postre, { compact })),
    !compact && t.nota && h('p', { class: 'note' }, t.nota));
}

function shoppingSheet(plan, reload) {
  const { items, opciones } = weeklyShopping(plan);
  const rows = items.map((x) => ({ x, check: h('input', { type: 'checkbox', checked: x.cantidad != null }) }));
  const optRows = opciones.map((o) => ({ x: { ingrediente: o }, check: h('input', { type: 'checkbox' }) }));
  const add = async (e) => {
    e.preventDefault();
    const chosen = [...rows, ...optRows].filter((r) => r.check.checked);
    if (!chosen.length) { toast('No has marcado nada'); return; }
    const btn = e.submitter || e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Añadiendo…';
    let ok = 0;
    for (const r of chosen) {
      const q = r.x.cantidad != null ? ` · ${qty(r.x)}` : '';
      try { await addItem(`${r.x.ingrediente}${q}`.slice(0, 80)); ok += 1; } catch { /* sigue con el resto */ }
    }
    close();
    toast(`${ok} ${ok === 1 ? 'producto añadido' : 'productos añadidos'} a la compra`);
    reload({ force: true });
  };
  const close = openSheet(h('form', { class: 'form', onsubmit: add },
    h('h2', {}, 'Compra de la semana'),
    h('p', { class: 'hint' }, 'Una semana completa del menú para los dos, agrupada por producto y en peso de compra. Desmarca lo que ya tengas en casa.'),
    h('div', { class: 'shop-check' }, rows.map((r) => h('label', { class: 'switch' }, r.check,
      h('span', { class: 'shop-name' }, r.x.ingrediente, r.x.desglose && h('small', {}, `${r.x.crudo ? 'En crudo · ' : ''}${r.x.desglose}`)),
      h('b', {}, qty(r.x))))),
    opciones.length && h('p', { class: 'toma-sub', style: { marginTop: '6px' } }, 'Para media mañana y merienda (a elegir)'),
    h('div', { class: 'shop-check' }, optRows.map((r) => h('label', { class: 'switch' }, r.check, r.x.ingrediente))),
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn' }, 'Añadir a la compra'))));
}

export function renderDiet(state, rerender, reload) {
  const plan = state.diet.data;
  const now = state.now;
  const today = dayKey(now);
  const day = selected || today;
  const monday = startOfWeek(now);
  const left = cycleDaysLeft(plan, now);
  const tuppers = tupperOn(plan, day);
  const cook = cookTogether(plan, day);
  const personas = plan.personas;

  return h('div', {},
    h('header', { class: 'page-head' },
      h('div', {},
        h('h1', {}, 'Menú'),
        h('p', { class: 'sub' }, [plan.nutricionista && `Plan de ${plan.nutricionista}`, plan.inicio && plan.fin && `del ${fdate(plan.inicio)} al ${fdate(plan.fin)}`].filter(Boolean).join(', '))),
      h('div', { class: 'cal-nav' },
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => shoppingSheet(plan, reload) }, 'Compra de la semana'))),
    left != null && left <= 7 && h('div', { class: 'banner' },
      h('span', {}, left < 0 ? 'El ciclo de este menú ya ha terminado: pedid el nuevo a la nutricionista.' : `El ciclo acaba ${left === 0 ? 'hoy' : `en ${left} ${left === 1 ? 'día' : 'días'}`}: pedid el menú nuevo.`),
      h('a', { href: '#/ajustes' }, 'Cargar menú nuevo')),
    h('div', { class: 'day-tabs', role: 'tablist' }, DIAS.map((d, i) => {
      const date = addDays(monday, i);
      return h('button', {
        type: 'button', role: 'tab', 'aria-selected': String(d === day), class: d === today ? 'is-today' : '',
        onclick: () => { selected = d; rerender(); },
      }, NOMBRE_DIA[d].slice(0, 3), h('small', {}, date.getDate()));
    })),
    tuppers.length > 0 && h('p', { class: 'tupper-line' }, `🥡 ${NOMBRE_DIA[day]}: ${tuppers.map((t) => t.nombre).join(' y ')} ${tuppers.length > 1 ? 'se llevan' : 'se lleva'} la comida en tupper.`),
    h('section', { class: 'panel diet', style: { '--n': personas.length } },
      h('div', { class: 'diet-row diet-head' }, h('span', {}), personas.map((p) => h('h2', {}, p.nombre))),
      Object.entries(TOMAS).map(([k, label]) => {
        const cells = personas.map((p) => p.semana?.[day]?.[k]);
        if (cells.every(isEmpty)) return null;
        const now2 = day === today && currentToma(now).actual === k;
        return h('div', { class: 'diet-row' + (now2 ? ' is-now' : '') },
          h('p', { class: 'diet-toma' }, label, now2 && h('small', {}, 'Ahora')),
          personas.map((p, i) => h('div', { class: 'diet-cell' }, h('p', { class: 'diet-who' }, p.nombre), tomaBlock(cells[i]))));
      })),
    cook.length > 0 && h('section', { class: 'panel', style: { marginTop: '22px' } },
      h('h2', {}, 'Para cocinar'),
      h('p', { class: 'hint', style: { marginBottom: '10px' } }, 'Cantidades sumadas de los platos que coméis los dos.'),
      h('div', { class: 'cook-grid' }, cook.map((c) => h('div', {},
        h('p', { class: 'toma-plato' }, `${TOMAS[c.toma]}: ${c.plato}`),
        ingList(c.ingredientes))))));
}

/** Panel de «Hoy»: lo que toca ahora a cada uno, el siguiente y el aviso del tupper. */
export function dietPeek(now, diet) {
  const plan = diet?.data;
  const day = dayKey(now);
  const { actual, siguiente } = currentToma(now);
  const box = h('a', { class: 'panel panel-link', href: '#/menu' }, h('h2', {}, `Ahora toca: ${TOMAS[actual].toLowerCase()}`));
  const show = plan.personas.filter((p) => !isEmpty(p.semana?.[day]?.[actual]));
  if (!show.length) box.append(h('p', { class: 'empty' }, 'Nada pautado ahora.'));
  for (const p of show) box.append(h('div', { class: 'peek-person' }, h('p', { class: 'diet-who' }, p.nombre), tomaBlock(p.semana[day][actual], { compact: true })));
  if (siguiente) {
    const next = plan.personas.map((p) => p.semana?.[day]?.[siguiente]).filter((t) => !isEmpty(t));
    const names = [...new Set(next.map((t) => t.plato || 'a elegir'))];
    if (names.length) box.append(h('p', { class: 'note' }, `Después, ${TOMAS[siguiente].toLowerCase()}: ${names.join(' / ')}`));
  }
  // Tupper: la noche antes (desde las 19 h) y la mañana del día
  const tomorrow = dayKey(addDays(now, 1));
  const tt = now.getHours() >= 19 ? tupperOn(plan, tomorrow) : now.getHours() < 11 ? tupperOn(plan, day) : [];
  if (tt.length) {
    const when = now.getHours() >= 19 ? 'Mañana' : 'Hoy';
    box.append(h('p', { class: 'tupper-line' }, `🥡 ${when}, tupper: ${tt.map((t) => `${t.nombre} (${t.plato})`).join(', ')}`));
  }
  const left = cycleDaysLeft(plan, now);
  if (left != null && left <= 5) box.append(h('p', { class: 'note note-error' }, left < 0 ? 'El ciclo del menú ha terminado.' : `El ciclo del menú acaba en ${left} ${left === 1 ? 'día' : 'días'}.`));
  return box;
}

