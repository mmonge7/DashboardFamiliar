// Ajustes de este dispositivo: servidor, ubicación del tiempo, aparatos para «mejores horas» y horario nocturno.
import { h, toast } from '../ui.js';
import { getSettings, saveSettings, DEFAULTS } from '../store.js';
import { searchPlace } from '../data/weather.js';
import { server } from '../api.js';

function field(label, input, hint) {
  const id = `f-${Math.random().toString(36).slice(2, 8)}`;
  input.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint && h('p', { class: 'hint' }, hint));
}

export function renderSettings(state, rerender, reload) {
  const s = getSettings();
  const servidor = h('input', { type: 'url', value: s.servidor, placeholder: 'https://mi-servidor.tu-red.ts.net', inputmode: 'url', autocapitalize: 'off', spellcheck: 'false' });
  const token = h('input', { type: 'password', value: s.token, placeholder: 'Token de la app', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
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

  const aparatos = s.aparatos.map((a) => ({
    emoji: h('input', { type: 'text', value: a.emoji, maxlength: 4, 'aria-label': 'Icono' }),
    nombre: h('input', { type: 'text', value: a.nombre, 'aria-label': 'Nombre' }),
    horas: h('input', { type: 'number', min: 1, max: 12, step: 1, value: a.horas, 'aria-label': 'Horas' }),
    kwh: h('input', { type: 'number', min: 0.1, max: 80, step: 0.1, value: a.kwh, 'aria-label': 'kWh' }),
  }));

  const collect = () => ({
    ...s,
    servidor: servidor.value.trim().replace(/\/+$/, ''),
    token: token.value.trim(),
    demo: demo.checked,
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
      status.textContent = `Conectado. ${r.calendarios} calendarios${r.compra ? ', lista de la compra disponible' : ', sin lista de la compra todavía'}.`;
    } catch (e) {
      status.className = 'hint status-bad';
      status.textContent = e.status === 403 ? 'El servidor responde, pero el token no es correcto.' : `No se pudo conectar: ${e.message}`;
    }
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
      h('section', { class: 'panel' }, h('h2', {}, 'Servidor de casa'),
        h('div', { class: 'form' },
          field('Dirección', servidor, 'La que te da Tailscale para tu servidor (empieza por https://). Ver servidor/README.md.'),
          field('Token', token, 'El contenido de secretos/app.token en el servidor.'),
          h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-quiet', onclick: test }, 'Probar conexión')),
          status,
          h('label', { class: 'switch' }, demo, 'Usar datos de ejemplo aunque haya servidor'))),
      h('section', { class: 'panel' }, h('h2', {}, 'Tiempo'),
        h('div', { class: 'form' }, field('Municipio', placeInput), results, placeLabel, h('p', { class: 'hint' }, 'Datos del tiempo de Open-Meteo.com (CC BY 4.0).'),
          h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-quiet', onclick: findPlace }, 'Buscar')))),
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
    h('section', { class: 'panel', style: { marginTop: '22px', maxWidth: '760px' } }, h('h2', {}, 'Instalar en el iPad o el iPhone'),
      h('p', { class: 'soft' }, 'Abre esta página en Safari, toca Compartir y elige «Añadir a pantalla de inicio». Para dejar el iPad fijo en la pared, activa Acceso Guiado en Ajustes > Accesibilidad y pulsa tres veces el botón lateral con la app abierta.')));
}
