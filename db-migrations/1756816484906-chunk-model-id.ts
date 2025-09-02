import { MigrationInterface, QueryRunner } from "typeorm";

export class ChunkModelId1756816484906 implements MigrationInterface {
  name = "ChunkModelId1756816484906";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "document_chunks" ADD "modelId" varchar NOT NULL DEFAULT ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "document_chunks" DROP COLUMN "modelId"`,
    );
  }
}
