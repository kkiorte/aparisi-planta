/**
 * APARISI CEPILLOS · Top 15 (reunión diaria de inicio de turno) + menú de inicio del PC de planta
 * ebing · Lean & Digital
 *
 * Vive en el mismo proyecto y la misma hoja que Solicitudes de compra (Code.gs).
 * Lee los indicadores de la hoja de KPIs (una pestaña por máquina, bloque calculado desde la columna FECHA).
 * Guarda en esta hoja: T15_Temas (problemas y acciones), T15_Dia (plan y avisos del día), T15_Maquinas (máquina → sección).
 *
 * Instalación: ejecutar instalarTodo() una vez.
 */

const T15_HOJA = { TEMAS: 'T15_Temas', DIA: 'T15_Dia', MAQ: 'T15_Maquinas', CACHE: 'T15_Cache' };
const T15_SECCIONES = ['Indus', 'Agro'];
const T15_FILAS_KPI = 250;          // filas recientes que se leen de cada pestaña de máquina (sobra para 7 días)
const T15_ANCHO_LECTURA = 26;       // columnas A..Z: formulario + bloque calculado (V..Z). No hace falta leer más
const T15_DIAS_TENDENCIA = 7;
const T15_CACHE_MIN = 10;
// Columnas fijas del bloque calculado de cada pestaña de máquina (0 = columna A), igual que CONFIG.COL del Dashboard
const T15_COL = { AP: 22, NE: 23, TOT: 24, OK: 25, COEF: 46 };

const T15_TEMA_CAMPOS = [
  ['id', 'ID'], ['alta', 'Fecha alta'], ['seccion', 'Sección'], ['problema', 'Problema / tema'],
  ['accion', 'Acción'], ['responsable', 'Responsable'], ['fechaCompromiso', 'Para cuándo'],
  ['estado', 'Estado'], ['comentarios', 'Comentarios'], ['cierre', 'Fecha cierre'], ['actualizado', 'Actualizado'],
];
const T15_DIA_CAMPOS = [
  ['fecha', 'Fecha'], ['planIndus', 'Plan Indus'], ['planAgro', 'Plan Agro'],
  ['respExpedicion', 'Responsable hoy recortado / embalaje / expedición'], ['personal', 'Personal y ausencias'],
  ['avisos', 'Avisos'], ['actualizado', 'Actualizado'],
];
const T15_MAQUINAS_INICIALES = [
  ['TORNO3', 'Torno 3', 'Indus'], ['TORNO81', 'Torno 81', 'Indus'],
  ['INGLETADORA', 'Ingletadora', 'Indus'], ['INGLETADORA 2', 'Ingletadora 2', 'Indus'],
  ['GEMINI', 'Gemini', 'Indus'], ['nº19 TALADRO COLUMNA', 'Taladro columna 19', 'Indus'],
  ['nº16 REC.PLANA GUIAS PARALELAS', 'Rec. plana guías 16', 'Indus'],
  ['nº7 RECORTADORA CILINDROS', 'Recortadora cilindros 7', 'Indus'],
  ['nº8 RECORTADORA PLANA PEINE', 'Recortadora peine 8', 'Indus'],
  ['nº27 RECORTADORA CILINDROS GHIRBO', 'Ghirbo 27', 'Indus'],
  ['EMPAQUETADO', 'Empaquetado', 'Indus'],
  ['LION70', 'Lion 70', 'Agro'], ['LION100', 'Lion 100', 'Agro'],
  ['AW2', 'AW2', 'Agro'], ['AW8', 'AW8', 'Agro'],
];

/* ───────────────────────── Páginas ───────────────────────── */

// Sustituye al doGet de Code.gs: menú de inicio, ?app=top15 y ?app=compras
function doGet(e) {
  const app = e && e.parameter && e.parameter.app;
  if (app === 'compras') return cmpPagina();
  if (app === 'top15') return t15Pagina();
  return inicioPagina();
}

