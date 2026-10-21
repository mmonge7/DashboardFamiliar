// Acceso a la red: servidor propio (con token) y servicios públicos (tiempo, REE).
import { getSettings, cacheGet, cachePut } from './store.js';

const TIMEOUT_MS = 15000;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(url, { method = 'GET', headers = {}, body, as = 'json' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      let msg = `Error ${res.status}`;
      try { const j = await res.json(); if (j.error) msg = j.error; } catch { /* sin cuerpo JSON */ }
      throw new HttpError(res.status, msg);
    }
    return as === 'text' ? res.text() : res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('El servidor no responde');
    if (e instanceof TypeError) throw new Error('Sin conexión con el servidor');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Llamada a la API del servidor de la familia (ver servidor/api/familia_api.py). */
export function server(path, opts = {}) {
  const s = getSettings();
  if (!s.servidor) throw new Error('Falta la dirección del servidor en Ajustes');
  const base = s.servidor.replace(/\/+$/, '');
  return request(`${base}/api/${path}`, { ...opts, headers: { 'X-Familia': s.token, ...(opts.headers || {}) } });
}

export function publicJson(url) {
  return request(url);
}

/**
 * Recurso con copia local: si la copia es reciente se usa tal cual; si no, se pide y, si falla,
 * se sigue enseñando la copia anterior marcada como antigua (así el panel nunca se queda en blanco).
 */
export async function cached(name, maxAgeMs, fetcher, { force = false } = {}) {
  const copy = cacheGet(name);
  if (!force && copy && Date.now() - copy.at < maxAgeMs) {
    return { data: copy.data, at: copy.at, stale: false };
  }
  try {
    const data = await fetcher();
    cachePut(name, data);
    return { data, at: Date.now(), stale: false };
  } catch (error) {
    if (copy) return { data: copy.data, at: copy.at, stale: true, error };
    return { data: null, at: 0, stale: true, error };
  }
}
