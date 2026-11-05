-- APARISI CEPILLOS · Planta — esquema base
-- Migración desde Google Sheets / Apps Script (ebing · Lean & Digital)

create extension if not exists pgcrypto;
create extension if not exists unaccent;

-- ───────────────────────── Enums ─────────────────────────

create type usuario_rol as enum ('ENCARGADO', 'RESPONSABLE', 'COMPRAS', 'ADMIN');

create type solicitud_estado as enum (
  'Pendiente validar',
  'Buscar alternativa',
  'Validada',
  'Falta información',
  'Comprada',
  'Recibida',
  'Rechazada'
);

create type tema_estado as enum ('Abierta', 'Hecha');

-- ───────────────────────── Usuarios y configuración ─────────────────────────

create table usuarios (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  rol        usuario_rol not null,
  seccion    text not null default '',
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

create table config (
  clave       text primary key,
  valor       text not null default '',
  descripcion text not null default ''
);

-- contador atómico para generar códigos (SC26-0001, T0001…), reemplaza
-- PropertiesService.getScriptProperties() del script original
create table contadores (
  clave text primary key,
  valor bigint not null default 0
);

-- ───────────────────────── Solicitudes de compra ─────────────────────────

create table solicitudes (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique,              -- SC26-0001
  fecha             timestamptz not null default now(),
  seccion           text not null default '',
  solicitante       text not null,
  articulo          text not null,
  referencia        text not null default '',
  cantidad          numeric not null,
  unidad            text not null default '',
  proveedor         text not null default '',
  fecha_necesaria   date,
  urgente           boolean not null default false,
  motivo            text not null default '',
  estado            solicitud_estado not null default 'Pendiente validar',
  asignado          text not null default '',          -- rol (RESPONSABLE/COMPRAS) o nombre de encargado/solicitante
  validado_por      text not null default '',
  fecha_validacion  timestamptz,
  precio            numeric,
  pedido_prov       text not null default '',
  fecha_compra      timestamptz,
  entrega_prevista  date,
  fecha_recepcion   timestamptz,
  recibido_por      text not null default '',
  comentario        text not null default '',
  actualizado       timestamptz not null default now()
);
create index idx_solicitudes_estado on solicitudes (estado);
create index idx_solicitudes_seccion on solicitudes (seccion);
create index idx_solicitudes_actualizado on solicitudes (actualizado desc);

create table historial (
  id               uuid primary key default gen_random_uuid(),
  fecha            timestamptz not null default now(),
  solicitud_codigo text not null,
  usuario          text not null,
  accion           text not null,
  estado_nuevo     text,
  comentario       text not null default ''
);
create index idx_historial_codigo on historial (solicitud_codigo);

-- ───────────────────────── Top 15 (reunión diaria) ─────────────────────────

create table t15_temas (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique,               -- T0001
  alta              timestamptz not null default now(),
  seccion           text not null default 'General',
  problema          text not null default '',
  accion            text not null default '',
  responsable       text not null default '',
  fecha_compromiso  date,
  estado            tema_estado not null default 'Abierta',
  comentarios       text not null default '',
  cierre            timestamptz,
  actualizado       timestamptz not null default now()
);
create index idx_t15_temas_estado on t15_temas (estado);

create table t15_dia (
  fecha            date primary key default current_date,
  plan_indus       text not null default '',
  plan_agro        text not null default '',
  resp_expedicion  text not null default '',
  personal         text not null default '',
  avisos           text not null default '',
  actualizado      timestamptz not null default now()
);

create table t15_maquinas (
  pestana  text primary key,       -- nombre de la pestaña en la hoja de KPIs
  nombre   text not null,
  seccion  text not null,
  activa   boolean not null default true
);

-- Puente con el sistema de OEE (hoja de KPIs): un sync diario (Fase 2) escribe aquí
-- los indicadores ya agregados por máquina/día. Sustituye a T15_Cache.
create table kpi_dia_maquina (
  dia         date not null,
  maquina     text not null,
  seccion     text not null,
  ap          numeric,  -- minutos de apertura
  ne          numeric,  -- minutos netos
  base        numeric,
  rend        numeric,
  tot         numeric,  -- unidades totales
  buenas      numeric,
  malas       numeric,
  motivo      text default '',
  paradas     jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now(),
  primary key (dia, maquina)
);
