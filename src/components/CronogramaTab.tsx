import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Save, AlertTriangle, RefreshCw, ZoomIn, ZoomOut, ChevronDown, ChevronRight, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type GView = "day" | "week" | "month";
const BASE_CELL: Record<GView, number> = { day: 36, week: 16, month: 6 };
const ROW_H = 30;
const HEADER_H = 46;
const LEFT_W = 380;
const clamp = (a: number, v: number, b: number) => Math.max(a, Math.min(b, v));

const PARTIDA_ORDER = [
  "PRE","DEM","EST","ALB","HID","SAN","ELE",
  "ACO","VOZ","ACB","PIS","REC","PIN","ILU",
  "CAR","HER","CAN","MOB","SUP","LIM",
];

const PARTIDA_COLORS: Record<string, string> = {
  PRE: "#9ca3af", // gris
  DEM: "#dc2626", // rojo
  EST: "#78350f", // café
  ALB: "#f97316", // naranja
  HID: "#2563eb", // azul
  SAN: "#166534", // verde oscuro
  ELE: "#eab308", // amarillo
  ACO: "#38bdf8", // celeste
  ACB: "#7c3aed", // morado
  PIS: "#86efac", // verde claro
  REC: "#f9a8d4", // rosa
  PIN: "#fdba74", // durazno
  ILU: "#d4af37", // dorado
  CAR: "#b08968", // café claro
  HER: "#374151", // gris oscuro
  CAN: "#93c5fd", // azul claro
  LIM: "#6ee7b7", // verde menta
  VOZ: "#7c3aed", MOB: "#a21caf", SUP: "#16a34a",
};

