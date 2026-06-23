/**
 * Devuelve el origen público estable para construir enlaces compartibles
 * (recibos, QR, etc.). Evita que se usen las URLs internas del editor
 * (lovable.dev, id-preview--*.lovable.app) que exigen login.
 */
const PUBLISHED_ORIGIN = "https://proyecta-studio.lovable.app";

export function getPublicSiteUrl(): string {
  const fromEnv = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  if (typeof window === "undefined") return PUBLISHED_ORIGIN;

  const { origin, hostname } = window.location;
  // Editor / previews requieren login → forzamos el dominio publicado.
  const isEditorOrPreview =
    hostname.endsWith("lovable.dev") ||
    hostname.startsWith("id-preview--") ||
    hostname.includes("-preview--");

  return isEditorOrPreview ? PUBLISHED_ORIGIN : origin;
}