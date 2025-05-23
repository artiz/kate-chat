import { Resolver, Query, Ctx, Authorized, Arg, Mutation } from "type-graphql";
import { AIService } from "../services/ai.service";
import { Model } from "../entities/Model";

import { ModelsResponse, ModelResponse } from "../types/graphql/responses";
import { TestModelInput, UpdateModelStatusInput } from "../types/graphql/inputs";
import { getRepository } from "../config/database";
import { MessageFormat } from "../types/ai.types";
import { MessageRole } from "../entities/Message";
import { DEFAULT_MODEL_ID } from "../config/ai";

@Resolver()
export class ModelResolver {
  private async refreshModels(): Promise<ModelsResponse> {
    try {
      // Get the repository
      const modelRepository = getRepository(Model);

      // Get the models from AWS Bedrock
      const bedrockModels = await AIService.getBedrockModels();

      const dbModels = await modelRepository.find({});
      const enabledMap = dbModels.reduce(
        (map: Record<string, boolean>, m: Model) => {
          map[m.modelId] = m.isActive;
          return map;
        },
        {} as Record<string, boolean>
      );

      // Clear existing models
      if (Object.keys(bedrockModels).length) {
        await modelRepository.clear();
      }

      // Save Bedrock models to database
      const models: ModelResponse[] = [];
      let sortOrder = 0;
      for (const [modelId, modelInfo] of Object.entries(bedrockModels)) {
        // Create new model
        const model = new Model();

        // Update model properties
        model.name = modelInfo.name;
        model.modelId = modelId;
        model.modelArn = modelInfo.modelArn;
        model.description = modelInfo.description || `${modelInfo.name} by ${modelInfo.provider}`;
        model.provider = modelInfo.provider;
        model.apiType = "bedrock";
        model.supportsStreaming = modelInfo.supportsStreaming || false;
        model.supportsTextIn = modelInfo.supportsTextIn || true;
        model.supportsTextOut = modelInfo.supportsTextOut || true;
        model.supportsImageIn = modelInfo.supportsImageIn || false;
        model.supportsImageOut = modelInfo.supportsImageOut || false;
        model.supportsEmbeddingsIn = modelInfo.supportsEmbeddingsIn || false;
        model.isActive = modelId in enabledMap ? enabledMap[modelId] : true;
        model.sortOrder = sortOrder++;

        // Save the model
        const savedModel: ModelResponse = await modelRepository.save(model);

        savedModel.isDefault = model.modelId === DEFAULT_MODEL_ID;
        models.push(savedModel);
      }

      return { models, total: models.length };
    } catch (error) {
      console.error("Error refreshing models:", error);
      return { error: "Failed to refresh models" };
    }
  }

  @Query(() => ModelsResponse)
  @Authorized()
  async getModels(): Promise<ModelsResponse> {
    try {
      // Get models from the database
      const modelRepository = getRepository(Model);
      const dbModels = await modelRepository.find({
        order: { sortOrder: "ASC" },
      });

      let models: ModelResponse[] = dbModels.map((model: ModelResponse) => {
        model.isDefault = model.modelId === DEFAULT_MODEL_ID;
        return model;
      });

      if (models.length) {
        return { models, total: models.length };
      }

      // If no models in database, refresh from API
      return this.refreshModels();
    } catch (error) {
      console.error("Error fetching models:", error);
      return { error: "Failed to fetch models" };
    }
  }

  @Query(() => [ModelResponse])
  @Authorized()
  async getActiveModels(): Promise<ModelResponse[]> {
    // Get models from the database
    const modelRepository = getRepository(Model);
    const dbModels = await modelRepository.find({
      where: { isActive: true },
      order: { sortOrder: "ASC" },
    });

    return dbModels.map((model: ModelResponse) => {
      model.isDefault = model.modelId === DEFAULT_MODEL_ID;
      return model;
    });
  }

  @Mutation(() => ModelsResponse)
  @Authorized()
  async reloadModels(): Promise<ModelsResponse> {
    return this.refreshModels();
  }

  @Mutation(() => ModelResponse)
  @Authorized()
  async updateModelStatus(@Arg("input") input: UpdateModelStatusInput): Promise<ModelResponse> {
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
      const updatedModel = await modelRepository.save(model);

      // Add isDefault property for the response
      (updatedModel as ModelResponse).isDefault = updatedModel.modelId === DEFAULT_MODEL_ID;

      return updatedModel as ModelResponse;
    } catch (error) {
      console.error("Error updating model status:", error);
      throw new Error("Failed to update model status");
    }
  }

  @Mutation(() => String)
  @Authorized()
  async testModel(@Arg("input") input: TestModelInput): Promise<string> {
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

      // Create a message format for the test
      const message: MessageFormat = {
        role: MessageRole.USER,
        content: text,
        timestamp: new Date(),
      };

      // Generate a response using the AI service
      const response = await aiService.invokeBedrockModel([message], model.modelId);

      return response;
    } catch (error: unknown) {
      console.error("Error testing model:", error);
      throw new Error(`Failed to test model: ${error || "Unknown error"}`);
    }
  }
}
