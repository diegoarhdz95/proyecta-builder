import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase, DESPACHO_ID, DESPACHO_NOMBRE, type Partida } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";

export const Route = createFileRoute("/catalogo")({
  head: () => ({ meta: [{ title: "Catálogo · Grupo Proyecta" }] }),
  component: Catalogo,
});

type ConceptoFull = {
  id: string;
  partida_id: string;
  clave: string;
  descripcion: string;
  especificaciones: string | null;
  unidad: string;
  costo_materiales: number;
  costo_mano_obra: number;
  costo_herramienta: number;
  factor_desperdicio: number;
  factor_indirectos: number;
  factor_utilidad: number;
  precio_unitario: number;
};

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
}

function calcPrecio(c: {
  costo_materiales: number;
  costo_mano_obra: number;
  costo_herramienta: number;
  factor_desperdicio: number;
  factor_indirectos: number;
  factor_utilidad: number;
}) {
  const base = Number(c.costo_materiales || 0) + Number(c.costo_mano_obra || 0) + Number(c.costo_herramienta || 0);
  const conDesp = base * (1 + Number(c.factor_desperdicio || 0));
  const conInd = conDesp * (1 + Number(c.factor_indirectos || 0));
  return conInd * (1 + Number(c.factor_utilidad || 0));
}

function computeNextClave(last: string | undefined, partidaClave?: string): string {
  if (last) {
    const m = last.match(/^(.*?)(\d+)\s*$/);
    if (m) {
      const width = m[2].length;
      const next = String(Number(m[2]) + 1).padStart(width, "0");
      return `${m[1]}${next}`;
    }
    return `${last}-001`;
  }
  const prefix = (partidaClave || "GEN").trim();
  return `${prefix}-001`;
}

type FormState = {
  id?: string;
  partida_id: string;
  clave: string;
  descripcion: string;
  especificaciones: string;
  unidad: string;
  costo_materiales: number;
  costo_mano_obra: number;
  costo_herramienta: number;
  factor_desperdicio: number;
  factor_indirectos: number;
  factor_utilidad: number;
};

const emptyForm = (partida_id = ""): FormState => ({
  partida_id,
  clave: "",
  descripcion: "",
  especificaciones: "",
  unidad: "PZA",
  costo_materiales: 0,
  costo_mano_obra: 0,
  costo_herramienta: 0,
  factor_desperdicio: 0,
  factor_indirectos: 0,
  factor_utilidad: 0,
});

