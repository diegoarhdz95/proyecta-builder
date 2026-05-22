import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gantt, Task, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Save } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const PARTIDA_ORDER = [
  "PRE","DEM","EST","ALB","HID","SAN","ELE",
  "ACO","VOZ","ACB","PIS","REC","PIN","ILU",
  "CAR","HER","CAN","MOB","SUP","LIM",
];

const PARTIDA_COLORS: Record<string, string> = {
  PRE: "#64748b", DEM: "#dc2626", EST: "#7c2d12", ALB: "#a16207",
  HID: "#0284c7", SAN: "#0891b2", ELE: "#ca8a04", ACO: "#9333ea",
  VOZ: "#7c3aed", ACB: "#059669", PIS: "#92400e", REC: "#0d9488",
  PIN: "#db2777", ILU: "#facc15", CAR: "#78350f", HER: "#475569",
  CAN: "#4338ca", MOB: "#a21caf", SUP: "#16a34a", LIM: "#94a3b8",
};

type Actividad = {
  id: string;
  proyecto_id: string;
  concepto_id: string | null;
  nombre_actividad: string;
  partida: string | null;
  partida_clave: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  duracion_dias: number;
  factor_holgura: number;
  orden: number;
};

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function colorFor(clave: string | null) {
  if (!clave) return "#64748b";
  return PARTIDA_COLORS[clave.toUpperCase()] ?? "#64748b";
}

