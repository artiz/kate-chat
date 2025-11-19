import os
import time
import logging
import json
from tabulate import tabulate
from pathlib import Path
from typing import Iterable, List, Union

from docling.backend.docling_parse_v2_backend import DoclingParseV2DocumentBackend
from docling.backend.msword_backend import MsWordDocumentBackend
from docling.backend.md_backend import MarkdownDocumentBackend
from docling.backend.html_backend import HTMLDocumentBackend
from docling.datamodel.base_models import ConversionStatus
from docling.datamodel.document import ConversionResult

from docling.document_converter import DocumentConverter, FormatOption
from docling.datamodel.pipeline_options import (
    PdfPipelineOptions,
    AcceleratorOptions,
    AcceleratorDevice,
    TableFormerMode,
    EasyOcrOptions,
)
from docling.datamodel.base_models import InputFormat
from docling.pipeline.standard_pdf_pipeline import StandardPdfPipeline
from docling.pipeline.simple_pipeline import SimplePipeline
from docling.datamodel.base_models import ConversionStatus, DocumentStream
from app.core.config import settings


# Basic ideas got from https://github.com/IlyaRice/RAG-Challenge-2
# Kudos to @IlyaRice

_log = logging.getLogger(__name__)

NOTDEF = "/.notdef"

class PDFParser:
    def __init__(
        self,
        pdf_backend=DoclingParseV2DocumentBackend,
        msword_backend=MsWordDocumentBackend,
        html_backend=HTMLDocumentBackend,
        md_backend=MarkdownDocumentBackend,
        output_dir: Path = Path("./parsed_pdfs"),
    ):
        os.environ["OMP_NUM_THREADS"] = str(settings.num_threads)
        
        self.pdf_backend = pdf_backend
        self.msword_backend = msword_backend
        self.html_backend = html_backend
        self.md_backend = md_backend
        self.output_dir = output_dir
        self.doc_converter = self._create_document_converter()
        self.ocr_doc_converter = self._create_document_converter(True)

    def _create_document_converter(
        self, use_full_ocr: bool = False
    ) -> "DocumentConverter":
        """Creates and returns a DocumentConverter with default pipeline options."""

        pipeline_options = PdfPipelineOptions()
        pipeline_options.do_ocr = True
        ocr_options = EasyOcrOptions(force_full_page_ocr=use_full_ocr)
        pipeline_options.ocr_options = ocr_options
        pipeline_options.do_table_structure = True
        pipeline_options.table_structure_options.do_cell_matching = True
        pipeline_options.table_structure_options.mode = TableFormerMode.ACCURATE
        
        format_options = {
            # PDF format
            InputFormat.PDF: FormatOption(
                pipeline_cls=StandardPdfPipeline,
                pipeline_options=pipeline_options,
                backend=self.pdf_backend,
            ),
            # DOCX format
            InputFormat.DOCX: FormatOption(
                pipeline_cls=SimplePipeline, backend=self.msword_backend
            ),
            # HTML format
            InputFormat.HTML: FormatOption(
                pipeline_cls=SimplePipeline, backend=self.html_backend
            ),
            InputFormat.MD: FormatOption(
                pipeline_cls=SimplePipeline, backend=self.md_backend
            ),
            InputFormat.ASCIIDOC: FormatOption(
                pipeline_cls=SimplePipeline, backend=self.md_backend
            ),
        }

        return DocumentConverter(format_options=format_options)

    def convert_documents(
        self, input_doc_paths: List[Union[Path, str, DocumentStream]]
    ) -> Iterable[ConversionResult]:
        conv_results = self.doc_converter.convert(source=input_doc_paths)
        return conv_results

    def convert_document(
        self, input_doc: Union[Path, str, DocumentStream]
    ) -> ConversionResult:
        res = self.doc_converter.convert(source=input_doc)
        if (
            res.status == ConversionStatus.SUCCESS
            and len(res.document.pages) > 1
            and not res.document.texts
        ):
            _log.warning(f"Document {input_doc} was converted but has no text.")
            res = self.ocr_doc_converter.convert(source=input_doc)
        return res

    def process_documents(self, conv_results: Iterable[ConversionResult]):
        if self.output_dir is not None:
            self.output_dir.mkdir(parents=True, exist_ok=True)
        success_count = 0
        failure_count = 0

        for conv_res in conv_results:
            if conv_res.status == ConversionStatus.SUCCESS:
                success_count += 1
                processor = JsonReportProcessor()

                # Normalize the document data to ensure sequential pages
                data = conv_res.document.export_to_dict()
                normalized_data = self._normalize_page_sequence(data)

                processed_report = processor.assemble_report(conv_res, normalized_data)
                doc_filename = conv_res.input.file.stem
                if self.output_dir is not None:
                    with (self.output_dir / f"{doc_filename}.json").open(
                        "w", encoding="utf-8"
                    ) as fp:
                        json.dump(processed_report, fp, indent=2, ensure_ascii=False)
            else:
                failure_count += 1
                _log.info(f"Document {conv_res.input.file} failed to convert.")

        _log.info(
            f"Processed {success_count + failure_count} docs, of which {failure_count} failed"
        )
        return success_count, failure_count

    def _normalize_page_sequence(self, data: dict) -> dict:
        """Ensure that page numbers in content are sequential by filling gaps with empty pages."""
        if "content" not in data:
            return data

        # Create a copy of the data to modify
        normalized_data = data.copy()

        # Get existing page numbers and find max page
        existing_pages = {page["page"] for page in data["content"]}
        max_page = max(existing_pages)

        # Create template for empty page
        empty_page_template = {
            "content": [],
            "page_dimensions": {},  # or some default dimensions if needed
        }

        # Create new content array with all pages
        new_content = []
        for page_num in range(1, max_page + 1):
            # Find existing page or create empty one
            page_content = next(
                (page for page in data["content"] if page["page"] == page_num),
                {"page": page_num, **empty_page_template},
            )
            new_content.append(page_content)

        normalized_data["content"] = new_content
        return normalized_data

    def parse_and_export(
        self, input_doc_paths: List[Path] = None, doc_dir: Path = None
    ):
        start_time = time.time()
        if input_doc_paths is None and doc_dir is not None:
            input_doc_paths = list(doc_dir.glob("*.pdf"))

        total_docs = len(input_doc_paths)
        _log.info(f"Starting to process {total_docs} documents")

        conv_results = self.convert_documents(input_doc_paths)
        success_count, failure_count = self.process_documents(conv_results=conv_results)
        elapsed_time = time.time() - start_time

        if failure_count > 0:
            error_message = (
                f"Failed converting {failure_count} out of {total_docs} documents."
            )
            failed_docs = "Paths of failed docs:\n" + "\n".join(
                str(path) for path in input_doc_paths
            )
            _log.error(error_message)
            _log.error(failed_docs)
            raise RuntimeError(error_message)

        _log.info(
            f"{'#'*50}\nCompleted in {elapsed_time:.2f} seconds. Successfully converted {success_count}/{total_docs} documents.\n{'#'*50}"
        )


