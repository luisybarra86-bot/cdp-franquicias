export const DEPOSITOS = {
  'aconquija': 'YERBA BUENA',
  'tafi viejo': 'TAFI VIEJO',
  'eventos': 'EVENTOS',
  'flip leno srl': 'FLIP',
  'barrio norte': 'BARRIO NORTE',
};

export const ARTICULOS = {
  'medallon de carne 90grs (und)': 'med90',
  'bolita de carne 90gr (und)': 'bol90',
  'alitas de pollo (und)': 'alita',
  'filet de pollo (und)': 'filet',
  'pop corn (und)': 'popCorns',
  'tiras de pollo (und)': 'tiras',
};

export const CAMPOS = ['proc_kg', 'med90', 'bol90', 'alita', 'filet', 'popCorns', 'tiras'];

export const norm = (s) =>
  String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const normKey = (k) => norm(k).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function fechaISO(v) {
  const s = String(v == null ? '' : v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

function campo(reg, nombre) {
  const k = Object.keys(reg).find((x) => normKey(x) === nombre);
  return k === undefined ? '' : reg[k];
}

// Suma, por sucursal y día, lo que Gesdatta movió desde los depósitos centrales
// hacia cada depósito de LENO SRL (solo carne y pollo, solo tipo "Movimiento").
export function agrupar(registros) {
  const grupos = {};
  for (const reg of registros) {
    if (norm(campo(reg, 'tipo')) !== 'movimiento') continue;
    const suc = DEPOSITOS[norm(campo(reg, 'deposito'))];
    const col = ARTICULOS[norm(campo(reg, 'articulo'))];
    const fecha = fechaISO(campo(reg, 'fecha'));
    if (!suc || !col || !fecha) continue;
    const id = `${suc.replace(/ /g, '_')}_${fecha}`;
    const g = (grupos[id] ||= { fecha, sucursal: suc, med90: 0, bol90: 0, alita: 0, filet: 0, popCorns: 0, tiras: 0 });
    g[col] += num(campo(reg, 'cantidad'));
  }
  for (const [id, g] of Object.entries(grupos)) {
    g.proc_kg = Math.round((g.med90 + g.bol90) * 0.09 * 10) / 10;
    for (const c of CAMPOS) g[c] = Math.round(g[c] * 10) / 10;
    if (CAMPOS.every((c) => !g[c])) delete grupos[id];
  }
  return grupos;
}

// ── Facturas a franquiciados (reporte preciosVenta) ──
export const CC_FRANQ = {
  'plaza independencia': 'INDEPENDENCIA',
  'av peron': 'PERON',
  'barrio sur': 'BARRIO SUR',
  'portal': 'PORTAL',
  'flip': 'FLIP',
};

export const ART_FRANQ = {
  'medallon de carne 90grs (und)': 'med110',
  'bolita de carne 90gr (und)': 'bol110',
  'alitas (kg)': 'proc_alita',
  'filet pollo (kg)': 'proc_pechuga',
};

export const CAMPOS_FRANQ = ['med110', 'bol110', 'proc_alita', 'proc_pechuga'];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const p2 = (n) => String(n).padStart(2, '0');

// El período sale de las notas de la factura: "Semana 28-09 al 04-10" o "Sept. 2026".
export function periodoDeNota(nota, fechaFactura) {
  const n = norm(nota);
  let m = n.match(/semana (\d{1,2})-(\d{1,2}) al (\d{1,2})-(\d{1,2})/);
  if (m) {
    const [fy, fm] = fechaFactura.split('-').map(Number);
    const mesDesde = +m[2];
    const mesHasta = +m[4];
    const y0 = mesDesde > fm ? fy - 1 : fy;
    const y1 = mesHasta < mesDesde ? y0 + 1 : y0;
    return { tipo: 'semana', desde: `${y0}-${p2(mesDesde)}-${p2(+m[1])}`, hasta: `${y1}-${p2(mesHasta)}-${p2(+m[3])}` };
  }
  m = n.match(/\b(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.? (\d{4})/);
  if (m) {
    const mi = MESES.indexOf(m[1] === 'set' ? 'sep' : m[1]);
    const y = +m[2];
    const ultimo = new Date(Date.UTC(y, mi + 1, 0)).getUTCDate();
    return { tipo: 'mes', desde: `${y}-${p2(mi + 1)}-01`, hasta: `${y}-${p2(mi + 1)}-${p2(ultimo)}` };
  }
  return null;
}

export function agruparFacturas(registros) {
  const grupos = {};
  for (const reg of registros) {
    const campoArt = ART_FRANQ[norm(campo(reg, 'articulo'))];
    const suc = CC_FRANQ[norm(campo(reg, 'centro de costo')).replace(/^\(f\)\s*/, '')];
    const fecha = fechaISO(campo(reg, 'fecha'));
    if (!campoArt || !suc || !fecha) continue;
    const per = periodoDeNota(campo(reg, 'notas'), fecha);
    if (!per) continue;
    const id = `${per.tipo === 'semana' ? 'S' : 'M'}_${per.desde}_${suc.replace(/ /g, '_')}`;
    const g = (grupos[id] ||= { tipo: per.tipo, desde: per.desde, hasta: per.hasta, sucursal: suc, med110: 0, bol110: 0, proc_alita: 0, proc_pechuga: 0, facturas: new Set() });
    g[campoArt] += num(campo(reg, 'cantidad'));
    g.facturas.add(String(campo(reg, 'comprobante')));
  }
  for (const g of Object.values(grupos)) {
    for (const c of CAMPOS_FRANQ) g[c] = Math.round(g[c] * 10) / 10;
    g.facturas = [...g.facturas].join(', ');
  }
  return grupos;
}
