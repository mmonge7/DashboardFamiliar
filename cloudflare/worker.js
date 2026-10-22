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
 *   GET  /api/destinos[?refrescar=1]    → calendarios de iCloud donde se puede escribir [{id, cuenta, nombre, color}]
 *   POST /api/eventos {destino, titulo, inicio, fin, todoElDia, lugar, notas, tipo} → crea el evento en iCloud
 *   GET  /api/eventos                   → {eventos: [{uid, ics, destino, tipo}], borrados: [uid]}: los creados desde la
 *                                          app, leídos de iCloud en ese momento (si se borran en el iPhone, desaparecen)
 *   PUT  /api/eventos/<uid> {…}  /  DELETE /api/eventos/<uid>   → editar o borrar uno creado desde la app
 *   GET  /api/tipos                     → {tipos, porCalendario, eventos}  (tipologías y la de cada evento)
 *   PUT  /api/tipos {tipos, porCalendario}  /  PUT /api/tipos/evento {uid, tipo}
 *
 * Configuración (en Cloudflare → tu Worker → Settings → Variables and Secrets):
 *   APP_TOKEN  (secreto)  el token de la app: cada petición lo trae en la cabecera X-Familia
 *   ORIGENES   (texto)    la web de la app, p. ej. https://mmonge7.github.io (varias, separadas por comas)
 *   CAL_<Nombre> (secreto) un calendario por variable. Valor: el enlace (webcal://… o https://…),
 *                          o «#color;enlace», o «#color;menu;enlace» para un calendario de menú del cole.
 *                          Ej.: CAL_Familia = webcal://p123-caldav.icloud.com/published/2/XXXX
 *   ICLOUD_<Cuenta> (secreto) para crear eventos: «correo-del-Apple-ID;contraseña-de-aplicación»
 *                          (appleid.apple.com → Inicio de sesión y seguridad → Contraseñas de aplicación).
 * Y un espacio KV enlazado con el nombre de variable CASA (guarda menú, compra y tipologías).
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
        return reply(200, { ok: true, tipo: 'cloudflare', version: '2.2', calendarios: calendars(env).length, compra: !!env.CASA, menu: !!env.CASA, escritura: accounts(env).length });
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
      // ---------- Tipologías ----------
      if (request.method === 'GET' && path === '/api/tipos') {
        const cfg = (await env.CASA.get('tipos', 'json')) || {};
        return reply(200, { tipos: cfg.tipos || null, porCalendario: cfg.porCalendario || {}, eventos: (await env.CASA.get('evtipo', 'json')) || {} });
      }
      if (request.method === 'PUT' && path === '/api/tipos') {
        const body = await readJson(request, 8192);
        const tipos = Array.isArray(body.tipos) ? body.tipos.slice(0, 20).map((t) => ({
          id: String(t.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30),
          nombre: text(t.nombre).slice(0, 30), color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : '#888888',
        })).filter((t) => t.id && t.nombre) : [];
        if (!tipos.length) return reply(400, { error: 'Hace falta al menos una tipología' });
        const ids = new Set(tipos.map((t) => t.id));
        const porCalendario = {};
        for (const [k, v] of Object.entries(body.porCalendario || {})) if (/^[a-z0-9_-]{1,40}$/.test(k) && ids.has(v)) porCalendario[k] = v;
        await env.CASA.put('tipos', JSON.stringify({ tipos, porCalendario }));
        return reply(200, { ok: true });
      }
      if (request.method === 'PUT' && path === '/api/tipos/evento') {
        const body = await readJson(request);
        const uid = String(body.uid || '').slice(0, 300);
        if (!uid) return reply(400, { error: 'Falta el evento' });
        await setEventType(env, uid, String(body.tipo || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30));
        return reply(200, { ok: true });
      }

      // ---------- Crear eventos en iCloud ----------
      if (request.method === 'GET' && path === '/api/destinos') {
        if (!accounts(env).length) return reply(404, { error: 'Para crear eventos falta configurar una cuenta de iCloud (variable ICLOUD_<Nombre> en Cloudflare)' });
        const list = await destinations(env, url.searchParams.has('refrescar'));
        return reply(200, list.map(({ href: _h, ...d }) => d));
      }
      if (request.method === 'POST' && path === '/api/eventos') {
        const body = await readJson(request, 8192);
        const ev = validateEvent(body);
        let list = await destinations(env, false);
        let dest = list.find((d) => d.id === body.destino);
        if (!dest) { list = await destinations(env, true); dest = list.find((d) => d.id === body.destino); }
        if (!dest) return reply(400, { error: 'Ese calendario ya no está disponible' });
        const acc = accounts(env).find((a) => a.clave === dest.cuentaClave);
        const uid = `${crypto.randomUUID()}@casa`;
        const res = await fetch(eventUrl(dest, uid), {
          method: 'PUT',
          headers: { Authorization: basic(acc), 'Content-Type': 'text/calendar; charset=utf-8', 'If-None-Match': '*', 'User-Agent': 'casa-familia/2.1' },
          body: buildIcs(uid, ev),
        });
        if (res.status === 401 || res.status === 403) return reply(502, { error: `iCloud no deja escribir en «${dest.nombre}» (revisa la contraseña de aplicación)` });
        if (!res.ok) return reply(502, { error: `iCloud respondió ${res.status} al crear el evento` });
        if (ev.tipo) await setEventType(env, uid, ev.tipo);
        const reg = await loadReg(env);
        reg[uid] = regEntry(dest, eventUrl(dest, uid), ev);
        await env.CASA.put('creados', JSON.stringify(reg));
        return reply(201, { ok: true, uid, destino: { id: dest.id, nombre: dest.nombre, color: dest.color, cuenta: dest.cuenta } });
      }

      // ---------- Eventos creados desde la app: leer, editar y borrar ----------
      if (request.method === 'GET' && path === '/api/eventos') {
        return reply(200, await appEvents(env));
      }
      m = path.match(/^\/api\/eventos\/([^/]{1,300})$/);
      if (m && (request.method === 'PUT' || request.method === 'DELETE')) {
        const uid = decodeURIComponent(m[1]);
        const reg = await loadReg(env);
        const entry = reg[uid];
        if (!entry) return reply(404, { error: 'Ese evento no se creó desde la app (edítalo en el iPhone)' });
        const acc = accounts(env).find((a) => a.clave === entry.cuenta);
        if (!acc) return reply(400, { error: 'Falta la cuenta de iCloud de ese evento' });
        if (request.method === 'DELETE') {
          const res = await fetch(entry.href, { method: 'DELETE', headers: { Authorization: basic(acc), 'User-Agent': 'casa-familia/2.2' } });
          if (!res.ok && res.status !== 404) return reply(502, { error: `iCloud respondió ${res.status} al borrar` });
          delete reg[uid];
          await env.CASA.put('creados', JSON.stringify(reg));
          await markDeleted(env, [uid]);
          await setEventType(env, uid, '');
          return reply(200, { ok: true });
        }
        const body = await readJson(request, 8192);
        const ev = validateEvent(body);
        let list = await destinations(env, false);
        let dest = list.find((d) => d.id === (body.destino || entry.destino));
        if (!dest) { list = await destinations(env, true); dest = list.find((d) => d.id === (body.destino || entry.destino)); }
        if (!dest) return reply(400, { error: 'Ese calendario ya no está disponible' });
        const target = accounts(env).find((a) => a.clave === dest.cuentaClave);
        const url = dest.id === entry.destino ? entry.href : eventUrl(dest, uid);
        const res = await fetch(url, {
          method: 'PUT',
          headers: { Authorization: basic(target), 'Content-Type': 'text/calendar; charset=utf-8', 'User-Agent': 'casa-familia/2.2' },
          body: buildIcs(uid, ev),
        });
        if (!res.ok) return reply(502, { error: `iCloud respondió ${res.status} al guardar` });
        if (url !== entry.href) {
          // Cambio de calendario: se borra el de antes
          await fetch(entry.href, { method: 'DELETE', headers: { Authorization: basic(acc), 'User-Agent': 'casa-familia/2.2' } });
        }
        reg[uid] = regEntry(dest, url, ev);
        await env.CASA.put('creados', JSON.stringify(reg));
        await setEventType(env, uid, ev.tipo);
        return reply(200, { ok: true });
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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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

async function readJson(request, max = 2048) {
  const raw = await request.text();
  if (raw.length > max) throw Object.assign(new Error('Petición demasiado grande'), { status: 413 });
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

// ---------- iCloud (CalDAV) ----------

/** Cuentas de las variables ICLOUD_<Nombre> = «correo;contraseña-de-aplicación». */
export function accounts(env) {
  return Object.keys(env).filter((k) => /^ICLOUD_[A-Za-z0-9_]{1,40}$/.test(k)).sort().map((k) => {
    const raw = String(env[k]).trim();
    const i = raw.indexOf(';');
    return { clave: k.slice(7).toLowerCase(), nombre: k.slice(7).replace(/_/g, ' '), user: raw.slice(0, i).trim(), pass: raw.slice(i + 1).trim() };
  }).filter((a) => a.user && a.pass);
}

function basic(acc) {
  const bytes = new TextEncoder().encode(`${acc.user}:${acc.pass}`);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'Basic ' + btoa(bin);
}

function httpError(status, message) { return Object.assign(new Error(message), { status }); }

async function dav(acc, url, body, depth, method = 'PROPFIND') {
  const res = await fetch(url, {
    method, body,
    headers: { Authorization: basic(acc), 'Content-Type': 'application/xml; charset=utf-8', Depth: String(depth), 'User-Agent': 'casa-familia/2.1' },
  });
  if (res.status === 401) throw httpError(502, `iCloud no acepta la contraseña de aplicación de «${acc.nombre}»`);
  if (res.status !== 207 && !res.ok) throw httpError(502, `iCloud respondió ${res.status}`);
  return { text: await res.text(), url: res.url || url };
}

const xmlTag = (name) => new RegExp(`<(?:[\\w-]+:)?${name}(?=[\\s/>])[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'i');
const xmlFirst = (xml, name) => (xml.match(xmlTag(name)) || [])[1] || '';
const xmlHas = (xml, name) => new RegExp(`<(?:[\\w-]+:)?${name}(?=[\\s/>])`, 'i').test(xml);
const xmlDecode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&').trim();
const xmlResponses = (xml) => xml.split(/<(?:[\w-]+:)?response(?=[\s>])[^>]*>/i).slice(1).map((r) => r.split(/<\/(?:[\w-]+:)?response>/i)[0]);

/** Calendarios de una cuenta donde se pueden crear eventos. */
export async function discover(acc) {
  const d = 'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"';
  const p1 = await dav(acc, 'https://caldav.icloud.com/', `<?xml version="1.0" encoding="utf-8"?><d:propfind ${d}><d:prop><d:current-user-principal/></d:prop></d:propfind>`, 0);
  const principalHref = xmlDecode(xmlFirst(xmlFirst(p1.text, 'current-user-principal'), 'href'));
  if (!principalHref) throw httpError(502, `iCloud no devolvió la cuenta de «${acc.nombre}»`);
  const p2 = await dav(acc, new URL(principalHref, p1.url).href, `<?xml version="1.0" encoding="utf-8"?><d:propfind ${d}><d:prop><c:calendar-home-set/></d:prop></d:propfind>`, 0);
  const homeHref = xmlDecode(xmlFirst(xmlFirst(p2.text, 'calendar-home-set'), 'href'));
  if (!homeHref) throw httpError(502, `iCloud no devolvió los calendarios de «${acc.nombre}»`);
  const p3 = await dav(acc, new URL(homeHref, p2.url).href,
    `<?xml version="1.0" encoding="utf-8"?><d:propfind ${d}><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><a:calendar-color/><d:current-user-privilege-set/></d:prop></d:propfind>`, 1);
  const out = [];
  for (const r of xmlResponses(p3.text)) {
    if (!xmlHas(xmlFirst(r, 'resourcetype'), 'calendar')) continue;
    const comps = xmlFirst(r, 'supported-calendar-component-set');
    if (comps && !/VEVENT/i.test(comps)) continue;
    const privs = xmlFirst(r, 'current-user-privilege-set');
    if (privs && !['write', 'write-content', 'all'].some((p) => xmlHas(privs, p))) continue;
    const href = new URL(xmlDecode(xmlFirst(r, 'href')), p3.url).href;
    const color = (xmlDecode(xmlFirst(r, 'calendar-color')).match(/#[0-9a-f]{6}/i) || ['#3B6FD8'])[0];
    out.push({ href, nombre: xmlDecode(xmlFirst(r, 'displayname')) || 'Calendario', color });
  }
  return out;
}

async function sha(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Destinos de todas las cuentas, guardados 6 horas en KV. */
async function destinations(env, refresh) {
  if (!refresh) {
    const cached = await env.CASA.get('destinos', 'json');
    if (cached) return cached;
  }
  const list = [];
  for (const acc of accounts(env)) {
    for (const c of await discover(acc)) {
      list.push({ id: await sha(`${acc.clave}|${c.href}`), cuenta: acc.nombre, cuentaClave: acc.clave, nombre: c.nombre, color: c.color, href: c.href });
    }
  }
  await env.CASA.put('destinos', JSON.stringify(list), { expirationTtl: 6 * 3600 });
  return list;
}

async function setEventType(env, uid, tipo) {
  const map = (await env.CASA.get('evtipo', 'json')) || {};
  if (tipo) map[uid] = tipo; else delete map[uid];
  const keys = Object.keys(map);
  if (keys.length > 5000) for (const k of keys.slice(0, keys.length - 5000)) delete map[k];
  await env.CASA.put('evtipo', JSON.stringify(map));
}

/** Comprueba y normaliza los datos del evento que manda la app. */
export function validateEvent(b) {
  const titulo = String(b.titulo ?? '').trim().slice(0, 200);
  if (!titulo) throw httpError(400, 'Falta el título');
  const todoElDia = !!b.todoElDia;
  let inicio, fin;
  if (todoElDia) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.inicio || '') || !/^\d{4}-\d{2}-\d{2}$/.test(b.fin || '')) throw httpError(400, 'Fechas no válidas');
    inicio = b.inicio; fin = b.fin;
    if (fin <= inicio) throw httpError(400, 'El final tiene que ser posterior al inicio');
  } else {
    inicio = new Date(b.inicio); fin = new Date(b.fin);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) throw httpError(400, 'Fechas no válidas');
    if (fin <= inicio) throw httpError(400, 'El final tiene que ser posterior al inicio');
    if (fin.getTime() - inicio.getTime() > 31 * 86400000) throw httpError(400, 'Un evento puede durar como mucho 31 días');
  }
  return {
    titulo, todoElDia, inicio, fin,
    lugar: String(b.lugar ?? '').trim().slice(0, 200),
    notas: String(b.notas ?? '').trim().slice(0, 2000),
    tipo: String(b.tipo ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30),
    tipoNombre: String(b.tipoNombre ?? '').trim().slice(0, 30),
  };
}

const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\;').replace(/,/g, '\\,');
const icsUtc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsDate = (s) => s.replace(/-/g, '');

/** Líneas de 75 bytes como máximo (RFC 5545), sin partir caracteres. */
function fold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '';
  for (const ch of Array.from(line)) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildIcs(uid, ev) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Casa//Panel familiar//ES', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${uid}`, `DTSTAMP:${icsUtc(new Date())}`,
    ev.todoElDia ? `DTSTART;VALUE=DATE:${icsDate(ev.inicio)}` : `DTSTART:${icsUtc(ev.inicio)}`,
    ev.todoElDia ? `DTEND;VALUE=DATE:${icsDate(ev.fin)}` : `DTEND:${icsUtc(ev.fin)}`,
    `SUMMARY:${icsText(ev.titulo)}`,
  ];
  if (ev.lugar) lines.push(`LOCATION:${icsText(ev.lugar)}`);
  if (ev.notas) lines.push(`DESCRIPTION:${icsText(ev.notas)}`);
  if (ev.tipoNombre) lines.push(`CATEGORIES:${icsText(ev.tipoNombre)}`);
  if (ev.tipo) lines.push(`X-CASA-TIPO:${ev.tipo}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// ---------- Registro de los eventos creados desde la app ----------

const eventUrl = (dest, uid) => dest.href.replace(/\/?$/, '/') + encodeURIComponent(uid) + '.ics';

function regEntry(dest, href, ev) {
  const fin = ev.todoElDia ? new Date(`${ev.fin}T00:00:00Z`) : ev.fin;
  return { destino: dest.id, cuenta: dest.cuentaClave, cuentaNombre: dest.cuenta, nombre: dest.nombre, color: dest.color, href, fin: fin.toISOString(), tipo: ev.tipo };
}

async function loadReg(env) {
  return (await env.CASA.get('creados', 'json')) || {};
}

async function markDeleted(env, uids) {
  const b = (await env.CASA.get('borrados', 'json')) || {};
  const now = Date.now();
  for (const u of uids) b[u] = now;
  for (const [u, t] of Object.entries(b)) if (now - t > 2 * 86400000) delete b[u];
  await env.CASA.put('borrados', JSON.stringify(b));
}

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pathOf = (href, base) => { try { return decodeURIComponent(new URL(href, base).pathname); } catch { return href; } };

/**
 * Los eventos creados desde la app, tal como están ahora en iCloud (una consulta «multiget» por calendario).
 * Los que ya no existen (borrados en el iPhone) salen del registro y se devuelven en «borrados»,
 * para que la app los oculte aunque el calendario público tarde unos minutos en enterarse.
 */
async function appEvents(env) {
  const reg = await loadReg(env);
  const now = Date.now();
  let changed = false;
  for (const [uid, e] of Object.entries(reg)) {
    if (now - new Date(e.fin).getTime() > 45 * 86400000) { delete reg[uid]; changed = true; }
  }
  const groups = new Map();
  for (const [uid, e] of Object.entries(reg)) {
    const coll = e.href.slice(0, e.href.lastIndexOf('/') + 1);
    const key = `${e.cuenta}|${coll}`;
    if (!groups.has(key)) groups.set(key, { cuenta: e.cuenta, coll, items: [] });
    groups.get(key).items.push([uid, e]);
  }
  const eventos = [];
  const gone = [];
  for (const g of groups.values()) {
    const acc = accounts(env).find((a) => a.clave === g.cuenta);
    if (!acc) continue;
    let r;
    try {
      const hrefs = g.items.map(([, e]) => `<d:href>${xmlEscape(new URL(e.href).pathname)}</d:href>`).join('');
      r = await dav(acc, g.coll,
        `<?xml version="1.0" encoding="utf-8"?><c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop>${hrefs}</c:calendar-multiget>`,
        1, 'REPORT');
    } catch {
      continue; // iCloud no responde: se quedan como estaban y la app usa el calendario público
    }
    const found = new Map();
    const missing = new Set();
    for (const resp of xmlResponses(r.text)) {
      const p = pathOf(xmlDecode(xmlFirst(resp, 'href')), r.url);
      const data = xmlDecode(xmlFirst(resp, 'calendar-data'));
      if (data && /BEGIN:VEVENT/.test(data)) found.set(p, data);
      else if (/\b404\b/.test(resp)) missing.add(p);
    }
    for (const [uid, e] of g.items) {
      const p = pathOf(e.href);
      if (found.has(p)) {
        eventos.push({ uid, ics: found.get(p), tipo: e.tipo || '', destino: { id: e.destino, nombre: e.nombre, color: e.color, cuenta: e.cuentaNombre } });
      } else if (missing.has(p)) {
        delete reg[uid]; gone.push(uid); changed = true;
      }
    }
  }
  if (changed) await env.CASA.put('creados', JSON.stringify(reg));
  if (gone.length) await markDeleted(env, gone);
  const borrados = Object.keys((await env.CASA.get('borrados', 'json')) || {});
  return { eventos, borrados };
}
