import { Chat } from "./Chat";
import { ChatDocument } from "./ChatDocument";
import { ChatFile } from "./ChatFile";
import { ChatFolder } from "./ChatFolder";
import { Document } from "./Document";
import { DocumentChunk } from "./DocumentChunk";
import { Message } from "./Message";
import { Model, CustomModelSettings, CustomModelProtocol } from "./Model";
import { MCPServer, MCPAuthConfig, MCPToolInfo } from "./MCPServer";
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
  ChatFolder,
  Message,
  Document,
  ChatDocument,
  DocumentChunk,
  ChatFile,
  MCPServer,
  MCPAuthConfig,
  MCPToolInfo,
};

export const ENTITIES = [
  User,
  Model,
  Chat,
  ChatFolder,
  Message,
  Document,
  ChatDocument,
  DocumentChunk,
  ChatFile,
  MCPServer,
];
