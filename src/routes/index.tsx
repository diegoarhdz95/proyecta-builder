import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase, DESPACHO_ID, DESPACHO_NOMBRE, type Proyecto } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Plus, BookOpen } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Cotizaciones · Grupo Proyecta" }] }),
  component: Dashboard,
});

const estadoStyles: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground",
  enviada: "bg-blue-100 text-blue-700",
  aprobada: "bg-green-100 text-green-700",
  rechazada: "bg-red-100 text-red-700",
};

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
}

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["proyectos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select("*")
        .eq("despacho_id", DESPACHO_ID)
        .order("folio", { ascending: false });
      if (error) throw error;
      return data as Proyecto[];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{DESPACHO_NOMBRE}</h1>
            <p className="text-xs text-muted-foreground">Sistema de cotizaciones</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/catalogo">
              <Button variant="outline"><BookOpen className="mr-2 h-4 w-4" />Catálogo</Button>
            </Link>
            <Link to="/cotizaciones/nueva">
              <Button><Plus className="mr-2 h-4 w-4" />Nueva cotización</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="mb-6 text-2xl font-semibold tracking-tight">Cotizaciones</h2>
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Proyecto</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Cargando...</td></tr>
              )}
              {!isLoading && data?.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Sin cotizaciones aún</td></tr>
              )}
              {data?.map((p) => (
                <tr key={p.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{p.folio}</td>
                  <td className="px-4 py-3 font-medium">{p.nombre_proyecto}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.cliente_nombre}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{currency(p.total_con_iva)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${estadoStyles[p.estado] ?? estadoStyles.borrador}`}>
                      {p.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to="/cotizaciones/$id/editar" params={{ id: p.id }} className="text-primary hover:underline">Editar</Link>
                    <span className="mx-2 text-muted-foreground">·</span>
                    <Link to="/cotizaciones/$id/resumen" params={{ id: p.id }} className="text-primary hover:underline">Ver</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
