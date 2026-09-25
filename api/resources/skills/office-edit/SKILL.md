---
name: Edit Office documents
description: Changes existing Word (.docx), PowerPoint (.pptx) and Excel (.xlsx) files from this chat, uploaded or made earlier, and saves the updated version, with python-docx, python-pptx and openpyxl.
runtime: python
packages:
  - python-pptx
  - python-docx
  - openpyxl
---

Use this skill when the user wants a change to a document that is already in this chat: one they attached, or one an earlier answer made. Open the file by the path listed under "Files in this chat", change what was asked, keep everything else as it was, and save the result under a new name (the block's `file=`). To make a new document from scratch, use the pptx, pdf or xlsx skill instead.

You also get the document's text in the conversation. Use it to decide what to change, but work on the file itself, so that layouts, pictures, charts and formatting survive.

```python skill=office-edit file=review-updated.pptx
from pptx import Presentation
from pptx.util import Pt
from office_helpers import replace_text, duplicate_slide, move_slide, set_background, slide_texts, save

prs = Presentation("/files/<path from Files in this chat>.pptx")

replace_text(prs, "Q2 2026", "Q3 2026")

# a new slide in the style of slide 2, right after it
slide = duplicate_slide(prs, 1)
move_slide(prs, len(prs.slides) - 1, 2)
for shape in slide.shapes:
    if shape.has_text_frame and shape.text_frame.text.strip():
        shape.text_frame.text = "Next steps"
        break

set_background(prs, "FFF8E1")
save(prs, "review-updated.pptx")
```

Helpers in `office_helpers` (they take a python-pptx `Presentation` or a python-docx `Document`):

- `replace_text(doc, old, new)`: everywhere, tables and notes included, keeping the formatting; returns how many paragraphs changed.
- `set_font(doc, name, size_pt=None)`, `set_text_color(doc, "1F2933", headings_only=False)`: restyle all text; with `headings_only`, only headings (Word) or title placeholders (PowerPoint).
- PowerPoint: `slide_texts(prs)` → `[(index, text)]` to find a slide; `duplicate_slide(prs, index)` appends a copy and returns it; `move_slide(prs, old_index, new_index)`; `delete_slide(prs, index)`; `set_background(prs, "FFF8E1")`.
- `save(doc_or_workbook, "<file name>")` writes it to /output. It fails when nothing was changed compared with the file you opened: check what `replace_text` returns (0 means the text is not in the document) and use `slide_texts(prs)` to see the text a deck actually has before replacing it.
- The helpers are available without an import too.

Library essentials:

- python-pptx: `for shape in slide.shapes`, `shape.has_text_frame`, `shape.text_frame.paragraphs[i].runs[j].font` (`.name`, `.size = Pt(18)`, `.bold`, `.color.rgb = RGBColor.from_string("2E6BE6")`), `slide.shapes.add_textbox(left, top, width, height)` with `Inches`/`Pt` from `pptx.util`, `slide.notes_slide.notes_text_frame.text`.
- python-docx: `doc.paragraphs`, `doc.tables`, `doc.add_paragraph(text, style="List Bullet")`, `doc.add_heading(text, level)`, `paragraph.insert_paragraph_before(text)`, `run.font` as above with `docx.shared.Pt`/`RGBColor`.
- openpyxl: `wb = load_workbook("/files/....xlsx")` keeps formulas (`data_only=True` would read cached values but drop the formulas, so do not save such a workbook); `ws = wb["Sheet"]`, `ws["B2"] = 42`, `ws.append([...])`, `ws.insert_rows(idx)`; charts, styles and number formats are kept. openpyxl does not adjust formulas when rows or columns move: rewrite every formula that should cover the new cells (e.g. a total's `=SUM(B2:B4)`).
- Old binary formats (.doc, .ppt, .xls) and PDFs cannot be edited; say so and offer to make a new document instead.
- Finish with `save(...)` for every file the block names.
