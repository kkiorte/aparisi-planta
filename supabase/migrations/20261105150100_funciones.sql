-- Funciones de negocio: replican, campo a campo, las reglas de cmpAccion() y
-- t15Accion() del script original (Código.gs / Top15Codigo.gs). Son el único
-- camino de escritura para solicitudes y temas del Top 15 — el frontend nunca
-- hace INSERT/UPDATE directo sobre esas tablas (ver RLS en la siguiente migración).

-- ───────────────────────── Generadores de código ─────────────────────────

create or replace function fn_nuevo_codigo_solicitud() returns text
language plpgsql
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

-- ───────────────────────── Solicitudes de compra ─────────────────────────

-- Datos que Compras necesita para pedir sin preguntar (CMP_OBLIGATORIOS_COMPRA)
create or replace function fn_solicitud_faltan(s solicitudes) returns text[]
language plpgsql immutable
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

-- Única puerta de escritura para solicitudes. tipo:
--   crear | validar | alternativa | rechazar | proponer | faltaInfo | completar | comprar | recibir | anular
-- p_datos trae las claves igual que las mandaba Index.html (articulo, cantidad, fechaNecesaria, asignado, comentario…)
create or replace function fn_solicitud_accion(
  p_tipo   text,
  p_codigo text,
  p_datos  jsonb,
  p_nombre text
) returns solicitudes
language plpgsql
security definer
set search_path = public
as $$
declare
  u usuarios;
  s solicitudes;
  es_resp boolean;
  es_comp boolean;
  comentario text;
  accion text := '';
  nueva_cantidad numeric;
  faltan text[];
  codigo_nuevo text;
