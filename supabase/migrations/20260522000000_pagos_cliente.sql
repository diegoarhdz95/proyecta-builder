CREATE TABLE IF NOT EXISTS public.pagos_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id UUID NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  numero_pago INTEGER,
  concepto TEXT NOT NULL,
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  fecha_pago DATE NOT NULL DEFAULT CURRENT_DATE,
  metodo_pago TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pagos_cliente_proyecto ON public.pagos_cliente(proyecto_id);
ALTER TABLE public.pagos_cliente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pagos_cliente_all" ON public.pagos_cliente;
CREATE POLICY "pagos_cliente_all" ON public.pagos_cliente FOR ALL USING (true) WITH CHECK (true);
