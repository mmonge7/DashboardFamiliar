// Ajustes de este dispositivo: servidor, ubicación del tiempo, aparatos para «mejores horas» y horario nocturno.
import { h, toast } from '../ui.js';
import { getSettings, saveSettings, DEFAULTS } from '../store.js';
import { searchPlace } from '../data/weather.js';
import { server } from '../api.js';
import { PRESETS } from '../data/tariff.js';
import { DEFAULT_TIPOS, saveTipos } from '../data/events.js';
import { forgetDestinos } from './newEvent.js';

function field(label, input, hint) {
  const id = `f-${Math.random().toString(36).slice(2, 8)}`;
  input.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint && h('p', { class: 'hint' }, hint));
}

export function renderSettings(state, rerender, reload) {
  const s = getSettings();
  const servidor = h('input', { type: 'url', value: s.servidor, placeholder: 'https://mi-servidor.tu-red.ts.net', inputmode: 'url', autocapitalize: 'off', spellcheck: 'false' });
  const token = h('input', { type: 'password', value: s.token, placeholder: 'Token de la app', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  // Huella del token para comparar a simple vista entre dispositivos (sin enseñarlo entero)
  const tokenInfo = h('p', { class: 'hint' });
  const cleanToken = (v) => String(v).replace(/[^0-9a-zA-Z_-]/g, '');
  const showInfo = () => {
    const t = cleanToken(token.value);
    tokenInfo.textContent = t ? `${t.length} caracteres: empieza por «${t.slice(0, 4)}» y acaba en «${t.slice(-4)}». Debe ser igual en todos los dispositivos.` : '';
  };
  token.addEventListener('input', showInfo);
  showInfo();
  const toggleShow = (e) => {
    token.type = token.type === 'password' ? 'text' : 'password';
    e.currentTarget.textContent = token.type === 'password' ? 'Mostrar token' : 'Ocultar token';
  };
  const copyToken = async () => {
    const t = cleanToken(token.value);
    if (!t) { toast('No hay token que copiar'); return; }
    try { await navigator.clipboard.writeText(t); toast('Token copiado'); } catch {
      token.type = 'text'; token.select(); toast('Selecciónalo y cópialo a mano');
    }
  };
  const status = h('p', { class: 'hint', 'aria-live': 'polite' });
  const demo = h('input', { type: 'checkbox', checked: s.demo });
  const desde = h('input', { type: 'number', min: 0, max: 23, value: s.nocheDesde });
  const hasta = h('input', { type: 'number', min: 0, max: 23, value: s.nocheHasta });

  let place = { ciudad: s.ciudad, lat: s.lat, lon: s.lon };
  const placeLabel = h('p', { class: 'hint' }, `Ahora: ${s.ciudad} (${s.lat.toFixed(3)}, ${s.lon.toFixed(3)})`);
  const placeInput = h('input', { type: 'search', placeholder: 'Busca tu municipio', enterkeyhint: 'search' });
  const results = h('div', { class: 'places' });
  const findPlace = async () => {
    const q = placeInput.value.trim();
    if (q.length < 2) return;
    results.replaceChildren(h('p', { class: 'hint' }, 'Buscando…'));
    try {
      const found = await searchPlace(q);
      results.replaceChildren(...(found.length ? found.map((p) => h('button', {
        type: 'button',
        onclick: () => { place = { ciudad: p.name, lat: p.lat, lon: p.lon }; placeLabel.textContent = `Elegido: ${p.name}, ${p.region}`; results.replaceChildren(); },
      }, `${p.name}, ${p.region}`)) : [h('p', { class: 'hint' }, 'No se ha encontrado ese municipio.')]));
    } catch (e) {
      results.replaceChildren(h('p', { class: 'hint status-bad' }, `No se pudo buscar: ${e.message}`));
    }
  };
  placeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); findPlace(); } });

  // Tarifa
  const tar = { tipo: 'pvpc', ...s.tarifa };
  const num = (v) => h('input', { type: 'number', min: 0, max: 2, step: 0.000001, value: v ?? '', inputmode: 'decimal' });
  const tNombre = h('input', { type: 'text', value: tar.nombre || '' });
  const tTipo = h('select', {},
    h('option', { value: 'unico', selected: tar.tipo === 'unico' }, 'Precio único (igual a todas horas)'),
    h('option', { value: 'tramos', selected: tar.tipo === 'tramos' }, 'Tres tramos (punta, llano, valle)'),
    h('option', { value: 'pvpc', selected: tar.tipo === 'pvpc' }, 'PVPC (precio regulado por horas)'));
  const tUnico = num(tar.unico), tPunta = num(tar.punta), tLlano = num(tar.llano), tValle = num(tar.valle);
  const unicoBox = h('div', {}, field('Precio (€/kWh, sin impuestos)', tUnico));
  const tramosBox = h('div', { class: 'field-row', style: { gridTemplateColumns: 'repeat(3, 1fr)' } },
    field('Punta', tPunta), field('Llano', tLlano), field('Valle', tValle));
  const syncTipo = () => {
    unicoBox.hidden = tTipo.value !== 'unico';
    tramosBox.hidden = tTipo.value !== 'tramos';
  };
  tTipo.addEventListener('change', syncTipo);
  syncTipo();
  const presetButtons = h('div', { class: 'actions' }, Object.entries(PRESETS).map(([k, p]) => h('button', {
    type: 'button', class: 'btn btn-quiet',
    onclick: () => {
      tNombre.value = p.nombre; tTipo.value = p.tipo;
      tUnico.value = p.unico ?? ''; tPunta.value = p.punta ?? ''; tLlano.value = p.llano ?? ''; tValle.value = p.valle ?? '';
      syncTipo();
    },
  }, k === 'pvpc' ? 'PVPC' : p.nombre.split(',')[0])));
  const pf = (el) => parseFloat(String(el.value).replace(',', '.'));

  const aparatos = s.aparatos.map((a) => ({
    emoji: h('input', { type: 'text', value: a.emoji, maxlength: 4, 'aria-label': 'Icono' }),
    nombre: h('input', { type: 'text', value: a.nombre, 'aria-label': 'Nombre' }),
    horas: h('input', { type: 'number', min: 1, max: 12, step: 1, value: a.horas, 'aria-label': 'Horas' }),
    kwh: h('input', { type: 'number', min: 0.1, max: 80, step: 0.1, value: a.kwh, 'aria-label': 'kWh' }),
  }));

  const collect = () => ({
    ...s,
    servidor: servidor.value.trim().replace(/\/+$/, ''),
    token: cleanToken(token.value),
    demo: demo.checked,
    tarifa: tTipo.value === 'tramos'
      ? { tipo: 'tramos', nombre: tNombre.value.trim() || 'Mi tarifa', punta: pf(tPunta), llano: pf(tLlano), valle: pf(tValle) }
      : tTipo.value === 'unico'
        ? { tipo: 'unico', nombre: tNombre.value.trim() || 'Mi tarifa', unico: pf(tUnico) }
        : { tipo: 'pvpc', nombre: PRESETS.pvpc.nombre },
    nocheDesde: Math.min(23, Math.max(0, parseInt(desde.value, 10) || 0)),
    nocheHasta: Math.min(23, Math.max(0, parseInt(hasta.value, 10) || 0)),
    ciudad: place.ciudad, lat: place.lat, lon: place.lon,
    aparatos: aparatos.map((a) => ({
      emoji: a.emoji.value.trim() || '🔌',
      nombre: a.nombre.value.trim() || 'Aparato',
      horas: Math.min(12, Math.max(1, parseInt(a.horas.value, 10) || 1)),
      kwh: Math.max(0.1, parseFloat(String(a.kwh.value).replace(',', '.')) || 1),
    })),
  });

  const test = async () => {
    const next = collect();
    if (!next.servidor || !next.token) { status.className = 'hint status-bad'; status.textContent = 'Escribe la dirección del servidor y el token.'; return; }
    saveSettings(next);
    status.className = 'hint'; status.textContent = 'Probando…';
    try {
      const r = await server('estado');
      status.className = 'hint status-ok';
      const donde = r.tipo === 'cloudflare' ? 'Cloudflare' : 'el servidor de casa';
      const partes = [`${r.calendarios} ${r.calendarios === 1 ? 'calendario' : 'calendarios'}`];
      if (r.menu) partes.push('menú compartido');
      partes.push(r.compra ? 'lista de la compra' : 'sin lista de la compra todavía');
      status.textContent = `Conectado con ${donde}: ${partes.join(', ')}.`;
    } catch (e) {
      status.className = 'hint status-bad';
      status.textContent = e.status === 403
        ? 'El servidor responde, pero el token no coincide con el de Cloudflare. Compara la huella de abajo con la de otro dispositivo que funcione.'
        : `No se pudo conectar: ${e.message}`;
    }
  };

  // Token aleatorio para configurar Cloudflare: se escribe en el campo y se copia
  let genArmed = false;
  const genToken = async (e) => {
    // Si ya hay un token, pide una segunda pulsación: uno nuevo obliga a cambiarlo en Cloudflare y en todos los dispositivos
    if (cleanToken(token.value) && !genArmed) {
      genArmed = true;
      e.currentTarget.textContent = 'Pulsa otra vez: tendrás que cambiarlo en Cloudflare';
      return;
    }
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    token.type = 'text';
    token.value = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    token.select();
    showInfo();
    try { await navigator.clipboard.writeText(token.value); toast('Token copiado: pégalo como APP_TOKEN en Cloudflare'); } catch { toast('Copia el token y pégalo como APP_TOKEN en Cloudflare'); }
  };

  const save = (e) => {
    e.preventDefault();
    if (!saveSettings(collect())) { toast('No se pudo guardar (¿navegación privada?)'); return; }
    toast('Ajustes guardados');
    reload({ force: true });
  };

  return h('div', {},
    h('header', { class: 'page-head' }, h('h1', {}, 'Ajustes'), h('span', { class: 'sub' }, 'Se guardan solo en este dispositivo')),
    h('form', { class: 'form', onsubmit: save },
      h('section', { class: 'panel' }, h('h2', {}, 'Conexión'),
        h('div', { class: 'form' },
          field('Dirección', servidor, 'La de tu Worker de Cloudflare (https://casa.….workers.dev) o la de tu servidor de casa. Ver la guía en cloudflare/README.md.'),
          field('Token', token, 'El mismo valor que pusiste como APP_TOKEN en Cloudflare (o el de secretos/app.token en el servidor).'),
          tokenInfo,
          h('div', { class: 'actions' },
            h('button', { type: 'button', class: 'btn btn-quiet', onclick: toggleShow }, 'Mostrar token'),
            h('button', { type: 'button', class: 'btn btn-quiet', onclick: copyToken }, 'Copiar token')),
          h('div', { class: 'actions' },
            h('button', { type: 'button', class: 'btn btn-quiet', onclick: test }, 'Probar conexión'),
            h('button', { type: 'button', class: 'btn btn-quiet', onclick: genToken }, 'Generar un token nuevo')),
          status,
          h('label', { class: 'switch' }, demo, 'Usar datos de ejemplo aunque haya servidor'))),
      h('section', { class: 'panel' }, h('h2', {}, 'Tiempo'),
        h('div', { class: 'form' }, field('Municipio', placeInput), results, placeLabel, h('p', { class: 'hint' }, 'Datos del tiempo de Open-Meteo.com (CC BY 4.0).'),
          h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-quiet', onclick: findPlace }, 'Buscar')))),
      h('section', { class: 'panel' }, h('h2', {}, 'Tu tarifa de la luz'),
        h('div', { class: 'form' },
          h('p', { class: 'hint' }, 'Rellena con una de estas o con los precios de tu factura, sin impuestos (la app los añade).'),
          presetButtons,
          field('Nombre', tNombre),
          field('Tipo', tTipo),
          unicoBox, tramosBox)),
      h('section', { class: 'panel' }, h('h2', {}, 'Aparatos para las mejores horas'),
        h('p', { class: 'hint', style: { marginBottom: '12px' } }, 'Horas que tarda cada uno y lo que consume en total (kWh), para calcular el mejor tramo y el ahorro.'),
        h('div', { class: 'form' }, aparatos.map((a) => h('div', { class: 'aparato' },
          field('Icono', a.emoji), field('Nombre', a.nombre), field('Horas', a.horas), field('kWh', a.kwh))))),
      h('section', { class: 'panel' }, h('h2', {}, 'Pantalla de noche'),
        h('p', { class: 'hint', style: { marginBottom: '12px' } }, 'En ese horario «Hoy» se queda en un reloj tenue. Tócalo para verlo todo un minuto.'),
        h('div', { class: 'field-row' }, field('Desde las', desde), field('Hasta las', hasta))),
      h('div', { class: 'actions' },
        h('button', { type: 'submit', class: 'btn' }, 'Guardar ajustes'),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { saveSettings({ ...structuredClone(DEFAULTS), servidor: s.servidor, token: s.token }); toast('Valores por defecto restaurados'); rerender(); } }, 'Restaurar valores por defecto'))),
    tiposPanel(state),
    h('section', { class: 'panel', style: { marginTop: '22px', maxWidth: '760px' } }, h('h2', {}, 'Instalar en el iPad o el iPhone'),
      h('p', { class: 'soft' }, 'Abre esta página en Safari, toca Compartir y elige «Añadir a pantalla de inicio». Para dejar el iPad fijo en la pared, activa Acceso Guiado en Ajustes > Accesibilidad y pulsa tres veces el botón lateral con la app abierta.')));
}

