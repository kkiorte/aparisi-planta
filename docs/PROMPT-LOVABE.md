# Prompt para Lovable — App de planta APARISI CEPILLOS

> Instrucciones de uso: este documento es el prompt completo. Se puede pegar
> tal cual como mensaje inicial de un proyecto nuevo en Lovable, o enviarlo
> por partes (primero el bloque "0. Conexión a Supabase" y "1. Resumen",
> luego cada pantalla como mensaje de seguimiento). No crear una base de
> datos nueva desde Lovable: el backend ya existe y está migrado.

---

## 0. Conexión a Supabase (backend ya existe — NO crear uno nuevo)

Este proyecto se conecta a un backend de Supabase que **ya está construido,
con el esquema y toda la lógica de negocio aplicados**. No uses la opción de
Lovable de "crear/activar base de datos" (eso aprovisionaría un Supabase
nuevo y vacío) — conecta el proyecto existente como integración:

- URL del proyecto: `https://lzbsqnhosqszrkjgsifw.supabase.co`
- Clave pública (publishable/anon), segura para el cliente:
  `sb_publishable_UOzjFraXcVSO0OMyBzwdKQ_D3XnqOZZ`

El cliente de Supabase en el frontend solo debe:
- **Leer** con `select` directo sobre las tablas (RLS ya permite lectura
  abierta de todo lo necesario).
- **Escribir** únicamente llamando a dos funciones RPC:
  `fn_solicitud_accion(p_tipo, p_codigo, p_datos, p_nombre)` y
  `fn_t15_accion(p_tipo, p_codigo, p_datos)`.

Nunca hagas `insert`/`update`/`delete` directo sobre `solicitudes`,
`historial`, `t15_temas` o `t15_dia` — no está permitido por RLS y fallaría;
además rompería la lógica de negocio (validaciones, códigos, roles) que vive
dentro de las funciones RPC. Toda acción de escritura pasa por una de esas
dos funciones.

Tipos de datos a generar (TypeScript) deben reflejar el esquema real; genera
los tipos desde el proyecto Supabase conectado en vez de adivinarlos.

---

## 1. Resumen de la aplicación

Es la app de planta de APARISI CEPILLOS (fabricante de cepillos industriales,
secciones **Indus** y **Agro**). Tiene dos partes, que comparten el mismo
proyecto y la misma pantalla de inicio:

1. **Compras** — gestión de solicitudes de material: un encargado de planta
   pide algo, el responsable de producción lo valida, compras lo compra, y
   se marca como recibido cuando llega. Es un circuito con estados.
2. **Top 15** — la reunión diaria de inicio de turno en una pantalla
   compartida (TV o PC de planta): indicadores de producción de ayer,
   problemas/acciones abiertas, plan del día y avisos.

No hay login con contraseña. Al entrar, se elige el propio nombre de una
lista (ver pantalla "Inicio" abajo) — ese nombre es lo que se manda como
`p_nombre` a las funciones de Compras y determina qué puede hacer cada
persona (su rol se mira dentro de la base de datos).

Tono visual: limpio, industrial, legible desde lejos en el caso del Top 15
(se ve en una pantalla de planta, no de cerca). Usa el logo de la empresa
(`Logo_125px_Color-8.png`, adjunto al proyecto) en la cabecera. Colores
sobrios; el color con significado se reserva para los estados (ver más abajo
la paleta de estados) y para el semáforo de OEE.

---

## 2. Pantalla "Inicio" — selección de usuario

- Lista de personas activas, leída de `usuarios` (`activo = true`), mostrando
  nombre y rol.
- Al elegir una persona, guarda su nombre en el estado de la app (localStorage
  está bien, es solo para no repetir la selección en la misma sesión de
  navegador) y ofrece ir a **Compras** o a **Top 15**.
- Esto no es autenticación real — cualquiera puede elegir cualquier nombre.
  Es intencionado (ver `docs/arquitectura.md`, sección "Modelo de permisos").
  No añadas contraseña ni email de verdad: no forma parte de esta fase.

---

