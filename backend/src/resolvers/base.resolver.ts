import { getRepository } from "@/config/database";
import { User } from "@/entities";
import { GraphQLContext } from "@/middleware/auth.middleware";
import { TokenPayload } from "@/utils/jwt";
import { P } from "pino";
import { Repository } from "typeorm";

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
      throw new Error("Not authenticated");
    }

    const user = await this.userRepository.findOne({
      where: { id: tokenPayload.userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  }

  protected async validateContextToken(context: GraphQLContext): Promise<TokenPayload> {
    const { tokenPayload } = context;
    if (!tokenPayload) throw new Error("Authentication required");

    return tokenPayload;
  }
}
