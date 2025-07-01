import { Resolver, Query, Mutation, Arg, Ctx, Authorized } from "type-graphql";
import { User } from "../entities/User";
import { Chat } from "../entities/Chat";
import { Model } from "../entities/Model";
import { UserRole } from "../types/ai.types";
import { BaseResolver } from "./base.resolver";
import { GraphQLContext } from "@/middleware/auth.middleware";
import { AdminStatsResponse, AdminUsersResponse } from "../types/graphql/responses";
import { GetUsersInput } from "../types/graphql/inputs";
import { getRepository } from "../config/database";

@Resolver()
export class AdminResolver extends BaseResolver {
  @Authorized(UserRole.ADMIN)
  @Query(() => AdminStatsResponse)
  async getAdminStats(@Ctx() context: GraphQLContext): Promise<AdminStatsResponse> {
    await this.validateContextUser(context);

    // Get repositories
    const chatRepository = getRepository(Chat);
    const modelRepository = getRepository(Model);

    // Get counts for different entities
    const [usersCount, chatsCount, modelsCount] = await Promise.all([
      this.userRepository.count(),
      chatRepository.count(),
      modelRepository.count(),
    ]);

    return {
      usersCount,
      chatsCount,
      modelsCount,
    };
  }

  @Authorized(UserRole.ADMIN)
  @Query(() => AdminUsersResponse)
  async getUsers(
    @Arg("input", { nullable: true }) input: GetUsersInput = {},
    @Ctx() context: GraphQLContext
  ): Promise<AdminUsersResponse> {
    await this.validateContextUser(context);

    const { offset = 0, limit = 20, searchTerm } = input;

    let query = this.userRepository.createQueryBuilder("user");

    if (searchTerm) {
      query = query.where(
        "user.email LIKE :searchTerm OR user.firstName LIKE :searchTerm OR user.lastName LIKE :searchTerm",
        { searchTerm: `%${searchTerm}%` }
      );
    }

    query = query.orderBy("user.createdAt", "DESC").skip(offset).take(limit);

    const [users, total] = await query.getManyAndCount();

    return {
      users,
      total,
      hasMore: offset + limit < total,
    };
  }
}
