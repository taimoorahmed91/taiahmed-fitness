import { useState, type RefObject } from 'react';
import { toast } from 'sonner';

export type PdfColumn = { key: string; label: string };
type PdfRow = Record<string, unknown>;

export interface ChartPdfOptions {
  targetRef: RefObject<HTMLElement>;
  title: string;
  subtitle?: string;
  columns: PdfColumn[];
  rows: PdfRow[];
}

const cell = (v: unknown) => (v == null || v === '' ? '--' : typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v));

/**
 * The one PDF export for a chart: a picture of `targetRef` plus the data table. The full-screen viewer shows it as
 * a button, the card offers it from the "More chart actions" menu; both run this same code and report `busy`.
 */
export const useChartPdf = ({ targetRef, title, subtitle, columns, rows }: ChartPdfOptions) => {
  const [busy, setBusy] = useState(false);

  const exportPdf = async () => {
    if (!targetRef.current || busy) return;
    setBusy(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
      const bg = getComputedStyle(document.body).backgroundColor || '#ffffff';
      const canvas = await html2canvas(targetRef.current, { backgroundColor: bg, scale: 2, useCORS: true });
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const m = 36;
      pdf.setFontSize(16); pdf.text(title, m, m + 6);
      pdf.setFontSize(10); pdf.setTextColor(110);
      pdf.text(`${subtitle ? `${subtitle} · ` : ''}Generated ${new Date().toLocaleString()}`, m, m + 22);
      pdf.setTextColor(0);
      const imgW = pageW - m * 2;
      const imgH = Math.min(canvas.height * imgW / canvas.width, pageH * 0.5);
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', m, m + 34, imgW, imgH);

      let y = m + 34 + imgH + 24;
      const colW = imgW / columns.length;
      const header = () => {
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
        columns.forEach((c, i) => pdf.text(c.label, m + i * colW, y, { maxWidth: colW - 4 }));
        pdf.setDrawColor(180); pdf.line(m, y + 4, pageW - m, y + 4);
        pdf.setFont('helvetica', 'normal'); y += 16;
      };
      pdf.setFontSize(12); pdf.text(`Data points (${rows.length})`, m, y); y += 16;
      header();
      rows.forEach(row => {
        if (y > pageH - m) { pdf.addPage(); y = m; header(); }
        columns.forEach((c, i) => pdf.text(cell(row[c.key]), m + i * colW, y, { maxWidth: colW - 4 }));
        y += 13;
      });
      pdf.save(`${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error(e);
      toast.error('Could not create the PDF');
    } finally {
      setBusy(false);
    }
  };

  return { busy, exportPdf };
};
