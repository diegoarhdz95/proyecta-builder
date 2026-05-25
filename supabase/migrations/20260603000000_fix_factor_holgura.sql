-- La columna legacy `factor_holgura_default` rompe los upserts del módulo Gantt
-- (NOT NULL sin default). La volvemos opcional y la sincronizamos con
-- `factor_holgura` (la columna canónica usada en el código).
alter table public.gantt_settings
  alter column factor_holgura_default drop not null;

alter table public.gantt_settings
  alter column factor_holgura_default set default 1.20;

update public.gantt_settings
  set factor_holgura_default = factor_holgura
  where factor_holgura_default is distinct from factor_holgura;
