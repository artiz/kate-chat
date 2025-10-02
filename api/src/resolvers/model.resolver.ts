import { Resolver, Query, Ctx, Authorized, Arg, Mutation } from "type-graphql";
import { AIService } from "../services/ai.service";
import { Model } from "../entities/Model";

import { GqlModelsList, GqlProviderInfo, ProviderDetail, GqlCostsInfo } from "../types/graphql/responses";
import { TestModelInput, UpdateModelStatusInput, GetCostsInput } from "../types/graphql/inputs";
import { getRepository } from "../config/database";
import { MessageRole, ModelMessage, ModelType } from "../types/ai.types";
import { Message } from "../entities/Message";
import { createLogger } from "@/utils/logger";
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
      const aiModels = await this.aiService.getModels(connectionParams);

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
        id: "00000000-0000-0000-0000-000000000000",
        role: MessageRole.SYSTEM,
        content: content,
        modelId: model.modelId,
        modelName: model.name,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    }

    // Create a message format for the test
    const message: ModelMessage = {
      role: MessageRole.USER,
      body: text,
      timestamp,
    };

    // Generate a response using the AI service
    const response = await this.aiService.completeChat(model.apiProvider, connectionParams, {
      modelId: model.modelId,
      messages: [message],
    });

    logger.trace({ message, response }, "Test model inference");

    return {
      id: "00000000-0000-0000-0000-000000000000",
      role: MessageRole.ASSISTANT,
      content: response.content,
      modelId: model.modelId,
      modelName: model.name,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
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
}
