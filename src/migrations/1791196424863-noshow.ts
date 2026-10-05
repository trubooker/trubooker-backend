import { MigrationInterface, QueryRunner } from "typeorm";

export class Noshow1791196424863 implements MigrationInterface {
    name = 'Noshow1791196424863'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "no_show_reports" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "updatedBy" character varying, "createdBy" character varying, "bookingId" uuid NOT NULL, "tripId" uuid NOT NULL, "driverId" uuid NOT NULL, "passengerId" uuid NOT NULL, "escrowId" uuid NOT NULL, "amount" numeric(10,2) NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "reportedLat" numeric(10,7) NOT NULL, "reportedLng" numeric(10,7) NOT NULL, "accuracyMeters" double precision, "distanceFromPickupMeters" double precision, "windowOpensAt" TIMESTAMP WITH TIME ZONE NOT NULL, "windowClosesAt" TIMESTAMP WITH TIME ZONE NOT NULL, "reportedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "driverNote" character varying, "reviewedBy" character varying, "reviewedAt" TIMESTAMP WITH TIME ZONE, "declineReason" character varying, CONSTRAINT "PK_f5c90a644f3e962bd9e77dbd3b8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c6e653d494102c59afa3cd25d8" ON "no_show_reports" ("bookingId") `);
        await queryRunner.query(`ALTER TABLE "no_show_reports" ADD CONSTRAINT "FK_c6e653d494102c59afa3cd25d84" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "no_show_reports" ADD CONSTRAINT "FK_629d42680d302363de50232fef1" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "no_show_reports" ADD CONSTRAINT "FK_f6c6eb20dcf55e8a6457936b073" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "no_show_reports" ADD CONSTRAINT "FK_58abc8bf828f13874863aaec7ed" FOREIGN KEY ("passengerId") REFERENCES "passengers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "no_show_reports" ADD CONSTRAINT "FK_705071eedff2373469e60eddfde" FOREIGN KEY ("escrowId") REFERENCES "escrows"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "no_show_reports" DROP CONSTRAINT "FK_705071eedff2373469e60eddfde"`);
        await queryRunner.query(`ALTER TABLE "no_show_reports" DROP CONSTRAINT "FK_58abc8bf828f13874863aaec7ed"`);
        await queryRunner.query(`ALTER TABLE "no_show_reports" DROP CONSTRAINT "FK_f6c6eb20dcf55e8a6457936b073"`);
        await queryRunner.query(`ALTER TABLE "no_show_reports" DROP CONSTRAINT "FK_629d42680d302363de50232fef1"`);
        await queryRunner.query(`ALTER TABLE "no_show_reports" DROP CONSTRAINT "FK_c6e653d494102c59afa3cd25d84"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c6e653d494102c59afa3cd25d8"`);
        await queryRunner.query(`DROP TABLE "no_show_reports"`);
    }

}
