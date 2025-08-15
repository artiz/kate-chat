import { Resolver, Mutation, Arg, Ctx, Query, Subscription, Root } from "type-graphql";
import { getRepository } from "@/config/database";

import { Document } from "@/entities/Document";
import { GraphQLContext } from "@/middleware/auth.middleware";
import { DOCUMENT_STATUS_CHANNEL } from "@/services/queue.service";
import { BaseResolver } from "./base.resolver";
import { Repository } from "typeorm";
import { S3Service } from "@/services/s3.service";

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
