# Sync de OEE (Fase 2) — procedimiento

Rellena `kpi_dia_maquina` en Supabase a partir de la hoja externa
«KPIs APARISI CEPILLOS» (`1AiiZkfdYKvRH88qZjLoWl29L1_Y7VgEFc8TZE4HF9B8`),
replicando exactamente la lógica de `t15CalcularKpi_()` en
`legacy-apps-script/Top15Codigo.gs`. Pensado para ejecutarse una vez al día
(o cada hora, como hacía el disparador original `t15PrecalcularKpi`) desde
una tarea programada que tenga los conectores de Google Sheets y de Supabase.

No existe acceso de red directo (curl/node) a `sheets.googleapis.com` ni a
`*.supabase.co` desde el entorno de ejecución — todo pasa por las
herramientas MCP `Google_Sheets` y `Supabase`, no por peticiones HTTP
sueltas.

## 1. Máquinas a sincronizar

Vienen de `t15_maquinas` en Supabase (`select pestana, nombre, seccion from
t15_maquinas where activa`). Cada `pestana` es el nombre exacto de una
pestaña en la hoja de KPIs (ojo: hay pestañas duplicadas con prefijo "M "
de una versión antigua — **no se usan**, solo las que coinciden
literalmente con `pestana`).

## 2. Por cada máquina: localizar los datos recientes

1. Pedir `gridProperties.rowCount` de la pestaña (`get_spreadsheet`,
   `fields: ["sheets.properties.title","sheets.properties.gridProperties.rowCount"]`).
2. Leer la cabecera: `{pestana}!A1:Z1`.
3. Leer un tramo final generoso para cubrir como mínimo los últimos 10-14
   días: `{pestana}!A{max(2, rowCount-150)}:AU{rowCount}` (hasta la columna
   AU inclusive — ahí vive el coeficiente, ver más abajo). Si todas las filas
   vienen vacías, esa máquina no tiene actividad reciente: se omite.

## 3. Detectar columnas por nombre de cabecera (no por posición fija)

A partir de la cabecera (fila 1, columnas A-Z), en mayúsculas y sin acentos:

- `iFecha` = posición de la columna `FECHA` (separador entre el formulario y
  el bloque calculado).
- `col.dia` = posición de `DIA`.
- `col.malas` = posición de `UDS MALAS`.
- `col.motivo` = posición de `MOTIVO AVERIA`.
- `col.desc` = primera columna **antes** de `iFecha` cuyo nombre empieza por
  `DESCANSO`.
- `paradas[]` = todas las columnas antes de `iFecha` cuyo nombre termina en
  `(MIN)` y no empieza por `DESCANSO` (p. ej. "PREPARACION MAQUINA (min)",
  "ACEITE (min)", "AVERIA (min)"...). El nombre visible de cada una sale de
  quitar el sufijo " (min)" y capitalizar (ver tabla de etiquetas en
  `t15Capitalizar_`/`T15_ETIQUETAS` del script original).

Estas cuatro columnas son **fijas en posición** en todas las pestañas de
máquina (verificado): `FECHA` en la columna V (índice 21, 0-based),
`TIEMPO APERTURA (min)` en W (22) = AP, `TIEMPO NETO (min)` en X (23) = NE,
`UDS TOT` en Y (24) = TOT, `UDS BUENAS` (la segunda, la del bloque
calculado) en Z (25) = OK.

**Coeficiente** (`coef`): columna AU (índice 46, 0-based) — confirmado
leyendo `{pestana}!AU2:AU51`. Es un valor único por máquina (no por lote):
se toma el primer valor mayor que 0 en las filas 2-51; si no hay ninguno,
`coef = 0`. `rend = min(1, 1 / (coef || 1))` — con `coef` vacío, `rend = 1`
(sin penalización), igual que hacía el script original.

