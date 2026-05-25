import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, DESPACHO_ID } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Sparkles, CheckCircle2, PencilLine, BarChart2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GanttSettingsDialog } from "./GanttSettingsDialog";
import { GanttView, type ActividadView } from "./GanttView";
import {
  DEFAULT_GANTT_SETTINGS, generarCronograma, toISO,
  type GanttSettings, type ConceptoInput,
} from "@/lib/gantt-engine";

type Cotizacion = {
  id: string; folio: string; nombre_proyecto: string;
};

export function CotizacionGanttTab({ cotizacion }: { cotizacion: Cotizacion }) {
  const qc = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ActividadView[] | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [startDate, setStartDate] = useState("");

  const { data: settingsRow } = useQuery({
    queryKey: ["gantt_settings", DESPACHO_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gantt_settings").select("*").eq("despacho_id", DESPACHO_ID).maybeSingle();
      if (error) throw error;
      return data as GanttSettings | null;
    },
  });
  const settings: GanttSettings = useMemo(
    () => settingsRow ?? { ...DEFAULT_GANTT_SETTINGS, despacho_id: DESPACHO_ID },
    [settingsRow],
  );

  // Default fecha de inicio = hoy + dias_arranque
  useEffect(() => {
    if (startDate) return;
    const d = new Date();
    d.setDate(d.getDate() + (settings.dias_arranque ?? 7));
    setStartDate(toISO(d));
  }, [settings.dias_arranque, startDate]);

  // Actividades persistidas (cuando ya hay cronograma guardado)
  const { data: actividadesDb } = useQuery({
    queryKey: ["cronograma_actividades", cotizacion.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cronograma_actividades")
        .select("*")
        .eq("cotizacion_id", cotizacion.id)
        .order("orden", { ascending: true });
      if (error) throw error;
      return data as ActividadView[];
    },
  });

  const [editorActs, setEditorActs] = useState<ActividadView[] | null>(null);
  const hasSavedCronograma = (actividadesDb ?? []).length > 0;
  const savedStart = actividadesDb?.[0]?.fecha_inicio ?? null;
  const lastSyncedStartRef = useRef<string | null>(null);

  // Cuando hay cronograma guardado, sincroniza el input con la fecha real guardada
  useEffect(() => {
    if (savedStart) {
      setStartDate(savedStart);
      lastSyncedStartRef.current = savedStart;
    }
  }, [savedStart]);

  useEffect(() => {
    // Sincroniza editor con DB cuando no estamos en modo preview/manual
    if (preview || manualMode) return;
    setEditorActs(actividadesDb ?? null);
  }, [actividadesDb, preview, manualMode]);

  async function fetchConceptos(): Promise<ConceptoInput[]> {
    const { data, error } = await supabase
      .from("proyecto_conceptos")
      .select("id, proyecto_id, concepto_id, descripcion, cantidad, unidad, concepto:concepto_id(rendimiento, partida_id, partidas:partida_id(clave, nombre))")
      .eq("proyecto_id", cotizacion.id);
    if (error) throw error;
    return (data ?? []).map((r) => {
      const c = r.concepto as { rendimiento?: number; partidas?: { clave?: string; nombre?: string } } | null;
      return {
        proyecto_id: r.proyecto_id as string,
        concepto_id: r.concepto_id as string,
        descripcion: r.descripcion as string,
        cantidad: Number(r.cantidad) || 0,
        unidad: (r.unidad as string) || "",
        rendimiento: Number(c?.rendimiento) || 1,
        partidaClave: (c?.partidas?.clave ?? "ZZZ").toUpperCase(),
        partidaNombre: c?.partidas?.nombre ?? "Sin partida",
      };
    });
  }

  async function generarPreview() {
    if (!startDate) return toast.error("Selecciona fecha de inicio");
    setGenerating(true);
    try {
      const conceptos = await fetchConceptos();
      if (conceptos.length === 0) { toast.error("Sin conceptos en la cotización"); return; }
      const start = new Date(`${startDate}T00:00:00`);
      if (isNaN(start.getTime())) { toast.error("Fecha inválida"); return; }
      const drafts = generarCronograma(conceptos, start, settings);
      const preview: ActividadView[] = drafts.map((d, i) => ({
        id: `preview-${i}`,
        proyecto_id: d.proyecto_id,
        cotizacion_id: cotizacion.id,
        concepto_id: d.concepto_id,
        nombre_actividad: d.nombre_actividad,
        partida: d.partida,
        partida_clave: d.partida_clave,
        fecha_inicio: d.fecha_inicio,
        fecha_fin: d.fecha_fin,
        duracion_dias: d.duracion_dias,
        factor_holgura: d.factor_holgura,
        orden: d.orden,
      }));
      setPreview(preview);
      setManualMode(false);
      toast.success(`Preview generado (${preview.length} actividades)`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function confirmarGuardar() {
    if (!preview) return;
    setSaving(true);
    try {
      const { error: dErr } = await supabase
        .from("cronograma_actividades").delete().eq("cotizacion_id", cotizacion.id);
      if (dErr) throw dErr;
      const rows = preview.map(({ id: _id, ...rest }) => rest);
      const { error } = await supabase.from("cronograma_actividades").insert(rows);
      if (error) throw error;
      toast.success("Cronograma guardado");
      setPreview(null);
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["cronograma_actividades", cotizacion.id] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Desplaza todas las actividades manteniendo duraciones/dependencias
  async function shiftAllDates(newStartIso: string) {
    if (!actividadesDb || actividadesDb.length === 0 || !savedStart) return;
    const oldD = new Date(`${savedStart}T00:00:00`);
    const newD = new Date(`${newStartIso}T00:00:00`);
    if (isNaN(newD.getTime())) return;
    const delta = Math.round((newD.getTime() - oldD.getTime()) / 86400000);
    if (delta === 0) return;
    try {
      for (const a of actividadesDb) {
        const fi = new Date(`${a.fecha_inicio}T00:00:00`); fi.setDate(fi.getDate() + delta);
        const ff = new Date(`${a.fecha_fin}T00:00:00`); ff.setDate(ff.getDate() + delta);
        const { error } = await supabase
          .from("cronograma_actividades")
          .update({ fecha_inicio: toISO(fi), fecha_fin: toISO(ff) })
          .eq("id", a.id);
        if (error) throw error;
      }
      lastSyncedStartRef.current = newStartIso;
      toast.success("Fechas actualizadas");
      qc.invalidateQueries({ queryKey: ["cronograma_actividades", cotizacion.id] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  // Recalcula con nuevos settings (mantiene fecha de inicio guardada)
  async function recalcularConSettings(nuevos: GanttSettings) {
    if (!hasSavedCronograma) return;
    const startIso = savedStart ?? startDate;
    if (!startIso) return;
    try {
      const conceptos = await fetchConceptos();
      if (conceptos.length === 0) return;
      const start = new Date(`${startIso}T00:00:00`);
      const drafts = generarCronograma(conceptos, start, nuevos);
      await supabase.from("cronograma_actividades").delete().eq("cotizacion_id", cotizacion.id);
      const { error } = await supabase.from("cronograma_actividades").insert(drafts);
      if (error) throw error;
      toast.success("Cronograma actualizado con nueva configuración");
      qc.invalidateQueries({ queryKey: ["cronograma_actividades", cotizacion.id] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function regenerarConfirmado() {
    setConfirmRegenOpen(false);
    await generarPreview();
  }

  async function iniciarManual() {
    setGenerating(true);
    try {
      const conceptos = await fetchConceptos();
      if (conceptos.length === 0) { toast.error("Sin conceptos"); return; }
      const start = new Date(`${startDate}T00:00:00`);
      const startIso = toISO(start);
      const rows: ActividadView[] = conceptos.map((c, i) => ({
        id: `manual-${i}`,
        proyecto_id: c.proyecto_id,
        cotizacion_id: cotizacion.id,
        concepto_id: c.concepto_id,
        nombre_actividad: c.descripcion,
        partida: c.partidaNombre,
        partida_clave: c.partidaClave,
        fecha_inicio: startIso,
        fecha_fin: startIso,
        duracion_dias: 1,
        factor_holgura: settings.factor_holgura,
        orden: i,
      }));
      setPreview(null);
      setManualMode(true);
      setEditorActs(rows);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function guardarEditor() {
    if (!editorActs) return;
    setSaving(true);
    try {
      // Si vienen de DB → UPDATE en batch; si vienen de modo manual → DELETE+INSERT.
      const fromManual = editorActs.some((a) => a.id.startsWith("manual-"));
      if (fromManual) {
        await supabase.from("cronograma_actividades").delete().eq("cotizacion_id", cotizacion.id);
        const rows = editorActs.map(({ id: _id, ...rest }) => rest);
        const { error } = await supabase.from("cronograma_actividades").insert(rows);
        if (error) throw error;
        setManualMode(false);
      } else {
        for (const a of editorActs) {
          const { error } = await supabase
            .from("cronograma_actividades")
            .update({
              nombre_actividad: a.nombre_actividad,
              fecha_inicio: a.fecha_inicio,
              fecha_fin: a.fecha_fin,
              duracion_dias: a.duracion_dias,
            })
            .eq("id", a.id);
          if (error) throw error;
        }
      }
      toast.success("Cambios guardados");
      qc.invalidateQueries({ queryKey: ["cronograma_actividades", cotizacion.id] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const showPreview = !!preview;
  const showEditor = !showPreview && (manualMode || hasSavedCronograma) && editorActs && editorActs.length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">{cotizacion.folio} · {cotizacion.nombre_proyecto}</h2>
            <p className="text-[11px] text-muted-foreground">Cronograma estimado paramétrico</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4 mr-1" /> Settings
            </Button>
            {hasSavedCronograma && !showPreview && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => setConfirmRegenOpen(true)}
                      disabled={generating}
                    >
                      <BarChart2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Regenerar cronograma</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="text-[11px] text-muted-foreground">Fecha de inicio de obra</label>
            <Input
              type="date"
              className="h-9 w-44"
              value={startDate}
              onChange={(e) => {
                const v = e.target.value;
                setStartDate(v);
                if (hasSavedCronograma && v && v !== lastSyncedStartRef.current) {
                  void shiftAllDates(v);
                }
              }}
            />
          </div>
          {!hasSavedCronograma && (
            <Button size="lg" onClick={generarPreview} disabled={generating}>
              <Sparkles className="h-4 w-4 mr-2" />
              {generating ? "Generando…" : "📅 Generar preview Gantt IA"}
            </Button>
          )}
        </div>
      </div>

      {showPreview && preview && (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">Preview · no guardado</span>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Descartar</Button>
          </div>
          <GanttView
            actividades={preview}
            settings={settings}
            onChange={setPreview}
            readonly={false}
          />
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button size="lg" onClick={() => setConfirmOpen(true)}>
              <CheckCircle2 className="h-5 w-5 mr-2" /> Usar este cronograma
            </Button>
            <Button size="lg" variant="outline" onClick={iniciarManual}>
              <PencilLine className="h-5 w-5 mr-2" /> Prefiero llenarlo manualmente
            </Button>
          </div>
        </div>
      )}

      {!showPreview && showEditor && editorActs && (
        <GanttView
          actividades={editorActs}
          settings={settings}
          onChange={setEditorActs}
          onSave={guardarEditor}
          saving={saving}
        />
      )}

      {!showPreview && !showEditor && (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Aún no hay cronograma. Genera el preview con IA o configura uno manual.
        </div>
      )}

      <GanttSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSaved={(nuevos) => {
          qc.invalidateQueries({ queryKey: ["gantt_settings", DESPACHO_ID] });
          void recalcularConSettings(nuevos);
        }}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar cronograma</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              El cronograma generado es una estimación paramétrica basada en rendimientos promedio. Los tiempos reales pueden variar según condiciones de obra, disponibilidad de materiales y criterio del despacho. Úsalo como punto de partida, no como compromiso contractual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarGuardar} disabled={saving}>
              {saving ? "Guardando…" : "Confirmar y guardar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRegenOpen} onOpenChange={setConfirmRegenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Regenerar cronograma?</AlertDialogTitle>
            <AlertDialogDescription>
              Se perderán los ajustes manuales realizados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={regenerarConfirmado}>Regenerar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}