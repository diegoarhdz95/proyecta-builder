import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase, type PagoPersonal, type Personal, type Proyecto } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileCheck2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/recibo/$token")({
  head: () => ({ meta: [{ title: "Recibo de pago" }] }),
  component: ReciboPublico,
});

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

type Row = PagoPersonal & {
  personal: Pick<Personal, "nombre" | "categoria" | "especialidad">;
  proyectos: Pick<Proyecto, "folio" | "nombre_proyecto"> & { despacho_id: string };
};

function ReciboPublico() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const { data: pago, isLoading, error } = useQuery({
    queryKey: ["recibo_publico", token],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos_personal")
        .select("*, personal!inner(nombre, categoria, especialidad), proyectos!inner(folio, nombre_proyecto, despacho_id)")
        .eq("acepta_token", token)
        .maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });

  const { data: despacho } = useQuery({
    queryKey: ["despacho_recibo", pago?.proyectos.despacho_id],
    enabled: !!pago,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("despachos")
        .select("nombre, logo_url")
        .eq("id", pago!.proyectos.despacho_id)
        .single();
      if (error) throw error;
      return data as { nombre: string; logo_url: string | null };
    },
  });

  async function aceptar() {
    if (!pago) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("pagos_personal")
        .update({ aceptado_at: new Date().toISOString(), aceptado_ip: null })
        .eq("acepta_token", token)
        .is("aceptado_at", null);
      if (error) throw error;
      toast.success("¡Pago confirmado!");
      qc.invalidateQueries({ queryKey: ["recibo_publico", token] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Cargando recibo…</div>;
  }
  if (error || !pago) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-sm rounded-lg border bg-card p-8 text-center">
          <p className="text-base font-semibold">Recibo no encontrado</p>
          <p className="mt-2 text-sm text-muted-foreground">
            El enlace puede ser incorrecto o haber sido eliminado.
          </p>
        </div>
      </div>
    );
  }

  const numeroStr = pago.numero_recibo ? `#${String(pago.numero_recibo).padStart(5, "0")}` : "Sin número";
  const fechaTxt = new Date(`${pago.fecha_pago}T00:00:00`).toLocaleDateString("es-MX", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="rounded-t-2xl bg-[#0F1742] px-6 py-5 text-white">
            <p className="text-[10px] uppercase tracking-widest opacity-70">
              {despacho?.nombre ?? "Despacho"}
            </p>
            <h1 className="mt-1 text-lg font-semibold">Recibo de pago</h1>
            <p className="mt-1 text-xs opacity-80">{numeroStr}</p>
          </div>

          <div className="px-6 py-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Trabajador</p>
            <p className="mt-1 text-base font-semibold">{pago.personal.nombre}</p>
            <p className="text-xs text-muted-foreground">
              {pago.personal.categoria.charAt(0).toUpperCase() + pago.personal.categoria.slice(1)}
              {pago.personal.especialidad ? ` · ${pago.personal.especialidad}` : ""}
            </p>

            <div className="mt-5 space-y-3 border-t pt-4 text-sm">
              <Row label="Proyecto" value={pago.proyectos.nombre_proyecto} />
              <Row label="Cotización" value={pago.proyectos.folio} mono />
              <Row label="Concepto" value={pago.concepto} />
              <Row label="Fecha" value={fechaTxt} />
              {pago.metodo_pago && <Row label="Método" value={pago.metodo_pago} />}
            </div>

            <div className="mt-5 rounded-xl bg-[#0F1742] px-5 py-4 text-white">
              <p className="text-[10px] uppercase tracking-widest opacity-70">Monto pagado</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{currency(pago.monto)}</p>
            </div>

            {pago.notas && (
              <div className="mt-4 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="mb-1 font-semibold text-foreground">Notas</p>
                {pago.notas}
              </div>
            )}

            <div className="mt-6">
              {pago.aceptado_at ? (
                <div className="rounded-xl border-2 border-green-600 bg-green-50 px-4 py-4 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-green-700" />
                  <p className="mt-2 text-sm font-semibold text-green-800">Pago confirmado</p>
                  <p className="mt-1 text-xs text-green-700">
                    {new Date(pago.aceptado_at).toLocaleString("es-MX", {
                      day: "2-digit", month: "long", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
              ) : (
                <>
                  <p className="mb-3 text-center text-xs text-muted-foreground">
                    Al presionar “Acepto”, confirmas que recibiste este pago. Se registrará la fecha y hora exacta.
                  </p>
                  <Button
                    onClick={aceptar}
                    disabled={submitting}
                    className="w-full bg-green-600 text-white hover:bg-green-700 h-12 text-base"
                  >
                    <FileCheck2 className="mr-2 h-5 w-5" />
                    {submitting ? "Confirmando…" : "Acepto el pago"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-[10px] text-muted-foreground">
          Documento generado por {despacho?.nombre ?? "Grupo Proyecta"}.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-right text-sm ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}