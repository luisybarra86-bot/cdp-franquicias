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
