# Document Processing Pipeline Implementation

This implementation adds a comprehensive document processing pipeline with SQS-based job queues and Redis progress tracking.

## Components Implemented

### 1. Document Processor (Python)

**Location**: `document-processor/app/services/`

- **SQSService** (`sqs_service.py`): Handles SQS queue polling and message processing
- **DocumentProcessor** (`document_processor.py`): Processes document commands with progress tracking

#### Commands Implemented:
1. **parse_document**: 
   - Uses PDFParser.convert_document to parse documents
   - Generates JSON report (`<s3_key>.parsed.json`)
   - Generates Markdown text (`<s3_key>.parsed.md`)
   - Tracks progress in Redis with key `<s3_key>.parsing`
   - Publishes to `split_document` on completion

2. **split_document**:
   - Uses TextSplitter.split_json_report to chunk documents
   - Generates chunked JSON (`<s3_key>.chunked.json`)
   - Tracks progress in Redis with key `<s3_key>.chunking`
   - Publishes to `index_document` on completion

#### Features:
- Redis progress tracking with 30-second sliding expiration
- Duplicate detection and skipping
- Retry logic with 3-minute delays
- Redis notifications on `DOCUMENT_STATUS_CHANNEL`
- S3 streaming for efficient file handling

### 2. Node.js API Updates

**Files Modified**: 
- `api/src/entities/User.ts` - Added document model settings
- `api/src/controllers/files.controller.ts` - Updated uploadDocument
- `api/src/services/sqs-message.service.ts` - SQS message sending
- `api/src/services/document-queue.service.ts` - Index document processing

#### New User Settings:
- `documentsEmbeddingsModelId`: Model for generating embeddings
- `documentSummarizationModelId`: Model for document summarization

#### Updated uploadDocument:
- Sends `parse_document` command for new documents
- Sends `parse_document` command for existing documents in UPLOAD state

#### Document Queue Service:
- Handles `index_document` commands
- Processes embeddings with selected model
- Generates document summaries (up to 1024 words)
- Updates document status to READY

### 3. Client Updates

**File Modified**: `client/src/components/settings/AISettings.tsx`

#### New Settings UI:
- Documents Embeddings Model selector (filters EMBEDDING models)
- Document Summarization Model selector (filters CHAT models)
- Integrated into user defaults form

### 4. Database Schema Updates

**Document Entity**:
- `embeddingsModelId`: Stores the model used for embeddings
- `summaryModelId`: Stores the model used for summarization
- `summary`: Generated document summary text

## Configuration

### Environment Variables Required:

#### Document Processor:
```bash
SQS_DOCUMENTS_QUEUE=http://localhost:4566/000000000000/documents-queue
REDIS_URL=redis://redis:6379
DOCUMENT_STATUS_CHANNEL=document:status
S3_ENDPOINT=http://localstack:4566
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=localstack
S3_SECRET_ACCESS_KEY=localstack
S3_FILES_BUCKET_NAME=katechatdevfiles
```

#### Node.js API:
```bash
SQS_DOCUMENTS_QUEUE=http://localhost:4566/000000000000/documents-queue
```

## Document Processing Flow

1. **Upload**: User uploads document via API
2. **Parse Command**: API sends `parse_document` to SQS
3. **Parse**: Document processor parses document, creates JSON + MD files
4. **Split Command**: Processor sends `split_document` to SQS  
5. **Split**: Processor chunks document, creates chunked JSON
6. **Index Command**: Processor sends `index_document` to SQS
7. **Index**: API processes embeddings and summarization
8. **Ready**: Document marked as READY with embeddings and summary

## Document Status Flow

```
UPLOAD -> STORAGE_UPLOAD -> PARSING -> CHUNKING -> EMBEDDING -> SUMMARIZING -> READY
```

Each status includes progress tracking (0-1) and Redis notifications.

## Features Not Yet Implemented

1. **Vector Database Storage**: Embeddings are generated but not stored in pgvector
2. **Document Chunk Entity**: Individual chunks need database storage
3. **Search Functionality**: Vector similarity search for document Q&A
4. **Error Recovery**: More robust error handling and retry mechanisms
5. **Batch Processing**: Optimize embedding requests for large documents

## Testing

To test the implementation:

1. Configure user document processing models in Settings
2. Upload a document through the API
3. Monitor Redis for progress updates
4. Check S3 for generated files (.parsed.json, .parsed.md, .chunked.json)
5. Verify document status progresses to READY
6. Check document summary is populated

The implementation provides a solid foundation for document processing with room for enhancement in vector storage and search capabilities.
