import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase, DESPACHO_ID, type Material } from "@/lib/supabase";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, AlertCircle } from "lucide-react";

type ParsedRow = {
  nombre: string;
  unidad: string;
  precio_unitario: number;
  existing?: Material;
  action: "update" | "insert" | "skip";
  oldPrice?: number;
};

function normalize(s: string) {
  return s.trim().toLowerCase();
}

function findColumn(headers: string[], candidates: string[]) {
  const norm = headers.map((h) => normalize(String(h)));
  for (const c of candidates) {
    const i = norm.findIndex((h) => h === c || h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

export function ImportMaterialesDialog({
  open,
  onOpenChange,
  existing,
  onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: Material[];
  onImported: () => void;
}) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const existingByName = useMemo(() => {
    const m = new Map<string, Material>();
    existing.forEach((mat) => m.set(normalize(mat.nombre), mat));
    return m;
  }, [existing]);

  function reset() {
    setRows([]);
    setFileName("");
    setError("");
  }

  async function handleFile(file: File) {
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
      if (aoa.length < 2) {
        setError("El archivo está vacío o no tiene datos.");
        return;
      }
      const headers = (aoa[0] as any[]).map((h) => String(h ?? ""));
      const iNombre = findColumn(headers, ["nombre", "material", "descripcion", "descripción"]);
      const iUnidad = findColumn(headers, ["unidad", "udm", "um"]);
      const iPrecio = findColumn(headers, ["precio", "precio unitario", "costo", "pu"]);
      if (iNombre < 0 || iUnidad < 0 || iPrecio < 0) {
        setError("No se encontraron las columnas requeridas: nombre, unidad y precio unitario.");
        return;
      }
      const parsed: ParsedRow[] = [];
      for (let r = 1; r < aoa.length; r++) {
        const row = aoa[r] as any[];
        const nombre = String(row[iNombre] ?? "").trim();
        const unidad = String(row[iUnidad] ?? "").trim();
        const precio = Number(String(row[iPrecio] ?? "0").replace(/[^0-9.\-]/g, "")) || 0;
        if (!nombre) continue;
        const ex = existingByName.get(normalize(nombre));
        parsed.push({
          nombre,
          unidad: unidad || ex?.unidad || "pieza",
          precio_unitario: precio,
          existing: ex,
          oldPrice: ex ? Number(ex.precio_unitario) : undefined,
          action: ex ? (Number(ex.precio_unitario) !== precio ? "update" : "skip") : "insert",
        });
      }
      setFileName(file.name);
      setRows(parsed);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const summary = useMemo(() => {
    const updates = rows.filter((r) => r.action === "update").length;
    const inserts = rows.filter((r) => r.action === "insert").length;
    const skips = rows.filter((r) => r.action === "skip").length;
    return { updates, inserts, skips, total: rows.length };
  }, [rows]);

  async function applyImport() {
    if (rows.length === 0) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const toUpdate = rows.filter((r) => r.action === "update");
      const toInsert = rows.filter((r) => r.action === "insert");

      for (const r of toUpdate) {
        const { error } = await supabase
          .from("materiales")
          .update({ precio_unitario: r.precio_unitario, unidad: r.unidad, updated_at: now })
          .eq("id", r.existing!.id);
        if (error) throw error;
      }
      if (toInsert.length > 0) {
        const { error } = await supabase.from("materiales").insert(
          toInsert.map((r) => ({
            despacho_id: DESPACHO_ID,
            nombre: r.nombre,
            unidad: r.unidad,
            precio_unitario: r.precio_unitario,
            categoria: null,
          })),
        );
        if (error) throw error;
      }
      toast.success(
        `Importación completada: ${toUpdate.length} actualizados, ${toInsert.length} nuevos`,
      );
      reset();
      onOpenChange(false);
      onImported();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ["nombre", "unidad", "precio_unitario"],
      ["Cemento gris 50kg", "bulto", 285],
      ["Varilla 3/8 x 12m", "pieza", 195],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materiales");
    XLSX.writeFile(wb, "plantilla_materiales.xlsx");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar precios desde CSV o Excel</DialogTitle>
          <DialogDescription>
            El archivo debe tener columnas: <b>nombre</b>, <b>unidad</b> y <b>precio_unitario</b>.
            No se modificará nada hasta que confirmes la importación.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex h-11 cursor-pointer items-center gap-2 rounded-md border border-dashed border-input px-4 text-sm hover:bg-muted/50">
              <Upload className="h-4 w-4" />
              <span>{fileName || "Seleccionar archivo .xlsx o .csv"}</span>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />Descargar plantilla
            </Button>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-md border bg-muted/30 p-2 text-center text-xs">
                  <div className="text-lg font-semibold tabular-nums">{summary.total}</div>
                  <div className="text-muted-foreground">Filas</div>
                </div>
                <div className="rounded-md border border-green-500/30 bg-green-500/10 p-2 text-center text-xs">
                  <div className="text-lg font-semibold tabular-nums text-green-700 dark:text-green-400">{summary.inserts}</div>
                  <div className="text-muted-foreground">Nuevos</div>
                </div>
                <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-2 text-center text-xs">
                  <div className="text-lg font-semibold tabular-nums text-blue-700 dark:text-blue-400">{summary.updates}</div>
                  <div className="text-muted-foreground">Actualizar</div>
                </div>
                <div className="rounded-md border bg-muted/30 p-2 text-center text-xs">
                  <div className="text-lg font-semibold tabular-nums text-muted-foreground">{summary.skips}</div>
                  <div className="text-muted-foreground">Sin cambio</div>
                </div>
              </div>

              <div className="max-h-80 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2">Material</th>
                      <th className="px-2 py-2 w-20">Unidad</th>
                      <th className="px-2 py-2 w-28 text-right">Precio anterior</th>
                      <th className="px-2 py-2 w-28 text-right">Precio nuevo</th>
                      <th className="px-2 py-2 w-24">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1.5">{r.nombre}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.unidad}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {r.oldPrice != null ? r.oldPrice.toFixed(2) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                          {r.precio_unitario.toFixed(2)}
                        </td>
                        <td className="px-2 py-1.5">
                          {r.action === "insert" && (
                            <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-400">Nuevo</span>
                          )}
                          {r.action === "update" && (
                            <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-400">Actualizar</span>
                          )}
                          {r.action === "skip" && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Sin cambio</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={applyImport}
            disabled={saving || rows.length === 0 || summary.updates + summary.inserts === 0}
          >
            Aplicar importación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}