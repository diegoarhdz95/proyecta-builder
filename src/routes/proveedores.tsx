import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase, DESPACHO_ID, DESPACHO_NOMBRE } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/proveedores")({
  head: () => ({
    meta: [
      { title: "Proveedores y materiales · Grupo Proyecta" },
      { name: "description", content: "Catálogo de proveedores y materiales con tiempos de entrega." },
    ],
  }),
  component: ProveedoresPage,
});

type Proveedor = {
  id: string;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
};

type Material = {
  id: string;
  proveedor_id: string;
  concepto_id: string | null;
  material: string;
  tiempo_entrega_dias: number;
  notas: string | null;
};

function ProveedoresPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    contacto: "",
    telefono: "",
    email: "",
    notas: "",
  });

  const { data: proveedores } = useQuery({
    queryKey: ["proveedores", DESPACHO_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proveedores")
        .select("*")
        .eq("despacho_id", DESPACHO_ID)
        .order("nombre");
      if (error) throw error;
      return data as Proveedor[];
    },
  });

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) return toast.error("Nombre requerido");
    const { error } = await supabase.from("proveedores").insert({
      despacho_id: DESPACHO_ID,
      nombre: form.nombre.trim(),
      contacto: form.contacto || null,
      telefono: form.telefono || null,
      email: form.email || null,
      notas: form.notas || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Proveedor creado");
    setForm({ nombre: "", contacto: "", telefono: "", email: "", notas: "" });
    setOpenNew(false);
    qc.invalidateQueries({ queryKey: ["proveedores"] });
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar proveedor y todos sus materiales?")) return;
    const { error } = await supabase.from("proveedores").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Proveedor eliminado");
    if (selected === id) setSelected(null);
    qc.invalidateQueries({ queryKey: ["proveedores"] });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <Link to="/"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{DESPACHO_NOMBRE}</h1>
              <p className="text-xs text-muted-foreground">Proveedores y materiales</p>
            </div>
          </div>
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Nuevo proveedor</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nuevo proveedor</DialogTitle></DialogHeader>
              <form onSubmit={crear} className="space-y-3">
                <Field label="Nombre" value={form.nombre} onChange={(v) => setForm({ ...form, nombre: v })} />
                <Field label="Contacto" value={form.contacto} onChange={(v) => setForm({ ...form, contacto: v })} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Teléfono" value={form.telefono} onChange={(v) => setForm({ ...form, telefono: v })} />
                  <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Notas</label>
                  <Textarea className="mt-1" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
                </div>
                <DialogFooter>
                  <Button type="submit">Guardar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8 md:grid-cols-[320px_1fr]">
        <aside className="space-y-2">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Proveedores</h2>
          {proveedores?.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin proveedores aún</p>
          )}
          {proveedores?.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`flex w-full items-center justify-between rounded-md border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 ${selected === p.id ? "border-primary ring-1 ring-primary" : ""}`}
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{p.nombre}</div>
                {p.contacto && <div className="text-xs text-muted-foreground truncate">{p.contacto}</div>}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </aside>

        <section>
          {selected ? (
            <MaterialesPanel
              proveedor={proveedores!.find((p) => p.id === selected)!}
              onDeleteProveedor={() => eliminar(selected)}
            />
          ) : (
            <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
              Selecciona un proveedor para ver sus materiales.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input className="mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function MaterialesPanel({ proveedor, onDeleteProveedor }: { proveedor: Proveedor; onDeleteProveedor: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    material: "",
    concepto_id: "",
    tiempo_entrega_dias: "7",
    notas: "",
  });

  const { data: materiales } = useQuery({
    queryKey: ["materiales_proveedor", proveedor.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materiales_proveedor")
        .select("*")
        .eq("proveedor_id", proveedor.id)
        .order("material");
      if (error) throw error;
      return data as Material[];
    },
  });

  const { data: conceptos } = useQuery({
    queryKey: ["conceptos_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conceptos")
        .select("id, clave, descripcion")
        .order("clave");
      if (error) throw error;
      return data as { id: string; clave: string; descripcion: string }[];
    },
  });

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!form.material.trim()) return toast.error("Material requerido");
    const { error } = await supabase.from("materiales_proveedor").insert({
      proveedor_id: proveedor.id,
      concepto_id: form.concepto_id || null,
      material: form.material.trim(),
      tiempo_entrega_dias: Number(form.tiempo_entrega_dias) || 0,
      notas: form.notas || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Material agregado");
    setForm({ material: "", concepto_id: "", tiempo_entrega_dias: "7", notas: "" });
    qc.invalidateQueries({ queryKey: ["materiales_proveedor", proveedor.id] });
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar material?")) return;
    const { error } = await supabase.from("materiales_proveedor").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Material eliminado");
    qc.invalidateQueries({ queryKey: ["materiales_proveedor", proveedor.id] });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{proveedor.nombre}</h2>
            <div className="mt-1 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
              {proveedor.contacto && <div>Contacto: {proveedor.contacto}</div>}
              {proveedor.telefono && <div>Tel: {proveedor.telefono}</div>}
              {proveedor.email && <div>Email: {proveedor.email}</div>}
            </div>
            {proveedor.notas && <p className="mt-2 text-sm">{proveedor.notas}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onDeleteProveedor} aria-label="Eliminar proveedor">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Material</th>
              <th className="px-4 py-3">Concepto</th>
              <th className="px-4 py-3 text-right">Entrega (días)</th>
              <th className="px-4 py-3">Notas</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(materiales ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin materiales</td></tr>
            )}
            {materiales?.map((m) => {
              const c = conceptos?.find((cc) => cc.id === m.concepto_id);
              return (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-2.5 font-medium">{m.material}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c ? `${c.clave} · ${c.descripcion}` : "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{m.tiempo_entrega_dias}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{m.notas ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="icon" onClick={() => eliminar(m.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form onSubmit={crear} className="rounded-lg border bg-card p-5">
        <h3 className="text-sm font-semibold">Nuevo material</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Material" value={form.material} onChange={(v) => setForm({ ...form, material: v })} />
          <div>
            <label className="text-xs text-muted-foreground">Concepto relacionado</label>
            <select
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={form.concepto_id}
              onChange={(e) => setForm({ ...form, concepto_id: e.target.value })}
            >
              <option value="">— sin concepto —</option>
              {conceptos?.map((c) => (
                <option key={c.id} value={c.id}>{c.clave} · {c.descripcion}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tiempo de entrega (días)</label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              value={form.tiempo_entrega_dias}
              onChange={(e) => setForm({ ...form, tiempo_entrega_dias: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notas</label>
            <Input className="mt-1" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit"><Plus className="mr-2 h-4 w-4" />Agregar material</Button>
        </div>
      </form>
    </div>
  );
}
