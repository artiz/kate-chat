import { useSubscription } from "@apollo/client";
import { DOCUMENT_STATUS_SUBSCRIPTION } from "@/store/services/graphql.queries";
import { Document } from "@/types/graphql";
import { APP_API_URL } from "@/lib/config";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { DocumentStatusMessage } from "@/types/graphql";
import { DocumentStatus } from "@/types/ai";

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

      setUploadingDocs(prev =>
        prev
          .map(doc => (docsMap[doc.id] ? { ...doc, ...docsMap[doc.id] } : doc))
          .filter(doc => doc.status !== DocumentStatus.READY)
      );
    }
  }, [subscriptionData]);

  const stopUpload = (documentId: string) => {
    const doc = uploadingDocs.find(d => d.id === documentId);
    if (doc) {
      setUploadingDocs(prev => prev.filter(d => d.id !== documentId));
      setUploadingFiles(prev => {
        const newFiles = { ...prev };
        for (const [name, file] of Object.entries(prev)) {
          if (file.name === doc.fileName) {
            delete newFiles[name];
          }
        }
        return newFiles;
      });
    }
  };

  const uploadDocuments = async (files: File[], chatId?: string, onProgress?: (progress: number) => void) => {
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
      onProgress?.(0);

      // good old XMLHttpRequest to track upload progress
      const xhr = new XMLHttpRequest();
      xhr.responseType = "json";

      const response = await new Promise(function (resolve, reject) {
        xhr.onreadystatechange = () => {
          if (xhr.readyState != XMLHttpRequest.DONE) {
            return;
          }
          const status = xhr.status;
          if (status >= 300) {
            return reject(new TypeError("Network request failed"));
          }

          const result = typeof xhr.response === "string" ? JSON.parse(xhr.response) : xhr.response;
          resolve(result);
        };

        xhr.addEventListener("error", xhr => {
          reject(new Error("Failed to fetch"));
        });

        xhr.addEventListener("progress", evt => {
          if (evt.lengthComputable) {
            const progress = Math.round((100 * evt.loaded) / evt.total) / 100;
            onProgress?.(progress);
          }
        });

        xhr.open("POST", `${APP_API_URL}/files/upload?chatId=${chatId ? encodeURIComponent(chatId) : ""}`, true);
        xhr.withCredentials = true;
        if (token) {
          xhr.setRequestHeader("authorization", `Bearer ${token}`);
        }

        xhr.send(formData);
      });
      const documents = response as Document[];
      setUploadingDocs(prev => [...prev, ...documents.filter(doc => doc.status !== DocumentStatus.READY)]);
    } catch (error: unknown) {
      setUploadError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      onProgress?.(1);
      setLoading(false);
    }
  };

  return { uploadDocuments, uploadError, uploadLoading: loading, uploadingDocs, stopUpload };
};
