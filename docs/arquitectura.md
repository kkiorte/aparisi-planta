# Arquitectura

## Resumen

```
Lovable (frontend TypeScript + Tailwind + shadcn/ui)
        │  supabase-js
        ▼
Supabase Postgres (proyecto "aparisi-planta")
  ├── tablas de lectura directa (RLS: select abierto)
  └── 2 funciones RPC (SECURITY DEFINER) = única puerta de escritura
        fn_solicitud_accion(tipo, codigo, datos, nombre)
        fn_t15_accion(tipo, codigo, datos)
```

No hay backend intermedio: el frontend llama a Supabase directamente
(`supabase.from(...).select(...)` para leer, `supabase.rpc(...)` para escribir).
Esto es deliberado — es exactamente el mismo patrón que Apps Script, donde
`Index.html`/`Top15.html` llamaban a `google.script.run.cmpAccion(...)` como
única puerta de escritura y leían el resto directamente.

## Credenciales del proyecto Supabase

- Proyecto: `aparisi-planta` (organización `ebing`, región `eu-west-1`)
- Project ref / ID: `lzbsqnhosqszrkjgsifw`
- URL: `https://lzbsqnhosqszrkjgsifw.supabase.co`
- Clave pública (anon/publishable) — segura para el cliente, es la que usa Lovable:
  `sb_publishable_UOzjFraXcVSO0OMyBzwdKQ_D3XnqOZZ`
- **La clave `service_role` nunca debe usarse en el frontend ni aparecer en este
  repo.** Si se necesita para un script de servidor (p. ej. el import de datos
  o el futuro sync de KPIs), se obtiene desde el panel de Supabase y se guarda
  como variable de entorno, nunca en código ni en commits.

## Esquema (ver `supabase/migrations/` para el detalle exacto)

| Tabla | Qué guarda | Equivalente en la Sheet |
|---|---|---|
| `usuarios` | nombre, rol (`ENCARGADO`/`RESPONSABLE`/`COMPRAS`/`ADMIN`), sección, activo | pestaña Usuarios |
| `config` | clave/valor (secciones, unidades, objetivos OEE, URLs…) | pestaña Config |
| `solicitudes` | cada solicitud de compra, con su `estado` (enum) | pestaña Solicitudes |
| `historial` | log de auditoría de cada solicitud | pestaña Historial |
| `t15_temas` | problemas/acciones de la reunión diaria | pestaña T15_Temas |
| `t15_dia` | plan y avisos del día (una fila por fecha) | pestaña T15_Dia |
| `t15_maquinas` | catálogo de máquinas por sección | pestaña T15_Maquinas |
| `kpi_dia_maquina` | indicadores OEE ya agregados por día+máquina (**vacía hoy**, ver Fase 2) | hoja externa «KPIs APARISI CEPILLOS» |
| `contadores` | contador atómico para generar códigos (SC26-0001, T0001…) | `PropertiesService` del script |

Vista `v_historico_articulos`: catálogo de artículos ya pedidos (para el
autocompletado de "Nueva solicitud"), equivalente a `cmpHistorico_()`.

### Máquina de estados de una solicitud

```
Pendiente validar ──validar──────────────► Validada ──comprar──► Comprada ──recibir──► Recibida
       │  │                                    │
       │  └──alternativa──► Buscar alternativa │
       │                         │  proponer    └──faltaInfo──► Falta información
       │                         └──────────────────────┘             │
       │                                                      completar┘
       └──rechazar / anular──────────────────────────────────────► Rechazada
```

Reglas de quién puede hacer qué (idénticas a `cmpAccion` en `Código.gs`):

- **validar**, **alternativa**, **rechazar** (desde Pendiente/Buscar alternativa): solo rol `RESPONSABLE` (o `ADMIN`).
- **comprar**, **faltaInfo**: solo rol `COMPRAS` (o `ADMIN`).
- **proponer**: el encargado asignado a la búsqueda, o `RESPONSABLE`.
- **completar**: el encargado asignado, o `RESPONSABLE`.
- **recibir**: quien pidió, `ADMIN`, o un `ENCARGADO` de la misma sección.
- **anular**: quien pidió, o `RESPONSABLE` — solo si aún no está validada/comprada.
- Al **validar**, Compras debe tener ya artículo, cantidad, unidad y fecha necesaria
  (si falta algo, la función lanza un error con los campos que faltan — igual que
  `cmpFaltan_`).

## Las dos funciones RPC