function inicioPagina() {
  const t = HtmlService.createTemplateFromFile('Inicio');
  t.url = ScriptApp.getService().getUrl();
  return t.evaluate().setTitle('Planta · Aparisi Cepillos')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function t15Pagina() {
  const t = HtmlService.createTemplateFromFile('Top15');
  t.url = ScriptApp.getService().getUrl();
  return t.evaluate().setTitle('Top 15 · Aparisi Cepillos')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ───────────────────────── Instalación ───────────────────────── */

function instalarTodo() {
  cmpSetup();
  t15Setup();
  try { t15InstalarActualizacion(); } catch (err) { console.warn('Sin disparador horario: ' + err); }
  return 'Listo. Revisa Config (KPI_SS_ID y objetivos de OEE), Usuarios y T15_Maquinas.';
}

function t15Setup() {
  cmpHoja_(T15_HOJA.TEMAS, T15_TEMA_CAMPOS.map(c => c[1]));
  cmpHoja_(T15_HOJA.DIA, T15_DIA_CAMPOS.map(c => c[1]));
  cmpHoja_(T15_HOJA.CACHE, ['Indicadores precalculados (no tocar)', 'Generado (ms)']);
  const maq = cmpHoja_(T15_HOJA.MAQ, ['Pestaña en hoja de KPIs', 'Nombre', 'Sección', 'Activa']);
  if (maq.getLastRow() < 2) {
    maq.getRange(2, 1, T15_MAQUINAS_INICIALES.length, 4)
      .setValues(T15_MAQUINAS_INICIALES.map(r => r.concat(['Sí'])));
  }
  maq.getRange(2, 3, 100, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(T15_SECCIONES, true).build());
  const cfg = cmpSS_().getSheetByName(CMP_HOJA.CFG);
  const claves = cfg.getLastRow() > 1 ? cfg.getRange(2, 1, cfg.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
  [
    ['KPI_SS_ID', '1AiiZkfdYKvRH88qZjLoWl29L1_Y7VgEFc8TZE4HF9B8', 'ID de la hoja «KPIs APARISI CEPILLOS»'],
    ['OBJ_OEE_INDUS', '60%', 'Objetivo de OEE de Indus (verde si se alcanza)'],
    ['OBJ_OEE_AGRO', '60%', 'Objetivo de OEE de Agro (verde si se alcanza)'],
    ['INFORME_URL', 'https://script.google.com/macros/s/AKfycbxP3sofuu3CRT7JN_F-29eCOaTncHI2vUbP_TeasvXDFiT8XQFHMmUvnVyadXN9V_CNdg/exec', 'URL del Dashboard OEE (para abrir el informe diario desde el Top 15)'],
  ].forEach(r => { if (!claves.includes(r[0])) cfg.appendRow(r); });
}

/* ───────────────────────── Lectura ───────────────────────── */

function t15Cfg_() {
  const sh = cmpSS_().getSheetByName(CMP_HOJA.CFG);
  const m = {};
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => { m[String(r[0]).trim()] = r[1]; });
  const obj = v => { const n = t15Pct_(v); return n === null ? 0.6 : n; };
  return {
    kpiId: String(m.KPI_SS_ID || '').trim(),
    informeUrl: String(m.INFORME_URL || '').trim(),
    objetivo: { Indus: obj(m.OBJ_OEE_INDUS), Agro: obj(m.OBJ_OEE_AGRO) },
  };
}

function t15Maquinas_() {
  const sh = cmpSS_().getSheetByName(T15_HOJA.MAQ);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues()
    .filter(r => String(r[0]).trim() && String(r[3]).trim().toLowerCase() !== 'no')
    .map(r => ({ pestana: String(r[0]).trim(), nombre: String(r[1]).trim() || String(r[0]).trim(), seccion: String(r[2]).trim() }));
}

function t15Leer_(hoja, campos) {
  const sh = cmpSS_().getSheetByName(hoja);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, campos.length).getValues().map((r, i) => {
    const o = { _fila: i + 2 };
    campos.forEach((c, j) => { o[c[0]] = r[j]; });
    return o;
  });
}

function t15Guardar_(hoja, campos, o) {
  const sh = cmpSS_().getSheetByName(hoja);
  const fila = campos.map(([k]) => (o[k] === undefined || o[k] === null ? '' : o[k]));
  if (o._fila) sh.getRange(o._fila, 1, 1, fila.length).setValues([fila]);
  else sh.appendRow(fila);
}

/** Todo lo que pinta la pantalla del Top 15 */
/** Pantalla completa (compatibilidad): datos base + indicadores */
function t15Datos() {
  const d = t15Base();
  const k = t15Kpi(false);
  d.indicadores = k.indicadores; d.errorKpi = k.errorKpi;
  return d;
}

/** Indicadores por separado: la pantalla se pinta sin esperarlos */
function t15Kpi(forzar) {
  try { return { indicadores: t15Indicadores_(!!forzar), errorKpi: '' }; }
  catch (err) { return { indicadores: null, errorKpi: String(err.message || err) }; }
}

/** Todo lo que pinta la pantalla del Top 15 salvo los indicadores (rápido) */
function t15Base() {
  const tz = Session.getScriptTimeZone();
  const hoy = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const f = d => (d instanceof Date ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : String(d || ''));

  const hace7 = new Date(); hace7.setDate(hace7.getDate() - 7);
  const temas = t15Leer_(T15_HOJA.TEMAS, T15_TEMA_CAMPOS)
    .filter(t => t.id && (t.estado !== 'Hecha' || (t.cierre instanceof Date && t.cierre >= hace7)))
    .map(t => ({
      id: t.id, alta: f(t.alta), seccion: t.seccion, problema: t.problema, accion: t.accion,
      responsable: t.responsable, fechaCompromiso: f(t.fechaCompromiso), estado: t.estado,
      comentarios: String(t.comentarios || ''), cierre: f(t.cierre),
    }));

  const dia = t15Leer_(T15_HOJA.DIA, T15_DIA_CAMPOS).find(d => f(d.fecha) === hoy) || {};
  const plan = {};
  T15_DIA_CAMPOS.forEach(([k]) => { if (k !== 'fecha' && k !== 'actualizado') plan[k] = String(dia[k] || ''); });

  return {
    hoy: hoy,
    temas: temas,
    plan: plan,
    informeUrl: t15Cfg_().informeUrl,
    compras: t15ResumenCompras_(hoy),
    personas: cmpUsuarios_().map(u => u.nombre),
    secciones: T15_SECCIONES.concat(['General']),
  };
}

function t15RefrescarKpi() {
  return t15Kpi(true);
}

/* ───────────── Precálculo: un disparador cada hora deja los indicadores listos ───────────── */

function t15PrecalcularKpi() {
  t15Indicadores_(true);
}

function t15InstalarActualizacion() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 't15PrecalcularKpi')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('t15PrecalcularKpi').timeBased().everyHours(1).create();
  t15PrecalcularKpi();
  return 'Indicadores precalculados cada hora.';
}

