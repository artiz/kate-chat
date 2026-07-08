import { Resolver, Mutation, Arg, Ctx, Field, ObjectType, ID } from "type-graphql";
import { BaseResolver } from "./base.resolver";
import { GraphQLContext } from ".";
import { RealtimeService } from "@/services/realtime.service";

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
    @Ctx() context: GraphQLContext
  ): Promise<RealtimeSessionResponse> {
    const user = await this.validateContextUser(context);
    const connection = this.loadConnectionParams(context, user);
    return this.realtimeService.createSession(chatId, user, connection);
  }
}
