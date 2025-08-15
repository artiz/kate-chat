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

  constructor() {
    super(); // Call the constructor of BaseResolver to initialize userRepository
    this.documentRepo = getRepository(Document);
  }

  @Query(() => [Document])
  async documents(@Ctx() context: GraphQLContext): Promise<Document[]> {
    const user = await this.validateContextUser(context);
    return this.documentRepo.find({ where: { owner: { id: user.id } } });
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
