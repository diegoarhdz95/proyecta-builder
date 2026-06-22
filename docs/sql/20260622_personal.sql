-- Módulo de Control de Personal: destajistas y contratistas

create table if not exists public.personal (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null,
  nombre text not null,
  categoria text not null check (categoria in ('destajista', 'contratista')),
  especialidad text,
  telefono text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.personal to anon, authenticated;
grant all on public.personal to service_role;
alter table public.personal enable row level security;
drop policy if exists "personal_all" on public.personal;
create policy "personal_all" on public.personal for all using (true) with check (true);

create index if not exists personal_despacho_idx on public.personal (despacho_id);

create table if not exists public.personal_proyecto (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.personal(id) on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  actividad text,
  monto_acordado numeric(14,2) not null default 0,
  notas text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.personal_proyecto to anon, authenticated;
grant all on public.personal_proyecto to service_role;
alter table public.personal_proyecto enable row level security;
drop policy if exists "personal_proyecto_all" on public.personal_proyecto;
create policy "personal_proyecto_all" on public.personal_proyecto for all using (true) with check (true);

create index if not exists personal_proyecto_personal_idx on public.personal_proyecto (personal_id);
create index if not exists personal_proyecto_proyecto_idx on public.personal_proyecto (proyecto_id);

create table if not exists public.pagos_personal (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.personal(id) on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  concepto text not null,
  monto numeric(14,2) not null,
  fecha_pago date not null default current_date,
  metodo_pago text,
  notas text,
  numero_recibo integer,
  acepta_token uuid not null default gen_random_uuid(),
  aceptado_at timestamptz,
  aceptado_ip text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.pagos_personal to anon, authenticated;
grant all on public.pagos_personal to service_role;
alter table public.pagos_personal enable row level security;
drop policy if exists "pagos_personal_all" on public.pagos_personal;
create policy "pagos_personal_all" on public.pagos_personal for all using (true) with check (true);

create unique index if not exists pagos_personal_token_uniq on public.pagos_personal (acepta_token);
create index if not exists pagos_personal_personal_idx on public.pagos_personal (personal_id);
create index if not exists pagos_personal_proyecto_idx on public.pagos_personal (proyecto_id);