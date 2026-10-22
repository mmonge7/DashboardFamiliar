// Tipologías de los eventos (Común, Personal, Trabajo… editables) y creación de eventos en iCloud.
// Con conexión, las tipologías se comparten en Cloudflare (/api/tipos); sin ella, se guardan en este dispositivo.
import { server } from '../api.js';
import { isDemo } from '../store.js';

const KEY_LOCAL = 'casa.tipos.v1';
const KEY_PENDING = 'casa.pendientes.v1';

export const DEFAULT_TIPOS = [
  { id: 'comun', nombre: 'Común', color: '#2E8B6A' },
  { id: 'personal', nombre: 'Personal', color: '#3B6FD8' },
  { id: 'trabajo', nombre: 'Trabajo', color: '#7A5AC8' },
  { id: 'otro', nombre: 'Otro', color: '#D98A1E' },
];
const DEMO_POR_CALENDARIO = { familia: 'comun', trabajo: 'trabajo', cole: 'comun', deporte: 'comun' };

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

/** { tipos, porCalendario, eventos: {uid: tipoId}, shared } */
export async function loadTipos() {
  if (isDemo()) {
    const local = readJson(KEY_LOCAL, {});
    return { tipos: local.tipos || DEFAULT_TIPOS, porCalendario: local.porCalendario || DEMO_POR_CALENDARIO, eventos: local.eventos || {}, shared: false };
  }
  try {
    const r = await server('tipos');
    const cfg = { tipos: r.tipos?.length ? r.tipos : DEFAULT_TIPOS, porCalendario: r.porCalendario || {}, eventos: r.eventos || {}, shared: true };
    writeJson(KEY_LOCAL + ':copia', cfg);
    return cfg;
  } catch {
    // Sin conexión o con el servidor de casa (que no guarda tipologías): última copia o valores por defecto
    const copy = readJson(KEY_LOCAL + ':copia', null);
    return copy ? { ...copy, shared: true } : { tipos: DEFAULT_TIPOS, porCalendario: {}, eventos: {}, shared: false };
  }
}

export async function saveTipos(cfg) {
  if (isDemo()) {
    writeJson(KEY_LOCAL, { tipos: cfg.tipos, porCalendario: cfg.porCalendario, eventos: cfg.eventos || {} });
    return;
  }
  await server('tipos', { method: 'PUT', body: { tipos: cfg.tipos, porCalendario: cfg.porCalendario } });
}

export async function setEventTipo(cfg, uid, tipo) {
  if (isDemo()) {
    const local = readJson(KEY_LOCAL, {});
    local.eventos = { ...(local.eventos || {}), [uid]: tipo };
    writeJson(KEY_LOCAL, { tipos: cfg.tipos, porCalendario: cfg.porCalendario, ...local });
  } else {
    await server('tipos/evento', { method: 'PUT', body: { uid, tipo } });
  }
  cfg.eventos = { ...(cfg.eventos || {}), [uid]: tipo };
}

const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Tipología de un evento: la elegida para ese evento, la de sus categorías, o la de su calendario. */
export function tipoOf(ev, cfg) {
  if (!cfg) return null;
  const byId = (id) => cfg.tipos.find((t) => t.id === id) || null;
  if (ev.uid && cfg.eventos?.[ev.uid]) return byId(cfg.eventos[ev.uid]);
  if (ev.tipoId) { const t = byId(ev.tipoId); if (t) return t; }
  for (const c of ev.categories || []) {
    const t = cfg.tipos.find((x) => norm(x.nombre) === norm(c) || x.id === norm(c));
    if (t) return t;
  }
  return byId(cfg.porCalendario?.[ev.cal?.clave]) || null;
}

/** Añade a cada evento su tipología y el color con el que se pinta. */
export function decorate(events, cfg, colorPor = 'tipo') {
  for (const ev of events) {
    ev.tipo = tipoOf(ev, cfg);
    ev.color = colorPor === 'tipo' && ev.tipo ? ev.tipo.color : ev.cal.color;
  }
  return events;
}

// ---------- Crear eventos ----------

export async function loadDestinos({ refresh = false } = {}) {
  return server('destinos' + (refresh ? '?refrescar=1' : ''));
}

function payload(data, destino, tipo) {
  return {
    destino: destino.id, titulo: data.titulo, todoElDia: data.todoElDia,
    inicio: data.todoElDia ? data.dia : data.inicio.toISOString(),
    fin: data.todoElDia ? data.diaFin : data.fin.toISOString(),
    lugar: data.lugar, notas: data.notas, tipo: tipo?.id || '', tipoNombre: tipo?.nombre || '',
  };
}

/** Crea el evento en iCloud (el Worker lo apunta como «creado desde la app»: se podrá editar y borrar). */
export function createEvent(data, destino, tipo) {
  return server('eventos', { method: 'POST', body: payload(data, destino, tipo) });
}

export function updateEvent(uid, data, destino, tipo) {
  return server(`eventos/${encodeURIComponent(uid)}`, { method: 'PUT', body: payload(data, destino, tipo) });
}

export function deleteEvent(uid) {
  return server(`eventos/${encodeURIComponent(uid)}`, { method: 'DELETE' });
}

/** Los eventos creados desde la app, leídos de iCloud en este momento. Con el servidor de casa no existen: lista vacía. */
export async function loadAppEvents() {
  try { return await server('eventos'); } catch { return { eventos: [], borrados: [] }; }
}

// Versión anterior: eventos «pendientes» guardados en el dispositivo. Ya no hacen falta.
try { localStorage.removeItem(KEY_PENDING); } catch { /* sin almacenamiento */ }