export function CronogramaTab({ obraId }: { obraId: string }) {
  const qc = useQueryClient();
  const [view, setView] = useState<ViewMode>(ViewMode.Week);
  const [editing, setEditing] = useState<Actividad | null>(null);
  const [generating, setGenerating] = useState(false);

  const { data: cotizaciones } = useQuery({
    queryKey: ["cronograma_proyectos", obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select("id")
        .eq("obra_id", obraId);
      if (error) throw error;
      return data as { id: string }[];
    },
  });

  const proyectoIds = (cotizaciones ?? []).map((p) => p.id);

  const { data: actividades } = useQuery({
    queryKey: ["cronograma", obraId, proyectoIds.join(",")],
    enabled: proyectoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cronograma_actividades")
        .select("*")
        .in("proyecto_id", proyectoIds)
        .order("orden", { ascending: true });
      if (error) throw error;
      return data as Actividad[];
    },
  });

  async function generar() {
    if (proyectoIds.length === 0) return toast.error("No hay cotizaciones");
    setGenerating(true);
    try {
      const { data: pc, error } = await supabase
        .from("proyecto_conceptos")
        .select("id, proyecto_id, concepto_id, descripcion, cantidad, unidad, concepto:concepto_id(rendimiento, partida_id, partidas:partida_id(clave, nombre))")
        .in("proyecto_id", proyectoIds);
      if (error) throw error;

      type Row = {
        proyecto_id: string;
        concepto_id: string;
        descripcion: string;
        cantidad: number;
        unidad: string;
        rendimiento: number;
        partidaClave: string;
        partidaNombre: string;
      };

      const filas: Row[] = (pc ?? [])
        .filter((r) => (r.unidad || "").trim() !== "%")
        .map((r) => {
          const c = r.concepto as { rendimiento?: number; partidas?: { clave?: string; nombre?: string } } | null;
          return {
            proyecto_id: r.proyecto_id as string,
            concepto_id: r.concepto_id as string,
            descripcion: r.descripcion as string,
            cantidad: Number(r.cantidad) || 0,
            unidad: r.unidad as string,
            rendimiento: Number(c?.rendimiento) || 1,
            partidaClave: (c?.partidas?.clave ?? "ZZZ").toUpperCase(),
            partidaNombre: c?.partidas?.nombre ?? "Sin partida",
          };
        });

      if (filas.length === 0) {
        toast.error("No hay conceptos en las cotizaciones");
        return;
      }

      // group by partida clave
      const grupos = new Map<string, Row[]>();
      for (const f of filas) {
        if (!grupos.has(f.partidaClave)) grupos.set(f.partidaClave, []);
        grupos.get(f.partidaClave)!.push(f);
      }

      const orderedClaves = Array.from(grupos.keys()).sort((a, b) => {
        const ia = PARTIDA_ORDER.indexOf(a);
        const ib = PARTIDA_ORDER.indexOf(b);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });

      const start = addDays(new Date(), 7);
      start.setHours(0, 0, 0, 0);

      let cursor = new Date(start);
      let orden = 0;
      const nuevas: Omit<Actividad, "id">[] = [];
      const HOLGURA = 1.20;

      for (const clave of orderedClaves) {
        const items = grupos.get(clave)!;
        let maxFin = new Date(cursor);
        for (const it of items) {
          const base = it.rendimiento > 0 ? it.cantidad / it.rendimiento : it.cantidad;
          const dias = Math.max(1, Math.round(base * HOLGURA));
          const fi = new Date(cursor);
          const ff = addDays(fi, dias);
          nuevas.push({
            proyecto_id: it.proyecto_id,
            concepto_id: it.concepto_id,
            nombre_actividad: it.descripcion,
            partida: it.partidaNombre,
            partida_clave: clave,
            fecha_inicio: toISO(fi),
            fecha_fin: toISO(ff),
            duracion_dias: dias,
            factor_holgura: HOLGURA,
            orden: orden++,
          });
          if (ff > maxFin) maxFin = ff;
        }
        cursor = maxFin;
      }

      // borrar previas y guardar
      await supabase.from("cronograma_actividades").delete().in("proyecto_id", proyectoIds);
      const { error: insErr } = await supabase.from("cronograma_actividades").insert(nuevas);
      if (insErr) throw insErr;

      toast.success(`Cronograma generado (${nuevas.length} actividades)`);
      qc.invalidateQueries({ queryKey: ["cronograma", obraId] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  const tasks: Task[] = useMemo(() => {
    return (actividades ?? []).map((a) => ({
      id: a.id,
      name: `[${a.partida_clave ?? "·"}] ${a.nombre_actividad}`,
      start: new Date(a.fecha_inicio),
      end: new Date(a.fecha_fin),
      type: "task",
      progress: 0,
      isDisabled: false,
      styles: {
        backgroundColor: colorFor(a.partida_clave),
        backgroundSelectedColor: colorFor(a.partida_clave),
        progressColor: colorFor(a.partida_clave),
        progressSelectedColor: colorFor(a.partida_clave),
      },
    }));
  }, [actividades]);

  async function persistTask(id: string, start: Date, end: Date) {
    const dur = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
    const { error } = await supabase
      .from("cronograma_actividades")
      .update({
        fecha_inicio: toISO(start),
        fecha_fin: toISO(end),
        duracion_dias: dur,
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["cronograma", obraId] });
  }

  async function guardarEdicion() {
    if (!editing) return;
    const fi = new Date(editing.fecha_inicio);
    const ff = new Date(editing.fecha_fin);
    const dur = Math.max(1, Math.round((ff.getTime() - fi.getTime()) / 86400000));
    const { error } = await supabase
      .from("cronograma_actividades")
      .update({
        nombre_actividad: editing.nombre_actividad,
        fecha_inicio: editing.fecha_inicio,
        fecha_fin: editing.fecha_fin,
        duracion_dias: dur,
        factor_holgura: editing.factor_holgura,
      })
      .eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Actividad actualizada");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["cronograma", obraId] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Vista:</span>
          {[
            { v: ViewMode.Day, l: "Día" },
            { v: ViewMode.Week, l: "Semana" },
            { v: ViewMode.Month, l: "Mes" },
          ].map((o) => (
            <Button
              key={o.l}
              size="sm"
              variant={view === o.v ? "default" : "outline"}
              onClick={() => setView(o.v)}
            >
              {o.l}
            </Button>
          ))}
        </div>
        <Button onClick={generar} disabled={generating}>
          <Sparkles className="mr-2 h-4 w-4" />
          {generating ? "Generando…" : "Generar cronograma con IA"}
        </Button>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Aún no hay cronograma. Presiona <strong>Generar cronograma con IA</strong> para crearlo a partir de los conceptos.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Gantt
            tasks={tasks}
            viewMode={view}
            locale="es-MX"
            listCellWidth="220px"
            columnWidth={view === ViewMode.Month ? 200 : view === ViewMode.Week ? 100 : 50}
            onDateChange={(t) => persistTask(t.id, t.start, t.end)}
            onClick={(t: Task) => {
              const a = (actividades ?? []).find((x) => x.id === t.id);
              if (a) setEditing({ ...a });
            }}
            TooltipContent={({ task }) => (
              <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow">
                <div className="font-semibold">{task.name}</div>
                <div>{toISO(task.start)} → {toISO(task.end)}</div>
                <div>{Math.max(1, Math.round((task.end.getTime() - task.start.getTime()) / 86400000))} días</div>
              </div>
            )}
          />
        </div>
      )}

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Editar actividad</SheetTitle>
          </SheetHeader>
          {editing && (
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground">Nombre</label>
                <Input
                  className="mt-1"
                  value={editing.nombre_actividad}
                  onChange={(e) => setEditing({ ...editing, nombre_actividad: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Fecha inicio</label>
                  <Input
                    className="mt-1"
                    type="date"
                    value={editing.fecha_inicio}
                    onChange={(e) => {
                      const fi = e.target.value;
                      const dur = Math.max(
                        1,
                        Math.round((new Date(editing.fecha_fin).getTime() - new Date(fi).getTime()) / 86400000),
                      );
                      setEditing({ ...editing, fecha_inicio: fi, duracion_dias: dur });
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Fecha fin</label>
                  <Input
                    className="mt-1"
                    type="date"
                    value={editing.fecha_fin}
                    onChange={(e) => {
                      const ff = e.target.value;
                      const dur = Math.max(
                        1,
                        Math.round((new Date(ff).getTime() - new Date(editing.fecha_inicio).getTime()) / 86400000),
                      );
                      setEditing({ ...editing, fecha_fin: ff, duracion_dias: dur });
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Duración (días)</label>
                  <Input
                    className="mt-1"
                    type="number"
                    min={1}
                    value={editing.duracion_dias}
                    onChange={(e) => {
                      const dur = Math.max(1, Number(e.target.value) || 1);
                      const ff = addDays(new Date(editing.fecha_inicio), dur);
                      setEditing({ ...editing, duracion_dias: dur, fecha_fin: toISO(ff) });
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Factor holgura</label>
                  <Input
                    className="mt-1"
                    type="number"
                    step="0.05"
                    value={editing.factor_holgura}
                    onChange={(e) =>
                      setEditing({ ...editing, factor_holgura: Number(e.target.value) || 1 })
                    }
                  />
                </div>
              </div>
              <Button onClick={guardarEdicion} className="w-full">
                <Save className="mr-2 h-4 w-4" /> Guardar cambios
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
