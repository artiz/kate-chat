import React, { Fragment, useState } from "react";
import { Document } from "@/types/graphql";
import { Alert, Badge, Text, Box, Group } from "@mantine/core";
import { IconAlertCircle, IconUpload } from "@tabler/icons-react";
import { getStatusColor } from "@/types/ai";

interface DocumentUploadProgressProps {
  error?: Error | null;
  progress?: number;
  loading?: boolean;
  documents: Document[];
}

export const DocumentUploadProgress: React.FC<DocumentUploadProgressProps> = ({
  error,
  documents,
  progress = 0,
  loading,
}) => {
  if (error) {
    return (
      <Alert icon={<IconAlertCircle size="1rem" />} title="Upload error" color="red" variant="light">
        {error.message}
      </Alert>
    );
  }

  if (!documents?.length) {
    return null;
  }

  return (
    <Alert icon={<IconUpload size="1rem" />} title="Documents upload" variant="light" mb="sm" pb="md" h="fit-content">
      {loading && <p>Uploading... {(progress * 100).toFixed(2)}%</p>}
      {documents.map(doc => (
        <Box key={doc.id}>
          {doc.fileName}
          <Badge color={getStatusColor(doc.status)} variant="light">
            {doc.status}: {doc.statusProgress ? `${(doc.statusProgress * 100).toFixed(2)}%` : "--"}
          </Badge>
        </Box>
      ))}
    </Alert>
  );
};
