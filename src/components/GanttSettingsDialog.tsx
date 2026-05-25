import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { GanttSettings } from "@/lib/gantt-engine";

export function GanttSettingsDialog({
  open,
  onOpenChange,
  settings,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  settings: GanttSettings;
  onSaved: (s: GanttSettings) => void;
}) {
  const [s, setS] = useState<GanttSettings>(settings);
  const [nuevoFestivo, setNuevoFestivo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setS(settings); }, [settings, open]);

  async function guardar() {
    setSaving(true);
    const { error } = await supabase
      .from("gantt_settings")
      .upsert({
        despacho_id: s.despacho_id,
        trabaja_sabado: s.trabaja_sabado,
        sabado_medio_dia: s.sabado_medio_dia,
        trabaja_domingo: s.trabaja_domingo,
        horario_nocturno: s.horario_nocturno,
        factor_holgura: s.factor_holgura,
        dias_arranque: s.dias_arranque,
        festivos_personalizados: s.festivos_personalizados,
        updated_at: new Date().toISOString(),
      });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configuración guardada");
    onSaved(s);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuración del despacho · Gantt</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-3 rounded-md border p-4">
            <Toggle label="Trabaja sábado" value={s.trabaja_sabado} onChange={(v) => setS({ ...s, trabaja_sabado: v })} />
            <Toggle label="Sábado medio día" value={s.sabado_medio_dia} onChange={(v) => setS({ ...s, sabado_medio_dia: v })} />
            <Toggle label="Trabaja domingo" value={s.trabaja_domingo} onChange={(v) => setS({ ...s, trabaja_domingo: v })} />
            <Toggle label="Horario nocturno" value={s.horario_nocturno} onChange={(v) => setS({ ...s, horario_nocturno: v })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Factor de holgura</label>
              <Input
                type="number" min={1} max={2} step={0.05}
                value={s.factor_holgura}
                onChange={(e) => setS({ ...s, factor_holgura: Number(e.target.value) || 1.2 })}
              />
              <p className="text-[10px] text-muted-foreground mt-1">1.00 a 2.00</p>
            </div>
            <div>
              <label className="text-xs font-medium">Días de arranque</label>
              <Input
                type="number" min={0} max={90}
                value={s.dias_arranque}
                onChange={(e) => setS({ ...s, dias_arranque: Number(e.target.value) || 0 })}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Hoy + N días = default</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium">Festivos personalizados</label>
            <div className="flex gap-2">
              <Input type="date" value={nuevoFestivo} onChange={(e) => setNuevoFestivo(e.target.value)} />
              <Button
                size="sm" variant="outline"
                onClick={() => {
                  if (!nuevoFestivo) return;
                  if (s.festivos_personalizados.includes(nuevoFestivo)) return;
                  setS({ ...s, festivos_personalizados: [...s.festivos_personalizados, nuevoFestivo].sort() });
                  setNuevoFestivo("");
                }}
              >
                <Plus className="h-3.5 w-3.5" />Agregar
              </Button>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto rounded-md border p-2">
              {s.festivos_personalizados.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">Sin festivos personalizados</p>
              )}
              {s.festivos_personalizados.map((f) => (
                <div key={f} className="flex items-center justify-between text-sm px-2 py-1 hover:bg-muted/50 rounded">
                  <span className="tabular-nums">{f}</span>
                  <button
                    onClick={() => setS({ ...s, festivos_personalizados: s.festivos_personalizados.filter((x) => x !== f) })}
                    className="text-destructive hover:opacity-70"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}><Save className="mr-1 h-4 w-4" />Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}