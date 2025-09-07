import { MigrationInterface, QueryRunner } from "typeorm";

export class Init_1754294400000 implements MigrationInterface {
  name = "Init_1754294400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "models" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_ef9ed7160ea69013636466bf2d5" DEFAULT NEWSEQUENTIALID(), "name" nvarchar(255) NOT NULL, "modelId" nvarchar(255) NOT NULL, "description" nvarchar(255) NOT NULL, "userId" uniqueidentifier, "provider" nvarchar(255), "apiProvider" nvarchar(255) NOT NULL CONSTRAINT "DF_c99e4e61d0487cdb0c358dd225d" DEFAULT 'aws_bedrock', "supportsStreaming" bit NOT NULL CONSTRAINT "DF_7a72a8448920cff446e5a375459" DEFAULT 0, "supportsTextIn" bit NOT NULL CONSTRAINT "DF_d3d6facc2a5d04b3b9529fc338c" DEFAULT 1, "supportsTextOut" bit NOT NULL CONSTRAINT "DF_3b116cd9b215008563fcc47e8c0" DEFAULT 1, "supportsEmbeddingsIn" bit NOT NULL CONSTRAINT "DF_056fd112d98f67c8b5b097926cf" DEFAULT 0, "supportsImageIn" bit NOT NULL CONSTRAINT "DF_5d1866196b3ba768680f5367e08" DEFAULT 0, "supportsImageOut" bit NOT NULL CONSTRAINT "DF_6443725656366617d0fb104d424" DEFAULT 0, "supportsEmbeddingsOut" bit NOT NULL CONSTRAINT "DF_78560f72d2d6c2837dfc88bc06c" DEFAULT 0, "isActive" bit NOT NULL CONSTRAINT "DF_ace25b76a627fe6e47931c7e59e" DEFAULT 1, "isCustom" bit NOT NULL CONSTRAINT "DF_91763822accb42a2467f5bab430" DEFAULT 0, "createdAt" datetime2 NOT NULL CONSTRAINT "DF_335cf3e58e076bb922954ffdf4f" DEFAULT getdate(), "updatedAt" datetime2 NOT NULL CONSTRAINT "DF_feab02c5bafcc0bd45bc394ed8c" DEFAULT getdate(), CONSTRAINT "PK_ef9ed7160ea69013636466bf2d5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_a3ffb1c0c8416b9fc6f907b7433" DEFAULT NEWSEQUENTIALID(), "email" nvarchar(255) NOT NULL, "password" nvarchar(255), "firstName" nvarchar(255) NOT NULL, "lastName" nvarchar(255) NOT NULL, "role" varchar(255) NOT NULL CONSTRAINT "DF_ace513fa30d485cfd25c11a9e4a" DEFAULT 'user', "defaultModelId" nvarchar(255), "defaultSystemPrompt" nvarchar(255), "avatarUrl" nvarchar(255), "googleId" nvarchar(255), "githubId" nvarchar(255), "authProvider" varchar(255), "createdAt" datetime2 NOT NULL CONSTRAINT "DF_204e9b624861ff4a5b268192101" DEFAULT getdate(), "updatedAt" datetime2 NOT NULL CONSTRAINT "DF_0f5cbe00928ba4489cc7312573b" DEFAULT getdate(), "modelsCount" int, "settings" ntext, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "messages" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_18325f38ae6de43878487eff986" DEFAULT NEWSEQUENTIALID(), "role" varchar(255) CONSTRAINT CHK_d52bc0cbb9ca78f6afd39c39c1_ENUM CHECK(role IN ('user','assistant','error','system')) NOT NULL CONSTRAINT "DF_684a8b8fcd65f84e6a4870bde5a" DEFAULT 'user', "content" text NOT NULL, "jsonContent" ntext, "metadata" ntext, "modelId" nvarchar(255) NOT NULL, "modelName" nvarchar(255), "chatId" uniqueidentifier, "userId" uniqueidentifier, "linkedToMessageId" uniqueidentifier, "createdAt" datetime2 NOT NULL CONSTRAINT "DF_6ce6acdb0801254590f8a78c083" DEFAULT getdate(), "updatedAt" datetime2 NOT NULL CONSTRAINT "DF_284257a7a4f1c23a4bda08ecf2d" DEFAULT getdate(), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "chats" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_0117647b3c4a4e5ff198aeb6206" DEFAULT NEWSEQUENTIALID(), "title" nvarchar(255) NOT NULL, "description" nvarchar(255) NOT NULL CONSTRAINT "DF_460ad39b7ce9368acc2f898a4b3" DEFAULT '', "files" ntext, "lastBotMessage" nvarchar(255), "lastBotMessageId" nvarchar(255), "messagesCount" int, "modelId" nvarchar(255), "temperature" float, "maxTokens" int, "topP" float, "imagesCount" int, "isPristine" bit NOT NULL CONSTRAINT "DF_a7669e1f29574bd2259990c42c9" DEFAULT 0, "createdAt" datetime2 NOT NULL CONSTRAINT "DF_2eb84efc93976230c81bce1b590" DEFAULT getdate(), "updatedAt" datetime2 NOT NULL CONSTRAINT "DF_042536c762a2086bdf688726aa0" DEFAULT getdate(), "userId" uniqueidentifier, CONSTRAINT "PK_0117647b3c4a4e5ff198aeb6206" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD CONSTRAINT "FK_bd0eee09c3dde57cc3b9ac1512a" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "FK_36bc604c820bb9adc4c75cd4115" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "FK_4838cd4fc48a6ff2d4aa01aa646" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "FK_1ba536732f253c712a73a53ea71" FOREIGN KEY ("linkedToMessageId") REFERENCES "messages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" ADD CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chats" DROP CONSTRAINT "FK_ae8951c0a763a060593606b7e2d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" DROP CONSTRAINT "FK_1ba536732f253c712a73a53ea71"`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" DROP CONSTRAINT "FK_4838cd4fc48a6ff2d4aa01aa646"`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" DROP CONSTRAINT "FK_36bc604c820bb9adc4c75cd4115"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP CONSTRAINT "FK_bd0eee09c3dde57cc3b9ac1512a"`,
    );
    await queryRunner.query(`DROP TABLE "chats"`);
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "models"`);
  }
}
