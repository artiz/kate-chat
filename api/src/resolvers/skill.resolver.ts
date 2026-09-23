import { Resolver, Query, Ctx } from "type-graphql";
import { BaseResolver } from "./base.resolver";
import { GqlSkill } from "../types/graphql/responses";
import { GraphQLContext } from ".";
import { getSkills } from "@/services/skills.service";

@Resolver()
export class SkillResolver extends BaseResolver {
  /**
   * Every signed-in user gets the whole skill, scripts included: the browser that runs a skill's
   * program needs its packages and helper modules. The admin page shows the same data read-only.
   */
  @Query(() => [GqlSkill])
  async skills(@Ctx() context: GraphQLContext): Promise<GqlSkill[]> {
    await this.validateContextToken(context);
    return getSkills();
  }
}
