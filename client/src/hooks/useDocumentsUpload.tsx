import React, { createContext, useContext, useEffect, useState } from "react";
import { useLocalStorage } from "@mantine/hooks";
import { useMutation, gql } from "@apollo/client";
import { Document } from "@/store/services/graphql";

const UPLOAD_DOCUMENT = gql`
  mutation UploadDocument($input: DocumentUploadInput!) {
    uploadDocuments(input: $input) {
      documents {
        id
        fileName
        fileSize
        mime
        status
        statusProgress
      }
    }
  }
`;

export const useDocumentsUpload = () => {
  const [upload, { data, loading, error }] = useMutation<{ documents?: Document[] }>(UPLOAD_DOCUMENT);
  const uploadDocuments = async (files: File[], chatId: string, onProgress: (progress: number) => void) => {
    upload({
      variables: { input: { uploads: files, chatId } },
      context: {
        fetchOptions: {
          onUploadProgress: (evt: any) => {
            const progress = Math.round(evt.loaded / evt.total);
            onProgress(progress);
          },
        },
      },
    });
  };

  return { uploadDocuments, uploadError: error, uploadLoading: loading, uploadData: data };
};
