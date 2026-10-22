// Formulario «Nuevo evento»: título, día y hora, calendario de iCloud donde guardarlo y tipología.
import { h, openSheet, toast, addDays } from '../ui.js';
import { getSettings, isDemo } from '../store.js';
import { loadDestinos, createEvent } from '../data/events.js';

let destinosCache = null;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function field(label, input, hint) {
  const id = `ne-${Math.random().toString(36).slice(2, 8)}`;
  input.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint && h('p', { class: 'hint' }, hint));
}

/** Abre el formulario. [day]: el día tocado en el calendario (o hoy). [cfg]: tipologías. */
export function openNewEvent(day, cfg) {
  const settings = getSettings();
  const now = new Date();
  const base = day ? new Date(day) : new Date(now);
  let start;
  if (!day || ymd(base) === ymd(now)) { start = new Date(now); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1); }
  else { start = new Date(base); start.setHours(10, 0, 0, 0); }
  const end = new Date(+start + 3600000);

  const titulo = h('input', { type: 'text', maxlength: 200, placeholder: 'Ej.: Pediatra de la peque', required: true, enterkeyhint: 'next' });
  const dia = h('input', { type: 'date', value: ymd(start), required: true });
  const todoElDia = h('input', { type: 'checkbox' });
  const horaIni = h('input', { type: 'time', value: hm(start), step: 300 });
  const horaFin = h('input', { type: 'time', value: hm(end), step: 300 });
  const diaFin = h('input', { type: 'date', value: ymd(start) });
  const lugar = h('input', { type: 'text', maxlength: 200, placeholder: 'Opcional' });
  const notas = h('textarea', { rows: 3, maxlength: 2000, placeholder: 'Opcional' });
  const destino = h('select', { disabled: true }, h('option', {}, 'Cargando tus calendarios…'));
  const tipo = h('select', {},
    h('option', { value: '' }, 'Sin tipología'),
    (cfg?.tipos || []).map((t) => h('option', { value: t.id }, t.nombre)));
  const status = h('p', { class: 'hint', 'aria-live': 'polite' });
  const submit = h('button', { type: 'submit', class: 'btn', disabled: true }, 'Crear evento');

  const horas = h('div', { class: 'field-row' }, field('Empieza', horaIni), field('Termina', horaFin));
  const finDia = field('Último día', diaFin);
  const syncAllDay = () => { horas.hidden = todoElDia.checked; finDia.hidden = !todoElDia.checked; };
  todoElDia.addEventListener('change', syncAllDay);
  syncAllDay();
  // Al cambiar la hora de inicio, la de fin se mueve con ella (misma duración)
  let durMin = 60;
  const toMin = (v) => { const [a, b] = v.split(':').map(Number); return a * 60 + b; };
  horaFin.addEventListener('change', () => { durMin = Math.max(5, toMin(horaFin.value) - toMin(horaIni.value)); });
  horaIni.addEventListener('change', () => {
    const m = Math.min(toMin(horaIni.value) + durMin, 23 * 60 + 55);
    horaFin.value = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  });
  dia.addEventListener('change', () => { if (diaFin.value < dia.value) diaFin.value = dia.value; });

  let destinos = [];
  // Tipología por defecto del calendario elegido (si se llama igual que uno de los que se ven en la app)
  const syncTipo = () => {
    const d = destinos.find((x) => x.id === destino.value);
    if (!d || !cfg || tipo.dataset.touched) return;
    const clave = d.nombre.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const t = cfg.porCalendario?.[clave] || cfg.porCalendario?.[d.cuenta.toLowerCase().replace(/[^a-z0-9]+/g, '_')];
    tipo.value = t || '';
  };
  tipo.addEventListener('change', () => { tipo.dataset.touched = '1'; });
  destino.addEventListener('change', () => {
    try { localStorage.setItem('casa.ultimoDestino', destino.value); } catch { /* sin almacenamiento */ }
    syncTipo();
  });

  const fillDestinos = (list) => {
    destinos = list;
    const last = (() => { try { return localStorage.getItem('casa.ultimoDestino'); } catch { return null; } })();
    const cuentas = [...new Set(list.map((d) => d.cuenta))];
    destino.replaceChildren(...cuentas.map((c) => h('optgroup', { label: `Cuenta de ${c}` },
      list.filter((d) => d.cuenta === c).map((d) => h('option', { value: d.id, selected: d.id === last }, d.nombre)))));
    destino.disabled = false;
    submit.disabled = false;
    syncTipo();
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const d = destinos.find((x) => x.id === destino.value);
    if (!d) return;
    const allDay = todoElDia.checked;
    const data = { titulo: titulo.value.trim(), todoElDia: allDay, lugar: lugar.value.trim(), notas: notas.value.trim() };
    if (!data.titulo) { status.className = 'hint status-bad'; status.textContent = 'Escribe un título.'; titulo.focus(); return; }
    if (allDay) {
      data.dia = dia.value;
      data.diaFin = ymd(addDays(new Date(`${(diaFin.value >= dia.value ? diaFin.value : dia.value)}T12:00`), 1));
    } else {
      data.inicio = new Date(`${dia.value}T${horaIni.value}`);
      data.fin = new Date(`${dia.value}T${horaFin.value}`);
      if (data.fin <= data.inicio) data.fin = addDays(data.fin, 1); // termina pasada la medianoche
    }
    const t = cfg?.tipos?.find((x) => x.id === tipo.value) || null;
    submit.disabled = true; submit.textContent = 'Creando…';
    try {
      await createEvent(data, d, t);
      close();
      toast(`Creado en «${d.nombre}». Lo verás en el iPhone en unos segundos.`);
      window.dispatchEvent(new Event('casa:recargar'));
    } catch (err) {
      status.className = 'hint status-bad';
      status.textContent = `No se pudo crear: ${err.message}`;
      submit.disabled = false; submit.textContent = 'Crear evento';
    }
  };

  const close = openSheet(h('form', { class: 'form', onsubmit: onSubmit },
    h('h2', {}, 'Nuevo evento'),
    field('Título', titulo),
    field('Día', dia),
    h('label', { class: 'switch' }, todoElDia, 'Todo el día'),
    horas, finDia,
    field('Calendario', destino, 'Se guarda en ese calendario de Apple y aparece en todos sus dispositivos.'),
    field('Tipología', tipo),
    field('Lugar', lugar),
    field('Notas', notas),
    status,
    h('div', { class: 'actions' }, submit)));
  setTimeout(() => titulo.focus(), 50);

  if (isDemo(settings)) {
    destino.replaceChildren(h('option', {}, 'Conecta la app para crear eventos'));
    status.textContent = 'Para crear eventos en tu calendario de Apple, conecta la app (Ajustes → Conexión) y añade tu cuenta de iCloud en Cloudflare.';
    return;
  }
  const load = destinosCache ? Promise.resolve(destinosCache) : loadDestinos();
  load.then((list) => {
    if (!list.length) throw new Error('No hay calendarios de iCloud donde se pueda escribir');
    destinosCache = list;
    fillDestinos(list);
  }).catch((err) => {
    destino.replaceChildren(h('option', {}, 'Sin calendarios disponibles'));
    status.className = 'hint status-bad';
    status.textContent = err.status === 404
      ? 'Falta añadir tu cuenta de iCloud en Cloudflare (variable ICLOUD_Nombre). Mira la guía en cloudflare/README.md.'
      : `No se pudieron cargar tus calendarios: ${err.message}`;
  });
}

/** Para Ajustes: olvidar la lista y volver a pedirla (p. ej. tras crear un calendario nuevo en Apple). */
export function forgetDestinos() { destinosCache = null; }

