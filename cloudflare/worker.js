/**
 * Conexión de la app «Casa» sin aparatos en casa: un Worker de Cloudflare (gratis).
 *
 * Hace lo mismo que el servidor de casa (servidor/api/familia_api.py), con la misma API:
 *   GET  /api/estado                    → {"ok", "tipo", "calendarios", "compra", "menu"}
 *   GET  /api/calendarios               → [{clave, nombre, color, papel}]
 *   GET  /api/ics/<clave>               → el calendario (iCloud, Google…). El enlace nunca sale de aquí
 *   GET  /api/luz?desde=&hasta=         → precio PVPC de Red Eléctrica
 *   GET  /api/menu                      → {"dias": {"AAAA-MM-DD": {"comida", "cena"}}}
 *   PUT  /api/menu/AAAA-MM-DD {comida, cena}
 *   GET  /api/compra                    → {"listas": [...], "frecuentes": [...]}
 *   POST /api/compra/anadir {producto}  /  POST /api/compra/quitar {producto}
 *
 * Configuración (en Cloudflare → tu Worker → Settings → Variables and Secrets):
 *   APP_TOKEN  (secreto)  el token de la app: cada petición lo trae en la cabecera X-Familia
 *   ORIGENES   (texto)    la web de la app, p. ej. https://mmonge7.github.io (varias, separadas por comas)
 *   CAL_<Nombre> (secreto) un calendario por variable. Valor: el enlace (webcal://… o https://…),
 *                          o «#color;enlace», o «#color;menu;enlace» para un calendario de menú del cole.
 *                          Ej.: CAL_Familia = webcal://p123-caldav.icloud.com/published/2/XXXX
 * Y un espacio KV enlazado con el nombre de variable CASA (guarda el menú y la lista de la compra).
 */

const COLORS = ['#3B6FD8', '#7A5AC8', '#2E8B6A', '#D98A1E', '#C2463D', '#1E8FA8', '#8A6D3B'];
const ICS_TTL = 300;      // segundos que se guarda cada calendario
const LUZ_TTL = 900;
const MAX_TEXT = 120;
const KEEP_MENU_DAYS = 180;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const reply = (code, data, extra = {}) => new Response(typeof data === 'string' ? data : JSON.stringify(data), {
      status: code,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors, ...extra },
    });

    if (!env.APP_TOKEN || env.APP_TOKEN.length < 24) return reply(500, { error: 'Falta APP_TOKEN (mínimo 24 caracteres) en la configuración del Worker' });
    if (!safeEqual(request.headers.get('X-Familia') || '', env.APP_TOKEN)) {
      await new Promise((r) => setTimeout(r, 500)); // frena los intentos a ciegas
      return reply(403, { error: 'Token no válido' });
    }

    const path = url.pathname.replace(/\/+$/, '');
    try {
      if (request.method === 'GET' && path === '/api/estado') {
        return reply(200, { ok: true, tipo: 'cloudflare', version: '2.0', calendarios: calendars(env).length, compra: !!env.CASA, menu: !!env.CASA });
      }
      if (request.method === 'GET' && path === '/api/calendarios') {
        return reply(200, calendars(env).map(({ url: _u, ...c }) => c));
      }
      let m = path.match(/^\/api\/ics\/([A-Za-z0-9_-]{1,40})$/);
      if (request.method === 'GET' && m) {
        const cal = calendars(env).find((c) => c.clave === m[1]);
        if (!cal) return reply(404, { error: 'Ese calendario no existe' });
        const res = await fetch(cal.url, { cf: { cacheTtl: ICS_TTL, cacheEverything: true }, headers: { 'User-Agent': 'casa-familia/2.0' } });
        if (!res.ok) return reply(502, { error: `El calendario «${cal.nombre}» respondió ${res.status}. ¿Sigue siendo público?` });
        return new Response(await res.text(), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store', ...cors } });
      }
      if (request.method === 'GET' && path === '/api/luz') {
        const desde = url.searchParams.get('desde') || '', hasta = url.searchParams.get('hasta') || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return reply(400, { error: 'Fechas no válidas (AAAA-MM-DD)' });
        const ree = 'https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real'
          + `?start_date=${desde}T00:00&end_date=${hasta}T23:59&time_trunc=hour`;
        const res = await fetch(ree, { cf: { cacheTtl: LUZ_TTL, cacheEverything: true } });
        if (!res.ok) return reply(502, { error: `Red Eléctrica respondió ${res.status}` });
        return reply(200, await res.text());
      }

      if (!env.CASA) return reply(404, { error: 'Falta enlazar el espacio KV «CASA» en el Worker' });

      if (request.method === 'GET' && path === '/api/menu') {
        return reply(200, { dias: (await env.CASA.get('menu', 'json')) || {} });
      }
      m = path.match(/^\/api\/menu\/(\d{4}-\d{2}-\d{2})$/);
      if (request.method === 'PUT' && m) {
        const body = await readJson(request);
        const value = { comida: text(body.comida), cena: text(body.cena) };
        const dias = (await env.CASA.get('menu', 'json')) || {};
        if (value.comida || value.cena) dias[m[1]] = value; else delete dias[m[1]];
        const limit = new Date(Date.now() - KEEP_MENU_DAYS * 86400000).toISOString().slice(0, 10);
        for (const k of Object.keys(dias)) if (k < limit) delete dias[k];
        await env.CASA.put('menu', JSON.stringify(dias));
        return reply(200, { ok: true });
      }

      if (request.method === 'GET' && path === '/api/compra') {
        return reply(200, shoppingView(await loadShop(env)));
      }
      if (request.method === 'POST' && (path === '/api/compra/anadir' || path === '/api/compra/quitar')) {
        const producto = text((await readJson(request)).producto);
        if (!producto) return reply(400, { error: 'Falta el producto' });
        const shop = await loadShop(env);
        const key = norm(producto);
        if (path.endsWith('anadir')) {
          if (!shop.items.some((i) => norm(i.producto) === key)) {
            shop.items.unshift({ producto: cap(producto), detalle: '', vence: '' });
            const day = new Date().toISOString().slice(0, 10);
            const c = shop.conteo[key] || { nombre: cap(producto), dias: [] };
            if (!c.dias.includes(day)) c.dias = [...c.dias, day].slice(-60);
            shop.conteo[key] = c;
          }
          await env.CASA.put('compra', JSON.stringify(shop));
          return reply(200, { anadido: producto });
        }
        const before = shop.items.length;
        shop.items = shop.items.filter((i) => norm(i.producto) !== key);
        if (shop.items.length === before) return reply(409, { error: 'Ya no está en la lista' });
        await env.CASA.put('compra', JSON.stringify(shop));
        return reply(200, { quitado: producto });
      }
      return reply(404, { error: 'No existe' });
    } catch (e) {
      return reply(e.status || 500, { error: e.status ? e.message : 'Error del Worker' });
    }
  },
};

