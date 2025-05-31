import { Resolver, Query, Ctx, Authorized, Arg, Mutation } from "type-graphql";
import { AIService } from "../services/ai.service";
import { Model } from "../entities/Model";

import {
  GqlModelsList,
  GqlModel,
  GqlProviderInfo,
  ProviderDetail,
  GqlCostsInfo,
  GqlServiceCostInfo,
  GqlAmount,
} from "../types/graphql/responses";
import { TestModelInput, UpdateModelStatusInput, GetCostsInput } from "../types/graphql/inputs";
import { getRepository } from "../config/database";
import { ApiProvider, ModelMessage, ProviderInfo, ServiceCostInfo } from "../types/ai.types";
import { Message, MessageRole } from "../entities/Message";
import { createLogger } from "@/utils/logger";
import { OpenAIService } from "@/services/openai/openai.service";
import { BedrockService } from "@/services/bedrock/bedrock.service";
import { getErrorMessage } from "@/utils/errors";
import { getSystemErrorMap } from "util";
import { DEFAULT_PROMPT } from "@/config/ai";

const logger = createLogger(__filename);

@Resolver()
export class ModelResolver {
  private aiService: AIService;

  constructor() {
    this.aiService = new AIService();
  }

  private async getProviderInfo(): Promise<GqlProviderInfo[]> {
    try {
      // Get provider info from AIService
      const providersInfo = await this.aiService.getProviderInfo();

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

  private async refreshModels(): Promise<GqlModelsList> {
    try {
      // Get the repository
      const modelRepository = getRepository(Model);

      // Get the models from AWS Bedrock
      const models = await this.aiService.getModels();

      const dbModels = await modelRepository.find({});
      const enabledMap = dbModels.reduce(
        (map: Record<string, boolean>, m: Model) => {
          map[m.modelId] = m.isActive;
          return map;
        },
        {} as Record<string, boolean>
      );

      // Clear existing models
      if (Object.keys(models).length) {
        await modelRepository.delete({
          isCustom: false,
        });
      }

      // Save models to database
      const outModels: GqlModel[] = [];
      for (const [modelId, info] of Object.entries(models)) {
        // Create new model
        const model = modelRepository.create({
          ...info,
          modelId: modelId,
          description: info.description || `${info.name} by ${info.provider}`,
          isActive: modelId in enabledMap ? enabledMap[modelId] : true,
          isCustom: false,
        });

        // Save the model
        const savedModel: GqlModel = await modelRepository.save(model);
        outModels.push(savedModel);
      }

      // Get provider information
      const providers = await this.getProviderInfo();

      return { models: outModels, providers, total: outModels.length };
    } catch (error) {
      logger.error(error, "Error refreshing models");
      return { error: "Failed to refresh models" };
    }
  }

  @Query(() => GqlModelsList)
  @Authorized()
  async getModels(): Promise<GqlModelsList> {
    try {
      // Get models from the database
      const modelRepository = getRepository(Model);
      const models = await modelRepository.find({
        order: { apiProvider: "ASK", provider: "ASK", name: "ASC" },
      });

      // Get provider information
      const providers = await this.getProviderInfo();

      if (models.length) {
        return { models, providers, total: models.length };
      }

      // If no models in database, refresh from API
      return this.refreshModels();
    } catch (error) {
      logger.error(error, "Error fetching models");
      return { error: "Failed to fetch models" };
    }
  }

  @Query(() => [GqlModel])
  @Authorized()
  async getActiveModels(): Promise<GqlModel[]> {
    // Get models from the database
    const modelRepository = getRepository(Model);
    const dbModels = await modelRepository.find({
      where: { isActive: true },
      order: { apiProvider: "ASK", provider: "ASK", name: "ASC" },
    });

    return dbModels;
  }

  @Mutation(() => GqlModelsList)
  @Authorized()
  async reloadModels(): Promise<GqlModelsList> {
    return this.refreshModels();
  }

  @Mutation(() => GqlModel)
  @Authorized()
  async updateModelStatus(@Arg("input") input: UpdateModelStatusInput): Promise<GqlModel> {
    try {
      const { modelId, isActive } = input;

      // Get the repository
      const modelRepository = getRepository(Model);

      // Find the model by ID
      const model = await modelRepository.findOne({ where: { id: modelId } });

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
  async testModel(@Arg("input") input: TestModelInput): Promise<Message> {
    try {
      const { modelId, text } = input;

      // Get the repository
      const modelRepository = getRepository(Model);

      // Find the model by ID
      const model = await modelRepository.findOne({ where: { id: modelId } });

      if (!model) {
        throw new Error("Model not found");
      }

      if (!model.isActive) {
        throw new Error("Model is not active");
      }

      // Create service instance
      const aiService = new AIService();
      const timestamp = new Date();

      // Create a message format for the test
      const message: ModelMessage = {
        role: MessageRole.USER,
        body: text,
        timestamp,
      };

      // Generate a response using the AI service
      const response = await aiService.invokeModel(model.apiProvider, {
        modelId: model.modelId,
        messages: [message],
      });

      logger.debug({ message, response }, "Test model inference");
      return {
        id: "",
        role: MessageRole.ASSISTANT,
        content: response.content,
        modelId,
        modelName: model.name,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    } catch (error: unknown) {
      logger.error(error, "Error testing model");
      throw new Error(`Failed to test model: ${error || "Unknown error"}`);
    }
  }

  @Query(() => GqlCostsInfo)
  @Authorized()
  async getCosts(@Arg("input") input: GetCostsInput): Promise<GqlCostsInfo> {
    try {
      const { providerId, startTime, endTime } = input;

      // Get costs based on provider
      const usageCosts = await this.aiService.getCosts(providerId, startTime, endTime);
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
