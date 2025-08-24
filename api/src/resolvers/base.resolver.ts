import { GraphQLError } from "graphql";
import { Repository } from "typeorm";

import { getRepository } from "@/config/database";
import { User } from "@/entities";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { TokenPayload } from "@/utils/jwt";
import { GraphQLContext } from ".";
import { MessagesService } from "@/services/messages.service";
import { SQSService } from "@/services/sqs.service";

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
      params.AWS_BEDROCK_REGION = user.settings.awsBedrockRegion || params.AWS_BEDROCK_REGION;
      params.AWS_BEDROCK_PROFILE = user.settings.awsBedrockProfile || params.AWS_BEDROCK_PROFILE;
      params.AWS_BEDROCK_ACCESS_KEY_ID = user.settings.awsBedrockAccessKeyId || params.AWS_BEDROCK_ACCESS_KEY_ID;
      params.AWS_BEDROCK_SECRET_ACCESS_KEY =
        user.settings.awsBedrockSecretAccessKey || params.AWS_BEDROCK_SECRET_ACCESS_KEY;
      params.OPENAI_API_KEY = user.settings.openaiApiKey || params.OPENAI_API_KEY;
      params.OPENAI_API_ADMIN_KEY = user.settings.openaiApiAdminKey || params.OPENAI_API_ADMIN_KEY;
      params.YANDEX_FM_API_KEY = user.settings.yandexFmApiKey || params.YANDEX_FM_API_KEY;
      params.YANDEX_FM_API_FOLDER = user.settings.yandexFmApiFolderId || params.YANDEX_FM_API_FOLDER;
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
