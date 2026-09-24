// Layout helpers for pptxgenjs decks: one look for every slide, positions in inches (13.33 x 7.5).
import PptxGenJS from "pptxgenjs";

const W = 13.33;
const H = 7.5;
const MARGIN = 0.6;
const ROWS_PER_TABLE_SLIDE = 12;

export function createDeck({ title = "Presentation", accent = "2E6BE6", font = "Arial" } = {}) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = title;
  const theme = { accent, font, text: "1F2933", muted: "616E7C", light: "F5F7FA" };

  pptx.defineSlideMaster({
    title: "CONTENT",
    background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 0, w: W, h: 0.12, fill: { color: accent } } },
      { line: { x: MARGIN, y: 1.35, w: W - 2 * MARGIN, h: 0, line: { color: "E4E7EB", width: 1 } } },
    ],
    slideNumber: { x: W - 1.0, y: H - 0.45, fontFace: font, fontSize: 10, color: theme.muted },
  });

  pptx.defineSlideMaster({
    title: "SECTION",
    background: { color: accent },
    slideNumber: { x: W - 1.0, y: H - 0.45, fontFace: font, fontSize: 10, color: "FFFFFF" },
  });

  pptx.__katechatTheme = theme;

  // Photos are placed asynchronously (see placeImage); writing the deck waits for them, so a
  // program that forgets to await imageSlide still gets its photos
  pptx.__pending = [];
  for (const method of ["write", "writeFile"]) {
    const original = pptx[method].bind(pptx);
    pptx[method] = async (...args) => {
      await Promise.all(pptx.__pending);
      return original(...args);
    };
  }
  return { pptx, theme };
}

const themeOf = pptx => pptx.__katechatTheme || { accent: "2E6BE6", font: "Arial", text: "1F2933", muted: "616E7C" };

function heading(pptx, slide, title) {
  const t = themeOf(pptx);
  slide.addText(title, {
    x: MARGIN,
    y: 0.4,
    w: W - 2 * MARGIN,
    h: 0.85,
    fontFace: t.font,
    fontSize: 28,
    bold: true,
    color: t.text,
    fit: "shrink",
  });
}

function notesOf(slide, notes) {
  if (notes) slide.addNotes(notes);
  return slide;
}

/**
 * Puts a photo in a box on the slide: `fit: "cover"` fills the box and crops, `"contain"` shows the
 * whole photo. `image` is anything images.load takes, or its result. If the photo cannot be loaded,
 * a grey placeholder takes its place and a warning goes to the log, so the deck is still written.
 * The slide is changed asynchronously; pptx.write waits for it.
 */
export function addImage(pptx, slide, image, { x, y, w, h, fit = "cover", credit = true } = {}) {
  const t = themeOf(pptx);
  // The photo arrives after the rest of the slide is built; an empty placeholder added now keeps
  // its place in the stacking order, so text and overlays added after it stay on top
  slide.addText("", { x, y, w, h });
  const objects = slide._slideObjects;
  const placeholder = objects?.[objects.length - 1];
  const intoPlace = () => {
    const at = objects ? objects.indexOf(placeholder) : -1;
    if (at >= 0) objects.splice(at, 1, objects.pop());
  };
  const task = (async () => {
    try {
      const photo = await images.load(image);
      const ratio = photo.width / photo.height;
      if (fit === "contain") {
        const iw = Math.min(w, h * ratio);
        const ih = iw / ratio;
        slide.addImage({ data: photo.data, x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih });
      } else {
        // pptxgenjs crops an image of w x h (its proportions) to the sizing box
        slide.addImage({ data: photo.data, x, y, w, h: w / ratio, sizing: { type: "cover", w, h } });
      }
      intoPlace();
      if (credit && photo.credit) {
        slide.addText(photo.credit, {
          x,
          y: y + h - 0.28,
          w,
          h: 0.28,
          fontFace: t.font,
          fontSize: 8,
          color: "FFFFFF",
          align: "right",
          fill: { color: "000000", transparency: 55 },
          margin: [0, 6, 0, 6],
        });
      }
    } catch (error) {
      console.warn(`Photo not added, a placeholder is in its place: ${error.message || error}`);
      slide.addText("Image unavailable", {
        x,
        y,
        w,
        h,
        align: "center",
        valign: "middle",
        fontSize: 14,
        color: t.muted,
        fill: { color: "E4E7EB" },
      });
      intoPlace();
    }
  })();
  pptx.__pending?.push(task);
  return task;
}

