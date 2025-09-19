import { useSubscription } from "@apollo/client";
import { DOCUMENT_STATUS_SUBSCRIPTION } from "@/store/services/graphql";
import { Document } from "@/types/graphql";
import { APP_API_URL } from "@/lib/config";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { DocumentStatusMessage } from "@/types/graphql";

export const useDocumentsUpload = () => {
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, File>>({});
  const [uploadError, setUploadError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploadingDocs, setUploadingDocs] = useState<Document[]>([]);

  const token = useSelector((state: RootState) => state.auth.token);

  const { data: subscriptionData } = useSubscription<{ documentsStatus: DocumentStatusMessage[] }>(
    DOCUMENT_STATUS_SUBSCRIPTION,
    {
      variables: { documentIds: uploadingDocs.map(doc => doc.id) },
      skip: uploadingDocs.length === 0,
    }
  );

  useEffect(() => {
    if (subscriptionData) {
      const docsMap = subscriptionData.documentsStatus.reduce(
        (map, status) => {
          map[status.documentId] = status;
          return map;
        },
        {} as Record<string, DocumentStatusMessage>
      );

      setUploadingDocs(prev => prev.map(doc => (docsMap[doc.id] ? { ...doc, ...docsMap[doc.id] } : doc)));
    }
  }, [subscriptionData]);

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
      onProgress(0);
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
      setUploadingDocs(prev => [...prev, ...documents]);
    } catch (error: unknown) {
      setUploadError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      onProgress(1);
      setLoading(false);
    }
  };

  return { uploadDocuments, uploadError, uploadLoading: loading, uploadingDocs };
};
