"""Helpers for changing existing Word, PowerPoint and Excel files with python-docx, python-pptx and openpyxl."""

import copy
import os

from pptx.dml.color import RGBColor as PptxRGB

OUTPUT_DIR = "/output"  # where the sandbox collects the program's files


def _paragraphs(container):
    """Every paragraph of a python-docx document or a python-pptx presentation, tables included."""
    if hasattr(container, "slides"):  # a presentation
        for slide in container.slides:
            yield from _slide_paragraphs(slide)
        return
    parts = [container]
    for section in getattr(container, "sections", []):
        parts += [section.header, section.footer]
    for part in parts:
        yield from part.paragraphs
        for table in part.tables:
            for row in table.rows:
                for cell in row.cells:
                    yield from cell.paragraphs


def _slide_paragraphs(slide):
    for shape in slide.shapes:
        if shape.has_text_frame:
            yield from shape.text_frame.paragraphs
        if getattr(shape, "has_table", False) and shape.has_table:
            for row in shape.table.rows:
                for cell in row.cells:
                    yield from cell.text_frame.paragraphs
    if slide.has_notes_slide:
        yield from slide.notes_slide.notes_text_frame.paragraphs


def replace_text(container, old, new):
    """Replaces text everywhere in a document or presentation, keeping the formatting.

    Text split across runs (e.g. partly bold) is found too; the replaced paragraph then takes the
    formatting of its first run. Returns how many paragraphs changed.
    """
    changed = 0
    for paragraph in _paragraphs(container):
        runs = list(paragraph.runs)
        if not runs:
            continue
        text = "".join(run.text for run in runs)
        if old not in text:
            continue
        # prefer a replacement inside single runs, which keeps mixed formatting
        if all(old not in run.text for run in runs) or text.count(old) != sum(run.text.count(old) for run in runs):
            runs[0].text = text.replace(old, new)
            for run in runs[1:]:
                run.text = ""
        else:
            for run in runs:
                run.text = run.text.replace(old, new)
        changed += 1
    return changed


def set_font(container, name, size_pt=None):
    """Sets the font (and optionally the size in points) of all text in a document or presentation."""
    from docx.shared import Pt as DocxPt
    from pptx.util import Pt as PptxPt

    is_pptx = hasattr(container, "slides")
    for paragraph in _paragraphs(container):
        for run in paragraph.runs:
            run.font.name = name
            if size_pt:
                run.font.size = PptxPt(size_pt) if is_pptx else DocxPt(size_pt)
    if not is_pptx:
        for style in container.styles:
            if getattr(style, "font", None) is not None:
                style.font.name = name


def set_text_color(container, hex_color, headings_only=False):
    """Colours all text ("1F2933"), or only titles/headings with headings_only=True."""
    from docx.shared import RGBColor as DocxRGB

    is_pptx = hasattr(container, "slides")
    if is_pptx:
        for slide in container.slides:
            for shape in slide.shapes:
                if not shape.has_text_frame:
                    continue
                is_title = shape.is_placeholder and "title" in str(shape.placeholder_format.type).lower()
                if headings_only and not is_title:
                    continue
                for paragraph in shape.text_frame.paragraphs:
                    for run in paragraph.runs:
                        run.font.color.rgb = PptxRGB.from_string(hex_color)
        return
    for paragraph in _paragraphs(container):
        style = (paragraph.style.name if paragraph.style is not None else "").lower()
        if headings_only and not (style.startswith("heading") or style == "title"):
            continue
        for run in paragraph.runs:
            run.font.color.rgb = DocxRGB.from_string(hex_color)


def set_background(prs, hex_color):
    """Gives every slide of a presentation a solid background colour ("FFF8E1")."""
    for slide in prs.slides:
        fill = slide.background.fill
        fill.solid()
        fill.fore_color.rgb = PptxRGB.from_string(hex_color)


def slide_texts(prs):
    """The text of each slide, for finding the one to change: [(index, "title\\nbody...")]."""
    return [
        (index, "\n".join(p.text for p in _slide_paragraphs(slide) if p.text.strip()))
        for index, slide in enumerate(prs.slides)
    ]


def duplicate_slide(prs, index):
    """Appends a copy of slide `index` (shapes, pictures, charts, background) and returns it.

    Move it into place with move_slide. A copied chart shares its data with the original.
    """
    source = prs.slides[index]
    duplicate = prs.slides.add_slide(source.slide_layout)
    for shape in list(duplicate.shapes):
        shape._element.getparent().remove(shape._element)

    # pictures, charts and links point at parts through relationship ids: give the copy the same
    # relationships and rewrite the ids in the copied shapes
    ids = {}
    for rel_id, rel in source.part.rels.items():
        if rel.reltype.endswith("/notesSlide") or rel.reltype.endswith("/slideLayout"):
            continue
        if rel.is_external:
            ids[rel_id] = duplicate.part.rels.get_or_add_ext_rel(rel.reltype, rel.target_ref)
        else:
            ids[rel_id] = duplicate.part.rels.get_or_add(rel.reltype, rel.target_part)

    def remap(element):
        for node in element.iter():
            for name, value in list(node.attrib.items()):
                if name.rsplit("}", 1)[-1] in ("embed", "id", "link", "pict") and value in ids:
                    node.set(name, ids[value])
        return element

    for shape in source.shapes:
        duplicate.shapes._spTree.insert_element_before(remap(copy.deepcopy(shape._element)), "p:extLst")
    background = source._element.cSld.bg
    if background is not None:
        duplicate._element.cSld.insert(0, remap(copy.deepcopy(background)))
    return duplicate


def delete_slide(prs, index):
    """Removes slide `index`."""
    slide_ids = prs.slides._sldIdLst
    slide_id = slide_ids[index]
    prs.part.drop_rel(slide_id.rId)
    slide_ids.remove(slide_id)


def move_slide(prs, old_index, new_index):
    """Moves a slide to another position (indexes from 0; -1 is the end)."""
    slide_ids = prs.slides._sldIdLst
    slide_id = slide_ids[old_index]
    slide_ids.remove(slide_id)
    if new_index < 0:
        new_index = len(slide_ids) + 1 + new_index
    slide_ids.insert(new_index, slide_id)


def save(document, file_name):
    """Saves a python-docx document, python-pptx presentation or openpyxl workbook to /output/<file_name>."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, os.path.basename(file_name))
    document.save(path)
    return path