class JsonReportProcessor:
    def __init__(self):
        pass

    def assemble_report(self, conv_result: ConversionResult, normalized_data=None):
        """Assemble the report using either normalized data or raw conversion result."""
        data = (
            normalized_data
            if normalized_data is not None
            else conv_result.document.export_to_dict()
        )
        assembled_report = {}
        assembled_report["metainfo"] = self.assemble_metainfo(data)
        assembled_report["content"] = self.assemble_content(data)
        assembled_report["tables"] = self.assemble_tables(
            conv_result.document.tables, conv_result.document, data
        )
        assembled_report["pictures"] = self.assemble_pictures(data)
        return assembled_report

    def assemble_metainfo(self, data):
        metainfo = {}
        sha1_name = data["origin"]["filename"].rsplit(".", 1)[0]
        metainfo["sha1_name"] = sha1_name
        metainfo["pages_amount"] = len(data.get("pages", []))
        metainfo["text_blocks_amount"] = len(data.get("texts", []))
        metainfo["tables_amount"] = len(data.get("tables", []))
        metainfo["pictures_amount"] = len(data.get("pictures", []))
        metainfo["equations_amount"] = len(data.get("equations", []))
        metainfo["footnotes_amount"] = len(
            [t for t in data.get("texts", []) if t.get("label") == "footnote"]
        )

        return metainfo

    def process_table(self, table_data):
        # Implement your table processing logic here
        return "processed_table_content"

    def expand_groups(self, body_children, groups):
        expanded_children = []

        for item in body_children:
            if isinstance(item, dict) and "$ref" in item:
                ref = item["$ref"]
                ref_type, ref_num = ref.split("/")[-2:]
                ref_num = int(ref_num)

                if ref_type == "groups":
                    group = groups[ref_num]
                    group_id = ref_num
                    group_name = group.get("name", "")
                    group_label = group.get("label", "")

                    for child in group["children"]:
                        child_copy = child.copy()
                        child_copy["group_id"] = group_id
                        child_copy["group_name"] = group_name
                        child_copy["group_label"] = group_label
                        expanded_children.append(child_copy)
                else:
                    expanded_children.append(item)
            else:
                expanded_children.append(item)

        return expanded_children

    def _normalize_pdf_text(self, text: str) -> str:
        return text.replace(NOTDEF, " ") if text else ""

    def _process_text_reference(self, ref_num, data):
        """Helper method to process text references and create content items.

        Args:
            ref_num (int): Reference number for the text item
            data (dict): Document data dictionary

        Returns:
            dict: Processed content item with text information
        """
        text_item = data["texts"][ref_num]
        item_type = text_item["label"]
        text = self._normalize_pdf_text(text_item.get("text", ""))

        content_item = {"text": text, "type": item_type, "text_id": ref_num}

        # Add 'orig' field only if it differs from 'text'
        orig_content = text_item.get("orig", "")
        if orig_content != text_item.get("text", ""):
            content_item["orig"] = orig_content

        # Add additional fields if they exist
        if "enumerated" in text_item:
            content_item["enumerated"] = text_item["enumerated"]
        if "marker" in text_item:
            content_item["marker"] = text_item["marker"]

        return content_item

    def _process_text_children_recursively(
        self, text_item, data, pages, parent_group_info=None
    ):
        """Recursively process text item and its children to extract all content."""
        # Process the current text item
        ref_num = int(text_item["self_ref"].split("/")[-1])
        content_item = self._process_text_reference(ref_num, data)

        # Add group information if available
        if parent_group_info:
            content_item.update(parent_group_info)

        # Get page number from prov, default to page 1 for documents without pages
        if "prov" in text_item and text_item["prov"]:
            page_num = text_item["prov"][0]["page_no"]
            page_dimensions = text_item["prov"][0].get("bbox", {})
        else:
            page_num = 1  # Default to page 1 for documents without pages
            page_dimensions = {}

        # Initialize page if not exists
        if page_num not in pages:
            pages[page_num] = {
                "page": page_num,
                "content": [],
                "page_dimensions": page_dimensions,
            }

        pages[page_num]["content"].append(content_item)

        # Recursively process children
        for child in text_item.get("children", []):
            if isinstance(child, dict) and "$ref" in child:
                child_ref = child["$ref"]
                child_ref_type, child_ref_num = child_ref.split("/")[-2:]
                child_ref_num = int(child_ref_num)

                if child_ref_type == "texts":
                    child_text_item = data["texts"][child_ref_num]
                    self._process_text_children_recursively(
                        child_text_item, data, pages, parent_group_info
                    )

    def assemble_content(self, data):
        pages = {}
        # Expand body children to include group references
        body_children = data["body"]["children"]
        groups = data.get("groups", [])
        expanded_body_children = self.expand_groups(body_children, groups)

        # Process body content
        for item in expanded_body_children:
            if isinstance(item, dict) and "$ref" in item:
                ref = item["$ref"]
                ref_type, ref_num = ref.split("/")[-2:]
                ref_num = int(ref_num)

                if ref_type == "texts":
                    text_item = data["texts"][ref_num]

                    # Prepare group information if available
                    group_info = {}
                    if "group_id" in item:
                        group_info = {
                            "group_id": item["group_id"],
                            "group_name": item["group_name"],
                            "group_label": item["group_label"],
                        }

                    # Process this text item and all its children recursively
                    self._process_text_children_recursively(
                        text_item, data, pages, group_info
                    )

                elif ref_type == "tables":
                    table_item = data["tables"][ref_num]
                    content_item = {"type": "table", "table_id": ref_num}

                    if "prov" in table_item and table_item["prov"]:
                        page_num = table_item["prov"][0]["page_no"]
                        page_dimensions = table_item["prov"][0].get("bbox", {})
                    else:
                        page_num = 1  # Default to page 1 for documents without pages
                        page_dimensions = {}

                    if page_num not in pages:
                        pages[page_num] = {
                            "page": page_num,
                            "content": [],
                            "page_dimensions": page_dimensions,
                        }

                    pages[page_num]["content"].append(content_item)

                elif ref_type == "pictures":
                    picture_item = data["pictures"][ref_num]
                    content_item = {"type": "picture", "picture_id": ref_num}

                    if "prov" in picture_item and picture_item["prov"]:
                        page_num = picture_item["prov"][0]["page_no"]
                        page_dimensions = picture_item["prov"][0].get("bbox", {})
                    else:
                        page_num = 1  # Default to page 1 for documents without pages
                        page_dimensions = {}

                    if page_num not in pages:
                        pages[page_num] = {
                            "page": page_num,
                            "content": [],
                            "page_dimensions": page_dimensions,
                        }

                    pages[page_num]["content"].append(content_item)

        sorted_pages = [pages[page_num] for page_num in sorted(pages.keys())]
        return sorted_pages

    def assemble_tables(self, tables, doc, data):
        assembled_tables = []
        for i, table in enumerate(tables):
            table_json_obj = table.model_dump()
            table_md = self._table_to_md(table_json_obj)
            table_html = table.export_to_html(doc)

            table_data = data["tables"][i]

            # Handle documents without page numbers (like HTML)
            if "prov" in table_data and table_data["prov"]:
                table_page_num = table_data["prov"][0]["page_no"]
                table_bbox = table_data["prov"][0]["bbox"]
                table_bbox = [
                    table_bbox["l"],
                    table_bbox["t"],
                    table_bbox["r"],
                    table_bbox["b"],
                ]
            else:
                table_page_num = 1  # Default to page 1 for documents without pages
                table_bbox = [0, 0, 0, 0]  # Default bbox

            # Get rows and columns from the table data structure
            nrows = table_data["data"]["num_rows"]
            ncols = table_data["data"]["num_cols"]

            ref_num = table_data["self_ref"].split("/")[-1]
            ref_num = int(ref_num)

            table_obj = {
                "table_id": ref_num,
                "page": table_page_num,
                "bbox": table_bbox,
                "#-rows": nrows,
                "#-cols": ncols,
                "markdown": table_md,
                "html": table_html,
                "json": table_json_obj,
            }
            assembled_tables.append(table_obj)
        return assembled_tables

    def _table_to_md(self, table):
        # Extract text from grid cells
        table_data = []
        for row in table["data"]["grid"]:
            table_row = [self._normalize_pdf_text(cell["text"]) for cell in row]
            table_data.append(table_row)

        # Check if the table has headers
        if len(table_data) > 1 and len(table_data[0]) > 0:
            try:
                md_table = tabulate(
                    table_data[1:], headers=table_data[0], tablefmt="github"
                )
            except ValueError:
                md_table = tabulate(
                    table_data[1:],
                    headers=table_data[0],
                    tablefmt="github",
                    disable_numparse=True,
                )
        else:
            md_table = tabulate(table_data, tablefmt="github")

        return md_table

    def assemble_pictures(self, data):
        assembled_pictures = []
        for i, picture in enumerate(data["pictures"]):
            children_list = self._process_picture_block(picture, data)

            ref_num = picture["self_ref"].split("/")[-1]
            ref_num = int(ref_num)

            # Handle documents without page numbers (like HTML)
            if "prov" in picture and picture["prov"]:
                picture_page_num = picture["prov"][0]["page_no"]
                picture_bbox = picture["prov"][0]["bbox"]
                picture_bbox = [
                    picture_bbox["l"],
                    picture_bbox["t"],
                    picture_bbox["r"],
                    picture_bbox["b"],
                ]
            else:
                picture_page_num = 1  # Default to page 1 for documents without pages
                picture_bbox = [0, 0, 0, 0]  # Default bbox

            picture_obj = {
                "picture_id": ref_num,
                "page": picture_page_num,
                "bbox": picture_bbox,
                "children": children_list,
            }
            assembled_pictures.append(picture_obj)
        return assembled_pictures

    def _process_picture_block(self, picture, data):
        children_list = []

        for item in picture["children"]:
            if isinstance(item, dict) and "$ref" in item:
                ref = item["$ref"]
                ref_type, ref_num = ref.split("/")[-2:]
                ref_num = int(ref_num)

                if ref_type == "texts":
                    content_item = self._process_text_reference(ref_num, data)

                    children_list.append(content_item)

        return children_list


