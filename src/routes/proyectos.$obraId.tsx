import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase, DESPACHO_ID, IVA_RATE, type Obra, type Proyecto } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Plus, Trash2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { ExpedienteTab } from "@/components/ExpedienteTab";
import { downloadOrShareReciboPDF } from "@/lib/generate-recibo-pdf";
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
  const [tab, setTab] = useState<"cotizaciones" | "desglose" | "pagos" | "expediente">("cotizaciones");

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
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
            <nav className="flex items-center gap-1 text-xs text-muted-foreground">
              <Link to="/" className="hover:text-foreground">Proyectos</Link>
              <span>›</span>
              <span className="text-foreground">{obra?.nombre ?? "…"}</span>
            </nav>
          </div>
          <div className="mt-3">
            <h1 className="text-xl font-semibold tracking-tight">{obra?.nombre}</h1>
            <p className="text-sm text-muted-foreground">{obra?.cliente_nombre}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="cotizaciones">Cotizaciones</TabsTrigger>
            <TabsTrigger value="desglose">Desglose financiero</TabsTrigger>
            <TabsTrigger value="pagos">Pagos</TabsTrigger>
            <TabsTrigger value="expediente">Expediente</TabsTrigger>
          </TabsList>

          <TabsContent value="cotizaciones" className="mt-6 space-y-4">
            <div className="flex justify-end">
              <Button onClick={nuevaCotizacion}><Plus className="mr-2 h-4 w-4" />Nueva cotización</Button>
            </div>
            <div className="overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Folio</th>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {cotizaciones?.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Sin cotizaciones aún</td></tr>
                  )}
                  {cotizaciones?.map((p) => (
                    <tr
                      key={p.id}
                      className="cursor-pointer border-t hover:bg-muted/30"
                      onClick={() => navigate({ to: "/cotizaciones/$id", params: { id: p.id } })}
                    >
                      <td className="px-4 py-3 font-mono text-xs">{p.folio}</td>
                      <td className="px-4 py-3 font-medium">{p.nombre_proyecto}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{currency(p.total_con_iva)}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
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
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="desglose" className="mt-6">
            <DesgloseObra obraId={obraId} />
          </TabsContent>

          <TabsContent value="pagos" className="mt-6">
            <PagosTab obraId={obraId} />
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

type Pago = {
  id: string;
  proyecto_id: string;
  concepto: string;
  monto: number;
  fecha_pago: string;
  metodo_pago: string | null;
  notas: string | null;
  numero_pago?: number | null;
};

function PagosTab({ obraId }: { obraId: string }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>("");
  const [form, setForm] = useState({
    concepto: "",
    monto: "",
    fecha_pago: new Date().toISOString().slice(0, 10),
    metodo_pago: "Transferencia",
    notas: "",
  });

  const { data: proyectos } = useQuery({
    queryKey: ["pagos_proyectos", obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select("id, folio, nombre_proyecto, total_con_iva, cliente_nombre")
        .eq("obra_id", obraId)
        .order("folio", { ascending: false });
      if (error) throw error;
      return data as Array<Pick<Proyecto, "id" | "folio" | "nombre_proyecto" | "total_con_iva" | "cliente_nombre">>;
    },
  });

  const { data: despacho } = useQuery({
    queryKey: ["despacho", DESPACHO_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("despachos")
        .select("nombre, logo_url")
        .eq("id", DESPACHO_ID)
        .single();
      if (error) throw error;
      return data as { nombre: string; logo_url: string | null };
    },
  });

  const ids = (proyectos ?? []).map((p) => p.id);

  useEffect(() => {
    if (!selectedId && ids.length > 0) setSelectedId(ids[0]);
  }, [ids, selectedId]);

  const { data: pagos } = useQuery({
    queryKey: ["pagos_cliente", obraId, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos_cliente")
        .select("*")
        .in("proyecto_id", ids)
        .order("fecha_pago", { ascending: false });
      if (error) throw error;
      return data as Pago[];
    },
  });

  const totalContratado = (proyectos ?? []).reduce((s, p) => s + Number(p.total_con_iva || 0), 0);
  const totalPagado = (pagos ?? []).reduce((s, p) => s + Number(p.monto || 0), 0);
  const saldo = totalContratado - totalPagado;
  const pct = totalContratado > 0 ? (totalPagado / totalContratado) * 100 : 0;

  const selectedProy = proyectos?.find((p) => p.id === selectedId);
  const pagosSel = (pagos ?? []).filter((p) => p.proyecto_id === selectedId);
  const totalSel = Number(selectedProy?.total_con_iva || 0);
  const pagadoSel = pagosSel.reduce((s, p) => s + Number(p.monto || 0), 0);
  const saldoSel = totalSel - pagadoSel;
  const pctSel = totalSel > 0 ? (pagadoSel / totalSel) * 100 : 0;

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return toast.error("Selecciona una cotización");
    if (!form.concepto.trim()) return toast.error("Concepto requerido");
    const monto = Number(form.monto);
    if (!monto || monto <= 0) return toast.error("Monto inválido");
    try {
      const { error } = await supabase.from("pagos_cliente").insert({
        proyecto_id: selectedId,
        concepto: form.concepto.trim(),
        monto,
        fecha_pago: form.fecha_pago,
        metodo_pago: form.metodo_pago || null,
        notas: form.notas || null,
      });
      if (error) throw error;
      toast.success("Pago registrado");
      setForm({ ...form, concepto: "", monto: "", notas: "" });
      qc.invalidateQueries({ queryKey: ["pagos_cliente", obraId] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este pago?")) return;
    const { error } = await supabase.from("pagos_cliente").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Pago eliminado");
    qc.invalidateQueries({ queryKey: ["pagos_cliente", obraId] });
  }

  async function generarRecibo(p: Pago) {
    try {
      const proy = proyectos?.find((x) => x.id === p.proyecto_id);
      if (!proy) return toast.error("Cotización no encontrada");

      // Asignar número de recibo consecutivo (por despacho) si aún no tiene
      let numero = p.numero_pago ?? null;
      if (!numero) {
        const { data: maxRow, error: maxErr } = await supabase
          .from("pagos_cliente")
          .select("numero_pago, proyectos!inner(despacho_id)")
          .eq("proyectos.despacho_id", DESPACHO_ID)
          .not("numero_pago", "is", null)
          .order("numero_pago", { ascending: false })
          .limit(1);
        if (maxErr) throw maxErr;
        const last = (maxRow?.[0]?.numero_pago as number | null) ?? 0;
        numero = last + 1;
        const { error: upErr } = await supabase
          .from("pagos_cliente")
          .update({ numero_pago: numero })
          .eq("id", p.id);
        if (upErr) throw upErr;
        qc.invalidateQueries({ queryKey: ["pagos_cliente", obraId] });
      }

      await downloadOrShareReciboPDF({
        despacho: despacho ?? { nombre: "Grupo Proyecta", logo_url: null },
        numeroRecibo: numero,
        proyectoNombre: proy.nombre_proyecto,
        folio: proy.folio,
        clienteNombre: proy.cliente_nombre || "",
        monto: Number(p.monto),
        concepto: p.concepto,
        fechaPago: p.fecha_pago,
        metodoPago: p.metodo_pago,
        notas: p.notas,
      });
      toast.success(`Recibo #${String(numero).padStart(5, "0")} generado`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Resumen general del proyecto</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total contratado" value={totalContratado} />
        <StatCard label="Total cobrado" value={totalPagado} />
        <StatCard label="Saldo pendiente" value={saldo} />
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">% cobrado</p>
          <p className="mt-2 text-lg font-semibold tabular-nums">{pct.toFixed(1)}%</p>
          <Progress value={Math.min(pct, 100)} className="mt-2" />
        </div>
      </div>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex-1">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Cotización</label>
            <select
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">— seleccionar —</option>
              {proyectos?.map((p) => (
                <option key={p.id} value={p.id}>{p.folio} · {p.nombre_proyecto}</option>
              ))}
            </select>
          </div>
        </div>

        {selectedProy && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Total cotización" value={totalSel} />
              <StatCard label="Cobrado" value={pagadoSel} />
              <StatCard label="Pendiente" value={saldoSel} />
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">% cobrado</p>
                <p className="mt-2 text-lg font-semibold tabular-nums">{pctSel.toFixed(1)}%</p>
                <Progress value={Math.min(pctSel, 100)} className="mt-2" />
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Concepto</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3">Método</th>
              <th className="px-4 py-3">Notas</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {pagosSel.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sin pagos registrados</td></tr>
            )}
            {pagosSel.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2.5 tabular-nums">{p.fecha_pago}</td>
                <td className="px-4 py-2.5">{p.concepto}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{currency(p.monto)}</td>
                <td className="px-4 py-2.5">{p.metodo_pago ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.notas ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <Button variant="ghost" size="icon" onClick={() => eliminar(p.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
            </div>

            <form onSubmit={registrar} className="mt-5 rounded-lg border p-5">
              <h3 className="text-sm font-semibold">Registrar nuevo pago en {selectedProy.folio}</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="text-xs text-muted-foreground">Concepto</label>
            <Input
              className="mt-1"
              placeholder="Anticipo, Estimación 1…"
              value={form.concepto}
              onChange={(e) => setForm({ ...form, concepto: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Monto</label>
            <Input
              className="mt-1"
              type="number"
              step="0.01"
              value={form.monto}
              onChange={(e) => setForm({ ...form, monto: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Fecha</label>
            <Input
              className="mt-1"
              type="date"
              value={form.fecha_pago}
              onChange={(e) => setForm({ ...form, fecha_pago: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Método de pago</label>
            <Input
              className="mt-1"
              placeholder="Transferencia, Efectivo…"
              value={form.metodo_pago}
              onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className="text-xs text-muted-foreground">Notas</label>
            <Textarea
              className="mt-1"
              rows={2}
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit"><Plus className="mr-2 h-4 w-4" />Registrar pago</Button>
        </div>
      </form>
          </>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold tabular-nums">{currency(value)}</p>
    </div>
  );
}