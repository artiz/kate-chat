import asyncio
import contextlib
import io
import json
import logging
import tempfile
from pathlib import Path
from typing import Callable, Dict, Any, Optional, Tuple, List
from redis.asyncio.client import Redis
import boto3
from botocore.exceptions import ClientError
from pypdf import PdfReader, PdfWriter
from dataclasses import dataclass

from app.core.config import settings
from app.core.global_app import redis_connection_pool
from app.parser import JsonReportProcessor
from app.services.parser_worker import WorkerPool, WorkerPoolError
from app.text_splitter import TextSplitter, PageTextPreparation
from docling.datamodel.base_models import DocumentStream

logger = logging.getLogger(__name__)

@dataclass
class PdfBatches:
    pages_count: int
    batches: List[DocumentStream]

class DocumentProcessor:
    """Service for processing document commands"""

    def __init__(self, send_message: Callable[[bool, Dict[str, Any], int], None]):
        self.send_message = send_message
        self._worker_pool: Optional[WorkerPool] = None
        self._assets_dir = Path(__file__).resolve().parent.parent / "assets"
        self._s3_client = None

    async def startup(self):
        num_threads = settings.num_threads or 1
        logger.info(
            "Initializing document processor with %s worker processes", num_threads
        )
        self._worker_pool = WorkerPool(
            num_threads,
            self._assets_dir,
            logger,
            restart_after=settings.worker_restart_after,
        )
        await self._worker_pool.start()

    async def shutdown(self):
        if self._worker_pool:
            await self._worker_pool.shutdown()
            self._worker_pool = None

    async def _write_temp_document(self, document_stream: DocumentStream, content_type: str) -> Path:
        suffix = self._get_file_suffix(content_type)
        
        return await asyncio.to_thread(
            self._write_temp_document_sync,
            document_stream,
            suffix,
        )
        
    def _get_file_suffix(self, content_type: str) -> str:
        """Get file suffix based on content type"""
        mapping = {
            "application/pdf": ".pdf",
            "application/msword": ".doc",
            "application/vnd.ms-excel": ".xls",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
            "application/vnd.oasis.opendocument.text": ".odt",
            "text/plain": ".txt",
            "text/markdown": ".md",
            "text/csv": ".csv",
        }
        return mapping.get(content_type, ".bin")

    @staticmethod
    def _write_temp_document_sync(document_stream: DocumentStream, suffix: str) -> Path:
        document_stream.stream.seek(0)
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
            while True:
                chunk = document_stream.stream.read(1024 * 1024)
                if not chunk:
                    break
                tmp_file.write(chunk)
            tmp_file.flush()
            temp_path = Path(tmp_file.name)
        document_stream.stream.seek(0)
        return temp_path

    async def _read_json_file(self, path: Path) -> Dict[str, Any]:
        return await asyncio.to_thread(self._read_json_file_sync, path)

    @staticmethod
    def _read_json_file_sync(path: Path) -> Dict[str, Any]:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    async def _dispatch_parse(
        self, input_path: Path, output_path: Path
    ) -> Dict[str, Any]:
        worker_pool = self._worker_pool
        if worker_pool is None:
            raise asyncio.CancelledError()
        try:
            return await worker_pool.run_parse(input_path, output_path)
        except WorkerPoolError as exc:
            if not worker_pool.is_running:
                raise asyncio.CancelledError() from exc
            raise

    def _get_s3_client(self):
        """Get or create S3 client"""
        if not self._s3_client:
            self._s3_client = boto3.client(
                "s3",
                endpoint_url=settings.s3_endpoint,
                region_name=settings.s3_region,
                aws_access_key_id=settings.s3_access_key_id,
                aws_secret_access_key=settings.s3_secret_access_key,
            )
        return self._s3_client

    async def handle_command(self, cmd: Dict[str, Any]):
        """Handle incoming command"""

        command_type = cmd.get("command")
        document_id = cmd.get("documentId")
        s3_key = cmd.get("s3key")
        mime = cmd.get("mime")
        parent_s3_key = cmd.get("parentS3Key")
        part_number = int(cmd.get("part", -1))
        parts_count = int(cmd.get("partsCount", 1))

        if not all([command_type, document_id, s3_key]):
            logger.warning(
                f"Missing required command fields: command, documentId, s3key. Input: {cmd}"
            )
            return

        if command_type == "parse_document":
            if parts_count > 1:
                await self._handle_parse_document_part(
                    document_id,
                    s3_key,
                    mime,
                    parent_s3_key,
                    part_number,
                    parts_count,
                )
            else:
                await self._handle_parse_document(document_id, s3_key, mime)
        elif command_type == "split_document":
            await self._handle_split_document(document_id, s3_key)
        else:
            logger.warning(f"Unknown command type: {command_type}")

    async def _handle_parse_document_part(
        self,
        document_id: str,
        s3_key: str,
        mime: str,
        parent_s3_key: str,
        part_number: int = -1,
        parts_count: int = 1,
    ):
        progress_key = f"{parent_s3_key}.parsing"
        parts_progress_key = f"{parent_s3_key}.parts_progress"
        parsed_json_key = f"{s3_key}.parsed.json"

        if part_number < 0 or parts_count <= 1:
            return logger.error(
                f"Unexpected part request for document {document_id}: part={part_number}, parts={parts_count}. Stop processing."
            )

        redis = Redis(connection_pool=redis_connection_pool)
        input_path: Optional[Path] = None
        output_path: Optional[Path] = None

        try:
            if await self._s3_object_exists(parsed_json_key):
                return await self._finalize_partitioned_doc(
                    redis,
                    document_id,
                    parent_s3_key,
                    parts_count,
                )
            parts_progress = await redis.get(parts_progress_key)
            processed_parts = int(parts_progress) if parts_progress is not None else 0

            if processed_parts > 0:
                progress = await redis.get(progress_key)
                progress = float(progress) if progress is not None else 0.0

                await self._set_progress(
                    redis,
                    progress_key,
                    max(1.0 * processed_parts / parts_count, progress),
                    document_id,
                    "parsing",
                    f"processing part {part_number + 1}/{parts_count}",
                )

            (document_stream, content_type) = await self._download_s3_stream(s3_key)
            input_path = await self._write_temp_document(document_stream, content_type)
            output_path = Path(f"{input_path}.parsed.json")

            await self._dispatch_parse(input_path, output_path)

            if processed_parts > 0:
                progress = await redis.get(progress_key)
                progress = float(progress) if progress is not None else 0.0
                await self._set_progress(
                    redis,
                    progress_key,
                    max((processed_parts + 0.5) / parts_count, progress),
                    document_id,
                    "parsing",
                    f"processing part {part_number + 1}/{parts_count}",
                )

            processor = JsonReportProcessor()
            report_data = await self._read_json_file(output_path)
            processed_report = await asyncio.to_thread(
                processor.assemble_report, None, report_data
            )

            part_json_content = await asyncio.to_thread(
                json.dumps,
                processed_report,
                indent=2,
                ensure_ascii=False,
            )
            await self._upload_to_s3(
                parsed_json_key, part_json_content, "application/json"
            )
            await self._s3_delete(s3_key)

            processed_parts = await self._finalize_partitioned_doc(
                redis,
                document_id,
                parent_s3_key,
                parts_count,
            )

            await self._set_progress(
                redis,
                progress_key,
                (1.0 * processed_parts / parts_count),
                document_id,
                "parsing",
                f"completed part {part_number + 1}/{parts_count}",
            )

        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Failed to parse document {document_id} part {part_number}")
            logger.exception(e, exc_info=True)
            await self._set_progress(
                redis, progress_key, 0, document_id, "error", str(e), mime
            )
        finally:
            await redis.close()
            for temp_path in (input_path, output_path):
                if temp_path is not None:
                    with contextlib.suppress(FileNotFoundError):
                        temp_path.unlink()

    async def _handle_parse_document(self, document_id: str, s3_key: str, mime: str):
        """Handle parse_document command"""
        progress_key = f"{s3_key}.parsing"
        parsed_json_key = f"{s3_key}.parsed.json"

        redis = Redis(connection_pool=redis_connection_pool)
        input_path: Optional[Path] = None
        output_path: Optional[Path] = None

        try:
            # Check if parsing is already completed
            if await self._s3_object_exists(parsed_json_key):
                logger.info(f"Document {document_id} already parsed, skipping to split")
                await self._send_split_command(document_id, s3_key)
                return

            # Check if parsing is already in progress
            existing_progress = await redis.get(progress_key)
            if existing_progress is not None:
                progress = float(existing_progress)
                # If progress < 1, push back to queue with delay
                if progress <= 1:
                    logger.info(
                        f"Document {document_id} parsing in progress ({progress*100:.1f}%), delaying"
                    )
                    await self._send_parse_command_delayed(document_id, s3_key)
                return

            await self._set_progress(redis, progress_key, 0.0, document_id, "parsing")
            (document_stream, content_type) = await self._download_s3_stream(s3_key)
            if not mime:
                mime = content_type

            #  Determine if document needs to be split into parts
            if mime == "application/pdf":
                batches = await asyncio.to_thread(
                    self._get_pdf_batches, document_stream
                )
                document_stream.stream.seek(0)
                parts_count = len(batches.batches)

                if parts_count > 1:
                    for ndx, part in enumerate(batches.batches):
                        part_s3_key = f"{s3_key}.part{ndx}"
                        # upload part to S3
                        await self._upload_stream_to_s3(part_s3_key, part, mime)
                        command = {
                            "command": "parse_document",
                            "documentId": document_id,
                            "s3key": part_s3_key,
                            "mime": mime,
                            "parentS3Key": s3_key,
                            "part": ndx,
                            "partsCount": parts_count,
                        }
                        await self._send_sqs_command(True, command)

                    await self._set_progress(
                        redis,
                        progress_key,
                        0.0,
                        document_id,
                        "parsing",
                        f"queued {parts_count} parts",
                    )
                    return

            await self._set_progress(redis, progress_key, 0.3, document_id, "parsing")

            input_path = await self._write_temp_document(document_stream, mime)
            output_path = Path(f"{input_path}.parsed.json")

            await self._dispatch_parse(input_path, output_path)

            await self._set_progress(redis, progress_key, 0.6, document_id, "parsing")

            processor = JsonReportProcessor()
            report_data = await self._read_json_file(output_path)
            processed_report = await asyncio.to_thread(
                processor.assemble_report, None, report_data
            )

            # Generate reports
            await self._set_progress(redis, progress_key, 0.8, document_id, "parsing")
            json_content = await asyncio.to_thread(
                json.dumps, processed_report, indent=2, ensure_ascii=False
            )
            await self._upload_to_s3(parsed_json_key, json_content, "application/json")

            parsed_md_key = f"{s3_key}.parsed.md"
            content = await asyncio.to_thread(
                self._extract_markdown_text, processed_report
            )
            await self._upload_to_s3(parsed_md_key, content, "text/markdown")
            # Complete parsing
            await self._set_progress(redis, progress_key, 1.0, document_id, "parsing")
            await self._send_split_command(document_id, s3_key)

            logger.info(f"Successfully parsed document {document_id}")

        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Failed to parse document {document_id}")
            logger.exception(e, exc_info=True)
            await self._set_progress(
                redis, progress_key, 0, document_id, "error", str(e), mime
            )
        finally:
            await redis.close()
            for temp_path in (input_path, output_path):
                if temp_path is not None:
                    with contextlib.suppress(FileNotFoundError):
                        temp_path.unlink()

    async def _handle_split_document(self, document_id: str, s3_key: str):
        """Handle split_document command"""
        progress_key = f"{s3_key}.chunking"
        parsed_json_key = f"{s3_key}.parsed.json"
        chunked_json_key = f"{s3_key}.chunked.json"

        redis = Redis(connection_pool=redis_connection_pool)
        text_splitter = TextSplitter()

        try:
            # Check if chunking is already in progress or completed
            existing_progress = await redis.get(progress_key)
            if existing_progress is not None:
                progress = float(existing_progress)
                # Check if output file exists
                if await self._s3_object_exists(chunked_json_key):
                    logger.info(
                        f"Document {document_id} already chunked, skipping to index"
                    )
                    await self._send_index_command(document_id, s3_key)
                # If progress < 1, push back to queue with delay
                elif progress < 1:
                    logger.info(
                        f"Document {document_id} chunking in progress ({progress*100:.1f}%), delaying"
                    )
                    await self._send_split_command_delayed(document_id, s3_key)
                return

            # Start chunking
            await self._set_progress(redis, progress_key, 0.0, document_id, "chunking")
            parsed_content = await self._download_s3_content(parsed_json_key)
            parsed_data = await asyncio.to_thread(json.loads, parsed_content)

            # Update progress
            await self._set_progress(redis, progress_key, 0.3, document_id, "chunking")
            text_preparation = PageTextPreparation(parsed_data)
            joined_report = await asyncio.to_thread(text_preparation.process_report)

            # Split into chunks
            await self._set_progress(redis, progress_key, 0.6, document_id, "chunking")
            chunked_report = await asyncio.to_thread(
                text_splitter.split_json_report, joined_report
            )

            # Upload chunked JSON to S3
            await self._set_progress(redis, progress_key, 0.8, document_id, "chunking")

            chunked_content = await asyncio.to_thread(
                json.dumps, chunked_report, indent=2, ensure_ascii=False
            )
            await self._upload_to_s3(
                chunked_json_key, chunked_content, "application/json"
            )

            # Send index command
            await self._set_progress(redis, progress_key, 1.0, document_id, "chunking")
            await self._send_index_command(document_id, s3_key)

            logger.info(f"Successfully chunked document {document_id}")

        except Exception as e:
            logger.error(f"Failed to chunk document {document_id}: {e}")
            await self._set_progress(
                redis, progress_key, 0, document_id, "error", str(e)
            )
        finally:
            await redis.close()

    async def _set_progress(
        self,
        redis: Redis,
        progress_key: str,
        progress: float,
        document_id: str,
        status: str,
        info: Optional[str] = None,
        mime: Optional[str] = None,
    ):
        """Set progress in Redis and publish notification"""
        # Set progress with 30 second expiration
        await redis.setex(progress_key, 30, str(progress))
        logger.debug(
            f"Document {document_id} {mime or ''} status update: {status} {progress * 100:.1f}% {info or ''}"
        )

        # Publish notification
        notification = {
            "documentId": document_id,
            "status": status,
            "statusProgress": progress,
            "statusInfo": info,
            "progress": progress,
            "sync": True,
        }
        await redis.publish(settings.document_status_channel, json.dumps(notification))

    async def _s3_object_exists(self, key: str) -> bool:
        """Check if S3 object exists"""
        s3 = self._get_s3_client()
        try:
            await asyncio.to_thread(
                s3.head_object, Bucket=settings.s3_files_bucket_name, Key=key
            )
            return True
        except ClientError as e:
            if e.response["Error"]["Code"] == "404":
                return False
            raise

    async def _download_s3_stream(self, key: str) -> Tuple[DocumentStream, str]:
        """Download document from S3 as stream"""
        s3 = self._get_s3_client()
        try:
            response = await asyncio.to_thread(
                s3.get_object, Bucket=settings.s3_files_bucket_name, Key=key
            )
            content = response["Body"].read()
            content_type = response["ContentType"]

            # Create DocumentStream from content
            stream = DocumentStream(name=key.split("/")[-1], stream=io.BytesIO(content))
            return (stream, content_type)
        except ClientError as e:
            logger.error(f"Failed to download {key} from S3: {e}")
            raise

    async def _download_s3_content(self, key: str) -> str:
        """Download text content from S3"""
        s3 = self._get_s3_client()
        try:
            response = await asyncio.to_thread(
                s3.get_object, Bucket=settings.s3_files_bucket_name, Key=key
            )
            content = response["Body"].read().decode("utf-8")
            return content
        except ClientError as e:
            logger.error(f"Failed to download {key} from S3: {e}")
            raise

    async def _upload_to_s3(self, key: str, content: str, content_type: str):
        """Upload content to S3"""
        s3 = self._get_s3_client()
        try:
            await asyncio.to_thread(
                s3.put_object,
                Bucket=settings.s3_files_bucket_name,
                Key=key,
                Body=content.encode("utf-8"),
                ContentType=content_type,
            )
        except ClientError as e:
            logger.error(f"Failed to upload {key} to S3: {e}")
            raise

    async def _s3_delete(self, key: str):
        """Delete object from S3"""
        s3 = self._get_s3_client()
        try:
            await asyncio.to_thread(
                s3.delete_object,
                Bucket=settings.s3_files_bucket_name,
                Key=key,
            )
        except ClientError as e:
            logger.error(f"Failed to delete {key} from S3: {e}")
            raise

    async def _upload_stream_to_s3(
        self, key: str, content: DocumentStream, content_type: str
    ):
        """Upload content to S3"""
        s3 = self._get_s3_client()
        try:
            await asyncio.to_thread(
                s3.put_object,
                Bucket=settings.s3_files_bucket_name,
                Key=key,
                Body=content.stream,
                ContentType=content_type,
            )
        except ClientError as e:
            logger.error(f"Failed to upload {key} to S3: {e}")
            raise

    def _get_pdf_batches(self, document_stream: DocumentStream) -> PdfBatches:
        """Split a PDF document stream into batches based on page count."""
        if not document_stream or not document_stream.stream:
            return PdfBatches(pages_count=0, batches=[])

        stream = document_stream.stream
        current_position = stream.tell()

        try:
            stream.seek(0)
            reader = PdfReader(stream)
            pages_count = len(reader.pages)
            batches = []
            writer: PdfWriter = None

            def add_batch(writer: PdfWriter):
                batch_stream = io.BytesIO()
                writer.write(batch_stream)
                batch_stream.seek(0)
                ds = DocumentStream(name=f"part{len(batches)}", stream=batch_stream)
                batches.append(ds)

            for i in range(0, pages_count):
                if i % settings.pdf_page_batch_size == 0:
                    if writer is not None:
                        add_batch(writer)
                    writer = PdfWriter()
                writer.add_page(reader.pages[i])

            if writer is not None and len(writer.pages) > 0:
                add_batch(writer)

            return PdfBatches(pages_count=pages_count, batches=batches)
        finally:
            stream.seek(current_position if current_position >= 0 else 0)

    def _build_combined_metainfo(
        self,
        base_metainfo: Optional[Dict[str, Any]],
        pages: List[Dict[str, Any]],
        tables: List[Dict[str, Any]],
        pictures: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Merge basic document metadata with calculated statistics for the combined report."""
        metainfo = dict(base_metainfo or {})
        metainfo["pages_amount"] = len(pages)
        metainfo["tables_amount"] = len(tables)
        metainfo["pictures_amount"] = len(pictures)

        text_blocks = 0
        footnotes = 0
        equations = 0
        for page in pages:
            for item in page.get("content", []):
                if "text_id" in item or item.get("text"):
                    text_blocks += 1
                if item.get("type") == "footnote":
                    footnotes += 1
                if item.get("type") == "equation":
                    equations += 1

        metainfo["text_blocks_amount"] = text_blocks
        metainfo["footnotes_amount"] = footnotes
        metainfo["equations_amount"] = equations

        return metainfo

    async def _finalize_partitioned_doc(
        self,
        redis: Redis,
        document_id: str,
        s3_key: str,
        parts_count: int,
    ) -> int:
        """Combine partial parsing results into a single document and finish processing. Return processed parts_count."""
        progress_key = f"{s3_key}.parsing"
        parts_progress_key = f"{s3_key}.parts_progress"

        parsed_json_key = f"{s3_key}.parsed.json"

        if await self._s3_object_exists(parsed_json_key):
            logger.info(f"Document {document_id} is already parsed.")
            await self._send_split_command(document_id, s3_key)
            await self._set_progress(
                redis,
                progress_key,
                1.0,
                document_id,
                "parsing",
            )

            return parts_count

         # Atomically increment the progress counter (+1 for current part being processed)
        parts_progress = await redis.incr(parts_progress_key)
        await redis.expire(parts_progress_key, 30)
        
        if parts_progress > 0 and parts_progress < parts_count:
            logger.info(
                f"Document {document_id} is not finalized yet: expected {parts_count} parts, found {parts_progress + 1}"
            )
            return parts_progress

        parsed_part_files: List[str] = []
        part_files: List[str] = []

        for part_idx in range(parts_count):
            part_key = f"{s3_key}.part{part_idx}"
            parsed_part_key = f"{s3_key}.part{part_idx}.parsed.json"
            if await self._s3_object_exists(parsed_part_key):
                parsed_part_files.append(parsed_part_key)
            if await self._s3_object_exists(part_key):
                part_files.append(part_key)

        # Set progress with expiration is seconds
        await redis.setex(parts_progress_key, 30, str(len(parsed_part_files)))

        if len(parsed_part_files) < parts_count:
            # fallback for failed state
            if len(part_files) == 0:
                await self._set_progress(
                    redis,
                    progress_key,
                    1.0,
                    document_id,
                    "error",
                    "failed to parse document parts",
                )
            return len(parsed_part_files)

        # load processed parts and join them
        partial_reports: List[Dict[str, Any]] = []
        for part_idx in range(parts_count):
            parsed_part_key = f"{s3_key}.part{part_idx}.parsed.json"
            if await self._s3_object_exists(parsed_part_key):
                raw_json = await self._download_s3_content(parsed_part_key)
                data = await asyncio.to_thread(json.loads, raw_json)
                partial_reports.append(data)

        pages_by_number: Dict[int, Dict[str, Any]] = {}
        tables_by_id: Dict[int, Dict[str, Any]] = {}
        pictures_by_id: Dict[int, Dict[str, Any]] = {}
        base_metainfo: Optional[Dict[str, Any]] = None

        page_num = 0
        for report in partial_reports:
            if base_metainfo is None and report.get("metainfo"):
                base_metainfo = report["metainfo"]

            first_page = page_num
            for page in report.get("content", []):
                page["page"] = page_num + 1
                pages_by_number[int(page_num)] = page
                page_num += 1

            for table in report.get("tables", []):
                table_id = table.get("table_id")
                table["page"] = first_page + table.get("page", 0)
                if table_id is not None:
                    tables_by_id[int(table_id)] = table

            for picture in report.get("pictures", []):
                picture_id = picture.get("picture_id")
                picture["page"] = first_page + picture.get("page", 0)
                if picture_id is not None:
                    pictures_by_id[int(picture_id)] = picture

        combined_pages = [
            pages_by_number[index] for index in sorted(pages_by_number.keys())
        ]
        combined_tables = [tables_by_id[index] for index in sorted(tables_by_id.keys())]
        combined_pictures = [
            pictures_by_id[index] for index in sorted(pictures_by_id.keys())
        ]

        combined_metainfo = self._build_combined_metainfo(
            base_metainfo,
            combined_pages,
            combined_tables,
            combined_pictures,
        )

        combined_report = {
            "metainfo": combined_metainfo,
            "content": combined_pages,
            "tables": combined_tables,
            "pictures": combined_pictures,
        }

        json_content = await asyncio.to_thread(
            json.dumps, combined_report, indent=2, ensure_ascii=False
        )
        await self._upload_to_s3(parsed_json_key, json_content, "application/json")

        parsed_md_key = f"{s3_key}.parsed.md"
        markdown_content = await asyncio.to_thread(
            self._extract_markdown_text, combined_report
        )
        await self._upload_to_s3(parsed_md_key, markdown_content, "text/markdown")

        await self._set_progress(
            redis,
            progress_key,
            1.0,
            document_id,
            "parsing",
        )

        for parsed_part_key in parsed_part_files:
            try:
                await self._s3_delete(parsed_part_key)
            except ClientError:
                logger.warning(
                    f"Failed to delete temporary part {parsed_part_key} from S3"
                )

        await self._send_split_command(document_id, s3_key)
        logger.info(
            f"Successfully assembled parsed document {document_id} from {parts_count} parts"
        )
        return parts_count

    def _extract_markdown_text(self, processed_report: Dict[str, Any]) -> str:
        """Extract full document text as Markdown"""
        content_parts = []

        # Add document metadata
        if "metainfo" in processed_report:
            metainfo = processed_report["metainfo"]
            content_parts.append(f"# {metainfo.get('name', 'Document')}\n")

            if metainfo.get("description"):
                content_parts.append(f"{metainfo['description']}\n")

        # Add page content
        if "content" in processed_report:
            # Store report data for text preparation
            text_preparation = PageTextPreparation(processed_report)

            for page_data in processed_report["content"]:
                page_num = page_data.get("page", 0)
                content_parts.append(f"\n---\n\n## Page {page_num}\n")

                # Process page content using text preparation
                page_text = text_preparation.prepare_page_text(page_num)
                if page_text:
                    content_parts.append(page_text)

        return "\n".join(content_parts)

    async def _send_split_command(self, document_id: str, s3_key: str):
        """Send split_document command to SQS"""
        command = {
            "command": "split_document",
            "documentId": document_id,
            "s3key": s3_key,
        }
        await self._send_sqs_command(True, command)

    async def _send_index_command(self, document_id: str, s3_key: str):
        """Send index_document command to SQS"""
        command = {
            "command": "index_document",
            "documentId": document_id,
            "s3key": s3_key,
        }
        await self._send_sqs_command(False, command)

    async def _send_parse_command_delayed(self, document_id: str, s3_key: str):
        """Send parse_document command with delay"""
        command = {
            "command": "parse_document",
            "documentId": document_id,
            "s3key": s3_key,
        }
        await self._send_sqs_command(True, command, delay_seconds=180)  # 3 minutes

    async def _send_split_command_delayed(self, document_id: str, s3_key: str):
        """Send split_document command with delay"""
        command = {
            "command": "split_document",
            "documentId": document_id,
            "s3key": s3_key,
        }
        await self._send_sqs_command(True, command, delay_seconds=180)  # 3 minutes

    async def _send_sqs_command(
        self, is_processing: bool, command: Dict[str, Any], delay_seconds: int = 0
    ):
        await self.send_message(is_processing, command, delay_seconds)
