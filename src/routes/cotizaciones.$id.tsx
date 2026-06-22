import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, Fragment } from "react";
import { supabase, IVA_RATE, type Proyecto, type Partida, type ProyectoConcepto } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, BarChart3, Wallet, Calendar, FileText, Download, Scissors } from "lucide-react";
import { CotizacionGanttTab } from "@/components/CotizacionGanttTab";
import { CorteDePagosTab } from "@/components/CorteDePagosTab";
import { generateCotizacionPDF } from "@/lib/generate-pdf";
import { toast } from "sonner";
import { EstadoBadge } from "@/lib/estado-cotizacion";

export const Route = createFileRoute("/cotizaciones/$id")({
  head: () => ({ meta: [{ title: "Cotización · Grupo Proyecta" }] }),
  component: CotizacionDashboard,
});

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

function CotizacionDashboard() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"resumen" | "desglose" | "pagos" | "corte" | "gantt">("resumen");

  const { data: p } = useQuery({
    queryKey: ["cotizacion_dashboard", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("proyectos").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Proyecto & { created_at?: string; obra_id?: string | null };
    },
  });

  const { data: conceptosCount } = useQuery({
    queryKey: ["cotizacion_conceptos_count", id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("proyecto_conceptos").select("id", { count: "exact", head: true })
        .eq("proyecto_id", id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: pagos } = useQuery({
    queryKey: ["cotizacion_pagos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos_cliente").select("monto, fecha_pago, concepto").eq("proyecto_id", id)
        .order("fecha_pago", { ascending: false });
      if (error) throw error;
      return data as { monto: number; fecha_pago: string; concepto: string | null }[];
    },
  });

  const { data: desglose } = useQuery({
    queryKey: ["cotizacion_desglose", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("desglose_financiero_proyecto").select("*").eq("proyecto_id", id).maybeSingle();
      if (error) throw error;
      return data as Record<string, number> | null;
    },
  });

  const { data: resumenItems } = useQuery({
    queryKey: ["cotizacion_resumen_items", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyecto_conceptos")
        .select("*, proyecto_partida:proyecto_partida_id(partida_id), concepto:concepto_id(especificaciones)")
        .eq("proyecto_id", id);
      if (error) throw error;
      return data as (ProyectoConcepto & {
        proyecto_partida: { partida_id: string } | null;
        concepto: { especificaciones: string | null } | null;
      })[];
    },
  });

  const { data: partidas } = useQuery({
    queryKey: ["all_partidas_dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partidas").select("*").order("orden");
      if (error) throw error;
      return data as Partida[];
    },
  });

  async function handleGeneratePDF() {
    if (!p) return;
    try {
      generateCotizacionPDF({
        proyecto: p,
        items: (resumenItems ?? []) as never,
        partidas: partidas ?? [],
      });
      toast.success("PDF generado");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const subtotalResumen = (resumenItems ?? []).reduce((s, i) => s + Number(i.subtotal || 0), 0);
  const ivaResumen = subtotalResumen * IVA_RATE;
  const totalResumen = subtotalResumen + ivaResumen;

  const groupedResumen = new Map<string, typeof resumenItems>();
  resumenItems?.forEach((it) => {
    const pid = it.proyecto_partida?.partida_id ?? "otros";
    if (!groupedResumen.has(pid)) groupedResumen.set(pid, [] as typeof resumenItems);
    groupedResumen.get(pid)!.push(it);
  });
  const sortedResumen = Array.from(groupedResumen.entries()).sort((a, b) => {
    const oa = partidas?.find((pt) => pt.id === a[0])?.orden ?? 999;
    const ob = partidas?.find((pt) => pt.id === b[0])?.orden ?? 999;
    return oa - ob;
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate({ to: "/proyectos/$obraId", params: { obraId: p?.obra_id ?? "" } })}
              className="text-muted-foreground hover:text-foreground" disabled={!p?.obra_id}>
              <ArrowLeft className="h-4 w-4" />
            </button>
            <nav className="flex items-center gap-1 text-xs text-muted-foreground">
              <Link to="/" className="hover:text-foreground">Proyectos</Link>
              <span>›</span>
              <span className="text-foreground">{p?.folio}</span>
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6 space-y-5">
        {/* Resumen compacto */}
        <section className="rounded-lg border bg-card p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="font-mono text-xs text-muted-foreground">{p?.folio}</p>
              <h1 className="text-xl font-semibold tracking-tight truncate">{p?.nombre_proyecto}</h1>
              <p className="text-sm text-muted-foreground">{p?.cliente_nombre}</p>
            </div>
            <Link to="/cotizaciones/$id/editar" params={{ id }}>
              <Button><Pencil className="mr-2 h-4 w-4" />Editar cotización</Button>
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5 text-sm">
            <Stat label="Total" value={currency(p?.total_con_iva ?? 0)} highlight />
            <Stat label="Estado" estadoValue={p?.estado} />
            <Stat label="Conceptos" value={String(conceptosCount ?? 0)} />
            <Stat label="Subtotal" value={currency(p?.subtotal ?? 0)} />
            <Stat label="IVA" value={currency((p?.subtotal ?? 0) * IVA_RATE)} />
          </div>
        </section>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="resumen"><FileText className="h-3.5 w-3.5 mr-1" />Resumen</TabsTrigger>
            <TabsTrigger value="desglose"><BarChart3 className="h-3.5 w-3.5 mr-1" />Desglose</TabsTrigger>
            <TabsTrigger value="pagos"><Wallet className="h-3.5 w-3.5 mr-1" />Pagos</TabsTrigger>
            <TabsTrigger value="corte"><Scissors className="h-3.5 w-3.5 mr-1" />Corte de Pagos</TabsTrigger>
            <TabsTrigger value="gantt"><Calendar className="h-3.5 w-3.5 mr-1" />Gantt</TabsTrigger>
          </TabsList>

          <TabsContent value="resumen" className="mt-4">
            <div className="rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b px-5 py-3">
                <h3 className="text-sm font-semibold">Cotización · Vista de solo lectura</h3>
                <Button onClick={handleGeneratePDF} size="sm">
                  <Download className="mr-2 h-4 w-4" />Generar PDF
                </Button>
              </div>
              <div className="p-6">
                <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 text-sm">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Folio</p>
                    <p className="font-mono font-medium">{p?.folio}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cliente</p>
                    <p className="font-medium truncate">{p?.cliente_nombre}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Fecha</p>
                    <p className="font-medium">{new Date().toLocaleDateString("es-MX")}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Estado</p>
                    <div className="mt-0.5"><EstadoBadge value={p?.estado} /></div>
                  </div>
                </div>

                {sortedResumen.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-10">Sin conceptos en la cotización</p>
                )}

                {(() => {
                  let counter = 0;
                  return sortedResumen.map(([pid, group]) => {
                    const partida = partidas?.find((pt) => pt.id === pid);
                    const label = partida ? `${partida.clave} · ${partida.nombre}` : "Otros";
                    const subPartida = (group ?? []).reduce((s, i) => s + Number(i.subtotal || 0), 0);
                    return (
                      <div key={pid} className="mb-6">
                        <h4 className="mb-2 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary rounded">
                          {label}
                        </h4>
                        <table className="w-full text-sm">
                          <thead className="text-left text-xs text-muted-foreground border-b">
                            <tr>
                              <th className="py-1.5 px-2 w-10">No.</th>
                              <th className="py-1.5 px-2">Descripción</th>
                              <th className="py-1.5 px-2 w-16">Unidad</th>
                              <th className="py-1.5 px-2 w-20 text-right">Cant.</th>
                              <th className="py-1.5 px-2 w-28 text-right">P.U.</th>
                              <th className="py-1.5 px-2 w-28 text-right">Importe</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group?.map((it) => {
                              counter += 1;
                              const spec = it.concepto?.especificaciones?.trim();
                              return (
                                <Fragment key={it.id}>
                                  <tr className="border-t">
                                    <td className="py-1.5 px-2 text-center text-muted-foreground">{counter}</td>
                                    <td className="py-1.5 px-2 font-medium">{it.descripcion}</td>
                                    <td className="py-1.5 px-2 text-muted-foreground">{it.unidad}</td>
                                    <td className="py-1.5 px-2 text-right tabular-nums">{Number(it.cantidad)}</td>
                                    <td className="py-1.5 px-2 text-right tabular-nums">{currency(Number(it.precio_unitario_final))}</td>
                                    <td className="py-1.5 px-2 text-right tabular-nums">{currency(Number(it.subtotal))}</td>
                                  </tr>
                                  {spec && (
                                    <tr>
                                      <td></td>
                                      <td className="pb-1.5 px-2 text-xs italic text-muted-foreground">{spec}</td>
                                      <td></td>
                                      <td></td>
                                      <td></td>
                                      <td></td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
                            <tr className="border-t bg-muted/30">
                              <td colSpan={5} className="py-1.5 px-2 text-right text-xs font-semibold">Subtotal partida</td>
                              <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{currency(subPartida)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    );
                  });
                })()}

                {sortedResumen.length > 0 && (
                  <div className="ml-auto mt-6 w-72 space-y-1.5 text-sm border-t pt-4">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="tabular-nums">{currency(subtotalResumen)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IVA (16%)</span>
                      <span className="tabular-nums">{currency(ivaResumen)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 text-base font-bold">
                      <span>Total</span>
                      <span className="tabular-nums">{currency(totalResumen)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="desglose" className="mt-4">
            {!desglose ? (
              <p className="text-sm text-muted-foreground rounded border bg-card p-6 text-center">Sin desglose disponible.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Stat label="Materiales" value={currency(Number(desglose.total_materiales || 0))} />
                <Stat label="Mano de obra" value={currency(Number(desglose.total_mano_obra || 0))} />
                <Stat label="Herramienta" value={currency(Number(desglose.total_herramienta || 0))} />
                <Stat label="Indirectos" value={currency(Number(desglose.total_indirectos || 0))} />
                <Stat label="Utilidad" value={currency(Number(desglose.total_utilidad || 0))} />
                <Stat label="Total c/IVA" value={currency(Number(desglose.total_con_iva || 0))} highlight />
              </div>
            )}
          </TabsContent>

          <TabsContent value="pagos" className="mt-4">
            <div className="overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Concepto</th><th className="px-4 py-3 text-right">Monto</th></tr>
                </thead>
                <tbody>
                  {(pagos ?? []).length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Sin pagos registrados</td></tr>
                  )}
                  {pagos?.map((pg, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-4 py-2.5 tabular-nums">{pg.fecha_pago}</td>
                      <td className="px-4 py-2.5">{pg.concepto ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{currency(pg.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="gantt" className="mt-4">
            {p && <CotizacionGanttTab cotizacion={{ id: p.id, folio: p.folio, nombre_proyecto: p.nombre_proyecto }} />}
          </TabsContent>

          <TabsContent value="corte" className="mt-4">
            <CorteDePagosTab proyectoId={id} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  estadoValue,
}: {
  label: string;
  value?: string;
  highlight?: boolean;
  estadoValue?: string | null;
}) {
  return (
    <div className={`rounded-md border px-3 py-2 ${highlight ? "bg-primary/10 border-primary/30" : "bg-card"}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      {estadoValue !== undefined ? (
        <div className="mt-0.5"><EstadoBadge value={estadoValue} /></div>
      ) : (
        <p className="text-sm font-semibold truncate">{value}</p>
      )}
    </div>
  );
}