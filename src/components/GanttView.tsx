import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  ZoomIn, ZoomOut, Maximize2, ChevronDown, ChevronRight, Save, Printer,
} from "lucide-react";
import {
  Calendar, PARTIDA_ORDER, colorFor, toISO,
  type GanttSettings,
} from "@/lib/gantt-engine";

export type ActividadView = {
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
  /** Otra actividad de la que depende (su fin define el inicio de esta) */
  depende_de?: string | null;
};

type GView = "day" | "week" | "month";
const BASE_CELL: Record<GView, number> = { day: 36, week: 16, month: 6 };
const ROW_H = 30;
const HEADER_H = 46;
const LEFT_W = 500;
const clamp = (a: number, v: number, b: number) => Math.max(a, Math.min(b, v));

function fmtFecha(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function truncate(s: string, n = 30) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});
function fmtCosto(v: number | undefined | null): string {
  if (v == null || !Number.isFinite(Number(v)) || Number(v) <= 0) return "Sin costo";
  return mxn.format(Number(v));
}

export function GanttView({
  actividades,
  settings,
  onChange,
  readonly = false,
  toolbarExtra,
  projectName,
  folio,
  costos,
}: {
  actividades: ActividadView[];
  settings: GanttSettings;
  onChange?: (next: ActividadView[]) => void;
  readonly?: boolean;
  toolbarExtra?: React.ReactNode;
  projectName?: string;
  folio?: string;
  /** Costo por concepto_id (subtotal de la cotización) */
  costos?: Record<string, number>;
}) {
  const cal = useMemo(() => new Calendar(settings), [settings]);
  const [view, setView] = useState<GView>("week");
  const [zoom, setZoom] = useState(1);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<ActividadView | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(1200);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => setWrapWidth(el.clientWidth));
    ro.observe(el);
    setWrapWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Domingos SIEMPRE visibles; el color de fondo indica si se trabaja o no
  useEffect(() => {
    console.log("trabaja_domingo:", settings.trabaja_domingo);
  }, [settings.trabaja_domingo]);

  const days = useMemo(() => {
    if (actividades.length === 0) return [] as Date[];
    const starts = actividades.map((a) => new Date(`${a.fecha_inicio}T00:00:00`).getTime());
    const ends = actividades.map((a) => new Date(`${a.fecha_fin}T00:00:00`).getTime());
    const min = new Date(Math.min(...starts));
    const max = new Date(Math.max(...ends));
    min.setHours(0, 0, 0, 0); max.setHours(0, 0, 0, 0);
    const cur = new Date(min); cur.setDate(cur.getDate() - 2);
    const stop = new Date(max); stop.setDate(stop.getDate() + 3);
    const arr: Date[] = [];
    while (cur <= stop) {
      arr.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return arr;
  }, [actividades]);

  const dayIdx = useMemo(() => {
    const m = new Map<string, number>();
    days.forEach((d, i) => m.set(toISO(d), i));
    return m;
  }, [days]);

  function findIdx(iso: string): number {
    if (dayIdx.has(iso)) return dayIdx.get(iso)!;
    const probe = new Date(`${iso}T00:00:00`);
    for (let i = 0; i < 8; i++) {
      probe.setDate(probe.getDate() + 1);
      const k = toISO(probe);
      if (dayIdx.has(k)) return dayIdx.get(k)!;
    }
    return 0;
  }

  const cellW = useMemo(() => Math.max(2, Math.round(BASE_CELL[view] * zoom)), [view, zoom]);
  const totalW = days.length * cellW;
  const fontBody = clamp(8, Math.round(11 * Math.sqrt(zoom)), 22);
  const fontHeader = clamp(7, Math.round(10 * Math.sqrt(zoom)), 20);
  const rowH = clamp(22, Math.round(ROW_H * Math.sqrt(zoom)), 56);

  function verTodo() {
    if (days.length === 0) return;
    const avail = Math.max(300, wrapWidth - LEFT_W - 8);
    const z = avail / (days.length * BASE_CELL[view]);
    setZoom(clamp(0.1, +z.toFixed(3), 6));
    if (wrapRef.current) wrapRef.current.scrollLeft = 0;
  }

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

  // Grupos por partida
  type Grupo = { clave: string; nombre: string; items: ActividadView[]; color: string };
  const grupos: Grupo[] = useMemo(() => {
    const map = new Map<string, Grupo>();
    for (const a of actividades) {
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
    | { kind: "task"; act: ActividadView; color: string };
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const g of grupos) {
      if (g.items.length === 0) continue;
      const starts = g.items.map((a) => new Date(`${a.fecha_inicio}T00:00:00`).getTime());
      const ends = g.items.map((a) => new Date(`${a.fecha_fin}T00:00:00`).getTime());
      out.push({
        kind: "group", clave: g.clave, nombre: g.nombre, color: g.color,
        start: new Date(Math.min(...starts)), end: new Date(Math.max(...ends)),
        childCount: g.items.length,
      });
      if (!collapsed[g.clave]) for (const a of g.items) out.push({ kind: "task", act: a, color: g.color });
    }
    return out;
  }, [grupos, collapsed]);

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

  // ============ DRAG / RESIZE ============
  function shiftActividad(id: string, deltaDays: number, mode: "move" | "resize") {
    if (!onChange || deltaDays === 0) return;
    const next = actividades.map((a) => {
      if (a.id !== id) return a;
      const fi = new Date(`${a.fecha_inicio}T00:00:00`);
      const ff = new Date(`${a.fecha_fin}T00:00:00`);
      if (mode === "move") {
        fi.setDate(fi.getDate() + deltaDays);
        ff.setDate(ff.getDate() + deltaDays);
      } else {
        ff.setDate(ff.getDate() + deltaDays);
        if (ff <= fi) ff.setTime(fi.getTime() + 86400000);
      }
      return {
        ...a,
        fecha_inicio: toISO(fi),
        fecha_fin: toISO(ff),
        duracion_dias: cal.businessDaysBetween(fi, ff),
      };
    });
    onChange(next);
  }

  function applyEdit(next: ActividadView) {
    if (!onChange) return;
    // Si cambió dependencia, recorrer
    let updated: ActividadView = { ...next };
    if (next.depende_de) {
      const dep = actividades.find((x) => x.id === next.depende_de);
      if (dep) {
        const depEnd = new Date(`${dep.fecha_fin}T00:00:00`);
        depEnd.setDate(depEnd.getDate() + 1);
        const fi = cal.nextBusinessDay(depEnd);
        const dur = updated.duracion_dias || cal.businessDaysBetween(
          new Date(`${updated.fecha_inicio}T00:00:00`),
          new Date(`${updated.fecha_fin}T00:00:00`),
        );
        const ff = cal.addBusinessDays(fi, dur);
        updated = { ...updated, fecha_inicio: toISO(fi), fecha_fin: toISO(ff), duracion_dias: dur };
      }
    } else {
      const fi = new Date(`${updated.fecha_inicio}T00:00:00`);
      const ff = new Date(`${updated.fecha_fin}T00:00:00`);
      updated.duracion_dias = cal.businessDaysBetween(fi, ff);
    }
    onChange(actividades.map((a) => (a.id === updated.id ? updated : a)));
    setEditing(null);
  }

  function imprimirGantt() {
    if (!innerRef.current || actividades.length === 0) return;
    const contentHTML = innerRef.current.outerHTML;
    const contentWidth = LEFT_W + totalW;

    // Recolectar estilos del documento (Tailwind compilado, etc.)
    const styleTags = Array.from(document.querySelectorAll('style'))
      .map((s) => `<style>${s.innerHTML}</style>`)
      .join("\n");
    const linkTags = Array.from(
      document.querySelectorAll('link[rel="stylesheet"]'),
    )
      .map((l) => l.outerHTML)
      .join("\n");

    const fechaTxt = new Date().toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    // Letter landscape (11in x 8.5in) con márgenes 0.4in => ancho útil ~10.2in @ 96dpi ≈ 979px
    const PRINT_WIDTH_PX = 1040; // un poco más generoso
    const scale = Math.min(1, PRINT_WIDTH_PX / contentWidth);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${(folio || "Cronograma")} - Cronograma</title>
${linkTags}
${styleTags}
<style>
  @page { size: letter landscape; margin: 0.4in 0.4in 0.6in 0.4in; }
  html, body { background: #ffffff !important; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111827; }
  .print-header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid #0f1742; padding-bottom: 10px; margin-bottom: 12px; }
  .print-header h1 { margin: 0 0 4px 0; font-size: 16px; color: #0f1742; font-weight: 700; }
  .print-header .meta { font-size: 10px; color: #6b7280; }
  .print-header .brand { font-size: 11px; font-weight: 600; color: #0f1742; text-align: right; }
  .print-scale { transform-origin: top left; transform: scale(${scale}); width: ${contentWidth}px; }
  .print-footer { position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; font-size: 9px; color: #6b7280; padding: 4px 0; border-top: 1px solid #e5e7eb; background: #fff; }
  .print-footer .pgnum::after { content: counter(page) " / " counter(pages); }
  /* Ocultar barras de scroll en impresión */
  .print-scale, .print-scale * { overflow: visible !important; max-height: none !important; }
</style>
</head>
<body>
  <div class="print-header">
    <div>
      <h1>${(projectName || "Cronograma").replace(/</g, "&lt;")}</h1>
      <div class="meta">${folio ? `Folio: ${folio} · ` : ""}Generado: ${fechaTxt}</div>
    </div>
    <div class="brand">Grupo Proyecta</div>
  </div>
  <div class="print-scale">${contentHTML}</div>
  <div class="print-footer">
    <span>Grupo Proyecta</span>
    <span class="pgnum"></span>
  </div>
</body>
</html>`;

    const w = window.open("", "_blank", "width=1200,height=800");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();

    const triggerPrint = () => {
      try { w.focus(); w.print(); } catch { /* ignore */ }
      const close = () => { try { w.close(); } catch { /* ignore */ } };
      w.onafterprint = close;
      // fallback por si onafterprint no dispara
      setTimeout(close, 60000);
    };

    if (w.document.readyState === "complete") {
      setTimeout(triggerPrint, 400);
    } else {
      w.addEventListener("load", () => setTimeout(triggerPrint, 400));
    }
  }

  const totals = useMemo(() => {
    if (actividades.length === 0) return null;
    const starts = actividades.map((a) => new Date(`${a.fecha_inicio}T00:00:00`).getTime());
    const ends = actividades.map((a) => new Date(`${a.fecha_fin}T00:00:00`).getTime());
    const s = new Date(Math.min(...starts));
    const e = new Date(Math.max(...ends));
    const bd = cal.businessDaysBetween(s, e);
    const costoTotal = actividades.reduce(
      (sum, a) => sum + (a.concepto_id ? Number(costos?.[a.concepto_id] ?? 0) : 0),
      0,
    );
    return { start: s, end: e, businessDays: bd, weeks: Math.max(1, Math.ceil(bd / 5)), costoTotal };
  }, [actividades, cal, costos]);

  function costoDeActividad(a: ActividadView): number {
    if (!a.concepto_id) return 0;
    return Number(costos?.[a.concepto_id] ?? 0);
  }
  function costoDeGrupo(clave: string): number {
    const g = grupos.find((x) => x.clave === clave);
    if (!g) return 0;
    return g.items.reduce((s, a) => s + costoDeActividad(a), 0);
  }

  const bodyH = rows.length * rowH;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-0">{toolbarExtra}</div>
        <div className="flex items-center gap-1">
          {(["day","week","month"] as GView[]).map((v) => (
            <Button key={v} size="sm" className="h-8 px-2 text-xs"
              variant={view === v ? "default" : "outline"}
              onClick={() => { setView(v); setZoom(1); }}>
              {v === "day" ? "Día" : v === "week" ? "Semana" : "Mes"}
            </Button>
          ))}
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={verTodo} title="Ver todo">
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <div className="mx-0.5 h-4 w-px bg-border" />
          <Button size="sm" variant="outline" className="h-8 w-8 p-0"
            onClick={() => setZoom((z) => clamp(0.1, +(z / 1.2).toFixed(3), 6))} title="Alejar">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[10px] tabular-nums text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="outline" className="h-8 w-8 p-0"
            onClick={() => setZoom((z) => clamp(0.1, +(z * 1.2).toFixed(3), 6))} title="Acercar">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            className="h-8 px-2 text-xs ml-2"
            onClick={imprimirGantt}
            disabled={actividades.length === 0}
            title="Imprimir Gantt"
          >
            <Printer className="h-3.5 w-3.5 mr-1" />
            Imprimir Gantt
          </Button>
        </div>
      </div>

      {totals && (
        <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2 text-sm">
          <div>
            <span className="font-semibold">Duración:</span>{" "}
            <span className="tabular-nums">{totals.businessDays} días hábiles</span>{" "}
            <span className="text-muted-foreground">({totals.weeks} semanas)</span>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {fmtFecha(toISO(totals.start))} → {fmtFecha(toISO(totals.end))}
          </div>
        </div>
      )}

      {actividades.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Sin actividades
        </div>
      ) : (
        <div ref={wrapRef} className="relative w-full overflow-auto rounded-lg border bg-card" style={{ maxHeight: 600 }}>
          <div ref={innerRef} style={{ width: LEFT_W + totalW, position: "relative", background: "#ffffff" }}>
            {/* Header */}
            <div className="flex bg-muted/60 backdrop-blur" style={{ position: "sticky", top: 0, zIndex: 30, height: HEADER_H }}>
              <div className="flex items-center border-b border-r bg-muted/80"
                style={{ position: "sticky", left: 0, zIndex: 40, width: LEFT_W, fontSize: fontHeader }}>
                <div className="px-3 font-semibold uppercase tracking-wide text-muted-foreground" style={{ width: "42%" }}>Actividad</div>
                <div className="px-2 font-semibold uppercase tracking-wide text-muted-foreground" style={{ width: "12%" }}>Inicio</div>
                <div className="px-2 font-semibold uppercase tracking-wide text-muted-foreground" style={{ width: "12%" }}>Fin</div>
                <div className="px-2 text-right font-semibold uppercase tracking-wide text-muted-foreground" style={{ width: "10%" }}>Días</div>
                <div className="px-2 text-right font-semibold uppercase tracking-wide text-muted-foreground" style={{ width: "24%" }}>Costo Total</div>
              </div>
              <div className="relative border-b" style={{ width: totalW, height: HEADER_H }}>
                <div className="absolute left-0 right-0 top-0 border-b" style={{ height: HEADER_H / 2 }}>
                  {monthSpans.map((m, i) => (
                    <div key={i} className="absolute flex items-center justify-center border-r font-semibold capitalize text-muted-foreground"
                      style={{ left: m.left, width: m.width, top: 0, bottom: 0, fontSize: fontHeader }} title={m.label}>
                      <span className="truncate px-2">{m.label}</span>
                    </div>
                  ))}
                </div>
                <div className="absolute left-0 right-0" style={{ top: HEADER_H / 2, bottom: 0 }}>
                  {days.map((d, i) => {
                    const dow = d.getDay();
                    const holiday = cal.isHoliday(d);
                    const isSat = dow === 6;
                    const isSun = dow === 0;
                    const showNum = cellW >= 14;
                    const bg = holiday
                      ? "rgba(250,204,21,0.35)"
                      : isSun && !settings.trabaja_domingo
                        ? "#f5f5f5"
                        : isSat
                          ? "rgba(0,0,0,0.04)"
                          : "transparent";
                    return (
                      <div key={i} className="absolute flex flex-col items-center justify-center border-r text-muted-foreground"
                        style={{ left: i * cellW, width: cellW, top: 0, bottom: 0, fontSize: Math.max(7, fontHeader - 1), background: bg }}
                        title={d.toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "short" })}>
                        {showNum && <span className="tabular-nums leading-none">{d.getDate()}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ position: "relative", height: bodyH }}>
              {/* Fondo de columnas no laborables (domingos / festivos) */}
              <div className="pointer-events-none absolute inset-0" style={{ left: LEFT_W }}>
                {days.map((d, i) => {
                  const dow = d.getDay();
                  const holiday = cal.isHoliday(d);
                  const isSun = dow === 0;
                  if (!holiday && !(isSun && !settings.trabaja_domingo)) return null;
                  const bg = holiday ? "rgba(250,204,21,0.12)" : "#f5f5f5";
                  return (
                    <div key={i} className="absolute top-0 bottom-0"
                      style={{ left: i * cellW, width: cellW, background: bg }} />
                  );
                })}
              </div>
              {rows.map((r, ri) => {
                const top = ri * rowH;
                if (r.kind === "group") {
                  const open = !collapsed[r.clave];
                  const sIdx = findIdx(toISO(r.start));
                  const eIdx = findIdx(toISO(r.end));
                  const span = Math.max(1, eIdx - sIdx + 1);
                  return (
                    <div key={`g-${r.clave}-${ri}`} className="absolute left-0 right-0 flex" style={{ top, height: rowH }}>
                      <div className="flex cursor-pointer items-center border-b border-r bg-slate-900 text-white hover:bg-slate-800"
                        style={{ position: "sticky", left: 0, zIndex: 20, width: LEFT_W, fontSize: fontBody }}
                        onClick={() => setCollapsed((s) => ({ ...s, [r.clave]: !s[r.clave] }))}>
                        <div className="flex items-center gap-2 px-3 font-semibold" style={{ width: "55%" }}>
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <span className="truncate">{r.clave} · {r.nombre}</span>
                        </div>
                        <div className="px-2 tabular-nums text-white/80" style={{ width: "15%" }}>{fmtFecha(toISO(r.start))}</div>
                        <div className="px-2 tabular-nums text-white/80" style={{ width: "15%" }}>{fmtFecha(toISO(r.end))}</div>
                        <div className="px-2 text-right tabular-nums" style={{ width: "15%" }}>{cal.businessDaysBetween(r.start, r.end)}</div>
                      </div>
                      <div className="relative border-b" style={{ width: totalW }}>
                        <div className="absolute rounded-sm"
                          style={{ left: sIdx * cellW + 1, width: span * cellW - 2, top: rowH * 0.35, height: rowH * 0.3,
                            background: r.color, opacity: 0.85 }} />
                      </div>
                    </div>
                  );
                }
                const a = r.act;
                const sIdx = findIdx(a.fecha_inicio);
                const eIdx = findIdx(a.fecha_fin);
                const span = Math.max(1, eIdx - sIdx + 1);
                return (
                  <div key={`t-${a.id}`} className="absolute left-0 right-0 flex hover:bg-muted/20" style={{ top, height: rowH }}>
                    <div className="flex items-center border-b border-r bg-card"
                      style={{ position: "sticky", left: 0, zIndex: 10, width: LEFT_W, fontSize: fontBody }}>
                      <div className="truncate px-3 pl-8" style={{ width: "55%" }} title={a.nombre_actividad}>
                        {truncate(a.nombre_actividad, 30)}
                      </div>
                      <div className="px-2 tabular-nums text-muted-foreground" style={{ width: "15%" }}>{fmtFecha(a.fecha_inicio)}</div>
                      <div className="px-2 tabular-nums text-muted-foreground" style={{ width: "15%" }}>{fmtFecha(a.fecha_fin)}</div>
                      <div className="px-2 text-right tabular-nums" style={{ width: "15%" }}>{a.duracion_dias}</div>
                    </div>
                    <div className="relative border-b" style={{ width: totalW }}>
                      <BarWithDrag
                        a={a} cellW={cellW} sIdx={sIdx} span={span} rowH={rowH} fontBody={fontBody}
                        color={r.color} readonly={readonly}
                        onMove={(d) => shiftActividad(a.id, d, "move")}
                        onResize={(d) => shiftActividad(a.id, d, "resize")}
                        onClick={() => setEditing({ ...a })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>Editar actividad</SheetTitle></SheetHeader>
          {editing && (
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground">Nombre</label>
                <Input className="mt-1" value={editing.nombre_actividad}
                  onChange={(e) => setEditing({ ...editing, nombre_actividad: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Fecha inicio</label>
                  <Input className="mt-1" type="date" value={editing.fecha_inicio}
                    onChange={(e) => {
                      const fi = e.target.value;
                      const dur = cal.businessDaysBetween(new Date(`${fi}T00:00:00`), new Date(`${editing.fecha_fin}T00:00:00`));
                      setEditing({ ...editing, fecha_inicio: fi, duracion_dias: dur });
                    }} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Fecha fin</label>
                  <Input className="mt-1" type="date" value={editing.fecha_fin}
                    onChange={(e) => {
                      const ff = e.target.value;
                      const dur = cal.businessDaysBetween(new Date(`${editing.fecha_inicio}T00:00:00`), new Date(`${ff}T00:00:00`));
                      setEditing({ ...editing, fecha_fin: ff, duracion_dias: dur });
                    }} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Duración (días hábiles)</label>
                <Input className="mt-1" type="number" min={0.5} step={0.5} value={editing.duracion_dias}
                  onChange={(e) => {
                    const dur = Math.max(0.5, Number(e.target.value) || 0.5);
                    const ff = cal.addBusinessDays(new Date(`${editing.fecha_inicio}T00:00:00`), dur);
                    setEditing({ ...editing, duracion_dias: dur, fecha_fin: toISO(ff) });
                  }} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Dependencia de</label>
                <select
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                  value={editing.depende_de ?? ""}
                  onChange={(e) => setEditing({ ...editing, depende_de: e.target.value || null })}
                >
                  <option value="">— Sin dependencia —</option>
                  {actividades.filter((x) => x.id !== editing.id).map((x) => (
                    <option key={x.id} value={x.id}>{x.partida_clave} · {truncate(x.nombre_actividad, 40)}</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">Al seleccionar, la fecha se recorre automáticamente.</p>
              </div>
              <Button onClick={() => applyEdit(editing)} className="w-full" disabled={readonly}>
                <Save className="mr-2 h-4 w-4" /> Aplicar cambios
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BarWithDrag({
  a, cellW, sIdx, span, rowH, fontBody, color, readonly, onMove, onResize, onClick,
}: {
  a: ActividadView; cellW: number; sIdx: number; span: number; rowH: number; fontBody: number;
  color: string; readonly: boolean;
  onMove: (deltaDays: number) => void;
  onResize: (deltaDays: number) => void;
  onClick: () => void;
}) {
  const dragRef = useRef<{ startX: number; mode: "move" | "resize"; lastDelta: number } | null>(null);
  const movedRef = useRef(false);

  function startDrag(e: React.MouseEvent, mode: "move" | "resize") {
    if (readonly) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, mode, lastDelta: 0 };
    movedRef.current = false;
    const onMove2 = (ev: MouseEvent) => {
      const st = dragRef.current; if (!st) return;
      const dx = ev.clientX - st.startX;
      const delta = Math.round(dx / cellW);
      if (delta !== st.lastDelta) {
        const step = delta - st.lastDelta;
        st.lastDelta = delta;
        if (step !== 0) {
          movedRef.current = true;
          if (st.mode === "move") onMove(step);
          else onResize(step);
        }
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove2);
      window.removeEventListener("mouseup", onUp);
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove2);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className={`absolute rounded-sm shadow-sm transition-opacity hover:opacity-90 ${readonly ? "cursor-pointer" : "cursor-move"}`}
      style={{
        left: sIdx * cellW + 1, width: span * cellW - 2,
        top: rowH * 0.2, height: rowH * 0.6, background: color,
      }}
      onMouseDown={(e) => startDrag(e, "move")}
      onClick={(e) => { if (!movedRef.current) onClick(); e.stopPropagation(); }}
      title={`${a.nombre_actividad}\n${fmtFecha(a.fecha_inicio)} → ${fmtFecha(a.fecha_fin)}\n${a.duracion_dias} días`}
    >
      {cellW * span > 60 && (
        <span className="block truncate px-1.5 leading-none text-white"
          style={{ fontSize: Math.max(8, fontBody - 2), paddingTop: Math.max(2, (rowH * 0.6 - fontBody) / 2) }}>
          {a.nombre_actividad}
        </span>
      )}
      {!readonly && (
        <div
          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/20"
          onMouseDown={(e) => startDrag(e, "resize")}
        />
      )}
    </div>
  );
}