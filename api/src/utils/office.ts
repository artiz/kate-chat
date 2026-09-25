import { strFromU8, unzipSync } from "fflate";

/**
 * Plain text from Office Open XML documents (docx, xlsx, pptx), so a model can read one attached to
 * a message whatever its provider accepts: Bedrock takes docx and xlsx as documents but not pptx,
 * and OpenAI takes PDFs only. The files are zips of XML; only the text is read.
 */

export const OFFICE_MIME_TYPES = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;

export type OfficeKind = keyof typeof OFFICE_MIME_TYPES;

export const MAX_OFFICE_TEXT_LENGTH = 200_000;
const MAX_SHEET_ROWS = 2_000;

export function officeKind(mime?: string): OfficeKind | undefined {
  const m = (mime || "").split(";")[0].trim().toLowerCase();
  return (Object.keys(OFFICE_MIME_TYPES) as OfficeKind[]).find(kind => OFFICE_MIME_TYPES[kind] === m);
}

const decodeXml = (text: string) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** The text runs of one paragraph (<w:t> or <a:t>), with tabs and line breaks. */
function runsText(xml: string, ns: "w" | "a"): string {
  const pattern = new RegExp(`<${ns}:t(?:\\s[^>]*)?>([^<]*)</${ns}:t>|<${ns}:tab\\b[^>]*/>|<${ns}:br\\b[^>]*/>`, "g");
  let text = "";
  for (const match of xml.matchAll(pattern)) {
    if (match[1] !== undefined) text += decodeXml(match[1]);
    else text += match[0].includes(":tab") ? "\t" : "\n";
  }
  return text;
}

/** Paragraphs (<w:p> or <a:p>) in document order; self-closing ones are empty. */
function paragraphs(xml: string, ns: "w" | "a"): string[] {
  const pattern = new RegExp(`<${ns}:p\\b[^>]*/>|<${ns}:p\\b[^>]*>([\\s\\S]*?)</${ns}:p>`, "g");
  return [...xml.matchAll(pattern)].map(match => match[1] || "");
}

/**
 * Paragraph and table text in document order (<w:tbl>/<a:tbl> rows become "| a | b |" lines),
 * without slide-number fields. Headings come from `heading`, if given.
 */
function blocksText(xml: string, ns: "w" | "a", heading?: (paragraph: string) => number | undefined): string[] {
  const clean = xml.replace(new RegExp(`<${ns}:fld\\b[^>]*type="slidenum"[\\s\\S]*?</${ns}:fld>`, "g"), "");
  const pattern = new RegExp(
    `<${ns}:tbl\\b[\\s\\S]*?</${ns}:tbl>|<${ns}:p\\b[^>]*/>|<${ns}:p\\b[^>]*>[\\s\\S]*?</${ns}:p>`,
    "g"
  );
  const lines: string[] = [];
  for (const [block] of clean.matchAll(pattern)) {
    if (block.startsWith(`<${ns}:tbl`)) {
      for (const [row] of block.matchAll(new RegExp(`<${ns}:tr\\b[\\s\\S]*?</${ns}:tr>`, "g"))) {
        const cells = [...row.matchAll(new RegExp(`<${ns}:tc\\b[\\s\\S]*?</${ns}:tc>`, "g"))].map(([cell]) =>
          paragraphs(cell, ns)
            .map(paragraph => runsText(paragraph, ns).trim())
            .filter(Boolean)
            .join(" ")
        );
        lines.push(`| ${cells.join(" | ")} |`);
      }
      continue;
    }
    const text = runsText(block, ns);
    const level = text ? heading?.(block) : undefined;
    lines.push(level ? `${"#".repeat(level)} ${text}` : text);
  }
  return lines;
}

/** Relationship id → target path, resolved against the part the .rels file belongs to. */
function relationships(files: Record<string, Uint8Array>, part: string): Map<string, { target: string; type: string }> {
  const dir = part.slice(0, part.lastIndexOf("/") + 1);
  const relsPath = `${dir}_rels/${part.slice(dir.length)}.rels`;
  const rels = new Map<string, { target: string; type: string }>();
  const xml = files[relsPath] ? strFromU8(files[relsPath]) : "";
  for (const match of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = match[0].match(/\bId="([^"]+)"/)?.[1];
    const target = match[0].match(/\bTarget="([^"]+)"/)?.[1];
    const type = match[0].match(/\bType="([^"]+)"/)?.[1] || "";
    if (!id || !target) continue;
    const segments = (target.startsWith("/") ? target.slice(1) : dir + target).split("/");
    const resolved: string[] = [];
    for (const segment of segments) {
      if (segment === "..") resolved.pop();
      else if (segment && segment !== ".") resolved.push(segment);
    }
    rels.set(id, { target: resolved.join("/"), type });
  }
  return rels;
}

