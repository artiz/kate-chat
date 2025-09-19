import { Resolver, Mutation, Arg, Ctx, Query, Subscription, Root, ID, FieldResolver } from "type-graphql";
import { getRepository } from "@/config/database";

import { Document } from "@/entities/Document";
import { GraphQLContext } from ".";
import { DOCUMENT_STATUS_CHANNEL } from "@/services/subscriptions.service";
import { BaseResolver } from "./base.resolver";
import { Repository } from "typeorm";
import { S3Service } from "@/services/s3.service";
import { SQSService } from "@/services/sqs.service";
import { DocumentStatusMessage } from "@/types/graphql/responses";

@Resolver(Document)
export class DocumentResolver extends BaseResolver {
  private documentRepo: Repository<Document>;

  constructor() {
    super(); // Call the constructor of BaseResolver to initialize userRepository
    this.documentRepo = getRepository(Document);
  }

  @FieldResolver(() => String, { nullable: true })
  downloadUrl(@Root() document: Document) {
    return document.s3key ? S3Service.getFileUrl(document.s3key, document.fileName) : undefined;
  }

  @Mutation(() => Document)
  async reindexDocument(@Arg("id", () => ID) id: string, @Ctx() context: GraphQLContext): Promise<Document> {
    await this.validateContextToken(context);
    const sqsService = this.getSqsService(context);

    const document = await this.documentRepo.findOne({
      where: { id },
    });

    if (!document) throw new Error("Document not found");
    if (!document.s3key) throw new Error("Document was not uploaded yet");

    await sqsService.sendJsonMessage(
      {
        command: "index_document",
        documentId: document.id,
        s3key: document.s3key,
      },
      0,
      true
    );

    return document;
  }

  @Query(() => [Document])
  async documents(@Ctx() context: GraphQLContext): Promise<Document[]> {
    const user = await this.validateContextUser(context);
    return await this.documentRepo.find({ where: { owner: { id: user.id } } });
  }

  @Mutation(() => Document)
  async processDocument(
    @Arg("id", () => ID) id: string,
    @Arg("force", { nullable: true }) force: boolean = false,
    @Ctx() context: GraphQLContext
  ): Promise<Document> {
    await this.validateContextToken(context);
    const sqsService = this.getSqsService(context);

    const document = await this.documentRepo.findOne({
      where: { id },
    });

    if (!document) throw new Error("Document not found");
    if (!document.s3key) throw new Error("Document was not uploaded yet");

    await sqsService.sendJsonMessage({
      command: "parse_document",
      documentId: document.id,
      s3key: document.s3key,
    });

    return document;
  }

  @Mutation(() => Boolean)
  async deleteDocument(@Arg("id", () => ID) id: string, @Ctx() context: GraphQLContext): Promise<boolean> {
    const user = await this.validateContextUser(context);
    const s3Service = new S3Service(user.toToken());

    const document = await this.documentRepo.findOne({
      where: { id, owner: { id: user.id } },
    });

    if (!document) throw new Error("Document not found");

    // Delete from S3 if exists
    if (document.s3key) {
      const exts = ["", ".chunked.json", ".parsed.json", ".parsed.md"];
      for (const ext of exts) {
        const key = `${document.s3key}${ext}`;
        try {
          await s3Service.deleteFile(key);
        } catch (error) {
          console.warn(error, `Failed to delete file from S3: ${key}`);
        }
      }
    }

    // Delete from database
    await this.documentRepo.remove(document);
    return true;
  }

  @Subscription(() => [DocumentStatusMessage], {
    topics: DOCUMENT_STATUS_CHANNEL,
    filter: ({ payload, args }) => args.documentIds.includes(payload.documentId),
  })
  async documentsStatus(
    @Root() payload: DocumentStatusMessage,
    @Ctx() context: GraphQLContext,
    @Arg("documentIds", () => [String]) documentIds: string[]
  ): Promise<DocumentStatusMessage[]> {
    await this.validateContextToken(context);

    if (payload.sync) {
      const document = await this.documentRepo.findOne({
        where: { id: payload.documentId },
      });

      if (document) {
        document.status = payload.status;
        document.statusInfo = payload.statusInfo;
        document.statusProgress = payload.statusProgress;
        await this.documentRepo.save(document);
      }
    }

    return [payload];
  }
}
