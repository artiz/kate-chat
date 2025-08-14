import React, { createContext, useContext, useEffect } from "react";
import { useLocalStorage } from "@mantine/hooks";

export const useDocumentsUpload = () => {
  const uploadDocuments = async (files: File[]) => {
    const formData = new FormData();
    for (const file of files) {
      formData.append("documents", file);
    }

    const response = await fetch("/api/documents/upload", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      throw new Error("Failed to upload documents");
    }
    return await response.json();
  };

  return { uploadDocuments };
};
