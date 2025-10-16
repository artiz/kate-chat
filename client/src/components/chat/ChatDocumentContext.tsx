import React, { createContext, useContext, ReactNode } from "react";
import { Document } from "@/types/graphql";

interface ChatDocumentContextType {
  documents: Document[];
}

const ChatDocumentContext = createContext<ChatDocumentContextType | undefined>(undefined);

interface ChatDocumentProviderProps {
  children: ReactNode;
  documents: Document[];
}

export const ChatDocumentProvider: React.FC<ChatDocumentProviderProps> = ({ children, documents }) => {
  return <ChatDocumentContext.Provider value={{ documents }}>{children}</ChatDocumentContext.Provider>;
};

export const useChatDocuments = () => {
  const context = useContext(ChatDocumentContext);
  if (context === undefined) {
    throw new Error("useChatDocuments must be used within a ChatDocumentProvider");
  }
  return context;
};
