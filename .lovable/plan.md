
# Reestructura del módulo de Gantt

## Resumen
- Las cotizaciones (en `proyectos.$obraId.tsx`) dejan de tener acciones inline; clic en una fila abre un **dashboard de cotización** nuevo.
- Se crea ruta `/cotizaciones/$id` con un resumen compacto (no editable) y pestañas: **Desglose · Pagos · Gantt**, más botón "Editar cotización" que va al editor actual.
- La pestaña Gantt vive dentro del dashboard. Se elimina `CronogramaTab` a nivel obra del archivo `proyectos.$obraId.tsx`.
- Nueva tabla `gantt_settings` por despacho con configuración y festivos personalizados.
- Flujo nuevo: **Generar Preview IA → Mostrar preview scrolleable → Confirmar (con disclaimer) o Llenar manualmente → Editor Gantt unificado**.

## Cambios en DB (migración nueva)
Archivo: `supabase/migrations/<timestamp>_gantt_settings.sql`

```sql
create table if not exists public.gantt_settings (
  despacho_id uuid primary key,
  trabaja_sabado boolean not null default true,
  sabado_medio_dia boolean not null default true,
  trabaja_domingo boolean not null default false,
  horario_nocturno boolean not null default false,
  factor_holgura numeric(4,2) not null default 1.20,
  dias_arranque integer not null default 7,
  festivos_personalizados jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.gantt_settings enable row level security;
create policy "anon all gantt_settings" on public.gantt_settings for all using (true) with check (true);
```
(Inserción del registro inicial para el despacho activo vía tool de insert tras la migración.)

## Rutas / archivos
- **Crear** `src/routes/cotizaciones.$id.tsx` → dashboard con tabs Desglose / Pagos / Gantt y botón Editar.
- **Crear** `src/components/CotizacionGanttTab.tsx` → controles (fecha inicio, settings, generar IA) + render del preview o del editor.
- **Crear** `src/components/GanttSettingsDialog.tsx` → modal con toggles, factor, días de arranque, festivos editables.
- **Crear** `src/components/GanttEditor.tsx` → extraído de `CronogramaTab.tsx` actual: drag/resize, panel lateral con dependencia, zoom, vistas día/semana/mes/ver-todo, agrupación por partida.
- **Refactor** `src/components/CronogramaTab.tsx` → mover la generación IA y helpers de fechas a `src/lib/gantt-engine.ts` (settings-aware), conservar reutilización. Borrar uso a nivel obra.
- **Editar** `src/routes/proyectos.$obraId.tsx`:
  - Remover columna Editar/eliminar inline → cada fila es `<Link to="/cotizaciones/$id">`. Solo muestra folio, nombre, cliente (del proyecto), total, estado. Acción eliminar pasa a un menú compacto.
  - Quitar tab "Cronograma" (ahora vive por cotización).
- **Editar** `src/lib/supabase.ts` → tipos para `gantt_settings`.

## Detalle del Dashboard de cotización (`/cotizaciones/$id`)
- Header con back a la obra, folio, nombre, cliente.
- Card resumen (max 40% alto): folio · cliente · total · estado · fecha · # conceptos.
- Botón primario "✏️ Editar cotización" → `/cotizaciones/$id/editar`.
- Tabs `Desglose | Pagos | Gantt` que cargan los componentes existentes (Desglose y Pagos se reutilizan de la página de obra extrayéndolos a componentes o se renderizan filtrados por `proyecto_id`).

## Pestaña Gantt (CotizacionGanttTab)
- Barra superior: nombre cotización, input fecha inicio (default hoy + `dias_arranque` desde settings), botón ⚙️ Settings (abre modal), botón "📅 Generar preview Gantt IA".
- Estado `preview: Actividad[] | null`. Tras generar:
  - Render del editor en modo **preview** (no persistido).
  - Al final dos botones:
    - "✅ Usar este cronograma" → AlertDialog con texto exacto del disclaimer + acciones Cancelar / Confirmar y guardar (inserta en `cronograma_actividades`).
    - "✏️ Prefiero llenarlo manualmente" → genera filas vacías (un row por concepto, sin fechas) y entra al editor manual.

## Editor Gantt (GanttEditor)
- Reutiliza render actual del Gantt (grid de barras, agrupación por partida con colores, vistas día/semana/mes/ver-todo, zoom + / -).
- **Nuevo**: drag horizontal con mouse para mover fechas, resize del borde derecho para cambiar duración.
- **Nuevo**: clic en barra abre `Sheet` con: nombre, fecha inicio, fecha fin, duración (auto), dropdown "Dependencia de" con otras actividades; al elegir dependencia se recorre la fecha de inicio al fin de la dependencia + 1 día hábil.
- Botón "Guardar cambios" → UPDATE en `cronograma_actividades` (batch).
- Botón "Regenerar con IA" discreto arriba (reabre flujo de preview).

## Motor de generación IA (`src/lib/gantt-engine.ts`)
- Recibe `settings: GanttSettings`, `startDate: Date`, `conceptos`.
- `dayWeight` ajustado según settings: sábado 1 / 0.5 / 0, domingo 1 / 0, horario nocturno multiplica capacidad. Festivos = unión de festivos LFT + `festivos_personalizados`.
- Secuencia de partidas y reglas especiales actualizadas a lo solicitado:
  - PRE → DEM → (EST, ALB en secuencia tras DEM); dentro de ALB firmes antes que muros.
  - HID/SAN/ELE/ACO/VOZ tras ALB, en paralelo entre sí.
  - ACB tras (ALB + HID + ELE + SAN). PIN tras ACB. CAR/HER/CAN en paralelo tras PIN. ILU tras PIN. MOB tras CAR. LIM siempre al final.
  - Unidad `mes` = cantidad × 22 días hábiles, en paralelo proyecto. `sem` = cantidad × 5.5. `%` y `SUP`/`GER` cubren todo el proyecto.
- Devuelve `Omit<Actividad,"id">[]` (preview) que el componente decide persistir o no.

## Limpieza
- Eliminar el modal de generación viejo dentro de `CronogramaTab.tsx` (queda como tab a nivel obra solo si lo necesitamos; lo retiro de la página de obra y dejo el componente solo como reexport temporal o lo borro). Borro la pestaña "Cronograma" de la obra para evitar dos puntos de entrada.

## Riesgos / asunciones
- `gantt_settings` no existe aún → creo migración. Si el usuario ya la tiene con otro shape, se ajusta.
- Reutilizo el render Gantt actual del archivo `CronogramaTab.tsx` (1200+ líneas) extrayéndolo a `GanttEditor.tsx`; drag/resize se agregan con handlers mouse simples (no librería externa).
- Disclaimer copiado **textual** al pie de la palabra como pidió el usuario.
