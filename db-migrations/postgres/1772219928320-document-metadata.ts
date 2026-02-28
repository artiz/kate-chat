import { MigrationInterface, QueryRunner } from "typeorm";

export class DocumentMetadata1772219928320 implements MigrationInterface {
  name = "DocumentMetadata1772219928320";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "documents" ADD "metadata" json`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN "metadata"`);
  }
}
