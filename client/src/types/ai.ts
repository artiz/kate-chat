export type ApiProvider = "aws_bedrock" | "open_ai" | "yandex_fm";

export enum MessageType {
  MESSAGE = "message",
  SYSTEM = "system",
}

export enum MessageRole {
  USER = "user",
  ASSISTANT = "assistant",
  ERROR = "error",
}

export enum DocumentStatus {
  UPLOAD = "upload",
  STORAGE_UPLOAD = "storage_upload",
  PARSING = "parsing",
  CHUNKING = "chunking",
  EMBEDDING = "embedding",
  SUMMARIZING = "summarizing",
  READY = "ready",
  ERROR = "error",
  DELETING = "deleting",
}

export const getStatusColor = (status?: DocumentStatus): string => {
  switch (status) {
    case DocumentStatus.READY:
      return "green";
    case DocumentStatus.UPLOAD:
    case DocumentStatus.STORAGE_UPLOAD:
      return "blue";
    case DocumentStatus.PARSING:
    case DocumentStatus.CHUNKING:
      return "yellow";
    case DocumentStatus.EMBEDDING:
    case DocumentStatus.SUMMARIZING:
      return "pink";

    case DocumentStatus.ERROR:
    case DocumentStatus.DELETING:
      return "red";

    default:
      return "gray";
  }
};
