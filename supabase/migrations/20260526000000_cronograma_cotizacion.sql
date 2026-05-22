ALTER TABLE public.cronograma_actividades
  ADD COLUMN IF NOT EXISTS cotizacion_id UUID REFERENCES public.proyectos(id) ON DELETE CASCADE;

-- Backfill: proyecto_id ya guardaba la cotización
UPDATE public.cronograma_actividades
  SET cotizacion_id = proyecto_id
  WHERE cotizacion_id IS NULL;

CREATE INDEX IF NOT EXISTS cronograma_cotizacion_idx
  ON public.cronograma_actividades(cotizacion_id);
