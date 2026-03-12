import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateModelProvider1773263358128 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE models set apiProvider='YANDEX_AI' WHERE apiProvider = 'YANDEX_FM'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE models set apiProvider='YANDEX_FM' WHERE apiProvider = 'YANDEX_AI'`,
    );
  }
}
