import { ApiProvider } from "./ai";
import { User } from "./user";

export enum ModelType {
  CHAT = "CHAT",
  EMBEDDING = "EMBEDDING",
  IMAGE_GENERATION = "IMAGE_GENERATION",
  AUDIO_GENERATION = "AUDIO_GENERATION",
  OTHER = "OTHER",
}

export interface Model<TUser = User> {
  id: string;
  name: string;
  modelId: string;
  apiProvider: ApiProvider;
  type: ModelType;
  provider: string;
  isActive: boolean;
  imageInput?: boolean;
  maxInputTokens?: number;
  user?: TUser;
}