/** Tipologías de los eventos y la que lleva por defecto cada calendario. Se comparten con toda la familia. */
function tiposPanel(state) {
  const cfg = state.tipos || { tipos: DEFAULT_TIPOS, porCalendario: {}, colores: {}, eventos: {} };
  let rows = cfg.tipos.map((t) => ({ ...t }));
  let calendars = (state.cal?.data?.calendars || []).filter((c) => c.papel !== 'menu');
  const list = h('div', { class: 'form', style: { gap: '10px' } });
  const defaults = h('div', { class: 'form', style: { gap: '10px' } });
  const status = h('p', { class: 'hint', 'aria-live': 'polite' });
  const slug = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  const selects = new Map();
  const colors = new Map(); // clave → color elegido para el calendario
  const origin = (c) => c.colorOrigen || c.color;

  const drawDefaults = () => {
    defaults.replaceChildren(...(calendars.length ? calendars.map((c) => {
      const current = selects.get(c.clave)?.value ?? cfg.porCalendario?.[c.clave] ?? '';
      const sel = h('select', { 'aria-label': `Tipología de ${c.nombre}` },
        h('option', { value: '' }, 'Sin tipología'),
        rows.filter((t) => t.nombre.trim()).map((t) => h('option', { value: t.id, selected: t.id === current }, t.nombre)));
      selects.set(c.clave, sel);
      if (!colors.has(c.clave)) colors.set(c.clave, cfg.colores?.[c.clave] || origin(c));
      const color = h('input', { type: 'color', value: colors.get(c.clave), 'aria-label': `Color de ${c.nombre}` });
      color.addEventListener('input', () => { colors.set(c.clave, color.value); reset.hidden = color.value.toLowerCase() === origin(c).toLowerCase(); });
      const reset = h('button', {
        type: 'button', class: 'btn btn-quiet btn-small', title: 'Volver al color del calendario de Apple',
        hidden: colors.get(c.clave).toLowerCase() === origin(c).toLowerCase(),
        onclick: () => { colors.set(c.clave, origin(c)); color.value = origin(c); reset.hidden = true; },
      }, 'Original');
      return h('div', { class: 'cal-row' }, color, h('span', { class: 'cal-name' }, c.nombre, reset), sel);
    }) : [h('p', { class: 'hint' }, 'Cuando conectes tus calendarios aparecerán aquí.')]));
  };
  const draw = () => {
    list.replaceChildren(...rows.map((t, i) => {
      const color = h('input', { type: 'color', value: t.color, 'aria-label': 'Color' });
      const name = h('input', { type: 'text', value: t.nombre, maxlength: 30, 'aria-label': 'Nombre de la tipología' });
      color.addEventListener('input', () => { t.color = color.value; });
      name.addEventListener('change', () => { t.nombre = name.value.trim(); if (!t.fija) t.id = slug(t.nombre) || t.id; drawDefaults(); });
      const del = h('button', { type: 'button', class: 'btn btn-quiet btn-small', disabled: rows.length <= 1, onclick: () => { rows.splice(i, 1); draw(); } }, 'Quitar');
      return h('div', { class: 'tipo-row' }, color, name, del);
    }));
    drawDefaults();
  };
  // Las que ya existen conservan su identificador aunque se renombren (los eventos guardan el identificador)
  rows.forEach((t) => { t.fija = true; });
  draw();
  // Los calendarios y las tipologías pueden llegar después de abrir Ajustes
  let touched = false;
  list.addEventListener('input', () => { touched = true; });
  const onData = (e) => {
    if (!list.isConnected) { window.removeEventListener('casa:datos', onData); return; }
    const st = e.detail.state;
    if (e.detail.key === 'cal') { calendars = (st.cal?.data?.calendars || []).filter((c) => c.papel !== 'menu'); drawDefaults(); }
    if (e.detail.key === 'tipos' && st.tipos && !touched) { Object.assign(cfg, st.tipos); rows = st.tipos.tipos.map((t) => ({ ...t, fija: true })); draw(); }
  };
  window.addEventListener('casa:datos', onData);

  const PALETTE = ['#E8604C', '#1E8FA8', '#C2463D', '#8A6D3B', '#D98A1E', '#7A5AC8', '#2E8B6A', '#3B6FD8'];
  const add = () => {
    const used = new Set(rows.map((t) => t.color.toLowerCase()));
    rows.push({ id: `tipo-${Date.now().toString(36)}`, nombre: 'Nueva', color: PALETTE.find((c) => !used.has(c.toLowerCase())) || PALETTE[0] });
    draw();
    list.lastChild?.querySelector('input[type=text]')?.select();
  };
  const save = async () => {
    const tipos = rows.filter((t) => t.nombre.trim()).map(({ id, nombre, color }) => ({ id, nombre: nombre.trim(), color }));
    const ids = new Set(tipos.map((t) => t.id));
    if (!tipos.length || ids.size !== tipos.length) { status.className = 'hint status-bad'; status.textContent = 'Revisa los nombres: no pueden quedar vacíos ni repetirse.'; return; }
    const porCalendario = {};
    for (const [clave, sel] of selects) if (sel.value && ids.has(sel.value)) porCalendario[clave] = sel.value;
    // Solo se guardan los colores cambiados; el resto sigue el del calendario de Apple
    const colores = {};
    for (const c of calendars) {
      const v = colors.get(c.clave);
      if (v && v.toLowerCase() !== origin(c).toLowerCase()) colores[c.clave] = v;
    }
    try {
      await saveTipos({ tipos, porCalendario, colores, eventos: cfg.eventos });
      Object.assign(cfg, { tipos, porCalendario, colores });
      if (state.tipos !== cfg) state.tipos = { ...cfg, eventos: cfg.eventos || {} };
      toast('Tipologías y colores guardados');
      forgetDestinos();
      window.dispatchEvent(new Event('casa:recargar'));
    } catch (e) { status.className = 'hint status-bad'; status.textContent = `No se pudieron guardar: ${e.message}`; }
  };

  return h('section', { class: 'panel', style: { marginTop: '22px', maxWidth: '760px' } },
    h('h2', {}, 'Tipologías de los eventos'),
    h('p', { class: 'hint', style: { marginBottom: '12px' } },
      cfg.shared ? 'Se comparten con toda la familia. Cada evento puede tener la suya (tócalo en el calendario para cambiarla).'
        : 'Se guardan en este dispositivo hasta que conectes la app.'),
    list,
    h('div', { class: 'actions', style: { marginTop: '10px' } }, h('button', { type: 'button', class: 'btn btn-quiet', onclick: add }, 'Añadir tipología')),
    h('h3', { style: { margin: '22px 0 4px', fontFamily: 'var(--display)' } }, 'Calendarios'),
    h('p', { class: 'hint', style: { marginBottom: '10px' } }, 'El color con el que se ve cada calendario en la app (solo en la app: en el iPhone no cambia) y la tipología que llevan sus eventos por defecto.'),
    defaults,
    status,
    h('div', { class: 'actions', style: { marginTop: '14px' } }, h('button', { type: 'button', class: 'btn', onclick: save }, 'Guardar tipologías y colores')));
}
