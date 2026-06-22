import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  supabase, DESPACHO_ID,
  type Personal, type PersonalCategoria, type PersonalProyecto, type PagoPersonal,
} from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/personal/$id")({
  head: () => ({ meta: [{ title: "Detalle de personal · Grupo Proyecta" }] }),
  component: PersonalDetalle,
});

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

function PersonalDetalle() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data: persona, isLoading } = useQuery({
    queryKey: ["personal_one", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("personal").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Personal;
    },
  });

  const { data: asignaciones } = useQuery({
    queryKey: ["personal_asignaciones", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_proyecto")
        .select("*, proyectos!inner(id, folio, nombre_proyecto, obra_id, obras!inner(nombre))")
        .eq("personal_id", id);
      if (error) throw error;
      return data as Array<PersonalProyecto & {
        proyectos: { id: string; folio: string; nombre_proyecto: string; obra_id: string; obras: { nombre: string } };
      }>;
    },
  });

  const { data: pagos } = useQuery({
    queryKey: ["personal_pagos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos_personal")
        .select("*, proyectos!inner(folio, nombre_proyecto)")
        .eq("personal_id", id)
        .order("fecha_pago", { ascending: false });
      if (error) throw error;
      return data as Array<PagoPersonal & { proyectos: { folio: string; nombre_proyecto: string } }>;
    },
  });

  const [edit, setEdit] = useState<Partial<Personal> | null>(null);
  const e = edit ?? persona ?? {};

  async function guardar() {
    if (!persona) return;
    const patch = {
      nombre: e.nombre ?? persona.nombre,
      categoria: (e.categoria ?? persona.categoria) as PersonalCategoria,
      especialidad: (e.especialidad ?? persona.especialidad) || null,
      telefono: (e.telefono ?? persona.telefono) || null,
      notas: (e.notas ?? persona.notas) || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("personal").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Datos actualizados");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["personal_one", id] });
    qc.invalidateQueries({ queryKey: ["personal", DESPACHO_ID] });
  }

  const totalAcordado = (asignaciones ?? []).reduce((s, a) => s + Number(a.monto_acordado || 0), 0);
  const totalPagado = (pagos ?? []).reduce((s, p) => s + Number(p.monto || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <div className="flex items-center gap-3">
            <Link to="/personal" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <nav className="flex items-center gap-1 text-xs text-muted-foreground">
              <Link to="/personal" className="hover:text-foreground">Personal</Link>
              <span>›</span>
              <span className="text-foreground">{persona?.nombre ?? "…"}</span>
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!isLoading && persona && (
          <>
            <section className="rounded-lg border bg-card p-6">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Datos generales</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground">Nombre</label>
                  <Input className="mt-1" value={e.nombre ?? ""} onChange={(ev) => setEdit({ ...edit, nombre: ev.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Categoría</label>
                  <select
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={(e.categoria ?? "destajista") as PersonalCategoria}
                    onChange={(ev) => setEdit({ ...edit, categoria: ev.target.value as PersonalCategoria })}
                  >
                    <option value="destajista">Destajista</option>
                    <option value="contratista">Contratista</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Especialidad</label>
                  <Input className="mt-1" value={e.especialidad ?? ""} onChange={(ev) => setEdit({ ...edit, especialidad: ev.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Teléfono</label>
                  <Input className="mt-1" value={e.telefono ?? ""} onChange={(ev) => setEdit({ ...edit, telefono: ev.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground">Notas</label>
                  <Textarea className="mt-1" rows={2} value={e.notas ?? ""} onChange={(ev) => setEdit({ ...edit, notas: ev.target.value })} />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={guardar} disabled={!edit}>
                  <Save className="mr-2 h-4 w-4" />Guardar cambios
                </Button>
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-end justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Proyectos asignados</h2>
                <p className="text-xs text-muted-foreground">
                  Total acordado: <span className="font-semibold tabular-nums text-foreground">{currency(totalAcordado)}</span>
                </p>
              </div>
              <div className="overflow-hidden rounded-lg border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Obra</th>
                      <th className="px-4 py-3">Cotización</th>
                      <th className="px-4 py-3">Actividad</th>
                      <th className="px-4 py-3 text-right w-40">Monto acordado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(asignaciones ?? []).length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                        Sin proyectos asignados. Vincúlalo desde el tab “Personal” de un proyecto.
                      </td></tr>
                    )}
                    {(asignaciones ?? []).map((a) => (
                      <tr key={a.id} className="border-t">
                        <td className="px-4 py-3">
                          <Link to="/proyectos/$obraId" params={{ obraId: a.proyectos.obra_id }} className="hover:underline">
                            {a.proyectos.obras?.nombre ?? "—"}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{a.proyectos.folio}</td>
                        <td className="px-4 py-3">{a.actividad ?? "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{currency(a.monto_acordado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-end justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Historial de pagos</h2>
                <p className="text-xs text-muted-foreground">
                  Total cobrado: <span className="font-semibold tabular-nums text-foreground">{currency(totalPagado)}</span>
                </p>
              </div>
              <div className="overflow-hidden rounded-lg border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Cotización</th>
                      <th className="px-4 py-3">Concepto</th>
                      <th className="px-4 py-3 text-right">Monto</th>
                      <th className="px-4 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pagos ?? []).length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Sin pagos registrados</td></tr>
                    )}
                    {(pagos ?? []).map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="px-4 py-3 tabular-nums">{p.fecha_pago}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.proyectos.folio}</td>
                        <td className="px-4 py-3">{p.concepto}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{currency(p.monto)}</td>
                        <td className="px-4 py-3">
                          {p.aceptado_at ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                              Aceptado
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                              Pendiente
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}