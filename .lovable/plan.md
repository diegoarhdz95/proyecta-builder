## Optimización móvil de Proyecta Studio

Objetivo: que la app sea cómoda desde celular en obra, sin perder la experiencia desktop. Prioridad #1: registrar un gasto rápido desde el celular.

---

### 1. Navegación móvil

- Mantener el header actual en desktop.
- En móvil (`<md`):
  - Header compacto con logo + botón ☰ que abre un `Sheet` lateral con: Proyectos, Catálogo, Materiales, Personal, Proveedores.
  - **Bottom navigation bar fija** (solo móvil) con accesos a: Proyectos · Gastos rápido · Nuevo proyecto. El botón central "Gasto" abre un sheet de captura rápida desde cualquier pantalla cuando se está dentro de un proyecto/obra; en otras pantallas lleva al selector de obra.

### 2. Dashboard (`/`)

- Header: logo arriba; en móvil mover "Herramientas" al sheet lateral y dejar solo `+ Nuevo` como FAB redondo abajo a la derecha.
- Buscador full-width.
- Cards de obra ya son responsive (grid 1 col en móvil) — aumentar padding táctil y tamaño de texto del título a `text-base`.

### 3. Vista de Proyecto (`/proyectos/$obraId`)

- Tabs actuales: convertir en scroll horizontal con `overflow-x-auto snap-x` y tabs tipo "chip" en móvil.
- `PresupuestoAlerts` ya es vertical: ok.
- Botón flotante "+ Gasto" visible siempre en móvil dentro del proyecto.

### 4. Gastos — captura rápida móvil (prioridad)

Nuevo componente `QuickGastoSheet` accesible desde:
- FAB "+ Gasto" dentro del proyecto.
- Bottom nav.

Flujo de 1 pantalla:
- Categoría (chips grandes: Materiales / Otros).
- Monto (input numérico grande, teclado decimal `inputMode="decimal"`).
- Concepto (input).
- Proveedor (opcional, colapsable).
- Fecha (default hoy).
- Botón "Guardar gasto" full-width, alto 48px.

La tabla de gastos en móvil se convierte en **lista de cards** (fecha + categoría chip arriba, concepto grande, monto a la derecha) sin scroll horizontal.

### 5. Cotizador, Personal, Materiales, Proveedores, Corte de Pagos

Patrón único de tablas responsivas:
- `<md`: ocultar tabla, renderizar lista de cards con los 2-3 campos clave + menú `⋯` para acciones.
- `≥md`: tabla actual.

Formularios:
- Inputs `h-11` en móvil (44px+), labels `text-sm`, grids colapsan a 1 columna.
- Selects nativos siguen funcionando bien en móvil.

### 6. Gantt

- Mantener vista actual con scroll horizontal (es inherente al Gantt).
- Añadir banner "Mejor en pantalla grande" en móvil + acceso rápido a vista de lista de tareas como alternativa.

### 7. Tipografía y toque

- Base `16px` (ya está). Subir títulos de tablas que estaban en `text-xs` a `text-sm` en móvil.
- Botones de acción: aplicar `min-h-11` por defecto en componente Button para tamaño `default` en móvil vía clase.
- Aumentar área táctil de íconos-botón a `h-10 w-10` en móvil.

### Detalles técnicos

- Nuevo `src/components/MobileNav.tsx` (Sheet lateral) y `src/components/BottomNav.tsx`.
- Nuevo `src/components/QuickGastoSheet.tsx` reutilizado por FAB y BottomNav.
- Helper hook `useIsMobile` ya existe.
- `GastosTab`, `CorteDePagosTab`, `personal.index`, `materiales`, `proveedores`, `catalogo`: agregar render dual tabla/cards con `useIsMobile`.
- Ajustes de Tailwind solo en componentes; no se tocan tokens de color.
- Sin cambios de lógica de negocio, solo presentación.

### Fuera de alcance

- No se rediseña visualmente la marca.
- No se cambia la estructura de datos ni endpoints.
- Gantt sigue requiriendo scroll horizontal interno (limitación inherente).
