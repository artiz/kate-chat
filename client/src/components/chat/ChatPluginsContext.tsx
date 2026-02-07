import React, { createContext, useContext, ReactNode } from "react";

interface ChatPluginsContextType {
  context: Record<string, any>;
}

const ChatPluginsContext = createContext<ChatPluginsContextType | undefined>(undefined);

interface ChatPluginsContextProviderProps {
  children: ReactNode;
  context: Record<string, any>;
}

export const ChatPluginsContextProvider: React.FC<ChatPluginsContextProviderProps> = ({ children, context }) => {
  return <ChatPluginsContext.Provider value={{ context }}>{children}</ChatPluginsContext.Provider>;
};

export const useChatPluginsContext = () => {
  const contextData = useContext(ChatPluginsContext);
  if (contextData === undefined) {
    throw new Error("useChatPluginsContext must be used within a ChatPluginsContextProvider");
  }
  return contextData.context;
};