/* ───────────────────────── Indicadores ───────────────────────── */

/**
 * Indicadores con dos niveles de caché:
 *  1) CacheService (memoria, 10 min)  2) pestaña T15_Cache (la rellena el disparador horario)
 * Solo si ambos faltan o son de otro día se recalcula leyendo la hoja de KPIs.
 */
function t15Indicadores_(forzar) {
  const cache = CacheService.getScriptCache();
  const hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (!forzar) {
    const enCache = cache.get('T15_KPI');
    if (enCache) { const r = JSON.parse(enCache); if (r.dia === hoy) return r; }
    const sh = cmpSS_().getSheetByName(T15_HOJA.CACHE);
    if (sh && sh.getLastRow() >= 2) {
      const v = sh.getRange(2, 1, 1, 2).getValues()[0];
      const edad = Date.now() - Number(v[1] || 0);
      if (v[0] && edad < 3 * 3600 * 1000) {
        const r = JSON.parse(String(v[0]));
        if (r.dia === hoy) { try { cache.put('T15_KPI', String(v[0]), T15_CACHE_MIN * 60); } catch (e) {} return r; }
      }
    }
  }
  const res = t15CalcularKpi_();
  const json = JSON.stringify(res);
  try { cache.put('T15_KPI', json, T15_CACHE_MIN * 60); } catch (err) { /* demasiado grande: sin caché */ }
  const sh = cmpSS_().getSheetByName(T15_HOJA.CACHE);
  if (sh && json.length < 49000) sh.getRange(2, 1, 1, 2).setValues([[json, Date.now()]]);
  return res;
}

