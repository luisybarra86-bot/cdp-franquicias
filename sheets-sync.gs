// ══════════════════════════════════════════════════════════════
//  CDP Franquicias — Sincronizador Google Sheets → Firebase
//  Pegá este código en Apps Script de la planilla:
//  Extensiones > Apps Script → reemplazá el contenido > Guardar
//
//  PRIMERA VEZ: ejecutar crearTrigger() desde el editor (una sola vez)
// ══════════════════════════════════════════════════════════════

var FIREBASE_PROJECT = 'cdp-franquicias';
var API_KEY          = 'AIzaSyCp0PTMPDod1FGDE3nstyHTrpxKfW3HyeM';
var FIRESTORE_BASE   = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT + '/databases/(default)/documents/registros';

// GIDs de las hojas
var CARNE_GID = 324102864;
var POLLO_GID = 1665296147;

var SUCURSALES = [
  { id: 'INDEPENDENCIA', startCol: 0  },
  { id: 'PERON',         startCol: 11 },
  { id: 'BARRIO SUR',   startCol: 22 },
  { id: 'FLIP',         startCol: 33 },
];

var CARNE_DATA_ROW = 7;
var POLLO_DATA_ROW = 3;

// ── Parsers ────────────────────────────────────────────────────

function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim().toUpperCase();
  if (s === 'X' || s === '') return null;
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const parts = s.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return null;
}

function parseNum(val) {
  if (!val && val !== 0) return 0;
  const s = String(val).trim().toUpperCase();
  if (s === 'X' || s === '') return 0;
  return parseFloat(s.replace(',', '.')) || 0;
}

// ── Formato Firestore REST ─────────────────────────────────────

function toFirestoreDoc(reg) {
  const fields = {};
  for (const [key, value] of Object.entries(reg)) {
    if (typeof value === 'number') {
      fields[key] = { doubleValue: value };
    } else {
      fields[key] = { stringValue: String(value) };
    }
  }
  return { fields };
}

// PATCH con updateMask → solo actualiza los campos indicados, sin tocar el resto
function subirConMask(docId, reg, fieldNames) {
  const mask = fieldNames.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const url  = `${FIRESTORE_BASE}/${docId}?${mask}&key=${API_KEY}`;

  const subset = {};
  fieldNames.forEach(f => { if (f in reg) subset[f] = reg[f]; });

  const res = UrlFetchApp.fetch(url, {
    method:             'PATCH',
    contentType:        'application/json',
    payload:            JSON.stringify(toFirestoreDoc(subset)),
    muteHttpExceptions: true,
  });
  return res.getResponseCode();
}

// ── Builders por tipo ──────────────────────────────────────────

var CARNE_FIELDS = ['fecha','sucursal','ped_kg','rec_kg','proc_kg','med110','bol110','med75','createdAt','source'];
var POLLO_FIELDS = ['fecha','sucursal','ped_alita','proc_alita','ped_pechuga','proc_pechuga','alitas','filet','popCorns','tiras','createdAt','source'];

function buildCarne(rowData, suc) {
  const c = suc.startCol;
  return {
    fecha:     parseDate(rowData[c]),
    sucursal:  suc.id,
    ped_kg:    parseNum(rowData[c + 1]),
    rec_kg:    parseNum(rowData[c + 2]),
    proc_kg:   parseNum(rowData[c + 3]),
    med110:    parseNum(rowData[c + 5]),
    bol110:    parseNum(rowData[c + 6]),
    med75:     parseNum(rowData[c + 7]),
    createdAt: new Date().toISOString(),
    source:    'sheets',
  };
}

function buildPollo(rowData, suc) {
  const c = suc.startCol;
  return {
    fecha:        parseDate(rowData[c]),
    sucursal:     suc.id,
    ped_alita:    parseNum(rowData[c + 1]),
    proc_alita:   parseNum(rowData[c + 2]),
    ped_pechuga:  parseNum(rowData[c + 3]),
    proc_pechuga: parseNum(rowData[c + 4]),
    alitas:       parseNum(rowData[c + 6]),
    filet:        parseNum(rowData[c + 7]),
    popCorns:     parseNum(rowData[c + 8]),
    tiras:        parseNum(rowData[c + 9]),
    createdAt:    new Date().toISOString(),
    source:       'sheets',
  };
}

// ── Sync automático al editar ──────────────────────────────────

function onEditInstalable(e) {
  const sheet   = e.source.getActiveSheet();
  const sheetId = sheet.getSheetId();
  const row     = e.range.getRow();
  const col     = e.range.getColumn() - 1; // 0-based

  let isCarne, dataRow;
  if      (sheetId === CARNE_GID) { isCarne = true;  dataRow = CARNE_DATA_ROW; }
  else if (sheetId === POLLO_GID) { isCarne = false; dataRow = POLLO_DATA_ROW; }
  else return;

  if (row < dataRow) return;

  const suc = SUCURSALES.find(s => col >= s.startCol && col < s.startCol + 10);
  if (!suc) return;

  const rowData = sheet.getRange(row, 1, 1, 45).getValues()[0];

  try {
    if (isCarne) {
      const reg = buildCarne(rowData, suc);
      if (!reg.fecha) return;
      subirConMask(`${suc.id}_${reg.fecha}`, reg, CARNE_FIELDS);
    } else {
      const reg = buildPollo(rowData, suc);
      if (!reg.fecha) return;
      subirConMask(`${suc.id}_${reg.fecha}`, reg, POLLO_FIELDS);
    }
  } catch (err) {
    console.error('CDP Sync error:', err.message);
  }
}

