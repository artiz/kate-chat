import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatFolders1771698945715 implements MigrationInterface {
  name = "ChatFolders1771698945715";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "chat_folders" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_14443ca041335fec84cb7a43333" DEFAULT NEWSEQUENTIALID(), "name" nvarchar(255) NOT NULL, "color" nvarchar(255), "userId" uniqueidentifier, "parentId" uniqueidentifier, "topParentId" uniqueidentifier, "createdAt" datetime2 NOT NULL CONSTRAINT "DF_c063d1ed953205c4030979c9f92" DEFAULT getdate(), "updatedAt" datetime2 NOT NULL CONSTRAINT "DF_e55b0d313ee8102d4b59b815f03" DEFAULT getdate(), CONSTRAINT "PK_14443ca041335fec84cb7a43333" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" ADD "folderId" uniqueidentifier`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_folders" ADD CONSTRAINT "FK_2e74a71e829fccfe8815b0da096" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_folders" ADD CONSTRAINT "FK_d78d2413c650c47cd66b96f31ab" FOREIGN KEY ("parentId") REFERENCES "chat_folders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_folders" ADD CONSTRAINT "FK_8a35f825adc044c040a6bcfe66a" FOREIGN KEY ("topParentId") REFERENCES "chat_folders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
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
