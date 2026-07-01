import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@tanstack/react-router";
import { supabase, DESPACHO_ID, type Material, type ConceptoApu, type ProyectoConcepto } from "@/lib/supabase";
import { toast } from "sonner";
import { Plus, Trash2, ExternalLink } from "lucide-react";

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

type Row = {
  id?: string;
  material_id: string;
  rendimiento: number;
};

export function ApuDialog({
  open,
  onOpenChange,
  item,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: ProyectoConcepto;
  onApplied: () => void;
}) {
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [originalIds, setOriginalIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [matRes, apuRes] = await Promise.all([
        supabase
          .from("materiales")
          .select("*")
          .eq("despacho_id", DESPACHO_ID)
          .order("nombre"),
        supabase
          .from("concepto_apu")
          .select("*")
          .eq("proyecto_concepto_id", item.id),
      ]);
      if (cancelled) return;
      if (matRes.error) toast.error(matRes.error.message);
      if (apuRes.error) toast.error(apuRes.error.message);
      const mats = (matRes.data ?? []) as Material[];
      const apus = (apuRes.data ?? []) as ConceptoApu[];
      setMateriales(mats);
      setRows(
        apus.map((a) => ({
          id: a.id,
          material_id: a.material_id,
          rendimiento: Number(a.rendimiento) || 0,
        })),
      );
      setOriginalIds(new Set(apus.map((a) => a.id)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, item.id]);

  const matMap = useMemo(() => {
    const m = new Map<string, Material>();
    materiales.forEach((x) => m.set(x.id, x));
    return m;
  }, [materiales]);

  const cantidadConcepto = Number(item.cantidad) || 0;

  const totals = useMemo(() => {
    let costoMateriales = 0;
    const details = rows.map((r) => {
      const m = matMap.get(r.material_id);
      const pu = Number(m?.precio_unitario) || 0;
      const cantTotal = Number(r.rendimiento) * cantidadConcepto;
      const importe = cantTotal * pu;
      costoMateriales += importe;
      return { cantTotal, importe, pu, unidad: m?.unidad ?? "" };
    });
    const puCalculado = cantidadConcepto > 0 ? costoMateriales / cantidadConcepto : 0;
    return { details, costoMateriales, puCalculado };
  }, [rows, matMap, cantidadConcepto]);

  function addRow() {
    setRows((rs) => [...rs, { material_id: materiales[0]?.id ?? "", rendimiento: 0 }]);
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  async function persistRows() {
    const validRows = rows.filter((r) => r.material_id);
    const currentIds = new Set(validRows.filter((r) => r.id).map((r) => r.id!));
    const toDelete = Array.from(originalIds).filter((id) => !currentIds.has(id));
    if (toDelete.length > 0) {
      const { error } = await supabase.from("concepto_apu").delete().in("id", toDelete);
      if (error) throw error;
    }
    for (const r of validRows) {
      if (r.id) {
        const { error } = await supabase
          .from("concepto_apu")
          .update({ rendimiento: Number(r.rendimiento) || 0, material_id: r.material_id })
          .eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("concepto_apu").insert({
          proyecto_concepto_id: item.id,
          material_id: r.material_id,
          rendimiento: Number(r.rendimiento) || 0,
        });
        if (error) throw error;
      }
    }
  }

  async function guardar() {
    try {
      setSaving(true);
      await persistRows();
      toast.success("APU guardado");
      onOpenChange(false);
      onApplied();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function guardarYAplicar() {
    try {
      setSaving(true);
      await persistRows();
      const { error } = await supabase
        .from("proyecto_conceptos")
        .update({ precio_unitario_final: totals.puCalculado })
        .eq("id", item.id);
      if (error) throw error;
      toast.success(`P.U. actualizado a ${currency(totals.puCalculado)}`);
      onOpenChange(false);
      onApplied();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Análisis de Precios Unitarios</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="font-medium">{item.descripcion}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Cantidad de actividad:{" "}
              <span className="font-semibold tabular-nums">{cantidadConcepto}</span>{" "}
              {item.unidad} · P.U. actual:{" "}
              <span className="font-semibold tabular-nums">
                {currency(Number(item.precio_unitario_final))}
              </span>
            </div>
          </div>

          {item.es_subcontrato ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              Este concepto está marcado como <strong>Subcontrato</strong>. El costo se toma
              directamente del P.U. capturado; no aplica desglose de materiales.
            </div>
          ) : loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : materiales.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm">
              <p>No tienes materiales en tu catálogo.</p>
              <Link to="/materiales" className="mt-2 inline-flex items-center gap-1 text-primary hover:underline">
                Ir a Materiales <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2">Material</th>
                      <th className="px-2 py-2 w-20">Unidad</th>
                      <th className="px-2 py-2 w-28 text-right">Rendimiento</th>
                      <th className="px-2 py-2 w-28 text-right">Cantidad total</th>
                      <th className="px-2 py-2 w-28 text-right">P.U.</th>
                      <th className="px-2 py-2 w-28 text-right">Importe</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                          Sin materiales asignados. Agrega el primero.
                        </td>
                      </tr>
                    )}
                    {rows.map((r, i) => {
                      const det = totals.details[i];
                      return (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1.5">
                            <select
                              value={r.material_id}
                              onChange={(e) => updateRow(i, { material_id: e.target.value })}
                              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                            >
                              {materiales.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.categoria ? `[${m.categoria}] ` : ""}{m.nombre}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">
                            {det.unidad}
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              step="0.0001"
                              min={0}
                              value={r.rendimiento}
                              onChange={(e) =>
                                updateRow(i, { rendimiento: Number(e.target.value) || 0 })
                              }
                              className="h-8 text-right tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                            {det.cantTotal.toFixed(2)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {currency(det.pu)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                            {currency(det.importe)}
                          </td>
                          <td className="px-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeRow(i)}
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/30 text-sm">
                    <tr className="border-t">
                      <td colSpan={5} className="px-2 py-2 text-right font-medium">
                        Costo total de materiales
                      </td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">
                        {currency(totals.costoMateriales)}
                      </td>
                      <td></td>
                    </tr>
                    <tr>
                      <td colSpan={5} className="px-2 py-2 text-right text-muted-foreground">
                        P.U. calculado (costo / cantidad)
                      </td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums text-primary">
                        {currency(totals.puCalculado)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <Button variant="outline" size="sm" onClick={addRow}>
                <Plus className="mr-1 h-3.5 w-3.5" />Agregar material
              </Button>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="secondary" onClick={guardar} disabled={saving || loading}>
            Guardar APU
          </Button>
          <Button onClick={guardarYAplicar} disabled={saving || loading || cantidadConcepto <= 0}>
            Guardar y aplicar como P.U.
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}