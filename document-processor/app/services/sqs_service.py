import asyncio
import json
from typing import Awaitable, Callable, Dict, Any, Optional
import boto3
from app.core.config import settings
from app.services.document_processor import DocumentProcessor
from app.core import util

logger = util.init_logger(__name__)


class SQSService:
    """Service for handling SQS queue operations"""

    def __init__(self):
        self.sqs_client = None
        self.queue_url = settings.sqs_documents_queue
        self.index_queue_url = settings.sqs_index_documents_queue
        self.running = False
        self.poll_task = None
        self.processor: Optional[DocumentProcessor] = None

    async def startup(self):
        """Initialize SQS client and start polling"""
        try:
            self.sqs_client = boto3.client(
                "sqs",
                endpoint_url=settings.sqs_endpoint or None,
                region_name=settings.sqs_region,
                aws_access_key_id=settings.sqs_access_key_id or None,
                aws_secret_access_key=settings.sqs_secret_access_key or None,
            )
            self.running = True
            self.processor = DocumentProcessor(self.send_message)
            await self.processor.startup()

            # TDOD: Run settings.num_threads pollers with MaxNumberOfMessages=1 
            # each for better parallelism
            self.poll_task = asyncio.create_task(self._poll_messages())

            logger.info(f"SQS Service started, polling queue: {self.queue_url}")
        except Exception as e:
            logger.error(f"Failed to start SQS service: {e}")
            raise

    async def shutdown(self):
        """Stop polling and cleanup resources"""
        logger.info("SQS Service shutting down...")
        self.running = False
        if self.poll_task:
            self.poll_task.cancel()
            try:
                await self.poll_task
            except asyncio.CancelledError:
                logger.debug("Poll task cancelled successfully")
            self.poll_task = None
        if self.processor:
            await self.processor.shutdown()
        if self.sqs_client:
            self.sqs_client.close()
        logger.info("SQS Service stopped")

    async def _poll_messages(self):
        """Poll for messages from SQS queue"""
        response = self.sqs_client.list_queues(MaxResults=100)
        logger.debug(f"Found queues: {response}")

        while self.running:
            try:
                # Use asyncio.to_thread to make the blocking call cancellable
                # and run it in a thread pool so it doesn't block the event loop
                response = await asyncio.to_thread(
                    self.sqs_client.receive_message,
                    QueueUrl=self.queue_url,
                    MaxNumberOfMessages=settings.num_threads,
                    WaitTimeSeconds=5,  # Shorter polling for better shutdown responsiveness
                    VisibilityTimeout=120,  # seconds to process
                )
                if not self.running:
                    logger.debug("Polling stop requested; exiting loop")
                    break
                messages = response.get("Messages", [])
                # Process all messages in parallel
                if messages:
                    logger.debug(f"Got messages: {messages}")

                    async def process_message(message):
                        try:
                            sqs_client = self.sqs_client
                            queue_url = self.queue_url
                            def ack():
                                # Delete message from queue after processing
                                sqs_client.delete_message(
                                    QueueUrl=queue_url,
                                    ReceiptHandle=message["ReceiptHandle"],
                                )
                                logger.info(f"Deleted message from SQS: {message['MessageId']}")
                            
                            # Process message
                            await self._handle_message(message, ack=ack)

                        except Exception as e:
                            logger.error(f"Error processing message: {message}")
                            logger.exception(e, exc_info=True)
                            # Message will become visible again after timeout

                    await asyncio.gather(
                        *[process_message(msg) for msg in messages],
                        return_exceptions=True,
                    )

            except asyncio.CancelledError:
                logger.info("Polling cancelled, shutting down")
                break
            except Exception as e:
                logger.error(f"Error polling SQS: {e}")
                await asyncio.sleep(5)  # Wait before retrying

    async def _handle_message(self, message: Dict[str, Any], ack: Callable[[], None]):
        """Handle incoming SQS message"""
        try:
            body = json.loads(message["Body"])
            logger.info(f"Processing message: {body}")
            await self.processor.handle_command(body, ack=ack)

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in message body: {e}")
            raise

    async def send_message(
        self, is_processing: bool, command: Dict[str, Any], delay_seconds: int = 0
    ):
        """Send a message to the SQS queue"""
        try:
            await asyncio.to_thread(
                self.sqs_client.send_message,
                QueueUrl=self.queue_url if is_processing else self.index_queue_url,
                MessageBody=json.dumps(command),
                DelaySeconds=delay_seconds,
            )
            logger.info(f"Sent message to SQS: {command}")
        except Exception as e:
            logger.error(f"Failed to send message to SQS: {e}")
            raise
