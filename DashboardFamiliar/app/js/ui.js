// Utilidades de interfaz: crear nodos, formatos en español, aviso (toast) y hoja (sheet).

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val); // variables CSS
        else el.style[prop] = val;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v; // solo con cadenas propias, nunca con datos externos
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children.flat(Infinity)) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

const TZ = undefined; // la zona horaria del dispositivo
const fmtTime = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const fmtDay = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const fmtShortDay = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', timeZone: TZ });
const fmtWeekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long', timeZone: TZ });
const fmtMonth = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: TZ });

export const time = (d) => fmtTime.format(d);
export const longDay = (d) => fmtDay.format(d);
export const shortDay = (d) => fmtShortDay.format(d).replace('.', '');
export const weekday = (d) => fmtWeekday.format(d);
export const monthYear = (d) => fmtMonth.format(d);
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** Lunes de la semana de [d] */
export function startOfWeek(d) {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // lunes = 0
  return addDays(x, -dow);
}

export function dayLabel(d, now = new Date()) {
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  return cap(weekday(d));
}

/** «en 25 min», «en 2 h 10 min», «mañana a las 9:30» */
export function countdown(target, now = new Date()) {
  const mins = Math.round((target - now) / 60000);
  if (mins <= 0) return 'ahora';
  if (mins < 60) return `en ${mins} min`;
  if (sameDay(target, now)) {
    const hh = Math.floor(mins / 60), mm = mins % 60;
    return mm ? `en ${hh} h ${mm} min` : `en ${hh} h`;
  }
  return `${dayLabel(target, now).toLowerCase()} a las ${time(target)}`;
}

export function euros(v, decimals = 2) {
  return v.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' €';
}
export function eurKwh(v) {
  return v.toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function ago(ms, now = Date.now()) {
  const mins = Math.round((now - ms) / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.round(hrs / 24)} días`;
}

let toastTimer;
export function toast(message, { action, onAction, ms = 4000 } = {}) {
  const el = document.getElementById('toast');
  el.replaceChildren(h('span', {}, message));
  if (action) {
    el.append(h('button', { type: 'button', onclick: () => { el.hidden = true; onAction?.(); } }, action));
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/** Hoja modal sencilla (detalle de una cita, etc.). Se cierra tocando fuera o con Escape. */
export function openSheet(content) {
  const sheet = document.getElementById('sheet');
  const close = () => { sheet.hidden = true; sheet.replaceChildren(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const card = h('div', { class: 'sheet-card', role: 'dialog', 'aria-modal': 'true' },
    content,
    h('button', { type: 'button', class: 'btn sheet-close', onclick: close }, 'Cerrar'));
  sheet.replaceChildren(card);
  sheet.onclick = (e) => { if (e.target === sheet) close(); };
  document.addEventListener('keydown', onKey);
  sheet.hidden = false;
  card.querySelector('button')?.focus();
  return close;
}

/** Línea de estado bajo una sección: copia antigua, error o demostración. */
export function statusNote(res, label) {
  if (!res) return null;
  if (res.demo) return null;
  if (res.error && !res.data) return h('p', { class: 'note note-error' }, `${label}: ${res.error.message}`);
  if (res.stale && res.at) return h('p', { class: 'note' }, `${label}: sin actualizar desde ${ago(res.at)} (${res.error?.message || 'sin conexión'})`);
  return null;
}
