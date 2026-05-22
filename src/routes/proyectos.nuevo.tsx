import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase, DESPACHO_ID, type TipoProyecto } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/proyectos/nuevo")({
  head: () => ({ meta: [{ title: "Nuevo proyecto · Grupo Proyecta" }] }),
  component: NuevoProyecto,
});

function NuevoProyecto() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nombre: "",
    cliente_nombre: "",
    cliente_email: "",
    cliente_telefono: "",
    domicilio: "",
    tipo_proyecto_id: "",
    descripcion: "",
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre || !form.cliente_nombre) {
      toast.error("Completa nombre del proyecto y cliente");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("obras")
        .insert({
          despacho_id: DESPACHO_ID,
          nombre: form.nombre,
          cliente_nombre: form.cliente_nombre,
          cliente_email: form.cliente_email || null,
          cliente_telefono: form.cliente_telefono || null,
          domicilio: form.domicilio || null,
          tipo_proyecto_id: form.tipo_proyecto_id || null,
          descripcion: form.descripcion || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Proyecto creado");
      navigate({ to: "/proyectos/$obraId", params: { obraId: data.id } });
    } catch (err) {
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
          <h1 className="text-lg font-semibold tracking-tight">Nuevo proyecto</h1>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10">
        <form onSubmit={onSubmit} className="space-y-5 rounded-lg border bg-card p-6">
          <div className="space-y-2">
            <Label>Nombre del proyecto</Label>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Teléfono del cliente</Label>
              <Input value={form.cliente_telefono} onChange={(e) => setForm({ ...form, cliente_telefono: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Tipo de proyecto</Label>
              <select
                value={form.tipo_proyecto_id}
                onChange={(e) => setForm({ ...form, tipo_proyecto_id: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Selecciona…</option>
                {tipos?.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Domicilio de obra</Label>
            <Input value={form.domicilio} onChange={(e) => setForm({ ...form, domicilio: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Descripción breve</Label>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Link to="/"><Button type="button" variant="outline">Cancelar</Button></Link>
            <Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </div>
        </form>
      </main>
    </div>
  );
}