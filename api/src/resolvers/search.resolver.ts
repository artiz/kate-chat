import { Resolver, Query, Arg, Ctx } from "type-graphql";
import { GraphQLContext } from ".";
import { BaseResolver } from "./base.resolver";
import { SearchResults } from "@/types/graphql/responses";
import { SearchInput } from "@/types/graphql/inputs";
import { SearchService } from "@/services/search.service";

@Resolver()
export class SearchResolver extends BaseResolver {
  private searchService: SearchService;

  constructor() {
    super();
    this.searchService = new SearchService();
  }

  @Query(() => SearchResults)
  async search(@Arg("input") input: SearchInput, @Ctx() context: GraphQLContext): Promise<SearchResults> {
    const user = await this.validateContextToken(context);
    return this.searchService.search(input.query, user.userId, input.limit ?? 10);
  }
}
