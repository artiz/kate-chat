import { Resolver, Query, Mutation, Arg, Ctx, Subscription, Root } from "type-graphql";
import { PubSubEngine } from "graphql-subscriptions";
import { Repository } from "typeorm";
import { Message, MessageRole } from "../entities/Message";
import { Chat } from "../entities/Chat";
import { CreateMessageInput, GetMessagesInput } from "../types/graphql/inputs";
import { Model } from "../entities/Model";
import { getMongoRepository } from "../config/database";
import { AIService } from "../services/ai.service";
import { GraphQLContext } from "../middleware/authMiddleware";

// Topics for PubSub
const NEW_MESSAGE = "NEW_MESSAGE";
const MESSAGE_UPDATED = "MESSAGE_UPDATED";

@Resolver(Message)
export class MessageResolver {
  private messageRepository: Repository<Message>;
  private chatRepository: Repository<Chat>;
  private modelRepository: Repository<Model>;
  private aiService: AIService;

  constructor() {
    this.messageRepository = getMongoRepository(Message);
    this.chatRepository = getMongoRepository(Chat);
    this.modelRepository = getMongoRepository(Model);
    this.aiService = new AIService();
  }

  @Query(() => [Message])
  async getChatMessages(
    @Arg("input") input: GetMessagesInput,
    @Ctx() context: GraphQLContext
  ): Promise<Message[]> {
    const { user } = context;
    if (!user) throw new Error("Authentication required");

    const { chatId, skip = 0, take = 20 } = input;

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

    return messages;
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

    const { chatId, content, modelId, role = MessageRole.USER } = input;

    // Verify the chat belongs to the user
    const chat = await this.chatRepository.findOne({
      where: {
        id: chatId,
        user: user,
        isActive: true,
      },
    });

    if (!chat) throw new Error("Chat not found");

    // Verify the model exists
    const model = await this.modelRepository.findOne({
      where: {
        id: modelId,
      },
    });

    if (!model) throw new Error("Model not found");

    // Create and save user message
    const userMessage = this.messageRepository.create({
      content,
      role,
      modelId,
      chatId,
      user,
      chat,
    });

    const savedUserMessage = await this.messageRepository.save(userMessage);
    
    const { pubSub } = context;
    
    // Publish the new message event if pubSub is available
    if (pubSub) {
      await pubSub.publish(NEW_MESSAGE, { 
        chatId,
        message: savedUserMessage 
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
        modelId,
        chatId,
        user,
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

      return savedUserMessage;
    } catch (error) {
      console.error("Error generating AI response:", error);
      throw new Error("Failed to generate AI response");
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
