import { ApiProvider } from "./ai";
import { User } from "./user";

export enum ModelType {
  CHAT = "CHAT",
  EMBEDDING = "EMBEDDING",
  IMAGE_GENERATION = "IMAGE_GENERATION",
  VIDEO_GENERATION = "VIDEO_GENERATION",
  AUDIO_GENERATION = "AUDIO_GENERATION",
  REALTIME = "REALTIME",
  OTHER = "OTHER",
}

export enum CustomModelProtocol {
  OPENAI_CHAT_COMPLETIONS = "OPENAI_CHAT_COMPLETIONS",
  OPENAI_RESPONSES = "OPENAI_RESPONSES",
}

export interface CustomModelSettings {
  endpoint?: string;
  apiKey?: string;
  modelName?: string;
  protocol?: CustomModelProtocol;
  description?: string;
}

export interface Model<TUser = User> {
  id?: string;
  name: string;
  modelId: string;
  apiProvider?: ApiProvider;
  provider?: string;
  type?: ModelType;
  isActive?: boolean;
  isCustom?: boolean;
  streaming?: boolean;
  imageInput?: boolean;
  maxInputTokens?: number;
  description?: string;
  customSettings?: CustomModelSettings;
  user?: TUser;
}
