import { MigrationInterface, QueryRunner } from "typeorm";

const recreateType = async (queryRunner: QueryRunner, values: string) => {
  await queryRunner.query(
    `ALTER TYPE "public"."chat_files_type_enum" RENAME TO "chat_files_type_enum_old"`,
  );
  await queryRunner.query(
    `CREATE TYPE "public"."chat_files_type_enum" AS ENUM(${values})`,
  );
  await queryRunner.query(
    `ALTER TABLE "chat_files" ALTER COLUMN "type" DROP DEFAULT`,
  );
  await queryRunner.query(
    `ALTER TABLE "chat_files" ALTER COLUMN "type" TYPE "public"."chat_files_type_enum" USING "type"::"text"::"public"."chat_files_type_enum"`,
  );
  await queryRunner.query(
    `ALTER TABLE "chat_files" ALTER COLUMN "type" SET DEFAULT 'image'`,
  );
  await queryRunner.query(`DROP TYPE "public"."chat_files_type_enum_old"`);
};

/** Files a skill's program produced in the user's browser and attached to the answer. */
export class ChatFilesGenerated1790100000000 implements MigrationInterface {
  name = "ChatFilesGenerated1790100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await recreateType(
      queryRunner,
      `'image', 'video', 'audio', 'rag_document', 'inline_document', 'generated'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "chat_files" WHERE "type" = 'generated'`,
    );
    await recreateType(
      queryRunner,
      `'image', 'video', 'audio', 'rag_document', 'inline_document'`,
    );
  }
}
