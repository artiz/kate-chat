import { Resolver, Mutation, Arg, Ctx, Query, Subscription, Root } from "type-graphql";
import { GraphQLUpload, FileUpload } from "graphql-upload-ts";
import { createHash } from "crypto";
import { getRepository } from "@/config/database";

import { Document } from "@/entities/Document";
import { ChatDocument } from "@/entities/ChatDocument";
import { GraphQLContext } from "@/middleware/auth.middleware";
import { S3Service } from "@/services/s3.service";
import { DocumentStatus } from "@/types/ai.types";
import { QueueService, DOCUMENT_STATUS_CHANNEL } from "@/services/queue.service";
import { BaseResolver } from "./base.resolver";
import { MessagesService } from "@/services/messages.service";
import { Repository } from "typeorm";
import { User } from "@/entities";
import { UploadDocumentsResponse } from "@/types/graphql/responses";
import { DocumentUploadInput } from "@/types/graphql/inputs";
import { ok } from "@/utils/assert";

@Resolver(Document)
export class DocumentResolver extends BaseResolver {
  private documentRepo: Repository<Document>;
  private chatDocumentRepo: Repository<ChatDocument>;
  private queueService: QueueService;

  constructor() {
    super(); // Call the constructor of BaseResolver to initialize userRepository
    this.documentRepo = getRepository(Document);
    this.chatDocumentRepo = getRepository(ChatDocument);
    this.queueService = new QueueService(MessagesService.pubSub);
  }

  @Mutation(() => UploadDocumentsResponse)
  async uploadDocuments(
    @Arg("input", () => DocumentUploadInput) input: DocumentUploadInput,
    @Ctx() context: GraphQLContext
  ): Promise<UploadDocumentsResponse> {
    const user = await this.validateContextUser(context);
    const documents: Document[] = [];
    const { uploads, chatId } = input;

    for (let ndx = 0; ndx < uploads.length; ++ndx) {
      ok(uploads[ndx]);
      const upload = uploads[ndx];
      const file = (await upload) as unknown as FileUpload;
      const document = await this.uploadDocument(file, user, chatId);
      documents.push(document);
    }

    return { documents };
  }

  async uploadDocument(file: FileUpload, user: User, chatId?: string): Promise<Document> {
    const { createReadStream, filename: fileName, mimetype } = file;
    const stream = createReadStream();
    const hash = createHash("sha256");
    let fileSize = 0;

    const chunks = [];
    for await (const chunk of stream) {
      hash.update(chunk);
      chunks.push(chunk);
      fileSize += chunk.length;
    }
    const sha256checksum = hash.digest("hex");
    const existingDocument = await this.documentRepo.findOne({
      where: {
        sha256checksum,
        fileSize,
        ownerId: user.id,
      },
    });

    if (existingDocument) {
      if (chatId) {
        const chatDocumentExists = await this.chatDocumentRepo.findOne({
          where: { chatId, documentId: existingDocument.id },
        });
        if (!chatDocumentExists) {
          await this.chatDocumentRepo.save(
            this.chatDocumentRepo.create({
              chatId,
              documentId: existingDocument.id,
            })
          );
        }
      }

      return existingDocument;
    }

    let document = this.documentRepo.create({
      fileName,
      fileSize,
      mime: mimetype,
      sha256checksum,
      owner: user,
      s3key: "", // will be updated after upload
      status: DocumentStatus.UPLOAD,
      statusProgress: 1,
    });

    document = await this.documentRepo.save(document);
    this.queueService.publishDocumentStatus(document);

    const s3key = `document/${user.id}/${document.id}`;
    const s3Service = new S3Service(user.toToken());
    const fileBuffer = Buffer.concat(chunks);
    await s3Service.uploadFile(fileBuffer, s3key, mimetype);

    document.s3key = s3key;
    document.status = DocumentStatus.STORAGE_UPLOAD;
    document.statusProgress = 1; // Set progress to 100% after upload
    document = await this.documentRepo.save(document);
    if (chatId) {
      await this.chatDocumentRepo.save(
        this.chatDocumentRepo.create({
          chatId,
          documentId: document.id,
        })
      );
    }

    this.queueService.publishDocumentStatus(document);
    return document;
  }

  @Query(() => [Document])
  async documents(@Ctx() context: GraphQLContext): Promise<Document[]> {
    const user = await this.validateContextUser(context);
    const documentRepository = getRepository(Document);
    return documentRepository.find({ where: { owner: { id: user.id } } });
  }

  @Subscription(() => [Document], {
    topics: DOCUMENT_STATUS_CHANNEL,
    filter: ({ payload, args }) => args.documentIds.includes(payload.documentId),
  })
  async documentsStatus(
    @Root() { document }: { document: Document },
    @Ctx() context: GraphQLContext,
    @Arg("documentIds", () => [String]) documentIds: string[]
  ): Promise<Document[]> {
    await this.validateContextToken(context);
    return [document];
  }
}
