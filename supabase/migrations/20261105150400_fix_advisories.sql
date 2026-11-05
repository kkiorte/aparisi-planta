-- Corrige los avisos de seguridad del linter que sí son arreglables sin cambiar
-- el modelo de confianza (ver nota en 20261105150200_rls.sql): search_path fijo
-- en las funciones de contador, la extensión unaccent fuera de public, y la
-- vista de histórico como SECURITY INVOKER (respeta RLS del usuario que consulta,
-- no la del creador).
--
-- Quedan dos avisos INTENCIONADOS tras esta migración (anon/authenticated pueden
-- ejecutar fn_solicitud_accion y fn_t15_accion): es el mismo modelo de confianza
-- que tenía la app de Apps Script — cualquiera con el enlace puede actuar, y la
-- función comprueba el rol por dentro. Ver docs/arquitectura.md para el plan de
-- autenticación real (Fase 2).

create schema if not exists extensions;
alter extension unaccent set schema extensions;

set search_path = public, extensions;

create or replace function fn_nuevo_codigo_solicitud() returns text
language plpgsql
set search_path = public
as $$
declare
  anio text := to_char(now(), 'YY');
  clave text := 'SC_' || anio;
  n bigint;
begin
  insert into contadores (clave, valor) values (clave, 1)
  on conflict (clave) do update set valor = contadores.valor + 1
  returning valor into n;
  return 'SC' || anio || '-' || lpad(n::text, 4, '0');
end;
$$;

create or replace function fn_nuevo_codigo_tema() returns text
language plpgsql
set search_path = public
as $$
declare
  n bigint;
begin
  insert into contadores (clave, valor) values ('T15_SEQ', 1)
  on conflict (clave) do update set valor = contadores.valor + 1
  returning valor into n;
  return 'T' || lpad(n::text, 4, '0');
end;
$$;

create or replace function fn_solicitud_faltan(s solicitudes) returns text[]
language plpgsql immutable
set search_path = public
as $$
declare
  faltan text[] := '{}';
begin
  if coalesce(btrim(s.articulo), '') = '' then faltan := array_append(faltan, 'artículo'); end if;
  if s.cantidad is null or s.cantidad <= 0 then faltan := array_append(faltan, 'cantidad'); end if;
  if coalesce(btrim(s.unidad), '') = '' then faltan := array_append(faltan, 'unidad'); end if;
  if s.fecha_necesaria is null then faltan := array_append(faltan, 'fecha necesaria'); end if;
  return faltan;
end;
$$;

drop view if exists v_historico_articulos;
create view v_historico_articulos
with (security_invoker = true)
as
select distinct on (lower(extensions.unaccent(articulo)), lower(extensions.unaccent(coalesce(referencia, ''))))
  codigo, articulo, referencia, unidad, proveedor, precio, seccion, estado,
  fecha::date as ultima,
  count(*) over (partition by lower(extensions.unaccent(articulo)), lower(extensions.unaccent(coalesce(referencia, '')))) as veces
from solicitudes
order by lower(extensions.unaccent(articulo)), lower(extensions.unaccent(coalesce(referencia, ''))), fecha desc;

grant select on v_historico_articulos to anon, authenticated;
