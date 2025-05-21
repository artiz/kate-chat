import React, { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { MantineProvider, ColorSchemeScript, Center, Loader } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { useDispatch } from "react-redux";
import { ApolloWrapper } from "../lib/apollo-provider";
import { theme } from "../theme";
import { useGetInitialDataQuery } from "../store/services/graphql";
import { setUser } from "../store/slices/userSlice";
import { setModels, setSelectedModel } from "../store/slices/modelSlice";
import { setChats } from "../store/slices/chatSlice";
import { useAppSelector } from "../store";
import { ThemeProvider, useTheme } from "../hooks/useTheme";

// Pages
import Login from "../pages/Login";
import Register from "../pages/Register";
import ChatList from "../pages/ChatList";
import Chat from "../pages/Chat";
import NewChat from "../pages/NewChat";
import Models from "../pages/Models";
import Settings from "../pages/Settings";
import MainLayout from "../components/MainLayout";
import { ERROR_UNAUTHORIZED } from "@/store/api";
import { STORAGE_AUTH_TOKEN } from "@/store/slices/authSlice";

// PrivateRoute component for protected routes
const PrivateRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated);
  return isAuthenticated ? element : <Navigate to="/login" replace />;
};

const AppContent: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated);

  // Get theme from context
  const { colorScheme } = useTheme();

  // Use RTK Query hook to fetch initial data
  const { data: initData, isLoading, isError, error } = useGetInitialDataQuery(undefined, {
    skip: !isAuthenticated,
  });

  useEffect(() => {
    // If authenticated and data is loaded, update Redux store
    if (isAuthenticated && initData) {
      const selectedModel = initData.models.find(model => model.isDefault) || initData.models[0];

      dispatch(setUser(initData.user));
      dispatch(setModels(initData.models));
      dispatch(setSelectedModel(selectedModel));
      dispatch(setChats(initData.chats));
    }
  }, [isAuthenticated, initData, dispatch]);

  useEffect(() => {
    // Handle errors from the initial data query
    if (isError) {
      if ("status" in error && error.status === "PARSING_ERROR" && error.error === ERROR_UNAUTHORIZED) {
        localStorage.removeItem(STORAGE_AUTH_TOKEN);
        navigate("/login");
      }
    }
    
  }, [isError, error, navigate]);

  // Make sure the theme is applied to the document element
  React.useEffect(() => {
    if (colorScheme === "auto") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.dataset.mantine = prefersDark ? "dark" : "light";
    } else {
      document.documentElement.dataset.mantine = colorScheme;
    }
  }, [colorScheme]);

  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme={colorScheme}
      forceColorScheme={colorScheme === "auto" ? undefined : colorScheme}
    >
      <Notifications position="top-right" />
      <ApolloWrapper>
        {isAuthenticated && isLoading ? (
          <Center h="100vh">
            <Loader size="xl" />
          </Center>
        ) : (
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected routes */}
            <Route path="/" element={<PrivateRoute element={<MainLayout />} />}>
              <Route index element={<Navigate to="/chat" replace />} />
              <Route path="chat" element={<ChatList />} />
              <Route path="chat/:id" element={<Chat />} />
              <Route path="chat/new" element={<NewChat />} />
              <Route path="models" element={<Models />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            {/* Fallback route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </ApolloWrapper>
    </MantineProvider>
  );
};

const App: React.FC = () => {
  // Get the theme from localStorage directly for initial load
  const savedTheme = localStorage.getItem("ui-theme") || "light";

  // Set initial theme on document element
  React.useEffect(() => {
    if (savedTheme === "auto") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.dataset.mantine = prefersDark ? "dark" : "light";
    } else {
      document.documentElement.dataset.mantine = savedTheme;
    }
  }, [savedTheme]);

  return (
    <ThemeProvider>
      <ColorSchemeScript defaultColorScheme={savedTheme as "light" | "dark" | "auto"} />
      <AppContent />
    </ThemeProvider>
  );
};

export default App;
