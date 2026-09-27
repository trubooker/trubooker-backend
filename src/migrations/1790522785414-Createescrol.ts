import { MigrationInterface, QueryRunner } from "typeorm";

export class Createescrol1790522785414 implements MigrationInterface {
    name = 'Createescrol1790522785414'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "pendingPhone" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "pendingPhone"`);
    }

}