export function titleSlide(pptx, { title, subtitle, image } = {}) {
  const t = themeOf(pptx);
  const slide = pptx.addSlide();
  slide.background = { color: t.accent };
  if (image) {
    // a full-bleed photo under a dark veil keeps the white title readable
    addImage(pptx, slide, image, { x: 0, y: 0, w: W, h: H });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: "000000", transparency: 45 } });
  }
  slide.addText(title || "", {
    x: MARGIN,
    y: 2.3,
    w: W - 2 * MARGIN,
    h: 1.5,
    fontFace: t.font,
    fontSize: 40,
    bold: true,
    color: "FFFFFF",
    fit: "shrink",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: MARGIN,
      y: 3.9,
      w: W - 2 * MARGIN,
      h: 0.8,
      fontFace: t.font,
      fontSize: 20,
      color: "FFFFFF",
    });
  }
  return slide;
}

export function sectionSlide(pptx, { title, subtitle } = {}) {
  const t = themeOf(pptx);
  const slide = pptx.addSlide({ masterName: "SECTION" });
  slide.addText(title || "", {
    x: MARGIN,
    y: 2.8,
    w: W - 2 * MARGIN,
    h: 1.2,
    fontFace: t.font,
    fontSize: 36,
    bold: true,
    color: "FFFFFF",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: MARGIN,
      y: 4.0,
      w: W - 2 * MARGIN,
      h: 0.7,
      fontFace: t.font,
      fontSize: 18,
      color: "FFFFFF",
    });
  }
  return slide;
}

function bulletRuns(pptx, bullets) {
  const t = themeOf(pptx);
  const runs = [];
  for (const bullet of bullets || []) {
    const [text, detail] = Array.isArray(bullet) ? bullet : [bullet];
    runs.push({
      text: String(text),
      options: { bullet: { indent: 18 }, fontSize: 20, color: t.text, breakLine: true, paraSpaceBefore: 8 },
    });
    if (detail) {
      runs.push({ text: String(detail), options: { indentLevel: 1, fontSize: 15, color: t.muted, breakLine: true } });
    }
  }
  return runs;
}

export function bulletSlide(pptx, { title, bullets, notes } = {}) {
  const t = themeOf(pptx);
  const slide = pptx.addSlide({ masterName: "CONTENT" });
  heading(pptx, slide, title || "");
  slide.addText(bulletRuns(pptx, bullets), {
    x: MARGIN,
    y: 1.6,
    w: W - 2 * MARGIN,
    h: H - 2.4,
    fontFace: t.font,
    valign: "top",
    fit: "shrink",
  });
  return notesOf(slide, notes);
}

export function twoColumnSlide(pptx, { title, left, right, notes } = {}) {
  const t = themeOf(pptx);
  const slide = pptx.addSlide({ masterName: "CONTENT" });
  heading(pptx, slide, title || "");
  const colW = (W - 2 * MARGIN - 0.5) / 2;
  for (const [i, items] of [left, right].entries()) {
    slide.addText(bulletRuns(pptx, items), {
      x: MARGIN + i * (colW + 0.5),
      y: 1.6,
      w: colW,
      h: H - 2.4,
      fontFace: t.font,
      valign: "top",
      fit: "shrink",
    });
  }
  return notesOf(slide, notes);
}

export function tableSlide(pptx, { title, header = [], rows = [], colWidths, notes } = {}) {
  const t = themeOf(pptx);
  const width = W - 2 * MARGIN;
  const cols = Math.max(header.length, ...rows.map(r => r.length), 1);
  const colW = colWidths || Array(cols).fill(width / cols);
  const headRow = header.map(text => ({
    text: String(text),
    options: { bold: true, color: "FFFFFF", fill: { color: t.accent } },
  }));

  let slide;
  for (let start = 0; start < Math.max(rows.length, 1); start += ROWS_PER_TABLE_SLIDE) {
    slide = pptx.addSlide({ masterName: "CONTENT" });
    heading(pptx, slide, start ? `${title} (cont.)` : title || "");
    const body = rows
      .slice(start, start + ROWS_PER_TABLE_SLIDE)
      .map((row, i) =>
        row.map(text => ({ text: String(text ?? ""), options: i % 2 ? { fill: { color: "F5F7FA" } } : {} }))
      );
    slide.addTable(headRow.length ? [headRow, ...body] : body, {
      x: MARGIN,
      y: 1.6,
      w: width,
      colW,
      fontFace: t.font,
      fontSize: 14,
      color: t.text,
      border: { type: "solid", color: "E4E7EB", pt: 1 },
      valign: "middle",
    });
    notesOf(slide, notes);
  }
  return slide;
}

