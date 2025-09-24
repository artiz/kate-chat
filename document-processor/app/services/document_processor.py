import asyncio
import json
import logging
import io
from typing import Callable, Dict, Any, Optional
from redis.asyncio.client import Redis
import boto3
from botocore.exceptions import ClientError


from app.core.config import settings
from app.core.global_app import redis_connection_pool
from app.dependencies.common import get_redis
from app.parser import PDFParser, JsonReportProcessor
from app.text_splitter import TextSplitter, PageTextPreparation
from docling.datamodel.base_models import DocumentStream
from docling.datamodel.base_models import ConversionStatus

logger = logging.getLogger(__name__)


class DocumentProcessor:
    """Service for processing document commands"""

    def __init__(self, send_message: Callable[[bool, Dict[str, Any], int], None]):
        self.s3_client = None
        self.send_message = send_message

        self.parser = PDFParser()
        self.text_splitter = TextSplitter()

    async def close(self):
        pass        

    async def _get_s3_client(self):
        """Get or create S3 client"""
        if not self.s3_client:
            self.s3_client = boto3.client(
                "s3",
                endpoint_url=settings.s3_endpoint,
                region_name=settings.s3_region,
                aws_access_key_id=settings.s3_access_key_id,
                aws_secret_access_key=settings.s3_secret_access_key,
            )
        return self.s3_client

    async def handle_command(self, cmd: Dict[str, Any]):
        """Handle incoming command"""

        command_type = cmd.get("command")
        document_id = cmd.get("documentId")
        s3_key = cmd.get("s3key")

        if not all([command_type, document_id, s3_key]):
            logger.warning(
                f"Missing required command fields: command, documentId, s3key. Input: {cmd}"
            )
            return

        logger.info(f"Processing command {cmd}")

        if command_type == "parse_document":
            await self._handle_parse_document(document_id, s3_key)
        elif command_type == "split_document":
            await self._handle_split_document(document_id, s3_key)
        else:
            logger.warning(f"Unknown command type: {command_type}")

    async def _handle_parse_document(self, document_id: str, s3_key: str):
        """Handle parse_document command"""
        progress_key = f"{s3_key}.parsing"
        parsed_json_key = f"{s3_key}.parsed.json"
        parsed_md_key = f"{s3_key}.parsed.md"

        redis = Redis(connection_pool=redis_connection_pool)
        s3 = await self._get_s3_client()

        try:

            # Check if parsing is already in progress or completed
            existing_progress = await redis.get(progress_key)
            if existing_progress is not None:
                progress = float(existing_progress)
                # Check if output files exist
                if await self._s3_object_exists(s3, parsed_json_key):
                    logger.info(f"Document {document_id} already parsed, skipping to split")
                    await self._send_split_command(document_id, s3_key)
                # If progress < 1, push back to queue with delay
                elif progress < 1:
                    logger.info(f"Document {document_id} parsing in progress ({progress*100:.1f}%), delaying")
                    await self._send_parse_command_delayed(document_id, s3_key)
                return

            await self._set_progress(redis, progress_key, 0.0, document_id, "parsing")
            document_stream = await self._download_s3_stream(s3, s3_key)
            await self._set_progress(redis, progress_key, 0.3, document_id, "parsing")

            # Parse document
            conv_result = await asyncio.to_thread(self.parser.convert_document, document_stream)
            if conv_result.status != ConversionStatus.SUCCESS:
                raise RuntimeError(
                    f"Document parsing failed with status: {conv_result.status}"
                )

            # Update progress
            await self._set_progress(redis, progress_key, 0.6, document_id, "parsing")
            report_data = await asyncio.to_thread(lambda: self.parser._normalize_page_sequence(conv_result.document.export_to_dict()))
             
            processor = JsonReportProcessor()
            processed_report = await asyncio.to_thread(processor.assemble_report, conv_result, report_data)

            # Generate reports
            await self._set_progress(redis, progress_key, 0.8, document_id, "parsing")
            json_content = await asyncio.to_thread(json.dumps, processed_report,  indent=2, ensure_ascii=False)
            await self._upload_to_s3(
                s3, parsed_json_key, json_content, "application/json"
            )

            markdown_content = await asyncio.to_thread(self._extract_markdown_text, processed_report)
            await self._upload_to_s3(
                s3, parsed_md_key, markdown_content, "text/markdown"
            )

            # Complete parsing
            await self._set_progress(redis, progress_key, 1.0, document_id, "parsing")
            await self._send_split_command(document_id, s3_key)

            logger.info(f"Successfully parsed document {document_id}")

        except Exception as e:
            logger.exception(e, f"Failed to parse document {document_id}")
            await self._set_progress(redis, progress_key, 0, document_id, "error", str(e))
            raise
        finally:
            await redis.close()

    async def _handle_split_document(self, document_id: str, s3_key: str):
        """Handle split_document command"""
        progress_key = f"{s3_key}.chunking"
        parsed_json_key = f"{s3_key}.parsed.json"
        chunked_json_key = f"{s3_key}.chunked.json"

        s3 = await self._get_s3_client()
        redis = Redis(connection_pool=redis_connection_pool)

        try:
            # Check if chunking is already in progress or completed
            existing_progress = await redis.get(progress_key)
            if existing_progress is not None:
                progress = float(existing_progress)
                # Check if output file exists
                if await self._s3_object_exists(s3, chunked_json_key):
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
            parsed_content = await self._download_s3_content(s3, parsed_json_key)
            parsed_data = await asyncio.to_thread(json.loads, parsed_content)

            # Update progress
            await self._set_progress(redis, progress_key, 0.3, document_id, "chunking")
            text_preparation = PageTextPreparation(parsed_data)
            joined_report = await asyncio.to_thread(text_preparation.process_report)

            # Split into chunks
            await self._set_progress(redis, progress_key, 0.6, document_id, "chunking")
            chunked_report = await asyncio.to_thread(self.text_splitter.split_json_report, joined_report)

            # Upload chunked JSON to S3
            await self._set_progress(redis, progress_key, 0.8, document_id, "chunking")

            chunked_content = await asyncio.to_thread(json.dumps, chunked_report, indent=2, ensure_ascii=False)
            await self._upload_to_s3(
                s3, chunked_json_key, chunked_content, "application/json"
            )

            # Send index command
            await self._set_progress(redis, progress_key, 1.0, document_id, "chunking")
            await self._send_index_command(document_id, s3_key)

            logger.info(f"Successfully chunked document {document_id}")

        except Exception as e:
            logger.error(f"Failed to chunk document {document_id}: {e}")
            await self._set_progress(redis, progress_key, 0, document_id, "error", str(e))
            raise
        finally:
            await redis.close()

    async def _set_progress(
        self, redis: Redis, progress_key: str, progress: float, document_id: str, status: str, info: Optional[str] = None
    ):
        """Set progress in Redis and publish notification"""
        # Set progress with 30 second expiration
        await redis.setex(progress_key, 30, str(progress))
        logger.debug(f"Document {document_id} status update: {status} {progress*100:.1f}%")

        # Publish notification
        notification = {
            "documentId": document_id,
            "status": status,
            "statusProgress": progress,
            "statusInfo": info,
            "progress": progress,
            "sync": True,
        }
        await redis.publish(
            settings.document_status_channel, json.dumps(notification)
        )

    async def _s3_object_exists(self, s3, key: str) -> bool:
        """Check if S3 object exists"""
        try:
            s3.head_object(Bucket=settings.s3_files_bucket_name, Key=key)
            return True
        except ClientError as e:
            if e.response["Error"]["Code"] == "404":
                return False
            raise

    async def _download_s3_stream(self, s3, key: str) -> DocumentStream:
        """Download document from S3 as stream"""
        try:
            response = s3.get_object(Bucket=settings.s3_files_bucket_name, Key=key)
            content = response["Body"].read()

            # Create DocumentStream from content
            stream = DocumentStream(name=key.split("/")[-1], stream=io.BytesIO(content))
            return stream
        except ClientError as e:
            logger.error(f"Failed to download {key} from S3: {e}")
            raise

    async def _download_s3_content(self, s3, key: str) -> str:
        """Download text content from S3"""
        try:
            response = s3.get_object(Bucket=settings.s3_files_bucket_name, Key=key)
            content = response["Body"].read().decode("utf-8")
            return content
        except ClientError as e:
            logger.error(f"Failed to download {key} from S3: {e}")
            raise

    async def _upload_to_s3(self, s3, key: str, content: str, content_type: str):
        """Upload content to S3"""
        try:
            s3.put_object(
                Bucket=settings.s3_files_bucket_name,
                Key=key,
                Body=content.encode("utf-8"),
                ContentType=content_type,
            )
            logger.info(f"Uploaded {key} to S3")
        except ClientError as e:
            logger.error(f"Failed to upload {key} to S3: {e}")
            raise

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
