/**
 * Sincroniza resultados del Mundial 2026 desde API-Football hacia Firestore.
 * Requiere API_FOOTBALL_KEY en .env (gratis en https://www.api-football.com/)
 */
const path = require('path');
const fs = require('fs');

const FINISHED = new Set(['FT', 'AET', 'PEN']);

/** Nombres locales (es) → variantes API-Football (en) */
const EQUIPOS_API = {
  México: ['Mexico'],
  Sudáfrica: ['South Africa'],
  'Corea del Sur': ['Korea Republic', 'South Korea'],
  'República Checa': ['Czechia', 'Czech Republic'],
  Canadá: ['Canada'],
  'Bosnia y Herzegovina': ['Bosnia and Herzegovina'],
  'Estados Unidos': ['USA', 'United States'],
  Paraguay: ['Paraguay'],
  Haití: ['Haiti'],
  Escocia: ['Scotland'],
  Australia: ['Australia'],
  Turquía: ['Turkey', 'Turkiye', 'Türkiye'],
  Brasil: ['Brazil'],
  Marruecos: ['Morocco'],
  Qatar: ['Qatar'],
  Suiza: ['Switzerland'],
  'Costa de Marfil': ['Ivory Coast', "Cote d'Ivoire", 'Côte d\'Ivoire'],
  Ecuador: ['Ecuador'],
  Alemania: ['Germany'],
  Curazao: ['Curacao', 'Curaçao'],
  'Países Bajos': ['Netherlands'],
  Japón: ['Japan'],
  Suecia: ['Sweden'],
  Túnez: ['Tunisia'],
  'Arabia Saudita': ['Saudi Arabia'],
  Uruguay: ['Uruguay'],
  España: ['Spain'],
  'Cabo Verde': ['Cape Verde'],
  Irán: ['Iran', 'IR Iran'],
  'Nueva Zelanda': ['New Zealand'],
  Bélgica: ['Belgium'],
  Egipto: ['Egypt'],
  Francia: ['France'],
  Senegal: ['Senegal'],
  Irak: ['Iraq'],
  Noruega: ['Norway'],
  Argentina: ['Argentina'],
  Argelia: ['Algeria'],
  Austria: ['Austria'],
  Jordania: ['Jordan'],
  Ghana: ['Ghana'],
  Panamá: ['Panama'],
  Inglaterra: ['England'],
  Croacia: ['Croatia'],
  Portugal: ['Portugal'],
  'RD Congo': ['DR Congo', 'Congo DR', 'Congo DR Congo'],
  Uzbekistán: ['Uzbekistan'],
  Colombia: ['Colombia'],
};

