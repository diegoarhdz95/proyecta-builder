import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";

const NAVY: [number, number, number] = [15, 23, 66];
const MUTED: [number, number, number] = [110, 116, 130];
const GREEN: [number, number, number] = [22, 122, 64];

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

export type ReciboPersonalOpts = {
  despacho: { nombre: string; logo_url: string | null };
  numeroRecibo: number;
  trabajador: { nombre: string; categoria: string; especialidad: string | null };
  proyectoNombre: string;
  folio: string;
  actividad: string;
  monto: number;
  fechaPago: string;
  metodoPago?: string | null;
  notas?: string | null;
  aceptacion: {
    url: string; // URL pública del recibo (QR)
    aceptadoAt: string | null;
    aceptadoIp: string | null;
  };
};

export async function generateReciboPersonalPDF(
  opts: ReciboPersonalOpts,
): Promise<{ filename: string; blob: Blob; numeroStr: string }> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 56;

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 6, "F");

  if (opts.despacho.logo_url) {
    const logo = await loadImageAsDataUrl(opts.despacho.logo_url);
    if (logo) {
      const maxW = 140, maxH = 60;
      const ratio = Math.min(maxW / logo.width, maxH / logo.height);
      const w = logo.width * ratio;
      const h = logo.height * ratio;
      try { doc.addImage(logo.dataUrl, logo.format, margin, margin, w, h); }
      catch { /* ignore */ }
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(opts.despacho.nombre.toUpperCase(), pageW - margin, margin + 12, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("Despacho de Arquitectura", pageW - margin, margin + 26, { align: "right" });

  const titleY = margin + 110;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...NAVY);
  doc.text("RECIBO DE PAGO A PERSONAL", margin, titleY);
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

  const categoriaTxt = opts.trabajador.categoria.charAt(0).toUpperCase() + opts.trabajador.categoria.slice(1);
  autoTable(doc, {
    startY: titleY + 44,
    body: [
      ["Trabajador", opts.trabajador.nombre || "—"],
      ["Categoría", `${categoriaTxt}${opts.trabajador.especialidad ? ` · ${opts.trabajador.especialidad}` : ""}`],
      ["Proyecto", opts.proyectoNombre || "—"],
      ["Cotización", opts.folio || "—"],
      ["Actividad / concepto", opts.actividad || "—"],
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
    y += 14 + lines.length * 12 + 8;
  }

  // Bloque de aceptación: o QR para firmar, o sello "ACEPTADO"
  const blockY = pageH - margin - 150;
  if (opts.aceptacion.aceptadoAt) {
    doc.setDrawColor(...GREEN);
    doc.setLineWidth(1.5);
    doc.roundedRect(margin, blockY, pageW - margin * 2, 80, 6, 6, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...GREEN);
    doc.text("✓ ACEPTADO DIGITALMENTE", margin + 20, blockY + 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const fechaAcept = new Date(opts.aceptacion.aceptadoAt).toLocaleString("es-MX", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    doc.text(`Confirmado por el trabajador el ${fechaAcept}`, margin + 20, blockY + 50);
    if (opts.aceptacion.aceptadoIp) {
      doc.setTextColor(...MUTED);
      doc.text(`Origen: IP ${opts.aceptacion.aceptadoIp}`, margin + 20, blockY + 65);
    }
  } else {
    // QR a la izquierda, instrucción a la derecha
    try {
      const qrDataUrl = await QRCode.toDataURL(opts.aceptacion.url, {
        margin: 1, width: 240, color: { dark: "#0F1742", light: "#FFFFFF" },
      });
      doc.addImage(qrDataUrl, "PNG", margin, blockY - 10, 100, 100);
    } catch { /* ignore */ }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text("Aceptación digital del trabajador", margin + 120, blockY + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const txt = doc.splitTextToSize(
      "Escanea el código QR con tu celular para confirmar que recibiste este pago. La aceptación queda registrada con fecha, hora y dispositivo.",
      pageW - margin * 2 - 130,
    );
    doc.text(txt, margin + 120, blockY + 28);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(opts.aceptacion.url, margin + 120, blockY + 78);
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    "Este recibo ampara el pago referido al trabajador y forma parte del expediente del proyecto.",
    margin, pageH - margin,
  );

  const filename = `Recibo-${numeroStr}-${sanitizeFilename(opts.trabajador.nombre || "personal") || "personal"}.pdf`;
  const blob = doc.output("blob");
  return { filename, blob, numeroStr };
}

export async function downloadOrShareReciboPersonalPDF(opts: ReciboPersonalOpts): Promise<void> {
  const { filename, blob } = await generateReciboPersonalPDF(opts);
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { canShare?: (d: ShareData) => boolean }) : null;
  if (nav?.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename, text: `Recibo ${filename}` });
      return;
    } catch { /* fall through */ }
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