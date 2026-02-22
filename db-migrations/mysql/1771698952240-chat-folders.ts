import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatFolders1771698952240 implements MigrationInterface {
  name = "ChatFolders1771698952240";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`chat_folders\` (\`id\` varchar(36) NOT NULL, \`name\` varchar(255) NOT NULL, \`color\` varchar(255) NULL, \`userId\` varchar(255) NULL, \`parentId\` varchar(255) NULL, \`topParentId\` varchar(255) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chats\` ADD \`folderId\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_folders\` ADD CONSTRAINT \`FK_2e74a71e829fccfe8815b0da096\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_folders\` ADD CONSTRAINT \`FK_d78d2413c650c47cd66b96f31ab\` FOREIGN KEY (\`parentId\`) REFERENCES \`chat_folders\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_folders\` ADD CONSTRAINT \`FK_8a35f825adc044c040a6bcfe66a\` FOREIGN KEY (\`topParentId\`) REFERENCES \`chat_folders\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chats\` ADD CONSTRAINT \`FK_55a7e34e790cd3b0cb7df871855\` FOREIGN KEY (\`folderId\`) REFERENCES \`chat_folders\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`chats\` DROP FOREIGN KEY \`FK_55a7e34e790cd3b0cb7df871855\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_folders\` DROP FOREIGN KEY \`FK_8a35f825adc044c040a6bcfe66a\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_folders\` DROP FOREIGN KEY \`FK_d78d2413c650c47cd66b96f31ab\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_folders\` DROP FOREIGN KEY \`FK_2e74a71e829fccfe8815b0da096\``,
    );
    await queryRunner.query(`ALTER TABLE \`chats\` DROP COLUMN \`folderId\``);
    await queryRunner.query(`DROP TABLE \`chat_folders\``);
  }
}
