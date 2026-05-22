-- Rendimiento por concepto (cantidad / día)
ALTER TABLE public.conceptos
  ADD COLUMN IF NOT EXISTS rendimiento NUMERIC DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.cronograma_actividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id UUID REFERENCES public.proyectos(id) ON DELETE CASCADE,
  concepto_id UUID,
  nombre_actividad TEXT NOT NULL,
  partida TEXT,
  partida_clave TEXT,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  duracion_dias INTEGER NOT NULL DEFAULT 1,
  factor_holgura NUMERIC NOT NULL DEFAULT 1.20,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.cronograma_actividades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon all cronograma" ON public.cronograma_actividades;
CREATE POLICY "anon all cronograma" ON public.cronograma_actividades
  FOR ALL TO anon USING (true) WITH CHECK (true);

GRANT ALL ON public.cronograma_actividades TO anon;

CREATE INDEX IF NOT EXISTS cronograma_proyecto_idx
  ON public.cronograma_actividades(proyecto_id);
