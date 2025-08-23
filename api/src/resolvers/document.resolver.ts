import { Resolver, Mutation, Arg, Ctx, Query, Subscription, Root, ID } from "type-graphql";
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

  @Query(() => [Document])
  async documents(@Ctx() context: GraphQLContext): Promise<Document[]> {
    const user = await this.validateContextUser(context);
    const s3Service = new S3Service(user.toToken());

    const documents = await this.documentRepo.find({ where: { owner: { id: user.id } } });

    return documents.map(doc => ({
      ...doc,
      downloadUrl: doc.s3key ? s3Service.getFileUrl(doc.s3key, doc.fileName) : undefined,
    }));
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
