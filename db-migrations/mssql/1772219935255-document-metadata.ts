import { MigrationInterface, QueryRunner } from "typeorm";

export class DocumentMetadata1772219935255 implements MigrationInterface {
  name = "DocumentMetadata1772219935255";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "documents" ADD "metadata" ntext`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN "metadata"`);
  }
}
