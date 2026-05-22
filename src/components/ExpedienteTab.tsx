import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Upload, Trash2, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

const BUCKET = "expediente";

const CATEGORIAS = [
  { value: "imagenes", label: "Imágenes del sitio" },
  { value: "planos", label: "Planos" },
  { value: "permisos", label: "Permisos y licencias" },
  { value: "normativas", label: "Normativas" },
] as const;

type Archivo = {
  id: string;
  obra_id: string;
  categoria: string;
  nombre: string;
  url: string;
  tipo: string;
  created_at: string;
};

export function ExpedienteTab({ obraId }: { obraId: string }) {
  const [cat, setCat] = useState<string>("imagenes");
  return (
    <Tabs value={cat} onValueChange={setCat}>
      <TabsList>
        {CATEGORIAS.map((c) => (
          <TabsTrigger key={c.value} value={c.value}>{c.label}</TabsTrigger>
        ))}
      </TabsList>
      {CATEGORIAS.map((c) => (
        <TabsContent key={c.value} value={c.value} className="mt-6">
          <CategoriaPanel obraId={obraId} categoria={c.value} label={c.label} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function CategoriaPanel({ obraId, categoria, label }: { obraId: string; categoria: string; label: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: archivos, isLoading } = useQuery({
    queryKey: ["expediente", obraId, categoria],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expediente_archivos")
        .select("*")
        .eq("obra_id", obraId)
        .eq("categoria", categoria)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Archivo[];
    },
  });

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() ?? "";
        const path = `${obraId}/${categoria}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const { error: insErr } = await supabase.from("expediente_archivos").insert({
          obra_id: obraId,
          categoria,
          nombre: file.name,
          url: pub.publicUrl,
          tipo: file.type,
        });
        if (insErr) throw insErr;
      }
      toast.success("Archivo(s) subido(s)");
      qc.invalidateQueries({ queryKey: ["expediente", obraId, categoria] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function eliminar(a: Archivo) {
    if (!confirm(`¿Eliminar "${a.nombre}"?`)) return;
    const marker = `/${BUCKET}/`;
    const idx = a.url.indexOf(marker);
    const path = idx >= 0 ? a.url.slice(idx + marker.length) : "";
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    const { error } = await supabase.from("expediente_archivos").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Archivo eliminado");
    qc.invalidateQueries({ queryKey: ["expediente", obraId, categoria] });
  }

  async function descargar(a: Archivo) {
    try {
      const res = await fetch(a.url);
      const blob = await res.blob();
      const u = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = u;
      link.download = a.nombre;
      link.click();
      URL.revokeObjectURL(u);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const esImagen = (t: string) => t?.startsWith("image/");
  const imagenes = (archivos ?? []).filter((a) => esImagen(a.tipo));
  const pdfs = (archivos ?? []).filter((a) => !esImagen(a.tipo));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{label}</h3>
          <p className="text-xs text-muted-foreground">JPG, PNG o PDF</p>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,application/pdf"
            className="hidden"
            onChange={(e) => onUpload(e.target.files)}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Subir archivos
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {!isLoading && (archivos?.length ?? 0) === 0 && (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Aún no hay archivos en {label.toLowerCase()}.
        </div>
      )}

      {imagenes.length > 0 && (
        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Imágenes</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {imagenes.map((a) => (
              <div key={a.id} className="group relative overflow-hidden rounded-lg border bg-card">
                <a href={a.url} target="_blank" rel="noreferrer" className="block aspect-square">
                  <img src={a.url} alt={a.nombre} className="h-full w-full object-cover" />
                </a>
                <div className="flex items-center justify-between gap-1 border-t p-2">
                  <p className="truncate text-xs" title={a.nombre}>{a.nombre}</p>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => descargar(a)} aria-label="Descargar">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => eliminar(a)} aria-label="Eliminar">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {pdfs.length > 0 && (
        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documentos</h4>
          <ul className="divide-y rounded-lg border bg-card">
            {pdfs.map((a) => (
              <li key={a.id} className="flex items-center gap-3 p-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <a href={a.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-sm hover:underline">
                  {a.nombre}
                </a>
                <Button variant="ghost" size="icon" onClick={() => descargar(a)} aria-label="Descargar">
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => eliminar(a)} aria-label="Eliminar">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}