// Arranque: rutas por #hash, carga de datos, refresco periódico y modo noche.
import { getSettings, isDemo } from './store.js';
import { h, time, longDay, cap } from './ui.js';
import { loadCalendar } from './data/calendar.js';
import { loadPrices } from './data/energy.js';
import { loadWeather } from './data/weather.js';
import { loadShopping } from './data/shopping.js';
import { loadMenu } from './data/menu.js';
import { loadTipos, decorate } from './data/events.js';
import { setTiposCfg } from './views/common.js';
import { renderToday } from './views/today.js';
import { renderCalendar } from './views/calendar.js';
import { renderEnergy } from './views/energy.js';
import { renderShopping } from './views/shopping.js';
import { renderMenu } from './views/menu.js';
import { renderSettings } from './views/settings.js';

const VIEWS = {
  hoy: renderToday,
  calendario: renderCalendar,
  menu: renderMenu,
  luz: renderEnergy,
  compra: renderShopping,
  ajustes: renderSettings,
};
// Pantallas que se repintan solas cada minuto (las de formularios no, para no perder lo que se escribe)
const LIVE = new Set(['hoy', 'calendario', 'luz']);
const REFRESH_MS = 5 * 60000;

const state = { now: new Date(), cal: null, prices: null, weather: null, shop: null, menu: null, tipos: null };
let wokenUntil = 0;

function currentView() {
  const v = location.hash.replace(/^#\/?/, '').split('?')[0];
  return VIEWS[v] ? v : 'hoy';
}

function isNight(now, s) {
  const hh = now.getHours();
  if (s.nocheDesde === s.nocheHasta) return false;
  return s.nocheDesde > s.nocheHasta ? hh >= s.nocheDesde || hh < s.nocheHasta : hh >= s.nocheDesde && hh < s.nocheHasta;
}

function render({ focus = false } = {}) {
  state.now = new Date();
  state.settings = getSettings();
  state.demo = isDemo(state.settings);
  if (state.cal?.data?.events) decorate(state.cal.data.events, state.tipos, state.settings.colorPor || 'tipo');
  setTiposCfg(state.tipos);
  const view = currentView();
  const main = document.getElementById('view');
  const scroll = main.scrollTop;
  main.replaceChildren(VIEWS[view](state, () => render(), (opts) => load(opts)));
  main.scrollTop = scroll;
  for (const a of document.querySelectorAll('.rail a')) {
    if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  renderNight(view);
  if (focus) main.focus({ preventScroll: true });
}

function renderNight(view) {
  document.querySelector('.night')?.remove();
  if (view !== 'hoy' || Date.now() < wokenUntil || !isNight(state.now, state.settings)) return;
  const overlay = h('div', { class: 'night', role: 'button', tabindex: '0', 'aria-label': 'Pantalla de noche. Toca para ver el panel.' },
    h('div', {}, h('div', { class: 'clock' }, time(state.now)), h('div', { class: 'date' }, cap(longDay(state.now)))));
  const wake = () => { wokenUntil = Date.now() + 60000; overlay.remove(); };
  overlay.addEventListener('click', wake);
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') wake(); });
  document.body.append(overlay);
}

let loading = null;
async function load(opts = {}) {
  if (loading && !opts.force) return loading;
  const job = async (key, fn) => {
    try { state[key] = await fn(opts); } catch (e) { state[key] = { data: state[key]?.data || null, stale: true, error: e }; }
    const typing = document.activeElement?.tagName === 'INPUT';
    window.dispatchEvent(new CustomEvent('casa:datos', { detail: { key, state } }));
    const own = { shop: 'compra', menu: 'menu' }[key];
    if (!typing && (LIVE.has(currentView()) || own === currentView())) render();
  };
  loading = Promise.all([
    job('weather', loadWeather),
    job('prices', loadPrices),
    job('cal', loadCalendar),
    job('shop', loadShopping),
    job('menu', loadMenu),
    (async () => {
      try { state.tipos = await loadTipos(); } catch { /* sin tipologías */ }
      window.dispatchEvent(new CustomEvent('casa:datos', { detail: { key: 'tipos', state } }));
      if (LIVE.has(currentView())) render();
    })(),
  ]).finally(() => { loading = null; });
  return loading;
}

// Mantener la pantalla encendida mientras la app está visible (iPad en la pared)
async function keepAwake() {
  try { if ('wakeLock' in navigator && document.visibilityState === 'visible') await navigator.wakeLock.request('screen'); } catch { /* no disponible */ }
}

window.addEventListener('hashchange', () => render({ focus: true }));
// Otras pantallas piden recargar tras crear un evento o cambiar una tipología
window.addEventListener('casa:recargar', (e) => { render(); load({ force: !!e.detail?.force }); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { load(); keepAwake(); render(); }
});
setInterval(() => { if (LIVE.has(currentView())) render(); }, 30000);
setInterval(() => load(), REFRESH_MS);

render();
load();
keepAwake();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo sin conexión */ });
}
