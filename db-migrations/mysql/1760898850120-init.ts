import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1760898850120 implements MigrationInterface {
  name = "Init1760898850120";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`models\` (\`id\` varchar(36) NOT NULL, \`name\` varchar(255) NOT NULL, \`modelId\` varchar(255) NOT NULL, \`description\` varchar(255) NULL, \`userId\` varchar(255) NULL, \`provider\` varchar(255) NULL, \`apiProvider\` varchar(255) NOT NULL DEFAULT 'AWS_BEDROCK', \`type\` varchar(255) NOT NULL DEFAULT 'chat', \`streaming\` tinyint NOT NULL DEFAULT 0, \`imageInput\` tinyint NOT NULL DEFAULT 0, \`isActive\` tinyint NOT NULL DEFAULT 1, \`isCustom\` tinyint NOT NULL DEFAULT 0, \`maxInputTokens\` int NULL, \`tools\` json NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`chat_documents\` (\`id\` varchar(36) NOT NULL, \`chatId\` varchar(255) NOT NULL, \`documentId\` varchar(255) NOT NULL, INDEX \`IDX_0bf6b1e9f455bba598d4c73076\` (\`chatId\`), INDEX \`IDX_fee8b0b8a78f1daa22e05ea268\` (\`documentId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`documents\` (\`id\` varchar(36) NOT NULL, \`fileName\` varchar(4000) NOT NULL, \`mime\` varchar(255) NULL, \`fileSize\` bigint NOT NULL DEFAULT '0', \`sha256checksum\` varchar(255) NOT NULL, \`s3key\` varchar(4000) NULL, \`ownerId\` varchar(255) NOT NULL, \`embeddingsModelId\` varchar(255) NULL, \`summaryModelId\` varchar(255) NULL, \`summary\` text NULL, \`pagesCount\` int NOT NULL DEFAULT '0', \`status\` varchar(255) NOT NULL DEFAULT 'upload', \`statusInfo\` text NULL, \`statusProgress\` float NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), FULLTEXT INDEX \`IDX_95e8f97e178311e7eb65e63289\` (\`fileName\`), INDEX \`IDX_edef2e837ed65c05e116250a21\` (\`sha256checksum\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`users\` (\`id\` varchar(36) NOT NULL, \`email\` varchar(255) NOT NULL, \`password\` varchar(255) NULL, \`firstName\` varchar(255) NOT NULL, \`lastName\` varchar(255) NOT NULL, \`role\` varchar(255) NOT NULL DEFAULT 'user', \`defaultModelId\` varchar(255) NULL, \`documentsEmbeddingsModelId\` varchar(255) NULL, \`documentSummarizationModelId\` varchar(255) NULL, \`defaultSystemPrompt\` varchar(255) NULL, \`defaultTemperature\` float NULL DEFAULT '0.7', \`defaultMaxTokens\` int NULL DEFAULT '2048', \`defaultTopP\` float NULL DEFAULT '0.9', \`defaultImagesCount\` int NULL DEFAULT '1', \`avatarUrl\` varchar(255) NULL, \`googleId\` varchar(255) NULL, \`githubId\` varchar(255) NULL, \`authProvider\` varchar(255) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`modelsCount\` int NULL, \`chatsCount\` int NULL, \`settings\` json NULL, FULLTEXT INDEX \`IDX_5372672fbfd1677205e0ce3ece\` (\`firstName\`), FULLTEXT INDEX \`IDX_af99afb7cf88ce20aff6977e68\` (\`lastName\`), UNIQUE INDEX \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`messages\` (\`id\` varchar(36) NOT NULL, \`role\` varchar(255) NOT NULL DEFAULT 'user', \`content\` text NOT NULL, \`jsonContent\` json NULL, \`metadata\` json NULL, \`modelId\` varchar(255) NULL, \`modelName\` varchar(255) NULL, \`chatId\` varchar(255) NULL, \`userId\` varchar(255) NULL, \`linkedToMessageId\` varchar(255) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_1ba536732f253c712a73a53ea7\` (\`linkedToMessageId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`chats\` (\`id\` varchar(36) NOT NULL, \`title\` varchar(255) NOT NULL, \`description\` varchar(255) NULL, \`userId\` varchar(255) NULL, \`files\` json NULL, \`lastBotMessage\` varchar(255) NULL, \`lastBotMessageId\` varchar(255) NULL, \`messagesCount\` int NULL, \`modelId\` varchar(255) NULL, \`temperature\` float NULL, \`maxTokens\` int NULL, \`topP\` float NULL, \`imagesCount\` int NULL, \`systemPrompt\` varchar(255) NULL, \`isPristine\` tinyint NOT NULL DEFAULT 0, \`tools\` json NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`document_chunks\` (\`id\` varchar(36) NOT NULL, \`documentId\` varchar(255) NOT NULL, \`modelId\` varchar(255) NOT NULL, \`page\` int NOT NULL DEFAULT '0', \`pageIndex\` bigint NOT NULL DEFAULT '0', \`content\` text NOT NULL, \`embedding\` text NULL, INDEX \`IDX_eaf9afaf30fb7e2ac25989db51\` (\`documentId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`models\` ADD CONSTRAINT \`FK_bd0eee09c3dde57cc3b9ac1512a\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_documents\` ADD CONSTRAINT \`FK_0bf6b1e9f455bba598d4c73076b\` FOREIGN KEY (\`chatId\`) REFERENCES \`chats\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_documents\` ADD CONSTRAINT \`FK_fee8b0b8a78f1daa22e05ea2682\` FOREIGN KEY (\`documentId\`) REFERENCES \`documents\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`documents\` ADD CONSTRAINT \`FK_4106f2a9b30c9ff2f717894a970\` FOREIGN KEY (\`ownerId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` ADD CONSTRAINT \`FK_36bc604c820bb9adc4c75cd4115\` FOREIGN KEY (\`chatId\`) REFERENCES \`chats\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` ADD CONSTRAINT \`FK_4838cd4fc48a6ff2d4aa01aa646\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` ADD CONSTRAINT \`FK_1ba536732f253c712a73a53ea71\` FOREIGN KEY (\`linkedToMessageId\`) REFERENCES \`messages\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chats\` ADD CONSTRAINT \`FK_ae8951c0a763a060593606b7e2d\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`document_chunks\` ADD CONSTRAINT \`FK_eaf9afaf30fb7e2ac25989db51b\` FOREIGN KEY (\`documentId\`) REFERENCES \`documents\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`document_chunks\` DROP FOREIGN KEY \`FK_eaf9afaf30fb7e2ac25989db51b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`chats\` DROP FOREIGN KEY \`FK_ae8951c0a763a060593606b7e2d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` DROP FOREIGN KEY \`FK_1ba536732f253c712a73a53ea71\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` DROP FOREIGN KEY \`FK_4838cd4fc48a6ff2d4aa01aa646\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` DROP FOREIGN KEY \`FK_36bc604c820bb9adc4c75cd4115\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`documents\` DROP FOREIGN KEY \`FK_4106f2a9b30c9ff2f717894a970\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_documents\` DROP FOREIGN KEY \`FK_fee8b0b8a78f1daa22e05ea2682\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_documents\` DROP FOREIGN KEY \`FK_0bf6b1e9f455bba598d4c73076b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`models\` DROP FOREIGN KEY \`FK_bd0eee09c3dde57cc3b9ac1512a\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_eaf9afaf30fb7e2ac25989db51\` ON \`document_chunks\``,
    );
    await queryRunner.query(`DROP TABLE \`document_chunks\``);
    await queryRunner.query(`DROP TABLE \`chats\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_1ba536732f253c712a73a53ea7\` ON \`messages\``,
    );
    await queryRunner.query(`DROP TABLE \`messages\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_97672ac88f789774dd47f7c8be\` ON \`users\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_af99afb7cf88ce20aff6977e68\` ON \`users\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_5372672fbfd1677205e0ce3ece\` ON \`users\``,
    );
    await queryRunner.query(`DROP TABLE \`users\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_edef2e837ed65c05e116250a21\` ON \`documents\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_95e8f97e178311e7eb65e63289\` ON \`documents\``,
    );
    await queryRunner.query(`DROP TABLE \`documents\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_fee8b0b8a78f1daa22e05ea268\` ON \`chat_documents\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_0bf6b1e9f455bba598d4c73076\` ON \`chat_documents\``,
    );
    await queryRunner.query(`DROP TABLE \`chat_documents\``);
    await queryRunner.query(`DROP TABLE \`models\``);
  }
}
