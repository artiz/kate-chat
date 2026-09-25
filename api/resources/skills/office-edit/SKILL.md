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

When the user wants the content replaced (a new topic, their CV, another client), replace it completely: every old title, bullet and text box gets the new text or is deleted. Never add new paragraphs after the old ones or leave old text behind, and do not assign `text_frame.text` or `paragraph.text` (that drops the formatting): use `set_text`. Keep the slides' design (layouts, backgrounds, pictures that still fit), and delete or duplicate slides to match the amount of new content.

```python skill=office-edit file=review-updated.pptx
from pptx import Presentation
from office_helpers import set_text, shape_by_role, slide_shapes, delete_shape, delete_slide, duplicate_slide, move_slide, save

prs = Presentation("/files/<path from Files in this chat>.pptx")
for index in range(len(prs.slides)):
    print(index, slide_shapes(prs, index))  # (shape index, role, name, text): what each slide holds

# title slide: new title and subtitle, in the old look
title_slide = prs.slides[0]
set_text(shape_by_role(title_slide, "title"), "Q3 review")
set_text(shape_by_role(title_slide, "subtitle"), "Sales team · October 2026")

# a bullet slide: the whole list replaced, a sub-bullet as (text, level)
slide = prs.slides[1]
set_text(shape_by_role(slide, "title"), "Highlights")
set_text(shape_by_role(slide, "body"), ["Revenue up 18%", ("two new enterprise customers", 1), "Churn down to 2.1%"])
delete_shape(shape_by_role(slide, "body", 1))  # an old text box the new content has no use for

# an old slide the new content has no use for goes; one more bullet slide in the style of slide 1
delete_slide(prs, 2)
extra = duplicate_slide(prs, 1)
move_slide(prs, len(prs.slides) - 1, 2)
set_text(shape_by_role(extra, "title"), "Next steps")
set_text(shape_by_role(extra, "body"), ["Hire two engineers", "Open the Berlin office"])

save(prs, "review-updated.pptx")
```

Pick shapes with `shape_by_role`, never by position: `slide.shapes[0]` may well be a logo picture. Look at `slide_shapes` first to see which roles and texts a slide has (the example's slides are only an illustration), and leave pictures alone unless the user wants them changed.

Helpers in `office_helpers` (they take a python-pptx `Presentation` or a python-docx `Document`; all are available without an import too):

- `set_text(shape_or_paragraph, text)`: replaces ALL the text of a slide shape (or a Word paragraph), keeping its look. `text` is a string, or a list with one item per paragraph, where `(text, level)` is a sub-bullet. Text too long for its shape is shrunk to fit.
- `slide_shapes(prs, index)` → `[(shape index, role, name, text)]`, role being "title", "subtitle", "body", "picture", "table", "chart" or "other".
- `shape_by_role(slide, role, nth=0)`: the slide's `nth` shape with that role (from 0); raises, listing what the slide has, when there is none.
- `delete_shape(shape)`, `delete_slide(prs, index)`, `duplicate_slide(prs, index)` (appends a copy and returns it), `move_slide(prs, old_index, new_index)`; Word: `delete_paragraph(paragraph)`.
- `replace_text(doc, old, new)`: replaces a phrase wherever it occurs (tables and notes included), keeping the formatting; returns how many paragraphs changed. For small corrections, not for replacing content.
- `set_font(doc, name, size_pt=None)`, `set_text_color(doc, "1F2933", headings_only=False)`: restyle all text; with `headings_only`, only headings (Word) or title placeholders (PowerPoint). `set_background(prs, "FFF8E1")`. `slide_texts(prs)` → `[(index, text)]`.
- `save(doc_or_workbook, "<file name>")` writes it to /output. It fails when nothing was changed compared with the file you opened.

Library essentials:

- python-pptx: `for shape in slide.shapes`, `shape.has_text_frame`, `shape.text_frame.paragraphs[i].runs[j].font` (`.name`, `.size = Pt(18)`, `.bold`, `.color.rgb = RGBColor.from_string("2E6BE6")`), `slide.shapes.add_textbox(left, top, width, height)` with `Inches`/`Pt` from `pptx.util`, `slide.notes_slide.notes_text_frame.text`.
- python-docx: `doc.paragraphs`, `doc.tables`, `doc.add_paragraph(text, style="List Bullet")`, `doc.add_heading(text, level)`, `paragraph.insert_paragraph_before(text)`, `run.font` as above with `docx.shared.Pt`/`RGBColor`.
- openpyxl: `wb = load_workbook("/files/....xlsx")` keeps formulas (`data_only=True` would read cached values but drop the formulas, so do not save such a workbook); `ws = wb["Sheet"]`, `ws["B2"] = 42`, `ws.append([...])`, `ws.insert_rows(idx)`; charts, styles and number formats are kept. openpyxl does not adjust formulas when rows or columns move: rewrite every formula that should cover the new cells (e.g. a total's `=SUM(B2:B4)`).
- Old binary formats (.doc, .ppt, .xls) and PDFs cannot be edited; say so and offer to make a new document instead.
- Finish with `save(...)` for every file the block names.
