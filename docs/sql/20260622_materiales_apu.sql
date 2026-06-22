-- Materiales (catálogo del despacho) y APU por concepto de cotización
-- Aplicar manualmente en el SQL editor de Supabase

create table if not exists public.materiales (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null,
  nombre text not null,
  categoria text,
  unidad text not null,
  precio_unitario numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists materiales_despacho_idx on public.materiales(despacho_id);

alter table public.materiales enable row level security;
drop policy if exists "anon read materiales" on public.materiales;
drop policy if exists "anon write materiales" on public.materiales;
create policy "anon read materiales"
  on public.materiales for select using (true);
create policy "anon write materiales"
  on public.materiales for all using (true) with check (true);

create table if not exists public.concepto_apu (
  id uuid primary key default gen_random_uuid(),
  proyecto_concepto_id uuid not null references public.proyecto_conceptos(id) on delete cascade,
  material_id uuid not null references public.materiales(id) on delete restrict,
  rendimiento numeric(14,4) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists concepto_apu_pc_idx on public.concepto_apu(proyecto_concepto_id);

alter table public.concepto_apu enable row level security;
drop policy if exists "anon read concepto_apu" on public.concepto_apu;
drop policy if exists "anon write concepto_apu" on public.concepto_apu;
create policy "anon read concepto_apu"
  on public.concepto_apu for select using (true);
create policy "anon write concepto_apu"
  on public.concepto_apu for all using (true) with check (true);

-- Seed de materiales comunes en construcción (México, precios promedio 2026)
insert into public.materiales (despacho_id, nombre, categoria, unidad, precio_unitario) values
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Cemento gris CPC 30R (saco 50 kg)','Cementantes','bulto',265),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Cal hidratada (saco 25 kg)','Cementantes','bulto',135),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Yeso (saco 40 kg)','Cementantes','bulto',180),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Mortero adhesivo gris (saco 20 kg)','Cementantes','bulto',195),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Arena de río','Agregados','m3',480),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Grava 3/4"','Agregados','m3',520),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Tepetate','Agregados','m3',310),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Agua','Agregados','m3',45),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Varilla corrugada #3 (3/8") 12 m','Acero','pieza',195),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Varilla corrugada #4 (1/2") 12 m','Acero','pieza',345),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Varilla corrugada #5 (5/8") 12 m','Acero','pieza',540),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Alambre recocido cal. 18','Acero','kg',38),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Clavo 2-1/2"','Acero','kg',42),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Block hueco 12x20x40','Mampostería','pieza',18),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Block hueco 15x20x40','Mampostería','pieza',22),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Block hueco 20x20x40','Mampostería','pieza',27),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Tabique rojo recocido','Mampostería','pieza',6),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Tabicón vibrocomprimido','Mampostería','pieza',12),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Loseta cerámica 45x45','Acabados','m2',180),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Azulejo 20x30','Acabados','m2',160),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Pintura vinílica lavable (cubeta 19 L)','Acabados','cubeta',1450),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Sellador acrílico (cubeta 19 L)','Acabados','cubeta',1180),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Impermeabilizante 5 años (cubeta 19 L)','Impermeabilización','cubeta',1980),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Tubo PVC hidráulico 1/2" 6 m','Instalaciones','pieza',95),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Tubo PVC sanitario 4" 6 m','Instalaciones','pieza',420),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Cable THW cal. 12 (rollo 100 m)','Eléctrico','rollo',2200),
  ('0905a074-4326-4773-8eaf-6ad46e01f304','Mezcla asfáltica en caliente','Pavimentos','ton',2850)
on conflict do nothing;
-- =====================================================
-- GRANTs requeridos por la Data API (PostgREST).
-- Sin esto, el frontend recibe 401 "permission denied".
-- =====================================================
grant select, insert, update, delete on public.materiales to anon, authenticated;
grant select, insert, update, delete on public.concepto_apu to anon, authenticated;
grant all on public.materiales to service_role;
grant all on public.concepto_apu to service_role;
