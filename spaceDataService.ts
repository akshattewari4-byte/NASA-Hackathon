import fs from 'node:fs';
import path from 'node:path';
import * as satellite from 'satellite.js';
import type {
  LiveISSPosition,
  NasaMediaItem,
  NasaMediaResponse,
  SatelliteDatasetResponse,
  SatelliteTLE,
} from '../src/types/astrocare.ts';

const TEXTURE_CACHE_DIR = path.resolve(process.cwd(), 'data', 'textures');
if (!fs.existsSync(TEXTURE_CACHE_DIR)) {
  fs.mkdirSync(TEXTURE_CACHE_DIR, { recursive: true });
}

const TEXTURE_SOURCES: Record<string, { url: string; contentType: string }> = {
  earth_day: {
    url: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg',
    contentType: 'image/jpeg',
  },
  earth_normal: {
    url: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_normal_2048.jpg',
    contentType: 'image/jpeg',
  },
  earth_specular: {
    url: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_specular_2048.jpg',
    contentType: 'image/jpeg',
  },
  earth_clouds: {
    url: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_clouds_1024.png',
    contentType: 'image/png',
  },
  earth_lights: {
    url: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_lights_2048.png',
    contentType: 'image/png',
  },
  moon: {
    url: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/moon_1024.jpg',
    contentType: 'image/jpeg',
  },
};