## 3. Compras

### 3.1 Bandeja / vista principal

Vista tipo **kanban**, una columna por estado, en este orden:

```
Pendiente validar → Validada → Comprada → Recibida
         ↘ Buscar alternativa ↘ Falta información
                 (ambas vuelven al circuito o acaban en Rechazada)
```

Columna aparte o filtro para `Rechazada` (son solicitudes cerradas, no deben
ocupar espacio visual permanente — por defecto ocultas, con un filtro
"mostrar rechazadas").

Cada tarjeta muestra: código (`SC26-0001` estilo), artículo, cantidad +
unidad, sección, quién la pidió, si es urgente (marca visual, p. ej. borde o
etiqueta roja), fecha necesaria. Click en la tarjeta abre el detalle.

Filtros útiles encima del tablero: por sección (Industrial/Agro/
Mantenimiento/General — vienen de `config.SECCIONES`), por "solo mías"
(solicitadas por el usuario activo), por urgentes.

Paleta sugerida por estado (ajustable, pero mantén la lógica semántica):
- Pendiente validar: gris/amarillo neutro
- Buscar alternativa / Falta información: naranja (requiere acción)
- Validada: azul
- Comprada: morado o azul oscuro
- Recibida: verde
- Rechazada: rojo apagado / gris

### 3.2 Nueva solicitud

Formulario accesible desde un botón destacado. Campos:
- Sección (desplegable de `config.SECCIONES`)
- Artículo (texto, **con autocompletado** contra `v_historico_articulos` —
  al escribir, sugiere artículos ya pedidos antes, y si se elige uno,
  rellena automáticamente referencia/unidad/proveedor habituales)
- Cantidad + unidad (desplegable de `config.UNIDADES`)
- Referencia (opcional)
- Fecha necesaria
- Urgente (sí/no) — si es "sí", se resalta claramente que se avisará a compras
- Motivo / comentario (texto libre, opcional salvo que sea obligatorio según
  la validación del backend)

Al enviar, llama a:
```ts
supabase.rpc('fn_solicitud_accion', {
  p_tipo: 'crear', p_codigo: null, p_datos: {...campos...}, p_nombre: usuarioActivo
})
```
Si `error`, muestra `error.message` tal cual (ya viene en español, listo para
el usuario) — no lo traduzcas ni lo reformules.

### 3.3 Detalle de una solicitud y acciones

Al abrir una tarjeta, panel/modal con todos los campos, el historial de esa
solicitud (de la tabla `historial`, orden cronológico, como un log de
auditoría visible), y **solo los botones de acción que correspondan al
estado actual y al rol del usuario activo**:

| Estado actual | Acción | Quién puede | Pasa a |
|---|---|---|---|
| Pendiente validar | Validar | RESPONSABLE / ADMIN | Validada |
| Pendiente validar | Buscar alternativa | RESPONSABLE / ADMIN | Buscar alternativa |
| Pendiente validar | Rechazar | RESPONSABLE / ADMIN | Rechazada |
| Pendiente validar | Anular | quien la pidió / RESPONSABLE | Rechazada |
| Buscar alternativa | Proponer alternativa | encargado asignado / RESPONSABLE | (vuelve a validar) |
| Validada | Comprar | COMPRAS / ADMIN | Comprada |
| Validada | Falta información | COMPRAS / ADMIN | Falta información |
| Falta información | Completar información | encargado asignado / RESPONSABLE | Validada |
| Comprada | Recibir | quien la pidió / ADMIN / encargado de la sección | Recibida |

Cada acción abre su propio mini-formulario si necesita datos (p. ej.
"Comprar" puede pedir precio/proveedor/entrega prevista; "Validar" exige que
ya existan artículo+cantidad+unidad+fecha, si falta algo el backend devuelve
el error con los campos que faltan — muéstralo tal cual) y llama a
`fn_solicitud_accion` con el `p_tipo` correspondiente, el `p_codigo` de esa
solicitud, los `p_datos` del mini-formulario, y `p_nombre` del usuario activo.

