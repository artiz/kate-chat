import { Resolver, Query, Ctx, Authorized } from "type-graphql";
import { AIService } from "../services/ai.service";
import { Model } from "../entities/Model";
import { ModelProvider } from "../entities/ModelProvider";
import { ModelsResponse, ModelProvidersResponse, ModelProviderResponse, ModelResponse } from "../types/graphql/responses";
import { getRepository } from "../config/database";
import { DEFAULT_MODEL_PROVIDER, DEFAULT_MODEL_ID } from "../types/ai.types";
import { __Client } from "@aws-sdk/client-bedrock-runtime";

@Resolver()
export class ModelResolver {
    private aiService: AIService;

  constructor() {
    this.aiService = new AIService();
  }

  @Query(() => ModelsResponse)
  @Authorized()
  async getModels(): Promise<ModelsResponse> {
    try {
      // Get models from the database
      const modelRepository = getRepository(Model);
      let models = await modelRepository.find({
        where: { isActive: true },
        order: { sortOrder: "ASC" },
        relations: ["provider"],
      });

      // If no models in database, fetch from Bedrock and save
      if (!models || models.length === 0) {
        const providerRepository = getRepository(ModelProvider);
        const providers = await AIService.getModelProviders();

        // Save to database
        for (const provider of providers) {
            const existingProvider = await providerRepository.findOne({ where: { name: provider.name } });
            if (existingProvider) {
                // Update existing provider
                existingProvider.description = provider.description;
                existingProvider.apiType = provider.apiType;
                existingProvider.isActive = true;
                await providerRepository.save(existingProvider);
                provider.id = existingProvider.id; // Update the provider ID
            } else {
                // Save new provider
                const newProvider = new ModelProvider();
                newProvider.name = provider.name;
                newProvider.description = provider.description;
                newProvider.apiType = provider.apiType;
                newProvider.isActive = true;

                const savedProvider = await providerRepository.save(newProvider);
                providers.push(savedProvider);
                provider.id = savedProvider.id; // Update the provider ID
            }
        }

        // Save Bedrock models to database
        models = [];
        const bedrockModels = AIService.getSupportedModels();


        for (const [modelId, modelInfo] of Object.entries(bedrockModels)) {
          // Find the provider for this model
          const provider = providers.find((p: ModelProvider) => p.name === modelInfo.provider);

          if (provider) {
            const model = new Model();
            model.name = modelInfo.name;
            model.modelId = modelId;
            model.description = `${modelInfo.name} by ${modelInfo.provider}`;
            model.provider = provider;
            model.providerId = modelId;
            model.contextWindow = modelInfo.contextWindow || 0;
            model.isActive = true;
            model.sortOrder = 0;

            const savedModel = await modelRepository.save(model);
            models.push(savedModel);
          }
        }
      }

        // Set default model
        models.forEach((model: ModelResponse) => {
            model.isDefault = model.modelId === DEFAULT_MODEL_ID;
        });

      return { models, total: models.length };
    } catch (error) {
      console.error("Error fetching models:", error);
      return { error: "Failed to fetch models" };
    }
  }

  @Query(() => ModelProvidersResponse)
  @Authorized()
  async getModelProviders(): Promise<ModelProvidersResponse> {
    try {
      
      const providerRepository = getRepository(ModelProvider);
      let providers = await providerRepository.find({ where: { isActive: true } });

      // If no providers in database, fetch from Bedrock and save
      if (!providers || providers.length === 0) {
        const bedrockProviders = await AIService.getModelProviders();

        // Save to database
        providers = [];
        for (const provider of bedrockProviders) {
          const savedProvider = await providerRepository.save(provider);
          providers.push(savedProvider);
        }
      }

      providers.forEach((provider: ModelProviderResponse) => {
        provider.isDefault = provider.name === DEFAULT_MODEL_PROVIDER;
      });

      return {
        providers,
      };
    } catch (error) {
      console.error("Error fetching model providers:", error);
      return { error: "Failed to fetch model providers" };
    }
  }
}
