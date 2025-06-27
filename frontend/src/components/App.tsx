import React, { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { MantineProvider, ColorSchemeScript, Center, Loader } from "@mantine/core";
import { notifications, Notifications } from "@mantine/notifications";
import { useDispatch } from "react-redux";
import { ApolloWrapper } from "../lib/apollo-provider";
import { theme } from "../theme";
import { useGetInitialDataQuery } from "../store/services/graphql";
import { setAppConfig, setUser } from "../store/slices/userSlice";
import { setModelsAndProviders } from "../store/slices/modelSlice";
import { setChats } from "../store/slices/chatSlice";
import { useAppSelector } from "../store";
import { ThemeProvider, useTheme } from "../hooks/useTheme";

// Pages
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import { OAuthCallbackHandler } from "@/components/auth";
import { ChatList } from "@/pages/ChatList";
import { Chat } from "@/pages/Chat";
import { CreateChat } from "@/pages/CreateChat";
import { Models } from "@/pages/Models";
import { Settings } from "@/pages/Settings";
import { Library } from "@/pages/Library";
import { MainLayout } from "../components/MainLayout";
import { ERROR_FORBIDDEN, ERROR_UNAUTHORIZED } from "@/store/api";
import { loginSuccess, logout, STORAGE_AUTH_TOKEN } from "@/store/slices/authSlice";

// PrivateRoute component for protected routes
const PrivateRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated);
  return isAuthenticated ? element : <Navigate to="/login" replace />;
};

const AppContent: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, token } = useAppSelector(state => state.auth);

  // Get theme from context
  const { colorScheme } = useTheme();

  // Use RTK Query hook to fetch initial data
  const {
    data: initData,
    isLoading,
    isError,
    error,
    refetch: refetchInitialData,
  } = useGetInitialDataQuery(undefined, {
    skip: !isAuthenticated,
    refetchOnMountOrArgChange: true,
    pollingInterval: 600_000, // Poll
  });

  useEffect(() => {
    // If authenticated and data is loaded, update Redux store
    if (isAuthenticated && initData) {
      dispatch(setUser(initData.user));
      dispatch(setAppConfig(initData.appConfig));
      dispatch(setModelsAndProviders(initData));
      dispatch(setChats(initData.chats));
      dispatch(loginSuccess(initData.refreshToken?.token));
    }
  }, [isAuthenticated, initData, dispatch]);

  useEffect(() => {
    if (token) {
      document.cookie = `${STORAGE_AUTH_TOKEN}=${token}; path=/`;
    }
  }, [token]);

  useEffect(() => {
    // Handle errors from the initial data query
    if (isError) {
      if (
        "status" in error &&
        (error.status === "PARSING_ERROR" || error.status === "CUSTOM_ERROR") &&
        (error.error?.includes(ERROR_UNAUTHORIZED) || error.error?.includes(ERROR_FORBIDDEN))
      ) {
        dispatch(logout());
        navigate("/login");
      } else if ("error" in error) {
        // Show error notification
        notifications.show({
          title: "GraphQL Error",
          message: error.error || "An unknown error occurred",
          color: "red",
        });
      }
    }
  }, [isError, error, navigate, initData]);

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
            <Route path="/oauth-callback" element={<OAuthCallbackHandler />} />

            {/* Protected routes */}
            <Route path="/" element={<PrivateRoute element={<MainLayout />} />}>
              <Route index element={<Navigate to="/chat" replace />} />
              <Route path="chat" element={<ChatList />} />
              <Route path="chat/:id" element={<Chat />} />
              <Route path="chat/new" element={<CreateChat />} />
              <Route path="models" element={<Models />} />
              <Route path="settings" element={<Settings onReloadAppData={refetchInitialData} />} />
              <Route path="library" element={<Library />} />
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
