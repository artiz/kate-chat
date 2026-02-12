import { GraphQLError } from "graphql";
import { Repository } from "typeorm";

import { getRepository } from "@/config/database";
import { User } from "@/entities";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { TokenPayload } from "@/utils/jwt";
import { GraphQLContext } from ".";
import { MessagesService } from "@/services/messages.service";
import { SQSService } from "@/services/messaging";

export class BaseResolver {
  protected userRepository: Repository<User>;

  constructor() {
    this.userRepository = getRepository(User);
  }

  protected async loadUserFromContext(context: GraphQLContext): Promise<User | null> {
    const { tokenPayload } = context;
    if (!tokenPayload?.userId) {
      return null;
    }

    const user = await this.userRepository.findOne({
      where: { id: tokenPayload.userId },
    });

    return user;
  }

  protected async validateContextUser(context: GraphQLContext): Promise<User> {
    const { tokenPayload } = context;
    if (!tokenPayload?.userId) {
      throw new GraphQLError("Unauthorized", {
        extensions: {
          code: 401,
        },
      });
    }

    const user = await this.userRepository.findOne({
      where: { id: tokenPayload.userId },
    });

    if (!user) {
      throw new GraphQLError("Forbidden", {
        extensions: {
          code: 403,
        },
      });
    }

    return user;
  }

  protected async validateContextToken(context: GraphQLContext): Promise<TokenPayload> {
    const { tokenPayload } = context;

    if (!tokenPayload)
      throw new GraphQLError("Unauthorized", {
        extensions: {
          code: 401,
        },
      });

    return tokenPayload;
  }

  protected loadConnectionParams(context: GraphQLContext, user: User): ConnectionParams {
    const params: ConnectionParams = context.connectionParams || {};
    if (user?.settings) {
      params.awsBedrockRegion ||= user.settings.awsBedrockRegion;
      params.awsBedrockProfile ||= user.settings.awsBedrockProfile;
      params.awsBedrockAccessKeyId ||= user.settings.awsBedrockAccessKeyId;
      params.awsBedrockSecretAccessKey ||= user.settings.awsBedrockSecretAccessKey;
      params.openAiApiKey ||= user.settings.openaiApiKey;
      params.openAiApiAdminKey ||= user.settings.openaiApiAdminKey;
      params.yandexFmApiKey ||= user.settings.yandexFmApiKey;
      params.yandexFmApiFolder ||= user.settings.yandexFmApiFolderId;
    }
    return params;
  }

  protected getMessagesService(context: GraphQLContext): MessagesService {
    const messagesService = context.messagesService;
    if (!messagesService) {
      throw new GraphQLError("MessagesService not available in context", {
        extensions: {
          code: 500,
        },
      });
    }
    return messagesService;
  }

  protected getSqsService(context: GraphQLContext): SQSService {
    const sqsService = context.sqsService;
    if (!sqsService) {
      throw new GraphQLError("SqsService not available in context", {
        extensions: {
          code: 500,
        },
      });
    }
    return sqsService;
  }
}
