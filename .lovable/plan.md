# Módulo de Control de Personal

Agregar gestión de **destajistas y contratistas**, asignación a proyectos, pagos y recibos PDF con aceptación digital.

## 1. Base de datos (nueva migración SQL)

Cuatro tablas en `public`, con `GRANT` a `anon/authenticated/service_role` (mismo patrón que ya usas en Materiales/Pagos) y RLS abierta a nivel de `despacho_id` para mantener consistencia con el resto del proyecto.

- `personal`
  - `id`, `despacho_id`, `nombre`, `categoria` (`destajista | contratista`), `especialidad`, `telefono`, `notas`, `created_at`
- `personal_proyecto` (vínculo N:M)
  - `id`, `personal_id`, `proyecto_id`, `actividad`, `monto_acordado`, `notas`, `created_at`
- `pagos_personal`
  - `id`, `personal_id`, `proyecto_id`, `concepto`, `monto`, `fecha_pago`, `metodo_pago`, `notas`, `numero_recibo` (consecutivo por despacho, asignado al generar PDF), `aceptado_at`, `aceptado_ip`, `acepta_token` (uuid), `created_at`
- (sin tabla extra para firmas; la aceptación se guarda en el propio pago)

Script: `docs/sql/20260622_personal.sql`. Se ejecuta manualmente en el SQL Editor (mismo flujo que las migraciones previas).

## 2. Sección "Personal" en el dashboard

- Botón nuevo en el header de `src/routes/index.tsx`: **Personal** → `/personal`.
- Nueva ruta `src/routes/personal.tsx`:
  - Lista con filtros (Todos / Destajistas / Contratistas) y búsqueda por nombre o especialidad.
  - Botón **Nuevo** abre Sheet con formulario: nombre, categoría, especialidad, teléfono, notas.
  - Cada renglón abre el detalle de la persona en `/personal/$id`.
- Ruta `src/routes/personal.$id.tsx`:
  - Datos generales editables.
  - Tabla de proyectos asignados (actividad, monto acordado) + botón para asignar/desasignar.
  - Historial completo de pagos cobrados por la persona (todos los proyectos).

## 3. Tab "Personal" dentro del proyecto

En `src/routes/proyectos.$obraId.tsx` agregar un tab nuevo **Personal** al lado de **Pagos**:

- Selector de cotización (reutiliza el patrón del tab Pagos).
- Sección **Asignados**: tabla con nombre, categoría, especialidad, actividad, monto acordado, total pagado, saldo. Botón para asignar personas existentes (combo) o crear nueva en línea.
- Sección **Registro de pagos**: formulario (persona, concepto/actividad, monto, fecha, método de pago, notas) + tabla histórica del proyecto. Cada renglón con dos acciones: **Generar recibo** y **Link de aceptación**.

## 4. Recibos PDF y aceptación digital

- Nuevo helper `src/lib/generate-recibo-personal-pdf.ts` (basado en `generate-recibo-pdf.ts`):
  - Encabezado con logo + datos del despacho.
  - Bloques: Trabajador (nombre, categoría, especialidad), Proyecto, Actividad/Concepto, Fecha, Monto, Método.
  - Número de recibo consecutivo por despacho (asignado al primer "Generar recibo" y persistido en `pagos_personal.numero_recibo`).
  - Si `aceptado_at` está poblado: imprime "ACEPTADO el {fecha} desde {ip}" en lugar del espacio para firma manual.
  - Si no: imprime un **QR** apuntando a `/recibo/$token` (token = `acepta_token`) para que el trabajador escanee y acepte desde el celular. Se usa la dependencia `qrcode`.
  - Botón en la UI permite **Descargar PDF** o **Compartir** (Web Share API con `File`, mismo patrón que ya implementamos para pagos del cliente).

- Ruta pública `src/routes/recibo.$token.tsx` (sin auth):
  - Muestra una vista limpia mobile-first del recibo: trabajador, proyecto, actividad, monto, fecha.
  - Botón grande **Acepto este pago** que escribe `aceptado_at = now()` y `aceptado_ip` (capturada por una server function pública).
  - Si ya está aceptado, muestra el sello "Aceptado el … desde IP …" y deshabilita el botón.
  - Token aleatorio (uuid) actúa como capability; al consumirse no se revoca para permitir consulta posterior, pero solo permite escribir `aceptado_at` cuando aún es null.

- Server function pública `src/lib/recibo-personal.functions.ts`:
  - `getReciboByToken({ token })` → datos sanitizados del pago + persona + proyecto (solo campos necesarios para mostrar).
  - `aceptarRecibo({ token })` → marca aceptación; obtiene IP desde `request.headers['x-forwarded-for']`.
  - Ambas son endpoints públicos: validan input con `zod`, no exponen IDs internos más allá del token.

## 5. Detalles técnicos

- Reusar `Sheet`, `Table`, `Input`, `Select` y patrones ya presentes (StatCard, currency).
- `qrcode` se añade con `bun add qrcode @types/qrcode` y se invoca solo en cliente (al generar el PDF).
- El consecutivo de `numero_recibo` se calcula con `max(numero_recibo) + 1` filtrado por despacho (join con `personal`), siguiendo el mismo patrón que ya usamos para `pagos_cliente.numero_pago`.
- Total contratado / pagado / saldo por persona se recalculan en cliente sumando `pagos_personal`.
- Validación de formularios con zod y mensajes en `sonner` (igual al resto del módulo).

## Archivos a tocar / crear

```text
docs/sql/20260622_personal.sql                (nuevo)
src/lib/supabase.ts                           (tipos Personal, PersonalProyecto, PagoPersonal)
src/lib/generate-recibo-personal-pdf.ts       (nuevo)
src/lib/recibo-personal.functions.ts          (nuevo, server fns públicas)
src/routes/personal.tsx                       (nuevo, listado)
src/routes/personal.$id.tsx                   (nuevo, detalle)
src/routes/recibo.$token.tsx                  (nuevo, público)
src/routes/proyectos.$obraId.tsx              (nuevo tab "Personal")
src/routes/index.tsx                          (botón "Personal" en header)
package.json / bun.lock                       (qrcode)
```

## Confirmaciones que necesito antes de implementar

1. ¿El **consecutivo de número de recibo** debe ser independiente del de pagos de cliente (`pagos_cliente.numero_pago`) o quieres una numeración única global?
2. ¿La aceptación digital debe ser **vinculante sin login** (solo escanear QR del recibo) o quieres que el trabajador tenga que ingresar un código adicional (PIN/teléfono) para confirmar identidad?
3. ¿Los pagos a personal afectan los **totales de cobrado** del dashboard (que hoy solo suman `pagos_cliente`)? Mi propuesta es **no** mezclarlos: cliente = ingresos, personal = egresos.
