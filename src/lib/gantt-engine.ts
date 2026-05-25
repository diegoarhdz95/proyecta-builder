// Motor de generación y utilidades del Gantt, configurable por despacho.

export type GanttSettings = {
  despacho_id: string;
  trabaja_sabado: boolean;
  sabado_medio_dia: boolean;
  trabaja_domingo: boolean;
  horario_nocturno: boolean;
  factor_holgura: number;
  dias_arranque: number;
  festivos_personalizados: string[]; // ISO yyyy-mm-dd
};

export const DEFAULT_GANTT_SETTINGS: GanttSettings = {
  despacho_id: "",
  trabaja_sabado: true,
  sabado_medio_dia: true,
  trabaja_domingo: false,
  horario_nocturno: false,
  factor_holgura: 1.2,
  dias_arranque: 7,
  festivos_personalizados: [],
};

export const PARTIDA_ORDER = [
  "PRE","DEM","EST","ALB","HID","SAN","ELE",
  "ACO","VOZ","ACB","PIS","REC","PIN","ILU",
  "CAR","HER","CAN","MOB","SUP","LIM",
];

/**
 * Secuencia constructiva. Cada partida arranca al máximo fin de sus deps.
 * - PRE → DEM → EST → ALB
 * - HID/SAN/ELE/ACO/VOZ tras ALB (en paralelo entre sí)
 * - ACB tras ALB+HID+ELE+SAN
 * - PIN tras ACB; CAR/HER/CAN/ILU tras PIN (paralelo); MOB tras CAR
 * - LIM siempre última; SUP/GER cubren todo el proyecto
 */
export const PARTIDA_DEPS: Record<string, string[]> = {
  PRE: [],
  DEM: ["PRE"],
  EST: ["DEM"],
  ALB: ["DEM", "EST"],
  HID: ["ALB"],
  SAN: ["ALB"],
  ELE: ["ALB"],
  ACO: ["ALB"],
  VOZ: ["ALB"],
  ACB: ["ALB", "HID", "ELE", "SAN"],
  PIS: ["ALB"],
  REC: ["ALB"],
  PIN: ["ACB"],
  ILU: ["PIN"],
  CAR: ["PIN"],
  HER: ["PIN"],
  CAN: ["PIN"],
  MOB: ["CAR"],
};

export const SPAN_ALL = new Set(["SUP", "GER"]);
export const ALWAYS_LAST = "LIM";

export const PARTIDA_COLORS: Record<string, string> = {
  PRE: "#9ca3af", DEM: "#dc2626", EST: "#78350f", ALB: "#f97316",
  HID: "#2563eb", SAN: "#166534", ELE: "#eab308", ACO: "#38bdf8",
  ACB: "#7c3aed", PIS: "#86efac", REC: "#f9a8d4", PIN: "#fdba74",
  ILU: "#d4af37", CAR: "#b08968", HER: "#374151", CAN: "#93c5fd",
  LIM: "#6ee7b7", VOZ: "#7c3aed", MOB: "#a21caf", SUP: "#16a34a",
  GER: "#0ea5e9",
};

export function colorFor(clave: string | null) {
  if (!clave) return "#64748b";
  return PARTIDA_COLORS[clave.toUpperCase()] ?? "#64748b";
}