// ── Sync manual completo — batchWrite para evitar timeout ──────

function sincronizar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requests = [];

  function addSheet(sheet, dataRow, buildFn, fields, sucs) {
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow < dataRow) return;
    const data = sheet.getRange(dataRow, 1, lastRow - dataRow + 1, sheet.getLastColumn()).getValues();
    sucs.forEach(function(suc) {
      data.forEach(function(row) {
        const reg = buildFn(row, suc);
        if (!reg.fecha) return;
        const docId = suc.id + '_' + reg.fecha;
        const mask  = fields.map(f => 'updateMask.fieldPaths=' + encodeURIComponent(f)).join('&');
        const subset = {};
        fields.forEach(f => { if (f in reg) subset[f] = reg[f]; });
        requests.push({
          url:         FIRESTORE_BASE + '/' + docId + '?' + mask + '&key=' + API_KEY,
          method:      'PATCH',
          contentType: 'application/json',
          payload:     JSON.stringify(toFirestoreDoc(subset)),
          muteHttpExceptions: true,
        });
      });
    });
  }

  const carneSheet = ss.getSheets().find(s => s.getSheetId() === CARNE_GID);
  const polloSheet = ss.getSheets().find(s => s.getSheetId() === POLLO_GID);

  addSheet(carneSheet, CARNE_DATA_ROW, buildCarne, CARNE_FIELDS, SUCURSALES);
  addSheet(polloSheet, POLLO_DATA_ROW, buildPollo, POLLO_FIELDS, SUCURSALES);

  if (!requests.length) {
    SpreadsheetApp.getUi().alert('CDP Franquicias', 'No hay registros con fecha para sincronizar.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  // fetchAll manda hasta 100 requests en paralelo → mucho más rápido que uno por uno
  var ok = 0;
  var CHUNK = 100;
  for (var i = 0; i < requests.length; i += CHUNK) {
    UrlFetchApp.fetchAll(requests.slice(i, i + CHUNK)).forEach(function(res) {
      if (res.getResponseCode() === 200) ok++;
    });
  }

  SpreadsheetApp.getUi().alert('CDP Franquicias',
    'Sincronización completada\n✅ ' + ok + ' de ' + requests.length + ' registros subidos a Firebase',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

// ── Reset total: borrar Firestore y recargar desde Sheets ────────

function resetYResincronizar() {
  const ui = SpreadsheetApp.getUi();
  const confirmBtn = ui.alert(
    'CDP Franquicias — RESET TOTAL',
    '⚠️ Esto borrará TODOS los registros de Firebase y los recargará desde esta planilla.\n\n¿Confirmar?',
    ui.ButtonSet.YES_NO
  );
  if (confirmBtn !== ui.Button.YES) return;

  const allDocNames = [];
  let nextToken = null;

  do {
    let listUrl = `${FIRESTORE_BASE}?pageSize=300&key=${API_KEY}`;
    if (nextToken) listUrl += `&pageToken=${encodeURIComponent(nextToken)}`;
    const listRes  = UrlFetchApp.fetch(listUrl, { muteHttpExceptions: true });
    const listData = JSON.parse(listRes.getContentText());
    (listData.documents || []).forEach(d => allDocNames.push(d.name));
    nextToken = listData.nextPageToken || null;
  } while (nextToken);

  const batchUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents:batchWrite?key=${API_KEY}`;
  const BATCH = 500;

  for (let i = 0; i < allDocNames.length; i += BATCH) {
    const writes = allDocNames.slice(i, i + BATCH).map(name => ({ delete: name }));
    UrlFetchApp.fetch(batchUrl, {
      method:             'POST',
      contentType:        'application/json',
      payload:            JSON.stringify({ writes }),
      muteHttpExceptions: true,
    });
  }

  sincronizar();
}

// ── Crear trigger automático (ejecutar UNA sola vez) ───────────

function crearTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onEditInstalable')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('onEditInstalable')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  SpreadsheetApp.getUi().alert(
    'CDP Franquicias',
    '✅ Trigger creado.\nAhora sincroniza automáticamente carne y pollo al editar.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ── Menú en la planilla ────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔥 CDP Sync')
    .addItem('Sincronizar todo con Firebase', 'sincronizar')
    .addSeparator()
    .addItem('⚠️ Reset total (borrar y recargar desde Sheets)', 'resetYResincronizar')
    .addSeparator()
    .addItem('Activar sync automático', 'crearTrigger')
    .addToUi();
}
