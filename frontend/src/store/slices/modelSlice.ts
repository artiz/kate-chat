import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface Model {
  id: string;
  name: string;
  modelId: string;
  apiProvider: string;
  isDefault?: boolean;
  provider: string;
  isActive: boolean;
  supportsImageOut?: boolean;
  supportsTextOut?: boolean;
}

interface ModelState {
  models: Model[];
  loading: boolean;
  error: string | null;
}

const initialState: ModelState = {
  models: [],
  loading: false,
  error: null,
};

const modelSlice = createSlice({
  name: "models",
  initialState,
  reducers: {
    setModels(state, action: PayloadAction<Model[]>) {
      state.models = action.payload;
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

export const { setModels, setModelLoading, setModelError, updateModel } = modelSlice.actions;
export default modelSlice.reducer;
