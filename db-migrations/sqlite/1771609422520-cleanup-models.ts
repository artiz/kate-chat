import { MigrationInterface, QueryRunner } from "typeorm";

export class CleanupModels1771609422520 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM models WHERE apiProvider <> 'CUSTOM_REST_API'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
