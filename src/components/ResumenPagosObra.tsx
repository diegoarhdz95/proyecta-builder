import { useQuery } from "@tanstack/react-query";
import { supabase, DESPACHO_ID, type Proyecto } from "@/lib/supabase";

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

type Pago = { id: string; proyecto_id: string; concepto: string; monto: number; fecha_pago: string; metodo_pago: string | null };

export function ResumenPagosObra({ obraId }: { obraId: string }) {
  const { data: cotizaciones } = useQuery({
    queryKey: ["resumen_pagos_cot", obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos").select("id, folio, nombre_proyecto, total_con_iva")
        .eq("despacho_id", DESPACHO_ID).eq("obra_id", obraId)
        .order("folio", { ascending: false });
      if (error) throw error;
      return data as Pick<Proyecto, "id" | "folio" | "nombre_proyecto" | "total_con_iva">[];
    },
  });

  const ids = (cotizaciones ?? []).map((c) => c.id);
  const { data: pagos } = useQuery({
    queryKey: ["resumen_pagos_obra", obraId, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos_cliente").select("id, proyecto_id, concepto, monto, fecha_pago, metodo_pago")
        .in("proyecto_id", ids).order("fecha_pago", { ascending: false });
      if (error) throw error;
      return data as Pago[];
    },
  });

  const byCot = new Map<string, number>();
  (pagos ?? []).forEach((p) => byCot.set(p.proyecto_id, (byCot.get(p.proyecto_id) ?? 0) + Number(p.monto || 0)));
  const totalGeneral = (pagos ?? []).reduce((s, p) => s + Number(p.monto || 0), 0);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-card p-4">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total cobrado en la obra</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{currency(totalGeneral)}</p>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Cotización</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Cobrado</th>
              <th className="px-4 py-3 text-right">Saldo por cobrar</th>
            </tr>
          </thead>
          <tbody>
            {(cotizaciones ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin cotizaciones</td></tr>
            )}
            {cotizaciones?.map((c) => {
              const cobrado = byCot.get(c.id) ?? 0;
              const saldo = Number(c.total_con_iva || 0) - cobrado;
              return (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2.5 font-mono text-xs">{c.folio}</td>
                  <td className="px-4 py-2.5">{c.nombre_proyecto}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{currency(Number(c.total_con_iva || 0))}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{currency(cobrado)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${saldo > 0 ? "text-amber-600" : ""}`}>{currency(saldo)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Últimos pagos
        </div>
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 w-28">Fecha</th>
              <th className="px-4 py-2 w-28">Cotización</th>
              <th className="px-4 py-2">Concepto</th>
              <th className="px-4 py-2">Método</th>
              <th className="px-4 py-2 text-right w-32">Monto</th>
            </tr>
          </thead>
          <tbody>
            {(pagos ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin pagos registrados</td></tr>
            )}
            {(pagos ?? []).slice(0, 50).map((p) => {
              const cot = cotizaciones?.find((c) => c.id === p.proyecto_id);
              return (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2 tabular-nums">{p.fecha_pago}</td>
                  <td className="px-4 py-2 font-mono text-xs">{cot?.folio ?? "—"}</td>
                  <td className="px-4 py-2">{p.concepto}</td>
                  <td className="px-4 py-2 text-muted-foreground">{p.metodo_pago ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{currency(Number(p.monto))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}