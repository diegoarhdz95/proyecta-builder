import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase, DESPACHO_ID, type TipoProyecto } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/cotizaciones/nueva")({
  head: () => ({ meta: [{ title: "Nueva cotización · Grupo Proyecta" }] }),
  component: NuevaCotizacion,
});

function NuevaCotizacion() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nombre_proyecto: "",
    cliente_nombre: "",
    cliente_email: "",
    domicilio_obra: "",
    tipo_proyecto_id: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: tipos } = useQuery({
    queryKey: ["tipos_proyecto"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_proyecto")
        .select("id, nombre")
        .eq("despacho_id", DESPACHO_ID)
        .order("nombre");
      if (error) throw error;
      return data as TipoProyecto[];
    },
  });

  async function generarFolio(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `COT-${year}-`;
    const { data, error } = await supabase
      .from("proyectos")
      .select("folio")
      .eq("despacho_id", DESPACHO_ID)
      .like("folio", `${prefix}%`)
      .order("folio", { ascending: false })
      .limit(1);
    if (error) throw error;
    let next = 1;
    if (data?.[0]?.folio) {
      const n = parseInt(data[0].folio.split("-")[2] ?? "0", 10);
      if (!Number.isNaN(n)) next = n + 1;
    }
    return `${prefix}${String(next).padStart(4, "0")}`;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre_proyecto || !form.cliente_nombre) {
      toast.error("Completa nombre del proyecto y cliente");
      return;
    }
    setSaving(true);
    try {
      const folio = await generarFolio();
      const payload: Record<string, unknown> = {
        despacho_id: DESPACHO_ID,
        folio,
        nombre_proyecto: form.nombre_proyecto,
        cliente_nombre: form.cliente_nombre,
        cliente_email: form.cliente_email || null,
        tipo_proyecto_id: form.tipo_proyecto_id || null,
        subtotal: 0,
        iva: 0,
        total_con_iva: 0,
        estado: "borrador",
      };
      if (form.domicilio_obra) payload.domicilio_obra = form.domicilio_obra;

      const { data, error } = await supabase
        .from("proyectos")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      toast.success(`Cotización ${folio} creada`);
      navigate({ to: "/cotizaciones/$id/editar", params: { id: data.id } });
    } catch (err) {
      console.error(err);
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-5">
          <Link to="/" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="text-lg font-semibold tracking-tight">Nueva cotización</h1>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10">
        <form onSubmit={onSubmit} className="space-y-5 rounded-lg border bg-card p-6">
          <div className="space-y-2">
            <Label>Nombre del proyecto</Label>
            <Input value={form.nombre_proyecto} onChange={(e) => setForm({ ...form, nombre_proyecto: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Input value={form.cliente_nombre} onChange={(e) => setForm({ ...form, cliente_nombre: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email del cliente</Label>
              <Input type="email" value={form.cliente_email} onChange={(e) => setForm({ ...form, cliente_email: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Domicilio de obra</Label>
            <Input value={form.domicilio_obra} onChange={(e) => setForm({ ...form, domicilio_obra: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Tipo de proyecto</Label>
            <select
              value={form.tipo_proyecto_id}
              onChange={(e) => setForm({ ...form, tipo_proyecto_id: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Selecciona...</option>
              {tipos?.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Link to="/"><Button type="button" variant="outline">Cancelar</Button></Link>
            <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Crear cotización"}</Button>
          </div>
        </form>
      </main>
    </div>
  );
}