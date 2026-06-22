import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://oysxpzlchnzcdghhdfit.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95c3hwemxjaG56Y2RnaGhkZml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMzgxNTYsImV4cCI6MjA5NDkxNDE1Nn0.PPGZRAxSi5p_o1ZDqQT3tIziLuHcqgb-DxWL7mfVGT4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const DESPACHO_ID = "0905a074-4326-4773-8eaf-6ad46e01f304";
export const DESPACHO_NOMBRE = "Grupo Proyecta";
export const IVA_RATE = 0.16;

export type Proyecto = {
  id: string;
  despacho_id: string;
  tipo_proyecto_id: string | null;
  obra_id: string | null;
  folio: string;
  nombre_proyecto: string;
  cliente_nombre: string;
  cliente_email: string | null;
  domicilio_obra?: string | null;
  subtotal: number;
  iva: number;
  total_con_iva: number;
  estado: "borrador" | "en_revision" | "enviada" | "aceptada" | "aprobada" | "rechazada";
  tiempo_ejecucion_texto?: string | null;
  tiempo_ejecucion_incluir?: boolean | null;
};

export type TipoProyecto = {
  id: string;
  nombre: string;
};

export type Obra = {
  id: string;
  despacho_id: string;
  nombre: string;
  cliente_nombre: string;
  cliente_email: string | null;
  cliente_telefono: string | null;
  domicilio: string | null;
  tipo_proyecto_id: string | null;
  descripcion: string | null;
  estado: "activo" | "pausado" | "terminado";
  created_at: string;
};

export type Partida = {
  id: string;
  clave: string;
  nombre: string;
  orden: number;
};

export type Concepto = {
  id: string;
  partida_id: string;
  clave: string;
  descripcion: string;
  unidad: string;
  precio_unitario: number;
};

export type ProyectoConcepto = {
  id: string;
  proyecto_id: string;
  proyecto_partida_id: string;
  concepto_id: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_unitario_final: number;
  subtotal: number;
};

export type Material = {
  id: string;
  despacho_id: string;
  nombre: string;
  categoria: string | null;
  unidad: string;
  precio_unitario: number;
  created_at?: string;
  updated_at?: string;
};

export type ConceptoApu = {
  id: string;
  proyecto_concepto_id: string;
  material_id: string;
  rendimiento: number;
};

export type PersonalCategoria = "destajista" | "contratista";

export type Personal = {
  id: string;
  despacho_id: string;
  nombre: string;
  categoria: PersonalCategoria;
  especialidad: string | null;
  telefono: string | null;
  notas: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PersonalProyecto = {
  id: string;
  personal_id: string;
  proyecto_id: string;
  actividad: string | null;
  monto_acordado: number;
  notas: string | null;
  created_at?: string;
};

export type PagoPersonal = {
  id: string;
  personal_id: string;
  proyecto_id: string;
  concepto: string;
  monto: number;
  fecha_pago: string;
  metodo_pago: string | null;
  notas: string | null;
  numero_recibo: number | null;
  acepta_token: string;
  aceptado_at: string | null;
  aceptado_ip: string | null;
  created_at?: string;
};