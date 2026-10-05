import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NoShowReport } from '@modules/core/entities/no-show-report.entity';
import { Booking } from '@modules/core/entities/booking.entity';
import { Escrow } from '@modules/core/entities/escro.entity';
import { Driver } from '@modules/core/entities/driver.entity';
import { NoShowService } from './service/no-show.service';
import { AdminNoShowController, DriverNoShowController } from './controller/no-show.controller';

@Module({
  imports: [TypeOrmModule.forFeature([NoShowReport, Booking, Escrow, Driver])],
  controllers: [DriverNoShowController, AdminNoShowController],
  providers: [NoShowService],
})
export class NoShowModule {}