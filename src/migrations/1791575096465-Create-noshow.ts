import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateNoshow1791575096465 implements MigrationInterface {
    name = 'CreateNoshow1791575096465'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "no_show_reports" DROP COLUMN "windowOpensAt"`);
        await queryRunner.query(`ALTER TABLE "no_show_reports" DROP COLUMN "windowClosesAt"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "no_show_reports" ADD "windowClosesAt" TIMESTAMP WITH TIME ZONE NOT NULL`);
        await queryRunner.query(`ALTER TABLE "no_show_reports" ADD "windowOpensAt" TIMESTAMP WITH TIME ZONE NOT NULL`);
    }

}
