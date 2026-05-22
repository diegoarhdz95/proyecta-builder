import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DESPACHO_NOMBRE, IVA_RATE, type Proyecto, type Partida, type ProyectoConcepto } from "./supabase";

const NAVY: [number, number, number] = [15, 23, 66];
const MUTED: [number, number, number] = [110, 116, 130];

function currency(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
}

type Item = ProyectoConcepto & { proyecto_partida?: { partida_id: string } | null };

export function generateCotizacionPDF(opts: {
  proyecto: Proyecto;
  items: Item[];
  partidas: Partida[];
}) {
  const { proyecto, items, partidas } = opts;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 56;

  // ---------- PÁGINA 1: PORTADA ----------
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 6, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(DESPACHO_NOMBRE.toUpperCase(), margin, margin + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("Despacho de Arquitectura", margin, margin + 24);

  const titleY = pageH / 2 - 60;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text("PROPUESTA DE SERVICIOS", margin, titleY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...NAVY);
  const projectLines = doc.splitTextToSize(proyecto.nombre_proyecto || "", pageW - margin * 2);
  doc.text(projectLines, margin, titleY + 36);

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1);
  doc.line(margin, titleY + 36 + projectLines.length * 30 + 20, margin + 80, titleY + 36 + projectLines.length * 30 + 20);

  const infoY = pageH - 200;
  const col1 = margin;
  const col2 = pageW / 2;

  const drawField = (label: string, value: string, x: number, y: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text(value || "—", x, y + 14);
  };

  drawField("Cliente", proyecto.cliente_nombre || "", col1, infoY);
  drawField("Folio", proyecto.folio || "", col2, infoY);
  drawField("Fecha", new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }), col1, infoY + 50);
  drawField("Proyecto", proyecto.nombre_proyecto || "", col2, infoY + 50);

  // ---------- PÁGINA 2: CATÁLOGO ----------
  doc.addPage();
  pageHeader(doc, "Catálogo de conceptos", proyecto.folio, margin, pageW);

  const partidaMap = new Map(partidas.map((p) => [p.id, p]));
  const grouped = new Map<string, Item[]>();
  items.forEach((it) => {
    const pid = it.proyecto_partida?.partida_id ?? "otros";
    if (!grouped.has(pid)) grouped.set(pid, []);
    grouped.get(pid)!.push(it);
  });

  let cursorY = margin + 50;
  let counter = 0;
  const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
    const oa = partidaMap.get(a[0])?.orden ?? 999;
    const ob = partidaMap.get(b[0])?.orden ?? 999;
    return oa - ob;
  });

  for (const [pid, group] of sortedGroups) {
    const partida = partidaMap.get(pid);
    const partidaLabel = partida ? `${partida.clave} · ${partida.nombre}` : "Otros";

    const body = group.map((it) => {
      counter += 1;
      return [
        String(counter),
        it.descripcion,
        "",
        it.unidad,
        String(Number(it.cantidad)),
        currency(Number(it.precio_unitario_final)),
        currency(Number(it.subtotal)),
      ];
    });
    const subPartida = group.reduce((s, i) => s + Number(i.subtotal || 0), 0);

    autoTable(doc, {
      startY: cursorY,
      head: [[{ content: partidaLabel.toUpperCase(), colSpan: 7, styles: { halign: "left", fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 9 } }],
        ["No.", "Descripción", "Especificaciones", "Unidad", "Cant.", "P.U.", "Importe"]],
      body,
      foot: [[{ content: "Subtotal partida", colSpan: 6, styles: { halign: "right", fontStyle: "bold" } }, { content: currency(subPartida), styles: { halign: "right", fontStyle: "bold" } }]],
      styles: { font: "helvetica", fontSize: 8, cellPadding: 4, textColor: [40, 40, 40] },
      headStyles: { fillColor: [240, 242, 247], textColor: NAVY, fontStyle: "bold" },
      footStyles: { fillColor: [248, 249, 252], textColor: NAVY },
      columnStyles: {
        0: { cellWidth: 28, halign: "center" },
        1: { cellWidth: "auto" },
        2: { cellWidth: 80 },
        3: { cellWidth: 40, halign: "center" },
        4: { cellWidth: 40, halign: "right" },
        5: { cellWidth: 60, halign: "right" },
        6: { cellWidth: 70, halign: "right" },
      },
      margin: { left: margin, right: margin },
      theme: "grid",
    });
    // @ts-expect-error lastAutoTable injected by plugin
    cursorY = doc.lastAutoTable.finalY + 16;
  }

  const subtotal = items.reduce((s, i) => s + Number(i.subtotal || 0), 0);
  const iva = subtotal * IVA_RATE;
  const total = subtotal + iva;

  autoTable(doc, {
    startY: cursorY + 4,
    body: [
      ["Subtotal", currency(subtotal)],
      ["IVA (16%)", currency(iva)],
      [{ content: "Total con IVA", styles: { fontStyle: "bold", fillColor: NAVY, textColor: 255 } }, { content: currency(total), styles: { fontStyle: "bold", fillColor: NAVY, textColor: 255, halign: "right" } }],
    ],
    styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
    columnStyles: { 0: { halign: "right", cellWidth: pageW - margin * 2 - 110 }, 1: { halign: "right", cellWidth: 110 } },
    margin: { left: margin, right: margin },
    theme: "plain",
  });

  // ---------- PÁGINA 3: CONDICIONES ----------
  doc.addPage();
  pageHeader(doc, "Condiciones comerciales", proyecto.folio, margin, pageW);

  const items3: Array<[string, string]> = [
    ["Vigencia", "30 días naturales a partir de la fecha de emisión."],
    ["Anticipo", "30% del total para arranque del proyecto."],
    ["Forma de pago", "Pagos parciales según estimaciones de avance de obra."],
    ["Tiempo de ejecución", "Por definir conforme al programa de obra acordado con el cliente."],
    ["Moneda", "Todos los precios están expresados en pesos mexicanos (MXN)."],
    ["Impuestos", "IVA del 16% incluido en el total final de la cotización."],
  ];

  let y = margin + 60;
  items3.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    const lines = doc.splitTextToSize(value, pageW - margin * 2);
    doc.text(lines, margin, y + 16);
    y += 16 + lines.length * 14 + 14;
    doc.setDrawColor(230, 232, 238);
    doc.line(margin, y - 6, pageW - margin, y - 6);
  });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(
    `${DESPACHO_NOMBRE} agradece la oportunidad de colaborar en este proyecto.`,
    margin,
    pageH - margin,
  );

  // footer page numbers
  const total_pages = doc.getNumberOfPages();
  for (let i = 1; i <= total_pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`${DESPACHO_NOMBRE}`, margin, pageH - 24);
    doc.text(`${i} / ${total_pages}`, pageW - margin, pageH - 24, { align: "right" });
  }

  doc.save(`${proyecto.folio || "cotizacion"}.pdf`);
}

function pageHeader(doc: jsPDF, title: string, folio: string, margin: number, pageW: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(DESPACHO_NOMBRE.toUpperCase(), margin, margin);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Folio ${folio}`, pageW - margin, margin, { align: "right" });

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.line(margin, margin + 10, pageW - margin, margin + 10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text(title, margin, margin + 36);
}