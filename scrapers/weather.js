// Weather via Open-Meteo (free, no API key). Responses are cached.
import { HttpError, fetchT, cached, clamp, param } from '../system/util.js';

const WMO = {
  0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Rime fog', '🌫️'], 51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'], 80: ['Rain showers', '🌦️'], 81: ['Heavy showers', '🌧️'],
  82: ['Violent showers', '⛈️'], 95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm, hail', '⛈️'], 99: ['Severe thunderstorm', '⛈️']
};
const wmo = (c) => { const w = WMO[c] || WMO[Math.floor(c / 10) * 10] || ['Unknown', '❔']; return { text: w[0], icon: w[1] }; };

export const LK_CITIES = [
  ['Colombo', 6.9271, 79.8612], ['Kandy', 7.2906, 80.6337], ['Galle', 6.0535, 80.221], ['Jaffna', 9.6615, 80.0255],
  ['Anuradhapura', 8.3114, 80.4037], ['Trincomalee', 8.5874, 81.2152], ['Batticaloa', 7.7102, 81.6924],
  ['Nuwara Eliya', 6.9497, 80.7891], ['Ratnapura', 6.7056, 80.3847], ['Matara', 5.9549, 80.555],
  ['Negombo', 7.2008, 79.8737], ['Badulla', 6.9934, 81.055]
];
const CUR = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,pressure_msl,is_day';
const shapeCurrent = (c) => ({
  temperatureC: c.temperature_2m, feelsLikeC: c.apparent_temperature, humidity: c.relative_humidity_2m,
  windKmh: c.wind_speed_10m, windDirection: c.wind_direction_10m, pressureHpa: c.pressure_msl,
  rainMm: c.precipitation, cloudCover: c.cloud_cover, isDay: !!c.is_day, condition: wmo(c.weather_code), observedAt: c.time
});

async function geocode(city, country) {
  const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`;
  const d = await cached('geo:' + city.toLowerCase(), 86400 * 7, async () => (await fetchT(u)).json());
  const list = d.results || [];
  const pick = (country && list.find((x) => x.country_code?.toLowerCase() === country.toLowerCase())) || list[0];
  if (!pick) throw new HttpError(404, `City "${city}" was not found.`);
  return pick;
}

async function current(p) {
  let lat = Number(p.lat), lon = Number(p.lon), place;
  if (Number.isFinite(lat) && Number.isFinite(lon) && p.lat !== '' && p.lon !== '') {
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new HttpError(400, 'lat/lon out of range.');
    place = { name: `${lat},${lon}` };
  } else {
    const city = String(p.city || p.q || '').trim();
    if (!city || city.length > 80) throw new HttpError(400, 'city is required (example: Colombo).');
    place = await geocode(city, p.country);
    lat = place.latitude; lon = place.longitude;
  }
  const days = clamp(p.days, 1, 7, 3);
  const key = `wx:${lat.toFixed(2)},${lon.toFixed(2)}:${days}`;
  const d = await cached(key, 600, async () => {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${CUR}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset&timezone=auto&forecast_days=${days}`;
    const r = await fetchT(u);
    if (!r.ok) throw new HttpError(502, 'Weather service error.');
    return r.json();
  });
  return {
    location: { name: place.name, region: place.admin1 || null, country: place.country || null, latitude: lat, longitude: lon, timezone: d.timezone },
    current: shapeCurrent(d.current),
    forecast: d.daily.time.map((t, i) => ({
      date: t, condition: wmo(d.daily.weather_code[i]), maxC: d.daily.temperature_2m_max[i], minC: d.daily.temperature_2m_min[i],
      rainMm: d.daily.precipitation_sum[i], rainChance: d.daily.precipitation_probability_max[i], sunrise: d.daily.sunrise[i], sunset: d.daily.sunset[i]
    }))
  };
}

async function sriLanka() {
  const d = await cached('wx:lk', 600, async () => {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${LK_CITIES.map((c) => c[1]).join(',')}&longitude=${LK_CITIES.map((c) => c[2]).join(',')}&current=${CUR}&timezone=Asia%2FColombo`;
    const r = await fetchT(u);
    if (!r.ok) throw new HttpError(502, 'Weather service error.');
    return r.json();
  });
  const arr = Array.isArray(d) ? d : [d];
  return { country: 'Sri Lanka', cities: arr.map((x, i) => ({ city: LK_CITIES[i][0], ...shapeCurrent(x.current) })) };
}

export default [
  { path: '/api/weather', category: 'Weather', name: 'Weather by city', cost: 0, desc: 'Current weather + forecast for any city', params: [param('city', 'Colombo', 'City name'), param('days', '3', 'Forecast days (1-7)', false), param('country', 'LK', 'Country code to narrow the match', false)], run: current },
  { path: '/api/weather/sri-lanka', category: 'Weather', name: 'Sri Lanka weather', cost: 0, desc: 'Current weather in 12 major Sri Lankan cities', params: [], run: sriLanka }
];
