import { agruparFacturas, CAMPOS_FRANQ, campo, campoAny, norm, fechaISO, ART_FRANQ, CC_FRANQ } from './lib.mjs';

const API = 'https://app.gesdatta.com/reportesApi/preciosVenta';
const FS = 'https://firestore.googleapis.com/v1/projects/cdp-franquicias/databases/(default)/documents';
const FS_KEY = 'AIzaSyCp0PTMPDod1FGDE3nstyHTrpxKfW3HyeM';
const COL = 'gesdatta_franq';

const email = process.env.GESDATTA_EMAIL;
const password = process.env.GESDATTA_PASSWORD;
if (!email || !password) {
  console.error('Faltan los secretos GESDATTA_EMAIL y GESDATTA_PASSWORD en GitHub.');
  process.exit(1);
}

// Ventana: desde el 1° del mes anterior (las facturas mensuales salen a principio del mes siguiente)
const hoyAR = new Date(Date.now() - 3 * 3600 * 1000);
const hasta = hoyAR.toISOString().slice(0, 10);
const desdeD = new Date(Date.UTC(hoyAR.getUTCFullYear(), hoyAR.getUTCMonth() - 1, 1));
const desde = desdeD.toISOString().slice(0, 10);

console.log(`Consultando facturas de Gesdatta del ${desde} al ${hasta}`);
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
  console.error('Gesdatta no devolvió líneas (campo "datos" vacío o ausente). No se modifica nada.');
  console.error('Campos recibidos:', Object.keys(json || {}).join(', '));
  process.exit(1);
}
console.log(`Líneas recibidas: ${datos.length}. Campos: ${Object.keys(datos[0]).join(', ')}`);

const grupos = agruparFacturas(datos);
const ids = Object.keys(grupos);
console.log(`Períodos por sucursal con carne o pollo facturado: ${ids.length}`);

// Diagnóstico: en qué paso se pierden las líneas (solo nombres de productos, sucursales, formatos de fecha y conteos)
const cc = (r) => norm(campoAny(r, ['centro de costo', 'centro costo'])).replace(/^\(f\)\s*/, '');
const nArt = datos.filter((r) => ART_FRANQ[norm(campo(r, 'articulo'))]).length;
const nCC = datos.filter((r) => CC_FRANQ[cc(r)]).length;
const nFecha = datos.filter((r) => fechaISO(campo(r, 'fecha'))).length;
const nAmbos = datos.filter((r) => ART_FRANQ[norm(campo(r, 'articulo'))] && CC_FRANQ[cc(r)] && fechaISO(campo(r, 'fecha'))).length;
const dist = (f, n) => [...new Set(datos.map(f))].slice(0, n).join(' | ');
const diag = `articulo ok=${nArt} | centro ok=${nCC} | fecha ok=${nFecha} | art+centro+fecha=${nAmbos} | fechas ejemplo=${dist((r) => String(campo(r, 'fecha')), 3)} | centros=${dist(cc, 12)}`;
console.log('Diagnóstico:', diag);

const val = (v) => (typeof v === 'number' ? { doubleValue: v } : { stringValue: String(v) });

async function fs(path, opts = {}) {
  const r = await fetch(`${FS}/${path}${path.includes('?') ? '&' : '?'}key=${FS_KEY}`, opts);
  if (!r.ok) throw new Error(`Firestore ${opts.method || 'GET'} ${path} -> ${r.status}`);
  return r.status === 204 ? null : r.json();
}

for (const id of ids) {
  const g = grupos[id];
  const fields = {
    tipo: val(g.tipo),
    desde: val(g.desde),
    hasta: val(g.hasta),
    sucursal: val(g.sucursal),
    facturas: val(g.facturas),
  };
  for (const c of CAMPOS_FRANQ) fields[c] = val(g[c]);
  await fs(`${COL}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
}

// Borra períodos que se solapan con la ventana consultada y ya no existen en Gesdatta (facturas anuladas)
const q = await fetch(`${FS}:runQuery?key=${FS_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: COL }],
      where: { fieldFilter: { field: { fieldPath: 'hasta' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: desde } } },
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
      lineas: val(datos.length),
      diagnostico: val(diag),
    },
  }),
});

console.log(`Listo: ${ids.length} períodos guardados, ${borrados} obsoletos borrados.`);
if (!ids.length) {
  console.error('Ninguna línea coincidió con carne o pollo de franquicias. Revisá el diagnóstico de arriba.');
  process.exit(1);
}
