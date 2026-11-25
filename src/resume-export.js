// Render a fitted resume to a text-based PDF (jsPDF, Helvetica: ATS-readable)
// and to DOCX (docx), using the same one-page layout.

import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun, TabStopType, BorderStyle } from "docx";
import { fitOnePage, PAGES } from "./logic/resume.js";

/** A measure() backed by jsPDF's Helvetica metrics, in points. */
function pdfMeasure(pdf) {
  return (text, size, bold) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    return pdf.getTextWidth(String(text));
  };
}

/** Fit the resume on one page. Returns the layout result (ops, size, dropped, doc). */
export function fitResume(doc, pageName = "A4") {
  const page = PAGES[pageName] || PAGES.A4;
  const pdf = new jsPDF({ unit: "pt", format: pageName === "Letter" ? "letter" : "a4" });
  return fitOnePage(doc, { measure: pdfMeasure(pdf), page });
}

/** Build a one-page PDF Blob. Throws if it would not fit on one page. */
export function resumePdf(fit, pageName = "A4") {
  const pdf = new jsPDF({ unit: "pt", format: pageName === "Letter" ? "letter" : "a4" });
  pdf.setProperties({ title: `${fit.doc.name} resume`, creator: "Job Hunt Hub" });
  pdf.setTextColor(11, 11, 11);
  pdf.setDrawColor(11, 11, 11);
  for (const op of fit.ops) {
    if (op.t === "rule") {
      pdf.setLineWidth(0.6);
      pdf.line(op.x1, op.y, op.x2, op.y);
    } else {
      pdf.setFont("helvetica", op.bold ? "bold" : "normal");
      pdf.setFontSize(op.size);
      pdf.text(op.text, op.x, op.y, op.align === "right" ? { align: "right" } : undefined);
    }
  }
  if (pdf.getNumberOfPages() !== 1) throw new Error("Resume is longer than one page");
  return pdf.output("blob");
}

/** Build a DOCX Blob with the same content and font size. */
export async function resumeDocx(fit, pageName = "A4") {
  const page = PAGES[pageName] || PAGES.A4;
  const doc = fit.doc;
  const half = (pt) => Math.round(pt * 2); // docx sizes are half-points
  const tw = (pt) => Math.round(pt * 20); // twips
  const size = fit.size;
  const run = (text, opts = {}) =>
    new TextRun({ text, font: "Arial", size: half(opts.size || size), bold: opts.bold });
  const textWidth = page.w - 84;
  const kids = [
    new Paragraph({
      children: [run(doc.name, { size: size * 2.1, bold: true })],
      spacing: { after: 40 },
    }),
  ];
  if (doc.headline)
    kids.push(new Paragraph({ children: [run(doc.headline, { size: size + 0.5 })] }));
  kids.push(
    new Paragraph({ children: [run(doc.contact, { size: size - 0.5 })], spacing: { after: 80 } }),
  );
  for (const sec of doc.sections) {
    kids.push(
      new Paragraph({
        children: [run(sec.title.toUpperCase(), { size: size + 1, bold: true })],
        spacing: { before: 140, after: 60 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "0B0B0B", space: 1 } },
      }),
    );
    for (const l of sec.lines || [])
      kids.push(new Paragraph({ children: [run(l)], spacing: { after: 30 } }));
    for (const it of sec.items || []) {
      kids.push(
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: tw(textWidth) }],
          children: [run(it.heading, { bold: true }), ...(it.dates ? [run(`\t${it.dates}`)] : [])],
          spacing: { before: 60 },
        }),
      );
      if (it.sub) kids.push(new Paragraph({ children: [run(it.sub, { size: size - 0.5 })] }));
      for (const b of it.bullets)
        kids.push(
          new Paragraph({ children: [run(b.text)], bullet: { level: 0 }, spacing: { after: 20 } }),
        );
    }
  }
  const document = new Document({
    creator: "Job Hunt Hub",
    title: `${doc.name} resume`,
    sections: [
      {
        properties: {
          page: {
            size: { width: tw(page.w), height: tw(page.h) },
            margin: { top: tw(42), bottom: tw(42), left: tw(42), right: tw(42) },
          },
        },
        children: kids,
      },
    ],
  });
  return Packer.toBlob(document);
}