No construyas en el frontend la lógica de "quién puede hacer qué" más allá de
mostrar/ocultar botones como ayuda visual — la validación real y definitiva
ya la hace la función RPC (si alguien fuerza una acción no permitida, el
backend la rechaza con un mensaje claro). El frontend solo debe mostrar ese
mensaje de error si ocurre.

### 3.4 Catálogo / histórico de artículos (apoyo a "Nueva solicitud")

Consulta de `v_historico_articulos` (vista ya creada) para el autocompletado
del punto 3.2. Trae `articulo, referencia, unidad, proveedor, precio, veces`
(nº de veces pedido) — úsalo para ordenar las sugerencias por frecuencia.

---

## 4. Top 15 — reunión diaria

Pantalla pensada para proyectarse o verse en un PC de planta durante la
reunión de inicio de turno (~15 minutos, de ahí el nombre). Tres bloques:

### 4.1 Indicadores de ayer (OEE)

Panel por máquina (de `t15_maquinas`, agrupadas por sección Indus/Agro),
leyendo de `kpi_dia_maquina` el registro del día de ayer. **Hoy esta tabla
está vacía** (ver `docs/arquitectura.md` → Fase 2) — construye el panel para
que funcione en cuanto haya datos, pero que hoy muestre un estado vacío claro
("Sin datos de OEE todavía para esta fecha") en vez de romperse o mostrar
ceros engañosos.

Cuando haya datos: muestra el OEE de cada máquina con semáforo contra el
objetivo de su sección (`config.OBJ_OEE_INDUS` / `OBJ_OEE_AGRO`, ambos "85%"
hoy) — verde si lo alcanza, rojo si no.

### 4.2 Problemas y acciones (temas)

Lista de `t15_temas` (filtrable por abierta/hecha — enum `tema_estado`).
Cada tema: descripción, quién lo abrió, comentarios (hilo), y botones
cerrar/reabrir. Botón "Nuevo tema" (abre con `fn_t15_accion('nuevoTema', ...)`
), editar (`'editarTema'`), comentar (`'comentar'`), cerrar (`'cerrar'`),
reabrir (`'reabrir'`). Ninguna de estas acciones lleva `p_nombre` — es un
PC compartido de planta, no hay usuario identificado en esta pantalla
(a diferencia de Compras).

### 4.3 Plan del día y avisos

Una fila por fecha en `t15_dia` (plan de producción del día, avisos
generales). Acción `guardarDia` vía `fn_t15_accion` para crear/actualizar la
fila del día.

### 4.4 Resumen de compras

Pequeño resumen de cuántas solicitudes hay pendientes de validar / compradas
pendientes de recibir / urgentes abiertas — cuenta simple sobre `solicitudes`
agrupando por `estado`, para que en la reunión se vea de un vistazo si hay
algo de compras esperando.

---

## 5. Qué NO construir en esta fase

- Autenticación real (login con email/contraseña, Supabase Auth) — queda para
  Fase 2, documentada en `docs/arquitectura.md`.
- El cálculo o sync de OEE desde la hoja de KPIs — fuera de alcance; la tabla
  `kpi_dia_maquina` ya está lista para recibirlo cuando se construya ese
  sync por separado.
- Cualquier escritura directa a las tablas de negocio que no pase por
  `fn_solicitud_accion` / `fn_t15_accion`.

---

## 6. Checklist de aceptación

- [ ] Pantalla Inicio lista usuarios activos y deja elegir uno, navegando a Compras o Top 15.
- [ ] Compras: kanban por estado, nueva solicitud con autocompletado de artículo, detalle con historial y acciones correctas según estado+rol.
- [ ] Todas las escrituras de Compras pasan por `fn_solicitud_accion`; los errores se muestran tal cual los devuelve el backend.
- [ ] Top 15: panel OEE con estado vacío correcto, temas con hilo de comentarios, plan del día, resumen de compras.
- [ ] Todas las escrituras de Top 15 pasan por `fn_t15_accion`.
- [ ] Ninguna clave `service_role` de Supabase aparece en el código del frontend.
