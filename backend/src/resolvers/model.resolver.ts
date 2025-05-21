import { Resolver, Query, Ctx, Authorized, Arg, Mutation } from "type-graphql";
import { AIService } from "../services/ai.service";
import { Model } from "../entities/Model";
import { ModelsResponse, ModelResponse } from "../types/graphql/responses";
import { getRepository } from "../config/database";
import { DEFAULT_MODEL_ID } from "../types/ai.types";

@Resolver()
export class ModelResolver {
  private async refreshModels(): Promise<ModelsResponse> {
    try {
      // Get the repository
      const modelRepository = getRepository(Model);

      // Get the models from AWS Bedrock
      const bedrockModels = await AIService.getBedrockModels();

      // Clear existing models
      await modelRepository.clear();

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
        model.isActive = true;
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
        where: { isActive: true },
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

  @Mutation(() => ModelsResponse)
  @Authorized()
  async reloadModels(): Promise<ModelsResponse> {
    return this.refreshModels();
  }
}
