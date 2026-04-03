export interface Coordenada {
  latitude: number;
  longitude: number;
}

export interface PasoRuta {
  instruccion: string;
  distancia: number; // metros
  coordenada: Coordenada;
}

export interface Ruta {
  coordenadas: Coordenada[];
  pasos: PasoRuta[];
  distanciaTotal: number; // metros
  duracionTotal: number;  // segundos
}

// Geocoding con Nominatim (OpenStreetMap, gratis)
export async function buscarDireccion(query: string): Promise<{ nombre: string; coordenada: Coordenada }[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'es', 'User-Agent': 'GPSTerceraEdad/1.0' },
  });
  const data = await res.json();
  return data.map((item: any) => ({
    nombre: item.display_name,
    coordenada: { latitude: parseFloat(item.lat), longitude: parseFloat(item.lon) },
  }));
}

// Routing con OSRM (gratis, sin key)
export async function calcularRuta(origen: Coordenada, destino: Coordenada): Promise<Ruta> {
  const url = `https://router.project-osrm.org/route/v1/driving/${origen.longitude},${origen.latitude};${destino.longitude},${destino.latitude}?overview=full&geometries=geojson&steps=true&annotations=false`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('No se pudo calcular la ruta');
  }

  const ruta = data.routes[0];
  const coordenadas: Coordenada[] = ruta.geometry.coordinates.map(([lng, lat]: number[]) => ({
    latitude: lat,
    longitude: lng,
  }));

  const pasos: PasoRuta[] = [];
  for (const leg of ruta.legs) {
    for (const step of leg.steps) {
      const instruccion = traducirInstruccion(step.maneuver.type, step.maneuver.modifier, step.name);
      pasos.push({
        instruccion,
        distancia: step.distance,
        coordenada: {
          latitude: step.maneuver.location[1],
          longitude: step.maneuver.location[0],
        },
      });
    }
  }

  return {
    coordenadas,
    pasos,
    distanciaTotal: ruta.distance,
    duracionTotal: ruta.duration,
  };
}

function traducirInstruccion(tipo: string, modificador: string, calle: string): string {
  const calleTexto = calle ? ` por ${calle}` : '';
  const mods: Record<string, string> = {
    left: 'a la izquierda',
    right: 'a la derecha',
    'slight left': 'levemente a la izquierda',
    'slight right': 'levemente a la derecha',
    'sharp left': 'muy a la izquierda',
    'sharp right': 'muy a la derecha',
    straight: 'recto',
    uturn: 'dé vuelta U',
  };
  const tipos: Record<string, string> = {
    turn: `Girá ${mods[modificador] || modificador}${calleTexto}`,
    depart: `Salí${calleTexto}`,
    arrive: 'Llegaste a tu destino',
    merge: `Incorporáte${calleTexto}`,
    'on ramp': `Tomá la rampa${calleTexto}`,
    'off ramp': `Salí por la rampa${calleTexto}`,
    fork: `En la bifurcación, andá ${mods[modificador] || 'recto'}${calleTexto}`,
    roundabout: `Entrá en la rotonda${calleTexto}`,
    rotary: `Entrá en la rotonda${calleTexto}`,
    continue: `Seguí recto${calleTexto}`,
    'new name': `Continuá${calleTexto}`,
    notification: `Continuá${calleTexto}`,
  };
  return tipos[tipo] || `Continuá${calleTexto}`;
}

export function formatDistancia(metros: number): string {
  if (metros >= 1000) return `${(metros / 1000).toFixed(1)} km`;
  return `${Math.round(metros)} m`;
}

export function formatDuracion(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function distanciaEntre(a: Coordenada, b: Coordenada): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.latitude * Math.PI) / 180) *
    Math.cos((b.latitude * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
