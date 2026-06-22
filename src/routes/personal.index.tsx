import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase, DESPACHO_ID, DESPACHO_NOMBRE, type Personal, type PersonalCategoria } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { ArrowLeft, Plus, Search, Trash2, Phone } from "lucide-react";

export const Route = createFileRoute("/personal/")({
  head: () => ({ meta: [{ title: "Personal · Grupo Proyecta" }] }),
  component: PersonalPage,
});

const ESPECIALIDADES = ["Albañil", "Carpintero", "Aluminero", "Electricista", "Plomero", "Pintor", "Herrero", "Yesero", "Tablarroquero", "Ayudante", "Otro"];

const catStyles: Record<PersonalCategoria, string> = {
  destajista: "bg-blue-100 text-blue-700",
  contratista: "bg-purple-100 text-purple-700",
};

function PersonalPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState<"" | PersonalCategoria>("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Personal>>({
    nombre: "", categoria: "destajista", especialidad: "", telefono: "", notas: "",
  });

  const { data: personal, isLoading } = useQuery({
    queryKey: ["personal", DESPACHO_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal")
        .select("*")
        .eq("despacho_id", DESPACHO_ID)
        .order("nombre", { ascending: true });
      if (error) throw error;
      return data as Personal[];
    },
  });

  const filtered = useMemo(() => {
    const norm = q.trim().toLowerCase();
    return (personal ?? []).filter((p) => {
      if (filterCat && p.categoria !== filterCat) return false;
      if (!norm) return true;
      return (
        p.nombre.toLowerCase().includes(norm) ||
        (p.especialidad ?? "").toLowerCase().includes(norm) ||
        (p.telefono ?? "").toLowerCase().includes(norm)
      );
    });
  }, [personal, q, filterCat]);

  async function crear() {
    if (!form.nombre?.trim()) return toast.error("Nombre requerido");
    if (!form.categoria) return toast.error("Categoría requerida");
    const { error } = await supabase.from("personal").insert({
      despacho_id: DESPACHO_ID,
      nombre: form.nombre.trim(),
      categoria: form.categoria,
      especialidad: form.especialidad || null,
      telefono: form.telefono || null,
      notas: form.notas || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Personal agregado");
    setOpen(false);
    setForm({ nombre: "", categoria: "destajista", especialidad: "", telefono: "", notas: "" });
    qc.invalidateQueries({ queryKey: ["personal", DESPACHO_ID] });
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar esta persona? Se borrarán también sus asignaciones y pagos.")) return;
    const { error } = await supabase.from("personal").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Eliminado");
    qc.invalidateQueries({ queryKey: ["personal", DESPACHO_ID] });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Personal</h1>
              <p className="text-xs text-muted-foreground">
                {DESPACHO_NOMBRE} · Destajistas y contratistas
              </p>
            </div>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />Nuevo
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nombre, especialidad o teléfono…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border bg-card p-1 text-xs">
            {([
              { v: "", label: "Todos" },
              { v: "destajista", label: "Destajistas" },
              { v: "contratista", label: "Contratistas" },
            ] as const).map((opt) => (
              <button
                key={opt.v}
                onClick={() => setFilterCat(opt.v as "" | PersonalCategoria)}
                className={`rounded px-3 py-1.5 font-medium transition-colors ${filterCat === opt.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} personas</span>
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3 w-32">Categoría</th>
                <th className="px-4 py-3">Especialidad</th>
                <th className="px-4 py-3 w-40">Teléfono</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Cargando…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Sin personal. Agrega el primero con “Nuevo”.
                </td></tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id} className="cursor-pointer border-t hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      to="/personal/$id"
                      params={{ id: p.id }}
                      className="font-medium text-foreground hover:underline"
                    >
                      {p.nombre}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${catStyles[p.categoria]}`}>
                      {p.categoria}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.especialidad ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {p.telefono ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3 text-muted-foreground" />{p.telefono}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => eliminar(p.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Registrar personal</SheetTitle>
            <SheetDescription>Destajistas o contratistas que trabajan en tus proyectos.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">Nombre completo</label>
              <Input className="mt-1" value={form.nombre ?? ""} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Categoría</label>
              <select
                value={form.categoria ?? "destajista"}
                onChange={(e) => setForm({ ...form, categoria: e.target.value as PersonalCategoria })}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="destajista">Destajista</option>
                <option value="contratista">Contratista</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Especialidad</label>
              <Input
                className="mt-1"
                list="especialidades-list"
                placeholder="Albañil, carpintero…"
                value={form.especialidad ?? ""}
                onChange={(e) => setForm({ ...form, especialidad: e.target.value })}
              />
              <datalist id="especialidades-list">
                {ESPECIALIDADES.map((e) => <option key={e} value={e} />)}
              </datalist>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Teléfono</label>
              <Input className="mt-1" value={form.telefono ?? ""} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notas</label>
              <Textarea className="mt-1" rows={3} value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
          </div>
          <SheetFooter className="mt-6">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={crear}>Guardar</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}