### `fn_solicitud_accion(p_tipo, p_codigo, p_datos, p_nombre)`

Única puerta de escritura para `solicitudes`. `p_tipo` es uno de:
`crear | validar | alternativa | rechazar | proponer | faltaInfo | completar | comprar | recibir | anular`.

`p_datos` es un objeto JSON con las mismas claves que mandaba el formulario original
(`articulo`, `cantidad`, `unidad`, `referencia`, `proveedor`, `fechaNecesaria`,
`urgente` ('Sí'/'No'), `motivo`, `comentario`, `asignado`, `precio`, `pedidoProv`,
`entregaPrevista`). Para `crear`, `p_codigo` es `null`. Devuelve la fila actualizada
de `solicitudes`, o lanza una excepción con un mensaje en español listo para
mostrar al usuario (igual que los `throw new Error(...)` del script).

Ejemplo desde el cliente (supabase-js):

```ts
const { data, error } = await supabase.rpc('fn_solicitud_accion', {
  p_tipo: 'crear',
  p_codigo: null,
  p_datos: {
    seccion: 'Indus', articulo: 'Brocas 6mm', cantidad: '10', unidad: 'ud',
    fechaNecesaria: '2026-11-10', urgente: 'No', motivo: '', comentario: ''
  },
  p_nombre: 'Encargado Indus'
});
if (error) toast.error(error.message); // el mensaje ya viene en español, listo para mostrar
```

### `fn_t15_accion(p_tipo, p_codigo, p_datos)`

Única puerta de escritura para `t15_temas` y `t15_dia`. `p_tipo` es uno de:
`guardarDia | nuevoTema | editarTema | comentar | cerrar | reabrir`. No lleva
`p_nombre` porque en el PC de planta compartido no hay usuario identificado
(igual que el `t15Accion` original).

## Modelo de permisos y su límite actual

**Esto es una migración 1:1 del modelo de confianza que ya tenía la app de Apps
Script, no una mejora de seguridad.** Hoy, igual que antes, cualquiera con el
enlace de la app puede leer todo y puede llamar a las funciones RPC pasando el
`nombre` que quiera — la comprobación de rol ocurre *dentro* de la función
(`fn_solicitud_accion` mira el rol del `nombre` recibido), no hay autenticación
real de "quién está al otro lado". Es el mismo riesgo que ya existía: el cliente
elegía su nombre de una lista, sin contraseña.

**Fase 2 (recomendada, no bloqueante para lanzar):** sustituir el parámetro
`p_nombre` por `auth.uid()` usando Supabase Auth (enlace mágico por email, o un
PIN corto por persona) — se cambiaría solo la primera línea de cada función
(`select * into u from usuarios where id = auth.uid()` en vez de `where nombre
= p_nombre`), sin tocar el resto de la lógica.

## Lo que falta: indicadores OEE (Top 15, panel 1)

El Top 15 muestra el OEE de ayer por sección y máquina. En el sistema original
esto se calculaba leyendo en caliente una hoja externa («KPIs APARISI CEPILLOS»,
ID en `config.KPI_SS_ID`) con una pestaña por máquina y fórmulas de Lean
Manufacturing (apertura, neto, rendimiento, calidad). Es un sistema aparte, más
grande, que no se ha migrado en esta fase.

La tabla `kpi_dia_maquina` ya está preparada para recibirlo: una fila por
día+máquina con `ap, ne, base, rend, tot, buenas, malas, paradas (jsonb)`. Para
completar esto hay dos caminos:

1. **Sync programado** (recomendado): un script (Node o Apps Script) que cada
   hora lea la hoja de KPIs y haga `upsert` en `kpi_dia_maquina` vía la API de
   Supabase. Es el mismo cálculo que hacía `t15CalcularKpi_()`.
2. **Migrar también el Dashboard OEE completo** a Supabase — mucho más trabajo,
   fuera del alcance de esta fase.

Mientras no haya datos en `kpi_dia_maquina`, el panel de indicadores del Top 15
debe mostrar simplemente "sin datos todavía", sin romperse.

## Variables de entorno que necesitará el proyecto

```
VITE_SUPABASE_URL=https://lzbsqnhosqszrkjgsifw.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_UOzjFraXcVSO0OMyBzwdKQ_D3XnqOZZ
```

(Lovable, al conectar el proyecto Supabase existente como integración, las
gestiona automáticamente — no hay que pegarlas a mano si se usa esa vía.)
