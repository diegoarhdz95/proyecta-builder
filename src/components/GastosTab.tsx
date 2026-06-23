import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, DESPACHO_ID, type Proyecto, type GastoCategoria, type GastoProyecto } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Package, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

const CAT_META: Record<GastoCategoria, { label: string; cls: string }> = {
  materiales: { label: "Materiales", cls: "bg-blue-100 text-blue-700" },
  otros: { label: "Otros", cls: "bg-amber-100 text-amber-700" },
};

export function GastosTab({ obraId, proyectoId }: { obraId?: string; proyectoId?: string }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>("");
  const [form, setForm] = useState({
    categoria: "materiales" as GastoCategoria,
    concepto: "",
    proveedor: "",
    monto: "",
    fecha_pago: new Date().toISOString().slice(0, 10),
    metodo_pago: "",
    notas: "",
  });

  const { data: cotizaciones } = useQuery({
    queryKey: ["cotizaciones_obra_gastos", obraId ?? ""],
    enabled: !!obraId && !proyectoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos").select("id, folio, nombre_proyecto")
        .eq("despacho_id", DESPACHO_ID).eq("obra_id", obraId!)
        .order("folio", { ascending: false });
      if (error) throw error;
      return data as Pick<Proyecto, "id" | "folio" | "nombre_proyecto">[];
    },
  });

  const cotizacionId = proyectoId || selectedId || cotizaciones?.[0]?.id || "";

  const { data: gastos } = useQuery({
    queryKey: ["gastos_proyecto", cotizacionId],
    enabled: !!cotizacionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gastos_proyecto").select("*").eq("proyecto_id", cotizacionId)
        .order("fecha_pago", { ascending: false });
      if (error) throw error;
      return data as GastoProyecto[];
    },
  });

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!cotizacionId) return toast.error("Selecciona una cotización");
    if (!form.concepto.trim()) return toast.error("Concepto requerido");
    const monto = Number(form.monto);
    if (!monto || monto <= 0) return toast.error("Monto inválido");
    const { error } = await supabase.from("gastos_proyecto").insert({
      despacho_id: DESPACHO_ID,
      proyecto_id: cotizacionId,
      categoria: form.categoria,
      concepto: form.concepto.trim(),
      proveedor: form.proveedor || null,
      monto,
      fecha_pago: form.fecha_pago,
      metodo_pago: form.metodo_pago || null,
      notas: form.notas || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Gasto registrado");
    setForm({ ...form, concepto: "", proveedor: "", monto: "", notas: "" });
    qc.invalidateQueries({ queryKey: ["gastos_proyecto", cotizacionId] });
    qc.invalidateQueries({ queryKey: ["corte_gastos", cotizacionId] });
    qc.invalidateQueries({ queryKey: ["cotizacion_resumen_fin"] });
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este gasto?")) return;
    const { error } = await supabase.from("gastos_proyecto").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Gasto eliminado");
    qc.invalidateQueries({ queryKey: ["gastos_proyecto", cotizacionId] });
    qc.invalidateQueries({ queryKey: ["corte_gastos", cotizacionId] });
    qc.invalidateQueries({ queryKey: ["cotizacion_resumen_fin"] });
  }

  const total = (gastos ?? []).reduce((s, g) => s + Number(g.monto || 0), 0);

  return (
    <div className="space-y-5">
      {!proyectoId && (cotizaciones?.length ?? 0) > 1 && (
        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Cotización</label>
          <select
            value={cotizacionId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm md:w-96"
          >
            {cotizaciones?.map((c) => (
              <option key={c.id} value={c.id}>{c.folio} · {c.nombre_proyecto}</option>
            ))}
          </select>
        </div>
      )}

      <form onSubmit={registrar} className="rounded-lg border bg-card p-4 grid gap-3 md:grid-cols-12">
        <div className="md:col-span-2">
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Categoría</label>
          <select
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value as GastoCategoria })}
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="materiales">Materiales</option>
            <option value="otros">Otros</option>
          </select>
        </div>
        <div className="md:col-span-3">
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Concepto</label>
          <Input className="mt-1" value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} placeholder="Cemento, varilla, flete…" />
        </div>
        <div className="md:col-span-3">
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Proveedor</label>
          <Input className="mt-1" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Monto</label>
          <Input className="mt-1" type="number" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Fecha</label>
          <Input className="mt-1" type="date" value={form.fecha_pago} onChange={(e) => setForm({ ...form, fecha_pago: e.target.value })} />
        </div>
        <div className="md:col-span-3">
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Método de pago</label>
          <Input className="mt-1" value={form.metodo_pago} onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })} placeholder="Efectivo, transferencia…" />
        </div>
        <div className="md:col-span-7">
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Notas</label>
          <Textarea className="mt-1" rows={1} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </div>
        <div className="md:col-span-2 flex items-end">
          <Button type="submit" className="w-full"><Plus className="mr-2 h-4 w-4" />Registrar</Button>
        </div>
      </form>

      {/* Mobile card list */}
      <div className="space-y-2 md:hidden">
        {(gastos ?? []).length === 0 && (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            Sin gastos registrados
          </div>
        )}
        {gastos?.map((g) => {
          const meta = CAT_META[g.categoria];
          const Icon = g.categoria === "materiales" ? Package : MoreHorizontal;
          return (
            <div key={g.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${meta.cls}`}>
                      <Icon className="h-3 w-3" />{meta.label}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{g.fecha_pago}</span>
                  </div>
                  <p className="mt-1.5 truncate text-sm font-medium">{g.concepto}</p>
                  {g.proveedor && <p className="truncate text-xs text-muted-foreground">{g.proveedor}</p>}
                </div>
                <div className="text-right">
                  <p className="text-base font-semibold tabular-nums">{currency(Number(g.monto))}</p>
                  <Button size="icon" variant="ghost" className="mt-1 h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => eliminar(g.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        {(gastos ?? []).length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3 text-right font-semibold">
            Total <span className="tabular-nums">{currency(total)}</span>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 w-28">Fecha</th>
              <th className="px-4 py-3 w-32">Categoría</th>
              <th className="px-4 py-3">Concepto</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3 text-right w-32">Monto</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {(gastos ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Sin gastos registrados</td></tr>
            )}
            {gastos?.map((g) => {
              const meta = CAT_META[g.categoria];
              const Icon = g.categoria === "materiales" ? Package : MoreHorizontal;
              return (
                <tr key={g.id} className="border-t">
                  <td className="px-4 py-2.5 tabular-nums">{g.fecha_pago}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${meta.cls}`}>
                      <Icon className="h-3 w-3" />{meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{g.concepto}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{g.proveedor ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{currency(Number(g.monto))}</td>
                  <td className="px-2">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => eliminar(g.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {(gastos ?? []).length > 0 && (
              <tr className="border-t bg-muted/30 font-semibold">
                <td colSpan={4} className="px-4 py-2.5 text-right">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{currency(total)}</td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}