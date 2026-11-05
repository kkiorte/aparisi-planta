-- Datos reales actuales de la Sheet «Planta APARISI» (Usuarios, Config, T15_Maquinas).
-- Las solicitudes, el historial y los temas del Top 15 que había en la hoja son datos
-- de PRUEBA (la propia hoja incluye una función «reiniciarDatosDePrueba» para borrarlos
-- antes de operar de verdad), así que no se migran: se empieza con esas tablas vacías.
--
-- Nota: en Config, UNIDADES tenía un valor con un espacio y una errata ("caja,rollo,bobina,
-- liltro") — se corrige aquí a "l" (litro).

insert into usuarios (nombre, rol, seccion, activo) values
  ('Responsable producción', 'RESPONSABLE', '', true),
  ('Encargado Indus',        'ENCARGADO',   'Indus', true),
  ('Encargado Agro',         'ENCARGADO',   'Agro', true),
  ('Compras oficina',        'COMPRAS',     '', true);

insert into config (clave, valor, descripcion) values
  ('SECCIONES',      'Industrial,Agro,Mantenimiento,General', 'Lista separada por comas'),
  ('UNIDADES',       'ud,kg,m,caja,rollo,bobina,l',            'Lista separada por comas'),
  ('EMAIL_URGENTES', '',                                       'Email(s) separados por comas que reciben aviso al entrar una solicitud URGENTE. Vacío = sin aviso'),
  ('KPI_SS_ID',       '1AiiZkfdYKvRH88qZjLoWl29L1_Y7VgEFc8TZE4HF9B8', 'ID de la hoja «KPIs APARISI CEPILLOS» de origen (Fase 2: sync a kpi_dia_maquina)'),
  ('OBJ_OEE_INDUS',  '85%', 'Objetivo de OEE de Indus (verde si se alcanza)'),
  ('OBJ_OEE_AGRO',   '85%', 'Objetivo de OEE de Agro (verde si se alcanza)'),
  ('INFORME_URL',    'https://script.google.com/macros/s/AKfycbxP3sofuu3CRT7JN_F-29eCOaTncHI2vUbP_TeasvXDFiT8XQFHMmUvnVyadXN9V_CNdg/exec', 'URL del Dashboard OEE (para abrir el informe diario desde el Top 15)');

insert into t15_maquinas (pestana, nombre, seccion, activa) values
  ('TORNO3',                            'Torno 3',               'Indus', true),
  ('TORNO81',                           'Torno 81',              'Indus', true),
  ('INGLETADORA',                       'Ingletadora',           'Indus', true),
  ('INGLETADORA 2',                     'Ingletadora 2',         'Indus', true),
  ('GEMINI',                            'Gemini',                'Indus', true),
  ('nº19 TALADRO COLUMNA',              'Taladro columna 19',    'Indus', true),
  ('nº16 REC.PLANA GUIAS PARALELAS',    'Rec. plana guías 16',   'Indus', true),
  ('nº7 RECORTADORA CILINDROS',         'Recortadora cilindros 7','Indus', true),
  ('nº8 RECORTADORA PLANA PEINE',       'Recortadora peine 8',   'Indus', true),
  ('nº27 RECORTADORA CILINDROS GHIRBO', 'Ghirbo 27',             'Indus', true),
  ('EMPAQUETADO',                       'Empaquetado',           'Indus', true),
  ('LION70',                            'Lion 70',               'Agro',  true),
  ('LION100',                           'Lion 100',              'Agro',  true),
  ('AW2',                               'AW2',                   'Agro',  true),
  ('AW8',                               'AW8',                   'Agro',  true);
