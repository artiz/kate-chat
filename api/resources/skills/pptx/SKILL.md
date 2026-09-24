---
name: PowerPoint presentation
description: Slide decks (.pptx) with titles, bullets, tables, charts, photos and speaker notes, built with pptxgenjs.
runtime: typescript
packages:
  - pptxgenjs@3.12.0
---

Use this skill when the user wants a presentation, slides or a deck. Write TypeScript with pptxgenjs; the helper module `skill/deck.js` gives the deck a consistent look, so prefer it over positioning everything by hand.

```typescript skill=pptx file=quarterly-review.pptx
import { createDeck, titleSlide, bulletSlide, tableSlide, chartSlide, sectionSlide } from "skill/deck.js";

const { pptx, theme } = createDeck({ title: "Quarterly review", accent: "2E6BE6" });

titleSlide(pptx, { title: "Quarterly review", subtitle: "Q3 2026 · Sales team" });
sectionSlide(pptx, { title: "Results" });
bulletSlide(pptx, {
  title: "Highlights",
  bullets: [
    "Revenue up 18% year over year",
    "Two new enterprise customers",
    ["Churn down to 2.1%", "lowest in three years"],
  ],
  notes: "Open with the revenue number.",
});
tableSlide(pptx, {
  title: "Revenue by region",
  header: ["Region", "Q2", "Q3", "Change"],
  rows: [
    ["EMEA", "1.2M", "1.4M", "+17%"],
    ["Americas", "2.0M", "2.4M", "+20%"],
  ],
});
chartSlide(pptx, {
  title: "Monthly revenue",
  type: "bar",
  labels: ["Jul", "Aug", "Sep"],
  series: [{ name: "Revenue, M", values: [1.1, 1.3, 1.4] }],
});

await output.save("quarterly-review.pptx", await pptx.write({ outputType: "uint8array" }));
```

Helpers in `skill/deck.js` (all positions in inches on a 13.33 × 7.5 widescreen slide):

- `createDeck({ title, accent?, font? })` → `{ pptx, theme }`; `accent` is a hex colour without `#`.
- `titleSlide(pptx, { title, subtitle?, image? })` (with `image`, the photo fills the slide behind the title), `sectionSlide(pptx, { title, subtitle? })`.
- `bulletSlide(pptx, { title, bullets, notes? })`: a bullet may be a string, or `[text, detail]` for a second, smaller line.
- `tableSlide(pptx, { title, header, rows, colWidths?, notes? })`: every cell is a string; long tables are split across slides automatically.
- `chartSlide(pptx, { title, type, labels, series, notes? })`: `type` is `"bar"`, `"line"`, `"pie"` or `"doughnut"`; `series` is `[{ name, values }]`, one entry for pie and doughnut.
- `twoColumnSlide(pptx, { title, left, right, notes? })`: each side is a list of bullets.
- `imageSlide(pptx, { title, image, bullets?, text?, caption?, layout?, notes? })`: a slide built around a photo. With `bullets` or `text` the photo takes half the slide (`layout: "right"`, the default, or `"left"`); without them it fills the slide under the title (`"full"`).
- `addImage(pptx, slide, image, { x, y, w, h, fit? })` places a photo on any slide; `fit` is `"cover"` (default, crops) or `"contain"`.
- `image` is a result of `images.search` / `images.load`, or anything `images.load` takes (a chat image path, `"commons:<file>"`, an https URL on the allowed hosts). Photos from Wikimedia Commons get their credit line automatically. A photo that cannot be loaded becomes a grey placeholder; the deck is still made.
- Each helper returns the pptxgenjs slide, so you can add more to it with the plain API.

Photos:

```typescript
const [tower] = await images.search("Eiffel Tower");
const [river] = await images.search("Seine river Paris");
titleSlide(pptx, { title: "Paris", subtitle: "Spring trip", image: tower });
imageSlide(pptx, { title: "Along the Seine", image: river, bullets: ["Walk from Notre-Dame to the Louvre", "Evening boat tour"] });
```

For anything else use pptxgenjs directly: `const slide = pptx.addSlide()`, then `slide.addText(text, { x, y, w, h, fontSize, bold, color, align })`, `slide.addTable(rows, { x, y, w })`, `slide.addChart(pptx.ChartType.bar, data, { x, y, w, h })`, `slide.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color } })`, `slide.addNotes(text)`.

Rules that keep the deck valid and readable:

- Colours are 6-digit hex without `#`. Fonts come from the viewer's machine, so keep to common ones (the helpers use Arial).
- Photos only through `images` (see above), never `slide.addImage({ path: url })`: other hosts are unreachable. Use at most one photo per slide, and only where it helps.
- At most about six bullets and 40 words per slide; split long content into more slides rather than shrinking the text.
- Chart `values` must be numbers, and every series needs as many values as there are labels.
- Finish with `await output.save("<file>.pptx", await pptx.write({ outputType: "uint8array" }))`.
