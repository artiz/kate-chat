import { Resolver, Query, Mutation, Arg, Ctx, ID } from "type-graphql";
import { GraphQLContext } from ".";
import { ChatFolder } from "@/entities";
import { BaseResolver } from "./base.resolver";
import { FoldersService } from "@/services/folders.service";
import { CreateFolderInput, GetFolderContentsInput, UpdateFolderInput } from "@/types/graphql/inputs";
import { GqlFolderContents, GqlFoldersList } from "@/types/graphql/responses";

@Resolver(ChatFolder)
export class FolderResolver extends BaseResolver {
  private foldersService: FoldersService;

  constructor() {
    super();
    this.foldersService = new FoldersService();
  }

  @Query(() => GqlFoldersList)
  async getFolders(
    @Arg("topLevelOnly", { nullable: true }) topLevelOnly: boolean,
    @Ctx() context: GraphQLContext
  ): Promise<GqlFoldersList> {
    const user = await this.validateContextToken(context);
    return this.foldersService.getFolders(user, topLevelOnly);
  }

  @Query(() => GqlFoldersList)
  async getAllFolders(@Ctx() context: GraphQLContext): Promise<GqlFoldersList> {
    const user = await this.validateContextToken(context);
    return this.foldersService.getAllFolders(user);
  }

  @Query(() => GqlFolderContents)
  async getFolderContents(
    @Arg("input") input: GetFolderContentsInput,
    @Ctx() context: GraphQLContext
  ): Promise<GqlFolderContents> {
    const user = await this.validateContextToken(context);
    return this.foldersService.getFolderContents(input, user);
  }

  @Mutation(() => ChatFolder)
  async createFolder(@Arg("input") input: CreateFolderInput, @Ctx() context: GraphQLContext): Promise<ChatFolder> {
    const user = await this.validateContextToken(context);
    return this.foldersService.createFolder(input, user);
  }

  @Mutation(() => ChatFolder)
  async updateFolder(
    @Arg("id", () => ID) id: string,
    @Arg("input") input: UpdateFolderInput,
    @Ctx() context: GraphQLContext
  ): Promise<ChatFolder> {
    const user = await this.validateContextToken(context);
    return this.foldersService.updateFolder(id, input, user);
  }

  @Mutation(() => Boolean)
  async deleteFolder(@Arg("id", () => ID) id: string, @Ctx() context: GraphQLContext): Promise<boolean> {
    const user = await this.validateContextToken(context);
    return this.foldersService.deleteFolder(id, user);
  }
}
