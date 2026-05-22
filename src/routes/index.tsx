import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  supabase,
  DESPACHO_ID,
  DESPACHO_NOMBRE,
  type Proyecto,
} from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Plus, BookOpen, Search, FileText, PieChart, Wallet } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Proyectos · Grupo Proyecta" }] }),
  component: ProyectosList,
});

const estadoStyles: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground",
  enviada: "bg-blue-100 text-blue-700",
  aprobada: "bg-green-100 text-green-700",
  rechazada: "bg-red-100 text-red-700",
};

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

function ProyectosList() {
  const [q, setQ] = useState("");

  const { data: proyectos, isLoading } = useQuery({
    queryKey: ["dashboard_proyectos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select("id, folio, nombre_proyecto, cliente_nombre, total_con_iva, estado, obra_id, created_at")
        .eq("despacho_id", DESPACHO_ID)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Array<Proyecto & { created_at: string }>;
    },
  });

  const ids = (proyectos ?? []).map((p) => p.id);

  const { data: pagos } = useQuery({
    queryKey: ["dashboard_pagos", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos_cliente")
        .select("proyecto_id, monto")
        .in("proyecto_id", ids);
      if (error) throw error;
      return data as Array<{ proyecto_id: string; monto: number }>;
    },
  });

  const pagadoPorProyecto = useMemo(() => {
    const m = new Map<string, number>();
    (pagos ?? []).forEach((p) => m.set(p.proyecto_id, (m.get(p.proyecto_id) ?? 0) + Number(p.monto || 0)));
    return m;
  }, [pagos]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return proyectos ?? [];
    return (proyectos ?? []).filter(
      (p) =>
        p.nombre_proyecto?.toLowerCase().includes(term) ||
        p.cliente_nombre?.toLowerCase().includes(term) ||
        p.folio?.toLowerCase().includes(term),
    );
  }, [proyectos, q]);

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
            {proyectos?.length === 0
              ? "Aún no tienes proyectos. Crea el primero con \u201CNuevo proyecto\u201D."
              : "Sin resultados para la búsqueda."}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const total = Number(p.total_con_iva || 0);
            const pagado = pagadoPorProyecto.get(p.id) ?? 0;
            const pct = total > 0 ? (pagado / total) * 100 : 0;
            return (
              <article key={p.id} className="flex flex-col rounded-lg border bg-card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold leading-tight">{p.nombre_proyecto}</h3>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.cliente_nombre}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${estadoStyles[p.estado] ?? estadoStyles.borrador}`}>
                    {p.estado}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="font-mono text-muted-foreground">{p.folio}</span>
                  <span className="font-semibold tabular-nums">{currency(total)}</span>
                </div>

                <div className="mt-3">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Cobrado {currency(pagado)}</span>
                    <span>{pct.toFixed(0)}%</span>
                  </div>
                  <Progress value={Math.min(pct, 100)} className="mt-1.5 h-1.5" />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-1.5">
                  <Link to="/cotizaciones/$id/editar" params={{ id: p.id }}>
                    <Button variant="outline" size="sm" className="w-full px-2 text-[11px]">
                      <FileText className="h-3 w-3" />Cotización
                    </Button>
                  </Link>
                  <Link to="/cotizaciones/$id/desglose" params={{ id: p.id }}>
                    <Button variant="outline" size="sm" className="w-full px-2 text-[11px]">
                      <PieChart className="h-3 w-3" />Desglose
                    </Button>
                  </Link>
                  {p.obra_id ? (
                    <Link to="/proyectos/$obraId" params={{ obraId: p.obra_id }}>
                      <Button variant="outline" size="sm" className="w-full px-2 text-[11px]">
                        <Wallet className="h-3 w-3" />Pagos
                      </Button>
                    </Link>
                  ) : (
                    <Button variant="outline" size="sm" disabled className="w-full px-2 text-[11px]">
                      <Wallet className="h-3 w-3" />Pagos
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
