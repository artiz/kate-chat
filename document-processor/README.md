
### TODO

* Write document_processor to parse input documents to chunks (300-600 tokens).
  ```
  interface DocumentChunk {
    id: UUID;
    documentId: UUID;
    page: number;
    content: string;
    embedding: string;
  }
  ```
* Use pgvector as vector database https://medium.com/@adarsh.ajay/setting-up-postgresql-with-pgvector-in-docker-a-step-by-step-guide-d4203f6456bd
  TypeORM integration: https://github.com/pgvector/pgvector-node/blob/HEAD/tests/typeorm.test.mjs
  Use embedding dimension 3072 (https://github.com/pgvector/pgvector/issues/461)
  `MySQL`: VECTOR ?

