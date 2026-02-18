import { Resolver, Query, Ctx, Authorized, Arg, Mutation, FieldResolver, Root } from "type-graphql";
import { AIService } from "../services/ai/ai.service";
import { Model, CustomModelProtocol, CustomModelSettings } from "../entities/Model";

import { GqlModelsList, GqlProviderInfo, ProviderDetail, GqlCostsInfo } from "../types/graphql/responses";
import {
  TestModelInput,
  UpdateModelStatusInput,
  GetCostsInput,
  CreateCustomModelInput,
  DeleteModelInput,
  UpdateCustomModelInput,
  TestCustomModelInput,
} from "@/types/graphql/inputs";
import { getRepository } from "@/config/database";
import { CompleteChatRequest } from "@/types/ai.types";
import { ApiProvider, ModelType, MessageRole, ToolType } from "@/types/api";
import { ok } from "@/utils/assert";
import { Message } from "@/entities/Message";
import { createLogger } from "@/utils/logger";
import { APPLICATION_FEATURE, globalConfig } from "@/global-config";
import { getErrorMessage } from "@/utils/errors";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { BaseResolver } from "./base.resolver";
import { GraphQLContext } from ".";

const logger = createLogger(__filename);
const MAX_TEST_TEXT_LENGTH = 256;

@Resolver()
export class ModelResolver extends BaseResolver {
  private aiService: AIService;

  constructor() {
    super();
    this.aiService = new AIService();
  }

  private async getProviderInfo(
    connectionParams: ConnectionParams,
    testConnection?: boolean
  ): Promise<GqlProviderInfo[]> {
    try {
      // Get provider info from AIService
      const providersInfo = await this.aiService.getProviderInfo(connectionParams, testConnection);

      // Convert to GqlProviderInfo format
      return providersInfo.map(provider => {
        // Convert details object to array of key-value pairs
        const detailsArray: ProviderDetail[] = Object.entries(provider.details).map(([key, value]) => ({
          key,
          value: String(value),
        }));

        return {
          id: provider.id,
          name: provider.name,
          isConnected: provider.isConnected,
          costsInfoAvailable: provider.costsInfoAvailable || false,
          details: detailsArray,
        };
      });
    } catch (error) {
      logger.error(error, "Error getting provider info");
      return [];
    }
  }

  private async refreshModels(context: GraphQLContext): Promise<GqlModelsList> {
    const user = await this.validateContextUser(context);
    const connectionParams = this.loadConnectionParams(context, user);
    try {
      // Get the repository
      const modelRepository = getRepository(Model);

      // Get the models from AWS Bedrock
      const aiModels = await this.aiService.getModels(connectionParams, user);

      const dbModels = await modelRepository.find({
        where: { user: { id: user.id } },
      });
      const enabledMap = dbModels.reduce(
        (map: Record<string, boolean>, m: Model) => {
          map[m.modelId] = m.isActive;
          return map;
        },
        {} as Record<string, boolean>
      );

      logger.debug(
        { disabled: [...Object.entries(enabledMap).filter(([_, isActive]) => !isActive)].map(([id]) => id) },
        "Refreshing models"
      );

      // Clear existing models
      if (Object.keys(aiModels).length) {
        await modelRepository.delete({
          isCustom: false,
          user,
        });
      }

      // Save models to database
      const outModels: Model[] = [];
      for (const [modelId, info] of Object.entries(aiModels)) {
        // Create new model
        const model = modelRepository.create({
          ...info,
          user,
          modelId: modelId,
          description: info.description || `${info.name} by ${info.provider}`,
          isActive: modelId in enabledMap ? enabledMap[modelId] : true,
          isCustom: false,
          tools: info.tools,
        });

        // Save the model
        const savedModel: Model = await modelRepository.save(model);
        outModels.push(savedModel);
      }

      // Get provider information
      const providers = await this.getProviderInfo(connectionParams, true);
      const models = await modelRepository.find({
        where: { user: { id: user.id } },
        order: { apiProvider: { direction: "ASC" }, provider: { direction: "ASC" }, name: { direction: "ASC" } },
      });

      return { models, providers, total: models.length };
    } catch (error) {
      logger.error(error, "Error refreshing models");
      return { error: "Failed to refresh models" };
    }
  }

  @Query(() => GqlModelsList)
  @Authorized()
  async getModels(@Ctx() context: GraphQLContext): Promise<GqlModelsList> {
    const user = await this.validateContextUser(context);
    const connectionParams = this.loadConnectionParams(context, user);

    try {
      // Get models from the database
      const modelRepository = getRepository(Model);
      const models = await modelRepository.find({
        where: { user: { id: user.id } },
        order: { apiProvider: { direction: "ASC" }, provider: { direction: "ASC" }, name: { direction: "ASC" } },
      });

      // Get provider information
      const providers = await this.getProviderInfo(connectionParams);

      if (models.length) {
        return { models, providers, total: models.length };
      }

      // If no models in database, refresh from API
      return this.refreshModels(context);
    } catch (error) {
      logger.error(error, "Error fetching models");
      return { error: "Failed to fetch models" };
    }
  }

