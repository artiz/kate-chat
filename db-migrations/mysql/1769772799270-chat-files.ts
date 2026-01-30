import { MigrationInterface, QueryRunner } from "typeorm";
import { migrateChatFiles } from "../common/migrate-chat-files";

export class ChatFiles1769772799270 implements MigrationInterface {
  name = "ChatFiles1769772799270";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`chat_files\` (\`id\` varchar(36) NOT NULL, \`chatId\` varchar(255) NOT NULL, \`messageId\` varchar(255) NULL, \`type\` enum ('image', 'video', 'rag_document', 'inline_document') NOT NULL DEFAULT 'image', \`fileName\` varchar(255) NULL, \`mime\` varchar(255) NULL, \`uploadFile\` varchar(255) NULL,  \`predominantColor\` varchar(255) NULL, \`exif\` json NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_files\` ADD CONSTRAINT \`FK_01fa2aca8a161c864dd05d9d387\` FOREIGN KEY (\`chatId\`) REFERENCES \`chats\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_files\` ADD CONSTRAINT \`FK_ea9c9ae1f173ad90c9a4d15d2a7\` FOREIGN KEY (\`messageId\`) REFERENCES \`messages\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Migrate data
    await migrateChatFiles(queryRunner);
    // Drop initial column
    await queryRunner.query(`ALTER TABLE \`chats\` DROP COLUMN \`files\``);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`chat_files\` DROP FOREIGN KEY \`FK_ea9c9ae1f173ad90c9a4d15d2a7\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_files\` DROP FOREIGN KEY \`FK_01fa2aca8a161c864dd05d9d387\``,
    );
    await queryRunner.query(`ALTER TABLE \`chats\` ADD \`files\` json NULL`);
    await queryRunner.query(`DROP TABLE \`chat_files\``);
  }
}