begin
  select * into u from usuarios where nombre = p_nombre and activo limit 1;
  if u is null then
    raise exception 'Usuario no reconocido. Vuelve a elegir tu nombre.';
  end if;

  es_resp := u.rol in ('RESPONSABLE', 'ADMIN');
  es_comp := u.rol in ('COMPRAS', 'ADMIN');
  comentario := btrim(coalesce(p_datos->>'comentario', ''));

  if p_tipo = 'crear' then
    if coalesce(btrim(p_datos->>'articulo'), '') = '' then
      raise exception 'Indica qué material necesitas.';
    end if;
    nueva_cantidad := nullif(replace(coalesce(p_datos->>'cantidad', '0'), ',', '.'), '')::numeric;
    if nueva_cantidad is null or nueva_cantidad <= 0 then
      raise exception 'Indica la cantidad.';
    end if;
    if coalesce(p_datos->>'fechaNecesaria', '') = '' then
      raise exception 'Indica para cuándo lo necesitas.';
    end if;
    if (coalesce(p_datos->>'urgente', 'No') = 'Sí') and coalesce(btrim(p_datos->>'motivo'), '') = '' then
      raise exception 'Si es urgente, explica el motivo (¿para la máquina?).';
    end if;

    codigo_nuevo := fn_nuevo_codigo_solicitud();

    insert into solicitudes (
      codigo, fecha, seccion, solicitante, articulo, referencia, cantidad, unidad,
      proveedor, fecha_necesaria, urgente, motivo, estado, asignado, comentario, actualizado
    ) values (
      codigo_nuevo, now(),
      coalesce(nullif(btrim(p_datos->>'seccion'), ''), u.seccion, ''),
      u.nombre,
      btrim(p_datos->>'articulo'),
      coalesce(btrim(p_datos->>'referencia'), ''),
      nueva_cantidad,
      coalesce(btrim(p_datos->>'unidad'), ''),
      coalesce(btrim(p_datos->>'proveedor'), ''),
      (p_datos->>'fechaNecesaria')::date,
      (coalesce(p_datos->>'urgente', 'No') = 'Sí'),
      coalesce(btrim(p_datos->>'motivo'), ''),
      'Pendiente validar',
      'RESPONSABLE',
      comentario,
      now()
    ) returning * into s;

    insert into historial (fecha, solicitud_codigo, usuario, accion, estado_nuevo, comentario)
    values (now(), s.codigo, u.nombre,
      'Solicitud creada' || (case when s.urgente then ' (URGENTE)' else '' end),
      s.estado, coalesce(nullif(s.motivo, ''), comentario));

    return s;
  end if;

  select * into s from solicitudes where codigo = p_codigo for update;
  if s is null then
    raise exception 'No encuentro la solicitud %.', p_codigo;
  end if;

  if p_tipo = 'validar' then
    if not es_resp then raise exception 'Solo la responsable de producción valida compras.'; end if;
    if s.estado <> 'Pendiente validar' then raise exception 'Esta solicitud ya no está pendiente de validar.'; end if;

    s.referencia := coalesce(nullif(btrim(p_datos->>'referencia'), ''), s.referencia);
    if p_datos ? 'cantidad' and btrim(coalesce(p_datos->>'cantidad', '')) <> '' then
      s.cantidad := replace(p_datos->>'cantidad', ',', '.')::numeric;
    end if;
    s.unidad := coalesce(nullif(btrim(p_datos->>'unidad'), ''), s.unidad);
    s.proveedor := coalesce(nullif(btrim(p_datos->>'proveedor'), ''), s.proveedor);
    if p_datos ? 'fechaNecesaria' and btrim(coalesce(p_datos->>'fechaNecesaria', '')) <> '' then
      s.fecha_necesaria := (p_datos->>'fechaNecesaria')::date;
    end if;
    if p_datos ? 'precio' and btrim(coalesce(p_datos->>'precio', '')) <> '' then
      s.precio := replace(p_datos->>'precio', ',', '.')::numeric;
    end if;

    faltan := fn_solicitud_faltan(s);
    if array_length(faltan, 1) > 0 then
      raise exception 'Para validar falta: %. Compras necesita estos datos para pedir sin preguntar.', array_to_string(faltan, ', ');
    end if;

    s.estado := 'Validada';
    s.asignado := 'COMPRAS';
    s.validado_por := u.nombre;
    s.fecha_validacion := now();
    accion := 'Validada';

  elsif p_tipo = 'alternativa' then
    if not es_resp then raise exception 'Solo la responsable de producción puede encargar una búsqueda de alternativa.'; end if;
    if s.estado <> 'Pendiente validar' then raise exception 'Esta solicitud ya no está pendiente de validar.'; end if;
    if coalesce(btrim(p_datos->>'asignado'), '') = '' then raise exception 'Elige qué encargado busca la alternativa.'; end if;
    if comentario = '' then raise exception 'Explica qué hay que buscar (proveedor, pieza, precio…).'; end if;
    s.estado := 'Buscar alternativa';
    s.asignado := btrim(p_datos->>'asignado');
    accion := 'Encargada búsqueda de alternativa a ' || s.asignado;

  elsif p_tipo = 'rechazar' then
    if not es_resp then raise exception 'Solo la responsable de producción puede rechazar.'; end if;
    if s.estado not in ('Pendiente validar', 'Buscar alternativa') then raise exception 'Esta solicitud ya no se puede rechazar.'; end if;
    if comentario = '' then raise exception 'Indica el motivo del rechazo.'; end if;
    s.estado := 'Rechazada';
    s.asignado := '';
    accion := 'Rechazada';

  elsif p_tipo = 'proponer' then
    if s.estado <> 'Buscar alternativa' then raise exception 'Esta solicitud no está en búsqueda de alternativa.'; end if;
    if not (s.asignado = u.nombre or es_resp) then raise exception 'Esta búsqueda está asignada a %.', s.asignado; end if;
    s.articulo := coalesce(nullif(btrim(p_datos->>'articulo'), ''), s.articulo);
    s.referencia := coalesce(nullif(btrim(p_datos->>'referencia'), ''), s.referencia);
    s.proveedor := coalesce(nullif(btrim(p_datos->>'proveedor'), ''), s.proveedor);
    if p_datos ? 'precio' and btrim(coalesce(p_datos->>'precio', '')) <> '' then s.precio := replace(p_datos->>'precio', ',', '.')::numeric; end if;
    if p_datos ? 'cantidad' and btrim(coalesce(p_datos->>'cantidad', '')) <> '' then s.cantidad := replace(p_datos->>'cantidad', ',', '.')::numeric; end if;
    s.unidad := coalesce(nullif(btrim(p_datos->>'unidad'), ''), s.unidad);
    if comentario = '' then raise exception 'Resume la alternativa que propones.'; end if;
    s.estado := 'Pendiente validar';
    s.asignado := 'RESPONSABLE';
    accion := 'Alternativa propuesta';

  elsif p_tipo = 'faltaInfo' then
    if not es_comp then raise exception 'Solo Compras puede devolver por falta de información.'; end if;
    if s.estado <> 'Validada' then raise exception 'Esta solicitud no está pendiente de compra.'; end if;
    if comentario = '' then raise exception 'Indica qué dato falta.'; end if;
    s.estado := 'Falta información';
    s.asignado := s.solicitante;
    accion := 'Devuelta al solicitante por falta de información';

  elsif p_tipo = 'completar' then
    if s.estado <> 'Falta información' then raise exception 'Esta solicitud no está pendiente de información.'; end if;
    if not (s.asignado = u.nombre or es_resp) then raise exception 'Esta solicitud está pendiente de %.', s.asignado; end if;
    s.referencia := coalesce(nullif(btrim(p_datos->>'referencia'), ''), s.referencia);
    s.proveedor := coalesce(nullif(btrim(p_datos->>'proveedor'), ''), s.proveedor);
    if p_datos ? 'cantidad' and btrim(coalesce(p_datos->>'cantidad', '')) <> '' then s.cantidad := replace(p_datos->>'cantidad', ',', '.')::numeric; end if;
    s.unidad := coalesce(nullif(btrim(p_datos->>'unidad'), ''), s.unidad);
    if p_datos ? 'fechaNecesaria' and btrim(coalesce(p_datos->>'fechaNecesaria', '')) <> '' then s.fecha_necesaria := (p_datos->>'fechaNecesaria')::date; end if;
    if p_datos ? 'precio' and btrim(coalesce(p_datos->>'precio', '')) <> '' then s.precio := replace(p_datos->>'precio', ',', '.')::numeric; end if;
    if comentario = '' then raise exception 'Indica qué has completado.'; end if;
    faltan := fn_solicitud_faltan(s);
    if array_length(faltan, 1) > 0 then raise exception 'Sigue faltando: %.', array_to_string(faltan, ', '); end if;
    s.estado := 'Validada';
    s.asignado := 'COMPRAS';
    accion := 'Información completada';

  elsif p_tipo = 'comprar' then
    if not es_comp then raise exception 'Solo Compras registra la compra.'; end if;
    if s.estado <> 'Validada' then raise exception 'Esta solicitud no está pendiente de compra.'; end if;
    s.pedido_prov := coalesce(nullif(btrim(p_datos->>'pedidoProv'), ''), s.pedido_prov);
    s.proveedor := coalesce(nullif(btrim(p_datos->>'proveedor'), ''), s.proveedor);
    if p_datos ? 'precio' and btrim(coalesce(p_datos->>'precio', '')) <> '' then s.precio := replace(p_datos->>'precio', ',', '.')::numeric; end if;
    if coalesce(btrim(p_datos->>'entregaPrevista'), '') = '' then raise exception 'Indica la fecha de entrega prevista.'; end if;
    s.entrega_prevista := (p_datos->>'entregaPrevista')::date;
    s.estado := 'Comprada';
    s.asignado := s.solicitante;
    s.fecha_compra := now();
    accion := 'Comprada' || (case when coalesce(s.pedido_prov, '') <> '' then ' (pedido ' || s.pedido_prov || ')' else '' end);

  elsif p_tipo = 'recibir' then
    if s.estado <> 'Comprada' then raise exception 'Esta solicitud no está pendiente de recibir.'; end if;
    s.estado := 'Recibida';
    s.asignado := '';
    s.fecha_recepcion := now();
    s.recibido_por := u.nombre;
    accion := 'Recibida';

  elsif p_tipo = 'anular' then
    if not (s.solicitante = u.nombre or es_resp) then raise exception 'Solo quien la pidió o la responsable pueden anularla.'; end if;
    if s.estado not in ('Pendiente validar', 'Buscar alternativa', 'Falta información') then
      raise exception 'Ya no se puede anular: está validada o comprada.';
    end if;
    s.estado := 'Rechazada';
    s.asignado := '';
    accion := 'Anulada por ' || u.nombre;

  else
    raise exception 'Acción desconocida: %', p_tipo;
  end if;

  if comentario <> '' then
    s.comentario := comentario;
  end if;
  s.actualizado := now();

  update solicitudes set
    referencia = s.referencia, cantidad = s.cantidad, unidad = s.unidad, proveedor = s.proveedor,
    fecha_necesaria = s.fecha_necesaria, articulo = s.articulo, estado = s.estado, asignado = s.asignado,
    validado_por = s.validado_por, fecha_validacion = s.fecha_validacion, precio = s.precio,
    pedido_prov = s.pedido_prov, fecha_compra = s.fecha_compra, entrega_prevista = s.entrega_prevista,
    fecha_recepcion = s.fecha_recepcion, recibido_por = s.recibido_por, comentario = s.comentario,
    actualizado = s.actualizado
  where codigo = s.codigo
  returning * into s;

  insert into historial (fecha, solicitud_codigo, usuario, accion, estado_nuevo, comentario)
  values (now(), s.codigo, u.nombre, accion, s.estado, comentario);

  return s;
