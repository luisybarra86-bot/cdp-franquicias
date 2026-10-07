import { agrupar, CAMPOS } from './lib.mjs';

const API = 'https://app.gesdatta.com/reportesApi/movimientoPorDeposito';
const FS = 'https://firestore.googleapis.com/v1/projects/cdp-franquicias/databases/(default)/documents';
const FS_KEY = 'AIzaSyCp0PTMPDod1FGDE3nstyHTrpxKfW3HyeM';
const COL = 'gesdatta_leno';
const DIAS_ATRAS = 14;

const email = process.env.GESDATTA_EMAIL;
const password = process.env.GESDATTA_PASSWORD;
if (!email || !password) {
  console.error('Faltan los secretos GESDATTA_EMAIL y GESDATTA_PASSWORD en GitHub.');
  process.exit(1);
}

const hoyAR = new Date(Date.now() - 3 * 3600 * 1000);
const hasta = hoyAR.toISOString().slice(0, 10);
const desdeD = new Date(hoyAR);
desdeD.setUTCDate(desdeD.getUTCDate() - DIAS_ATRAS);
const desde = desdeD.toISOString().slice(0, 10);

console.log(`Consultando Gesdatta del ${desde} al ${hasta}`);
const res = await fetch(API, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, cliente: 'Leno S.R.L.', f_desde: desde, f_hasta: hasta }),
});
if (!res.ok) {
  console.error(`Gesdatta respondió ${res.status}. Revisá usuario y clave en los secretos.`);
  process.exit(1);
}
const json = await res.json();
const datos = Array.isArray(json?.datos) ? json.datos : null;
if (!datos || !datos.length) {
  console.error('Gesdatta no devolvió movimientos (campo "datos" vacío o ausente). No se modifica nada.');
  console.error('Campos recibidos:', Object.keys(json || {}).join(', '));
  process.exit(1);
}
console.log(`Movimientos recibidos: ${datos.length}. Campos: ${Object.keys(datos[0]).join(', ')}`);

const grupos = agrupar(datos);
const ids = Object.keys(grupos);
console.log(`Combinaciones día/sucursal con carne o pollo: ${ids.length}`);

const val = (v) => (typeof v === 'number' ? { doubleValue: v } : { stringValue: String(v) });

async function fs(path, opts = {}) {
  const r = await fetch(`${FS}/${path}${path.includes('?') ? '&' : '?'}key=${FS_KEY}`, opts);
  if (!r.ok) throw new Error(`Firestore ${opts.method || 'GET'} ${path} -> ${r.status}`);
  return r.status === 204 ? null : r.json();
}

for (const id of ids) {
  const g = grupos[id];
  const fields = { fecha: val(g.fecha), sucursal: val(g.sucursal) };
  for (const c of CAMPOS) fields[c] = val(g[c]);
  await fs(`${COL}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
}

// Borra lo que quedó del rango y ya no existe en Gesdatta (movimientos corregidos o anulados)
const q = await fetch(`${FS}:runQuery?key=${FS_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: COL }],
      where: { fieldFilter: { field: { fieldPath: 'fecha' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: desde } } },
    },
  }),
});
const existentes = (await q.json()).map((x) => x.document?.name?.split('/').pop()).filter(Boolean);
let borrados = 0;
for (const id of existentes) {
  if (!grupos[id]) {
    await fs(`${COL}/${id}`, { method: 'DELETE' });
    borrados++;
  }
}

await fs(`${COL}/_meta`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fields: {
      actualizado: val(new Date().toISOString()),
      desde: val(desde),
      hasta: val(hasta),
      movimientos: val(datos.length),
    },
  }),
});

console.log(`Listo: ${ids.length} registros guardados, ${borrados} obsoletos borrados.`);
