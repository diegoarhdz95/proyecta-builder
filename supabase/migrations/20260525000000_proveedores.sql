CREATE TABLE IF NOT EXISTS public.proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id UUID NOT NULL,
  nombre TEXT NOT NULL,
  contacto TEXT,
  telefono TEXT,
  email TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.materiales_proveedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE CASCADE,
  concepto_id UUID,
  material TEXT NOT NULL,
  tiempo_entrega_dias INTEGER NOT NULL DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.alertas_compra_estado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id UUID REFERENCES public.cronograma_actividades(id) ON DELETE CASCADE,
  material_id UUID REFERENCES public.materiales_proveedor(id) ON DELETE CASCADE,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(actividad_id, material_id)
);

ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiales_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas_compra_estado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon all proveedores" ON public.proveedores;
CREATE POLICY "anon all proveedores" ON public.proveedores FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon all mat_prov" ON public.materiales_proveedor;
CREATE POLICY "anon all mat_prov" ON public.materiales_proveedor FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon all alertas" ON public.alertas_compra_estado;
CREATE POLICY "anon all alertas" ON public.alertas_compra_estado FOR ALL TO anon USING (true) WITH CHECK (true);

GRANT ALL ON public.proveedores TO anon;
GRANT ALL ON public.materiales_proveedor TO anon;
GRANT ALL ON public.alertas_compra_estado TO anon;
