export enum ChatFileType {
  IMAGE = "image",
  VIDEO = "video",
  RAG_DOCUMENT = "rag_document",
  INLINE_DOCUMENT = "inline_document",
}

export interface ChatFile {
  id: string;
  chatId: string;
  messageId?: string;
  type: ChatFileType;
  fileName?: string;
  predominantColor?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}
