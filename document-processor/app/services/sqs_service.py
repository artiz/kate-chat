import asyncio
import json
import logging
from typing import Dict, Any, Optional
import boto3
from botocore.exceptions import ClientError
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
        
    async def startup(self):
        """Initialize SQS client and start polling"""
        try:
            self.sqs_client = boto3.client(
                'sqs',
                endpoint_url=settings.sqs_endpoint or None,
                region_name=settings.sqs_region,
                aws_access_key_id=settings.sqs_access_key_id or None,
                aws_secret_access_key=settings.sqs_secret_access_key or None,
            )
            self.running = True
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
                    MaxNumberOfMessages=1,
                    WaitTimeSeconds=5,  # Shorter polling for better shutdown responsiveness
                    VisibilityTimeout=120  # seconds to process
                )
                messages = response.get('Messages', [])
                logger.debug(f"Got messages: {messages}")
                
                for message in messages:
                    try:
                        # Process message
                        await self._handle_message(message)
                        
                        # Delete message after successful processing
                        await asyncio.to_thread(
                            self.sqs_client.delete_message,
                            QueueUrl=self.queue_url,
                            ReceiptHandle=message['ReceiptHandle']
                        )
                        
                    except Exception as e:
                        logger.error(f"Error processing message: {message}")
                        logger.exception(e, exc_info=True)
                        
                        # Message will become visible again after timeout
                        
            except asyncio.CancelledError:
                logger.info("Polling cancelled, shutting down")
                break
            except Exception as e:
                logger.error(f"Error polling SQS: {e}")
                await asyncio.sleep(5)  # Wait before retrying
    
    async def _handle_message(self, message: Dict[str, Any]):
        """Handle incoming SQS message"""
        processor = DocumentProcessor(lambda is_processing, cmd, delay: self.send_message(is_processing, cmd, delay))
        
        try:
            body = json.loads(message['Body'])
            logger.info(f"Processing message: {body}")
            await processor.handle_command(body)
            
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in message body: {e}")
            raise
        finally:
            await processor.close()
    
    async def send_message(self, is_processing: bool, command: Dict[str, Any], delay_seconds: int = 0):
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
