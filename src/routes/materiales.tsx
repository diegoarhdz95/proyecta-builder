import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase, DESPACHO_ID, DESPACHO_NOMBRE, type Material } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Plus, Search, Trash2, Save, Upload } from "lucide-react";
import { ImportMaterialesDialog } from "@/components/ImportMaterialesDialog";

export const Route = createFileRoute("/materiales")({
  head: () => ({ meta: [{ title: "Materiales · Grupo Proyecta" }] }),
  component: MaterialesPage,
});

const UNIDADES = ["pieza", "bulto", "kg", "ton", "m", "m2", "m3", "L", "cubeta", "rollo", "lote"];

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

function MaterialesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const [draft, setDraft] = useState<Partial<Material> | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { data: materiales, isLoading } = useQuery({
    queryKey: ["materiales", DESPACHO_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materiales")
        .select("*")
        .eq("despacho_id", DESPACHO_ID)
        .order("categoria", { ascending: true })
        .order("nombre", { ascending: true });
      if (error) throw error;
      return data as Material[];
    },
  });

  const categorias = useMemo(() => {
    const s = new Set<string>();
    (materiales ?? []).forEach((m) => m.categoria && s.add(m.categoria));
    return Array.from(s).sort();
  }, [materiales]);

  const filtered = useMemo(() => {
    const norm = q.trim().toLowerCase();
    return (materiales ?? []).filter((m) => {
      if (cat && m.categoria !== cat) return false;
      if (!norm) return true;
      return (
        m.nombre.toLowerCase().includes(norm) ||
        (m.categoria ?? "").toLowerCase().includes(norm) ||
        m.unidad.toLowerCase().includes(norm)
      );
    });
  }, [materiales, q, cat]);

  async function saveRow(row: Material, patch: Partial<Material>) {
    const { error } = await supabase
      .from("materiales")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["materiales", DESPACHO_ID] });
  }

  async function deleteRow(id: string) {
    if (!confirm("¿Eliminar este material?")) return;
    const { error } = await supabase.from("materiales").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["materiales", DESPACHO_ID] });
    toast.success("Material eliminado");
  }

  async function createDraft() {
    if (!draft?.nombre || !draft?.unidad) {
      toast.error("Nombre y unidad son requeridos");
      return;
    }
    const { error } = await supabase.from("materiales").insert({
      despacho_id: DESPACHO_ID,
      nombre: draft.nombre,
      categoria: draft.categoria || null,
      unidad: draft.unidad,
      precio_unitario: Number(draft.precio_unitario) || 0,
    });
    if (error) return toast.error(error.message);
    setDraft(null);
    qc.invalidateQueries({ queryKey: ["materiales", DESPACHO_ID] });
    toast.success("Material agregado");
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
              <h1 className="text-lg font-semibold tracking-tight">Materiales</h1>
              <p className="text-xs text-muted-foreground">
                {DESPACHO_NOMBRE} · Base de materiales para Análisis de Precios Unitarios
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />Importar precios
            </Button>
            <Button
              onClick={() =>
                setDraft({ nombre: "", categoria: "", unidad: "pieza", precio_unitario: 0 })
              }
            >
              <Plus className="mr-2 h-4 w-4" />Nuevo material
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar material…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} materiales
          </span>
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2 w-40">Categoría</th>
                <th className="px-3 py-2 w-28">Unidad</th>
                <th className="px-3 py-2 w-36 text-right">Precio unitario</th>
                <th className="px-3 py-2 w-32">Actualizado</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {draft && (
                <tr className="border-t bg-primary/5">
                  <td className="px-3 py-2">
                    <Input
                      autoFocus
                      placeholder="Nombre del material"
                      value={draft.nombre ?? ""}
                      onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
                      className="h-8"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      placeholder="Categoría"
                      value={draft.categoria ?? ""}
                      onChange={(e) => setDraft({ ...draft, categoria: e.target.value })}
                      className="h-8"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={draft.unidad ?? "pieza"}
                      onChange={(e) => setDraft({ ...draft, unidad: e.target.value })}
                      className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    >
                      {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input
                      type="number"
                      step="0.01"
                      value={draft.precio_unitario ?? 0}
                      onChange={(e) =>
                        setDraft({ ...draft, precio_unitario: Number(e.target.value) })
                      }
                      className="h-8 text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">—</td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={createDraft}>
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground"
                        onClick={() => setDraft(null)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
              {isLoading && (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">Cargando…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && !draft && (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                  Sin materiales. Crea el primero con “Nuevo material”.
                </td></tr>
              )}
              {filtered.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-3 py-1.5">
                    <Input
                      defaultValue={m.nombre}
                      onBlur={(e) => e.target.value !== m.nombre && saveRow(m, { nombre: e.target.value })}
                      className="h-8 border-transparent shadow-none focus-visible:border-input"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input
                      defaultValue={m.categoria ?? ""}
                      onBlur={(e) => e.target.value !== (m.categoria ?? "") && saveRow(m, { categoria: e.target.value || null })}
                      className="h-8 border-transparent shadow-none focus-visible:border-input"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      defaultValue={m.unidad}
                      onChange={(e) => saveRow(m, { unidad: e.target.value })}
                      className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm hover:border-input focus:border-input"
                    >
                      {[...new Set([...UNIDADES, m.unidad])].map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <Input
                      type="number"
                      step="0.01"
                      defaultValue={m.precio_unitario}
                      onBlur={(e) => {
                        const v = Number(e.target.value) || 0;
                        if (v !== Number(m.precio_unitario)) saveRow(m, { precio_unitario: v });
                      }}
                      className="h-8 text-right tabular-nums border-transparent shadow-none focus-visible:border-input"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground tabular-nums">
                    {m.updated_at
                      ? new Date(m.updated_at).toLocaleDateString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="px-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteRow(m.id)}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          Edita un campo y presiona Tab o sal de la celda para guardar automáticamente. Estos materiales se usan en el desglose APU de cada concepto de cotización.
        </p>

        <ImportMaterialesDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          existing={materiales ?? []}
          onImported={() => qc.invalidateQueries({ queryKey: ["materiales", DESPACHO_ID] })}
        />
      </main>
    </div>
  );
}

