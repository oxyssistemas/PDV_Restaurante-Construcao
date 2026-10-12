// Endereço → coordenadas (OpenStreetMap: Nominatim, e Photon quando o Nominatim não responde) e taxa por km,
// com as mesmas regras da nuvem (_shared/geo.ts e delivery_fee_by_km). Usado no servidor dedicado (loja online).

const cache = new Map();
const UA = { 'User-Agent': 'OxysRestaurante/1.0 (+https://www.oxysrestaurante.app)', 'Accept-Language': 'pt-BR' };
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

function withCity(address, storeAddress) {
  const parts = String(storeAddress ?? '').split(',').map(p => p.trim()).filter(Boolean);
  const city = parts.slice(-2).join(', ');
  if (!city || norm(address).includes(norm(parts[parts.length - 2] ?? parts[parts.length - 1] ?? ''))) return address;
  return `${address}, ${city}`;
}

async function getJson(url) {
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6000) });
    return res.ok ? await res.json() : undefined;
  } catch { return undefined; }
}

async function geocode(address) {
  const q = norm(address).slice(0, 250);
  if (q.length < 6) return null;
  if (cache.has(q)) return cache.get(q);
  let out;
  const n = await getJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(address)}`);
  if (Array.isArray(n) && n[0]) out = { lat: Number(n[0].lat), lng: Number(n[0].lon), label: String(n[0].display_name ?? '').slice(0, 300) };
  if (!out) {
    const p = await getJson(`https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(address)}`);
    const f = p?.features?.[0];
    if (p !== undefined) out = f && f.properties?.countrycode === 'BR' ? { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: f.properties.name ?? null } : null;
  }
  if (out !== undefined) cache.set(q, out);
  return out ?? null;
}

/** road_km: linha reta × 1,3 (ruas). */
function roadKm(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 1.3 * 100) / 100;
}

/** delivery_fee_by_km */
function feeByKm(store, lat, lng) {
  if (store.lat == null || store.lng == null) return { ok: false, error: 'A loja ainda não configurou o endereço para calcular a entrega.' };
  if (lat == null || lng == null) return { ok: false, error: 'Não encontramos esse endereço no mapa. Confira rua, número e cidade.' };
  const km = roadKm({ lat: store.lat, lng: store.lng }, { lat, lng });
  if (store.max_km != null && km > Number(store.max_km)) return { ok: false, km, error: `Endereço fora da área de entrega (${String(km).replace('.', ',')} km).` };
  const fee = Math.round((Number(store.fee_base || 0) + Math.max(km - Number(store.fee_free_km || 0), 0) * Number(store.fee_per_km || 0)) * 100) / 100;
  return { ok: true, km, fee };
}

module.exports = { geocode, withCity, roadKm, feeByKm };
