import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase, DESPACHO_ID, IVA_RATE, type Obra, type Proyecto } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/proyectos/$obraId")({
  head: () => ({ meta: [{ title: "Proyecto · Grupo Proyecta" }] }),
  component: ProyectoPage,
});

const estadoBadge: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground",
  enviada: "bg-blue-100 text-blue-700",
  aprobada: "bg-green-100 text-green-700",
  rechazada: "bg-red-100 text-red-700",
};

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

function ProyectoPage() {
  const { obraId } = Route.useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"cotizaciones" | "desglose" | "pagos">("cotizaciones");

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
                    <tr key={p.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{p.folio}</td>
                      <td className="px-4 py-3 font-medium">{p.nombre_proyecto}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{currency(p.total_con_iva)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${estadoBadge[p.estado] ?? estadoBadge.borrador}`}>
                          {p.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to="/cotizaciones/$id/editar" params={{ id: p.id }} className="text-primary hover:underline">Editar</Link>
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
            <PagosTab />
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

function PagosTab() {
  return (
    <div className="rounded-lg border bg-card p-10 text-center">
      <h3 className="text-base font-semibold">Pagos</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Próximamente: registro y seguimiento de pagos del proyecto.
      </p>
    </div>
  );
}