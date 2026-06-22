## Módulo APU (Análisis de Precios Unitarios)

Voy a agregar un módulo completo de APU con base de materiales y desglose por actividad.

### 1. Base de datos (migración Lovable Cloud)

Nuevas tablas en `public`:

**`materiales`** — catálogo del despacho
- `id uuid pk`, `despacho_id uuid`, `nombre text`, `unidad text`, `precio_unitario numeric`, `categoria text` (cemento, acero, agregados, etc.), `created_at`, `updated_at`
- RLS abierta por despacho_id (igual que tablas actuales), grants a authenticated/anon según patrón del proyecto

**`concepto_apu`** — desglose de materiales por concepto de cotización
- `id uuid pk`, `proyecto_concepto_id uuid fk → proyecto_conceptos(id) on delete cascade`, `material_id uuid fk → materiales(id)`, `rendimiento numeric` (cantidad de material por unidad de actividad), `created_at`
- Índice por `proyecto_concepto_id`

**Seed inicial**: ~25 materiales mexicanos comunes con precios promedio 2026:
- Cemento gris 50kg (~250 MXN/bulto), varilla #3/#4/#5 (~25 MXN/kg), arena (~450 MXN/m³), grava (~500 MXN/m³), block 12/15/20 (~16-22 MXN/pieza), tabique rojo, yeso 40kg, mortero, alambre recocido, clavo, pintura vinílica 19L, impermeabilizante, mosaico/loseta, mezcla asfáltica, agua, etc.

### 2. UI — Sección "Materiales" en configuración del despacho

Nueva ruta `/materiales` (link en el sidebar/header junto a Catálogo):
- Tabla con búsqueda, filtro por categoría
- Acciones: agregar, editar inline, eliminar
- Columnas: Nombre · Categoría · Unidad · Precio unitario · Acciones

### 3. UI — APU dentro del editor de cotización

En `cotizaciones.$id_.editar.tsx`, en cada fila de concepto agregar botón "APU" (icono calculadora):
- Abre `ApuDialog` con:
  - Tabla de materiales asignados al concepto: Material (Select del catálogo) · Unidad · Rendimiento (por unidad de actividad) · Cantidad total (= rendimiento × cantidad concepto, auto) · Precio unitario · Importe (auto)
  - Botón "+ Agregar material"
  - Subtotal de materiales mostrado
  - Botón "Aplicar como P.U." que escribe el costo de materiales en `precio_unitario_final` del concepto
- Se guarda al cerrar (upsert en `concepto_apu`)

### 4. Cálculos
- `cantidad_material = rendimiento × concepto.cantidad`
- `importe_material = cantidad_material × material.precio_unitario`
- `costo_materiales_concepto = Σ importe_material`
- Al "Aplicar como P.U.": `precio_unitario_final = costo_materiales_concepto / concepto.cantidad`

### Archivos
- migración SQL nueva (tablas + seed)
- `src/routes/materiales.tsx` (nueva ruta + CRUD)
- `src/components/ApuDialog.tsx` (nuevo)
- `src/routes/cotizaciones.$id_.editar.tsx` (botón APU por fila)
- `src/lib/supabase.ts` (tipos `Material`, `ConceptoApu`)
- link de navegación al header

¿Procedo?