function corsHeaders(request, env) {
  const origin = (request.headers.get('Origin') || '').replace(/\/+$/, '');
  const allowed = (env.ORIGENES || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  if (!origin || !(allowed.includes(origin) || allowed.includes('*'))) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'X-Familia, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Max-Age': '600',
  };
}

/** Calendarios de las variables CAL_<Nombre>, en orden alfabético. */
export function calendars(env) {
  return Object.keys(env).filter((k) => /^CAL_[A-Za-z0-9_]{1,40}$/.test(k)).sort().map((k, i) => {
    const parts = String(env[k]).trim().split(';').map((s) => s.trim());
    const link = parts.pop();
    const color = parts.find((p) => /^#[0-9a-f]{6}$/i.test(p)) || COLORS[i % COLORS.length];
    const papel = parts.includes('menu') ? 'menu' : 'events';
    const clave = k.slice(4).toLowerCase();
    return { clave, nombre: k.slice(4).replace(/_/g, ' '), color, papel, url: link.replace(/^webcal:\/\//i, 'https://') };
  }).filter((c) => /^https:\/\//i.test(c.url));
}

async function loadShop(env) {
  const s = (await env.CASA.get('compra', 'json')) || {};
  return { items: s.items || [], conteo: s.conteo || {} };
}

/** Lo que espera la app (mismo formato que compra.json del servidor de casa). */
function shoppingView(shop) {
  const inList = new Set(shop.items.map((i) => norm(i.producto)));
  const frecuentes = Object.entries(shop.conteo)
    .filter(([k, v]) => !inList.has(k) && v.dias.length >= 2)
    .sort((a, b) => b[1].dias.length - a[1].dias.length || a[1].nombre.localeCompare(b[1].nombre))
    .slice(0, 3)
    .map(([, v]) => ({ producto: v.nombre, veces: v.dias.length }));
  return {
    items: shop.items.map(({ producto, detalle }) => ({ producto, detalle })),
    listas: [{ nombre: 'Lista de la compra', color: '#2E7D5B', items: shop.items }],
    frecuentes,
    actualizado: new Date().toISOString(),
  };
}

async function readJson(request) {
  const raw = await request.text();
  if (raw.length > 2048) throw Object.assign(new Error('Petición demasiado grande'), { status: 413 });
  try { return JSON.parse(raw || '{}') || {}; } catch { throw Object.assign(new Error('JSON no válido'), { status: 400 }); }
}

function text(v) { return String(v ?? '').trim().slice(0, MAX_TEXT); }
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
export function norm(s) {
  return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Comparación en tiempo constante (no revela cuántos caracteres coinciden). */
function safeEqual(a, b) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] || 0) ^ (eb[i] || 0);
  return diff === 0;
}
