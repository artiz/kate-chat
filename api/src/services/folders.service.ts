import { Repository } from "typeorm";
import { Chat, ChatFolder } from "@/entities";
import { getRepository } from "@/config/database";
import { CreateFolderInput, GetFolderContentsInput, UpdateFolderInput } from "@/types/graphql/inputs";
import { GqlFolderContents, GqlFoldersList } from "@/types/graphql/responses";
import { TokenPayload } from "@/utils/jwt";
import { Message } from "@/entities";
import { MessageRole } from "@/types/api";

export class FoldersService {
  private folderRepository: Repository<ChatFolder>;
  private chatRepository: Repository<Chat>;

  constructor() {
    this.folderRepository = getRepository(ChatFolder);
    this.chatRepository = getRepository(Chat);
  }

  public async getFolders(user: TokenPayload): Promise<GqlFoldersList> {
    const folders = await this.folderRepository.find({
      where: { userId: user.userId, parentId: undefined },
      order: { createdAt: "ASC" },
    });
    return { folders };
  }

  public async getAllFolders(user: TokenPayload): Promise<GqlFoldersList> {
    const folders = await this.folderRepository.find({
      where: { userId: user.userId },
      order: { createdAt: "ASC" },
    });
    return { folders };
  }

  public async getFolderContents(input: GetFolderContentsInput, user: TokenPayload): Promise<GqlFolderContents> {
    const { folderId, from = 0, limit = 25 } = input;

    // Verify ownership
    const folder = await this.folderRepository.findOne({ where: { id: folderId, userId: user.userId } });
    if (!folder) throw new Error("Folder not found");

    // Determine whether this is a top-level folder (topParentId is null)
    // Get all subfolders in this subtree: either topParentId = folderId (if top-level) or parentId = folderId
    let subfolders: ChatFolder[];
    if (!folder.topParentId) {
      // This is a top-level folder: get all folders in the subtree
      subfolders = await this.folderRepository
        .createQueryBuilder("f")
        .where("f.userId = :userId", { userId: user.userId })
        .andWhere("(f.topParentId = :folderId OR f.parentId = :folderId)", { folderId })
        .orderBy("f.createdAt", "ASC")
        .getMany();
    } else {
      // This is a nested folder: get immediate children only
      subfolders = await this.folderRepository.find({
        where: { userId: user.userId, parentId: folderId },
        order: { createdAt: "ASC" },
      });
    }

    // Get chats in this specific folder (paginated)
    const total = await this.chatRepository.count({
      where: { userId: user.userId, folderId },
    });

    const chats = await this.chatRepository
      .createQueryBuilder("chat")
      .where({ userId: user.userId, folderId })
      .addSelect(sq => {
        return sq.select("COUNT(*)").from(Message, "m").where("m.chatId = chat.id");
      }, "chat_messagesCount")
      .addSelect(sq => {
        return sq
          .select("m.content")
          .from(Message, "m")
          .where("m.chatId = chat.id and m.role = :role and m.linkedToMessageId IS NULL", {
            role: MessageRole.ASSISTANT,
          })
          .orderBy("m.createdAt", "DESC")
          .limit(1);
      }, "chat_lastBotMessage")
      .addSelect(sq => {
        return sq
          .select("m.id")
          .from(Message, "m")
          .where("m.chatId = chat.id and m.role = :role and m.linkedToMessageId IS NULL", {
            role: MessageRole.ASSISTANT,
          })
          .orderBy("m.createdAt", "DESC")
          .limit(1);
      }, "chat_lastBotMessageId")
      .skip(from)
      .take(limit)
      .orderBy("chat.updatedAt", "DESC")
      .getMany();

    return {
      subfolders,
      chats,
      total,
      next: from + chats.length < total ? from + chats.length : undefined,
    };
  }

  public async createFolder(input: CreateFolderInput, user: TokenPayload): Promise<ChatFolder> {
    let topParentId: string | undefined;

    if (input.parentId) {
      const parent = await this.folderRepository.findOne({
        where: { id: input.parentId, userId: user.userId },
      });
      if (!parent) throw new Error("Parent folder not found");
      // topParentId is the root of the tree
      topParentId = parent.topParentId ?? parent.id;
    }

    const folder = this.folderRepository.create({
      name: input.name,
      color: input.color,
      userId: user.userId,
      parentId: input.parentId,
      topParentId,
    });

    return await this.folderRepository.save(folder);
  }

  public async updateFolder(id: string, input: UpdateFolderInput, user: TokenPayload): Promise<ChatFolder> {
    const folder = await this.folderRepository.findOne({ where: { id, userId: user.userId } });
    if (!folder) throw new Error("Folder not found");

    Object.assign(folder, input);
    return await this.folderRepository.save(folder);
  }

  public async deleteFolder(id: string, user: TokenPayload): Promise<boolean> {
    const folder = await this.folderRepository.findOne({ where: { id, userId: user.userId } });
    if (!folder) throw new Error("Folder not found");

    // Find all folders in this subtree (including the folder itself)
    let folderIds: string[] = [id];
    if (!folder.topParentId) {
      // Top-level folder: find all subfolders using topParentId
      const subfolders = await this.folderRepository.find({
        where: { topParentId: id, userId: user.userId },
      });
      folderIds = [id, ...subfolders.map(f => f.id)];
    } else {
      // Nested folder: find immediate children recursively
      const children = await this.getSubfolderIds(id, user.userId);
      folderIds = [id, ...children];
    }

    // Detach all chats from these folders (set folderId = null, keep isPinned)
    if (folderIds.length > 0) {
      await this.chatRepository
        .createQueryBuilder()
        .update(Chat)
        .set({ folderId: undefined })
        .where("folderId IN (:...folderIds)", { folderIds })
        .andWhere("userId = :userId", { userId: user.userId })
        .execute();
    }

    // Delete all subfolders (children first to avoid FK issues), then the folder
    // Since we have CASCADE ON DELETE on parentId, deleting the top folder will cascade
    await this.folderRepository.delete({ id });
    return true;
  }

  private async getSubfolderIds(folderId: string, userId: string): Promise<string[]> {
    const children = await this.folderRepository.find({
      where: { parentId: folderId, userId },
    });
    const ids: string[] = [];
    for (const child of children) {
      ids.push(child.id);
      const grandchildren = await this.getSubfolderIds(child.id, userId);
      ids.push(...grandchildren);
    }
    return ids;
  }
}
