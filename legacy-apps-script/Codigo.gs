/**
 * APARISI CEPILLOS · Solicitudes de compra
 * ebing · Lean & Digital
 *
 * Flujo:
 *   Encargado solicita → Responsable de producción valida → Compras (oficina) compra → Encargado recibe
 *   Desvíos: la responsable puede pedir a un encargado que busque proveedor/pieza alternativa,
 *            y Compras puede devolver al solicitante si le falta información.
 *
 * Instalación: ver INSTRUCCIONES.md. Ejecutar instalarTodo() (Top15.gs) una vez.
 */

// Vacío = usa la hoja a la que está vinculado el script. Si el script es independiente, pegar aquí el ID.
const CMP_SS_ID = '';

const CMP_HOJA = { SOL: 'Solicitudes', HIST: 'Historial', USR: 'Usuarios', CFG: 'Config' };

const CMP_CAMPOS = [
  ['id', 'ID'],
  ['fecha', 'Fecha solicitud'],
  ['seccion', 'Sección'],
  ['solicitante', 'Solicitante'],
  ['articulo', 'Artículo / descripción'],
  ['referencia', 'Referencia'],
  ['cantidad', 'Cantidad'],
  ['unidad', 'Unidad'],
  ['proveedor', 'Proveedor'],
  ['fechaNecesaria', 'Fecha necesaria'],
  ['urgente', 'Urgente'],
  ['motivo', 'Motivo / uso'],
  ['estado', 'Estado'],
  ['asignado', 'Pendiente de'],
  ['validadoPor', 'Validado por'],
  ['fechaValidacion', 'Fecha validación'],
  ['precio', 'Precio estimado (€)'],
  ['pedidoProv', 'Nº pedido proveedor'],
  ['fechaCompra', 'Fecha compra'],
  ['entregaPrevista', 'Entrega prevista'],
  ['fechaRecepcion', 'Fecha recepción'],
  ['recibidoPor', 'Recibido por'],
  ['comentario', 'Último comentario'],
  ['actualizado', 'Actualizado'],
];
const CMP_FECHAS_HORA = ['fecha', 'fechaValidacion', 'fechaCompra', 'fechaRecepcion', 'actualizado'];
const CMP_FECHAS_DIA = ['fechaNecesaria', 'entregaPrevista'];

const CMP_ESTADO = {
  PENDIENTE: 'Pendiente validar',
  ALTERNATIVA: 'Buscar alternativa',
  VALIDADA: 'Validada',
  FALTA_INFO: 'Falta información',
  COMPRADA: 'Comprada',
  RECIBIDA: 'Recibida',
  RECHAZADA: 'Rechazada',
};
const CMP_ROL = { ENC: 'ENCARGADO', RESP: 'RESPONSABLE', COMP: 'COMPRAS', ADMIN: 'ADMIN' };

// Datos que Compras necesita para pedir sin tener que preguntar a nadie
const CMP_OBLIGATORIOS_COMPRA = [
  ['articulo', 'artículo'],
  ['cantidad', 'cantidad'],
  ['unidad', 'unidad'],
  ['fechaNecesaria', 'fecha necesaria'],
];

/* ───────────────────────── Web ───────────────────────── */

// doGet() está en Top15.gs (menú de inicio, ?app=top15 y ?app=compras)

