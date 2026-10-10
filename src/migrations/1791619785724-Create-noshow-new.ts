import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateNoshowNew1791619785724 implements MigrationInterface {
    name = 'CreateNoshowNew1791619785724'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "no_show_reports" ADD "windowOpensAt" TIMESTAMP WITH TIME ZONE NOT NULL`);
        await queryRunner.query(`ALTER TABLE "no_show_reports" ADD "windowClosesAt" TIMESTAMP WITH TIME ZONE NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "no_show_reports" DROP COLUMN "windowClosesAt"`);
        await queryRunner.query(`ALTER TABLE "no_show_reports" DROP COLUMN "windowOpensAt"`);
    }

}
