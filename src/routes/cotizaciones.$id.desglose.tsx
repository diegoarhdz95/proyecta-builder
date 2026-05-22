import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

export const Route = createFileRoute("/cotizaciones/$id/desglose")({
  head: () => ({ meta: [{ title: "Desglose financiero · Grupo Proyecta" }] }),
  component: Desglose,
});

type Row = {
  proyecto_id: string;
  nombre_proyecto: string;
  cliente_nombre: string;
  folio: string;
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

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

const COLORS = {
  materiales: "#2563eb",
  mano_obra: "#16a34a",
  herramienta: "#eab308",
  indirectos: "#ea580c",
  utilidad: "#7c3aed",
};

function Desglose() {
  const { id } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["desglose", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("desglose_financiero_proyecto")
        .select("*")
        .eq("proyecto_id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });

  const d = data;
  const subtotal = Number(d?.subtotal_sin_iva || 0);
  const pct = (n: number) => (subtotal > 0 ? (Number(n) / subtotal) * 100 : 0);

  const chartData = d
    ? [
        { name: "Materiales", value: Number(d.total_materiales), color: COLORS.materiales },
        { name: "Mano de obra", value: Number(d.total_mano_obra), color: COLORS.mano_obra },
        { name: "Herramienta", value: Number(d.total_herramienta), color: COLORS.herramienta },
        { name: "Indirectos", value: Number(d.total_indirectos), color: COLORS.indirectos },
        { name: "Utilidad", value: Number(d.total_utilidad), color: COLORS.utilidad },
      ]
    : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to="/cotizaciones/$id/editar" params={{ id }} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <p className="font-mono text-xs text-muted-foreground">{d?.folio}</p>
              <h1 className="text-base font-semibold">Desglose financiero · {d?.nombre_proyecto}</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] space-y-6 px-6 py-6">
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!isLoading && !d && (
          <p className="text-sm text-muted-foreground">Sin datos. Agrega conceptos a la cotización.</p>
        )}
        {d && (
          <>
            {/* Tarjetas */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <SummaryCard label="Materiales" value={d.total_materiales} dotColor={COLORS.materiales} />
              <SummaryCard label="Mano de obra" value={d.total_mano_obra} dotColor={COLORS.mano_obra} />
              <SummaryCard label="Herramienta" value={d.total_herramienta} dotColor={COLORS.herramienta} />
              <SummaryCard label="Indirectos" value={d.total_indirectos} dotColor={COLORS.indirectos} />
              <SummaryCard label="Tu utilidad" value={d.total_utilidad} dotColor={COLORS.utilidad} />
              <SummaryCard label="Total con IVA" value={d.total_con_iva} highlight />
            </div>

            {/* Gráfica */}
            <section className="rounded-lg border bg-card p-6">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Proporción sobre subtotal sin IVA
              </h2>
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={80}
                      outerRadius={130}
                      paddingAngle={2}
                      label={(e: { name: string; value: number }) =>
                        `${e.name} ${pct(e.value).toFixed(1)}%`
                      }
                    >
                      {chartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => currency(Number(v))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Tabla */}
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
                  <Tr label="Materiales" value={d.total_materiales} pct={pct(d.total_materiales)} />
                  <Tr label="Mano de obra" value={d.total_mano_obra} pct={pct(d.total_mano_obra)} />
                  <Tr label="Herramienta" value={d.total_herramienta} pct={pct(d.total_herramienta)} />
                  <Tr label="Costo directo" value={d.total_costo_directo} pct={pct(d.total_costo_directo)} muted />
                  <Tr label="Indirectos" value={d.total_indirectos} pct={pct(d.total_indirectos)} />
                  <Tr label="Utilidad" value={d.total_utilidad} pct={pct(d.total_utilidad)} />
                  <Tr label="Subtotal sin IVA" value={d.subtotal_sin_iva} pct={100} muted />
                  <Tr label="IVA 16%" value={d.iva} pct={null} />
                  <tr className="border-t bg-primary/10 font-semibold">
                    <td className="px-4 py-3">TOTAL CON IVA</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(d.total_con_iva)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">—</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <p className="text-xs text-muted-foreground">
              Los montos se actualizan automáticamente al modificar conceptos o cantidades en la cotización.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  dotColor,
  highlight,
}: {
  label: string;
  value: number;
  dotColor?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "bg-primary text-primary-foreground" : "bg-card"}`}>
      <div className="flex items-center gap-2">
        {dotColor && <span className="h-2 w-2 rounded-full" style={{ background: dotColor }} />}
        <p className={`text-xs uppercase tracking-wide ${highlight ? "opacity-80" : "text-muted-foreground"}`}>
          {label}
        </p>
      </div>
      <p className="mt-2 text-lg font-semibold tabular-nums">{currency(Number(value))}</p>
    </div>
  );
}

function Tr({
  label,
  value,
  pct,
  muted,
}: {
  label: string;
  value: number;
  pct: number | null;
  muted?: boolean;
}) {
  return (
    <tr className={`border-t ${muted ? "bg-muted/20 font-medium" : ""}`}>
      <td className="px-4 py-2.5">{label}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">{currency(Number(value))}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
        {pct === null ? "—" : `${pct.toFixed(1)}%`}
      </td>
    </tr>
  );
}