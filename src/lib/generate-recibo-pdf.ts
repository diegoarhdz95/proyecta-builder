import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const NAVY: [number, number, number] = [15, 23, 66];
const MUTED: [number, number, number] = [110, 116, 130];

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

function sanitizeFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

async function loadImageAsDataUrl(
  url: string,
): Promise<{ dataUrl: string; width: number; height: number; format: "PNG" | "JPEG" } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const format: "PNG" | "JPEG" = /png/i.test(blob.type) ? "PNG" : "JPEG";
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const dim = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 200, height: 80 });
      img.src = dataUrl;
    });
    return { dataUrl, ...dim, format };
  } catch {
    return null;
  }
}

export type ReciboOpts = {
  despacho: { nombre: string; logo_url: string | null };
  numeroRecibo: number;
  proyectoNombre: string;
  folio: string;
  clienteNombre: string;
  monto: number;
  concepto: string;
  fechaPago: string; // ISO yyyy-mm-dd
  metodoPago?: string | null;
  notas?: string | null;
};

export async function generateReciboPDF(
  opts: ReciboOpts,
): Promise<{ filename: string; blob: Blob; numeroStr: string }> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 56;

  // Top accent
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 6, "F");

  // Logo (opcional)
  if (opts.despacho.logo_url) {
    const logo = await loadImageAsDataUrl(opts.despacho.logo_url);
    if (logo) {
      const maxW = 140, maxH = 60;
      const ratio = Math.min(maxW / logo.width, maxH / logo.height);
      const w = logo.width * ratio;
      const h = logo.height * ratio;
      try { doc.addImage(logo.dataUrl, logo.format, margin, margin, w, h); }
      catch { /* ignore image errors */ }
    }
  }

  // Datos del despacho (esquina superior derecha)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(opts.despacho.nombre.toUpperCase(), pageW - margin, margin + 12, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("Despacho de Arquitectura", pageW - margin, margin + 26, { align: "right" });

  // Título del recibo + número/fecha
  const titleY = margin + 110;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...NAVY);
  doc.text("RECIBO DE PAGO", margin, titleY);
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1);
  doc.line(margin, titleY + 8, margin + 80, titleY + 8);

  const numeroStr = String(opts.numeroRecibo).padStart(5, "0");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("N° DE RECIBO", pageW - margin, titleY - 20, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text(`#${numeroStr}`, pageW - margin, titleY, { align: "right" });

  const fechaTxt = new Date(`${opts.fechaPago}T00:00:00`).toLocaleDateString("es-MX", {
    day: "2-digit", month: "long", year: "numeric",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Fecha: ${fechaTxt}`, pageW - margin, titleY + 18, { align: "right" });

  // Tabla de detalle
  autoTable(doc, {
    startY: titleY + 44,
    body: [
      ["Cliente", opts.clienteNombre || "—"],
      ["Proyecto", opts.proyectoNombre || "—"],
      ["Folio cotización", opts.folio || "—"],
      ["Concepto", opts.concepto || "—"],
      ["Método de pago", opts.metodoPago || "—"],
      ["Fecha de pago", fechaTxt],
    ],
    styles: { font: "helvetica", fontSize: 10, cellPadding: 8, textColor: [40, 40, 40] },
    columnStyles: {
      0: { fontStyle: "bold", textColor: NAVY, cellWidth: 140, fillColor: [248, 249, 252] },
      1: { cellWidth: "auto" },
    },
    margin: { left: margin, right: margin },
    theme: "grid",
  });

  // @ts-expect-error lastAutoTable injected by plugin
  let y: number = doc.lastAutoTable.finalY + 24;

  // Caja de monto
  doc.setFillColor(...NAVY);
  doc.roundedRect(margin, y, pageW - margin * 2, 70, 6, 6, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("MONTO PAGADO", margin + 20, y + 26);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text(currency(opts.monto), pageW - margin - 20, y + 46, { align: "right" });
  y += 90;

  // Notas
  if (opts.notas && opts.notas.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text("Notas", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const lines = doc.splitTextToSize(opts.notas, pageW - margin * 2);
    doc.text(lines, margin, y + 14);
  }

  // Firmas
  const sigY = pageH - margin - 60;
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, sigY, margin + 200, sigY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("Recibí conforme", margin, sigY + 12);

  doc.line(pageW - margin - 200, sigY, pageW - margin, sigY);
  doc.text(opts.despacho.nombre, pageW - margin - 200, sigY + 12);

  // Pie
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    "Este recibo ampara el pago referido y forma parte del expediente del proyecto.",
    margin, pageH - margin,
  );

  const filename = `Recibo-${numeroStr}-${sanitizeFilename(opts.proyectoNombre || "pago") || "pago"}.pdf`;
  const blob = doc.output("blob");
  return { filename, blob, numeroStr };
}

export async function downloadOrShareReciboPDF(opts: ReciboOpts): Promise<void> {
  const { filename, blob } = await generateReciboPDF(opts);
  const file = new File([blob], filename, { type: "application/pdf" });
  // Si el navegador soporta compartir archivos, abrir share sheet.
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { canShare?: (d: ShareData) => boolean }) : null;
  if (nav?.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename, text: `Recibo ${filename}` });
      return;
    } catch {
      // usuario canceló o falló → cae a descarga
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}