end;
$$;

-- ───────────────────────── Top 15 (temas y plan del día) ─────────────────────────

create or replace function fn_t15_accion(
  p_tipo   text,
  p_codigo text,
  p_datos  jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t t15_temas;
  d t15_dia;
  vieja text;
  nueva text;
  codigo_nuevo text;
begin
  if p_tipo = 'guardarDia' then
    select * into d from t15_dia where fecha = current_date;
    if d is null then
      insert into t15_dia (fecha) values (current_date) returning * into d;
    end if;
    if p_datos ? 'planIndus' then d.plan_indus := btrim(p_datos->>'planIndus'); end if;
    if p_datos ? 'planAgro' then d.plan_agro := btrim(p_datos->>'planAgro'); end if;
    if p_datos ? 'respExpedicion' then d.resp_expedicion := btrim(p_datos->>'respExpedicion'); end if;
    if p_datos ? 'personal' then d.personal := btrim(p_datos->>'personal'); end if;
    if p_datos ? 'avisos' then d.avisos := btrim(p_datos->>'avisos'); end if;
    d.actualizado := now();
    update t15_dia set plan_indus = d.plan_indus, plan_agro = d.plan_agro, resp_expedicion = d.resp_expedicion,
      personal = d.personal, avisos = d.avisos, actualizado = d.actualizado
    where fecha = d.fecha;
    return jsonb_build_object(
      'planIndus', d.plan_indus, 'planAgro', d.plan_agro, 'respExpedicion', d.resp_expedicion,
      'personal', d.personal, 'avisos', d.avisos);
  end if;

  if p_tipo = 'nuevoTema' then
    if coalesce(btrim(p_datos->>'problema'), '') = '' and coalesce(btrim(p_datos->>'accion'), '') = '' then
      raise exception 'Escribe el problema o la acción.';
    end if;
    if coalesce(btrim(p_datos->>'accion'), '') <> '' and
       (coalesce(btrim(p_datos->>'responsable'), '') = '' or coalesce(btrim(p_datos->>'fechaCompromiso'), '') = '') then
      raise exception 'Una acción necesita responsable y fecha.';
    end if;
    codigo_nuevo := fn_nuevo_codigo_tema();
    insert into t15_temas (codigo, alta, seccion, problema, accion, responsable, fecha_compromiso, estado, comentarios, actualizado)
    values (
      codigo_nuevo, now(), coalesce(nullif(btrim(p_datos->>'seccion'), ''), 'General'),
      btrim(coalesce(p_datos->>'problema', '')), btrim(coalesce(p_datos->>'accion', '')), btrim(coalesce(p_datos->>'responsable', '')),
      case when coalesce(btrim(p_datos->>'fechaCompromiso'), '') <> '' then (p_datos->>'fechaCompromiso')::date else null end,
      'Abierta', '', now());
    return jsonb_build_object('ok', true, 'codigo', codigo_nuevo);
  end if;

  select * into t from t15_temas where codigo = p_codigo for update;
  if t is null then
    raise exception 'No encuentro el tema %.', p_codigo;
  end if;

  if p_tipo = 'editarTema' then
    if p_datos ? 'seccion' then t.seccion := btrim(p_datos->>'seccion'); end if;
    if p_datos ? 'problema' then t.problema := btrim(p_datos->>'problema'); end if;
    if p_datos ? 'accion' then t.accion := btrim(p_datos->>'accion'); end if;
    if p_datos ? 'responsable' then t.responsable := btrim(p_datos->>'responsable'); end if;
    if p_datos ? 'fechaCompromiso' then
      nueva := btrim(coalesce(p_datos->>'fechaCompromiso', ''));
      vieja := coalesce(to_char(t.fecha_compromiso, 'YYYY-MM-DD'), '');
      if vieja <> '' and nueva <> '' and nueva <> vieja then
        t.comentarios := coalesce(t.comentarios || E'\n', '') || to_char(now(), 'DD/MM') ||
          ': fecha movida del ' || substr(vieja, 9, 2) || '/' || substr(vieja, 6, 2);
      end if;
      t.fecha_compromiso := case when nueva <> '' then nueva::date else null end;
    end if;
    if coalesce(t.accion, '') <> '' and (coalesce(t.responsable, '') = '' or t.fecha_compromiso is null) then
      raise exception 'Una acción necesita responsable y fecha.';
    end if;

  elsif p_tipo = 'comentar' then
    if coalesce(btrim(p_datos->>'comentario'), '') = '' then raise exception 'Escribe el comentario.'; end if;
    t.comentarios := coalesce(t.comentarios || E'\n', '') || to_char(now(), 'DD/MM') || ': ' || btrim(p_datos->>'comentario');

  elsif p_tipo = 'cerrar' then
    t.estado := 'Hecha';
    t.cierre := now();
    if coalesce(btrim(p_datos->>'comentario'), '') <> '' then
      t.comentarios := coalesce(t.comentarios || E'\n', '') || to_char(now(), 'DD/MM') || ': ' || btrim(p_datos->>'comentario');
    end if;

  elsif p_tipo = 'reabrir' then
    t.estado := 'Abierta';
    t.cierre := null;
    t.comentarios := coalesce(t.comentarios || E'\n', '') || to_char(now(), 'DD/MM') || ': reabierta';

  else
    raise exception 'Acción desconocida: %', p_tipo;
  end if;

  t.actualizado := now();
  update t15_temas set
    seccion = t.seccion, problema = t.problema, accion = t.accion, responsable = t.responsable,
    fecha_compromiso = t.fecha_compromiso, estado = t.estado, comentarios = t.comentarios,
    cierre = t.cierre, actualizado = t.actualizado
  where codigo = t.codigo;

  return jsonb_build_object('ok', true);
end;
$$;

-- ───────────────────────── Vista: catálogo de histórico de artículos ─────────────────────────
-- Reemplaza cmpHistorico_(): una línea por artículo+referencia con los últimos datos conocidos,
-- usada por el buscador de "Nueva solicitud" en el frontend.
create or replace view v_historico_articulos as
select distinct on (lower(unaccent(articulo)), lower(unaccent(coalesce(referencia, ''))))
  codigo, articulo, referencia, unidad, proveedor, precio, seccion, estado,
  fecha::date as ultima,
  count(*) over (partition by lower(unaccent(articulo)), lower(unaccent(coalesce(referencia, '')))) as veces
from solicitudes
order by lower(unaccent(articulo)), lower(unaccent(coalesce(referencia, ''))), fecha desc;