  @Query(() => [Model])
  @Authorized()
  async getActiveModels(@Ctx() context: GraphQLContext): Promise<Model[]> {
    const user = await this.validateContextToken(context);
    const modelRepository = getRepository(Model);
    const dbModels = await modelRepository.find({
      where: { isActive: true, id: user.userId },
      order: { apiProvider: { direction: "ASC" }, provider: { direction: "DESC" }, name: { direction: "ASC" } },
    });

    return dbModels;
  }

  @Mutation(() => GqlModelsList)
  @Authorized()
  async reloadModels(@Ctx() context: GraphQLContext): Promise<GqlModelsList> {
    return this.refreshModels(context);
  }

  @Mutation(() => Model)
  @Authorized()
  async updateModelStatus(@Arg("input") input: UpdateModelStatusInput, @Ctx() context: GraphQLContext): Promise<Model> {
    const user = await this.validateContextToken(context);
    try {
      const { modelId, isActive } = input;

      // Get the repository
      const modelRepository = getRepository(Model);

      // Find the model by ID
      const model = await modelRepository.findOne({
        where: { id: modelId, user: { id: user.userId } },
      });

      if (!model) {
        throw new Error("Model not found");
      }

      // Update the model's isActive status
      model.isActive = isActive;

      // Save the updated model
      return await modelRepository.save(model);
    } catch (error) {
      logger.error(error, "Error updating model status");
      throw new Error("Failed to update model status");
    }
  }

  @Mutation(() => Message)
  @Authorized()
  async testModel(@Arg("input") input: TestModelInput, @Ctx() context: GraphQLContext): Promise<Message> {
    const { id, text = "" } = input;
    if (text.length < 1) throw new Error("Text is required");
    if (text.length > MAX_TEST_TEXT_LENGTH)
      throw new Error(`Text must be less than ${MAX_TEST_TEXT_LENGTH} characters`);

    const user = await this.validateContextUser(context);
    const connectionParams = this.loadConnectionParams(context, user);

    // Get the repository
    const modelRepository = getRepository(Model);

    // Find the model by ID
    const model = await modelRepository.findOne({
      where: { id, user: { id: user.id } },
    });

    if (!model) throw new Error("Model not found");
    if (!model.isActive) throw new Error("Model is not active");
    if (model.type === ModelType.IMAGE_GENERATION) throw new Error("Image output is not supported for test model");

    const timestamp = new Date();

    if (model.type === ModelType.EMBEDDING) {
      const result = await this.aiService.getEmbeddings(model.apiProvider, connectionParams, {
        modelId: model.modelId,
        input: text,
      });

      const previewLength = 10;
      const preview = result.embedding.slice(0, previewLength).join(", ");
      const content = `Embedding [${result.embedding.length}]: [${preview}${result.embedding.length > previewLength ? ", ..." : ""}]`;

      return {
        id: "00000000-0000-0000-0000-000000000001",
        role: MessageRole.ASSISTANT,
        content: content,
        modelId: model.modelId,
        modelName: model.name,
        createdAt: timestamp,
        updatedAt: timestamp,
      } as Message;
    }

    // Create a message format for the test
    const message: Message = {
      id: "00000000-0000-0000-0000-000000000000",
      role: MessageRole.USER,
      content: text,
      createdAt: timestamp,
      updatedAt: timestamp,
    } as Message;

    // Generate a response using the AI service
    const response = await this.aiService.completeChat(
      connectionParams,
      {
        modelId: model.modelId,
        modelType: model.type,
        apiProvider: model.apiProvider,
        temperature: 0.5,
        maxTokens: 256,
      },
      [message],
      undefined,
      model
    );

    logger.trace({ message, response }, "Test model inference");

    return {
      id: "00000000-0000-0000-0000-000000000001",
      role: MessageRole.ASSISTANT,
      content: response.content,
      modelId: model.modelId,
      modelName: model.name,
      createdAt: timestamp,
      updatedAt: timestamp,
    } as Message;
  }

