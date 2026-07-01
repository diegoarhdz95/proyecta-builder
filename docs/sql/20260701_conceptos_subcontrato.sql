-- Add subcontract flag to catalog concepts
alter table public.conceptos
  add column if not exists es_subcontrato boolean not null default false;

create index if not exists conceptos_subcontrato_idx
  on public.conceptos (partida_id) where es_subcontrato = true;