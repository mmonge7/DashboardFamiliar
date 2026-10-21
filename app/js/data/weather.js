// El tiempo, de Open-Meteo (gratis, sin clave). Se pide directamente desde el dispositivo.
import { publicJson, cached } from '../api.js';
import { getSettings, isDemo } from '../store.js';
import { demoWeather } from '../demo.js';

const MAX_AGE = 20 * 60000;

// Códigos WMO → icono y texto
const CODES = {
  0: ['☀️', '🌙', 'Despejado'],
  1: ['🌤️', '🌙', 'Casi despejado'],
  2: ['⛅', '☁️', 'Algo nuboso'],
  3: ['☁️', '☁️', 'Cubierto'],
  45: ['🌫️', '🌫️', 'Niebla'], 48: ['🌫️', '🌫️', 'Niebla con escarcha'],
  51: ['🌦️', '🌧️', 'Llovizna débil'], 53: ['🌦️', '🌧️', 'Llovizna'], 55: ['🌧️', '🌧️', 'Llovizna intensa'],
  56: ['🌧️', '🌧️', 'Llovizna helada'], 57: ['🌧️', '🌧️', 'Llovizna helada'],
  61: ['🌦️', '🌧️', 'Lluvia débil'], 63: ['🌧️', '🌧️', 'Lluvia'], 65: ['🌧️', '🌧️', 'Lluvia fuerte'],
  66: ['🌧️', '🌧️', 'Lluvia helada'], 67: ['🌧️', '🌧️', 'Lluvia helada'],
  71: ['🌨️', '🌨️', 'Nieve débil'], 73: ['🌨️', '🌨️', 'Nieve'], 75: ['❄️', '❄️', 'Nieve fuerte'], 77: ['🌨️', '🌨️', 'Granizo fino'],
  80: ['🌦️', '🌧️', 'Chubascos'], 81: ['🌧️', '🌧️', 'Chubascos'], 82: ['⛈️', '⛈️', 'Chubascos fuertes'],
  85: ['🌨️', '🌨️', 'Chubascos de nieve'], 86: ['🌨️', '🌨️', 'Chubascos de nieve'],
  95: ['⛈️', '⛈️', 'Tormenta'], 96: ['⛈️', '⛈️', 'Tormenta con granizo'], 99: ['⛈️', '⛈️', 'Tormenta con granizo'],
};

export function describe(code, isDay = true) {
  const c = CODES[code] || ['🌡️', '🌡️', '—'];
  return { icon: isDay ? c[0] : c[1], text: c[2] };
}

export async function loadWeather({ force = false } = {}) {
  const s = getSettings();
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${s.lat}&longitude=${s.lon}&timezone=auto&forecast_days=7`
    + '&current=temperature_2m,weather_code,is_day,relative_humidity_2m,wind_speed_10m'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset';
  const res = await cached(`tiempo:${s.lat},${s.lon}`, MAX_AGE, async () => {
    const j = await publicJson(url);
    return {
      temp: j.current.temperature_2m,
      code: j.current.weather_code,
      isDay: j.current.is_day === 1,
      humidity: j.current.relative_humidity_2m,
      wind: j.current.wind_speed_10m,
      days: j.daily.time.map((t, i) => ({
        date: t,
        code: j.daily.weather_code[i],
        max: j.daily.temperature_2m_max[i],
        min: j.daily.temperature_2m_min[i],
        rain: j.daily.precipitation_probability_max[i],
        sunrise: j.daily.sunrise[i],
        sunset: j.daily.sunset[i],
      })),
    };
  }, { force });
  // Sin red y en modo demostración: un tiempo de ejemplo para que el panel se vea completo
  if (!res.data && isDemo()) return { data: demoWeather(new Date()), demo: true, at: Date.now() };
  return res;
}

/** Busca una ciudad para Ajustes (geocodificación de Open-Meteo). */
export async function searchPlace(q) {
  const j = await publicJson('https://geocoding-api.open-meteo.com/v1/search?count=6&language=es&format=json&name=' + encodeURIComponent(q));
  return (j.results || []).map((r) => ({ name: r.name, region: [r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude }));
}