  @Query(() => GqlCostsInfo)
  @Authorized()
  async getCosts(@Arg("input") input: GetCostsInput, @Ctx() context: GraphQLContext): Promise<GqlCostsInfo> {
    try {
      const { apiProvider, startTime, endTime } = input;
      const user = await this.validateContextUser(context);
      const connectionParams = this.loadConnectionParams(context, user);

      // Get costs based on provider
      const usageCosts = await this.aiService.getCosts(apiProvider, connectionParams, startTime, endTime);
      // Map to GraphQL type
      return {
        start: usageCosts.start,
        end: usageCosts.end,
        error: usageCosts.error,
        costs: usageCosts.costs.map(cost => ({
          name: cost.name,
          type: cost.type,
          amounts: cost.amounts.map(amount => ({
            amount: amount.amount,
            currency: amount.currency,
          })),
        })),
      };
    } catch (error: unknown) {
      logger.error(error, "Error fetching usage costs");
      return {
        start: new Date(input.startTime * 1000),
        end: input.endTime ? new Date(input.endTime * 1000) : undefined,
        error: `Failed to fetch costs: ${getErrorMessage(error)}`,
        costs: [],
      };
    }
  }

  @Mutation(() => Model)
  @Authorized()
  async createCustomModel(@Arg("input") input: CreateCustomModelInput, @Ctx() context: GraphQLContext): Promise<Model> {
    const user = await this.validateContextToken(context);
    try {
      const {
        name,
        modelId,
        description,
        endpoint,
        apiKey,
        modelName,
        protocol,
        streaming,
        imageInput,
        maxInputTokens,
      } = input;

      // Validate protocol
      if (
        protocol !== CustomModelProtocol.OPENAI_CHAT_COMPLETIONS &&
        protocol !== CustomModelProtocol.OPENAI_RESPONSES
      ) {
        throw new Error(
          `Invalid protocol. Must be ${CustomModelProtocol.OPENAI_CHAT_COMPLETIONS} or ${CustomModelProtocol.OPENAI_RESPONSES}`
        );
      }

      // Get the repository
      const modelRepository = getRepository(Model);

      // Check if model with same modelId already exists for this user
      const existingModel = await modelRepository.findOne({
        where: { modelId, user: { id: user.userId } },
      });

      if (existingModel) {
        throw new Error("A model with this ID already exists");
      }

      // Create new custom model
      const model = modelRepository.create({
        name,
        modelId,
        description,
        provider: "Custom",
        apiProvider: ApiProvider.CUSTOM_REST_API,
        type: ModelType.CHAT,
        streaming,
        imageInput: imageInput || false,
        maxInputTokens: maxInputTokens || globalConfig.ai.maxContextTokens,
        isActive: true,
        isCustom: true,
        user: { id: user.userId },
        customSettings: {
          endpoint,
          apiKey,
          modelName,
          protocol: protocol as CustomModelProtocol,
        },
      });

      // Save the model
      const savedModel = await modelRepository.save(model);
      logger.debug({ modelId: savedModel.id, name: savedModel.name }, "Created custom model");

      return savedModel;
    } catch (error) {
      logger.error(error, "Error creating custom model");
      throw error;
    }
  }

  @Mutation(() => Boolean)
  @Authorized()
  async deleteModel(@Arg("input") input: DeleteModelInput, @Ctx() context: GraphQLContext): Promise<boolean> {
    const user = await this.validateContextToken(context);
    try {
      const { modelId } = input;

      // Get the repository
      const modelRepository = getRepository(Model);

      // Find the model by ID and ensure it's custom and belongs to the user
      const model = await modelRepository.findOne({
        where: { id: modelId, user: { id: user.userId }, isCustom: true },
      });

      if (!model) {
        throw new Error("Custom model not found or you don't have permission to delete it");
      }

      // Delete the model
      await modelRepository.remove(model);
      logger.debug({ modelId: model.id, name: model.name }, "Deleted custom model");

      return true;
    } catch (error) {
      logger.error(error, "Error deleting custom model");
      throw error;
    }
  }

