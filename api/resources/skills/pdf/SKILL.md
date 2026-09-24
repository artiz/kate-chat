---
name: PDF document
description: Reports, letters, invoices and other PDF documents with headings, lists, tables and page numbers, built with pdfmake.
runtime: typescript
packages:
  - pdfmake@0.2.20
---

Use this skill when the user wants a PDF: a report, a letter, an invoice, a summary, a one-pager. Describe the document as a pdfmake document definition and render it with the helper `skill/pdf.js`, which loads fonts that cover Latin and Cyrillic text.

```typescript skill=pdf file=project-report.pdf
import { renderPdf, table } from "skill/pdf.js";

const bytes = await renderPdf({
  info: { title: "Project report" },
  content: [
    { text: "Project report", style: "title" },
    { text: "September 2026 · Prepared for the steering committee", style: "subtitle" },
    { text: "Summary", style: "h1" },
    "The migration finished two weeks ahead of plan and 8% under budget.",
    { ul: ["All services moved to the new cluster", "No customer-facing downtime", "Monitoring coverage at 96%"] },
    { text: "Budget", style: "h1" },
    table(
      ["Item", "Planned", "Actual"],
      [
        ["Infrastructure", "€120,000", "€108,500"],
        ["Staff", "€80,000", "€76,000"],
      ],
      {
        widths: ["*", 100, 100],
      }
    ),
    { text: "Next steps", style: "h2" },
    { ol: ["Decommission the old cluster", "Review on-call rotation"] },
  ],
});

await output.save("project-report.pdf", bytes);
```

What the helper provides:

- `renderPdf(definition)` returns the PDF bytes. Defaults: A4, 50 pt margins, Roboto 11 pt, page numbers in the footer. Anything you set in the definition (`pageSize`, `pageOrientation: "landscape"`, `pageMargins`, `header`, `footer`, `styles`, `defaultStyle`) overrides them.
- Fonts, set with `font` on a node, a style or `defaultStyle`: `"Roboto"` (default, sans), `"PT Serif"` (serif for body text), `"Montserrat"` (geometric sans for headings), `"Playfair Display"` (elegant display serif), `"Roboto Mono"` (code, figures), `"Caveat"` (handwritten; it runs small, use 14 pt or more). All cover Latin and Cyrillic and have bold and italics (Caveat has no italics). Other names are replaced by the closest of these.
- `pageColor: "#FFF8E1"` fills every page with a colour.
- Styles ready to use: `title`, `subtitle`, `h1`, `h2`, `h3`, `muted`, `small`, `tableHeader`.
- `table(header, rows, { widths?, accent? })` makes a styled table node; a cell may be a string or a pdfmake cell object such as `{ text: "42", alignment: "right" }`. `widths` entries are numbers (points), `"*"` or `"auto"`.

pdfmake essentials for `content`:

- A string is a paragraph. `{ text, style, bold, italics, fontSize, color, alignment, margin: [left, top, right, bottom] }` formats one; `text` may be an array of runs, e.g. `["Total: ", { text: "€184,500", bold: true }]`.
- Lists: `{ ul: [...] }`, `{ ol: [...] }`; items may be nested lists.
- Layout: `{ columns: [{ width: "*", stack: [...] }, { width: 150, text: "..." }], columnGap: 20 }`, `{ stack: [...] }`.
- `{ text: "...", pageBreak: "before" }` starts a new page; tables with `headerRows: 1` repeat the header on every page.
- Colours are CSS strings such as `"#2E6BE6"`.
- No images from URLs: there is no network. Draw with `{ canvas: [{ type: "rect", x, y, w, h, color }] }` or use tables and text.
- Finish with `await output.save("<file>.pdf", bytes)`.
