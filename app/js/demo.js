// Datos de ejemplo: se usan mientras no haya servidor configurado (o con el modo demostración en Ajustes).
// Todo es inventado y se genera respecto a la fecha de hoy para que el panel siempre parezca vivo.
import { addDays, startOfDay, startOfWeek } from './ui.js';

const CALS = [
  { clave: 'familia', nombre: 'Familia', color: '#3B6FD8', papel: 'events' },
  { clave: 'trabajo', nombre: 'Trabajo', color: '#7A5AC8', papel: 'events' },
  { clave: 'cole', nombre: 'Cole', color: '#2E8B6A', papel: 'menu' },
  { clave: 'deporte', nombre: 'Deporte', color: '#D98A1E', papel: 'events' },
];
const cal = (k) => CALS.find((c) => c.clave === k);

const MENUS = [
  'Lentejas con verduras, merluza al horno',
  'Macarrones con tomate, pollo asado',
  'Crema de calabacín, albóndigas',
  'Arroz a la cubana, tortilla de patata',
  'Sopa de cocido, pescado rebozado',
];

function at(day, hh, mm = 0) {
  const d = new Date(day);
  d.setHours(hh, mm, 0, 0);
  return d;
}

export function demoCalendar(now) {
  const events = [];
  const add = (k, title, start, end, extra = {}) => events.push({
    id: `${k}:${title}:${start.toISOString()}`, title, start, end, allDay: !!extra.allDay,
    location: extra.location || '', description: extra.description || '', cal: cal(k),
  });
  const week0 = addDays(startOfWeek(now), -7);
  for (let w = 0; w < 6; w++) {
    const mon = addDays(week0, w * 7);
    for (let d = 0; d < 5; d++) {
      const day = addDays(mon, d);
      add('cole', `Comedor: ${MENUS[(d + w) % MENUS.length]}`, day, addDays(day, 1), { allDay: true });
    }
    for (const d of [0, 2]) add('deporte', 'Natación de Lucía', at(addDays(mon, d), 17, 30), at(addDays(mon, d), 18, 30), { location: 'Piscina municipal' });
    for (const d of [1, 3]) add('deporte', 'Entrenamiento de Pablo', at(addDays(mon, d), 18), at(addDays(mon, d), 19, 30), { location: 'Campo de fútbol' });
    add('trabajo', 'Taller con cliente', at(addDays(mon, 1), 9, 30), at(addDays(mon, 1), 11), { description: 'Revisión del plan de transformación' });
    add('trabajo', 'Comité de seguimiento', at(addDays(mon, 3), 15), at(addDays(mon, 3), 16));
    add('deporte', 'Partido de Pablo', at(addDays(mon, 5), 10), at(addDays(mon, 5), 11, 30), { location: 'Polideportivo, campo 2', description: 'Llegar 30 minutos antes para calentar' });
    add('familia', 'Comida con los abuelos', at(addDays(mon, 6), 13, 30), at(addDays(mon, 6), 16, 30));
    if (w === 1) add('familia', 'Cena con amigos', at(addDays(mon, 4), 21), at(addDays(mon, 4), 23, 30), { location: 'Restaurante del centro' });
    if (w === 2) add('cole', 'Excursión del cole', addDays(mon, 2), addDays(mon, 3), { allDay: true, description: 'Llevar comida y gorra' });
  }
  // Algo próximo hoy para que «Lo próximo» tenga contenido
  const soon = new Date(now); soon.setMinutes(0, 0, 0); soon.setHours(soon.getHours() + 2);
  const soonDay = soon.getHours() >= 7 && soon.getHours() <= 21 ? soon : at(addDays(startOfDay(now), 1), 10);
  add('familia', 'Dentista de Lucía', soonDay, new Date(+soonDay + 45 * 60000), { location: 'Clínica dental, 2.º piso' });
  events.sort((a, b) => a.start - b.start || b.allDay - a.allDay);
  return { calendars: CALS, events, errors: [] };
}

/** Curva típica del PVPC (2.0TD): barato de madrugada, caro de 10 a 14 y de 18 a 22 entre semana. */
export function demoPrices(now) {
  const out = [];
  const today = startOfDay(now);
  const days = now.getHours() >= 20 ? 2 : 1; // mañana se publica sobre las 20:30
  for (let d = 0; d < days; d++) {
    const day = addDays(today, d);
    const weekend = [0, 6].includes(day.getDay());
    for (let hh = 0; hh < 24; hh++) {
      let base;
      if (weekend) base = hh >= 12 && hh <= 16 ? 0.075 : hh >= 19 && hh <= 22 ? 0.13 : 0.1;
      else if (hh < 8) base = 0.095;
      else if (hh < 10 || (hh >= 14 && hh < 18) || hh >= 22) base = 0.15;
      else base = hh >= 18 ? 0.235 : 0.2;
      if (!weekend && hh >= 13 && hh <= 16) base -= 0.03; // valle solar
      const noise = Math.sin((day.getDate() * 24 + hh) * 1.7) * 0.012;
      out.push({ at: at(day, hh), eur: Math.max(0.04, base + noise) });
    }
  }
  return out;
}

export function demoWeather(now) {
  const codes = [1, 2, 3, 61, 80, 1, 0];
  return {
    temp: 18.4, code: 2, isDay: now.getHours() >= 8 && now.getHours() < 19, humidity: 58, wind: 12,
    days: codes.map((code, i) => {
      const d = addDays(startOfDay(now), i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { date: iso, code, max: 21 - (i % 3), min: 10 + (i % 2), rain: [5, 10, 25, 70, 55, 10, 0][i], sunrise: `${iso}T08:24`, sunset: `${iso}T19:04` };
    }),
  };
}

export function demoShopping() {
  const tomorrow = addDays(startOfDay(new Date()), 1);
  const iso = tomorrow.toISOString().slice(0, 10);
  return {
    listas: [
      { nombre: 'Lista de la compra', color: '#2E7D5B', items: ['Leche semidesnatada', 'Plátanos', 'Pan de molde', 'Tomate triturado', 'Yogures naturales', 'Aceite de oliva', 'Detergente'].map((p) => ({ producto: p, detalle: p === 'Plátanos' ? 'de Canarias' : '', vence: '' })) },
      { nombre: 'Tareas de casa', color: '#3B6FD8', items: [
        { producto: 'Llamar al técnico de la caldera', detalle: '', vence: iso },
        { producto: 'Revisar el seguro del coche', detalle: 'Vence en noviembre', vence: '' },
        { producto: 'Cambiar el filtro de la campana', detalle: '', vence: '' },
      ] },
    ],
    frecuentes: [{ producto: 'Huevos', veces: 9 }, { producto: 'Café', veces: 7 }, { producto: 'Papel de cocina', veces: 5 }],
    actualizado: new Date().toISOString(),
  };
}
