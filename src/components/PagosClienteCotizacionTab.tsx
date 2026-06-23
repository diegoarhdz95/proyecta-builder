import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, DESPACHO_ID, type Proyecto } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Plus, Trash2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { downloadOrShareReciboPDF } from "@/lib/generate-recibo-pdf";

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

type Pago = {
  id: string;
  proyecto_id: string;
  concepto: string;
  monto: number;
  fecha_pago: string;
  metodo_pago: string | null;
  notas: string | null;
  numero_pago?: number | null;
};

export function PagosClienteCotizacionTab({ proyectoId }: { proyectoId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    concepto: "",
    monto: "",
    fecha_pago: new Date().toISOString().slice(0, 10),
    metodo_pago: "Transferencia",
    notas: "",
  });

  const { data: proyecto } = useQuery({
    queryKey: ["pagos_proy_one", proyectoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select("id, folio, nombre_proyecto, total_con_iva, cliente_nombre")
        .eq("id", proyectoId).single();
      if (error) throw error;
      return data as Pick<Proyecto, "id" | "folio" | "nombre_proyecto" | "total_con_iva" | "cliente_nombre">;
    },
  });

  const { data: despacho } = useQuery({
    queryKey: ["despacho", DESPACHO_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("despachos").select("nombre, logo_url").eq("id", DESPACHO_ID).single();
      if (error) throw error;
      return data as { nombre: string; logo_url: string | null };
    },
  });

  const { data: pagos } = useQuery({
    queryKey: ["pagos_cliente_proy", proyectoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos_cliente").select("*").eq("proyecto_id", proyectoId)
        .order("fecha_pago", { ascending: false });
      if (error) throw error;
      return data as Pago[];
    },
  });

  const total = Number(proyecto?.total_con_iva || 0);
  const pagado = (pagos ?? []).reduce((s, p) => s + Number(p.monto || 0), 0);
  const saldo = total - pagado;
  const pct = total > 0 ? (pagado / total) * 100 : 0;

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.concepto.trim()) return toast.error("Concepto requerido");
    const monto = Number(form.monto);
    if (!monto || monto <= 0) return toast.error("Monto inválido");
    const { error } = await supabase.from("pagos_cliente").insert({
      proyecto_id: proyectoId,
      concepto: form.concepto.trim(),
      monto,
      fecha_pago: form.fecha_pago,
      metodo_pago: form.metodo_pago || null,
      notas: form.notas || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Pago registrado");
    setForm({ ...form, concepto: "", monto: "", notas: "" });
    qc.invalidateQueries({ queryKey: ["pagos_cliente_proy", proyectoId] });
    qc.invalidateQueries({ queryKey: ["cotizacion_resumen_fin"] });
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este pago?")) return;
    const { error } = await supabase.from("pagos_cliente").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Pago eliminado");
    qc.invalidateQueries({ queryKey: ["pagos_cliente_proy", proyectoId] });
    qc.invalidateQueries({ queryKey: ["cotizacion_resumen_fin"] });
  }

  async function generarRecibo(p: Pago) {
    try {
      if (!proyecto) return;
      let numero = p.numero_pago ?? null;
      if (!numero) {
        const { data: maxRow, error: maxErr } = await supabase
          .from("pagos_cliente")
          .select("numero_pago, proyectos!inner(despacho_id)")
          .eq("proyectos.despacho_id", DESPACHO_ID)
          .not("numero_pago", "is", null)
          .order("numero_pago", { ascending: false }).limit(1);
        if (maxErr) throw maxErr;
        const last = (maxRow?.[0]?.numero_pago as number | null) ?? 0;
        numero = last + 1;
        const { error: upErr } = await supabase
          .from("pagos_cliente").update({ numero_pago: numero }).eq("id", p.id);
        if (upErr) throw upErr;
        qc.invalidateQueries({ queryKey: ["pagos_cliente_proy", proyectoId] });
      }
      await downloadOrShareReciboPDF({
        despacho: despacho ?? { nombre: "Grupo Proyecta", logo_url: null },
        numeroRecibo: numero,
        proyectoNombre: proyecto.nombre_proyecto,
        folio: proyecto.folio,
        clienteNombre: proyecto.cliente_nombre || "",
        monto: Number(p.monto),
        concepto: p.concepto,
        fechaPago: p.fecha_pago,
        metodoPago: p.metodo_pago,
        notas: p.notas,
      });
      toast.success(`Recibo #${String(numero).padStart(5, "0")} generado`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total cotización" value={total} />
        <Stat label="Cobrado" value={pagado} />
        <Stat label="Pendiente" value={saldo} />
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">% cobrado</p>
          <p className="mt-2 text-lg font-semibold tabular-nums">{pct.toFixed(1)}%</p>
          <Progress value={Math.min(pct, 100)} className="mt-2" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Concepto</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3">Método</th>
              <th className="px-4 py-3">Notas</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(pagos ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sin pagos registrados</td></tr>
            )}
            {pagos?.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2.5 tabular-nums">{p.fecha_pago}</td>
                <td className="px-4 py-2.5">{p.concepto}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{currency(p.monto)}</td>
                <td className="px-4 py-2.5">{p.metodo_pago ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.notas ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => generarRecibo(p)}>
                      <FileDown className="mr-1 h-3.5 w-3.5" />Recibo
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => eliminar(p.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={registrar} className="rounded-lg border bg-card p-5">
        <h3 className="text-sm font-semibold">Registrar nuevo pago</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="text-xs text-muted-foreground">Concepto</label>
            <Input className="mt-1" placeholder="Anticipo, Estimación 1…" value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Monto</label>
            <Input className="mt-1" type="number" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Fecha</label>
            <Input className="mt-1" type="date" value={form.fecha_pago} onChange={(e) => setForm({ ...form, fecha_pago: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Método de pago</label>
            <Input className="mt-1" value={form.metodo_pago} onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })} />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className="text-xs text-muted-foreground">Notas</label>
            <Textarea className="mt-1" rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit"><Plus className="mr-2 h-4 w-4" />Registrar pago</Button>
        </div>
      </form>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold tabular-nums">{currency(value)}</p>
    </div>
  );
}