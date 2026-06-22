import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase, DESPACHO_ID, IVA_RATE, type Partida, type Concepto, type Proyecto, type ProyectoConcepto } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ArrowLeft, Calculator, Clock, Download, FileText, PieChart, Plus, Trash2 } from "lucide-react";
import { generateCotizacionPDF } from "@/lib/generate-pdf";
import { ApuDialog } from "@/components/ApuDialog";

export const Route = createFileRoute("/cotizaciones/$id_/editar")({
  head: () => ({ meta: [{ title: "Editor de cotización · Grupo Proyecta" }] }),
  component: Editor,
});

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
}

function Editor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [selectedPartida, setSelectedPartida] = useState<string | null>(null);
  const [tiempoTexto, setTiempoTexto] = useState("");
  const [tiempoIncluir, setTiempoIncluir] = useState(false);
  const [tiempoHydrated, setTiempoHydrated] = useState(false);
  const [apuItem, setApuItem] = useState<ProyectoConcepto | null>(null);

  const { data: proyecto } = useQuery({
    queryKey: ["proyecto", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("proyectos").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Proyecto;
    },
  });

  if (proyecto && !tiempoHydrated) {
    setTiempoTexto(proyecto.tiempo_ejecucion_texto ?? "");
    setTiempoIncluir(!!proyecto.tiempo_ejecucion_incluir);
    setTiempoHydrated(true);
  }

  async function saveTiempo(next: { texto?: string; incluir?: boolean }) {
    const texto = next.texto ?? tiempoTexto;
    const incluir = next.incluir ?? tiempoIncluir;
    await supabase
      .from("proyectos")
      .update({ tiempo_ejecucion_texto: texto || null, tiempo_ejecucion_incluir: incluir })
      .eq("id", id);
    qc.invalidateQueries({ queryKey: ["proyecto", id] });
  }

  async function tomarDelCronograma() {
    const { data, error } = await supabase
      .from("cronograma_actividades")
      .select("fecha_inicio, fecha_fin")
      .eq("cotizacion_id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data || data.length === 0) {
      toast.error("No hay cronograma generado para esta cotización");
      return;
    }
    const starts = data.map((a) => new Date(a.fecha_inicio + "T00:00:00").getTime());
    const ends = data.map((a) => new Date(a.fecha_fin + "T00:00:00").getTime());
    const minStart = new Date(Math.min(...starts));
    const maxEnd = new Date(Math.max(...ends));
    let dias = 0;
    const cur = new Date(minStart);
    while (cur.getTime() <= maxEnd.getTime()) {
      const d = cur.getDay();
      if (d >= 1 && d <= 5) dias += 1;
      else if (d === 6) dias += 0.5;
      cur.setDate(cur.getDate() + 1);
    }
    const semanas = Math.ceil(dias / 5);
    const texto = `${semanas} semana${semanas === 1 ? "" : "s"}`;
    setTiempoTexto(texto);
    await saveTiempo({ texto });
    toast.success(`Tiempo estimado: ${texto} (${dias} días hábiles)`);
  }

  const { data: obra } = useQuery({
    queryKey: ["proyecto_obra", proyecto?.obra_id],
    enabled: !!proyecto?.obra_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obras")
        .select("id, nombre")
        .eq("id", proyecto!.obra_id!)
        .single();
      if (error) throw error;
      return data as { id: string; nombre: string };
    },
  });

  const { data: partidas } = useQuery({
    queryKey: ["partidas"],
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

  const { data: conceptos } = useQuery({
    queryKey: ["conceptos", selectedPartida],
    enabled: !!selectedPartida,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conceptos")
        .select("*")
        .eq("despacho_id", DESPACHO_ID)
        .eq("partida_id", selectedPartida);
      if (error) throw error;
      return data as Concepto[];
    },
  });

  const { data: items } = useQuery({
    queryKey: ["proyecto_conceptos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyecto_conceptos")
        .select("*")
        .eq("proyecto_id", id);
      if (error) throw error;
      return data as ProyectoConcepto[];
    },
  });

  const subtotal = (items ?? []).reduce((s, i) => s + Number(i.subtotal || 0), 0);
  const iva = subtotal * IVA_RATE;
  const total = subtotal + iva;

  async function recalcularTotales() {
    const { data } = await supabase
      .from("proyecto_conceptos")
      .select("id, cantidad, unidad, precio_unitario_final, subtotal")
      .eq("proyecto_id", id);
    const rows = data ?? [];
    const nonPct = rows.filter((r) => r.unidad !== "%");
    // Asegura que el subtotal de los conceptos normales esté calculado
    await Promise.all(
      nonPct.map((r) => {
        const expected = Number(r.cantidad || 0) * Number(r.precio_unitario_final || 0);
        if (Number(r.subtotal || 0) !== expected) {
          return supabase
            .from("proyecto_conceptos")
            .update({ subtotal: expected })
            .eq("id", r.id);
        }
        return Promise.resolve();
      }),
    );
    const base = nonPct.reduce(
      (s, r) => s + Number(r.cantidad || 0) * Number(r.precio_unitario_final || 0),
      0,
    );
    const puPct = base / 100;
    const pctRows = rows.filter((r) => r.unidad === "%");
    await Promise.all(
      pctRows.map((r) => {
        const newSub = Number(r.cantidad || 0) * puPct;
        return supabase
          .from("proyecto_conceptos")
          .update({ precio_unitario_final: puPct, subtotal: newSub })
          .eq("id", r.id);
      }),
    );
    const sub = base + pctRows.reduce((s, r) => s + Number(r.cantidad || 0) * puPct, 0);
    const v = sub * IVA_RATE;
    await supabase.from("proyectos")
      .update({ subtotal: sub, iva: v, total_con_iva: sub + v })
      .eq("id", id);
    qc.invalidateQueries({ queryKey: ["proyecto", id] });
    qc.invalidateQueries({ queryKey: ["proyecto_conceptos", id] });
  }

  async function getOrCreateProyectoPartida(partidaId: string): Promise<string> {
    const { data: existing } = await supabase
      .from("proyecto_partidas")
      .select("id")
      .eq("proyecto_id", id)
      .eq("partida_id", partidaId)
      .maybeSingle();
    if (existing) return existing.id;
    const { data, error } = await supabase
      .from("proyecto_partidas")
      .insert({ proyecto_id: id, partida_id: partidaId, orden: 0 })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async function addConcepto(c: Concepto) {
    try {
      const ppId = await getOrCreateProyectoPartida(c.partida_id);
      const cantidad = 1;
      const isPct = c.unidad === "%";
      const { error } = await supabase.from("proyecto_conceptos").insert({
        proyecto_id: id,
        proyecto_partida_id: ppId,
        concepto_id: c.id,
        descripcion: c.descripcion,
        cantidad,
        unidad: c.unidad,
        precio_unitario_final: isPct ? 0 : c.precio_unitario,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["proyecto_conceptos", id] });
      await recalcularTotales();
      toast.success("Concepto agregado");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function updateCantidad(item: ProyectoConcepto, cantidad: number) {
    let value = Number.isFinite(cantidad) ? cantidad : 0;
    if (item.unidad === "%") {
      if (value < 1) value = 1;
      if (value > 100) value = 100;
    } else if (value < 0) {
      value = 0;
    }
    await supabase.from("proyecto_conceptos")
      .update({ cantidad: value })
      .eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["proyecto_conceptos", id] });
    await recalcularTotales();
  }

  async function removeItem(itemId: string) {
    await supabase.from("proyecto_conceptos").delete().eq("id", itemId);
    qc.invalidateQueries({ queryKey: ["proyecto_conceptos", id] });
    await recalcularTotales();
  }

  async function handleGeneratePDF() {
    if (!proyecto) return;
    try {
      const { data: proyectoFresh, error: e0 } = await supabase
        .from("proyectos")
        .select("*")
        .eq("id", id)
        .single();
      if (e0) throw e0;
      console.log("[PDF] proyecto data:", {
        id,
        tiempo_ejecucion_texto: (proyectoFresh as { tiempo_ejecucion_texto?: string | null })?.tiempo_ejecucion_texto,
        tiempo_ejecucion_incluir: (proyectoFresh as { tiempo_ejecucion_incluir?: boolean | null })?.tiempo_ejecucion_incluir,
        incluir_tiempo_pdf: (proyectoFresh as { incluir_tiempo_pdf?: boolean | null })?.incluir_tiempo_pdf,
      });
      const { data: itemsFull, error: e1 } = await supabase
        .from("proyecto_conceptos")
        .select("*, proyecto_partida:proyecto_partida_id(partida_id), concepto:concepto_id(especificaciones)")
        .eq("proyecto_id", id);
      if (e1) throw e1;
      const { data: allPartidas, error: e2 } = await supabase
        .from("partidas")
        .select("*")
        .order("orden");
      if (e2) throw e2;
      generateCotizacionPDF({
        proyecto: proyectoFresh as Proyecto,
        items: (itemsFull ?? []) as never,
        partidas: (allPartidas ?? []) as Partida[],
      });
      toast.success("PDF generado");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            {obra ? (
              <Link to="/proyectos/$obraId" params={{ obraId: obra.id }} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            ) : (
              <Link to="/" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
            )}
            <div>
              <nav className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Link to="/" className="hover:text-foreground">Proyectos</Link>
                {obra && (
                  <>
                    <span>›</span>
                    <Link to="/proyectos/$obraId" params={{ obraId: obra.id }} className="hover:text-foreground">
                      {obra.nombre}
                    </Link>
                  </>
                )}
                <span>›</span>
                <span className="text-foreground">{proyecto?.folio}</span>
              </nav>
              <h1 className="text-base font-semibold">{proyecto?.nombre_proyecto}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/cotizaciones/$id/desglose" params={{ id }}>
              <Button variant="outline"><PieChart className="mr-2 h-4 w-4" />Desglose financiero</Button>
            </Link>
            <Link to="/cotizaciones/$id/resumen" params={{ id }}>
              <Button variant="outline"><FileText className="mr-2 h-4 w-4" />Ver resumen</Button>
            </Link>
            <Button onClick={handleGeneratePDF}><Download className="mr-2 h-4 w-4" />Generar PDF</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] grid-cols-[260px_1fr_300px] gap-4 px-6 py-6">
        {/* Panel izquierdo */}
        <aside className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Partidas</div>
          <div className="max-h-[70vh] overflow-y-auto">
            {partidas?.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPartida(p.id === selectedPartida ? null : p.id)}
                className={`block w-full border-b px-4 py-2.5 text-left text-sm hover:bg-muted/50 ${selectedPartida === p.id ? "bg-muted font-medium" : ""}`}
              >
                <span className="font-mono text-xs text-muted-foreground">{p.clave}</span>
                <span className="ml-2">{p.nombre}</span>
              </button>
            ))}
          </div>
          {selectedPartida && (
            <div className="border-t">
              <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conceptos</div>
              <div className="max-h-[40vh] overflow-y-auto">
                {conceptos?.map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-2 border-b px-3 py-2 text-xs">
                    <div className="flex-1">
                      <p className="font-medium">{c.descripcion}</p>
                      <p className="text-muted-foreground">{currency(Number(c.precio_unitario))} / {c.unidad}</p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => addConcepto(c)} className="h-7 w-7"><Plus className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
                {conceptos?.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground">Sin conceptos</p>}
              </div>
            </div>
          )}
        </aside>

        {/* Tabla central */}
        <section className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conceptos de la cotización</div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2 w-20">Unidad</th>
                <th className="px-3 py-2 w-24">Cantidad</th>
                <th className="px-3 py-2 w-28 text-right">P. Unitario</th>
                <th className="px-3 py-2 w-28 text-right">Subtotal</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {[...(items ?? [])]
                .sort((a, b) => {
                  const ap = a.unidad === "%" ? 1 : 0;
                  const bp = b.unidad === "%" ? 1 : 0;
                  return ap - bp;
                })
                .map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="px-3 py-2">{it.descripcion}</td>
                  <td className="px-3 py-2 text-muted-foreground">{it.unidad}</td>
                  <td className="px-3 py-2">
                    <div className="relative">
                      <Input
                        key={it.id + ":" + it.cantidad}
                        type="number"
                        min={it.unidad === "%" ? 1 : 0}
                        max={it.unidad === "%" ? 100 : undefined}
                        step={it.unidad === "%" ? "1" : "0.01"}
                        defaultValue={it.cantidad}
                        onBlur={(e) => updateCantidad(it, Number(e.target.value))}
                        className={`h-8 ${it.unidad === "%" ? "pr-6" : ""}`}
                      />
                      {it.unidad === "%" && (
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {currency(Number(it.precio_unitario_final))}
                    {it.unidad === "%" && (
                      <span className="ml-1 text-[10px] text-muted-foreground">(por 1%)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{currency(Number(it.subtotal))}</td>
                  <td className="px-2">
                    <div className="flex items-center justify-end gap-0.5">
                      {it.unidad !== "%" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setApuItem(it)}
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          title="Desglose de materiales (APU)"
                        >
                          <Calculator className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => removeItem(it.id)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {items?.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">Selecciona una partida y agrega conceptos</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Resumen derecho */}
        <aside className="h-fit rounded-lg border bg-card p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumen</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{currency(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">IVA (16%)</dt>
              <dd className="tabular-nums">{currency(iva)}</dd>
            </div>
            <div className="mt-3 flex justify-between border-t pt-3 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{currency(total)}</dd>
            </div>
          </dl>

          <div className="mt-6 border-t pt-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tiempo de ejecución
            </h3>
            <Input
              value={tiempoTexto}
              onChange={(e) => setTiempoTexto(e.target.value)}
              onBlur={() => saveTiempo({ texto: tiempoTexto })}
              placeholder="ej. 8 semanas"
              className="h-8 text-sm"
            />
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={tiempoIncluir}
                onCheckedChange={(v) => {
                  const incluir = !!v;
                  setTiempoIncluir(incluir);
                  saveTiempo({ incluir });
                }}
              />
              Incluir en cotización PDF
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={tomarDelCronograma}
              className="mt-3 w-full"
            >
              <Clock className="mr-2 h-3.5 w-3.5" />
              Tomar del cronograma
            </Button>
          </div>
        </aside>
      </div>
      {apuItem && (
        <ApuDialog
          open={!!apuItem}
          onOpenChange={(o) => !o && setApuItem(null)}
          item={apuItem}
          onApplied={async () => {
            await recalcularTotales();
            qc.invalidateQueries({ queryKey: ["proyecto_conceptos", id] });
          }}
        />
      )}
    </div>
  );
}