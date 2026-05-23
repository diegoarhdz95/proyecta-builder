import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart2, Save, AlertTriangle, RefreshCw, ZoomIn, ZoomOut, ChevronDown, ChevronRight, Maximize2 } from "lucide-react";
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
  const [view, setView] = useState<GView>("week");
  const [editing, setEditing] = useState<Actividad | null>(null);
  const [generating, setGenerating] = useState(false);
  const [selectedCotId, setSelectedCotId] = useState<string>("");
  const [zoom, setZoom] = useState(1);
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

  // ============= GANTT MODEL =============
  type Grupo = { clave: string; nombre: string; items: Actividad[]; color: string };
  const grupos: Grupo[] = useMemo(() => {
    const acts = actividades ?? [];
    const map = new Map<string, Grupo>();
    for (const a of acts) {
      const clave = (a.partida_clave ?? "ZZZ").toUpperCase();
      if (!map.has(clave)) map.set(clave, { clave, nombre: a.partida ?? clave, items: [], color: colorFor(clave) });
      map.get(clave)!.items.push(a);
    }
    return Array.from(map.values()).sort((a, b) => {
      const ia = PARTIDA_ORDER.indexOf(a.clave);
      const ib = PARTIDA_ORDER.indexOf(b.clave);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [actividades]);

  type Row =
    | { kind: "group"; clave: string; nombre: string; color: string; start: Date; end: Date; childCount: number }
    | { kind: "task"; act: Actividad; color: string };
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const g of grupos) {
      const starts = g.items.map((a) => new Date(a.fecha_inicio).getTime());
      const ends = g.items.map((a) => new Date(a.fecha_fin).getTime());
      out.push({
        kind: "group",
        clave: g.clave,
        nombre: g.nombre,
        color: g.color,
        start: new Date(Math.min(...starts)),
        end: new Date(Math.max(...ends)),
        childCount: g.items.length,
      });
      if (!collapsed[g.clave]) {
        for (const a of g.items) out.push({ kind: "task", act: a, color: g.color });
      }
    }
    return out;
  }, [grupos, collapsed]);

  // Day list, Sundays skipped
  const days = useMemo(() => {
    const acts = actividades ?? [];
    if (acts.length === 0) return [] as Date[];
    const starts = acts.map((a) => new Date(a.fecha_inicio).getTime());
    const ends = acts.map((a) => new Date(a.fecha_fin).getTime());
    const min = new Date(Math.min(...starts));
    const max = new Date(Math.max(...ends));
    min.setHours(0, 0, 0, 0); max.setHours(0, 0, 0, 0);
    const cur = new Date(min); cur.setDate(cur.getDate() - 2);
    const stop = new Date(max); stop.setDate(stop.getDate() + 3);
    const arr: Date[] = [];
    while (cur <= stop) {
      if (cur.getDay() !== 0) arr.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return arr;
  }, [actividades]);

  const dayIdx = useMemo(() => {
    const m = new Map<string, number>();
    days.forEach((d, i) => m.set(toISO(d), i));
    return m;
  }, [days]);

  function findIdx(d: Date, direction: 1 | -1 = 1): number {
    const probe = new Date(d); probe.setHours(0, 0, 0, 0);
    for (let i = 0; i < 8; i++) {
      const key = toISO(probe);
      if (dayIdx.has(key)) return dayIdx.get(key)!;
      probe.setDate(probe.getDate() + direction);
    }
    return 0;
  }

  // Cell width
  const cellW = useMemo(() => {
    const base = BASE_CELL[view];
    return Math.max(2, Math.round(base * zoom));
  }, [view, zoom]);

  const totalW = days.length * cellW;
  const fontBody = clamp(8, Math.round(11 * Math.sqrt(zoom)), 22);
  const fontHeader = clamp(7, Math.round(10 * Math.sqrt(zoom)), 20);
  const rowH = clamp(22, Math.round(ROW_H * Math.sqrt(zoom)), 56);

  // Fit-to-screen: compute zoom so the whole project fits in available width
  function verTodo() {
    if (days.length === 0) return;
    const avail = Math.max(300, wrapWidth - LEFT_W - 8);
    const z = avail / (days.length * BASE_CELL[view]);
    setZoom(clamp(0.1, +z.toFixed(3), 6));
    if (wrapRef.current) wrapRef.current.scrollLeft = 0;
  }

  // Ctrl+wheel zoom
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => clamp(0.1, +(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)).toFixed(3), 6));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Month groups for header
  const monthSpans = useMemo(() => {
    const out: { label: string; left: number; width: number }[] = [];
    if (days.length === 0) return out;
    let startI = 0;
    for (let i = 1; i <= days.length; i++) {
      const end = i === days.length;
      const sameMonth = !end && days[i].getMonth() === days[startI].getMonth() && days[i].getFullYear() === days[startI].getFullYear();
      if (!sameMonth) {
        const d = days[startI];
        const label = d.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
        out.push({ label, left: startI * cellW, width: (i - startI) * cellW });
        startI = i;
      }
    }
    return out;
  }, [days, cellW]);

  // Project totals
  const totals = useMemo(() => {
    const acts = actividades ?? [];
    if (acts.length === 0) return null;
    const starts = acts.map((a) => new Date(a.fecha_inicio).getTime());
    const ends = acts.map((a) => new Date(a.fecha_fin).getTime());
    const s = new Date(Math.min(...starts));
    const e = new Date(Math.max(...ends));
    const bd = businessDaysBetween(s, e);
    return { start: s, end: e, businessDays: bd, weeks: Math.max(1, Math.ceil(bd / 5)) };
  }, [actividades]);

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
  const bodyH = rows.length * rowH;

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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Vista:</span>
          {([
            { v: "day" as const, l: "Día" },
            { v: "week" as const, l: "Semana" },
            { v: "month" as const, l: "Mes" },
          ]).map((o) => (
            <Button
              key={o.l}
              size="sm"
              variant={view === o.v ? "default" : "outline"}
              onClick={() => { setView(o.v); setZoom(1); }}
            >
              {o.l}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={verTodo} title="Ajusta el zoom para ver todo el proyecto">
            <Maximize2 className="mr-1.5 h-3.5 w-3.5" /> Ver todo
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => clamp(0.1, +(z / 1.2).toFixed(3), 6))} title="Alejar (Ctrl+Scroll)">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => clamp(0.1, +(z * 1.2).toFixed(3), 6))} title="Acercar (Ctrl+Scroll)">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          {hasCronograma ? (
            <Button size="sm" variant="outline" onClick={generar} disabled={generating || !selectedCotId}>
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

      {totals && (
        <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2.5 text-sm">
          <div>
            <span className="font-semibold">Duración total:</span>{" "}
            <span className="tabular-nums">{totals.businessDays} días hábiles</span>{" "}
            <span className="text-muted-foreground">({totals.weeks} semanas aproximadamente)</span>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {fmtFecha(toISO(totals.start))} → {fmtFecha(toISO(totals.end))}
          </div>
        </div>
      )}

      {!hasCronograma ? (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Aún no hay cronograma. Presiona <strong>Generar cronograma con IA</strong> para crearlo a partir de los conceptos.
        </div>
      ) : (
        <div
          ref={wrapRef}
          className="gantt-msp relative w-full overflow-auto rounded-lg border bg-card"
          style={{ maxHeight: 680 }}
        >
          <div style={{ width: LEFT_W + totalW, position: "relative" }}>
            {/* Header */}
            <div
              className="flex bg-muted/60 backdrop-blur"
              style={{ position: "sticky", top: 0, zIndex: 30, height: HEADER_H }}
            >
              <div
                className="flex items-center border-b border-r bg-muted/80"
                style={{ position: "sticky", left: 0, zIndex: 40, width: LEFT_W, fontSize: fontHeader }}
              >
                <div className="px-3 font-semibold uppercase tracking-wide text-muted-foreground" style={{ width: "55%" }}>Actividad</div>
                <div className="px-2 font-semibold uppercase tracking-wide text-muted-foreground" style={{ width: "15%" }}>Inicio</div>
                <div className="px-2 font-semibold uppercase tracking-wide text-muted-foreground" style={{ width: "15%" }}>Fin</div>
                <div className="px-2 text-right font-semibold uppercase tracking-wide text-muted-foreground" style={{ width: "15%" }}>Días</div>
              </div>
              <div className="relative border-b" style={{ width: totalW, height: HEADER_H }}>
                {/* month row */}
                <div className="absolute left-0 right-0 top-0 border-b" style={{ height: HEADER_H / 2 }}>
                  {monthSpans.map((m, i) => (
                    <div
                      key={i}
                      className="absolute flex items-center justify-center border-r font-semibold capitalize text-muted-foreground"
                      style={{ left: m.left, width: m.width, top: 0, bottom: 0, fontSize: fontHeader }}
                      title={m.label}
                    >
                      <span className="truncate px-2">{m.label}</span>
                    </div>
                  ))}
                </div>
                {/* day row */}
                <div className="absolute left-0 right-0" style={{ top: HEADER_H / 2, bottom: 0 }}>
                  {days.map((d, i) => {
                    const dow = d.getDay();
                    const holiday = isMxHoliday(d);
                    const isSat = dow === 6;
                    const showNum = cellW >= 14;
                    const showDow = cellW >= 22;
                    const bg = holiday ? "rgba(250,204,21,0.35)" : isSat ? "rgba(0,0,0,0.04)" : "transparent";
                    return (
                      <div
                        key={i}
                        className="absolute flex flex-col items-center justify-center border-r text-muted-foreground"
                        style={{ left: i * cellW, width: cellW, top: 0, bottom: 0, fontSize: Math.max(7, fontHeader - 1), background: bg }}
                        title={d.toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })}
                      >
                        {showNum && <span className="tabular-nums leading-none">{d.getDate()}</span>}
                        {showDow && <span className="leading-none opacity-60" style={{ fontSize: Math.max(6, fontHeader - 3) }}>
                          {["D","L","M","M","J","V","S"][dow]}
                        </span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Body rows */}
            <div style={{ position: "relative", height: bodyH }}>
              {rows.map((r, ri) => {
                const top = ri * rowH;
                if (r.kind === "group") {
                  const open = !collapsed[r.clave];
                  const sIdx = findIdx(r.start);
                  const eIdx = findIdx(r.end);
                  const span = Math.max(1, eIdx - sIdx + 1);
                  return (
                    <div key={`g-${r.clave}`} className="absolute left-0 right-0 flex" style={{ top, height: rowH }}>
                      <div
                        className="flex cursor-pointer items-center border-b border-r bg-slate-900 text-white hover:bg-slate-800"
                        style={{ position: "sticky", left: 0, zIndex: 20, width: LEFT_W, fontSize: fontBody }}
                        onClick={() => setCollapsed((s) => ({ ...s, [r.clave]: !s[r.clave] }))}
                      >
                        <div className="flex items-center gap-2 px-3 font-semibold" style={{ width: "55%" }}>
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <span className="truncate" title={`${r.clave} · ${r.nombre}`}>{r.clave} · {r.nombre}</span>
                        </div>
                        <div className="px-2 tabular-nums text-white/80" style={{ width: "15%" }}>{fmtFecha(toISO(r.start))}</div>
                        <div className="px-2 tabular-nums text-white/80" style={{ width: "15%" }}>{fmtFecha(toISO(r.end))}</div>
                        <div className="px-2 text-right tabular-nums" style={{ width: "15%" }}>{businessDaysBetween(r.start, r.end)}</div>
                      </div>
                      <div className="relative border-b" style={{ width: totalW }}>
                        <DayBackground days={days} cellW={cellW} />
                        <div
                          className="absolute rounded-sm"
                          style={{
                            left: sIdx * cellW + 1,
                            width: span * cellW - 2,
                            top: rowH * 0.35,
                            height: rowH * 0.3,
                            background: r.color,
                            opacity: 0.85,
                          }}
                          title={`${r.clave} · ${r.nombre}`}
                        />
                      </div>
                    </div>
                  );
                }
                const a = r.act;
                const start = new Date(a.fecha_inicio);
                const end = new Date(a.fecha_fin);
                const sIdx = findIdx(start);
                const eIdx = findIdx(end);
                const span = Math.max(1, eIdx - sIdx + 1);
                return (
                  <div key={`t-${a.id}`} className="absolute left-0 right-0 flex hover:bg-muted/20" style={{ top, height: rowH }}>
                    <div
                      className="flex items-center border-b border-r bg-card"
                      style={{ position: "sticky", left: 0, zIndex: 10, width: LEFT_W, fontSize: fontBody }}
                    >
                      <div className="truncate px-3 pl-8" style={{ width: "55%" }} title={a.nombre_actividad}>
                        {truncate(a.nombre_actividad, 30)}
                      </div>
                      <div className="px-2 tabular-nums text-muted-foreground" style={{ width: "15%" }}>{fmtFecha(a.fecha_inicio)}</div>
                      <div className="px-2 tabular-nums text-muted-foreground" style={{ width: "15%" }}>{fmtFecha(a.fecha_fin)}</div>
                      <div className="px-2 text-right tabular-nums" style={{ width: "15%" }}>{businessDaysBetween(start, end)}</div>
                    </div>
                    <div className="relative border-b" style={{ width: totalW }}>
                      <DayBackground days={days} cellW={cellW} />
                      {/* Saturday half-day shading on bar */}
                      <div
                        className="absolute cursor-pointer rounded-sm shadow-sm transition-opacity hover:opacity-90"
                        style={{
                          left: sIdx * cellW + 1,
                          width: span * cellW - 2,
                          top: rowH * 0.2,
                          height: rowH * 0.6,
                          background: r.color,
                        }}
                        onClick={() => setEditing({ ...a })}
                        title={`${a.nombre_actividad}\n${fmtFecha(a.fecha_inicio)} → ${fmtFecha(a.fecha_fin)}\n${businessDaysBetween(start, end)} días hábiles`}
                      >
                        {cellW * span > 60 && (
                          <span className="block truncate px-1.5 leading-none text-white" style={{ fontSize: Math.max(8, fontBody - 2), paddingTop: Math.max(2, (rowH * 0.6 - fontBody) / 2) }}>
                            {a.nombre_actividad}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Tip: mantén <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">Ctrl</kbd> y usa la rueda del mouse para hacer zoom. Domingos se omiten, sábados aparecen en gris claro y festivos oficiales en amarillo.
      </p>

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

function DayBackground({ days, cellW }: { days: Date[]; cellW: number }) {
  // Render only highlighted (Saturday / holiday) cells + thin separators every 7 cells
  return (
    <>
      {days.map((d, i) => {
        const dow = d.getDay();
        const holiday = isMxHoliday(d);
        const isSat = dow === 6;
        const isMonday = dow === 1;
        if (!holiday && !isSat && !isMonday) return null;
        const bg = holiday ? "rgba(250,204,21,0.28)" : isSat ? "rgba(0,0,0,0.04)" : "transparent";
        return (
          <div
            key={i}
            className="absolute top-0 bottom-0"
            style={{
              left: i * cellW,
              width: cellW,
              background: bg,
              borderLeft: isMonday ? "1px solid hsl(var(--border))" : undefined,
            }}
          />
        );
      })}
    </>
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
