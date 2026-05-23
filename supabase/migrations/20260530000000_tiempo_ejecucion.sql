ALTER TABLE public.proyectos
  ADD COLUMN IF NOT EXISTS tiempo_ejecucion_texto TEXT,
  ADD COLUMN IF NOT EXISTS tiempo_ejecucion_incluir BOOLEAN NOT NULL DEFAULT false;