type Actividad = {
  id: string;
  proyecto_id: string;
  cotizacion_id: string | null;
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
/** Mexican statutory holidays (LFT art. 74). Returns ISO yyyy-mm-dd set for a given year. */
function mxHolidaysForYear(year: number): Set<string> {
  const iso = (m: number, d: number) => `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  // First Monday of February
  const feb = new Date(year, 1, 1);
  const firstMonFeb = 1 + ((1 - feb.getDay() + 7) % 7);
  // Third Monday of March (Natalicio Benito Juárez)
  const mar = new Date(year, 2, 1);
  const firstMonMar = 1 + ((1 - mar.getDay() + 7) % 7);
  const thirdMonMar = firstMonMar + 14;
  // Third Monday of November (Revolución)
  const nov = new Date(year, 10, 1);
  const firstMonNov = 1 + ((1 - nov.getDay() + 7) % 7);
  const thirdMonNov = firstMonNov + 14;
  return new Set<string>([
    iso(1, 1),
    iso(2, firstMonFeb),
    iso(3, thirdMonMar),
    iso(5, 1),
    iso(9, 16),
    iso(11, thirdMonNov),
    iso(12, 25),
  ]);
}
const _holidayCache = new Map<number, Set<string>>();
function isMxHoliday(d: Date): boolean {
  const y = d.getFullYear();
  let set = _holidayCache.get(y);
  if (!set) { set = mxHolidaysForYear(y); _holidayCache.set(y, set); }
  const key = `${y}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return set.has(key);
}
/** Day weight: Mon–Fri = 1, Sat = 0.5, Sun + holiday = 0 */
function dayWeight(d: Date): number {
  if (isMxHoliday(d)) return 0;
  const g = d.getDay();
  if (g === 0) return 0;        // Sunday
  if (g === 6) return 0.5;      // Saturday = half day
  return 1;                      // Mon–Fri
}
function isNonWorking(d: Date): boolean {
  return dayWeight(d) === 0;
}
function nextBusinessDay(d: Date) {
  const r = new Date(d);
  while (isNonWorking(r)) r.setDate(r.getDate() + 1);
  return r;
}
/** Advance from `d` until `n` business-day weight has been accumulated. Returns end date. */
function addBusinessDays(d: Date, n: number) {
  const r = new Date(d);
  let left = n;
  // safety cap
  let guard = 0;
  while (left > 0 && guard++ < 3650) {
    r.setDate(r.getDate() + 1);
    left -= dayWeight(r);
  }
  return r;
}
/** Sum of business-day weights between [a, b) (Sat = 0.5, Sun/holiday = 0). */
function businessDaysBetween(a: Date, b: Date) {
  if (b <= a) return 1;
  let n = 0;
  const cur = new Date(a);
  while (cur < b) {
    n += dayWeight(cur);
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(0.5, Math.round(n * 2) / 2);
}
function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function colorFor(clave: string | null) {
  if (!clave) return "#64748b";
  return PARTIDA_COLORS[clave.toUpperCase()] ?? "#64748b";
}
function truncate(s: string, n = 25) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function fmtFecha(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function CronogramaTab({ obraId }: { obraId: string }) {
  const qc = useQueryClient();
  const [view, setView] = useState<ViewMode>(ViewMode.Week);
  const [editing, setEditing] = useState<Actividad | null>(null);
  const [generating, setGenerating] = useState(false);
  const [selectedCotId, setSelectedCotId] = useState<string>("");
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(1200);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => setWrapWidth(el.clientWidth));
    ro.observe(el);
    setWrapWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const { data: cotizaciones } = useQuery({
    queryKey: ["cronograma_proyectos", obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select("id, folio, nombre_proyecto")
        .eq("obra_id", obraId)
        .order("folio", { ascending: false });
      if (error) throw error;
      return data as { id: string; folio: string; nombre_proyecto: string }[];
    },
  });

  const proyectoIds = (cotizaciones ?? []).map((p) => p.id);

  useEffect(() => {
    if (!selectedCotId && proyectoIds.length > 0) setSelectedCotId(proyectoIds[0]);
  }, [proyectoIds, selectedCotId]);

  const { data: actividades } = useQuery({
    queryKey: ["cronograma", obraId, selectedCotId],
    enabled: !!selectedCotId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cronograma_actividades")
        .select("*")
        .eq("cotizacion_id", selectedCotId)
        .order("orden", { ascending: true });
      if (error) throw error;
      return data as Actividad[];
    },
  });

  async function generar() {
    if (!selectedCotId) return toast.error("Selecciona una cotización");
    setGenerating(true);
    try {
      const { data: pc, error } = await supabase
        .from("proyecto_conceptos")
        .select("id, proyecto_id, concepto_id, descripcion, cantidad, unidad, concepto:concepto_id(rendimiento, partida_id, partidas:partida_id(clave, nombre))")
        .eq("proyecto_id", selectedCotId);
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
        toast.error("Esta cotización no tiene conceptos");
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

      const startRaw = addDays(new Date(), 7);
      startRaw.setHours(0, 0, 0, 0);
      const start = nextBusinessDay(startRaw);

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
          const fi = nextBusinessDay(new Date(cursor));
          const ff = addBusinessDays(fi, dias);
          nuevas.push({
            proyecto_id: it.proyecto_id,
            cotizacion_id: it.proyecto_id,
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
        cursor = nextBusinessDay(maxFin);
      }

      // borrar previas de ESTA cotización y guardar
      await supabase.from("cronograma_actividades").delete().eq("cotizacion_id", selectedCotId);
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

  // Build tasks with collapsible partida headers (project rows)
  const tasks: Task[] = useMemo(() => {
    const acts = actividades ?? [];
    if (acts.length === 0) return [];
    const groups = new Map<string, { clave: string; nombre: string; items: Actividad[] }>();
    for (const a of acts) {
      const clave = (a.partida_clave ?? "ZZZ").toUpperCase();
      if (!groups.has(clave)) groups.set(clave, { clave, nombre: a.partida ?? clave, items: [] });
      groups.get(clave)!.items.push(a);
    }
    const orderedClaves = Array.from(groups.keys()).sort((a, b) => {
      const ia = PARTIDA_ORDER.indexOf(a);
      const ib = PARTIDA_ORDER.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
    const out: Task[] = [];
    for (const clave of orderedClaves) {
      const g = groups.get(clave)!;
      const color = colorFor(clave);
      const projectId = `grp-${clave}`;
      const starts = g.items.map((a) => new Date(a.fecha_inicio).getTime());
      const ends = g.items.map((a) => new Date(a.fecha_fin).getTime());
      const isCollapsed = !!collapsed[projectId];
      out.push({
        id: projectId,
        name: `${clave} · ${g.nombre}`,
        start: new Date(Math.min(...starts)),
        end: new Date(Math.max(...ends)),
        type: "project",
        progress: 0,
        hideChildren: isCollapsed,
        isDisabled: true,
        styles: {
          backgroundColor: color,
          backgroundSelectedColor: color,
          progressColor: color,
          progressSelectedColor: color,
        },
      });
      for (const a of g.items) {
        out.push({
          id: a.id,
          name: a.nombre_actividad,
          start: new Date(a.fecha_inicio),
          end: new Date(a.fecha_fin),
          type: "task",
          progress: 0,
          project: projectId,
          isDisabled: false,
          styles: {
            backgroundColor: color,
            backgroundSelectedColor: color,
            progressColor: color,
            progressSelectedColor: color,
          },
        });
      }
    }
    return out;
  }, [actividades, collapsed]);

  async function persistTask(id: string, start: Date, end: Date) {
    const dur = businessDaysBetween(start, end);
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
    const dur = businessDaysBetween(fi, ff);
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

  const hasCronograma = (actividades ?? []).length > 0;
  const rowHeight = 44;
  const visibleRows = tasks.length;
  const ganttHeight = Math.min(640, Math.max(500, visibleRows * rowHeight + 60));

  // Column width: zoom or fit-to-container
  const baseCol = view === ViewMode.Month ? 200 : view === ViewMode.Week ? 100 : 50;
  const listW = 380;
  let columnWidth = Math.max(20, Math.round(baseCol * zoom));
  if (fitMode && tasks.length > 0) {
    const mins = tasks.map((t) => t.start.getTime());
    const maxs = tasks.map((t) => t.end.getTime());
    const start = new Date(Math.min(...mins));
    const end = new Date(Math.max(...maxs));
    let cols = 1;
    if (view === ViewMode.Day) {
      cols = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 2);
    } else if (view === ViewMode.Week) {
      cols = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (86400000 * 7)) + 2);
    } else {
      cols = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 2);
    }
    const avail = Math.max(400, wrapWidth - listW - 4);
    columnWidth = Math.max(12, Math.floor(avail / cols));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex-1">
          <label className="text-xs uppercase tracking-wide text-muted-foreground">Cotización</label>
          <select
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:max-w-md"
            value={selectedCotId}
            onChange={(e) => setSelectedCotId(e.target.value)}
          >
            <option value="">— seleccionar —</option>
            {cotizaciones?.map((c) => (
              <option key={c.id} value={c.id}>{c.folio} · {c.nombre_proyecto}</option>
            ))}
          </select>
        </div>
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
              variant={!fitMode && view === o.v ? "default" : "outline"}
              onClick={() => { setFitMode(false); setView(o.v); }}
            >
              {o.l}
            </Button>
          ))}
          <Button
            size="sm"
            variant={fitMode ? "default" : "outline"}
            onClick={() => { setFitMode(true); }}
            title="Ajustar todo el cronograma al ancho disponible"
          >
            Proyecto completo
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <Button size="sm" variant="outline" onClick={() => { setFitMode(false); setZoom((z) => Math.max(0.25, +(z / 1.25).toFixed(2))); }} title="Alejar">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setFitMode(false); setZoom((z) => Math.min(4, +(z * 1.25).toFixed(2))); }} title="Acercar">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          {hasCronograma ? (
            <Button size="sm" variant="outline" onClick={generar} disabled={generating || !selectedCotId} title="Regenerar reemplaza el cronograma actual">
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${generating ? "animate-spin" : ""}`} />
              {generating ? "Regenerando…" : "Regenerar"}
            </Button>
          ) : (
            <Button onClick={generar} disabled={generating || !selectedCotId}>
              <Sparkles className="mr-2 h-4 w-4" />
              {generating ? "Generando…" : "Generar cronograma con IA"}
            </Button>
          )}
        </div>
      </div>

      <style>{`
        .gantt-wrap { scroll-behavior: smooth; -webkit-overflow-scrolling: touch; }
        .gantt-wrap *::-webkit-scrollbar { height: 10px; width: 10px; }
        .gantt-wrap *::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 8px; }
      `}</style>

      {!hasCronograma ? (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Aún no hay cronograma. Presiona <strong>Generar cronograma con IA</strong> para crearlo a partir de los conceptos.
        </div>
      ) : (
        <div
          ref={wrapRef}
          className="gantt-wrap w-full overflow-auto rounded-lg border bg-card"
          style={{ maxHeight: 640, scrollBehavior: "smooth", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
        >
          <Gantt
            tasks={tasks}
            viewMode={view}
            locale="es-MX"
            listCellWidth={`${listW}px`}
            rowHeight={rowHeight}
            ganttHeight={ganttHeight}
            columnWidth={columnWidth}
            onDateChange={async (t) => { await persistTask(t.id, t.start, t.end); }}
            onExpanderClick={(t) => {
              setCollapsed((s) => ({ ...s, [t.id]: !s[t.id] }));
            }}
            onClick={(t: Task) => {
              if (t.type === "project") return;
              const a = (actividades ?? []).find((x) => x.id === t.id);
              if (a) setEditing({ ...a });
            }}
            TaskListHeader={({ headerHeight, rowWidth, fontFamily, fontSize }) => (
              <div
                className="flex items-center border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                style={{ height: headerHeight, width: rowWidth, fontFamily, fontSize }}
              >
                <div className="px-3" style={{ width: "55%" }}>Actividad</div>
                <div className="px-2" style={{ width: "15%" }}>Inicio</div>
                <div className="px-2" style={{ width: "15%" }}>Fin</div>
                <div className="px-2 text-right" style={{ width: "15%" }}>Días</div>
              </div>
            )}
            TaskListTable={({ rowHeight: rh, rowWidth, fontFamily, fontSize, tasks: ts, onExpanderClick }) => (
              <div style={{ fontFamily, fontSize }}>
                {ts.map((t) => {
                  const isProject = t.type === "project";
                  const dur = businessDaysBetween(t.start, t.end);
                  if (isProject) {
                    const isOpen = !collapsed[t.id];
                    return (
                      <div
                        key={t.id}
                        className="flex cursor-pointer items-center border-b bg-slate-900 text-white hover:bg-slate-800"
                        style={{ height: rh, width: rowWidth }}
                        onClick={() => onExpanderClick(t)}
                      >
                        <div className="flex items-center gap-2 px-3 font-semibold" style={{ width: "55%" }}>
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <span className="truncate" title={t.name}>{t.name}</span>
                        </div>
                        <div className="px-2 tabular-nums text-white/80" style={{ width: "15%" }}>{fmtFecha(toISO(t.start))}</div>
                        <div className="px-2 tabular-nums text-white/80" style={{ width: "15%" }}>{fmtFecha(toISO(t.end))}</div>
                        <div className="px-2 text-right tabular-nums" style={{ width: "15%" }}>{dur}</div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={t.id}
                      className="flex items-center border-b last:border-b-0 hover:bg-muted/30"
                      style={{ height: rh, width: rowWidth }}
                    >
                      <div className="truncate px-3 pl-8" style={{ width: "55%" }} title={t.name}>
                        {truncate(t.name, 25)}
                      </div>
                      <div className="px-2 tabular-nums text-muted-foreground" style={{ width: "15%" }}>
                        {fmtFecha(toISO(t.start))}
                      </div>
                      <div className="px-2 tabular-nums text-muted-foreground" style={{ width: "15%" }}>
                        {fmtFecha(toISO(t.end))}
                      </div>
                      <div className="px-2 text-right tabular-nums" style={{ width: "15%" }}>
                        {dur}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            TooltipContent={({ task }) => (
              <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow">
                <div className="font-semibold">{task.name}</div>
                <div>{toISO(task.start)} → {toISO(task.end)}</div>
                <div>{businessDaysBetween(task.start, task.end)} días hábiles</div>
              </div>
            )}
          />
        </div>
      )}

      <AlertasCompra obraId={obraId} actividades={actividades ?? []} />

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
                      const dur = businessDaysBetween(new Date(fi), new Date(editing.fecha_fin));
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
                      const dur = businessDaysBetween(new Date(editing.fecha_inicio), new Date(ff));
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
                    min={0.5}
                    step={0.5}
                    value={editing.duracion_dias}
                    onChange={(e) => {
                      const dur = Math.max(0.5, Number(e.target.value) || 0.5);
                      const ff = addBusinessDays(new Date(editing.fecha_inicio), dur);
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
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Días hábiles reales</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {businessDaysBetween(new Date(editing.fecha_inicio), new Date(editing.fecha_fin))}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  L–V = 1 día · Sábado = 0.5 · Domingo y festivos oficiales MX = 0
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Días calendario: {Math.max(1, Math.round((new Date(editing.fecha_fin).getTime() - new Date(editing.fecha_inicio).getTime()) / 86400000))}
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

type MaterialProv = {
  id: string;
  material: string;
  concepto_id: string | null;
  tiempo_entrega_dias: number;
  proveedor_id: string;
  proveedores?: { nombre: string } | null;
};

type Estado = "pendiente" | "pedido" | "recibido";

const ESTADO_STYLES: Record<Estado, string> = {
  pendiente: "bg-muted text-muted-foreground",
  pedido: "bg-blue-100 text-blue-700",
  recibido: "bg-green-100 text-green-700",
};

function AlertasCompra({ obraId, actividades }: { obraId: string; actividades: Actividad[] }) {
  const qc = useQueryClient();
  const conceptoIds = Array.from(new Set(actividades.map((a) => a.concepto_id).filter(Boolean) as string[]));

  const { data: materiales } = useQuery({
    queryKey: ["materiales_for_cron", conceptoIds.join(",")],
    enabled: conceptoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materiales_proveedor")
        .select("id, material, concepto_id, tiempo_entrega_dias, proveedor_id, proveedores:proveedor_id(nombre)")
        .in("concepto_id", conceptoIds);
      if (error) throw error;
      return data as unknown as MaterialProv[];
    },
  });

  const actividadIds = actividades.map((a) => a.id);
  const { data: estados } = useQuery({
    queryKey: ["alertas_estado", obraId, actividadIds.join(",")],
    enabled: actividadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alertas_compra")
        .select("*")
        .in("actividad_id", actividadIds);
      if (error) throw error;
      return data as { id: string; actividad_id: string; material_id: string; estado: Estado }[];
    },
  });

  const filas = useMemo(() => {
    const out: Array<{
      key: string;
      actividad: Actividad;
      material: MaterialProv;
      fechaPedido: Date;
      diasAnticipacion: number;
      estado: Estado;
      urgente: boolean;
    }> = [];
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const limite = addDays(hoy, 3);

    for (const a of actividades) {
      const mats = (materiales ?? []).filter((m) => m.concepto_id === a.concepto_id);
      for (const m of mats) {
        const fi = new Date(a.fecha_inicio);
        const fp = addDays(fi, -m.tiempo_entrega_dias);
        const e = (estados ?? []).find((x) => x.actividad_id === a.id && x.material_id === m.id);
        const diff = Math.round((fi.getTime() - hoy.getTime()) / 86400000);
        out.push({
          key: `${a.id}-${m.id}`,
          actividad: a,
          material: m,
          fechaPedido: fp,
          diasAnticipacion: diff,
          estado: (e?.estado as Estado) ?? "pendiente",
          urgente: fp <= limite && (e?.estado ?? "pendiente") !== "recibido",
        });
      }
    }
    return out.sort((x, y) => x.fechaPedido.getTime() - y.fechaPedido.getTime());
  }, [actividades, materiales, estados]);

  async function setEstado(actividadId: string, materialId: string, estado: Estado) {
    const existente = (estados ?? []).find(
      (x) => x.actividad_id === actividadId && x.material_id === materialId,
    );
    if (existente) {
      const { error } = await supabase
        .from("alertas_compra")
        .update({ estado })
        .eq("id", existente.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("alertas_compra")
        .insert({ actividad_id: actividadId, material_id: materialId, estado });
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["alertas_estado", obraId] });
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Alertas de compra
      </h3>
      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Material</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Pedir antes del</th>
              <th className="px-4 py-3">Para actividad</th>
              <th className="px-4 py-3 text-right">Días anticipación</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                No hay alertas. Asocia materiales de proveedores a los conceptos para verlas aquí.
              </td></tr>
            )}
            {filas.map((f) => (
              <tr
                key={f.key}
                className={`border-t ${f.urgente ? "bg-red-50 text-red-900" : ""}`}
              >
                <td className="px-4 py-2.5 font-medium">
                  <div className="flex items-center gap-2">
                    {f.urgente && <AlertTriangle className="h-4 w-4 text-red-600" />}
                    {f.material.material}
                  </div>
                </td>
                <td className="px-4 py-2.5">{f.material.proveedores?.nombre ?? "—"}</td>
                <td className="px-4 py-2.5 tabular-nums">{toISO(f.fechaPedido)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{f.actividad.nombre_actividad}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{f.diasAnticipacion} d</td>
                <td className="px-4 py-2.5">
                  <select
                    value={f.estado}
                    onChange={(e) => setEstado(f.actividad.id, f.material.id, e.target.value as Estado)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_STYLES[f.estado]}`}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="pedido">Pedido</option>
                    <option value="recibido">Recibido</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
