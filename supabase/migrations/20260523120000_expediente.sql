insert into storage.buckets (id, name, public)
values ('expediente', 'expediente', true)
on conflict (id) do update set public = true;

create table if not exists public.expediente_archivos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references public.obras(id) on delete cascade,
  categoria text,
  nombre text,
  url text,
  tipo text,
  created_at timestamptz default now()
);

grant all on public.expediente_archivos to anon;

alter table public.expediente_archivos enable row level security;

drop policy if exists "expediente all anon" on public.expediente_archivos;
create policy "expediente all anon" on public.expediente_archivos
  for all to anon using (true) with check (true);

drop policy if exists "expediente read" on storage.objects;
create policy "expediente read" on storage.objects
  for select to anon using (bucket_id = 'expediente');

drop policy if exists "expediente insert" on storage.objects;
create policy "expediente insert" on storage.objects
  for insert to anon with check (bucket_id = 'expediente');

drop policy if exists "expediente delete" on storage.objects;
create policy "expediente delete" on storage.objects
  for delete to anon using (bucket_id = 'expediente');
