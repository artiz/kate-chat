import { Resolver, Mutation, Arg, Ctx, Field, ObjectType, ID } from "type-graphql";
import { BaseResolver } from "./base.resolver";
import { GraphQLContext } from ".";
import { RealtimeService } from "@/services/realtime.service";
import { MCPAuthTokenInput } from "@/types/graphql/inputs";

@ObjectType()
export class RealtimeSessionResponse {
  /** "webrtc" (browser connects to the provider directly) or "websocket" (backend proxy) */
  @Field()
  transport: string;

  @Field()
  model: string;

  @Field({ nullable: true })
  clientSecret?: string;

  @Field({ nullable: true })
  sdpUrl?: string;

  @Field({ nullable: true })
  wsUrl?: string;
}

@Resolver()
export class RealtimeResolver extends BaseResolver {
  private realtimeService: RealtimeService;

  constructor() {
    super();
    this.realtimeService = new RealtimeService();
  }

  /** Mint connection info for a voice-to-voice session with a REALTIME model */
  @Mutation(() => RealtimeSessionResponse)
  async createRealtimeSession(
    @Arg("chatId", () => ID) chatId: string,
    @Ctx() context: GraphQLContext,
    // the browser's tokens for the chat's MCP servers, to load their tools
    @Arg("mcpTokens", () => [MCPAuthTokenInput], { nullable: true }) mcpTokens?: MCPAuthTokenInput[]
  ): Promise<RealtimeSessionResponse> {
    const user = await this.validateContextUser(context);
    const connection = this.loadConnectionParams(context, user);
    return this.realtimeService.createSession(chatId, user, connection, mcpTokens);
  }

  /**
   * Run a function call the model made in a WebRTC voice session: the browser hands it over and sends
   * the returned text back to the model as the call's output.
   */
  @Mutation(() => String)
  async callRealtimeTool(
    @Arg("chatId", () => ID) chatId: string,
    @Arg("callId") callId: string,
    @Arg("name") name: string,
    @Arg("arguments") args: string,
    @Ctx() context: GraphQLContext,
    @Arg("mcpTokens", () => [MCPAuthTokenInput], { nullable: true }) mcpTokens?: MCPAuthTokenInput[]
  ): Promise<string> {
    const user = await this.validateContextUser(context);
    const connection = this.loadConnectionParams(context, user);
    return this.realtimeService.callTool(chatId, user, connection, { callId, name, arguments: args }, mcpTokens);
  }
}
