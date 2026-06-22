import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  supabase,
  DESPACHO_ID,
  DESPACHO_NOMBRE,
  type Obra,
} from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Plus, BookOpen, Search, FilePlus2, Package } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Proyectos · Grupo Proyecta" }] }),
  component: ProyectosList,
});

const estadoObraStyles: Record<string, string> = {
  activo: "bg-green-100 text-green-700",
  pausado: "bg-yellow-100 text-yellow-800",
  terminado: "bg-muted text-muted-foreground",
};

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

function ProyectosList() {
  const [q, setQ] = useState("");

  const { data: obras, isLoading } = useQuery({
    queryKey: ["dashboard_obras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obras")
        .select("*")
        .eq("despacho_id", DESPACHO_ID)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Obra[];
    },
  });

  const { data: cotizaciones } = useQuery({
    queryKey: ["dashboard_cotizaciones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select("id, obra_id, total_con_iva")
        .eq("despacho_id", DESPACHO_ID);
      if (error) throw error;
      return data as Array<{ id: string; obra_id: string | null; total_con_iva: number }>;
    },
  });

  const cotIds = (cotizaciones ?? []).map((c) => c.id);

  const { data: pagos } = useQuery({
    queryKey: ["dashboard_pagos", cotIds.join(",")],
    enabled: cotIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos_cliente")
        .select("proyecto_id, monto")
        .in("proyecto_id", cotIds);
      if (error) throw error;
      return data as Array<{ proyecto_id: string; monto: number }>;
    },
  });

  const aggPorObra = useMemo(() => {
    const pagadoPorCot = new Map<string, number>();
    (pagos ?? []).forEach((p) =>
      pagadoPorCot.set(p.proyecto_id, (pagadoPorCot.get(p.proyecto_id) ?? 0) + Number(p.monto || 0)),
    );
    const m = new Map<string, { total: number; pagado: number; count: number }>();
    (cotizaciones ?? []).forEach((c) => {
      if (!c.obra_id) return;
      const cur = m.get(c.obra_id) ?? { total: 0, pagado: 0, count: 0 };
      cur.total += Number(c.total_con_iva || 0);
      cur.pagado += pagadoPorCot.get(c.id) ?? 0;
      cur.count += 1;
      m.set(c.obra_id, cur);
    });
    return m;
  }, [cotizaciones, pagos]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return obras ?? [];
    return (obras ?? []).filter(
      (o) =>
        o.nombre?.toLowerCase().includes(term) ||
        o.cliente_nombre?.toLowerCase().includes(term),
    );
  }, [obras, q]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{DESPACHO_NOMBRE}</h1>
            <p className="text-xs text-muted-foreground">Proyectos</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/catalogo">
              <Button variant="outline"><BookOpen className="mr-2 h-4 w-4" />Catálogo</Button>
            </Link>
            <Link to="/materiales">
              <Button variant="outline"><Package className="mr-2 h-4 w-4" />Materiales</Button>
            </Link>
            <Link to="/proveedores">
              <Button variant="outline"><BookOpen className="mr-2 h-4 w-4" />Proveedores</Button>
            </Link>
            <Link to="/proyectos/nuevo">
              <Button><Plus className="mr-2 h-4 w-4" />Nuevo proyecto</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Proyectos</h2>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por proyecto, cliente o folio…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!isLoading && filtered.length === 0 && (
          <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
            {obras?.length === 0
              ? "Aún no tienes proyectos. Crea el primero con \u201CNuevo proyecto\u201D."
              : "Sin resultados para la búsqueda."}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((o) => {
            const agg = aggPorObra.get(o.id) ?? { total: 0, pagado: 0, count: 0 };
            const pct = agg.total > 0 ? (agg.pagado / agg.total) * 100 : 0;
            const sinCot = agg.count === 0;
            return (
              <Link
                key={o.id}
                to="/proyectos/$obraId"
                params={{ obraId: o.id }}
                className="flex flex-col rounded-lg border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold leading-tight">{o.nombre}</h3>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{o.cliente_nombre}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${estadoObraStyles[o.estado] ?? estadoObraStyles.activo}`}>
                    {o.estado}
                  </span>
                </div>

                {sinCot ? (
                  <div className="mt-4 flex flex-1 items-end">
                    <div className="inline-flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs font-medium text-primary">
                      <FilePlus2 className="h-3.5 w-3.5" />
                      Crear primera cotización
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {agg.count} {agg.count === 1 ? "cotización" : "cotizaciones"}
                      </span>
                      <span className="font-semibold tabular-nums">{currency(agg.total)}</span>
                    </div>
                    <div className="mt-3">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Cobrado {currency(agg.pagado)}</span>
                        <span>{pct.toFixed(0)}%</span>
                      </div>
                      <Progress value={Math.min(pct, 100)} className="mt-1.5 h-1.5" />
                    </div>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
