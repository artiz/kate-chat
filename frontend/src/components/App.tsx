import React, { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { MantineProvider, ColorSchemeScript, Center, Loader } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { useDispatch } from "react-redux";
import { ApolloWrapper } from "../lib/apollo-provider";
import { theme } from "../theme";
import { useGetInitialDataQuery } from "../store/services/graphql";
import { setUser } from "../store/slices/userSlice";
import { setModels } from "../store/slices/modelSlice";
import { setChats } from "../store/slices/chatSlice";
import { useAppSelector } from "../store";

// Pages
import Login from "../pages/Login";
import ChatList from "../pages/ChatList";
import Chat from "../pages/Chat";
import NewChat from "../pages/NewChat";
import Models from "../pages/Models";
import Settings from "../pages/Settings";
import MainLayout from "../components/MainLayout";

// PrivateRoute component for protected routes
const PrivateRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  return isAuthenticated ? element : <Navigate to="/login" replace />;  
};

const App: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  
  // Use RTK Query hook to fetch initial data
  const { data, isLoading, isError } = useGetInitialDataQuery(undefined, {
    skip: !isAuthenticated,
  });

  useEffect(() => {
    // If authenticated and data is loaded, update Redux store
    if (isAuthenticated && data) {
      dispatch(setUser(data.user));
      dispatch(setModels(data.models));
      dispatch(setChats(data.chats));
    }
  }, [isAuthenticated, data, dispatch]);

  // If not authenticated, navigate to login
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  return (
    <MantineProvider theme={theme}>
      <ColorSchemeScript />
      <Notifications position="top-right" />
      <ApolloWrapper>
        {isAuthenticated && isLoading ? (
          <Center h="100vh">
            <Loader size="xl" />
          </Center>
        ) : (
          <Routes>
            <Route path="/login" element={<Login />} />
            
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

export default App;
