import { ApiProvider } from "@/types/ai";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface ProviderDetail {
  key: string;
  value: string;
}

export interface ProviderInfo {
  name: string;
  id: ApiProvider;
  isConnected: boolean;
  details: ProviderDetail[];
  costsInfoAvailable?: boolean;
}

export interface CostAmount {
  amount: number;
  currency: string;
}

export interface ServiceCostInfo {
  name: string;
  type: string;
  amounts: CostAmount[];
}

export interface UsageCostsInfo {
  start: Date;
  end?: Date;
  error?: string;
  costs: ServiceCostInfo[];
}

export enum ModelType {
  CHAT = "chat",
  EMBEDDING = "embedding",
  IMAGE_GENERATION = "image_generation",
  AUDIO_GENERATION = "audio_generation",
  OTHER = "other",
}

export interface Model {
  id: string;
  name: string;
  modelId: string;
  apiProvider: ApiProvider;
  type: ModelType;
  provider: string;
  isActive: boolean;
  imageInput?: boolean;
  maxInputTokens?: number;
}

interface ModelState {
  models: Model[];
  providers: ProviderInfo[];
  loading: boolean;
  error: string | null;
  costsInfo?: UsageCostsInfo;
  costsLoading: boolean;
}

const initialState: ModelState = {
  models: [],
  providers: [],
  loading: false,
  error: null,
  costsLoading: false,
};

const modelSlice = createSlice({
  name: "models",
  initialState,
  reducers: {
    setModels(state, action: PayloadAction<Model[]>) {
      state.models = action.payload;
      state.error = null;
    },

    setProviders(state, action: PayloadAction<ProviderInfo[]>) {
      state.providers = action.payload;
    },

    setModelsAndProviders(state, action: PayloadAction<{ models: Model[]; providers: ProviderInfo[] }>) {
      state.models = action.payload.models;
      state.providers = action.payload.providers;
      state.error = null;
    },
    setModelLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setModelError(state, action: PayloadAction<string>) {
      state.error = action.payload;
      state.loading = false;
    },
    updateModel(state, action: PayloadAction<Model>) {
      const index = state.models.findIndex(model => model.id === action.payload.id);
      if (index !== -1) {
        state.models[index] = {
          ...state.models[index],
          ...action.payload,
        };
      }
    },
  },
});

export const { setModels, setProviders, setModelsAndProviders, setModelLoading, setModelError, updateModel } =
  modelSlice.actions;
export default modelSlice.reducer;
