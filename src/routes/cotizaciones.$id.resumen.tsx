import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase, DESPACHO_NOMBRE, IVA_RATE, type Proyecto, type ProyectoConcepto, type Partida } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";

export const Route = createFileRoute("/cotizaciones/$id/resumen")({
  head: () => ({ meta: [{ title: "Resumen · Grupo Proyecta" }] }),
  component: Resumen,
});

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
}

function Resumen() {
  const { id } = Route.useParams();

  const { data: proyecto } = useQuery({
    queryKey: ["proyecto", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("proyectos").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Proyecto;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["proyecto_conceptos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyecto_conceptos")
        .select("*, proyecto_partida:proyecto_partida_id(partida_id)")
        .eq("proyecto_id", id);
      if (error) throw error;
      return data as (ProyectoConcepto & { proyecto_partida: { partida_id: string } })[];
    },
  });

  const { data: partidas } = useQuery({
    queryKey: ["all_partidas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partidas").select("*").order("orden");
      if (error) throw error;
      return data as Partida[];
    },
  });

  const subtotal = (items ?? []).reduce((s, i) => s + Number(i.subtotal || 0), 0);
  const iva = subtotal * IVA_RATE;
  const total = subtotal + iva;

  const grouped = new Map<string, typeof items>();
  items?.forEach((it) => {
    const pid = it.proyecto_partida?.partida_id ?? "otros";
    if (!grouped.has(pid)) grouped.set(pid, [] as typeof items);
    grouped.get(pid)!.push(it);
  });

  const partidaNombre = (pid: string) => partidas?.find((p) => p.id === pid)?.nombre ?? "Conceptos";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card print:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to="/cotizaciones/$id/editar" params={{ id }} className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
            <h1 className="text-base font-semibold">Resumen de cotización</h1>
          </div>
          <Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl bg-white px-10 py-10 print:py-6 my-8 rounded-lg border print:border-0 print:my-0 print:shadow-none">
        <div className="mb-8 flex items-start justify-between border-b pb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-primary">{DESPACHO_NOMBRE}</h2>
            <p className="text-xs text-muted-foreground">Despacho de Arquitectura</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Folio</p>
            <p className="font-mono text-sm font-semibold">{proyecto?.folio}</p>
            <p className="mt-1 text-xs text-muted-foreground">{new Date().toLocaleDateString("es-MX")}</p>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</p>
            <p className="font-medium">{proyecto?.cliente_nombre}</p>
            {proyecto?.cliente_email && <p className="text-muted-foreground">{proyecto.cliente_email}</p>}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Proyecto</p>
            <p className="font-medium">{proyecto?.nombre_proyecto}</p>
            {proyecto?.domicilio_obra && <p className="text-muted-foreground">{proyecto.domicilio_obra}</p>}
          </div>
        </div>

        {Array.from(grouped.entries()).map(([pid, group]) => (
          <div key={pid} className="mb-6">
            <h3 className="mb-2 border-b pb-1 text-sm font-semibold uppercase tracking-wide text-primary">{partidaNombre(pid)}</h3>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1">Descripción</th>
                  <th className="py-1 w-16">Unidad</th>
                  <th className="py-1 w-16 text-right">Cant.</th>
                  <th className="py-1 w-24 text-right">P.U.</th>
                  <th className="py-1 w-28 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {group?.map((it) => (
                  <tr key={it.id} className="border-t">
                    <td className="py-1.5">{it.descripcion}</td>
                    <td className="py-1.5 text-muted-foreground">{it.unidad}</td>
                    <td className="py-1.5 text-right tabular-nums">{Number(it.cantidad)}</td>
                    <td className="py-1.5 text-right tabular-nums">{currency(Number(it.precio_unitario_final))}</td>
                    <td className="py-1.5 text-right tabular-nums">{currency(Number(it.subtotal))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div className="ml-auto mt-8 w-72 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{currency(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">IVA (16%)</span>
            <span className="tabular-nums">{currency(iva)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-bold">
            <span>Total</span>
            <span className="tabular-nums">{currency(total)}</span>
          </div>
        </div>

        <footer className="mt-16 border-t pt-4 text-center text-xs text-muted-foreground">
          Esta cotización tiene una vigencia de 30 días a partir de la fecha de emisión.
        </footer>
      </main>
    </div>
  );
}