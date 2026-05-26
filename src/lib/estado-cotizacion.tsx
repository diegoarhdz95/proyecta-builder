import type { ReactNode } from "react";

export type EstadoValue = "borrador" | "en_revision" | "enviada" | "aceptada" | "rechazada";

export const ESTADOS: { value: EstadoValue; label: string; cls: string; dot: string }[] = [
  { value: "borrador",    label: "Borrador",    cls: "bg-gray-100 text-gray-700 hover:bg-gray-200",       dot: "bg-gray-400" },
  { value: "en_revision", label: "En revisión", cls: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200", dot: "bg-yellow-500" },
  { value: "enviada",     label: "Enviada",     cls: "bg-blue-100 text-blue-700 hover:bg-blue-200",       dot: "bg-blue-500" },
  { value: "aceptada",    label: "Aceptada",    cls: "bg-green-100 text-green-700 hover:bg-green-200",    dot: "bg-green-500" },
  { value: "rechazada",   label: "Rechazada",   cls: "bg-red-100 text-red-700 hover:bg-red-200",          dot: "bg-red-500" },
];

export function estadoMeta(value?: string | null) {
  // map legacy "aprobada" -> "aceptada"
  const v = value === "aprobada" ? "aceptada" : value;
  return ESTADOS.find((e) => e.value === v) ?? ESTADOS[0];
}

export function EstadoBadge({
  value,
  className = "",
  children,
}: {
  value?: string | null;
  className?: string;
  children?: ReactNode;
}) {
  const meta = estadoMeta(value);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${meta.cls} ${className}`}
    >
      {children ?? meta.label}
    </span>
  );
}