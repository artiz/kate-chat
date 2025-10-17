import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatDefaults1760709118110 implements MigrationInterface {
  name = "ChatDefaults1760709118110";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultTemperature" float CONSTRAINT "DF_1473d06f34c65658e4bf67de754" DEFAULT 0.7`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultMaxTokens" int CONSTRAINT "DF_cd53606ab67d63687d4fcd0f1d6" DEFAULT 2048`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultTopP" float CONSTRAINT "DF_a3c74d3b5a967bdebce568aada2" DEFAULT 0.9`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultImagesCount" int CONSTRAINT "DF_d8df67d90f7e60e6cbfb4a4c7a7" DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" ADD "systemPrompt" nvarchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP CONSTRAINT "DF_c99e4e61d0487cdb0c358dd225d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD CONSTRAINT "DF_c99e4e61d0487cdb0c358dd225d" DEFAULT 'AWS_BEDROCK' FOR "apiProvider"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "models" DROP CONSTRAINT "DF_c99e4e61d0487cdb0c358dd225d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD CONSTRAINT "DF_c99e4e61d0487cdb0c358dd225d" DEFAULT 'aws_bedrock' FOR "apiProvider"`,
    );
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "systemPrompt"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "DF_d8df67d90f7e60e6cbfb4a4c7a7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "defaultImagesCount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "DF_a3c74d3b5a967bdebce568aada2"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "defaultTopP"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "DF_cd53606ab67d63687d4fcd0f1d6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "defaultMaxTokens"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "DF_1473d06f34c65658e4bf67de754"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "defaultTemperature"`,
    );
  }
}
