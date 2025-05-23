import { Resolver, Query, Ctx, Authorized, Arg, Mutation } from "type-graphql";
import { AIService } from "../services/ai.service";
import { Model } from "../entities/Model";

import { GqlModelsList, GqlModel } from "../types/graphql/responses";
import { TestModelInput, UpdateModelStatusInput } from "../types/graphql/inputs";
import { getRepository } from "../config/database";
import { ApiProvider, MessageFormat } from "../types/ai.types";
import { Message, MessageRole } from "../entities/Message";
import { DEFAULT_MODEL_ID } from "../config/ai";

@Resolver()
export class ModelResolver {
  private async refreshModels(): Promise<GqlModelsList> {
    try {
      // Get the repository
      const modelRepository = getRepository(Model);

      // Get the models from AWS Bedrock
      const models = await AIService.getModels();

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
        await modelRepository.clear();
      }

      // Save models to database
      const outModels: GqlModel[] = [];
      let sortOrder = 0;
      for (const [modelId, info] of Object.entries(models)) {
        // Create new model
        const model = modelRepository.create({
          ...info,
          modelId: modelId,
          description: info.description || `${info.name} by ${info.provider}`,
          isActive: modelId in enabledMap ? enabledMap[modelId] : true,
          sortOrder,
        });
        sortOrder++;

        // Save the model
        const savedModel: GqlModel = await modelRepository.save(model);

        savedModel.isDefault = model.modelId === DEFAULT_MODEL_ID;
        outModels.push(savedModel);
      }

      return { models: outModels, total: outModels.length };
    } catch (error) {
      console.error("Error refreshing models:", error);
      return { error: "Failed to refresh models" };
    }
  }

  @Query(() => GqlModelsList)
  @Authorized()
  async getModels(): Promise<GqlModelsList> {
    try {
      // Get models from the database
      const modelRepository = getRepository(Model);
      const dbModels = await modelRepository.find({
        order: { sortOrder: "ASC" },
      });

      let models: GqlModel[] = dbModels.map((model: GqlModel) => {
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

  @Query(() => [GqlModel])
  @Authorized()
  async getActiveModels(): Promise<GqlModel[]> {
    // Get models from the database
    const modelRepository = getRepository(Model);
    const dbModels = await modelRepository.find({
      where: { isActive: true },
      order: { sortOrder: "ASC" },
    });

    return dbModels.map((model: GqlModel) => {
      model.isDefault = model.modelId === DEFAULT_MODEL_ID;
      return model;
    });
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
      const updatedModel = await modelRepository.save(model);

      // Add isDefault property for the response
      (updatedModel as GqlModel).isDefault = updatedModel.modelId === DEFAULT_MODEL_ID;

      return updatedModel as GqlModel;
    } catch (error) {
      console.error("Error updating model status:", error);
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
      const message: MessageFormat = {
        role: MessageRole.USER,
        content: text,
        timestamp,
      };

      // Generate a response using the AI service
      const response = await aiService.invokeModel([message], model.modelId, model.apiProvider);

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
      console.error("Error testing model:", error);
      throw new Error(`Failed to test model: ${error || "Unknown error"}`);
    }
  }
}
