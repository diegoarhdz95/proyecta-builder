import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase, DESPACHO_ID, IVA_RATE, type Obra, type Proyecto } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { ExpedienteTab } from "@/components/ExpedienteTab";
import { ResumenPagosObra } from "@/components/ResumenPagosObra";
import { ResumenGastosObra } from "@/components/ResumenGastosObra";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ESTADOS, estadoMeta } from "@/lib/estado-cotizacion";

const CHART_COLORS = {
  materiales: "#2563eb",
  mano_obra: "#16a34a",
  herramienta: "#eab308",
  indirectos: "#ea580c",
  utilidad: "#7c3aed",
};

export const Route = createFileRoute("/proyectos/$obraId")({
  head: () => ({ meta: [{ title: "Proyecto · Grupo Proyecta" }] }),
  component: ProyectoPage,
});

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

function ProyectoPage() {
  const { obraId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"cotizaciones" | "pagos" | "gastos" | "desglose" | "expediente">("cotizaciones");
  const [search, setSearch] = useState("");

  const { data: obra } = useQuery({
    queryKey: ["obra", obraId],
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("*").eq("id", obraId).single();
      if (error) throw error;
      return data as Obra;
    },
  });

  const { data: cotizaciones } = useQuery({
    queryKey: ["cotizaciones_obra", obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select("*")
        .eq("despacho_id", DESPACHO_ID)
        .eq("obra_id", obraId)
        .order("folio", { ascending: false });
      if (error) throw error;
      return data as Proyecto[];
    },
  });

  async function cambiarEstado(id: string, estado: string) {
    const { error } = await supabase.from("proyectos").update({ estado }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Estado actualizado");
    qc.invalidateQueries({ queryKey: ["cotizaciones_obra", obraId] });
    qc.invalidateQueries({ queryKey: ["dashboard_proyectos"] });
  }

  async function eliminarCotizacion(id: string, folio: string) {
    const { error: cErr } = await supabase.from("proyecto_conceptos").delete().eq("proyecto_id", id);
    if (cErr) return toast.error(cErr.message);
    const { error } = await supabase.from("proyectos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Cotización ${folio} eliminada`);
    qc.invalidateQueries({ queryKey: ["cotizaciones_obra", obraId] });
    qc.invalidateQueries({ queryKey: ["dashboard_proyectos"] });
  }

  async function nuevaCotizacion() {
    try {
      const year = new Date().getFullYear();
      const prefix = `COT-${year}-`;
      const { data: last, error: lErr } = await supabase
        .from("proyectos")
        .select("folio")
        .eq("despacho_id", DESPACHO_ID)
        .like("folio", `${prefix}%`)
        .order("folio", { ascending: false })
        .limit(1);
      if (lErr) throw lErr;
      let next = 1;
      if (last?.[0]?.folio) {
        const n = parseInt(last[0].folio.split("-")[2] ?? "0", 10);
        if (!Number.isNaN(n)) next = n + 1;
      }
      const folio = `${prefix}${String(next).padStart(4, "0")}`;
      const { data, error } = await supabase
        .from("proyectos")
        .insert({
          despacho_id: DESPACHO_ID,
          obra_id: obraId,
          folio,
          nombre_proyecto: obra?.nombre ?? "Sin nombre",
          cliente_nombre: obra?.cliente_nombre ?? "—",
          cliente_email: obra?.cliente_email ?? null,
          tipo_proyecto_id: obra?.tipo_proyecto_id ?? null,
          domicilio_obra: obra?.domicilio ?? null,
          subtotal: 0,
          iva: 0,
          total_con_iva: 0,
          estado: "borrador",
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success(`Cotización ${folio} creada`);
      navigate({ to: "/cotizaciones/$id/editar", params: { id: data.id } });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
            <nav className="flex items-center gap-1 text-xs text-muted-foreground">
              <Link to="/" className="hover:text-foreground">Proyectos</Link>
              <span>›</span>
              <span className="truncate text-foreground">{obra?.nombre ?? "…"}</span>
            </nav>
          </div>
          <div className="mt-3">
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{obra?.nombre}</h1>
            <p className="text-sm text-muted-foreground">{obra?.cliente_nombre}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="flex w-full justify-start overflow-x-auto md:w-auto md:justify-start">
            <TabsTrigger value="cotizaciones">Cotizaciones</TabsTrigger>
            <TabsTrigger value="pagos">Pagos</TabsTrigger>
            <TabsTrigger value="gastos">Gastos</TabsTrigger>
            <TabsTrigger value="desglose">Desglose</TabsTrigger>
            <TabsTrigger value="expediente">Expediente</TabsTrigger>
          </TabsList>

          <TabsContent value="cotizaciones" className="mt-3 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por folio o nombre…"
                className="sm:max-w-xs"
              />
              <Button onClick={nuevaCotizacion}><Plus className="mr-2 h-4 w-4" />Nueva cotización</Button>
            </div>
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Folio</th>
                    <th className="px-4 py-2">Nombre</th>
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const q = search.trim().toLowerCase();
                    const filtered = (cotizaciones ?? []).filter(
                      (p) =>
                        !q ||
                        p.folio.toLowerCase().includes(q) ||
                        (p.nombre_proyecto ?? "").toLowerCase().includes(q),
                    );
                    if (filtered.length === 0) {
                      return (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{cotizaciones?.length ? "Sin resultados" : "Sin cotizaciones aún"}</td></tr>
                      );
                    }
                    return filtered.map((p) => {
                    return (
                    <tr
                      key={p.id}
                      className="cursor-pointer border-t hover:bg-muted/30"
                      onClick={() => navigate({ to: "/cotizaciones/$id", params: { id: p.id } })}
                    >
                      <td className="px-4 py-2 font-mono text-xs">{p.folio}</td>
                      <td className="px-4 py-2 font-medium">{p.nombre_proyecto}</td>
                      <td className="px-4 py-2 text-muted-foreground tabular-nums">
                        {p.created_at ? new Date(p.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${estadoMeta(p.estado).cls}`}
                            >
                              {estadoMeta(p.estado).label}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            {ESTADOS.map((e) => (
                              <DropdownMenuItem key={e.value} onClick={() => cambiarEstado(p.id, e.value)}>
                                <span className={`mr-2 inline-block h-2 w-2 rounded-full ${e.dot}`} />
                                {e.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                      <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-3">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Eliminar cotización">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar cotización?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta acción no se puede deshacer. Se eliminará la cotización {p.folio} y todos sus conceptos asociados.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => eliminarCotizacion(p.id, p.folio)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                    );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="desglose" className="mt-6">
            <DesgloseObra obraId={obraId} />
          </TabsContent>

          <TabsContent value="pagos" className="mt-6">
            <ResumenPagosObra obraId={obraId} />
          </TabsContent>

          <TabsContent value="gastos" className="mt-6">
            <ResumenGastosObra obraId={obraId} />
          </TabsContent>

          <TabsContent value="expediente" className="mt-6">
            <ExpedienteTab obraId={obraId} />
          </TabsContent>
        </Tabs>
      </main>

    </div>
  );
}

type DesgloseRow = {
  proyecto_id: string;
  total_materiales: number;
  total_mano_obra: number;
  total_herramienta: number;
  total_costo_directo: number;
  total_indirectos: number;
  total_utilidad: number;
  subtotal_sin_iva: number;
  iva: number;
  total_con_iva: number;
};

function DesgloseObra({ obraId }: { obraId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["desglose_obra", obraId],
    queryFn: async () => {
      const { data: proys, error: pErr } = await supabase
        .from("proyectos")
        .select("id")
        .eq("obra_id", obraId);
      if (pErr) throw pErr;
      const ids = (proys ?? []).map((p) => p.id);
      if (ids.length === 0) return null;
      const { data, error } = await supabase
        .from("desglose_financiero_proyecto")
        .select("*")
        .in("proyecto_id", ids);
      if (error) throw error;
      const rows = (data ?? []) as DesgloseRow[];
      const sum = (k: keyof DesgloseRow) =>
        rows.reduce((s, r) => s + Number(r[k] || 0), 0);
      const subtotal = sum("subtotal_sin_iva");
      return {
        total_materiales: sum("total_materiales"),
        total_mano_obra: sum("total_mano_obra"),
        total_herramienta: sum("total_herramienta"),
        total_costo_directo: sum("total_costo_directo"),
        total_indirectos: sum("total_indirectos"),
        total_utilidad: sum("total_utilidad"),
        subtotal_sin_iva: subtotal,
        iva: subtotal * IVA_RATE,
        total_con_iva: subtotal * (1 + IVA_RATE),
      };
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Sin datos. Agrega cotizaciones al proyecto.</p>;

  const pct = (n: number) => (data.subtotal_sin_iva > 0 ? (n / data.subtotal_sin_iva) * 100 : 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Card label="Materiales" value={data.total_materiales} />
        <Card label="Mano de obra" value={data.total_mano_obra} />
        <Card label="Herramienta" value={data.total_herramienta} />
        <Card label="Indirectos" value={data.total_indirectos} />
        <Card label="Tu utilidad" value={data.total_utilidad} />
        <Card label="Total con IVA" value={data.total_con_iva} highlight />
      </div>
      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Proporción sobre subtotal sin IVA
        </h2>
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={[
                  { name: "Materiales", value: data.total_materiales, color: CHART_COLORS.materiales },
                  { name: "Mano de obra", value: data.total_mano_obra, color: CHART_COLORS.mano_obra },
                  { name: "Herramienta", value: data.total_herramienta, color: CHART_COLORS.herramienta },
                  { name: "Indirectos", value: data.total_indirectos, color: CHART_COLORS.indirectos },
                  { name: "Utilidad", value: data.total_utilidad, color: CHART_COLORS.utilidad },
                ]}
                dataKey="value"
                nameKey="name"
                innerRadius={80}
                outerRadius={130}
                paddingAngle={2}
                label={(e: { name: string; value: number }) =>
                  `${e.name} ${pct(e.value).toFixed(1)}%`
                }
              >
                {[CHART_COLORS.materiales, CHART_COLORS.mano_obra, CHART_COLORS.herramienta, CHART_COLORS.indirectos, CHART_COLORS.utilidad].map((c) => (
                  <Cell key={c} fill={c} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => currency(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Rubro</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3 text-right w-40">% del subtotal</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Materiales" value={data.total_materiales} pct={pct(data.total_materiales)} />
            <Row label="Mano de obra" value={data.total_mano_obra} pct={pct(data.total_mano_obra)} />
            <Row label="Herramienta" value={data.total_herramienta} pct={pct(data.total_herramienta)} />
            <Row label="Costo directo" value={data.total_costo_directo} pct={pct(data.total_costo_directo)} muted />
            <Row label="Indirectos" value={data.total_indirectos} pct={pct(data.total_indirectos)} />
            <Row label="Utilidad" value={data.total_utilidad} pct={pct(data.total_utilidad)} />
            <Row label="Subtotal sin IVA" value={data.subtotal_sin_iva} pct={100} muted />
            <Row label="IVA 16%" value={data.iva} pct={null} />
            <tr className="border-t bg-primary/10 font-semibold">
              <td className="px-4 py-3">TOTAL CON IVA</td>
              <td className="px-4 py-3 text-right tabular-nums">{currency(data.total_con_iva)}</td>
              <td className="px-4 py-3 text-right tabular-nums">—</td>
            </tr>
          </tbody>
        </table>
      </section>
      <p className="text-xs text-muted-foreground">
        Suma de todas las cotizaciones del proyecto. Los montos se actualizan automáticamente al modificar conceptos o cantidades.
      </p>
    </div>
  );
}

function Card({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "bg-primary text-primary-foreground" : "bg-card"}`}>
      <p className={`text-xs uppercase tracking-wide ${highlight ? "opacity-80" : "text-muted-foreground"}`}>{label}</p>
      <p className="mt-2 text-lg font-semibold tabular-nums">{currency(value)}</p>
    </div>
  );
}

function Row({ label, value, pct, muted }: { label: string; value: number; pct: number | null; muted?: boolean }) {
  return (
    <tr className={`border-t ${muted ? "bg-muted/20 font-medium" : ""}`}>
      <td className="px-4 py-2.5">{label}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">{currency(value)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
        {pct === null ? "—" : `${pct.toFixed(1)}%`}
      </td>
    </tr>
  );
}

