import { useMutation, gql } from "@apollo/client";
import { Document } from "@/store/services/graphql";
import { APP_API_URL } from "@/lib/config";
import { useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";

export const useDocumentsUpload = () => {
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, File>>({});
  const [uploadError, setUploadError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploadedDocs, setUploadedDocs] = useState<Document[]>([]);

  const token = useSelector((state: RootState) => state.auth.token);

  const uploadDocuments = async (files: File[], chatId: string, onProgress: (progress: number) => void) => {
    const formData = new FormData();
    const filesToUpload = files.filter(
      file => !uploadingFiles[file.name] || uploadingFiles[file.name].size !== file.size
    );
    for (const file of filesToUpload) {
      if (uploadingFiles[file.name]?.size === file.size) {
        // Skip if the file is already being uploaded
        continue;
      }
      formData.append(file.name, file);
    }

    setUploadingFiles(prev => ({
      ...prev,
      ...Object.fromEntries(filesToUpload.map(file => [file.name, file])),
    }));
    setLoading(true);
    setUploadError(null);

    try {
      const response = await fetch(`${APP_API_URL}/files/upload?chatId=${encodeURIComponent(chatId)}`, {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: {
          authorization: token ? `Bearer ${token}` : "",
        },

        // TODO: use axios to get it working
        // onUploadProgress: (evt: any) => {
        //   const progress = Math.round(evt.loaded / evt.total);
        //   onProgress(progress);
        // },
      });

      if (!response.ok) {
        throw new Error("Failed to upload documents");
      }

      const documents = (await response.json()) as Document[];
      setUploadedDocs(prev => [...prev, ...documents]);
    } catch (error: unknown) {
      setUploadError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoading(false);
    }
  };

  return { uploadDocuments, uploadError, uploadLoading: loading, uploadedDocs };
};
