import { Resolver, Query, Mutation, Arg, Ctx, Subscription, Root } from "type-graphql";
import { PubSubEngine } from "graphql-subscriptions";
import { Repository } from "typeorm";
import { Message, MessageRole } from "../entities/Message";
import { Chat } from "../entities/Chat";
import { CreateMessageInput, GetMessagesInput } from "../types/graphql/inputs";
import { Model } from "../entities/Model";
import { getRepository } from "../config/database";
import { AIService, DEFAULT_MODEL_ID } from "../services/ai.service";
import { GraphQLContext } from "../middleware/authMiddleware";
import { User } from "../entities/User";
import { getErrorMessage } from "../utils/errors";
import { MessagesResponse } from "../types/graphql/responses";

// Topics for PubSub
const NEW_MESSAGE = "NEW_MESSAGE";
const MESSAGE_UPDATED = "MESSAGE_UPDATED";

@Resolver(Message)
export class MessageResolver {
  private messageRepository: Repository<Message>;
  private chatRepository: Repository<Chat>;
  private userRepository: Repository<User>;
  private modelRepository: Repository<Model>;
  private aiService: AIService;

  constructor() {
    this.messageRepository = getRepository(Message);
    this.chatRepository = getRepository(Chat);
    this.modelRepository = getRepository(Model);
    this.userRepository = getRepository(User);
    this.aiService = new AIService();
  }

  @Query(() => MessagesResponse)
  async getChatMessages(
    @Arg("input") input: GetMessagesInput,
    @Ctx() context: GraphQLContext
  ): Promise<MessagesResponse> {
    const { user } = context;
    if (!user) throw new Error("Authentication required");

    const { chatId, offset: skip = 0, limit: take = 20 } = input;

    // Verify the chat belongs to the user
    const chat = await this.chatRepository.findOne({
      where: {
        id: chatId,
        isActive: true,
      },
    });

    if (!chat) throw new Error("Chat not found");

    // Get messages for the chat
    const messages = await this.messageRepository.find({
      where: { chatId },
      skip,
      take,
      order: { createdAt: "ASC" },
    });

    const total = await this.messageRepository.count({
        where: { chatId },
    });

    return {
        messages,
        total,
        hasMore: skip + messages.length < total,
    };
  }

  @Query(() => Message, { nullable: true })
  async getMessageById(
    @Arg("id") id: string,
    @Ctx() context: GraphQLContext
  ): Promise<Message | null> {
    const { user } = context;
    if (!user) throw new Error("Authentication required");

    const message = await this.messageRepository.findOne({
      where: {
        id,
      },
      relations: ["chat"],
    });

    if (!message) return null;

    // Verify the message belongs to an active chat
    if (!message.chat?.isActive) return null;

    return message;
  }

  @Mutation(() => Message)
  async createMessage(
    @Arg("input") input: CreateMessageInput,
    @Ctx() context: GraphQLContext
  ): Promise<Message> {
    const { user } = context;
    if (!user) throw new Error("Authentication required");
    
    const { chatId, content, role = MessageRole.USER } = input;
    let { modelId } = input;

    // Verify the chat belongs to the user
    const chat = await this.chatRepository.findOne({
      where: {
        id: chatId,
        isActive: true,
      },
    });

    if (!chat) throw new Error("Chat not found");

    if (!modelId) {
        modelId = chat.modelId || DEFAULT_MODEL_ID;
    }

    // Verify the model exists
    const model = await this.modelRepository.findOne({
      where: {
        modelId,
      },
    });
    if (!model) throw new Error("Model not found");

    // Create and save user message
    let messageData = this.messageRepository.create({
      content,
      role,
      modelId: model.modelId, // real model used
      modelName: model.name, 
      chatId,
      user: { id: user.userId },
      chat,
    });

    const message = await this.messageRepository.save(messageData);
    
    const { pubSub } = context;
    
    // Publish the new message event if pubSub is available
    if (pubSub) {
      await pubSub.publish(NEW_MESSAGE, { 
        chatId,
        message,
      });
    }

    // Get previous messages for context (limited to 20 for performance)
    const previousMessages = await this.messageRepository.find({
      where: { chatId },
      order: { createdAt: "DESC" },
      take: 20,
    });

    // Generate AI response
    try {
      const aiResponse = await this.aiService.getCompletion(
        previousMessages.reverse(),
        model
      );

      // Create and save AI response message
      const aiMessage = this.messageRepository.create({
        content: aiResponse,
        role: MessageRole.ASSISTANT,
        modelId: model.modelId, // real model used
        modelName: model.name, 
        chatId,
        user: { id: user.userId },
        chat,
      });

      const savedAiMessage = await this.messageRepository.save(aiMessage);
      
      // Publish the new message event for the AI response if pubSub is available
      if (pubSub) {
        await pubSub.publish(NEW_MESSAGE, { 
          chatId,
          message: savedAiMessage 
        });
      }

      return message;
    } catch (error: unknown) {
      console.error("Error generating AI response", error);
      throw new Error(`Failed to generate AI response: ${getErrorMessage(error)}`);
    }
  }

  @Subscription(() => Message, {
    topics: NEW_MESSAGE,
    filter: ({ payload, args }) => {
      return payload.chatId === args.chatId;
    },
  })
  newMessage(
    @Root() payload: { message: Message },
    @Arg("chatId") chatId: string
  ): Message {
    return payload.message;
  }

  @Mutation(() => Boolean)
  async deleteMessage(
    @Arg("id") id: string,
    @Ctx() context: GraphQLContext
  ): Promise<boolean> {
    const { user } = context;
    if (!user) throw new Error("Authentication required");

    const message = await this.messageRepository.findOne({
      where: {
        id,
      },
    });

    if (!message) throw new Error("Message not found");

    await this.messageRepository.remove(message);
    return true;
  }
}
