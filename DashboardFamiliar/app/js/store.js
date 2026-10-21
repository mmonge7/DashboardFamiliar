// Ajustes del dispositivo y copia local de los últimos datos.
// Todo vive en localStorage de ESTE iPad/iPhone: nada de esto se sube al repositorio.

const KEY_SETTINGS = 'casa.ajustes.v1';
const KEY_CACHE = 'casa.cache.v1:';

export const DEFAULTS = {
  servidor: '',            // https://mi-servidor.tu-tailnet.ts.net  (sin barra final)
  token: '',               // el de secretos/app.token del servidor
  ciudad: 'Madrid',
  lat: 40.4168,
  lon: -3.7038,
  // Electrodomésticos para «mejores horas» y el ahorro estimado
  aparatos: [
    { emoji: '🚗', nombre: 'Cargar el coche', horas: 4, kwh: 9.0 },
    { emoji: '🍽️', nombre: 'Lavavajillas', horas: 2, kwh: 1.2 },
    { emoji: '🧺', nombre: 'Lavadora', horas: 2, kwh: 1.0 },
  ],
  nocheDesde: 23,          // a partir de esta hora la pantalla se oscurece
  nocheHasta: 7,
  demo: false,             // fuerza los datos de ejemplo aunque haya servidor
};

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

export function getSettings() {
  const raw = safeGet(KEY_SETTINGS);
  if (!raw) return structuredClone(DEFAULTS);
  try {
    return { ...structuredClone(DEFAULTS), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function saveSettings(s) {
  return safeSet(KEY_SETTINGS, JSON.stringify(s));
}

/** ¿Hay que enseñar datos de ejemplo? (sin servidor configurado o modo demostración activado) */
export function isDemo(s = getSettings()) {
  return s.demo || !s.servidor || !s.token;
}

export function cacheGet(name) {
  const raw = safeGet(KEY_CACHE + name);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function cachePut(name, data) {
  safeSet(KEY_CACHE + name, JSON.stringify({ at: Date.now(), data }));
}
