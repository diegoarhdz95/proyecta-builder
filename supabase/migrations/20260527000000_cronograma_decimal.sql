ALTER TABLE cronograma_actividades
  ALTER COLUMN duracion_dias TYPE NUMERIC(6,1) USING duracion_dias::NUMERIC(6,1);
