import { strToU8, zipSync } from "fflate";
import { extractOfficeText, MAX_OFFICE_TEXT_LENGTH, officeKind, OFFICE_MIME_TYPES } from "../office";

const zip = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([name, xml]) => [name, strToU8(xml)])));

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';

describe("officeKind", () => {
  it("knows the three Office Open XML types, and only those", () => {
    expect(officeKind(OFFICE_MIME_TYPES.docx)).toBe("docx");
    expect(officeKind(`${OFFICE_MIME_TYPES.pptx}; charset=binary`)).toBe("pptx");
    expect(officeKind("application/vnd.ms-excel")).toBeUndefined();
    expect(officeKind("application/pdf")).toBeUndefined();
  });
});

describe("extractOfficeText", () => {
  it("reads a Word document: headings, runs, tabs, tables and entities", () => {
    const bytes = zip({
      "word/document.xml": `<w:document ${W}><w:body>
        <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Report</w:t></w:r></w:p>
        <w:p><w:r><w:t xml:space="preserve">Revenue grew </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>18%</w:t></w:r><w:r><w:tab/><w:t>&amp; more &lt;fast&gt;</w:t></w:r></w:p>
        <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Регионы</w:t></w:r></w:p>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>EMEA</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1.4M</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        <w:p/>
      </w:body></w:document>`,
    });
    expect(extractOfficeText("docx", bytes)).toBe(
      "# Report\nRevenue grew 18%\t& more <fast>\n## Регионы\n| EMEA | 1.4M |"
    );
  });

  it("reads slides in presentation order, with tables and notes, without slide numbers", () => {
    const slide = (body: string) => `<p:sld xmlns:p="p" ${A}><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;
    const bytes = zip({
      "ppt/presentation.xml": `<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>`,
      "ppt/_rels/presentation.xml.rels": `<Relationships><Relationship Id="rId2" Type="x/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="x/slide" Target="slides/slide2.xml"/></Relationships>`,
      "ppt/slides/slide1.xml": slide(
        `<a:p><a:r><a:t>Second</a:t></a:r></a:p><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Q2</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>1.2M</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl>`
      ),
      "ppt/slides/slide2.xml": slide(
        `<a:p><a:r><a:t>First</a:t></a:r></a:p><a:p><a:fld id="{1}" type="slidenum"><a:t>1</a:t></a:fld></a:p>`
      ),
      "ppt/slides/_rels/slide2.xml.rels": `<Relationships><Relationship Id="rId9" Type="http://x/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`,
      "ppt/notesSlides/notesSlide1.xml": slide(`<a:p><a:r><a:t>Say hello</a:t></a:r></a:p>`),
    });
    expect(extractOfficeText("pptx", bytes)).toBe(
      "## Slide 1\nFirst\nNotes: Say hello\n\n## Slide 2\nSecond\n| Q2 | 1.2M |"
    );
  });

  it("reads each sheet as rows: shared and inline strings, numbers, booleans, formulas without a value", () => {
    const bytes = zip({
      "xl/workbook.xml": `<workbook xmlns:r="r"><sheets><sheet name="Sales &amp; costs" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      "xl/sharedStrings.xml": `<sst><si><t>Month</t></si><si><r><t>Reve</t></r><r><t>nue</t></r></si><si><t>Jan, Feb</t></si></sst>`,
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
        <row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>42.5</v></c><c r="D2" t="b"><v>1</v></c></row>
        <row r="3"><c r="A3" t="inlineStr"><is><t>Total</t></is></c><c r="B3"><f>SUM(B2:B2)</f></c><c r="C3" s="1"/></row>
      </sheetData></worksheet>`,
    });
    expect(extractOfficeText("xlsx", bytes)).toBe(
      '## Sheet "Sales & costs"\nMonth,Revenue\n"Jan, Feb",,42.5,TRUE\nTotal,=SUM(B2:B2)'
    );
  });

  it("cuts very long documents", () => {
    const long = "x".repeat(MAX_OFFICE_TEXT_LENGTH + 10);
    const bytes = zip({
      "word/document.xml": `<w:document ${W}><w:body><w:p><w:r><w:t>${long}</w:t></w:r></w:p></w:body></w:document>`,
    });
    const text = extractOfficeText("docx", bytes);
    expect(text.length).toBeLessThan(MAX_OFFICE_TEXT_LENGTH + 100);
    expect(text).toMatch(/the rest is not included\.\]$/);
  });

  it("throws for a file that is not a zip", () => {
    expect(() => extractOfficeText("docx", strToU8("not a zip"))).toThrow();
  });
});
