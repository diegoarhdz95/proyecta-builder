-- Gastos de proyecto (materiales y otros) para Corte de Pagos
create table if not exists public.gastos_proyecto (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  categoria text not null check (categoria in ('materiales', 'otros')),
  concepto text not null,
  proveedor text,
  monto numeric(14,2) not null,
  fecha_pago date not null default current_date,
  metodo_pago text,
  notas text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.gastos_proyecto to anon, authenticated;
grant all on public.gastos_proyecto to service_role;
alter table public.gastos_proyecto enable row level security;
drop policy if exists "gastos_proyecto_all" on public.gastos_proyecto;
create policy "gastos_proyecto_all" on public.gastos_proyecto for all using (true) with check (true);

create index if not exists gastos_proyecto_proyecto_idx on public.gastos_proyecto (proyecto_id);
create index if not exists gastos_proyecto_fecha_idx on public.gastos_proyecto (fecha_pago);