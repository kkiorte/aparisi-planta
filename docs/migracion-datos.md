# Migración de datos: qué se trajo y qué no

## Resumen

| Origen (Sheet) | Destino (Supabase) | ¿Se migró? |
|---|---|---|
| `Usuarios` | `usuarios` | **Sí** — 4 filas reales |
| `Config` | `config` | **Sí** — 7 claves reales (con una errata corregida) |
| `T15_Maquinas` | `t15_maquinas` | **Sí** — 15 máquinas reales |
| `Solicitudes` | `solicitudes` | **No** — eran datos de prueba |
| `Historial` | `historial` | **No** — eran datos de prueba |
| `T15_Temas` | `t15_temas` | **No** — eran datos de prueba |
| `T15_Dia` | `t15_dia` | **No** — eran datos de prueba |
| Hoja «KPIs APARISI CEPILLOS» | `kpi_dia_maquina` | **No** — Fase 2, tabla creada vacía |

## Por qué no se migraron Solicitudes/Historial/T15_Temas/T15_Dia

Al revisar las filas existentes en la Sheet, su contenido es claramente de
prueba: entradas como `"324kl2jr´2oljfwopf"`, `"prueba"` o `"Reprueba"` en
campos de artículo, motivo y comentario. Esto coincide con un detalle del
propio script original: existe una función `reiniciarDatosDePrueba()`
(ver `legacy-apps-script/Reinicio.gs`) pensada exactamente para borrar este
tipo de datos antes de poner la aplicación en producción real. Es decir, el
propio sistema anterior ya daba por hecho que estas filas no eran para
conservar.

Por eso se decidió empezar estas cuatro tablas vacías en Supabase, en vez de
arrastrar datos de prueba a la base de datos nueva. Si al revisar esto se
confirma que alguna fila SÍ era real (por ejemplo, alguna solicitud concreta
que de verdad se hizo), se puede insertar a mano con una migración adicional
— decírmelo y la preparo.

## Qué sí se migró y de dónde salió

- **`usuarios`** (4 filas): nombre, rol y sección tal cual estaban en la
  pestaña `Usuarios` de la Sheet.
- **`config`** (7 claves): tal cual estaban en la pestaña `Config`, con una
  corrección: `UNIDADES` tenía el valor `"caja,rollo,bobina,liltro"` (con una
  errata, "liltro" en vez de "litro" y mal separado) — se guardó como
  `"ud,kg,m,caja,rollo,bobina,l"`. Si "l" no es la abreviatura que se prefiere
  para litro, se cambia en un segundo.
- **`t15_maquinas`** (15 filas): catálogo de máquinas de Indus y Agro, tal
  cual estaba en `T15_Maquinas`.

## Fase 2: indicadores OEE

La tabla `kpi_dia_maquina` existe pero está vacía. Ver `docs/arquitectura.md`
→ "Lo que falta: indicadores OEE" para el plan de cómo rellenarla desde la
hoja «KPIs APARISI CEPILLOS» cuando se decida abordar esa fase.
