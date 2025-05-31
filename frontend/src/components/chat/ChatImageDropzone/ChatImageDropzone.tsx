import React, { useState, useCallback, useRef, useEffect } from "react";
import { Group, Text, Paper, ActionIcon, Tooltip, Box } from "@mantine/core";
import { IconX, IconFileUpload } from "@tabler/icons-react";
import classes from "./ChatImageDropzone.module.scss";
import { notEmpty } from "@/utils/assert";

interface ChatImageDropzoneProps {
  onFilesAdd: (images: File[]) => void;
}

export const ChatImageDropzone: React.FC<ChatImageDropzoneProps> = ({ onFilesAdd }) => {
  const [isDragging, setIsDragging] = useState(false);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle paste events for clipboard images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData && e.clipboardData.items) {
        const files = Array.from(e.clipboardData.items)
          .map(f => f.getAsFile())
          .filter(notEmpty);

        if (files.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          onFilesAdd(files);
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [onFilesAdd]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files).filter(f => f.size > 0);
        if (files.length) {
          onFilesAdd(files);
        }
      }
    },
    [onFilesAdd]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const files = Array.from(e.target.files).filter(f => f.size > 0);
        if (files.length) {
          onFilesAdd(files);
        }
        if (fileInputRef.current) {
          fileInputRef.current.value = ""; // Reset file input value
        }
      }
    },
    [onFilesAdd]
  );

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <Box
        ref={dropzoneRef}
        className={`${classes.dropzone} ${isDragging ? classes.dragging : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        <Group justify="center" gap="md">
          <Tooltip label="Click or drop an image here" position="top">
            <IconFileUpload size={32} stroke={1.5} />
          </Tooltip>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileSelect}
            className={classes.fileInput}
            style={{ display: "none" }}
          />

          {/* Docs support: text/csv,application/json,*.doc,*.docx,*.pdf,*.txt    */}
        </Group>
      </Box>
    </>
  );
};
