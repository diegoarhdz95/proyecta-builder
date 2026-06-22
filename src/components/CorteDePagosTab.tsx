import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Package, HardHat, Users, MoreHorizontal } from "lucide-react";

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

type Row = { fecha: string; categoria: "materiales" | "mano_obra" | "contratistas" | "otros"; concepto: string; detalle: string; monto: number };

const CAT_META: Record<Row["categoria"], { label: string; cls: string; Icon: typeof Package }> = {
  materiales: { label: "Materiales", cls: "bg-blue-100 text-blue-700", Icon: Package },
  mano_obra: { label: "Mano de obra (destajistas)", cls: "bg-emerald-100 text-emerald-700", Icon: HardHat },
  contratistas: { label: "Contratistas", cls: "bg-purple-100 text-purple-700", Icon: Users },
  otros: { label: "Otros", cls: "bg-amber-100 text-amber-700", Icon: MoreHorizontal },
};

export function CorteDePagosTab({ proyectoId }: { proyectoId: string }) {
  const [desde, setDesde] = useState(firstOfMonthISO);
  const [hasta, setHasta] = useState(todayISO);

  const { data: gastos } = useQuery({
    queryKey: ["corte_gastos", proyectoId, desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gastos_proyecto")
        .select("id, categoria, concepto, proveedor, monto, fecha_pago")
        .eq("proyecto_id", proyectoId)
        .gte("fecha_pago", desde)
        .lte("fecha_pago", hasta);
      if (error) throw error;
      return data as { id: string; categoria: "materiales" | "otros"; concepto: string; proveedor: string | null; monto: number; fecha_pago: string }[];
    },
  });

  const { data: pagosPersonal } = useQuery({
    queryKey: ["corte_pagos_personal", proyectoId, desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos_personal")
        .select("id, concepto, monto, fecha_pago, personal:personal_id(nombre, categoria)")
        .eq("proyecto_id", proyectoId)
        .gte("fecha_pago", desde)
        .lte("fecha_pago", hasta);
      if (error) throw error;
      return data as {
        id: string;
        concepto: string;
        monto: number;
        fecha_pago: string;
        personal: { nombre: string; categoria: "destajista" | "contratista" } | null;
      }[];
    },
  });

  const rows: Row[] = useMemo(() => {
    const r: Row[] = [];
    (gastos ?? []).forEach((g) =>
      r.push({
        fecha: g.fecha_pago,
        categoria: g.categoria === "materiales" ? "materiales" : "otros",
        concepto: g.concepto,
        detalle: g.proveedor ?? "",
        monto: Number(g.monto || 0),
      })
    );
    (pagosPersonal ?? []).forEach((p) => {
      const cat: Row["categoria"] = p.personal?.categoria === "contratista" ? "contratistas" : "mano_obra";
      r.push({
        fecha: p.fecha_pago,
        categoria: cat,
        concepto: p.concepto,
        detalle: p.personal?.nombre ?? "",
        monto: Number(p.monto || 0),
      });
    });
    return r.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }, [gastos, pagosPersonal]);

  const totales = useMemo(() => {
    const t: Record<Row["categoria"], number> = { materiales: 0, mano_obra: 0, contratistas: 0, otros: 0 };
    rows.forEach((r) => (t[r.categoria] += r.monto));
    return t;
  }, [rows]);
  const totalGeneral = totales.materiales + totales.mano_obra + totales.contratistas + totales.otros;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Desde</label>
            <Input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="mt-1 w-44" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Hasta</label>
            <Input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className="mt-1 w-44" />
          </div>
          <div className="ml-auto text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total del periodo</p>
            <p className="text-2xl font-bold tabular-nums">{currency(totalGeneral)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(Object.keys(CAT_META) as Row["categoria"][]).map((k) => {
          const meta = CAT_META[k];
          const Icon = meta.Icon;
          return (
            <div key={k} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${meta.cls}`}>
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </span>
              </div>
              <p className="mt-2 text-xl font-semibold tabular-nums">{currency(totales[k])}</p>
              <p className="text-[11px] text-muted-foreground">
                {totalGeneral > 0 ? `${((totales[k] / totalGeneral) * 100).toFixed(1)}%` : "0%"} del periodo
              </p>
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 w-28">Fecha</th>
              <th className="px-4 py-3 w-44">Categoría</th>
              <th className="px-4 py-3">Concepto</th>
              <th className="px-4 py-3">Proveedor / Persona</th>
              <th className="px-4 py-3 text-right w-32">Monto</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Sin movimientos en este periodo
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const meta = CAT_META[r.categoria];
              return (
                <tr key={i} className="border-t">
                  <td className="px-4 py-2.5 tabular-nums">{r.fecha}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{r.concepto}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.detalle || "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{currency(r.monto)}</td>
                </tr>
              );
            })}
            {rows.length > 0 && (
              <tr className="border-t bg-muted/30 font-semibold">
                <td colSpan={4} className="px-4 py-2.5 text-right">Total general</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{currency(totalGeneral)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}