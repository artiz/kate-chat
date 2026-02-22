import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatFolders1771698939844 implements MigrationInterface {
  name = "ChatFolders1771698939844";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "chat_folders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "color" character varying, "userId" uuid, "parentId" uuid, "topParentId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_14443ca041335fec84cb7a43333" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`ALTER TABLE "chats" ADD "folderId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "chat_folders" ADD CONSTRAINT "FK_2e74a71e829fccfe8815b0da096" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_folders" ADD CONSTRAINT "FK_d78d2413c650c47cd66b96f31ab" FOREIGN KEY ("parentId") REFERENCES "chat_folders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_folders" ADD CONSTRAINT "FK_8a35f825adc044c040a6bcfe66a" FOREIGN KEY ("topParentId") REFERENCES "chat_folders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" ADD CONSTRAINT "FK_55a7e34e790cd3b0cb7df871855" FOREIGN KEY ("folderId") REFERENCES "chat_folders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chats" DROP CONSTRAINT "FK_55a7e34e790cd3b0cb7df871855"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_folders" DROP CONSTRAINT "FK_8a35f825adc044c040a6bcfe66a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_folders" DROP CONSTRAINT "FK_d78d2413c650c47cd66b96f31ab"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_folders" DROP CONSTRAINT "FK_2e74a71e829fccfe8815b0da096"`,
    );
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "folderId"`);
    await queryRunner.query(`DROP TABLE "chat_folders"`);
  }
}
