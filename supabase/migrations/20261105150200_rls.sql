-- Seguridad: igual que el modelo actual (quien tiene el enlace de la app puede leer
-- y actuar; la app es la única que decide quién puede hacer qué, igual que hacía
-- cmpAccion() en Apps Script). Las tablas de negocio solo se escriben a través de
-- las funciones fn_solicitud_accion / fn_t15_accion (SECURITY DEFINER, propiedad de
-- postgres: pasan por encima de RLS). El cliente nunca hace INSERT/UPDATE directo.
--
-- Nota para una Fase 2: esto es una migración 1:1 del modelo de confianza actual,
-- no una mejora de seguridad. Si se quiere autenticación real por persona
-- (Supabase Auth con enlace mágico o PIN por usuario), se puede sustituir el
-- parámetro p_nombre de las funciones por auth.uid() sin tocar el resto.

alter table usuarios enable row level security;
alter table config enable row level security;
alter table contadores enable row level security;
alter table solicitudes enable row level security;
alter table historial enable row level security;
alter table t15_temas enable row level security;
alter table t15_dia enable row level security;
alter table t15_maquinas enable row level security;
alter table kpi_dia_maquina enable row level security;

-- Lectura abierta (como hoy: cualquiera con el enlace de la app puede ver los datos)
create policy sel_usuarios on usuarios for select using (true);
create policy sel_config on config for select using (true);
create policy sel_solicitudes on solicitudes for select using (true);
create policy sel_historial on historial for select using (true);
create policy sel_t15_temas on t15_temas for select using (true);
create policy sel_t15_dia on t15_dia for select using (true);
create policy sel_t15_maquinas on t15_maquinas for select using (true);
create policy sel_kpi_dia_maquina on kpi_dia_maquina for select using (true);

-- Sin políticas de insert/update/delete para anon/authenticated: solo las
-- funciones SECURITY DEFINER (dueño: postgres) pueden escribir.
-- contadores: ni siquiera lectura directa (detalle interno de las funciones).

grant usage on schema public to anon, authenticated;
grant select on usuarios, config, solicitudes, historial, t15_temas, t15_dia, t15_maquinas, kpi_dia_maquina, v_historico_articulos
  to anon, authenticated;
grant execute on function fn_solicitud_accion(text, text, jsonb, text) to anon, authenticated;
grant execute on function fn_t15_accion(text, text, jsonb) to anon, authenticated;
