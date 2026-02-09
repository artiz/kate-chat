import { Chat } from "./Chat";
import { ChatDocument } from "./ChatDocument";
import { ChatFile } from "./ChatFile";
import { Document } from "./Document";
import { DocumentChunk } from "./DocumentChunk";
import { Message } from "./Message";
import { Model, CustomModelSettings, CustomModelProtocol } from "./Model";
import { MCPServer, MCPAuthType, MCPAuthConfig, MCPToolInfo, MCPTransportType } from "./MCPServer";
import { AuthProvider, User, UserSettings, UserRole } from "./User";

export {
  AuthProvider,
  User,
  UserSettings,
  UserRole,
  Model,
  CustomModelSettings,
  CustomModelProtocol,
  Chat,
  Message,
  Document,
  ChatDocument,
  DocumentChunk,
  ChatFile,
  MCPServer,
  MCPTransportType,
  MCPAuthType,
  MCPAuthConfig,
  MCPToolInfo,
};

export const ENTITIES = [User, Model, Chat, Message, Document, ChatDocument, DocumentChunk, ChatFile, MCPServer];