const CHART_TYPES = { bar: "bar", line: "line", pie: "pie", doughnut: "doughnut" };

export function chartSlide(pptx, { title, type = "bar", labels = [], series = [], notes } = {}) {
  const t = themeOf(pptx);
  const chartType = CHART_TYPES[type];
  if (!chartType) throw new Error(`chartSlide: type must be one of ${Object.keys(CHART_TYPES).join(", ")}`);
  for (const s of series) {
    if (!Array.isArray(s.values) || s.values.length !== labels.length || s.values.some(v => typeof v !== "number")) {
      throw new Error(`chartSlide: series "${s.name}" needs ${labels.length} numeric values, one per label`);
    }
  }
  const slide = pptx.addSlide({ masterName: "CONTENT" });
  heading(pptx, slide, title || "");
  const round = chartType === "pie" || chartType === "doughnut";
  slide.addChart(
    pptx.ChartType[chartType],
    series.map(s => ({ name: s.name, labels, values: s.values })),
    {
      x: MARGIN,
      y: 1.6,
      w: W - 2 * MARGIN,
      h: H - 2.3,
      showLegend: series.length > 1 || round,
      legendPos: "b",
      showValue: round,
      chartColors: round ? undefined : [t.accent, "F5A623", "7ED321", "9013FE", "50E3C2"],
      catAxisLabelFontFace: t.font,
      valAxisLabelFontFace: t.font,
      dataLabelFontFace: t.font,
      legendFontFace: t.font,
    }
  );
  return notesOf(slide, notes);
}

/**
 * A slide built around a photo. With `bullets` (or `text`) the photo takes one half (`layout`
 * "right", the default, or "left"); without them it fills the slide under the title (`layout: "full"`).
 */
export function imageSlide(pptx, { title, image, bullets, text, caption, layout, notes } = {}) {
  const t = themeOf(pptx);
  const side = layout || (bullets || text ? "right" : "full");
  if (side === "full") {
    const slide = pptx.addSlide();
    slide.background = { color: "1F2933" };
    addImage(pptx, slide, image, { x: 0, y: 0, w: W, h: H });
    const band = caption ? 1.7 : 1.3;
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: H - band,
      w: W,
      h: band,
      fill: { color: "000000", transparency: 40 },
    });
    slide.addText(title || "", {
      x: MARGIN,
      y: H - band + 0.15,
      w: W - 2 * MARGIN,
      h: 0.8,
      fontFace: t.font,
      fontSize: 30,
      bold: true,
      color: "FFFFFF",
      fit: "shrink",
    });
    if (caption) {
      slide.addText(caption, {
        x: MARGIN,
        y: H - band + 0.9,
        w: W - 2 * MARGIN,
        h: 0.6,
        fontFace: t.font,
        fontSize: 16,
        color: "FFFFFF",
      });
    }
    return notesOf(slide, notes);
  }

  const slide = pptx.addSlide({ masterName: "CONTENT" });
  heading(pptx, slide, title || "");
  const colW = (W - 2 * MARGIN - 0.5) / 2;
  const imageX = side === "left" ? MARGIN : MARGIN + colW + 0.5;
  const textX = side === "left" ? MARGIN + colW + 0.5 : MARGIN;
  addImage(pptx, slide, image, { x: imageX, y: 1.6, w: colW, h: caption ? H - 2.8 : H - 2.3 });
  if (caption) {
    slide.addText(caption, {
      x: imageX,
      y: H - 1.15,
      w: colW,
      h: 0.4,
      fontFace: t.font,
      fontSize: 12,
      italic: true,
      color: t.muted,
    });
  }
  slide.addText(bullets ? bulletRuns(pptx, bullets) : String(text || ""), {
    x: textX,
    y: 1.6,
    w: colW,
    h: H - 2.4,
    fontFace: t.font,
    fontSize: 18,
    color: t.text,
    valign: "top",
    fit: "shrink",
  });
  return notesOf(slide, notes);
}
