import { MigrationInterface, QueryRunner } from "typeorm";

export class EmbeddingsVector1764851063272 implements MigrationInterface {
  name = "EmbeddingsVector1764851063272";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`document_chunks\` DROP COLUMN \`embedding\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`document_chunks\` ADD \`embedding\` vector(3072) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`document_chunks\` DROP COLUMN \`embedding\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`document_chunks\` ADD \`embedding\` text NULL`,
    );
  }
}
