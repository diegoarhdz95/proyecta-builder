import { useQuery } from "@tanstack/react-query";
import { supabase, DESPACHO_ID, type Proyecto, type GastoCategoria } from "@/lib/supabase";

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

type Gasto = { id: string; proyecto_id: string; categoria: GastoCategoria; concepto: string; proveedor: string | null; monto: number; fecha_pago: string };
type PagoPers = { id: string; proyecto_id: string; monto: number; fecha_pago: string; concepto: string | null };

export function ResumenGastosObra({ obraId }: { obraId: string }) {
  const { data: cotizaciones } = useQuery({
    queryKey: ["resumen_gastos_cot", obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos").select("id, folio, nombre_proyecto")
        .eq("despacho_id", DESPACHO_ID).eq("obra_id", obraId)
        .order("folio", { ascending: false });
      if (error) throw error;
      return data as Pick<Proyecto, "id" | "folio" | "nombre_proyecto">[];
    },
  });

  const ids = (cotizaciones ?? []).map((c) => c.id);

  const { data } = useQuery({
    queryKey: ["resumen_gastos_obra", obraId, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const [{ data: gastos }, { data: pagosPers }] = await Promise.all([
        supabase.from("gastos_proyecto")
          .select("id, proyecto_id, categoria, concepto, proveedor, monto, fecha_pago")
          .in("proyecto_id", ids).order("fecha_pago", { ascending: false }),
        supabase.from("pagos_personal")
          .select("id, proyecto_id, monto, fecha_pago, concepto")
          .in("proyecto_id", ids).order("fecha_pago", { ascending: false }),
      ]);
      return { gastos: (gastos ?? []) as Gasto[], pagosPers: (pagosPers ?? []) as PagoPers[] };
    },
  });

  const gastos = data?.gastos ?? [];
  const pagosPers = data?.pagosPers ?? [];

  const totMateriales = gastos.filter((g) => g.categoria === "materiales").reduce((s, g) => s + Number(g.monto || 0), 0);
  const totOtros = gastos.filter((g) => g.categoria === "otros").reduce((s, g) => s + Number(g.monto || 0), 0);
  const totPersonal = pagosPers.reduce((s, p) => s + Number(p.monto || 0), 0);
  const totalGeneral = totMateriales + totOtros + totPersonal;

  // Por cotización
  const byCot = new Map<string, { mat: number; otros: number; pers: number }>();
  gastos.forEach((g) => {
    const r = byCot.get(g.proyecto_id) ?? { mat: 0, otros: 0, pers: 0 };
    if (g.categoria === "materiales") r.mat += Number(g.monto || 0);
    else r.otros += Number(g.monto || 0);
    byCot.set(g.proyecto_id, r);
  });
  pagosPers.forEach((p) => {
    const r = byCot.get(p.proyecto_id) ?? { mat: 0, otros: 0, pers: 0 };
    r.pers += Number(p.monto || 0);
    byCot.set(p.proyecto_id, r);
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Total gastado" value={totalGeneral} highlight />
        <Card label="Materiales" value={totMateriales} />
        <Card label="Personal" value={totPersonal} />
        <Card label="Otros" value={totOtros} />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Cotización</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3 text-right">Materiales</th>
              <th className="px-4 py-3 text-right">Personal</th>
              <th className="px-4 py-3 text-right">Otros</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(cotizaciones ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sin cotizaciones</td></tr>
            )}
            {cotizaciones?.map((c) => {
              const r = byCot.get(c.id) ?? { mat: 0, otros: 0, pers: 0 };
              const tot = r.mat + r.otros + r.pers;
              return (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2.5 font-mono text-xs">{c.folio}</td>
                  <td className="px-4 py-2.5">{c.nombre_proyecto}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{currency(r.mat)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{currency(r.pers)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{currency(r.otros)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{currency(tot)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Últimos gastos
        </div>
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 w-28">Fecha</th>
              <th className="px-4 py-2 w-28">Cotización</th>
              <th className="px-4 py-2 w-28">Categoría</th>
              <th className="px-4 py-2">Concepto</th>
              <th className="px-4 py-2">Proveedor</th>
              <th className="px-4 py-2 text-right w-32">Monto</th>
            </tr>
          </thead>
          <tbody>
            {gastos.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sin gastos registrados</td></tr>
            )}
            {gastos.slice(0, 50).map((g) => {
              const cot = cotizaciones?.find((c) => c.id === g.proyecto_id);
              return (
                <tr key={g.id} className="border-t">
                  <td className="px-4 py-2 tabular-nums">{g.fecha_pago}</td>
                  <td className="px-4 py-2 font-mono text-xs">{cot?.folio ?? "—"}</td>
                  <td className="px-4 py-2 capitalize">{g.categoria}</td>
                  <td className="px-4 py-2">{g.concepto}</td>
                  <td className="px-4 py-2 text-muted-foreground">{g.proveedor ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{currency(Number(g.monto))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${highlight ? "bg-primary/10 border-primary/30" : "bg-card"}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{currency(value)}</p>
    </div>
  );
}