function t15CalcularKpi_() {

  const cfg = t15Cfg_();
  if (!cfg.kpiId) throw new Error('Falta KPI_SS_ID en la pestaña Config.');
  const kpi = SpreadsheetApp.openById(cfg.kpiId);
  const tz = Session.getScriptTimeZone();
  const hoy = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const avisos = [];
  const registros = []; // un registro por lote

  t15Maquinas_().forEach(m => {
    const sh = kpi.getSheetByName(m.pestana);
    if (!sh) { avisos.push('No encuentro la pestaña «' + m.pestana + '» en la hoja de KPIs.'); return; }
    // Misma fórmula que el Dashboard OEE y sus informes (Code.gs v3 de la hoja de KPIs):
    // base = máx(apertura − descanso, neto) · disp = neto/base · rend = 1/AU2 · cal = buenas/totales
    // El bloque calculado (W apertura, X neto, Y totales, Z buenas) y AU (coef.) están en posición fija.
    const ancho = T15_ANCHO_LECTURA, alto = sh.getLastRow();
    if (alto < 2) return;
    const cab = sh.getRange(1, 1, 1, ancho).getValues()[0]
      .map(h => String(h).trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
    const iFecha = cab.indexOf('FECHA');
    const antes = j => iFecha < 0 || j < iFecha;
    const col = {
      dia: cab.indexOf('DIA'),
      malas: cab.indexOf('UDS MALAS'),
      motivo: cab.indexOf('MOTIVO AVERIA'),
      desc: cab.findIndex((h, j) => antes(j) && h.indexOf('DESCANSO') === 0),
    };
    if (col.dia < 0) { avisos.push('La pestaña «' + m.pestana + '» no tiene columna DIA.'); return; }
    const paradas = [];
    cab.forEach((h, j) => {
      if (antes(j) && /\(MIN\)\s*$/.test(h) && h.indexOf('DESCANSO') !== 0) {
        paradas.push({ j: j, nombre: t15Capitalizar_(h.replace(/\s*\(MIN\)\s*$/, '')) });
      }
    });
    // Última fila con DIA relleno (las fórmulas pueden llegar más abajo que los datos)
    const dias = sh.getRange(2, col.dia + 1, alto - 1, 1).getValues();
    let ultima = dias.length;
    while (ultima > 0 && (dias[ultima - 1][0] === '' || dias[ultima - 1][0] === null)) ultima--;
    if (!ultima) return;
    let coef = 0;
    sh.getRange(2, T15_COL.COEF + 1, Math.min(alto - 1, 50), 1).getValues().some(r => { const v = t15Num_(r[0]); if (v > 0) { coef = v; return true; } return false; });
    const rend = Math.min(1, 1 / (coef || 1));
    const n = Math.min(T15_FILAS_KPI, ultima);
    const datos = sh.getRange(2 + ultima - n, 1, n, ancho).getValues();
    datos.forEach(r => {
      const dia = t15Dia_(r[col.dia], tz);
      const ap = t15Num_(r[T15_COL.AP]) || 0;
      if (!dia || ap <= 0) return;
      const ne = t15Num_(r[T15_COL.NE]) || 0;
      const desc = col.desc >= 0 ? (t15Num_(r[col.desc]) || 0) : 0;
      const p = {};
      paradas.forEach(x => { const v = t15Num_(r[x.j]); if (v) p[x.nombre] = v; });
      registros.push({
        seccion: m.seccion, maquina: m.nombre, dia: dia,
        ap: ap, ne: ne, base: Math.max(ap - desc, ne), rend: rend,
        tot: t15Num_(r[T15_COL.TOT]) || 0, buenas: t15Num_(r[T15_COL.OK]) || 0,
        malas: col.malas >= 0 ? (t15Num_(r[col.malas]) || 0) : 0,
        motivo: col.motivo >= 0 ? String(r[col.motivo] || '').trim() : '',
        paradas: p,
      });
    });
  });

  const res = { dia: hoy, generado: Utilities.formatDate(new Date(), tz, 'HH:mm'), avisos: avisos, secciones: {} };
  T15_SECCIONES.forEach(sec => {
    const rs = registros.filter(r => r.seccion === sec && r.dia < hoy);
    const porDia = {};
    rs.forEach(r => { (porDia[r.dia] = porDia[r.dia] || []).push(r); });
    const diasOrden = Object.keys(porDia).sort().reverse();
    const tendencia = diasOrden.slice(0, T15_DIAS_TENDENCIA).map(d => {
      const a = t15Agregar_(porDia[d]);
      return { dia: d, oee: a.oee, buenas: a.buenas };
    }).reverse();
    let ultimo = null;
    if (diasOrden.length) {
      const d = diasOrden[0];
      const a = t15Agregar_(porDia[d]);
      const maqs = {};
      porDia[d].forEach(r => { (maqs[r.maquina] = maqs[r.maquina] || []).push(r); });
      a.maquinas = Object.keys(maqs).map(k => {
        const x = t15Agregar_(maqs[k]);
        return { nombre: k, oee: x.oee, buenas: x.buenas, horas: x.horas, parada: x.paradas[0] || null };
      }).sort((p, q) => (p.oee === null ? 2 : p.oee) - (q.oee === null ? 2 : q.oee));
      a.averias = porDia[d].filter(r => r.motivo).map(r => r.maquina + ': ' + r.motivo);
      a.dia = d;
      ultimo = a;
    }
    res.secciones[sec] = { objetivo: cfg.objetivo[sec], ultimo: ultimo, tendencia: tendencia };
  });

  return res;
}

/** KPIs de un grupo de lotes con la fórmula del Dashboard OEE, unidades y paradas ordenadas */
function t15Agregar_(rs) {
  let ap = 0, base = 0, ne = 0, tot = 0, buenas = 0, malas = 0, rw = 0;
  const par = {};
  rs.forEach(r => {
    ap += r.ap; base += r.base; ne += r.ne; tot += r.tot; buenas += r.buenas; malas += r.malas; rw += r.rend * r.base;
    Object.keys(r.paradas).forEach(k => { par[k] = (par[k] || 0) + r.paradas[k]; });
  });
  const disp = base ? Math.min(1, ne / base) : null;
  const rend = base ? Math.min(1, rw / base) : null;
  const cal = tot ? Math.min(1, buenas / tot) : (base ? 1 : null);
  return {
    oee: base ? disp * rend * cal : null, disp: disp, rend: rend,
    buenas: Math.round(buenas), malas: Math.round(malas),
    calidad: cal,
    horas: Math.round(ap / 6) / 10,
    paradas: Object.keys(par).map(k => ({ causa: k, min: Math.round(par[k]) })).sort((a, b) => b.min - a.min),
  };
}

function t15Num_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).trim().replace('%', '');
  if (!s || s.charAt(0) === '#') return null;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? null : n;
}
function t15Pct_(v) {
  if (typeof v === 'string' && v.indexOf('%') >= 0) { const n = t15Num_(v); return n === null ? null : n / 100; }
  const n = t15Num_(v);
  if (n === null) return null;
  return n > 1.5 ? n / 100 : n;
}
function t15Dia_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const m = String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
}
const T15_ETIQUETAS = {
  'AVERIA': 'Avería', 'PREPARACION MAQUINA': 'Preparación máquina', 'MATERIA PRIMA': 'Materia prima',
  'LIMPIEZA': 'Limpieza', 'ACEITE': 'Aceite', 'CAMBIO BOLSA': 'Cambio bolsa', 'CONSUMIBLES': 'Consumibles',
  'PECORTAR A MANO': 'Recortar a mano',
};
function t15Capitalizar_(s) {
  s = String(s).trim();
  if (T15_ETIQUETAS[s]) return T15_ETIQUETAS[s];
  s = s.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ───────────────────────── Compras ───────────────────────── */

function t15ResumenCompras_(hoy) {
  const E = CMP_ESTADO;
  const tz = Session.getScriptTimeZone();
  const f = d => (d instanceof Date ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : String(d || ''));
  const abiertas = [E.PENDIENTE, E.ALTERNATIVA, E.VALIDADA, E.FALTA_INFO, E.COMPRADA];
  const sols = cmpLeer_().filter(s => abiertas.includes(s.estado));
  const corto = s => ({
    id: s.id, seccion: s.seccion, txt: s.cantidad + ' ' + s.unidad + ' · ' + s.articulo,
    estado: ({[E.PENDIENTE]:'Solicitada',[E.VALIDADA]:'Validada',[E.COMPRADA]:'En camino',[E.ALTERNATIVA]:'Atascada',[E.FALTA_INFO]:'Atascada'})[s.estado] || s.estado,
    entrega: f(s.entregaPrevista), necesaria: f(s.fechaNecesaria),
  });
  return {
    pendientesValidar: sols.filter(s => s.estado === E.PENDIENTE).length,
    paraComprar: sols.filter(s => s.estado === E.VALIDADA).length,
    bloqueadas: sols.filter(s => s.estado === E.FALTA_INFO || s.estado === E.ALTERNATIVA).length,
    urgentes: sols.filter(s => s.urgente === 'Sí' && s.estado !== E.COMPRADA).map(corto),
    llegan: sols.filter(s => s.estado === E.COMPRADA && f(s.entregaPrevista) && f(s.entregaPrevista) <= hoy).map(corto),
  };
}

/* ───────────────────────── Escritura ───────────────────────── */

/**
 * tipo: nuevoTema | editarTema | comentar | cerrar | reabrir | guardarDia
 * En el PC compartido no hay usuario: lo que se teclea es de la reunión.
 */
function t15Accion(tipo, id, datos) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    datos = datos || {};
    const ahora = new Date();
    const tz = Session.getScriptTimeZone();
    const txt = k => String(datos[k] === undefined || datos[k] === null ? '' : datos[k]).trim();
    const nota = t => Utilities.formatDate(ahora, tz, 'dd/MM') + ': ' + t;

    if (tipo === 'guardarDia') {
      const hoy = Utilities.formatDate(ahora, tz, 'yyyy-MM-dd');
      const d = t15Leer_(T15_HOJA.DIA, T15_DIA_CAMPOS).find(x => (x.fecha instanceof Date ? Utilities.formatDate(x.fecha, tz, 'yyyy-MM-dd') : '') === hoy)
        || { fecha: cmpFecha_(hoy) };
      ['planIndus', 'planAgro', 'respExpedicion', 'personal', 'avisos'].forEach(k => { if (k in datos) d[k] = txt(k); });
      d.actualizado = ahora;
      t15Guardar_(T15_HOJA.DIA, T15_DIA_CAMPOS, d);
      return t15Base();
    }

    if (tipo === 'nuevoTema') {
      if (!txt('problema') && !txt('accion')) throw new Error('Escribe el problema o la acción.');
      if (txt('accion') && (!txt('responsable') || !txt('fechaCompromiso'))) throw new Error('Una acción necesita responsable y fecha.');
      t15Guardar_(T15_HOJA.TEMAS, T15_TEMA_CAMPOS, {
        id: t15NuevoId_(), alta: ahora, seccion: txt('seccion') || 'General', problema: txt('problema'),
        accion: txt('accion'), responsable: txt('responsable'),
        fechaCompromiso: txt('fechaCompromiso') ? cmpFecha_(txt('fechaCompromiso')) : '',
        estado: 'Abierta', comentarios: '', cierre: '', actualizado: ahora,
      });
      return t15Base();
    }

    const t = t15Leer_(T15_HOJA.TEMAS, T15_TEMA_CAMPOS).find(x => x.id === id);
    if (!t) throw new Error('No encuentro el tema ' + id + '.');
    switch (tipo) {
      case 'editarTema':
        ['seccion', 'problema', 'accion', 'responsable'].forEach(k => { if (k in datos) t[k] = txt(k); });
        if ('fechaCompromiso' in datos) {
          const nueva = txt('fechaCompromiso');
          const vieja = t.fechaCompromiso instanceof Date ? Utilities.formatDate(t.fechaCompromiso, tz, 'yyyy-MM-dd') : '';
          if (vieja && nueva && nueva !== vieja) t.comentarios = t15Anexar_(t.comentarios, nota('fecha movida del ' + vieja.slice(8) + '/' + vieja.slice(5, 7)));
          t.fechaCompromiso = nueva ? cmpFecha_(nueva) : '';
        }
        if (t.accion && (!t.responsable || !t.fechaCompromiso)) throw new Error('Una acción necesita responsable y fecha.');
        break;
      case 'comentar':
        if (!txt('comentario')) throw new Error('Escribe el comentario.');
        t.comentarios = t15Anexar_(t.comentarios, nota(txt('comentario')));
        break;
      case 'cerrar':
        t.estado = 'Hecha'; t.cierre = ahora;
        if (txt('comentario')) t.comentarios = t15Anexar_(t.comentarios, nota(txt('comentario')));
        break;
      case 'reabrir':
        t.estado = 'Abierta'; t.cierre = '';
        t.comentarios = t15Anexar_(t.comentarios, nota('reabierta'));
        break;
      default:
        throw new Error('Acción desconocida: ' + tipo);
    }
    t.actualizado = ahora;
    t15Guardar_(T15_HOJA.TEMAS, T15_TEMA_CAMPOS, t);
    return t15Base();
  } finally {
    lock.releaseLock();
  }
}

function t15Anexar_(previo, linea) {
  return previo ? String(previo) + '\n' + linea : linea;
}

function t15NuevoId_() {
  const props = PropertiesService.getScriptProperties();
  const n = Number(props.getProperty('T15_SEQ') || 0) + 1;
  props.setProperty('T15_SEQ', String(n));
  return 'T' + ('000' + n).slice(-4);
}
