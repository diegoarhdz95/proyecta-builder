import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase, IVA_RATE, type Proyecto } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, BarChart3, Wallet, Calendar } from "lucide-react";
import { CotizacionGanttTab } from "@/components/CotizacionGanttTab";

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
  const [tab, setTab] = useState<"desglose" | "pagos" | "gantt">("gantt");

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
        .from("pagos_cliente").select("monto, fecha, concepto").eq("proyecto_id", id)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data as { monto: number; fecha: string; concepto: string | null }[];
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
            <Stat label="Estado" value={p?.estado ?? "—"} />
            <Stat label="Conceptos" value={String(conceptosCount ?? 0)} />
            <Stat label="Subtotal" value={currency(p?.subtotal ?? 0)} />
            <Stat label="IVA" value={currency((p?.subtotal ?? 0) * IVA_RATE)} />
          </div>
        </section>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="desglose"><BarChart3 className="h-3.5 w-3.5 mr-1" />Desglose</TabsTrigger>
            <TabsTrigger value="pagos"><Wallet className="h-3.5 w-3.5 mr-1" />Pagos</TabsTrigger>
            <TabsTrigger value="gantt"><Calendar className="h-3.5 w-3.5 mr-1" />Gantt</TabsTrigger>
          </TabsList>

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
                      <td className="px-4 py-2.5 tabular-nums">{pg.fecha}</td>
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
        </Tabs>
      </main>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${highlight ? "bg-primary/10 border-primary/30" : "bg-card"}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold truncate">{value}</p>
    </div>
  );
}