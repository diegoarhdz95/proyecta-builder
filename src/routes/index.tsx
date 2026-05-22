import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  supabase,
  DESPACHO_ID,
  DESPACHO_NOMBRE,
  type Obra,
  type TipoProyecto,
} from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Plus, BookOpen } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Proyectos · Grupo Proyecta" }] }),
  component: ProyectosList,
});

const estadoStyles: Record<string, string> = {
  activo: "bg-green-100 text-green-700",
  pausado: "bg-yellow-100 text-yellow-700",
  terminado: "bg-muted text-muted-foreground",
};

function ProyectosList() {
  const { data: obras, isLoading } = useQuery({
    queryKey: ["obras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obras")
        .select("*")
        .eq("despacho_id", DESPACHO_ID)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Obra[];
    },
  });

  const { data: tipos } = useQuery({
    queryKey: ["tipos_proyecto"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_proyecto")
        .select("id, nombre")
        .eq("despacho_id", DESPACHO_ID);
      if (error) throw error;
      return data as TipoProyecto[];
    },
  });

  const tipoNombre = (id: string | null) =>
    id ? tipos?.find((t) => t.id === id)?.nombre ?? "—" : "—";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{DESPACHO_NOMBRE}</h1>
            <p className="text-xs text-muted-foreground">Proyectos</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/catalogo">
              <Button variant="outline"><BookOpen className="mr-2 h-4 w-4" />Catálogo</Button>
            </Link>
            <Link to="/proyectos/nuevo">
              <Button><Plus className="mr-2 h-4 w-4" />Nuevo proyecto</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="mb-6 text-2xl font-semibold tracking-tight">Proyectos</h2>

        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!isLoading && obras?.length === 0 && (
          <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
            Aún no tienes proyectos. Crea el primero con “Nuevo proyecto”.
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {obras?.map((o) => (
            <Link
              key={o.id}
              to="/proyectos/$obraId"
              params={{ obraId: o.id }}
              className="group rounded-lg border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-muted/30"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold leading-tight group-hover:text-primary">
                  {o.nombre}
                </h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                    estadoStyles[o.estado] ?? estadoStyles.activo
                  }`}
                >
                  {o.estado}
                </span>
              </div>
              <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div><span className="text-foreground/70">Cliente:</span> {o.cliente_nombre}</div>
                {o.domicilio && <div><span className="text-foreground/70">Domicilio:</span> {o.domicilio}</div>}
                <div><span className="text-foreground/70">Tipo:</span> {tipoNombre(o.tipo_proyecto_id)}</div>
                <div><span className="text-foreground/70">Creado:</span> {new Date(o.created_at).toLocaleDateString("es-MX")}</div>
              </dl>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