function normNombre(n) {
  return String(n || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

function nombresCoinciden(localA, localB) {
  const a = normNombre(localA);
  const b = normNombre(localB);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  for (const [es, aliases] of Object.entries(EQUIPOS_API)) {
    const variants = [es, ...aliases].map(normNombre);
    const inA = variants.some((v) => a === v || a.includes(v) || v.includes(a));
    const inB = variants.some((v) => b === v || b.includes(v) || v.includes(b));
    if (inA && inB) return true;
  }
  return false;
}

function equiposCoinciden(homeLocal, awayLocal, homeApi, awayApi) {
  return (
    (nombresCoinciden(homeLocal, homeApi) && nombresCoinciden(awayLocal, awayApi)) ||
    (nombresCoinciden(homeLocal, awayApi) && nombresCoinciden(awayLocal, homeApi))
  );
}

function cargarFixture() {
  const jsonPath = path.join(__dirname, '..', 'data', 'fixture-mundial-2026.json');
  if (!fs.existsSync(jsonPath)) {
    console.warn('[mundial-sync] Falta data/fixture-mundial-2026.json — corré: npm run fixture:export');
    return [];
  }
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

function extraerGoles(apiFixture) {
  const status = apiFixture.fixture?.status?.short;
  if (!FINISHED.has(status)) return null;

  const home = apiFixture.goals?.home;
  const away = apiFixture.goals?.away;
  if (home == null || away == null) return null;

  return { home: Number(home), away: Number(away), status };
}

function emparejarPartido(partidoLocal, apiFixtures) {
  const inicioLocal = new Date(partidoLocal.inicioUtc).getTime();
  if (!Number.isFinite(inicioLocal)) return null;

  let mejor = null;
  let mejorDiff = Infinity;

  for (const fx of apiFixtures) {
    const homeApi = fx.teams?.home?.name;
    const awayApi = fx.teams?.away?.name;
    if (!equiposCoinciden(partidoLocal.local, partidoLocal.visitante, homeApi, awayApi)) continue;

    const inicioApi = new Date(fx.fixture?.date).getTime();
    const diff = Math.abs(inicioApi - inicioLocal);
    if (diff < mejorDiff && diff <= 3 * 60 * 60 * 1000) {
      mejorDiff = diff;
      mejor = fx;
    }
  }

  return mejor;
}

async function fetchApiFixtures(apiKey) {
  const league = process.env.API_FOOTBALL_LEAGUE || '1';
  const season = process.env.API_FOOTBALL_SEASON || '2026';
  const url = `https://v3.football.api-sports.io/fixtures?league=${league}&season=${season}`;

  const res = await fetch(url, {
    headers: { 'x-apisports-key': apiKey },
  });

  if (!res.ok) {
    throw new Error(`API-Football HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.errors && Object.keys(data.errors).length) {
    throw new Error(`API-Football: ${JSON.stringify(data.errors)}`);
  }

  return data.response ?? [];
}

async function seedFirestore(db, fixture) {
  if (!fixture.length) return { seeded: 0 };

  const col = db.collection('mundial_partidos');
  const snap = await col.limit(1).get();
  if (!snap.empty) return { seeded: 0, skipped: true };

  const batch = db.batch();
  for (const p of fixture) {
    batch.set(col.doc(p.id), {
      fase: p.fase,
      local: p.local,
      visitante: p.visitante,
      fecha: p.fecha,
      inicioUtc: p.inicioUtc,
      sede: p.sede,
      orden: p.orden,
      cerrado: false,
      cerradoManual: false,
      resultadoLocal: null,
      resultadoVisitante: null,
    });
  }
  await batch.commit();
  console.log(`[mundial-sync] Seed: ${fixture.length} partidos en Firestore`);
  return { seeded: fixture.length };
}

async function sincronizarResultados(db, apiKey) {
  const fixture = cargarFixture();
  const apiFixtures = await fetchApiFixtures(apiKey);

  const col = db.collection('mundial_partidos');
  const snap = await col.get();
  const partidosDb = snap.empty
    ? fixture
    : snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const ahora = Date.now();
  let actualizados = 0;
  let batch = db.batch();
  let ops = 0;

  for (const partido of partidosDb) {
    const ref = col.doc(partido.id);
    const inicio = new Date(partido.inicioUtc || 0).getTime();
    const yaEmpezo = Number.isFinite(inicio) && ahora >= inicio;

    const apiMatch = emparejarPartido(partido, apiFixtures);
    const goles = apiMatch ? extraerGoles(apiMatch) : null;

    const update = {
      ultimaSync: new Date(),
    };

    if (apiMatch?.fixture?.id) {
      update.apiFixtureId = apiMatch.fixture.id;
    }

    if (goles) {
      const localEsHome = nombresCoinciden(partido.local, apiMatch.teams.home.name);
      update.resultadoLocal = localEsHome ? goles.home : goles.away;
      update.resultadoVisitante = localEsHome ? goles.away : goles.home;
      update.cerrado = true;
      update.estadoPartido = goles.status;
    } else if (yaEmpezo) {
      update.cerrado = true;
    }

    batch.set(ref, update, { merge: true });
    ops += 1;
    actualizados += 1;

    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();

  return {
    actualizados,
    apiPartidos: apiFixtures.length,
    timestamp: new Date().toISOString(),
  };
}

let ultimoSync = null;
let ultimoError = null;
let intervalo = null;

function iniciarSyncAutomatico(db) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    console.warn('[mundial-sync] Sin API_FOOTBALL_KEY — resultados no se sincronizan automáticamente.');
    return;
  }

  const minutos = Number(process.env.MUNDIAL_SYNC_MINUTES || 2);
  const ms = minutos * 60 * 1000;

  const correr = async () => {
    try {
      const fixture = cargarFixture();
      await seedFirestore(db, fixture);
      ultimoSync = await sincronizarResultados(db, apiKey);
      ultimoError = null;
      console.log('[mundial-sync] OK', ultimoSync.actualizados, 'partidos');
    } catch (err) {
      ultimoError = err.message;
      console.error('[mundial-sync]', err.message);
    }
  };

  correr();
  intervalo = setInterval(correr, ms);
  console.log(`[mundial-sync] Auto-sync cada ${minutos} min`);
}

function detenerSync() {
  if (intervalo) clearInterval(intervalo);
}

function estadoSync() {
  return { ultimoSync, ultimoError, activo: Boolean(process.env.API_FOOTBALL_KEY) };
}

module.exports = {
  cargarFixture,
  seedFirestore,
  sincronizarResultados,
  iniciarSyncAutomatico,
  detenerSync,
  estadoSync,
};
