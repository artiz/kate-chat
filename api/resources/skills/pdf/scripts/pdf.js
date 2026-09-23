// pdfmake with its Roboto fonts (Latin, Cyrillic, Greek) loaded, plus styles for a clean document.
import pdfMake from "pdfmake";

const FONTS_URL = "https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/vfs_fonts.js/+esm";
let fontsLoaded;

function loadFonts() {
  fontsLoaded ||= import(FONTS_URL).then(module => {
    const fonts = module.default || module;
    pdfMake.vfs = fonts.pdfMake ? fonts.pdfMake.vfs : fonts.vfs || fonts;
  });
  return fontsLoaded;
}

export const styles = {
  title: { fontSize: 24, bold: true, margin: [0, 0, 0, 6] },
  subtitle: { fontSize: 13, color: "#616E7C", margin: [0, 0, 0, 18] },
  h1: { fontSize: 18, bold: true, margin: [0, 16, 0, 8] },
  h2: { fontSize: 14, bold: true, margin: [0, 12, 0, 6] },
  h3: { fontSize: 12, bold: true, margin: [0, 10, 0, 4] },
  muted: { color: "#616E7C", fontSize: 9 },
  tableHeader: { bold: true, color: "#FFFFFF", fillColor: "#2E6BE6" },
  small: { fontSize: 9 },
};

/** A styled table node: header row in the accent colour, zebra rows, widths shared evenly by default. */
export function table(header, rows, { widths, accent = "#2E6BE6" } = {}) {
  const cols = Math.max(header.length, ...rows.map(r => r.length), 1);
  return {
    table: {
      headerRows: header.length ? 1 : 0,
      widths: widths || Array(cols).fill("*"),
      body: [
        ...(header.length
          ? [header.map(text => ({ text: String(text), style: "tableHeader", fillColor: accent }))]
          : []),
        ...rows.map(row =>
          row.map(cell => (typeof cell === "object" && cell !== null ? cell : { text: String(cell ?? "") }))
        ),
      ],
    },
    layout: {
      fillColor: (i, node) => (i >= (node.table.headerRows || 0) && (i - node.table.headerRows) % 2 ? "#F5F7FA" : null),
      hLineColor: () => "#E4E7EB",
      vLineColor: () => "#E4E7EB",
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    margin: [0, 4, 0, 12],
  };
}

/**
 * Renders a pdfmake document definition to PDF bytes. The defaults (A4, margins, Roboto, page numbers
 * in the footer, the styles above) apply unless the definition sets its own.
 */
export async function renderPdf(definition) {
  await loadFonts();
  const doc = pdfMake.createPdf({
    pageSize: "A4",
    pageMargins: [50, 55, 50, 60],
    defaultStyle: { font: "Roboto", fontSize: 11, lineHeight: 1.25 },
    footer: (page, pages) => ({
      text: `${page} / ${pages}`,
      alignment: "center",
      style: "muted",
      margin: [0, 20, 0, 0],
    }),
    ...definition,
    styles: { ...styles, ...(definition.styles || {}) },
  });
  return new Uint8Array(await new Promise(resolve => doc.getBuffer(resolve)));
}
