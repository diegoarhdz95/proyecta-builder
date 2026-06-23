import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, DESPACHO_ID, type Proyecto, type Personal, type PersonalProyecto, type PagoPersonal } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, FileDown, Link2, UserPlus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { downloadOrShareReciboPersonalPDF } from "@/lib/generate-recibo-personal-pdf";
import { getPublicSiteUrl } from "@/lib/public-site-url";

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

export function PersonalCotizacionTab({ proyectoId }: { proyectoId: string }) {
  const qc = useQueryClient();
  const [assignPersonalId, setAssignPersonalId] = useState("");
  const [assignActividad, setAssignActividad] = useState("");
  const [assignMonto, setAssignMonto] = useState("");
  const [payForm, setPayForm] = useState({
    personal_id: "",
    concepto: "",
    monto: "",
    fecha_pago: new Date().toISOString().slice(0, 10),
    metodo_pago: "Efectivo",
    notas: "",
  });

  const { data: proyecto } = useQuery({
    queryKey: ["personal_tab_proy_one", proyectoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos").select("id, folio, nombre_proyecto").eq("id", proyectoId).single();
      if (error) throw error;
      return data as Pick<Proyecto, "id" | "folio" | "nombre_proyecto">;
    },
  });

  const { data: despacho } = useQuery({
    queryKey: ["despacho", DESPACHO_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("despachos").select("nombre, logo_url").eq("id", DESPACHO_ID).single();
      if (error) throw error;
      return data as { nombre: string; logo_url: string | null };
    },
  });

  const { data: personal } = useQuery({
    queryKey: ["personal", DESPACHO_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal").select("*").eq("despacho_id", DESPACHO_ID).order("nombre");
      if (error) throw error;
      return data as Personal[];
    },
  });

  const { data: asignaciones } = useQuery({
    queryKey: ["asignaciones_proy", proyectoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_proyecto").select("*").eq("proyecto_id", proyectoId);
      if (error) throw error;
      return data as PersonalProyecto[];
    },
  });

  const { data: pagosPersonal } = useQuery({
    queryKey: ["pagos_personal_proy", proyectoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos_personal").select("*").eq("proyecto_id", proyectoId)
        .order("fecha_pago", { ascending: false });
      if (error) throw error;
      return data as PagoPersonal[];
    },
  });

  const personalById = new Map((personal ?? []).map((p) => [p.id, p]));
  const pagadoByPersona = new Map<string, number>();
  (pagosPersonal ?? []).forEach((p) => {
    pagadoByPersona.set(p.personal_id, (pagadoByPersona.get(p.personal_id) ?? 0) + Number(p.monto || 0));
  });

  async function asignar() {
    if (!assignPersonalId) return toast.error("Selecciona una persona");
    const { error } = await supabase.from("personal_proyecto").insert({
      personal_id: assignPersonalId,
      proyecto_id: proyectoId,
      actividad: assignActividad || null,
      monto_acordado: Number(assignMonto) || 0,
    });
    if (error) return toast.error(error.message);
    toast.success("Personal asignado");
    setAssignPersonalId(""); setAssignActividad(""); setAssignMonto("");
    qc.invalidateQueries({ queryKey: ["asignaciones_proy", proyectoId] });
  }

  async function desasignar(id: string) {
    if (!confirm("¿Quitar esta asignación?")) return;
    const { error } = await supabase.from("personal_proyecto").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["asignaciones_proy", proyectoId] });
  }

  async function registrarPago(e: React.FormEvent) {
    e.preventDefault();
    if (!payForm.personal_id) return toast.error("Selecciona a la persona");
    if (!payForm.concepto.trim()) return toast.error("Concepto requerido");
    const monto = Number(payForm.monto);
    if (!monto || monto <= 0) return toast.error("Monto inválido");
    const { error } = await supabase.from("pagos_personal").insert({
      personal_id: payForm.personal_id,
      proyecto_id: proyectoId,
      concepto: payForm.concepto.trim(),
      monto,
      fecha_pago: payForm.fecha_pago,
      metodo_pago: payForm.metodo_pago || null,
      notas: payForm.notas || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Pago registrado");
    setPayForm({ ...payForm, concepto: "", monto: "", notas: "" });
    qc.invalidateQueries({ queryKey: ["pagos_personal_proy", proyectoId] });
    qc.invalidateQueries({ queryKey: ["cotizacion_resumen_fin"] });
  }

  async function eliminarPago(id: string) {
    if (!confirm("¿Eliminar este pago?")) return;
    const { error } = await supabase.from("pagos_personal").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["pagos_personal_proy", proyectoId] });
    qc.invalidateQueries({ queryKey: ["cotizacion_resumen_fin"] });
  }

  async function generarRecibo(p: PagoPersonal) {
    try {
      const persona = personalById.get(p.personal_id);
      if (!persona || !proyecto) return toast.error("Datos incompletos");
      let numero = p.numero_recibo;
      if (!numero) {
        const { data: maxRow, error: maxErr } = await supabase
          .from("pagos_personal")
          .select("numero_recibo, personal!inner(despacho_id)")
          .eq("personal.despacho_id", DESPACHO_ID)
          .not("numero_recibo", "is", null)
          .order("numero_recibo", { ascending: false }).limit(1);
        if (maxErr) throw maxErr;
        const last = (maxRow?.[0]?.numero_recibo as number | null) ?? 0;
        numero = last + 1;
        const { error: upErr } = await supabase
          .from("pagos_personal").update({ numero_recibo: numero }).eq("id", p.id);
        if (upErr) throw upErr;
        qc.invalidateQueries({ queryKey: ["pagos_personal_proy", proyectoId] });
      }
      const aceptaUrl = `${getPublicSiteUrl()}/recibo/${p.acepta_token}`;
      await downloadOrShareReciboPersonalPDF({
        despacho: despacho ?? { nombre: "Grupo Proyecta", logo_url: null },
        numeroRecibo: numero,
        trabajador: { nombre: persona.nombre, categoria: persona.categoria, especialidad: persona.especialidad },
        proyectoNombre: proyecto.nombre_proyecto,
        folio: proyecto.folio,
        actividad: p.concepto,
        monto: Number(p.monto),
        fechaPago: p.fecha_pago,
        metodoPago: p.metodo_pago,
        notas: p.notas,
        aceptacion: { url: aceptaUrl, aceptadoAt: p.aceptado_at, aceptadoIp: p.aceptado_ip },
      });
      toast.success(`Recibo #${String(numero).padStart(5, "0")} generado`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function copiarLink(p: PagoPersonal) {
    const url = `${getPublicSiteUrl()}/recibo/${p.acepta_token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  const totalPagado = (pagosPersonal ?? []).reduce((s, p) => s + Number(p.monto || 0), 0);
  const totalAcordado = (asignaciones ?? []).reduce((s, a) => s + Number(a.monto_acordado || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Acordado a personal" value={totalAcordado} />
        <Stat label="Pagado a personal" value={totalPagado} />
        <Stat label="Saldo por pagar" value={totalAcordado - totalPagado} />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Personal asignado</h3>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2 w-28">Categoría</th>
                <th className="px-3 py-2">Actividad</th>
                <th className="px-3 py-2 text-right w-32">Acordado</th>
                <th className="px-3 py-2 text-right w-32">Pagado</th>
                <th className="px-3 py-2 text-right w-32">Saldo</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {(asignaciones ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Sin personal asignado</td></tr>
              )}
              {(asignaciones ?? []).map((a) => {
                const persona = personalById.get(a.personal_id);
                const pagado = pagadoByPersona.get(a.personal_id) ?? 0;
                return (
                  <tr key={a.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{persona?.nombre ?? "—"}</td>
                    <td className="px-3 py-2 text-xs capitalize text-muted-foreground">{persona?.categoria ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.actividad ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{currency(a.monto_acordado)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{currency(pagado)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{currency(Number(a.monto_acordado) - pagado)}</td>
                    <td className="px-2">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => desasignar(a.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-muted-foreground">Asignar persona</label>
            <select
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={assignPersonalId}
              onChange={(e) => setAssignPersonalId(e.target.value)}
            >
              <option value="">— elegir —</option>
              {(personal ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} ({p.categoria})</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-muted-foreground">Actividad</label>
            <Input className="mt-1" value={assignActividad} onChange={(e) => setAssignActividad(e.target.value)} placeholder="Castillos, muros…" />
          </div>
          <div className="w-32">
            <label className="text-xs text-muted-foreground">Monto acordado</label>
            <Input className="mt-1" type="number" step="0.01" value={assignMonto} onChange={(e) => setAssignMonto(e.target.value)} />
          </div>
          <Button onClick={asignar}><UserPlus className="mr-2 h-4 w-4" />Asignar</Button>
          <Link to="/personal" className="ml-auto text-xs text-primary hover:underline">
            ¿Falta alguien? Crear en Personal →
          </Link>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Pagos registrados</h3>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Persona</th>
                <th className="px-3 py-2">Concepto</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2">Método</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(pagosPersonal ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Sin pagos registrados</td></tr>
              )}
              {(pagosPersonal ?? []).map((p) => {
                const persona = personalById.get(p.personal_id);
                return (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2 tabular-nums">{p.fecha_pago}</td>
                    <td className="px-3 py-2">{persona?.nombre ?? "—"}</td>
                    <td className="px-3 py-2">{p.concepto}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{currency(p.monto)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.metodo_pago ?? "—"}</td>
                    <td className="px-3 py-2">
                      {p.aceptado_at ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">Aceptado</span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Pendiente</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => generarRecibo(p)}>
                          <FileDown className="mr-1 h-3.5 w-3.5" />PDF
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copiarLink(p)} title="Copiar link de aceptación">
                          <Link2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => eliminarPago(p.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <form onSubmit={registrarPago} className="mt-4 rounded-lg border p-4">
          <h4 className="text-sm font-semibold">Registrar nuevo pago</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">Persona</label>
              <select
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={payForm.personal_id}
                onChange={(e) => setPayForm({ ...payForm, personal_id: e.target.value })}
              >
                <option value="">— elegir —</option>
                {(asignaciones ?? []).map((a) => {
                  const persona = personalById.get(a.personal_id);
                  return persona ? <option key={a.id} value={persona.id}>{persona.nombre}</option> : null;
                })}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Concepto / actividad</label>
              <Input className="mt-1" value={payForm.concepto} onChange={(e) => setPayForm({ ...payForm, concepto: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Monto</label>
              <Input className="mt-1" type="number" step="0.01" value={payForm.monto} onChange={(e) => setPayForm({ ...payForm, monto: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fecha</label>
              <Input className="mt-1" type="date" value={payForm.fecha_pago} onChange={(e) => setPayForm({ ...payForm, fecha_pago: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Método de pago</label>
              <Input className="mt-1" value={payForm.metodo_pago} onChange={(e) => setPayForm({ ...payForm, metodo_pago: e.target.value })} />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="text-xs text-muted-foreground">Notas</label>
              <Textarea className="mt-1" rows={2} value={payForm.notas} onChange={(e) => setPayForm({ ...payForm, notas: e.target.value })} />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="submit"><Plus className="mr-2 h-4 w-4" />Registrar pago</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold tabular-nums">{currency(value)}</p>
    </div>
  );
}