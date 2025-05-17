import { Resolver, Query, Ctx, Authorized } from "type-graphql";
import { AIService } from "../services/ai.service";
import { Model } from "../entities/Model";
import { ModelProvider } from "../entities/ModelProvider";
import { ModelsResponse, ModelProvidersResponse } from "../types/graphql/responses";
import { getRepository } from "../config/database";

@Resolver()
export class ModelResolver {
  @Query(() => ModelsResponse)
  @Authorized()
  async getModels(): Promise<ModelsResponse> {
    try {
      // Get models from the database
      const modelRepository = getRepository(Model);
      let models = await modelRepository.find({ 
        where: { isActive: true },
        order: { sortOrder: "ASC" },
        relations: ["provider"]
      });
      
      // If no models in database, fetch from Bedrock and save
      if (!models || models.length === 0) {
        const providerRepository = getRepository(ModelProvider);
        const providers = await providerRepository.find({ where: { isActive: true } });
        
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
      // Get providers from the database
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
      
      return { providers, total: providers.length };
    } catch (error) {
      console.error("Error fetching model providers:", error);
      return { error: "Failed to fetch model providers" };
    }
  }
}
