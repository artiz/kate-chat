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
      const modelRepository = getRepository(Model);
      const models = await modelRepository.find({ 
        where: { isActive: true },
        order: { sortOrder: "ASC" },
        relations: ["provider"]
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
