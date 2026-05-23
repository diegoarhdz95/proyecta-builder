-- Store cronograma dates as TEXT in YYYY-MM-DD format (per spec) and ensure duracion_dias is decimal.
ALTER TABLE public.cronograma_actividades
  ALTER COLUMN fecha_inicio TYPE TEXT USING to_char(fecha_inicio, 'YYYY-MM-DD'),
  ALTER COLUMN fecha_fin    TYPE TEXT USING to_char(fecha_fin,    'YYYY-MM-DD');

ALTER TABLE public.cronograma_actividades
  ALTER COLUMN duracion_dias TYPE NUMERIC(8,2) USING duracion_dias::NUMERIC(8,2);
