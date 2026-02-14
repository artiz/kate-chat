import React, { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { MantineProvider, ColorSchemeScript, Center, Loader, MantineThemeOverride } from "@mantine/core";
import { notifications, Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { LANGUAGE_STORAGE_KEY, ThemeProvider, useTheme } from "@katechat/ui";
import { ApolloWrapper } from "@/lib/apollo-provider";
import { createAppTheme } from "@/theme";
import { useGetInitialDataQuery } from "../store/services/graphql";
import { setAppConfig, setUser } from "../store/slices/userSlice";
import { setModelsAndProviders } from "../store/slices/modelSlice";
import { setChats } from "../store/slices/chatSlice";
import { logout, useAppSelector } from "../store";
import { SUPPORTED_LANGUAGES, SupportedLanguage } from "@/i18n";

// Pages
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import { OAuthCallbackHandler } from "@/components/auth";
import { ChatList } from "@/pages/ChatList";
import { Chat } from "@/pages/Chat";
import { CreateChat } from "@/pages/CreateChat";
import { Models } from "@/pages/Models";
import { AISettings } from "@/pages/AISettings";
import { Connectivity } from "@/pages/Connectivity";
import { MCPServers } from "@/pages/MCPServers";
import { Profile } from "@/pages/Profile";
import { Password } from "@/pages/Password";
import { Users } from "@/pages/Users";
import { Library } from "@/pages/Library";
import { Documents } from "@/pages/Documents";
import { MainLayout } from "../components/MainLayout";
import { ERROR_FORBIDDEN, ERROR_UNAUTHORIZED } from "@/store/api";
import { loginSuccess, STORAGE_AUTH_TOKEN } from "@/store/slices/authSlice";
import { UserRole } from "@/store/slices/userSlice";
import { ChatDocuments } from "@/pages/ChatDocuments";

// PrivateRoute component for protected routes
const PrivateRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated);
  return isAuthenticated ? element : <Navigate to="/login" replace />;
};

// AdminRoute component for admin-only routes
const AdminRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
  const { isAuthenticated } = useAppSelector(state => state.auth);
  const { currentUser } = useAppSelector(state => state.user);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (currentUser?.role !== UserRole.ADMIN) {
    return <Navigate to="/chat" replace />;
  }

  return element;
};

const AppContent: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, token, loginTime } = useAppSelector(state => state.auth);
  const mantineTheme = React.useMemo(() => createAppTheme(), []);
  const { t, i18n } = useTranslation();

  // Get theme from context
  const { colorScheme } = useTheme();

  const {
    data: initData,
    isLoading,
    isError,
    error,
    refetch: refetchInitialData,
  } = useGetInitialDataQuery(undefined, {
    skip: !isAuthenticated,
    refetchOnMountOrArgChange: true,
    pollingInterval: 900_000, // Poll
  });

  useEffect(() => {
    // If authenticated and data is loaded, update Redux store
    if (isAuthenticated && initData) {
      dispatch(setUser(initData.appConfig.currentUser));
      dispatch(setAppConfig(initData.appConfig));
      dispatch(setModelsAndProviders(initData));

      const pinnedChatsIds = new Set(initData.pinnedChats.chats.map(chat => chat.id));
      dispatch(
        setChats({
          chats: [...initData.pinnedChats.chats, ...initData.chats.chats.filter(chat => !pinnedChatsIds.has(chat.id))],
          total: initData.chats.total,
          next: initData.chats.next,
        })
      );

      dispatch(loginSuccess(initData.appConfig.token));

      // Sync language from user settings
      const userLang = initData.appConfig.currentUser?.settings?.language;
      if (userLang && SUPPORTED_LANGUAGES.includes(userLang as SupportedLanguage)) {
        i18n.changeLanguage(userLang);
        localStorage.setItem(LANGUAGE_STORAGE_KEY, userLang);
      }
    }
  }, [isAuthenticated, initData, dispatch]);

  useEffect(() => {
    if (token) {
      document.cookie = `${STORAGE_AUTH_TOKEN}=${token}; path=/`;
    }
  }, [token]);

  useEffect(() => {
    // Handle errors from the initial data query
    if (isError && Date.now() - (loginTime || 0) > 1000) {
      const authFailed =
        ("status" in error && [403, 401, "PARSING_ERROR", "CUSTOM_ERROR"].includes(error.status)) ||
        ("error" in error && [ERROR_UNAUTHORIZED, ERROR_FORBIDDEN].some(err => String(error.error).includes(err)));

      if (authFailed) {
        dispatch(logout());
        navigate("/login");
      } else if ("error" in error) {
        // Show error notification
        notifications.show({
          title: t("errors.apiError"),
          message: error.error || t("errors.unknownError"),
          color: "red",
        });
      }
    }
  }, [isError, error, loginTime]);

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
      theme={mantineTheme as MantineThemeOverride}
      defaultColorScheme={colorScheme}
      forceColorScheme={colorScheme === "auto" ? undefined : colorScheme}
    >
      <ModalsProvider>
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
                <Route path="chat/:id/documents" element={<ChatDocuments />} />
                <Route path="chat/new" element={<CreateChat />} />
                {/* Settings section */}
                <Route path="models" element={<Models />} />
                <Route path="ai-settings" element={<AISettings onReloadAppData={refetchInitialData} />} />
                <Route path="connectivity" element={<Connectivity onReloadAppData={refetchInitialData} />} />
                <Route path="mcp-servers" element={<AdminRoute element={<MCPServers />} />} />
                {/* Admin section */}
                <Route path="profile" element={<Profile onReloadAppData={refetchInitialData} />} />
                <Route path="password" element={<Password />} />
                <Route path="users" element={<AdminRoute element={<Users />} />} />
                {/* Library section */}
                <Route path="library" element={<Library />} />
                <Route path="documents" element={<Documents />} />
              </Route>

              {/* Fallback route */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </ApolloWrapper>
      </ModalsProvider>
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
