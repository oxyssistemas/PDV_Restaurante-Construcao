// Endereço → coordenadas pelo OpenStreetMap (Nominatim), com cache no banco (geocode_cache).
// Usado na taxa de entrega por km e no mapa do delivery. Política do Nominatim: identificar o app e não repetir consultas.

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/** Endereço do cliente + cidade da loja (o cliente costuma digitar só rua, número e bairro). */
export function withCity(address: string, storeAddress: string | null | undefined): string {
  const parts = String(storeAddress ?? '').split(',').map(p => p.trim()).filter(Boolean);
  const city = parts.slice(-2).join(', ');
  if (!city || norm(address).includes(norm(parts[parts.length - 2] ?? parts[parts.length - 1] ?? ''))) return address;
  return `${address}, ${city}`;
}

// deno-lint-ignore no-explicit-any
export async function geocode(sb: any, address: string): Promise<{ lat: number; lng: number; label: string | null } | null> {
  const q = norm(address).slice(0, 250);
  if (q.length < 6) return null;
  const { data: hit } = await sb.from('geocode_cache').select('lat, lng, label').eq('query', q).maybeSingle();
  if (hit) return hit.lat == null ? null : { lat: hit.lat, lng: hit.lng, label: hit.label };
  const out = (await nominatim(address)) ?? (await photon(address));
  if (out !== undefined) {
    await sb.from('geocode_cache').upsert({ query: q, lat: out?.lat ?? null, lng: out?.lng ?? null, label: out?.label ?? null });
  }
  return out ?? null;
}

type Hit = { lat: number; lng: number; label: string | null } | null;
const UA = { 'User-Agent': 'OxysRestaurante/1.0 (+https://www.oxysrestaurante.app)', 'Accept-Language': 'pt-BR' };

/** Nominatim; undefined = serviço indisponível (não grava no cache). */
async function nominatim(address: string): Promise<Hit | undefined> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(address)}`,
      { headers: UA, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return undefined;
    const list = await res.json();
    const f = Array.isArray(list) ? list[0] : null;
    return f ? { lat: Number(f.lat), lng: Number(f.lon), label: String(f.display_name ?? '').slice(0, 300) } : undefined;
  } catch { return undefined; }
}

/** Photon (komoot), também com dados do OpenStreetMap: usado quando o Nominatim não responde ao servidor. */
async function photon(address: string): Promise<Hit | undefined> {
  try {
    const res = await fetch(`https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(address)}`, { headers: UA, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return undefined;
    const j = await res.json();
    const f = j?.features?.[0];
    if (!f || f.properties?.countrycode !== 'BR') return null;
    const [lng, lat] = f.geometry.coordinates;
    const p = f.properties;
    return { lat: Number(lat), lng: Number(lng), label: [p.name, p.housenumber, p.district, p.city, p.state].filter(Boolean).join(', ').slice(0, 300) };
  } catch { return undefined; }
}
