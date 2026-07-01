-- Marca de subcontrato por concepto de cotización.
-- Un concepto marcado como subcontrato agrupa el costo completo bajo la
-- categoría "Subcontrato" (no se desglosa por materiales, mano de obra, etc.).
alter table public.proyecto_conceptos
  add column if not exists es_subcontrato boolean not null default false;

create index if not exists proyecto_conceptos_subcontrato_idx
  on public.proyecto_conceptos (proyecto_id)
  where es_subcontrato = true;