function docxText(files: Record<string, Uint8Array>): string {
  const xml = files["word/document.xml"] ? strFromU8(files["word/document.xml"]) : "";
  const heading = (paragraph: string) => {
    if (/<w:pStyle\s+w:val="Title"/.test(paragraph)) return 1;
    const level = paragraph.match(/<w:pStyle\s+w:val="[Hh]eading\s?(\d)"/)?.[1];
    return level ? Number(level) : undefined;
  };
  return blocksText(xml, "w", heading)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface ShapeNode {
  tag: string;
  start: number;
  end: number;
  children: ShapeNode[];
}

/** The shapes of a slide as a tree (groups hold their shapes), from the tags' nesting. */
function shapeTree(xml: string): ShapeNode[] {
  const roots: ShapeNode[] = [];
  const stack: ShapeNode[] = [];
  const tags = /<(\/?)(p:sp|p:pic|p:grpSp|p:graphicFrame|p:cxnSp)(?=[\s>/])[^>]*?(\/?)>/g;
  for (const match of xml.matchAll(tags)) {
    const [whole, closing, tag, selfClosing] = match;
    const index = match.index ?? 0;
    if (closing) {
      const node = stack.pop();
      if (node) node.end = index + whole.length;
      continue;
    }
    const node: ShapeNode = { tag, start: index, end: index + whole.length, children: [] };
    (stack.length ? stack[stack.length - 1].children : roots).push(node);
    if (!selfClosing) stack.push(node);
  }
  return roots;
}

interface ShapeInfo {
  role: string;
  name: string;
  lines: string[];
  size: number;
  top: number;
  children: ShapeInfo[];
}

function shapeInfo(xml: string, node: ShapeNode): ShapeInfo | undefined {
  const own = xml.slice(node.start, node.end);
  const name = decodeXml(own.match(/<p:cNvPr\b[^>]*\bname="([^"]*)"/)?.[1] || "");
  const base = { name, lines: [] as string[], size: 0, top: 0, children: [] as ShapeInfo[] };
  if (node.tag === "p:grpSp") {
    const children = node.children.map(child => shapeInfo(xml, child)).filter((c): c is ShapeInfo => !!c);
    return children.length ? { ...base, role: "group", children } : undefined;
  }
  if (node.tag === "p:pic") return { ...base, role: "picture" };
  if (node.tag === "p:graphicFrame") {
    if (own.includes("<a:tbl")) return { ...base, role: "table", lines: blocksText(own, "a").filter(l => l.trim()) };
    return own.includes("/chart") ? { ...base, role: "chart" } : undefined;
  }
  if (node.tag !== "p:sp") return undefined;

  const placeholder = own.match(/<p:ph\b[^>]*>/)?.[0];
  const type = placeholder?.match(/\btype="([^"]+)"/)?.[1];
  if (type === "pic") return { ...base, role: "picture" };
  if (type && ["sldNum", "dt", "ftr", "hdr"].includes(type)) return undefined; // slide number, date, footer
  const lines = blocksText(own, "a").filter(line => line.trim());
  if (!lines.length && !placeholder) return undefined;
  const role = type === "title" || type === "ctrTitle" ? "title" : type === "subTitle" ? "subtitle" : "body";
  const sizes = [...own.matchAll(/<a:(?:rPr|defRPr)\b[^>]*\bsz="(\d+)"/g)].map(m => Number(m[1]));
  const top = Number(own.match(/<a:off\b[^>]*\by="(-?\d+)"/)?.[1] || 0);
  return { ...base, role, lines, size: sizes.length ? Math.max(...sizes) : 0, top };
}

/**
 * A slide's shapes with their role, name and text, as the office-edit skill's helpers see them
 * (shape_by_name, shape_by_role), so a program can pick shapes by name instead of guessing. A
 * slide without a title placeholder gets its largest text as the title, as in the helpers.
 */
function slideShapesText(xml: string): string {
  const shapes = shapeTree(xml)
    .map(node => shapeInfo(xml, node))
    .filter((s): s is ShapeInfo => !!s);
  const all: ShapeInfo[] = [];
  const flatten = (list: ShapeInfo[]) =>
    list.forEach(shape => {
      all.push(shape);
      flatten(shape.children);
    });
  flatten(shapes);
  if (!all.some(shape => shape.role === "title")) {
    const texts = all.filter(shape => shape.role === "body" && shape.lines.length);
    const title = texts.sort((a, b) => b.size - a.size || a.top - b.top)[0];
    if (title) title.role = "title";
  }
  const render = (list: ShapeInfo[], indent: string): string[] =>
    list.flatMap(shape => {
      const head = `${indent}- ${shape.role} "${shape.name}"`;
      if (shape.role === "group") return [`${head}:`, ...render(shape.children, `${indent}  `)];
      if (!shape.lines.length) return [head];
      if (shape.lines.length === 1) return [`${head}: ${shape.lines[0]}`];
      return [`${head}:`, ...shape.lines.map(line => `${indent}    ${line}`)];
    });
  return render(shapes, "").join("\n");
}

