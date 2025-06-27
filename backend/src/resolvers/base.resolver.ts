import { GraphQLError } from "graphql";
import { Repository } from "typeorm";

import { getRepository } from "@/config/database";
import { User } from "@/entities";
import { GraphQLContext } from "@/middleware/auth.middleware";
import { TokenPayload } from "@/utils/jwt";

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
}