function cmpPagina() {
  const t = HtmlService.createTemplateFromFile('Index');
  t.url = ScriptApp.getService().getUrl();
  return t.evaluate()
    .setTitle('Solicitudes de compra · Aparisi')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ───────────────────────── Instalación ───────────────────────── */

function cmpSetup() {
  const sol = cmpHoja_(CMP_HOJA.SOL, CMP_CAMPOS.map(c => c[1]));
  cmpHoja_(CMP_HOJA.HIST, ['Fecha', 'ID', 'Usuario', 'Acción', 'Estado nuevo', 'Comentario']);
  const usr = cmpHoja_(CMP_HOJA.USR, ['Nombre', 'Rol', 'Sección', 'Activo']);
  const cfg = cmpHoja_(CMP_HOJA.CFG, ['Clave', 'Valor', 'Descripción']);

  if (usr.getLastRow() < 2) {
    usr.getRange(2, 1, 4, 4).setValues([
      ['Responsable producción', CMP_ROL.RESP, '', 'Sí'],
      ['Encargado Indus', CMP_ROL.ENC, 'Indus', 'Sí'],
      ['Encargado Agro', CMP_ROL.ENC, 'Agro', 'Sí'],
      ['Compras oficina', CMP_ROL.COMP, '', 'Sí'],
    ]);
  }
  usr.getRange(2, 2, 200, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(Object.values(CMP_ROL), true).build());
  usr.getRange(2, 4, 200, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Sí', 'No'], true).build());

  if (cfg.getLastRow() < 2) {
    cfg.getRange(2, 1, 3, 3).setValues([
      ['SECCIONES', 'Indus,Agro,Mantenimiento,General', 'Lista separada por comas'],
      ['UNIDADES', 'ud,kg,m,caja,rollo,bobina,l', 'Lista separada por comas'],
      ['EMAIL_URGENTES', '', 'Email(s) separados por comas que reciben aviso al entrar una solicitud URGENTE. Vacío = sin aviso'],
    ]);
  }

  sol.setFrozenColumns(1);
  return 'Hojas preparadas. Rellena la pestaña Usuarios con los nombres reales.';
}

function cmpHoja_(nombre, cabecera) {
  const ss = cmpSS_();
  let sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, cabecera.length).setValues([cabecera])
      .setFontWeight('bold').setBackground('#1F3864').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ───────────────────────── Lectura ───────────────────────── */

function cmpSS_() {
  return CMP_SS_ID ? SpreadsheetApp.openById(CMP_SS_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function cmpUsuarios_() {
  const sh = cmpSS_().getSheetByName(CMP_HOJA.USR);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues()
    .filter(r => String(r[0]).trim() && String(r[3]).trim().toLowerCase() !== 'no')
    .map(r => ({ nombre: String(r[0]).trim(), rol: String(r[1]).trim().toUpperCase(), seccion: String(r[2]).trim() }));
}

function cmpConfig_() {
  const sh = cmpSS_().getSheetByName(CMP_HOJA.CFG);
  const cfg = {};
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => { cfg[String(r[0]).trim()] = String(r[1]).trim(); });
  }
  const lista = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  return {
    secciones: lista(cfg.SECCIONES || 'Indus,Agro,General'),
    unidades: lista(cfg.UNIDADES || 'ud,kg,m'),
    emailUrgentes: cfg.EMAIL_URGENTES || '',
  };
}

function cmpLeer_() {
  const sh = cmpSS_().getSheetByName(CMP_HOJA.SOL);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, CMP_CAMPOS.length).getValues().map((r, i) => {
    const o = { _fila: i + 2 };
    CMP_CAMPOS.forEach((c, j) => { o[c[0]] = r[j]; });
    return o;
  }).filter(o => o.id);
}

function cmpSerializar_(o) {
  const tz = Session.getScriptTimeZone();
  const out = {};
  CMP_CAMPOS.forEach(([k]) => {
    let v = o[k];
    if (v instanceof Date) v = Utilities.formatDate(v, tz, CMP_FECHAS_DIA.includes(k) ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm');
    out[k] = (v === null || v === undefined) ? '' : v;
  });
  return out;
}

/** Datos para la web: usuarios, listas y solicitudes abiertas + cerradas de los últimos 60 días */
function cmpDatos() {
  const cfg = cmpConfig_();
  const limite = new Date();
  limite.setDate(limite.getDate() - 60);
  const cerradas = [CMP_ESTADO.RECIBIDA, CMP_ESTADO.RECHAZADA];
  const sols = cmpLeer_()
    .filter(s => !cerradas.includes(s.estado) || !(s.actualizado instanceof Date) || s.actualizado >= limite)
    .map(cmpSerializar_)
    .reverse();
  return {
    usuarios: cmpUsuarios_(),
    secciones: cfg.secciones,
    unidades: cfg.unidades,
    estados: CMP_ESTADO,
    sols: sols,
    historico: cmpHistorico_(),
  };
}

// Catálogo de lo que ya se ha pedido (todas las solicitudes, sin límite de fechas),
// una línea por artículo + referencia con los últimos datos conocidos. Lo usa el buscador
// del formulario «Nueva solicitud».
function cmpHistorico_() {
  const tz = Session.getScriptTimeZone();
  const norm = v => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const mapa = {};
  cmpLeer_().forEach(s => {
    const art = String(s.articulo || '').trim();
    if (!art) return;
    const clave = norm(art) + '|' + norm(s.referencia);
    const h = mapa[clave] || (mapa[clave] = { articulo: art, referencia: '', unidad: '', proveedor: '', precio: '', veces: 0 });
    h.veces++;
    // las filas van en orden de alta: cada una pisa con datos más recientes, sin borrar lo que ya había
    h.articulo = art;
    ['referencia', 'unidad', 'proveedor', 'precio'].forEach(k => { if (s[k] !== '' && s[k] != null) h[k] = s[k]; });
    h.id = s.id; h.seccion = s.seccion || ''; h.estado = s.estado;
    h.ultima = s.fecha instanceof Date ? Utilities.formatDate(s.fecha, tz, 'yyyy-MM-dd') : String(s.fecha || '').slice(0, 10);
  });
  return Object.keys(mapa).map(k => mapa[k]).reverse().slice(0, 800);
}

/* ───────────────────────── Acciones ───────────────────────── */

/**
 * Única puerta de escritura. Devuelve cmpDatos() actualizado.
 * tipo: crear | validar | alternativa | rechazar | proponer | faltaInfo | completar | comprar | recibir | anular
 */
function cmpAccion(tipo, id, datos, nombre) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const u = cmpUsuarios_().find(x => x.nombre === nombre);
    if (!u) throw new Error('Usuario no reconocido. Vuelve a elegir tu nombre.');
    datos = datos || {};
    const ahora = new Date();
    const comentario = String(datos.comentario || '').trim();
    const esResp = u.rol === CMP_ROL.RESP || u.rol === CMP_ROL.ADMIN;
    const esComp = u.rol === CMP_ROL.COMP || u.rol === CMP_ROL.ADMIN;
    const exigir = (cond, msg) => { if (!cond) throw new Error(msg); };

    if (tipo === 'crear') {
      const n = cmpEditables_(datos, ['seccion', 'articulo', 'referencia', 'cantidad', 'unidad', 'proveedor', 'fechaNecesaria', 'urgente', 'motivo']);
      exigir(n.articulo, 'Indica qué material necesitas.');
      exigir(Number(n.cantidad) > 0, 'Indica la cantidad.');
      exigir(n.fechaNecesaria, 'Indica para cuándo lo necesitas.');
      exigir(n.urgente !== 'Sí' || String(n.motivo || '').trim(), 'Si es urgente, explica el motivo (¿para la máquina?).');
      const s = Object.assign({}, n, {
        id: cmpNuevoId_(),
        fecha: ahora,
        seccion: n.seccion || u.seccion || '',
        solicitante: u.nombre,
        urgente: n.urgente === 'Sí' ? 'Sí' : 'No',
        estado: CMP_ESTADO.PENDIENTE,
        asignado: CMP_ROL.RESP,
        comentario: comentario,
        actualizado: ahora,
      });
      const fila = CMP_CAMPOS.map(([k]) => (s[k] === undefined ? '' : s[k]));
      cmpSS_().getSheetByName(CMP_HOJA.SOL).appendRow(fila);
      cmpLog_(s.id, u.nombre, 'Solicitud creada' + (s.urgente === 'Sí' ? ' (URGENTE)' : ''), s.estado, s.motivo || comentario);
      if (s.urgente === 'Sí') cmpAvisoUrgente_(s);
      return cmpDatos();
    }

    const s = cmpLeer_().find(x => x.id === id);
    exigir(s, 'No encuentro la solicitud ' + id + '.');
    let c = {};
    let accion = '';

    switch (tipo) {
      case 'validar': {
        exigir(esResp, 'Solo la responsable de producción valida compras.');
        exigir(s.estado === CMP_ESTADO.PENDIENTE, 'Esta solicitud ya no está pendiente de validar.');
        c = cmpEditables_(datos, ['referencia', 'cantidad', 'unidad', 'proveedor', 'fechaNecesaria', 'precio']);
        const faltan = cmpFaltan_(Object.assign({}, s, c));
        exigir(!faltan.length, 'Para validar falta: ' + faltan.join(', ') + '. Compras necesita estos datos para pedir sin preguntar.');
        Object.assign(c, { estado: CMP_ESTADO.VALIDADA, asignado: CMP_ROL.COMP, validadoPor: u.nombre, fechaValidacion: ahora });
        accion = 'Validada';
        break;
      }
      case 'alternativa': {
        exigir(esResp, 'Solo la responsable de producción puede encargar una búsqueda de alternativa.');
        exigir(s.estado === CMP_ESTADO.PENDIENTE, 'Esta solicitud ya no está pendiente de validar.');
        exigir(datos.asignado, 'Elige qué encargado busca la alternativa.');
        exigir(comentario, 'Explica qué hay que buscar (proveedor, pieza, precio…).');
        c = { estado: CMP_ESTADO.ALTERNATIVA, asignado: String(datos.asignado) };
        accion = 'Encargada búsqueda de alternativa a ' + datos.asignado;
        break;
      }
      case 'rechazar': {
        exigir(esResp, 'Solo la responsable de producción puede rechazar.');
        exigir([CMP_ESTADO.PENDIENTE, CMP_ESTADO.ALTERNATIVA].includes(s.estado), 'Esta solicitud ya no se puede rechazar.');
        exigir(comentario, 'Indica el motivo del rechazo.');
        c = { estado: CMP_ESTADO.RECHAZADA, asignado: '' };
        accion = 'Rechazada';
        break;
      }
      case 'proponer': {
        exigir(s.estado === CMP_ESTADO.ALTERNATIVA, 'Esta solicitud no está en búsqueda de alternativa.');
        exigir(s.asignado === u.nombre || esResp, 'Esta búsqueda está asignada a ' + s.asignado + '.');
        c = cmpEditables_(datos, ['articulo', 'referencia', 'proveedor', 'precio', 'cantidad', 'unidad']);
        exigir(comentario, 'Resume la alternativa que propones.');
        Object.assign(c, { estado: CMP_ESTADO.PENDIENTE, asignado: CMP_ROL.RESP });
        accion = 'Alternativa propuesta';
        break;
      }
      case 'faltaInfo': {
        exigir(esComp, 'Solo Compras puede devolver por falta de información.');
        exigir(s.estado === CMP_ESTADO.VALIDADA, 'Esta solicitud no está pendiente de compra.');
        exigir(comentario, 'Indica qué dato falta.');
        c = { estado: CMP_ESTADO.FALTA_INFO, asignado: s.solicitante };
        accion = 'Devuelta al solicitante por falta de información';
        break;
      }
      case 'completar': {
        exigir(s.estado === CMP_ESTADO.FALTA_INFO, 'Esta solicitud no está pendiente de información.');
        exigir(s.asignado === u.nombre || esResp, 'Esta solicitud está pendiente de ' + s.asignado + '.');
        c = cmpEditables_(datos, ['referencia', 'proveedor', 'cantidad', 'unidad', 'fechaNecesaria', 'precio']);
        exigir(comentario, 'Indica qué has completado.');
        const faltan = cmpFaltan_(Object.assign({}, s, c));
        exigir(!faltan.length, 'Sigue faltando: ' + faltan.join(', ') + '.');
        Object.assign(c, { estado: CMP_ESTADO.VALIDADA, asignado: CMP_ROL.COMP });
        accion = 'Información completada';
        break;
      }
      case 'comprar': {
        exigir(esComp, 'Solo Compras registra la compra.');
        exigir(s.estado === CMP_ESTADO.VALIDADA, 'Esta solicitud no está pendiente de compra.');
        c = cmpEditables_(datos, ['pedidoProv', 'entregaPrevista', 'precio', 'proveedor']);
        exigir(c.entregaPrevista, 'Indica la fecha de entrega prevista.');
        Object.assign(c, { estado: CMP_ESTADO.COMPRADA, asignado: s.solicitante, fechaCompra: ahora });
        accion = 'Comprada' + (c.pedidoProv ? ' (pedido ' + c.pedidoProv + ')' : '');
        break;
      }
      case 'recibir': {
        exigir(s.estado === CMP_ESTADO.COMPRADA, 'Esta solicitud no está pendiente de recibir.');
        c = { estado: CMP_ESTADO.RECIBIDA, asignado: '', fechaRecepcion: ahora, recibidoPor: u.nombre };
        accion = 'Recibida';
        break;
      }
      case 'anular': {
        exigir(s.solicitante === u.nombre || esResp, 'Solo quien la pidió o la responsable pueden anularla.');
        exigir([CMP_ESTADO.PENDIENTE, CMP_ESTADO.ALTERNATIVA, CMP_ESTADO.FALTA_INFO].includes(s.estado), 'Ya no se puede anular: está validada o comprada.');
        c = { estado: CMP_ESTADO.RECHAZADA, asignado: '' };
        accion = 'Anulada por ' + u.nombre;
        break;
      }
      default:
        throw new Error('Acción desconocida: ' + tipo);
    }

    if (comentario) c.comentario = comentario;
    c.actualizado = ahora;
    cmpGuardar_(s, c);
    cmpLog_(s.id, u.nombre, accion, c.estado || s.estado, comentario);
    return cmpDatos();
  } finally {
    lock.releaseLock();
  }
}