def main():
    """Default entry point to parse multiple documents and output results to console."""

    # Set up logging to see processing information
    logging.basicConfig(level=logging.INFO)

    # Define paths to the files to parse
    data_dir = Path(__file__).parent.parent / "data" / "train"
    files_to_parse = [
        data_dir / "dummy_report.pdf",
        # data_dir / "DDD Quickly (Avram, Marinesku).pdf",
        data_dir / "Apple.docx",
        data_dir / "Austria - Wikipedia.html"
    ]

    # Check which files exist

    print("=" * 60)
    print(f"Starting to parse {len(files_to_parse)} documents...")
    print("=" * 60)

    # Create document parser instance (renamed from PDFParser to reflect multi-format support)
    parser = PDFParser()

    try:
        # Convert all documents
        conv_results = [
            parser.convert_document(file_path) for file_path in files_to_parse
        ]

        if not conv_results:
            print("No conversion results returned")
            return

        # Process each document
        processor = JsonReportProcessor()

        for i, conv_result in enumerate(conv_results):
            file_path = files_to_parse[i]
            print(f"\n{'='*60}")
            print(f"PROCESSING: {file_path.name}")
            print(f"{'='*60}")

            if conv_result.status != ConversionStatus.SUCCESS:
                print(f"❌ Conversion failed with status: {conv_result.status}")
                continue

            print(f"✅ Conversion successful!")

            # Get the document data
            data = conv_result.document.export_to_dict()

            normalized_data = parser._normalize_page_sequence(data)
            processed_report = processor.assemble_report(conv_result, normalized_data)

            # Output results to console
            print(f"\n📊 DOCUMENT METADATA:")
            print("-" * 40)
            metainfo = processed_report["metainfo"]
            for key, value in metainfo.items():
                print(f"  {key}: {value}")

            print(f"\n📄 PAGE CONTENT:")
            print("-" * 40)
            for page in processed_report["content"]:
                print(f"\n  Page {page['page']}:")
                for content_item in page["content"]:
                    if content_item["type"] == "table":
                        print(f"    [TABLE] table_id: {content_item['table_id']}")
                    elif content_item["type"] == "picture":
                        print(f"    [PICTURE] picture_id: {content_item['picture_id']}")
                    else:
                        # Text content
                        text = (
                            content_item["text"][:80] + "..."
                            if len(content_item["text"]) > 80
                            else content_item["text"]
                        )
                        print(f"    [{content_item['type'].upper()}] {text}")

            if processed_report["tables"]:
                print(f"\n📋 TABLES FOUND: {len(processed_report['tables'])}")
                print("-" * 40)
                for table in processed_report["tables"]:
                    print(
                        f"  Table {table['table_id']} on page {table['page']} ({table['#-rows']}x{table['#-cols']}):"
                    )
                    # Show just first few lines of markdown table to avoid clutter
                    table_lines = table["markdown"].split("\n")
                    for line in table_lines[:5]:  # Show first 5 lines
                        print(f"    {line}")
                    if len(table_lines) > 5:
                        print(f"    ... ({len(table_lines)-5} more lines)")
                    print()

            if processed_report["pictures"]:
                print(f"\n🖼️ PICTURES FOUND: {len(processed_report['pictures'])}")
                print("-" * 40)
                for picture in processed_report["pictures"]:
                    print(
                        f"  Picture {picture['picture_id']} on page {picture['page']}:"
                    )
                    for child in picture["children"]:
                        text = (
                            child["text"][:80] + "..."
                            if len(child["text"]) > 80
                            else child["text"]
                        )
                        print(f"    {text}")
                    print()

        print("=" * 60)
        print("🎉 All documents processed successfully!")
        print("=" * 60)

    except Exception as e:
        print(f"❌ Error during parsing: {str(e)}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    main()
