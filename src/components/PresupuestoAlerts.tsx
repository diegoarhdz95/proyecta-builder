import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { AlertTriangle, AlertOctagon } from "lucide-react";

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

type Cat = "materiales" | "mano_obra" | "contratistas" | "otros";
const LABEL: Record<Cat, string> = {
  materiales: "Materiales",
  mano_obra: "Mano de obra",
  contratistas: "Contratistas",
  otros: "Otros",
};

type Desglose = {
  proyecto_id: string;
  total_materiales: number;
  total_mano_obra: number;
  total_herramienta: number;
  total_indirectos: number;
};

export function PresupuestoAlerts({ obraId }: { obraId: string }) {
  const { data } = useQuery({
    queryKey: ["presupuesto_alerts", obraId],
    queryFn: async () => {
      const { data: proys, error: pErr } = await supabase
        .from("proyectos").select("id").eq("obra_id", obraId);
      if (pErr) throw pErr;
      const ids = (proys ?? []).map((p) => p.id);
      if (ids.length === 0) return null;

      const [{ data: desglose }, { data: gastos }, { data: pagosPersonal }] = await Promise.all([
        supabase.from("desglose_financiero_proyecto").select("*").in("proyecto_id", ids),
        supabase.from("gastos_proyecto").select("categoria, monto").in("proyecto_id", ids),
        supabase
          .from("pagos_personal")
          .select("monto, personal:personal_id(categoria)")
          .in("proyecto_id", ids),
      ]);

      const d = (desglose ?? []) as Desglose[];
      const sum = (k: keyof Desglose) => d.reduce((s, r) => s + Number(r[k] || 0), 0);

      const presupuesto: Record<Cat, number> = {
        materiales: sum("total_materiales"),
        mano_obra: sum("total_mano_obra"),
        contratistas: sum("total_indirectos"),
        otros: sum("total_herramienta"),
      };

      const real: Record<Cat, number> = { materiales: 0, mano_obra: 0, contratistas: 0, otros: 0 };
      (gastos ?? []).forEach((g: { categoria: string; monto: number }) => {
        if (g.categoria === "materiales") real.materiales += Number(g.monto || 0);
        else real.otros += Number(g.monto || 0);
      });
      (pagosPersonal ?? []).forEach((p: { monto: number; personal: unknown }) => {
        const per = Array.isArray(p.personal) ? p.personal[0] : p.personal;
        const c = (per as { categoria?: string } | null)?.categoria;
        if (c === "contratista") real.contratistas += Number(p.monto || 0);
        else real.mano_obra += Number(p.monto || 0);
      });

      return { presupuesto, real };
    },
  });

  if (!data) return null;
  const { presupuesto, real } = data;

  const cats: Cat[] = ["materiales", "mano_obra", "contratistas", "otros"];
  const alerts = cats
    .map((c) => {
      const base = presupuesto[c];
      const gastado = real[c];
      if (base <= 0) return null;
      const pct = (gastado / base) * 100;
      if (pct < 80) return null;
      return { cat: c, base, gastado, pct, rebasado: pct >= 100 };
    })
    .filter(Boolean) as { cat: Cat; base: number; gastado: number; pct: number; rebasado: boolean }[];

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((a) => {
        const restante = a.base - a.gastado;
        const Icon = a.rebasado ? AlertOctagon : AlertTriangle;
        const cls = a.rebasado
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200";
        return (
          <div key={a.cat} role="alert" className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${cls}`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold">
                {a.rebasado
                  ? `${LABEL[a.cat]}: presupuesto rebasado (${a.pct.toFixed(1)}%)`
                  : `${LABEL[a.cat]}: ${a.pct.toFixed(1)}% del presupuesto utilizado`}
              </p>
              <p className="text-xs opacity-90">
                Gastado {currency(a.gastado)} de {currency(a.base)} presupuestado ·{" "}
                {a.rebasado
                  ? `excedido por ${currency(Math.abs(restante))}`
                  : `restan ${currency(restante)}`}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