export function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function mxHolidaysForYear(year: number): Set<string> {
  const iso = (m: number, d: number) =>
    `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const feb = new Date(year, 1, 1);
  const firstMonFeb = 1 + ((1 - feb.getDay() + 7) % 7);
  const mar = new Date(year, 2, 1);
  const firstMonMar = 1 + ((1 - mar.getDay() + 7) % 7);
  const thirdMonMar = firstMonMar + 14;
  const nov = new Date(year, 10, 1);
  const firstMonNov = 1 + ((1 - nov.getDay() + 7) % 7);
  const thirdMonNov = firstMonNov + 14;
  return new Set([
    iso(1, 1),
    iso(2, firstMonFeb),
    iso(3, thirdMonMar),
    iso(5, 1),
    iso(9, 16),
    iso(11, thirdMonNov),
    iso(12, 25),
  ]);
}

export class Calendar {
  private holidayCache = new Map<number, Set<string>>();
  private customHolidays: Set<string>;
  constructor(public settings: GanttSettings) {
    this.customHolidays = new Set(settings.festivos_personalizados ?? []);
  }
  isHoliday(d: Date): boolean {
    const y = d.getFullYear();
    let s = this.holidayCache.get(y);
    if (!s) {
      s = mxHolidaysForYear(y);
      this.holidayCache.set(y, s);
    }
    const key = toISO(d);
    return s.has(key) || this.customHolidays.has(key);
  }
  /** Peso del día: Lun–Vie = 1; Sáb = 0/0.5/1; Dom = 0/1; festivo = 0.
   *  Horario nocturno multiplica capacidad por 1.4 (más rendimiento). */
  dayWeight(d: Date): number {
    if (this.isHoliday(d)) return 0;
    const g = d.getDay();
    let base: number;
    if (g === 0) base = this.settings.trabaja_domingo ? 1 : 0;
    else if (g === 6) {
      base = this.settings.trabaja_sabado
        ? this.settings.sabado_medio_dia ? 0.5 : 1
        : 0;
    } else base = 1;
    if (base > 0 && this.settings.horario_nocturno) base *= 1.4;
    return base;
  }
  isNonWorking(d: Date) { return this.dayWeight(d) === 0; }
  nextBusinessDay(d: Date) {
    const r = new Date(d);
    while (this.isNonWorking(r)) r.setDate(r.getDate() + 1);
    return r;
  }
  addBusinessDays(d: Date, n: number) {
    const r = new Date(d);
    let left = n;
    let guard = 0;
    while (left > 0 && guard++ < 3650) {
      r.setDate(r.getDate() + 1);
      left -= this.dayWeight(r);
    }
    return r;
  }
  businessDaysBetween(a: Date, b: Date) {
    if (b <= a) return 1;
    let n = 0;
    const cur = new Date(a);
    while (cur < b) {
      n += this.dayWeight(cur);
      cur.setDate(cur.getDate() + 1);
    }
    return Math.max(0.5, Math.round(n * 2) / 2);
  }
}

const clamp = (a: number, v: number, b: number) => Math.max(a, Math.min(b, v));

export type ConceptoInput = {
  proyecto_id: string;
  concepto_id: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  rendimiento: number;
  partidaClave: string;
  partidaNombre: string;
};

export type ActividadDraft = {
  proyecto_id: string;
  cotizacion_id: string;
  concepto_id: string;
  nombre_actividad: string;
  partida: string;
  partida_clave: string;
  fecha_inicio: string;
  fecha_fin: string;
  duracion_dias: number;
  factor_holgura: number;
  orden: number;
};

export function generarCronograma(
  conceptos: ConceptoInput[],
  startDate: Date,
  settings: GanttSettings,
): ActividadDraft[] {
  const cal = new Calendar(settings);
  const HOLGURA = clamp(1.0, Number(settings.factor_holgura) || 1.2, 2.0);
  const projectStart = cal.nextBusinessDay(startDate);

  const grupos = new Map<string, ConceptoInput[]>();
  for (const f of conceptos) {
    if (!grupos.has(f.partidaClave)) grupos.set(f.partidaClave, []);
    grupos.get(f.partidaClave)!.push(f);
  }

  function dur(it: ConceptoInput): number {
    const u = (it.unidad || "").trim().toLowerCase();
    if (u === "mes" || u === "meses") return Math.max(1, it.cantidad * 22);
    if (u === "sem" || u === "semana" || u === "semanas")
      return Math.max(0.5, it.cantidad * 5.5);
    if (u === "%") return 0;
    const base = it.rendimiento > 0 ? it.cantidad / it.rendimiento : it.cantidad;
    return Math.max(0.5, Math.round(base * HOLGURA * 2) / 2);
  }

  const presentes = new Set(grupos.keys());
  const ordered = [
    ...PARTIDA_ORDER.filter((c) => presentes.has(c) && c !== ALWAYS_LAST && !SPAN_ALL.has(c)),
    ...Array.from(presentes).filter(
      (c) => !PARTIDA_ORDER.includes(c) && c !== ALWAYS_LAST && !SPAN_ALL.has(c),
    ),
  ];

  const partidaFinish = new Map<string, Date>();
  const out: ActividadDraft[] = [];
  let orden = 0;

  const earliestFor = (clave: string) => {
    const deps = PARTIDA_DEPS[clave] ?? [];
    let max = new Date(projectStart);
    for (const d of deps) {
      const f = partidaFinish.get(d);
      if (f && f > max) max = new Date(f);
    }
    return cal.nextBusinessDay(max);
  };

  const scheduleSeq = (items: ConceptoInput[], start: Date, clave: string, nombre: string) => {
    let cursor = new Date(start);
    let maxFin = new Date(start);
    for (const it of items) {
      const dias = dur(it);
      const fi = cal.nextBusinessDay(cursor);
      const ff = cal.addBusinessDays(fi, dias);
      out.push({
        proyecto_id: it.proyecto_id,
        cotizacion_id: it.proyecto_id,
        concepto_id: it.concepto_id,
        nombre_actividad: it.descripcion,
        partida: nombre,
        partida_clave: clave,
        fecha_inicio: toISO(fi),
        fecha_fin: toISO(ff),
        duracion_dias: dias,
        factor_holgura: HOLGURA,
        orden: orden++,
      });
      cursor = cal.nextBusinessDay(ff);
      if (ff > maxFin) maxFin = ff;
    }
    return maxFin;
  };

  for (const clave of ordered) {
    const items = grupos.get(clave)!;
    const nombre = items[0]?.partidaNombre ?? clave;
    const es = earliestFor(clave);

    const mesItems = items.filter((it) =>
      /^mes(es)?$/.test((it.unidad || "").trim().toLowerCase()),
    );
    const pctItems = items.filter((it) => (it.unidad || "").trim() === "%");
    const normales = items.filter(
      (it) => !mesItems.includes(it) && !pctItems.includes(it),
    );

    let maxFin = new Date(es);

    if (clave === "ALB") {
      const isFirme = (s: string) => /firme|losa/i.test(s);
      const isMuro = (s: string) => /muro/i.test(s);
      const firmes = normales.filter((it) => isFirme(it.descripcion));
      const muros = normales.filter((it) => isMuro(it.descripcion) && !isFirme(it.descripcion));
      const otros = normales.filter(
        (it) => !isFirme(it.descripcion) && !isMuro(it.descripcion),
      );
      let f = es;
      if (firmes.length) f = scheduleSeq(firmes, f, clave, nombre);
      if (otros.length) {
        const fo = scheduleSeq(otros, f, clave, nombre);
        if (fo > f) f = fo;
      }
      if (muros.length) {
        const fm = scheduleSeq(muros, cal.nextBusinessDay(f), clave, nombre);
        if (fm > f) f = fm;
      }
      maxFin = f;
    } else if (normales.length) {
      maxFin = scheduleSeq(normales, es, clave, nombre);
    }

    for (const it of mesItems) {
      const dias = dur(it);
      const fi = cal.nextBusinessDay(projectStart);
      const ff = cal.addBusinessDays(fi, dias);
      out.push({
        proyecto_id: it.proyecto_id,
        cotizacion_id: it.proyecto_id,
        concepto_id: it.concepto_id,
        nombre_actividad: it.descripcion,
        partida: nombre,
        partida_clave: clave,
        fecha_inicio: toISO(fi),
        fecha_fin: toISO(ff),
        duracion_dias: dias,
        factor_holgura: HOLGURA,
        orden: orden++,
      });
      if (ff > maxFin) maxFin = ff;
    }

    pctItems.forEach((it) => {
      out.push({
        proyecto_id: it.proyecto_id,
        cotizacion_id: it.proyecto_id,
        concepto_id: it.concepto_id,
        nombre_actividad: it.descripcion,
        partida: nombre,
        partida_clave: clave,
        fecha_inicio: toISO(projectStart),
        fecha_fin: toISO(projectStart),
        duracion_dias: 0,
        factor_holgura: HOLGURA,
        orden: orden++,
      });
    });

    partidaFinish.set(clave, maxFin);
  }

  let projectEnd = new Date(projectStart);
  for (const f of partidaFinish.values()) if (f > projectEnd) projectEnd = f;

  if (grupos.has(ALWAYS_LAST)) {
    const items = grupos.get(ALWAYS_LAST)!;
    const nombre = items[0]?.partidaNombre ?? ALWAYS_LAST;
    const limStart = cal.nextBusinessDay(projectEnd);
    const finLim = scheduleSeq(items, limStart, ALWAYS_LAST, nombre);
    partidaFinish.set(ALWAYS_LAST, finLim);
    if (finLim > projectEnd) projectEnd = finLim;
  }

  for (const clave of Array.from(SPAN_ALL)) {
    if (!grupos.has(clave)) continue;
    const items = grupos.get(clave)!;
    const nombre = items[0]?.partidaNombre ?? clave;
    for (const it of items) {
      const dias = cal.businessDaysBetween(projectStart, projectEnd);
      out.push({
        proyecto_id: it.proyecto_id,
        cotizacion_id: it.proyecto_id,
        concepto_id: it.concepto_id,
        nombre_actividad: it.descripcion,
        partida: nombre,
        partida_clave: clave,
        fecha_inicio: toISO(projectStart),
        fecha_fin: toISO(projectEnd),
        duracion_dias: dias,
        factor_holgura: HOLGURA,
        orden: orden++,
      });
    }
  }

  // % spans completos
  const totalDias = cal.businessDaysBetween(projectStart, projectEnd);
  for (const a of out) {
    const it = conceptos.find(
      (f) => f.concepto_id === a.concepto_id && f.descripcion === a.nombre_actividad,
    );
    if (it && (it.unidad || "").trim() === "%") {
      a.fecha_inicio = toISO(projectStart);
      a.fecha_fin = toISO(projectEnd);
      a.duracion_dias = totalDias;
    }
  }

  return out;
}