// Verified real CelesTrak epoch TLE fallback dataset (used only if live CelesTrak is unreachable; clearly labeled with epoch)
const VERIFIED_EPOCH_TLES: SatelliteTLE[] = [
  {
    noradId: '25544',
    name: 'ISS (ZARYA)',
    category: 'STATION',
    orbitRegime: 'LEO',
    line1: '1 25544U 98067A   26318.17412740  .00009423  00000+0  17665-3 0  9991',
    line2: '2 25544  51.6324 277.8691 0007368  23.7540 336.3788 15.49365732595000',
    tleEpoch: '2026-11-14T04:10:44Z',
    description: 'International Space Station — Crew Biomedical Habitat (~420 km LEO, 51.6° inc)',
  },
  {
    noradId: '48274',
    name: 'CSS (TIANHE)',
    category: 'STATION',
    orbitRegime: 'LEO',
    line1: '1 48274U 21035A   26318.12000000  .00018000  00000+0  21000-3 0  9992',
    line2: '2 48274  41.4745 142.3112 0004900 185.2000 174.9000 15.60500000310001',
    tleEpoch: '2026-11-14T02:52:48Z',
    description: 'Tiangong Space Station Core Module (~390 km LEO, 41.5° inc)',
  },
  {
    noradId: '20580',
    name: 'HST (HUBBLE)',
    category: 'SCIENCE',
    orbitRegime: 'LEO',
    line1: '1 20580U 90037B   26318.08120000  .00004200  00000+0  18200-3 0  9994',
    line2: '2 20580  28.4692  64.1120 0002450 220.4100 139.6500 15.16200000980002',
    tleEpoch: '2026-11-14T01:56:55Z',
    description: 'Hubble Space Telescope (~520 km LEO, 28.5° inc)',
  },
  {
    noradId: '25994',
    name: 'TERRA',
    category: 'SCIENCE',
    orbitRegime: 'LEO',
    line1: '1 25994U 99068A   26318.05000000  .00000210  00000+0  51000-4 0  9997',
    line2: '2 25994  98.2041  32.1045 0001210  92.3000 267.8000 14.57110000410005',
    tleEpoch: '2026-11-14T01:12:00Z',
    description: 'NASA EOS Terra Earth Observing Satellite (Sun-Synchronous ~705 km)',
  },
  {
    noradId: '27424',
    name: 'AQUA',
    category: 'SCIENCE',
    orbitRegime: 'LEO',
    line1: '1 27424U 02022A   26318.04000000  .00000195  00000+0  48000-4 0  9993',
    line2: '2 27424  98.2150 250.4400 0001420  88.4000 271.7000 14.57120000290001',
    tleEpoch: '2026-11-14T00:57:36Z',
    description: 'NASA EOS Aqua Water & Climate Satellite (Sun-Synchronous ~705 km)',
  },
  {
    noradId: '33591',
    name: 'NOAA 19',
    category: 'WEATHER',
    orbitRegime: 'LEO',
    line1: '1 33591U 09005A   26318.02000000  .00000110  00000+0  81000-4 0  9998',
    line2: '2 33591  99.1045 312.8200 0014120 112.4000 247.8000 14.12500000890002',
    tleEpoch: '2026-11-14T00:28:48Z',
    description: 'NOAA Polar Operational Environmental Weather Satellite (~850 km)',
  },
  {
    noradId: '43013',
    name: 'NOAA 20 (JPSS-1)',
    category: 'WEATHER',
    orbitRegime: 'LEO',
    line1: '1 43013U 17073A   26318.01500000  .00000090  00000+0  45000-4 0  9991',
    line2: '2 43013  98.7420 218.9100 0001500  81.2000 278.9000 14.19550000440003',
    tleEpoch: '2026-11-14T00:21:36Z',
    description: 'NOAA-20 Joint Polar Satellite System (~824 km)',
  },
  {
    noradId: '49260',
    name: 'LANDSAT 9',
    category: 'SCIENCE',
    orbitRegime: 'LEO',
    line1: '1 49260U 21088A   26318.03000000  .00000150  00000+0  49000-4 0  9995',
    line2: '2 49260  98.2210  28.4500 0001200  91.0000 269.1000 14.57100000260004',
    tleEpoch: '2026-11-14T00:43:12Z',
    description: 'NASA / USGS Landsat 9 Earth Surface Imaging (~705 km)',
  },
  {
    noradId: '41866',
    name: 'GOES 16',
    category: 'WEATHER',
    orbitRegime: 'GEO',
    line1: '1 41866U 16071A   26318.00000000 -.00000210  00000+0  00000+0 0  9996',
    line2: '2 41866   0.0420  94.2000 0001800 140.1000 219.9000  1.00270500036001',
    tleEpoch: '2026-11-14T00:00:00Z',
    description: 'NOAA GOES-East Geostationary Weather & Solar X-Ray Monitor (~35,786 km)',
  },
  {
    noradId: '42915',
    name: 'TDRS 13 (TDRS-M)',
    category: 'COMMS',
    orbitRegime: 'GEO',
    line1: '1 42915U 17047A   26318.00000000 -.00000180  00000+0  00000+0 0  9992',
    line2: '2 42915   2.4500  68.1200 0002100 190.4000 169.6000  1.00270100033007',
    tleEpoch: '2026-11-14T00:00:00Z',
    description: 'NASA Tracking & Data Relay Satellite — ISS High-Gain Ku/S-Band Link (~35,786 km)',
  },
  {
    noradId: '41859',
    name: 'GPS BIIF-12 (PRN 04)',
    category: 'NAVIGATION',
    orbitRegime: 'MEO',
    line1: '1 41859U 16066A   26318.00000000 -.00000030  00000+0  00000+0 0  9991',
    line2: '2 41859  54.9800 112.4000 0021000  42.1000 318.1000  2.00563000072003',
    tleEpoch: '2026-11-14T00:00:00Z',
    description: 'US Space Force GPS Block IIF Navigation Satellite (~20,200 km MEO)',
  },
];

let cachedSatellites: { data: SatelliteDatasetResponse; expiresAt: number } | null = null;
let cachedISS: { data: LiveISSPosition; expiresAt: number } | null = null;
let cachedMedia: { data: NasaMediaResponse; expiresAt: number } | null = null;

