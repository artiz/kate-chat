import { MigrationInterface, QueryRunner } from "typeorm";

export class IndexLinkedToMessage1760634092635 implements MigrationInterface {
  name = "IndexLinkedToMessage1760634092635";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_1ba536732f253c712a73a53ea7" ON "messages" ("linkedToMessageId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_1ba536732f253c712a73a53ea7" ON "messages"`,
    );
  }
}
