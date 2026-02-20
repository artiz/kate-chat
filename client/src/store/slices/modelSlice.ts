import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { logout } from "..";
import { MCPServer, Model, ProviderInfo } from "@/types/graphql";

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

interface ModelState {
  models: Model[];
  providers: ProviderInfo[];
  loading: boolean;
  error: string | null;
  costsInfo?: UsageCostsInfo;
  costsLoading: boolean;
  mcpServers: MCPServer[];
}

const initialState: ModelState = {
  models: [],
  providers: [],
  loading: false,
  error: null,
  costsLoading: false,
  mcpServers: [],
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

    setMcpServers(state, action: PayloadAction<MCPServer[]>) {
      state.mcpServers = action.payload;
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
    addModel(state, action: PayloadAction<Model>) {
      state.models.push(action.payload);
    },
    removeModel(state, action: PayloadAction<string>) {
      state.models = state.models.filter(model => model.id !== action.payload);
    },
  },
  extraReducers: builder => {
    builder.addCase(logout, state => {
      state = initialState;
      return initialState;
    });
  },
});

export const {
  setModels,
  setProviders,
  setMcpServers,
  setModelsAndProviders,
  setModelLoading,
  setModelError,
  updateModel,
  addModel,
  removeModel,
} = modelSlice.actions;
export default modelSlice.reducer;
