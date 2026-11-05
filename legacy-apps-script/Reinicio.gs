/**
 * REINICIO DE DATOS · se usa UNA vez, antes de empezar a trabajar de verdad.
 *
 * Borra todo lo introducido durante las pruebas y deja la numeración a cero:
 *   · Compras: pestañas Solicitudes e Historial  → la próxima solicitud será SC26-0001
 *   · Top 15:  pestañas T15_Temas y T15_Dia      → el próximo tema será T0001
 *
 * NO toca: Usuarios, Config, T15_Maquinas ni los indicadores (T15_Cache), que salen
 * de la hoja de KPIs y son datos reales.
 *
 * Antes de borrar guarda una copia completa de la hoja en tu Drive
 * («Planta APARISI · copia antes del reinicio …»), por si hiciera falta recuperar algo.
 *
 * Cómo usarlo: elige «reiniciarDatosDePrueba» en el desplegable de funciones → Ejecutar.
 * Después puedes borrar este archivo del proyecto.
 */
function reiniciarDatosDePrueba() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = Session.getScriptTimeZone();

  // 1) copia de seguridad
  const copia = ss.copy(ss.getName() + ' · copia antes del reinicio ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm'));

  // 2) vaciar los datos (se conserva la fila de títulos)
  const hojas = ['Solicitudes', 'Historial', 'T15_Temas', 'T15_Dia'];
  const resumen = [];
  hojas.forEach(nombre => {
    const sh = ss.getSheetByName(nombre);
    if (!sh) { resumen.push(nombre + ': no existe'); return; }
    const filas = sh.getLastRow() - 1;
    if (filas > 0) sh.getRange(2, 1, filas, Math.max(1, sh.getLastColumn())).clearContent();
    resumen.push(nombre + ': ' + Math.max(0, filas) + ' filas borradas');
  });

  // 3) numeración a cero
  const props = PropertiesService.getScriptProperties();
  Object.keys(props.getProperties())
    .filter(k => k.indexOf('CMP_SEQ_') === 0 || k === 'T15_SEQ')
    .forEach(k => props.deleteProperty(k));

  const txt = 'Reinicio hecho.\n' + resumen.join('\n') + '\nNumeración a cero.\nCopia de seguridad: ' + copia.getUrl();
  console.log(txt);
  return txt;
}
