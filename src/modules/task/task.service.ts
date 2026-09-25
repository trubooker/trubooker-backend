import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';

import { Trip } from '@modules/core/entities/trip.entity';
import { Booking } from '@modules/core/entities/booking.entity';
import { TripStatus } from '../../types/enums';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Trip) private readonly tripRepo: Repository<Trip>,
  ) {}

  // ────────────────────────────────────────────────────────────────
  // 1. KEEP-ALIVE — ping self every 10 minutes.
  // Free hosting tiers (Render etc.) spin the service down after
  // ~15 min of no inbound traffic. Hitting our own public /health
  // endpoint resets that idle timer so the app never sleeps.
  // Requires BACKEND_URL in env, e.g. https://true-book.onrender.com
  // ────────────────────────────────────────────────────────────────
  @Cron(CronExpression.EVERY_10_MINUTES)
  async keepAlive() {
    const url = process.env.BACKEND_URL;
    if (!url) {
      this.logger.warn('BACKEND_URL not set — skipping keep-alive ping');
      return;
    }

    try {
      const res = await axios.get(`${url}/health`, { timeout: 30_000 });
      this.logger.log(`Keep-alive ping OK (${res.status})`);
    } catch (err) {
      this.logger.error(`Keep-alive ping failed: ${err.message}`);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // 2. CLEANUP — every hour, soft-delete trips that:
  //    • were created more than 24 hours ago
  //    • are still in 'upcoming' (PENDING) status
  //    • have NO bookings at all (checked via Booking rows,
  //      NOT bookedSeats, since that column isn't reliably updated)
  // softRemove sets deletedAt (consistent with BaseEntity's
  // soft-delete setup) so nothing is lost permanently.
  // ────────────────────────────────────────────────────────────────
  // @Cron(CronExpression.EVERY_HOUR)
  // async deleteStaleUnbookedTrips() {
  //   try {
  //     const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  //     const staleTrips = await this.tripRepo
  //       .createQueryBuilder('trip')
  //       .where('trip.status = :status', { status: TripStatus.PENDING })
  //       .andWhere('trip.createdAt < :cutoff', { cutoff })
  //       .andWhere((qb) => {
  //         const sub = qb
  //           .subQuery()
  //           .select('1')
  //           .from(Booking, 'booking')
  //           .where('booking.tripId = trip.id')
  //           .getQuery();
  //         return `NOT EXISTS ${sub}`;
  //       })
  //       .getMany();

  //     if (staleTrips.length === 0) return;

  //     await this.tripRepo.softRemove(staleTrips);
  //     this.logger.log(
  //       `Soft-deleted ${staleTrips.length} unbooked trip(s) older than 24h: ${staleTrips
  //         .map((t) => t.reference)
  //         .join(', ')}`,
  //     );
  //   } catch (err) {
  //     this.logger.error(`Stale trip cleanup failed: ${err.message}`, err.stack);
  //   }
  // }
}