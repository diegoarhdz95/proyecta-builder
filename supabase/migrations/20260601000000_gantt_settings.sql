-- Tabla de configuración Gantt por despacho
create table if not exists public.gantt_settings (
  despacho_id uuid primary key,
  trabaja_sabado boolean not null default true,
  sabado_medio_dia boolean not null default true,
  trabaja_domingo boolean not null default false,
  horario_nocturno boolean not null default false,
  factor_holgura numeric(4,2) not null default 1.20,
  dias_arranque integer not null default 7,
  festivos_personalizados jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.gantt_settings enable row level security;

drop policy if exists "anon read gantt_settings" on public.gantt_settings;
drop policy if exists "anon write gantt_settings" on public.gantt_settings;
create policy "anon read gantt_settings"
  on public.gantt_settings for select using (true);
create policy "anon write gantt_settings"
  on public.gantt_settings for all using (true) with check (true);

insert into public.gantt_settings (despacho_id)
values ('0905a074-4326-4773-8eaf-6ad46e01f304')
on conflict (despacho_id) do nothing;