  @Mutation(() => Model)
  @Authorized()
  async updateCustomModel(@Arg("input") input: UpdateCustomModelInput, @Ctx() context: GraphQLContext): Promise<Model> {
    const user = await this.validateContextToken(context);
    try {
      const { id, name, modelId, description, endpoint, apiKey, modelName, protocol, streaming, imageInput } = input;

      // Validate protocol
      if (
        protocol !== CustomModelProtocol.OPENAI_CHAT_COMPLETIONS &&
        protocol !== CustomModelProtocol.OPENAI_RESPONSES
      ) {
        throw new Error(
          `Invalid protocol. Must be ${CustomModelProtocol.OPENAI_CHAT_COMPLETIONS} or ${CustomModelProtocol.OPENAI_RESPONSES}`
        );
      }

      // Get the repository
      const modelRepository = getRepository(Model);

      // Find the model by ID and ensure it's custom and belongs to the user
      const model = await modelRepository.findOne({
        where: { id, user: { id: user.userId }, isCustom: true },
      });

      if (!model) {
        throw new Error("Custom model not found or you don't have permission to update it");
      }

      // Check if another model with same modelId already exists for this user (excluding current one)
      if (modelId !== model.modelId) {
        const existingModel = await modelRepository.findOne({
          where: { modelId, user: { id: user.userId } },
        });

        if (existingModel) {
          throw new Error("A model with this ID already exists");
        }
      }

      // Update model properties
      model.name = name;
      model.modelId = modelId;
      model.apiProvider = ApiProvider.CUSTOM_REST_API; // Ensure provider is set correctly
      model.streaming = streaming === undefined ? model.streaming : streaming;
      model.imageInput = imageInput === undefined ? model.imageInput : imageInput;
      model.maxInputTokens = input.maxInputTokens === undefined ? model.maxInputTokens : input.maxInputTokens;
      model.description = input.description === undefined ? model.description : input.description;

      ok(model.customSettings, "Custom settings must be defined for custom model");
      model.customSettings.endpoint = input.endpoint;
      model.customSettings.modelName = input.modelName;
      model.customSettings.protocol = input.protocol as CustomModelProtocol;

      if (protocol === CustomModelProtocol.OPENAI_CHAT_COMPLETIONS) {
        model.tools = [ToolType.WEB_SEARCH, ToolType.MCP];
      } else if (protocol === CustomModelProtocol.OPENAI_RESPONSES) {
        model.tools = [ToolType.WEB_SEARCH, ToolType.MCP];
      } else {
        model.tools = [];
      }

      // update apiKey only if provided
      if (apiKey) {
        model.customSettings.apiKey = apiKey;
      }

      // Save the model
      const savedModel = await modelRepository.save(model);

      return savedModel;
    } catch (error) {
      logger.error(error, "Error updating custom model");
      throw error;
    }
  }

  @Mutation(() => Message)
  @Authorized()
  async testCustomModel(@Arg("input") input: TestCustomModelInput, @Ctx() context: GraphQLContext): Promise<Message> {
    await this.validateContextToken(context);
    const modelRepository = getRepository(Model);

    try {
      const { endpoint, modelName, protocol, text, modelId } = input;
      let { apiKey } = input;

      // saved model test
      if (!apiKey && modelId) {
        const existing = await modelRepository.findOne({ where: { modelId } });
        if (existing) {
          apiKey = existing.customSettings?.apiKey;
        }
      }
      if (!apiKey) {
        throw new Error("API Key is required");
      }

      // Validate protocol
      if (
        protocol !== CustomModelProtocol.OPENAI_CHAT_COMPLETIONS &&
        protocol !== CustomModelProtocol.OPENAI_RESPONSES
      ) {
        throw new Error(
          `Invalid protocol. Must be ${CustomModelProtocol.OPENAI_CHAT_COMPLETIONS} or ${CustomModelProtocol.OPENAI_RESPONSES}`
        );
      }

      const connectionParams = {}; // Custom provider uses settings from model object

      // Create a temporary model object for testing
      const model = modelRepository.create({
        apiProvider: ApiProvider.CUSTOM_REST_API,
        customSettings: {
          endpoint,
          apiKey,
          modelName,
          protocol: protocol as CustomModelProtocol,
        },
      });

      const request: CompleteChatRequest = {
        apiProvider: ApiProvider.CUSTOM_REST_API,
        modelId: modelName,
        systemPrompt: "You are a helpful assistant.",
        temperature: 0.7,
        maxTokens: 100,
        modelType: ModelType.CHAT,
      };

      const messages: Message[] = [
        {
          role: MessageRole.USER,
          content: text,
          id: "00000000-0000-0000-0000-000000000000",
        },
      ];

      // Use AIService to complete chat (this will verify connection and protocol)
      const response = await this.aiService.completeChat(connectionParams, request, messages, undefined, model);

      return {
        id: "test-result",
        role: MessageRole.ASSISTANT,
        content: response.content,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Message;
    } catch (error) {
      logger.error(error, "Error testing custom model");
      throw error;
    }
  }
}

@Resolver(() => CustomModelSettings)
export class CustomModelSettingsResolver {
  @FieldResolver(() => String, { nullable: true })
  apiKey(@Root() settings: CustomModelSettings): string | undefined {
    if (!settings.apiKey) {
      return undefined;
    }

    // Mask the API key if it's shorter than 10 chars, otherwise show parts
    if (settings.apiKey.length <= 10) {
      return "********";
    }
    // Show first 3 and last 4 characters
    return `${settings.apiKey.substring(0, 3)}...${settings.apiKey.substring(settings.apiKey.length - 4)}`;
  }
}