function Catalogo() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<FormState | null>(null);
  const [isNew, setIsNew] = useState(false);

  const { data: partidas, isLoading: loadingP } = useQuery({
    queryKey: ["partidas", DESPACHO_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partidas")
        .select("*")
        .eq("despacho_id", DESPACHO_ID)
        .order("orden");
      if (error) throw error;
      return data as Partida[];
    },
  });

  function toggle(pid: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(pid)) n.delete(pid);
      else n.add(pid);
      return n;
    });
  }

  async function handleSave() {
    if (!editing) return;
    const payload = {
      partida_id: editing.partida_id,
      clave: editing.clave,
      descripcion: editing.descripcion,
      especificaciones: editing.especificaciones || null,
      unidad: editing.unidad,
      costo_materiales: Number(editing.costo_materiales) || 0,
      costo_mano_obra: Number(editing.costo_mano_obra) || 0,
      costo_herramienta: Number(editing.costo_herramienta) || 0,
      factor_desperdicio: Number(editing.factor_desperdicio) || 0,
      factor_indirectos: Number(editing.factor_indirectos) || 0,
      factor_utilidad: Number(editing.factor_utilidad) || 0,
    };
    if (!payload.partida_id || !payload.descripcion) {
      toast.error("Partida y descripción son requeridos");
      return;
    }
    if (isNew) {
      const { error } = await supabase.from("conceptos").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Concepto creado");
    } else if (editing.id) {
      const { error } = await supabase.from("conceptos").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Concepto actualizado");
    }
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["catalogo-conceptos"] });
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
              <h1 className="text-lg font-semibold tracking-tight">Catálogo</h1>
              <p className="text-xs text-muted-foreground">{DESPACHO_NOMBRE} · Partidas y conceptos</p>
            </div>
          </div>
          <Button onClick={() => { setIsNew(true); setEditing(emptyForm(partidas?.[0]?.id ?? "")); }}>
            <Plus className="mr-2 h-4 w-4" />Nuevo concepto
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="overflow-hidden rounded-lg border bg-card">
          {loadingP && <div className="p-6 text-center text-muted-foreground text-sm">Cargando...</div>}
          {partidas?.map((p) => (
            <PartidaRow
              key={p.id}
              partida={p}
              expanded={expanded.has(p.id)}
              onToggle={() => toggle(p.id)}
              onEdit={(c) => { setIsNew(false); setEditing({
                id: c.id,
                partida_id: c.partida_id,
                clave: c.clave ?? "",
                descripcion: c.descripcion ?? "",
                especificaciones: c.especificaciones ?? "",
                unidad: c.unidad ?? "",
                costo_materiales: Number(c.costo_materiales) || 0,
                costo_mano_obra: Number(c.costo_mano_obra) || 0,
                costo_herramienta: Number(c.costo_herramienta) || 0,
                factor_desperdicio: Number(c.factor_desperdicio) || 0,
                factor_indirectos: Number(c.factor_indirectos) || 0,
                factor_utilidad: Number(c.factor_utilidad) || 0,
              }); }}
              onNew={() => { setIsNew(true); setEditing(emptyForm(p.id)); }}
            />
          ))}
        </div>
      </main>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "Nuevo concepto" : "Editar concepto"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <ConceptoForm
              value={editing}
              onChange={setEditing}
              partidas={partidas ?? []}
              showPartidaSelect={isNew}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSave}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PartidaRow({
  partida, expanded, onToggle, onEdit, onNew,
}: {
  partida: Partida;
  expanded: boolean;
  onToggle: () => void;
  onEdit: (c: ConceptoFull) => void;
  onNew: () => void;
}) {
  const { data: conceptos, isLoading } = useQuery({
    queryKey: ["catalogo-conceptos", partida.id],
    enabled: expanded,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conceptos")
        .select("*")
        .eq("partida_id", partida.id)
        .order("clave");
      if (error) throw error;
      return data as ConceptoFull[];
    },
  });

  return (
    <div className="border-b last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-mono text-xs text-muted-foreground">{partida.clave}</span>
          <span className="font-medium">{partida.nombre}</span>
        </div>
      </button>
      {expanded && (
        <div className="bg-muted/20 px-4 py-3">
          <div className="mb-3 flex justify-end">
            <Button size="sm" variant="outline" onClick={onNew}>
              <Plus className="mr-1 h-3 w-3" />Nuevo concepto
            </Button>
          </div>
          {isLoading && <div className="text-center text-xs text-muted-foreground py-4">Cargando...</div>}
          {!isLoading && conceptos?.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-4">Sin conceptos</div>
          )}
          {conceptos && conceptos.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Clave</th>
                  <th className="px-2 py-2">Descripción</th>
                  <th className="px-2 py-2">Unidad</th>
                  <th className="px-2 py-2 text-right">P. Unitario</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {conceptos.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-2 py-2 font-mono text-xs">{c.clave}</td>
                    <td className="px-2 py-2">{c.descripcion}</td>
                    <td className="px-2 py-2 text-muted-foreground">{c.unidad}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{currency(Number(c.precio_unitario))}</td>
                    <td className="px-2 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => onEdit(c)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function ConceptoForm({
  value, onChange, partidas, showPartidaSelect,
}: {
  value: FormState;
  onChange: (v: FormState) => void;
  partidas: Partida[];
  showPartidaSelect: boolean;
}) {
  const [precio, setPrecio] = useState(calcPrecio(value));
  useEffect(() => { setPrecio(calcPrecio(value)); }, [value]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => onChange({ ...value, [k]: v });
  const num = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value === "" ? 0 : Number(e.target.value) });

  async function handlePartidaChange(partidaId: string) {
    if (!partidaId) {
      onChange({ ...value, partida_id: "", clave: "" });
      return;
    }
    const { data } = await supabase
      .from("conceptos")
      .select("clave")
      .eq("partida_id", partidaId)
      .order("clave", { ascending: false })
      .limit(1);
    const last = (data?.[0]?.clave as string | undefined) ?? undefined;
    const partidaClave = partidas.find((p) => p.id === partidaId)?.clave;
    const next = computeNextClave(last, partidaClave);
    onChange({ ...value, partida_id: partidaId, clave: next });
  }

  return (
    <div className="grid grid-cols-2 gap-4 py-2">
      {showPartidaSelect && (
        <div className="col-span-2">
          <Label>Partida</Label>
          <select
            value={value.partida_id}
            onChange={(e) => handlePartidaChange(e.target.value)}
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option value="">Selecciona partida...</option>
            {partidas.map((p) => (
              <option key={p.id} value={p.id}>{p.clave} — {p.nombre}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <Label>Clave</Label>
        <Input value={value.clave} onChange={(e) => set("clave", e.target.value)} />
      </div>
      <div>
        <Label>Unidad</Label>
        <Input value={value.unidad} onChange={(e) => set("unidad", e.target.value)} />
      </div>
      <div className="col-span-2">
        <Label>Descripción</Label>
        <Textarea value={value.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
      </div>
      <div className="col-span-2">
        <Label>Especificaciones</Label>
        <Textarea value={value.especificaciones} onChange={(e) => set("especificaciones", e.target.value)} />
      </div>
      <div>
        <Label>Costo materiales</Label>
        <Input type="number" step="0.01" value={value.costo_materiales} onChange={num("costo_materiales")} />
      </div>
      <div>
        <Label>Costo mano de obra</Label>
        <Input type="number" step="0.01" value={value.costo_mano_obra} onChange={num("costo_mano_obra")} />
      </div>
      <div>
        <Label>Costo herramienta</Label>
        <Input type="number" step="0.01" value={value.costo_herramienta} onChange={num("costo_herramienta")} />
      </div>
      <div>
        <Label>Factor desperdicio</Label>
        <Input type="number" step="0.01" value={value.factor_desperdicio} onChange={num("factor_desperdicio")} />
      </div>
      <div>
        <Label>Factor indirectos</Label>
        <Input type="number" step="0.01" value={value.factor_indirectos} onChange={num("factor_indirectos")} />
      </div>
      <div>
        <Label>Factor utilidad</Label>
        <Input type="number" step="0.01" value={value.factor_utilidad} onChange={num("factor_utilidad")} />
      </div>
      <div className="col-span-2 rounded-md border bg-muted/40 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Precio unitario (calculado)</span>
          <span className="text-lg font-semibold tabular-nums">{currency(precio)}</span>
        </div>
      </div>
    </div>
  );
}