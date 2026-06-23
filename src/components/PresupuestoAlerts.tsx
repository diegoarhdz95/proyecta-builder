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
  folio?: string | null;
  nombre_proyecto?: string | null;
  total_materiales: number;
  total_mano_obra: number;
  total_herramienta: number;
  total_indirectos: number;
};

export type PresupuestoAlerta = {
  cat: Cat;
  base: number;
  gastado: number;
  pct: number;
  rebasado: boolean;
};

/** Returns the list of presupuesto alerts (>=80%) for a single proyecto. */
export function useProyectoAlertas(proyectoId: string) {
  return useQuery({
    queryKey: ["presupuesto_alerts_proyecto", proyectoId],
    queryFn: async (): Promise<PresupuestoAlerta[]> => {
      const [{ data: desglose }, { data: gastos }, { data: pagosPersonal }] = await Promise.all([
        supabase.from("desglose_financiero_proyecto").select("*").eq("proyecto_id", proyectoId),
        supabase.from("gastos_proyecto").select("categoria, monto").eq("proyecto_id", proyectoId),
        supabase
          .from("pagos_personal")
          .select("monto, personal:personal_id(categoria)")
          .eq("proyecto_id", proyectoId),
      ]);
      const presupuesto: Record<Cat, number> = { materiales: 0, mano_obra: 0, contratistas: 0, otros: 0 };
      const real: Record<Cat, number> = { materiales: 0, mano_obra: 0, contratistas: 0, otros: 0 };
      (desglose ?? []).forEach((r: Desglose) => {
        presupuesto.materiales += Number(r.total_materiales || 0);
        presupuesto.mano_obra += Number(r.total_mano_obra || 0);
        presupuesto.contratistas += Number(r.total_indirectos || 0);
        presupuesto.otros += Number(r.total_herramienta || 0);
      });
      (gastos ?? []).forEach((g: { categoria: string; monto: number }) => {
        if (g.categoria === "materiales") real.materiales += Number(g.monto || 0);
        else if (g.categoria === "mano_obra") real.mano_obra += Number(g.monto || 0);
        else if (g.categoria === "contratistas") real.contratistas += Number(g.monto || 0);
        else real.otros += Number(g.monto || 0);
      });
      (pagosPersonal ?? []).forEach((p: { monto: number; personal: unknown }) => {
        const per = Array.isArray(p.personal) ? p.personal[0] : p.personal;
        const c = (per as { categoria?: string } | null)?.categoria;
        if (c === "contratista") real.contratistas += Number(p.monto || 0);
        else real.mano_obra += Number(p.monto || 0);
      });
      const cats: Cat[] = ["materiales", "mano_obra", "contratistas", "otros"];
      const out: PresupuestoAlerta[] = [];
      for (const c of cats) {
        const base = presupuesto[c];
        if (base <= 0) continue;
        const pct = (real[c] / base) * 100;
        if (pct >= 80) out.push({ cat: c, base, gastado: real[c], pct, rebasado: pct >= 100 });
      }
      return out;
    },
  });
}

/** Compact inline alert list shown inside the Corte de Pagos tab. */
export function PresupuestoAlertsInline({ proyectoId }: { proyectoId: string }) {
  const { data: alerts } = useProyectoAlertas(proyectoId);
  if (!alerts || alerts.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {alerts.map((a) => {
        const Icon = a.rebasado ? AlertOctagon : AlertTriangle;
        const cls = a.rebasado
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200";
        return (
          <span
            key={a.cat}
            role="alert"
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${cls}`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">{LABEL[a.cat]}</span>
            <span className="opacity-80">
              · {a.pct.toFixed(0)}% ({currency(a.gastado)} / {currency(a.base)})
              {a.rebasado ? " · rebasado" : ""}
            </span>
          </span>
        );
      })}
    </div>
  );
}