/* ───────────────────────── Utilidades ───────────────────────── */

/** Copia sólo los campos permitidos, convirtiendo fechas y números */
function cmpEditables_(datos, permitidos) {
  const out = {};
  permitidos.forEach(k => {
    if (!(k in datos)) return;
    let v = datos[k];
    if (typeof v === 'string') v = v.trim();
    if (CMP_FECHAS_DIA.includes(k)) v = cmpFecha_(v);
    if ((k === 'cantidad' || k === 'precio') && v !== '' && v !== null) {
      v = Number(String(v).replace(',', '.'));
      if (isNaN(v)) throw new Error('El campo ' + k + ' debe ser un número.');
    }
    out[k] = v;
  });
  return out;
}

function cmpFecha_(v) {
  if (!v) return '';
  if (v instanceof Date) return v;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw new Error('Fecha no válida: ' + v);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function cmpFaltan_(s) {
  return CMP_OBLIGATORIOS_COMPRA
    .filter(([k]) => k === 'cantidad' ? !(Number(s[k]) > 0) : !String(s[k] === undefined || s[k] === null ? '' : s[k]).trim())
    .map(([, etiqueta]) => etiqueta);
}

function cmpGuardar_(s, cambios) {
  const sh = cmpSS_().getSheetByName(CMP_HOJA.SOL);
  const final = Object.assign({}, s, cambios);
  const fila = CMP_CAMPOS.map(([k]) => (final[k] === undefined || final[k] === null ? '' : final[k]));
  sh.getRange(s._fila, 1, 1, fila.length).setValues([fila]);
}

function cmpNuevoId_() {
  const props = PropertiesService.getScriptProperties();
  const anio = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yy');
  const clave = 'CMP_SEQ_' + anio;
  const n = Number(props.getProperty(clave) || 0) + 1;
  props.setProperty(clave, String(n));
  return 'SC' + anio + '-' + ('0000' + n).slice(-4);
}

function cmpLog_(id, usuario, accion, estado, comentario) {
  cmpSS_().getSheetByName(CMP_HOJA.HIST).appendRow([new Date(), id, usuario, accion, estado, comentario || '']);
}

function cmpAvisoUrgente_(s) {
  const destino = cmpConfig_().emailUrgentes;
  if (!destino) return;
  try {
    MailApp.sendEmail(destino,
      'URGENTE · Solicitud de compra ' + s.id + ' · ' + s.seccion,
      s.solicitante + ' pide con urgencia:\n\n' +
      '  ' + s.cantidad + ' ' + (s.unidad || '') + ' · ' + s.articulo + (s.referencia ? ' (ref. ' + s.referencia + ')' : '') + '\n' +
      '  Proveedor: ' + (s.proveedor || '—') + '\n' +
      '  Motivo: ' + (s.motivo || '—') + '\n\n' +
      'Valídala desde la app de solicitudes de compra.');
  } catch (err) {
    console.warn('No se pudo enviar el aviso urgente: ' + err);
  }
}
