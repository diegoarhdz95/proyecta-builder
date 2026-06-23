import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, DESPACHO_ID, type GastoCategoria, type Obra, type Proyecto } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Package, MoreHorizontal, Check } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  obraId?: string;
  proyectoId?: string;
};

export function QuickGastoSheet({ open, onOpenChange, obraId, proyectoId }: Props) {
  const qc = useQueryClient();
  const [obraSel, setObraSel] = useState<string>(obraId ?? "");
  const [cotSel, setCotSel] = useState<string>(proyectoId ?? "");
  const [categoria, setCategoria] = useState<GastoCategoria>("materiales");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setObraSel(obraId ?? "");
      setCotSel(proyectoId ?? "");
      setCategoria("materiales");
      setMonto("");
      setConcepto("");
      setProveedor("");
      setFecha(new Date().toISOString().slice(0, 10));
    }
  }, [open, obraId, proyectoId]);

  const { data: obras } = useQuery({
    queryKey: ["qg_obras"],
    enabled: open && !obraId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obras").select("id, nombre")
        .eq("despacho_id", DESPACHO_ID).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Pick<Obra, "id" | "nombre">[];
    },
  });

  const obraActiva = obraSel || obraId || "";

  const { data: cotizaciones } = useQuery({
    queryKey: ["qg_cots", obraActiva],
    enabled: open && !!obraActiva && !proyectoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos").select("id, folio, nombre_proyecto")
        .eq("despacho_id", DESPACHO_ID).eq("obra_id", obraActiva)
        .order("folio", { ascending: false });
      if (error) throw error;
      return data as Pick<Proyecto, "id" | "folio" | "nombre_proyecto">[];
    },
  });

  const cotActiva = useMemo(
    () => cotSel || proyectoId || cotizaciones?.[0]?.id || "",
    [cotSel, proyectoId, cotizaciones]
  );

  async function guardar() {
    if (!cotActiva) return toast.error("Selecciona una cotización");
    const m = Number(monto);
    if (!m || m <= 0) return toast.error("Ingresa un monto válido");
    if (!concepto.trim()) return toast.error("Concepto requerido");
    setSaving(true);
    const { error } = await supabase.from("gastos_proyecto").insert({
      despacho_id: DESPACHO_ID,
      proyecto_id: cotActiva,
      categoria,
      concepto: concepto.trim(),
      proveedor: proveedor || null,
      monto: m,
      fecha_pago: fecha,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Gasto registrado");
    qc.invalidateQueries({ queryKey: ["gastos_proyecto", cotActiva] });
    qc.invalidateQueries({ queryKey: ["corte_gastos", cotActiva] });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Registrar gasto</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4 pb-6">
          {!obraId && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Obra</label>
              <select
                value={obraSel}
                onChange={(e) => { setObraSel(e.target.value); setCotSel(""); }}
                className="mt-1 flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-base"
              >
                <option value="">Selecciona…</option>
                {obras?.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            </div>
          )}

          {!proyectoId && obraActiva && (cotizaciones?.length ?? 0) > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Cotización</label>
              <select
                value={cotActiva}
                onChange={(e) => setCotSel(e.target.value)}
                className="mt-1 flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-base"
              >
                {cotizaciones?.map((c) => (
                  <option key={c.id} value={c.id}>{c.folio} · {c.nombre_proyecto}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">Categoría</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([
                { v: "materiales" as const, label: "Materiales", Icon: Package },
                { v: "otros" as const, label: "Otros", Icon: MoreHorizontal },
              ]).map(({ v, label, Icon }) => {
                const active = categoria === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setCategoria(v)}
                    className={`flex h-14 items-center justify-center gap-2 rounded-xl border-2 text-sm font-medium transition ${
                      active ? "border-primary bg-primary/10 text-primary" : "border-input bg-background text-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                    {active && <Check className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Monto</label>
            <Input
              inputMode="decimal"
              type="number"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
              className="mt-1 h-14 text-2xl font-semibold tabular-nums"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Concepto</label>
            <Input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Cemento, varilla, flete…"
              className="mt-1 h-12 text-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Proveedor</label>
              <Input
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                className="mt-1 h-12 text-base"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Fecha</label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1 h-12 text-base"
              />
            </div>
          </div>

          <Button onClick={guardar} disabled={saving} className="h-14 w-full text-base font-semibold">
            {saving ? "Guardando…" : "Guardar gasto"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}