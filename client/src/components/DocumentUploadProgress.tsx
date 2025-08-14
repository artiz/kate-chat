import React, { useState } from "react";
import { Document } from "@/store/services/graphql";

interface DocumentUploadProgressProps {
  progress?: number;
  loading?: boolean;
  documents: Document[];
}

export const DocumentUploadProgress: React.FC<DocumentUploadProgressProps> = ({ documents, progress = 0, loading }) => {
  return (
    <div>
      {loading && <p>Uploading... {(progress * 100).toFixed(2)}%</p>}
      {documents.map(doc => (
        <div key={doc.id}>
          <p>{doc.fileName}</p>
          <p>
            {doc.status}
            <progress value={doc.statusProgress ?? 0 * 100} max={100} />
          </p>
        </div>
      ))}
    </div>
  );
};
