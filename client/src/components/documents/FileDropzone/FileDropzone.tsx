import React, { useState, useCallback, useRef, useEffect } from "react";
import { Group, Tooltip, Box } from "@mantine/core";
import { IconFileUpload } from "@tabler/icons-react";
import classes from "./FileDropzone.module.scss";
import { notEmpty } from "@/lib/assert";
import { SUPPORTED_UPLOAD_FORMATS } from "@/lib/config";

interface IProps {
  disabled?: boolean;
  active?: boolean;
  onFilesAdd: (images: File[]) => void;
}

export const FileDropzone: React.FC<IProps> = ({ onFilesAdd, disabled, active }) => {
  const [isDragging, setIsDragging] = useState(false);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle paste events for clipboard images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (disabled) return;
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
  }, [onFilesAdd, disabled]);

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
      if (disabled) return;

      const files =
        e.dataTransfer.files && e.dataTransfer.files.length > 0
          ? Array.from(e.dataTransfer.files).filter(f => f.size > 0)
          : [];

      onFilesAdd(files);
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
    if (disabled) return;
    fileInputRef.current?.click();
  };

  return (
    <>
      <Box
        ref={dropzoneRef}
        className={`drop-zone ${classes.dropzone} ${isDragging ? classes.dragging : ""} ${active ? classes.activated : ""} ${disabled ? classes.disabled : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        <Group justify="center" gap="md">
          <Tooltip label="Click or drop an image/document here" position="top">
            <IconFileUpload size={32} stroke={1.5} />
          </Tooltip>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={SUPPORTED_UPLOAD_FORMATS.join(",")}
            onChange={handleFileSelect}
            className={classes.fileInput}
            style={{ display: "none" }}
            disabled={disabled}
          />
        </Group>
      </Box>
    </>
  );
};