No confundir con las columnas AA-AE que aparecen rellenas en algunas
pestañas (TORNO3, LION100...): son un cálculo propio de esa hoja ajeno a
`t15CalcularKpi_` y no se usan aquí.

## 4. Por cada fila de datos (lote)

Filtrar filas sin `DIA` o sin `TIEMPO APERTURA` (ambas obligatorias).
Para cada fila válida:

```
ap    = número(col AP)                          (vacío → 0)
ne    = número(col NE)                           (vacío → 0)
desc  = número(col DESCANSO)                      (vacío → 0)
base  = max(ap − desc, ne)
tot   = número(col TOT)                           (vacío → 0)
buenas= número(col OK)                            (vacío → 0)
malas = número(col UDS MALAS)                     (vacío → 0)
motivo= texto(col MOTIVO AVERIA)                  (vacío → '')
paradas = { nombre_capitalizado: minutos, ... }   (solo las columnas > 0)
```

Los números vienen en formato español (coma decimal, a veces con `%`): quitar
`%`, y si tiene coma, quitar puntos de millar y cambiar la coma por punto
antes de convertir a número.

## 5. Agregar por día + máquina

Agrupar las filas del lote por `DIA` (solo días **anteriores a hoy** — el día
en curso no se cierra todavía) y máquina, sumando:

```
ap, ne, base, tot, buenas, malas  → suma directa
rend                               → (Σ rend_fila × base_fila) / Σ base   [rend_fila es el mismo para toda la máquina, así que esto es solo 'rend']
paradas                            → suma por nombre de parada
motivo                             → concatenar los motivos no vacíos del día, separados por "; " (o dejar vacío si ninguno)
```

## 6. Upsert en Supabase

Por cada (día, máquina, sección) con datos, ejecutar (vía `execute_sql`,
*no* `apply_migration` — esto es una escritura de datos, no un cambio de
esquema):

```sql
insert into kpi_dia_maquina (dia, maquina, seccion, ap, ne, base, rend, tot, buenas, malas, motivo, paradas, actualizado)
values ('{dia}', '{nombre_maquina}', '{seccion}', {ap}, {ne}, {base}, {rend}, {tot}, {buenas}, {malas}, '{motivo}', '{paradas_jsonb}', now())
on conflict (dia, maquina) do update set
  seccion = excluded.seccion, ap = excluded.ap, ne = excluded.ne, base = excluded.base,
  rend = excluded.rend, tot = excluded.tot, buenas = excluded.buenas, malas = excluded.malas,
  motivo = excluded.motivo, paradas = excluded.paradas, actualizado = excluded.actualizado;
```

Es idempotente: ejecutar esto varias veces al día no duplica nada, solo
mantiene el día actualizado con los últimos datos capturados en la hoja.

## 7. Estado de los datos (a 5/11/2026)

De las 15 máquinas activas, solo **Torno 3** (Indus) y **Lion 70** (Agro)
tienen lotes registrados en los últimos días; el resto de pestañas de
máquina están vacías de un tiempo a esta parte (no es un fallo del sync:
la planta simplemente no está registrando lotes ahí). **Lion 100** tiene
huecos (p. ej. sin ningún lote el 4/11/2026). El panel de Top 15 debe
mostrar con naturalidad "sin datos" para una máquina/día sin lotes, no un
cero engañoso.

Primer backfill hecho a mano (5/11/2026) para el día 2026-11-04:

| Máquina | Sección | AP | NE | Base | TOT | Buenas | OEE aprox. |
|---|---|---|---|---|---|---|---|
| Torno 3 | Indus | 160 | 149 | 160 | 4 | 4 | ~93% |
| Lion 70 | Agro | 297 | 277 | 287 | 258 | 258 | ~97% |

## 8. Cadencia

Tarea programada cada hora (igual que `t15InstalarActualizacion` en el
script original), para que los datos capturados en el turno de mañana
aparezcan en la reunión del día siguiente sin intervención manual.