function pptxText(files: Record<string, Uint8Array>): string {
  const presentation = files["ppt/presentation.xml"] ? strFromU8(files["ppt/presentation.xml"]) : "";
  const rels = relationships(files, "ppt/presentation.xml");
  let slides = [...presentation.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)]
    .map(match => rels.get(match[1])?.target)
    .filter((target): target is string => !!target && !!files[target]);
  if (!slides.length) {
    const number = (path: string) => Number(path.match(/(\d+)\.xml$/)?.[1] || 0);
    slides = Object.keys(files)
      .filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path))
      .sort((a, b) => number(a) - number(b));
  }

  const sections = slides.map((path, index) => {
    const text = (xml: string) =>
      blocksText(xml, "a")
        .filter(line => line.trim())
        .join("\n");
    const body = slideShapesText(strFromU8(files[path]));
    const notesPath = [...relationships(files, path).values()].find(rel => rel.type.endsWith("/notesSlide"))?.target;
    const notes = notesPath && files[notesPath] ? text(strFromU8(files[notesPath])) : "";
    return [`## Slide ${index + 1}`, body, notes ? `Notes: ${notes}` : ""].filter(Boolean).join("\n");
  });
  return sections.join("\n\n");
}

/** "BC12" → 54 (zero-based column index) */
function columnIndex(ref: string): number {
  let index = 0;
  for (const char of ref.replace(/\d+$/, "").toUpperCase()) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function xlsxText(files: Record<string, Uint8Array>): string {
  const shared = files["xl/sharedStrings.xml"]
    ? [...strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(match =>
        [...match[1].matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map(t => decodeXml(t[1])).join("")
      )
    : [];
  const workbook = files["xl/workbook.xml"] ? strFromU8(files["xl/workbook.xml"]) : "";
  const rels = relationships(files, "xl/workbook.xml");

  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map(match => ({
    name: decodeXml(match[0].match(/\bname="([^"]*)"/)?.[1] || "Sheet"),
    path: rels.get(match[0].match(/\br:id="([^"]+)"/)?.[1] || "")?.target,
  }));

  return sheets
    .filter(sheet => sheet.path && files[sheet.path])
    .map(sheet => {
      const xml = strFromU8(files[sheet.path as string]);
      const rows: string[] = [];
      for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        if (rows.length >= MAX_SHEET_ROWS) {
          rows.push(`... (more rows than ${MAX_SHEET_ROWS})`);
          break;
        }
        const cells: string[] = [];
        for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const attributes = cell[1];
          const body = cell[2] || "";
          const ref = attributes.match(/\br="([A-Z]+\d+)"/)?.[1];
          const type = attributes.match(/\bt="([^"]+)"/)?.[1];
          const raw = body.match(/<v>([^<]*)<\/v>/)?.[1];
          let value = "";
          if (type === "s" && raw !== undefined) value = shared[Number(raw)] ?? "";
          else if (type === "inlineStr")
            value = [...body.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map(t => decodeXml(t[1])).join("");
          else if (type === "b" && raw !== undefined) value = raw === "1" ? "TRUE" : "FALSE";
          else if (raw !== undefined) value = decodeXml(raw);
          else {
            // a formula saved without its result (openpyxl does that): show the formula
            const formula = body.match(/<f(?:\s[^>]*)?>([^<]*)<\/f>/)?.[1];
            if (formula) value = `=${decodeXml(formula)}`;
          }
          const index = ref ? columnIndex(ref) : cells.length;
          while (cells.length < index) cells.push("");
          cells[index] = csvCell(value);
        }
        while (cells.length && !cells[cells.length - 1]) cells.pop(); // formatted but empty cells
        if (cells.length) rows.push(cells.join(","));
      }
      return `## Sheet "${sheet.name}"\n${rows.join("\n")}`;
    })
    .join("\n\n");
}

/** The document's text, cut at MAX_OFFICE_TEXT_LENGTH characters; throws if the file is not a readable zip. */
export function extractOfficeText(kind: OfficeKind, bytes: Uint8Array): string {
  const files = unzipSync(bytes, {
    filter: file =>
      file.name.endsWith(".xml") || file.name.endsWith(".rels")
        ? /^(word\/document|ppt\/(presentation|slides\/|notesSlides\/|_rels\/)|xl\/(workbook|sharedStrings|worksheets\/|_rels\/))/.test(
            file.name
          )
        : false,
  });
  const text = kind === "docx" ? docxText(files) : kind === "pptx" ? pptxText(files) : xlsxText(files);
  return text.length > MAX_OFFICE_TEXT_LENGTH
    ? `${text.slice(0, MAX_OFFICE_TEXT_LENGTH)}\n\n[The document is longer; the rest is not included.]`
    : text;
}
