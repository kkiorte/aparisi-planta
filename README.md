# APARISI CEPILLOS · Planta

Migración de la app de planta de APARISI CEPILLOS desde Google Sheets + Apps Script
a **Supabase** (backend) + **Lovable** (frontend). Hecho por ebing · Lean & Digital.

## Qué es esto

La planta usaba una Sheet («Planta APARISI») con un script de Apps Script que servía
dos aplicaciones web:

- **Compras**: solicitudes de material, con un circuito de validación por roles
  (Encargado → Responsable de producción → Compras → recepción).
- **Top 15**: la reunión diaria de inicio de turno (indicadores OEE de ayer,
  problemas y acciones, plan del día, avisos, resumen de compras).

Este repositorio migra ambas a una base de datos Supabase con la misma lógica de
negocio (replicada función por función), y documenta lo necesario para construir
el frontend en Lovable sobre esa base de datos.

## Dónde está cada cosa

- `legacy-apps-script/` — código original de Apps Script, como referencia exacta
  de qué hacía cada función. **No se usa en producción**, es solo documentación viva.
- `supabase/migrations/` — el esquema completo, en orden. Ya aplicado al proyecto
  Supabase `aparisi-planta` (ver `docs/arquitectura.md` para las credenciales).
- `docs/arquitectura.md` — cómo está hecho todo: esquema, funciones RPC, modelo de
  permisos, y qué falta (Fase 2).
- `docs/PROMPT-LOVABE.md` — el prompt completo para construir el frontend en
  Lovable, listo para pegar tal cual.
- `docs/migracion-datos.md` — qué se migró de la Sheet y qué no (y por qué).

## Estado

- [x] Esquema de Supabase (tablas, enums, RLS) — aplicado.
- [x] Funciones de negocio (`fn_solicitud_accion`, `fn_t15_accion`) — aplicadas y
      verificadas contra los avisos de seguridad de Supabase.
- [x] Datos reales de referencia (usuarios, config, máquinas) — cargados.
- [ ] Frontend en Lovable — pendiente (ver `docs/PROMPT-LOVABE.md`).
- [ ] Repositorio GitHub — pendiente de crear por el usuario y conectar.
- [ ] Sync de indicadores OEE desde la hoja de KPIs (Fase 2) — no empezado.