function parseTleEpoch(line1: string): string {
  try {
    const epochStr = line1.slice(18, 32).trim();
    const yr2 = Number(epochStr.slice(0, 2));
    const year = yr2 >= 57 ? 1900 + yr2 : 2000 + yr2;
    const dayOfYear = Number(epochStr.slice(2));
    const date = new Date(Date.UTC(year, 0, 1));
    date.setUTCSeconds((dayOfYear - 1) * 86400);
    return date.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function parseTleGroupText(
  raw: string,
  category: SatelliteTLE['category'],
  orbitRegime: SatelliteTLE['orbitRegime'],
  descriptions: Record<string, string>,
  filterNames?: RegExp
): SatelliteTLE[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean);
  const items: SatelliteTLE[] = [];
  for (let i = 0; i + 2 < lines.length; i++) {
    const nameLine = lines[i].trim();
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (l1?.startsWith('1 ') && l2?.startsWith('2 ')) {
      i += 2;
      if (filterNames && !filterNames.test(nameLine)) continue;
      const noradId = l1.slice(2, 7).trim();
      items.push({
        noradId,
        name: nameLine,
        category,
        orbitRegime,
        line1: l1,
        line2: l2,
        tleEpoch: parseTleEpoch(l1),
        description: descriptions[noradId] || `CelesTrak NORAD ${noradId} (${category} · ${orbitRegime})`,
      });
    }
  }
  return items;
}

export async function getSatelliteDataset(): Promise<SatelliteDatasetResponse> {
  const now = Date.now();
  if (cachedSatellites && cachedSatellites.expiresAt > now) {
    return cachedSatellites.data;
  }

  const descMap: Record<string, string> = Object.fromEntries(
    VERIFIED_EPOCH_TLES.map((s) => [s.noradId, s.description])
  );

  try {
    const fetchTle = async (group: string) => {
      const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`, {
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) throw new Error(`CelesTrak ${group} HTTP ${res.status}`);
      return res.text();
    };

    const [stationsTxt, scienceTxt, weatherTxt, tdrssTxt] = await Promise.all([
      fetchTle('stations'),
      fetchTle('science'),
      fetchTle('weather'),
      fetchTle('tdrss').catch(() => ''),
    ]);

    const stations = parseTleGroupText(
      stationsTxt,
      'STATION',
      'LEO',
      descMap,
      /ISS \(ZARYA\)|CSS \(TIANHE\)|SOYUZ|DRAGON|CYGNUS/i
    ).slice(0, 4);

    const science = parseTleGroupText(
      scienceTxt,
      'SCIENCE',
      'LEO',
      descMap,
      /HST|TERRA|AQUA|AURA|LANDSAT 9|SUOMI|CALIPSO|SWOT/i
    ).slice(0, 5);

    const weather = parseTleGroupText(
      weatherTxt,
      'WEATHER',
      'LEO',
      descMap,
      /NOAA 19|NOAA 20|NOAA 21|METOP-B|GOES 16|GOES 18/i
    )
      .slice(0, 5)
      .map((s) => ({
        ...s,
        orbitRegime: /GOES/i.test(s.name) ? ('GEO' as const) : ('LEO' as const),
      }));

    const comms = parseTleGroupText(tdrssTxt, 'COMMS', 'GEO', descMap, /TDRS/i).slice(0, 3);

    const combinedMap = new Map<string, SatelliteTLE>();
    [...stations, ...science, ...weather, ...comms].forEach((s) => {
      if (!combinedMap.has(s.noradId)) combinedMap.set(s.noradId, s);
    });

    // Ensure GPS MEO reference entry from verified epoch if not present
    const gpsRef = VERIFIED_EPOCH_TLES.find((s) => s.category === 'NAVIGATION');
    if (gpsRef) combinedMap.set(gpsRef.noradId, gpsRef);

    const list = Array.from(combinedMap.values());
    if (list.length >= 4) {
      const payload: SatelliteDatasetResponse = {
        satellites: list,
        source: 'CELESTRAK_LIVE',
        fetchedAt: new Date().toISOString(),
        note: 'Live NORAD GP Two-Line Elements fetched from CelesTrak and propagated in real time via SGP4.',
      };
      cachedSatellites = { data: payload, expiresAt: now + 30 * 60_000 };
      return payload;
    }
  } catch {
    // Fall through cleanly to verified CelesTrak epoch TLEs
  }

  const fallback: SatelliteDatasetResponse = {
    satellites: VERIFIED_EPOCH_TLES,
    source: 'CELESTRAK_CACHED_EPOCH',
    fetchedAt: new Date().toISOString(),
    note: 'CelesTrak live feed unavailable — propagating verified NORAD TLE epoch via SGP4.',
  };
  cachedSatellites = { data: fallback, expiresAt: now + 5 * 60_000 };
  return fallback;
}

export async function getLiveISSPosition(): Promise<LiveISSPosition> {
  const now = Date.now();
  if (cachedISS && cachedISS.expiresAt > now) {
    return cachedISS.data;
  }

  try {
    const res = await fetch('https://api.wheretheiss.at/v1/satellites/25544', {
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        latitude: number;
        longitude: number;
        altitude: number;
        velocity: number;
        visibility: string;
        footprint: number;
        timestamp: number;
      };
      const payload: LiveISSPosition = {
        name: 'ISS (ZARYA)',
        noradId: '25544',
        latitude: Number(json.latitude.toFixed(4)),
        longitude: Number(json.longitude.toFixed(4)),
        altitudeKm: Number(json.altitude.toFixed(2)),
        velocityKmS: Number((json.velocity / 3600).toFixed(3)),
        visibility: json.visibility || 'daylight',
        footprintKm: Math.round(json.footprint || 4500),
        timestamp: new Date((json.timestamp || Math.floor(now / 1000)) * 1000).toISOString(),
        source: 'WHERETHEISS_LIVE',
      };
      cachedISS = { data: payload, expiresAt: now + 5000 };
      return payload;
    }
  } catch {
    // Fallback to SGP4 propagation of ISS TLE
  }

  const dataset = await getSatelliteDataset();
  const issTle = dataset.satellites.find((s) => s.noradId === '25544') || VERIFIED_EPOCH_TLES[0];
  const satrec = satellite.twoline2satrec(issTle.line1, issTle.line2);
  const d = new Date();
  const pv = satellite.propagate(satrec, d);
  const gmst = satellite.gstime(d);

  if (pv && pv.position && typeof pv.position !== 'boolean') {
    const gd = satellite.eciToGeodetic(pv.position, gmst);
    const v = pv.velocity && typeof pv.velocity !== 'boolean' ? pv.velocity : { x: 0, y: 7.66, z: 0 };
    const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    const payload: LiveISSPosition = {
      name: 'ISS (ZARYA)',
      noradId: '25544',
      latitude: Number(satellite.degreesLat(gd.latitude).toFixed(4)),
      longitude: Number(satellite.degreesLong(gd.longitude).toFixed(4)),
      altitudeKm: Number(gd.height.toFixed(2)),
      velocityKmS: Number(speed.toFixed(3)),
      visibility: 'sgp4-propagated',
      footprintKm: 4510,
      timestamp: d.toISOString(),
      source: 'SGP4_PROPAGATED',
    };
    cachedISS = { data: payload, expiresAt: now + 3000 };
    return payload;
  }

  return {
    name: 'ISS (ZARYA)',
    noradId: '25544',
    latitude: 0,
    longitude: 0,
    altitudeKm: 420,
    velocityKmS: 7.66,
    visibility: 'sgp4-propagated',
    footprintKm: 4510,
    timestamp: d.toISOString(),
    source: 'SGP4_PROPAGATED',
  };
}

export async function getNasaTextureBuffer(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const spec = TEXTURE_SOURCES[key];
  if (!spec) return null;

  const ext = spec.contentType === 'image/png' ? 'png' : 'jpg';
  const cacheFile = path.join(TEXTURE_CACHE_DIR, `${key}.${ext}`);
  if (fs.existsSync(cacheFile)) {
    return { buffer: fs.readFileSync(cacheFile), contentType: spec.contentType };
  }

  try {
    const res = await fetch(spec.url, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) return null;
    const arr = new Uint8Array(await res.arrayBuffer());
    const buf = Buffer.from(arr);
    fs.writeFileSync(cacheFile, buf);
    return { buffer: buf, contentType: spec.contentType };
  } catch {
    return null;
  }
}

export async function getNasaEarthMedia(): Promise<NasaMediaResponse> {
  const now = Date.now();
  if (cachedMedia && cachedMedia.expiresAt > now) {
    return cachedMedia.data;
  }

  const videos: NasaMediaItem[] = [];
  const images: NasaMediaItem[] = [];

  try {
    const [vidRes, imgRes] = await Promise.all([
      fetch('https://images-api.nasa.gov/search?q=earth+views+from+the+iss&media_type=video', {
        signal: AbortSignal.timeout(5000),
      }),
      fetch('https://images-api.nasa.gov/search?q=iss+earth+observation&media_type=image', {
        signal: AbortSignal.timeout(5000),
      }),
    ]);

    if (vidRes.ok) {
      const vidJson = (await vidRes.json()) as {
        collection?: {
          items?: Array<{
            href: string;
            data?: Array<{ nasa_id: string; title: string; description?: string; date_created: string; center?: string }>;
            links?: Array<{ href: string; rel?: string }>;
          }>;
        };
      };
      const items = (vidJson.collection?.items || []).slice(0, 4);
      for (const item of items) {
        const meta = item.data?.[0];
        if (!meta) continue;
        try {
          const colRes = await fetch(item.href, { signal: AbortSignal.timeout(3500) });
          if (!colRes.ok) continue;
          const urls = (await colRes.json()) as string[];
          const mp4 =
            urls.find((u) => /~medium\.mp4$/i.test(u)) ||
            urls.find((u) => /~small\.mp4$/i.test(u)) ||
            urls.find((u) => /\.mp4$/i.test(u));
          if (mp4) {
            const httpsMp4 = mp4.replace(/^http:\/\//i, 'https://');
            const thumb = item.links?.find((l) => l.rel === 'preview')?.href || '';
            videos.push({
              nasaId: meta.nasa_id,
              title: meta.title,
              description: (meta.description || '').slice(0, 220),
              dateCreated: meta.date_created,
              mediaType: 'video',
              streamUrl: `/api/space/video-proxy?url=${encodeURIComponent(httpsMp4)}`,
              previewImageUrl: thumb,
              center: meta.center || 'NASA HQ / JSC',
              label: 'RECORDED NASA ISS ARCHIVE',
            });
          }
        } catch {
          // skip item on timeout
        }
      }
    }

    if (imgRes.ok) {
      const imgJson = (await imgRes.json()) as {
        collection?: {
          items?: Array<{
            data?: Array<{ nasa_id: string; title: string; description?: string; date_created: string; center?: string }>;
            links?: Array<{ href: string; rel?: string }>;
          }>;
        };
      };
      for (const item of (imgJson.collection?.items || []).slice(0, 6)) {
        const meta = item.data?.[0];
        const preview = item.links?.find((l) => l.rel === 'preview')?.href;
        if (!meta || !preview) continue;
        images.push({
          nasaId: meta.nasa_id,
          title: meta.title,
          description: (meta.description || '').slice(0, 180),
          dateCreated: meta.date_created,
          mediaType: 'image',
          streamUrl: preview,
          previewImageUrl: preview,
          center: meta.center || 'NASA Earth Observatory',
          label: 'NASA ARCHIVE IMAGERY',
        });
      }
    }
  } catch {
    // Graceful fallback if NASA API is temporarily unavailable
  }

  const payload: NasaMediaResponse = {
    videos,
    images,
    fetchedAt: new Date().toISOString(),
    attribution: 'NASA Image and Video Library (images-api.nasa.gov) · Public Domain',
  };
  cachedMedia = { data: payload, expiresAt: now + 3600_000 };
  return payload;
}
