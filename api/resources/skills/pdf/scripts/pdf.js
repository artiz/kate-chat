// pdfmake with its Roboto fonts (Latin, Cyrillic, Greek) loaded and five more fonts on demand, plus
// styles for a clean document.
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

const ROBOTO = {
  normal: "Roboto-Regular.ttf",
  bold: "Roboto-Medium.ttf",
  italics: "Roboto-Italic.ttf",
  bolditalics: "Roboto-MediumItalic.ttf",
};

// Google Fonts with Latin and Cyrillic, as static TTFs from @expo-google-fonts on jsDelivr. A font is
// downloaded only when a document uses it: [package@version, file prefix, has italics].
const EXTRA_FONTS = {
  "PT Serif": ["pt-serif@0.4.1", "PTSerif", true],
  Montserrat: ["montserrat@0.4.2", "Montserrat", true],
  "Playfair Display": ["playfair-display@0.4.2", "PlayfairDisplay", true],
  "Roboto Mono": ["roboto-mono@0.4.2", "RobotoMono", true],
  Caveat: ["caveat@0.4.2", "Caveat", false],
};

/** The font names a document may use. */
export const fonts = ["Roboto", ...Object.keys(EXTRA_FONTS)];

// Fonts models ask for out of habit, mapped to the closest one available
const ALIASES = {
  "sans-serif": "Roboto",
  arial: "Roboto",
  helvetica: "Roboto",
  "helvetica neue": "Roboto",
  calibri: "Roboto",
  verdana: "Roboto",
  "open sans": "Roboto",
  inter: "Roboto",
  serif: "PT Serif",
  times: "PT Serif",
  "times new roman": "PT Serif",
  georgia: "PT Serif",
  garamond: "PT Serif",
  cambria: "PT Serif",
  futura: "Montserrat",
  gotham: "Montserrat",
  avenir: "Montserrat",
  poppins: "Montserrat",
  didot: "Playfair Display",
  bodoni: "Playfair Display",
  monospace: "Roboto Mono",
  courier: "Roboto Mono",
  "courier new": "Roboto Mono",
  consolas: "Roboto Mono",
  menlo: "Roboto Mono",
  cursive: "Caveat",
  "comic sans": "Caveat",
  "comic sans ms": "Caveat",
};

function resolveFont(name) {
  const key = name
    .trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase();
  return fonts.find(font => font.toLowerCase() === key) || ALIASES[key] || "Roboto";
}

/**
 * pdfmake fails on a font it does not have, and does so outside the promise renderPdf waits for. So
 * every font the document names is resolved to an available one (logging any substitution), and the
 * ones used are collected for loading.
 */
function resolveFonts(node, used, substituted, seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  if (!Array.isArray(node) && typeof node.font === "string") {
    const font = resolveFont(node.font);
    if (font !== node.font) substituted.set(node.font, font);
    node.font = font;
    used.add(font);
  }
  for (const value of Object.values(node)) resolveFonts(value, used, substituted, seen);
}

const toBase64 = bytes => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const fontFiles = {};

/** Downloads a font into pdfmake's virtual file system once and returns its pdfmake font entry. */
function loadExtraFont(name) {
  fontFiles[name] ||= (async () => {
    const [pkg, prefix, hasItalics] = EXTRA_FONTS[name];
    const files = { normal: "400Regular", bold: "700Bold" };
    if (hasItalics) Object.assign(files, { italics: "400Regular_Italic", bolditalics: "700Bold_Italic" });
    const entry = {};
    await Promise.all(
      Object.entries(files).map(async ([style, weight]) => {
        const file = `${prefix}_${weight}.ttf`;
        const response = await fetch(`https://cdn.jsdelivr.net/npm/@expo-google-fonts/${pkg}/${weight}/${file}`);
        if (!response.ok) throw new Error(`Could not load the font ${name} (${file}): HTTP ${response.status}`);
        pdfMake.vfs[file] = toBase64(new Uint8Array(await response.arrayBuffer()));
        entry[style] = file;
      })
    );
    // No italic cut: italic text is set upright rather than failing
    entry.italics ||= entry.normal;
    entry.bolditalics ||= entry.bold;
    return entry;
  })();
  return fontFiles[name];
}

const isDataUrl = value => typeof value === "string" && value.startsWith("data:");

async function loadPhoto(source) {
  try {
    return (await images.load(source)).data;
  } catch (error) {
    console.warn(`Photo not added: ${error.message || error}`);
    return undefined;
  }
}

/**
 * pdfmake only takes images it already has (data URLs, or names in `images`), so everything else a
 * document names (a chat image, a Commons file, an https URL, a photo from images.search) is loaded
 * here. A photo that cannot be loaded becomes a short note instead of failing the document.
 */
async function resolveImages(definition) {
  const named = definition.images || {};
  await Promise.all(
    Object.entries(named).map(async ([name, source]) => {
      if (isDataUrl(source)) return;
      const data = await loadPhoto(source);
      if (data) named[name] = data;
      else delete named[name];
    })
  );

  const nodes = [];
  const seen = new Set();
  const collect = node => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (!Array.isArray(node) && node.image && !(typeof node.image === "string" && node.image in named))
      nodes.push(node);
    for (const value of Object.values(node)) collect(value);
  };
  collect(definition.content);
  collect(definition.background);

  await Promise.all(
    nodes.map(async node => {
      if (isDataUrl(node.image)) return;
      const data = await loadPhoto(node.image);
      if (data) {
        node.image = data;
      } else {
        delete node.image;
        node.text = "[image unavailable]";
        node.style = "muted";
      }
    })
  );
}

/** A full-page rectangle behind every page, for `pageColor`. */
const pageBackground = color => (page, size) => ({
  canvas: [{ type: "rect", x: 0, y: 0, w: size.width, h: size.height, color }],
});

/**
 * Renders a pdfmake document definition to PDF bytes. The defaults (A4, margins, Roboto, page numbers
 * in the footer, the styles above) apply unless the definition sets its own.
 */
export async function renderPdf(definition) {
  await loadFonts();
  await resolveImages(definition);
  // backgroundColor is not pdfmake's, but models expect it to work
  const { pageColor, backgroundColor, ...rest } = definition;
  const color = pageColor || backgroundColor;
  const used = new Set(["Roboto"]);
  const substituted = new Map();
  resolveFonts(rest, used, substituted);
  for (const [asked, font] of substituted) console.warn(`The font "${asked}" is not available; used ${font} instead`);
  const fontTable = { Roboto: ROBOTO };
  const extra = [...used].filter(name => name !== "Roboto");
  (await Promise.all(extra.map(loadExtraFont))).forEach((entry, i) => (fontTable[extra[i]] = entry));

  const doc = pdfMake.createPdf(
    {
      pageSize: "A4",
      pageMargins: [50, 55, 50, 60],
      footer: (page, pages) => ({
        text: `${page} / ${pages}`,
        alignment: "center",
        style: "muted",
        margin: [0, 20, 0, 0],
      }),
      ...(color ? { background: pageBackground(color) } : {}),
      ...rest,
      defaultStyle: { font: "Roboto", fontSize: 11, lineHeight: 1.25, ...(rest.defaultStyle || {}) },
      styles: { ...styles, ...(rest.styles || {}) },
    },
    undefined,
    fontTable
  );
  return new Uint8Array(
    await new Promise((resolve, reject) => {
      try {
        doc.getBuffer(resolve);
      } catch (error) {
        reject(error);
      }
    })
  );
}
