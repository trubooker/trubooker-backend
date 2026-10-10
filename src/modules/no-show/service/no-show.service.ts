import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NoShowReport } from '@modules/core/entities/no-show-report.entity';
import { Booking } from '@modules/core/entities/booking.entity';
import { Escrow } from '@modules/core/entities/escro.entity';
import { Driver } from '@modules/core/entities/driver.entity';
import { Trip } from '@modules/core/entities/trip.entity';
import { NotificationService } from '@modules/notification/services/notification.service';
import {
  BookingStatus, EscrowStatus, NoShowStatus, NotificationType,
  PaymentStatus, TicketStatus, TripStatus,
} from '../../../types/enums';
import { ReportNoShowDto } from '../dtos/no-show.dto';

// /** Driver may only report this many minutes AFTER scheduled departure… */
const MIN_WAIT_MINUTES = Number(process.env.NO_SHOW_MIN_WAIT_MINUTES ?? 15);
/** …and the window closes this many hours after scheduled departure. */
const WINDOW_HOURS = Number(process.env.NO_SHOW_WINDOW_HOURS ?? 3);

@Injectable()
export class NoShowService {
  private readonly logger = new Logger(NoShowService.name);

  constructor(
    @InjectRepository(NoShowReport) private readonly reportRepo: Repository<NoShowReport>,
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Escrow) private readonly escrowRepo: Repository<Escrow>,
    @InjectRepository(Driver) private readonly driverRepo: Repository<Driver>,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
  ) {}

  // ───────────────────────── DRIVER ─────────────────────────

  async report(driverUserId: string, bookingId: string, dto: ReportNoShowDto) {
    const driver = await this.driverRepo.findOne({ where: { userId: driverUserId } });
    if (!driver) throw new NotFoundException('Driver profile not found');

    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['trip', 'passenger'],
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.trip.driverId !== driver.id)
      throw new ForbiddenException('This booking is not on your trip');

    // Eligibility
    // if (![TripStatus.ACTIVE, TripStatus.STARTED, TripStatus.COMPLETED].includes(booking.trip.status))
    //   throw new BadRequestException('This trip is not eligible for a no-show report');
    if (booking.trip.status === TripStatus.CANCELLED)
        throw new BadRequestException('This trip was cancelled, so a no-show cannot be reported');

    if (![BookingStatus.CONFIRMED, BookingStatus.COMPLETED].includes(booking.status) ||
        booking.paymentStatus !== PaymentStatus.SUCCESS)
      throw new BadRequestException('Only paid, confirmed bookings can be reported');
    if (booking.isCheckedIn || booking.ticketStatus === TicketStatus.SCANNED)
      throw new BadRequestException('This passenger has already boarded');

    const existing = await this.reportRepo.findOne({ where: { bookingId } });
    if (existing) throw new BadRequestException('A no-show report already exists for this booking');

    // Time window
    const { opensAt, closesAt } = this.computeWindow(booking.trip);
    const now = new Date();
    if (now < opensAt)
      throw new BadRequestException(
        `You can report a no-show from ${opensAt.toISOString()} (${MIN_WAIT_MINUTES} min after departure)`,
      );
    if (now > closesAt)
      throw new BadRequestException('The window to report this no-show has closed');

    // Escrow must still be held
    const escrow = await this.escrowRepo.findOne({ where: { bookingId } });
    if (!escrow || escrow.status !== EscrowStatus.HELD)
      throw new BadRequestException('No held payment found for this booking');

    const pickup = this.pickupCoords(booking.trip);
    const distance = pickup
      ? this.haversineMeters(pickup.lat, pickup.lng, dto.latitude, dto.longitude)
      : null;

    const report = await this.dataSource.transaction(async (em) => {
      escrow.status = EscrowStatus.DISPUTED; // freeze: can't be released or refunded meanwhile
      await em.save(Escrow, escrow);

      return em.save(
        NoShowReport,
        em.create(NoShowReport, {
          bookingId,
          tripId: booking.tripId,
          driverId: driver.id,
          passengerId: booking.passengerId,
          escrowId: escrow.id,
          amount: Number(escrow.netDriverAmount),
          status: NoShowStatus.PENDING,
          reportedLat: dto.latitude,
          reportedLng: dto.longitude,
          accuracyMeters: dto.accuracy ?? null,
          distanceFromPickupMeters: distance,
          windowOpensAt: opensAt,
          windowClosesAt: closesAt,
          reportedAt: now,
          driverNote: dto.note ?? null,
          createdBy: driverUserId,
        }),
      );
    });

    // Message to admin → this is the "payout request" they will see
    await this.notificationService.notifyAdmins({
      title: 'Passenger no-show reported',
      body: `Driver reported a no-show for booking ${booking.bookingCode}. ₦${report.amount} pending review.`,
      type: NotificationType.NO_SHOW_REPORTED,
      data: { reportId: report.id, bookingId, tripId: booking.tripId },
    });

    return report;
  }

  async listMine(driverUserId: string) {
    const driver = await this.driverRepo.findOne({ where: { userId: driverUserId } });
    if (!driver) throw new NotFoundException('Driver profile not found');
    return this.reportRepo.find({
      where: { driverId: driver.id },
      relations: ['booking'],
      order: { createdAt: 'DESC' },
    });
  }

  // ───────────────────────── ADMIN ─────────────────────────

  async adminList(q: { page?: number; limit?: number; status?: NoShowStatus }) {
    const page = Number(q.page ?? 1);
    const limit = Number(q.limit ?? 20);
    const [rows, total] = await this.reportRepo.findAndCount({
      where: q.status ? { status: q.status } : {},
      relations: ['booking', 'trip', 'driver', 'driver.user', 'passenger', 'passenger.user'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: rows.map((r) => this.withMapLink(r)), meta: { page, limit, total } };
  }

  async adminGet(id: string) {
    const r = await this.reportRepo.findOne({
      where: { id },
      relations: ['booking', 'trip', 'driver', 'driver.user', 'passenger', 'passenger.user', 'escrow'],
    });
    if (!r) throw new NotFoundException('No-show report not found');
    return this.withMapLink(r);
  }

  async approve(id: string, adminEmail: string) {
    const report = await this.dataSource.transaction(async (em) => {
      const r = await em.findOne(NoShowReport, { where: { id } });
      if (!r) throw new NotFoundException('No-show report not found');
      if (r.status !== NoShowStatus.PENDING) throw new BadRequestException('Report is not pending');

      const escrow = await em.findOne(Escrow, {
        where: { id: r.escrowId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!escrow || escrow.status !== EscrowStatus.DISPUTED)
        throw new BadRequestException('Escrow is not in a reviewable state');

      escrow.status = EscrowStatus.RELEASED;
      escrow.releasedAt = new Date();
      escrow.releaseReason = 'Passenger no-show (admin approved)';
      await em.save(Escrow, escrow);

      await em.increment(Driver, { id: r.driverId }, 'currentBalance', Number(escrow.netDriverAmount));

      const booking = await em.findOne(Booking, { where: { id: r.bookingId } });
      if (booking) {
        booking.metadata = { ...(booking.metadata ?? {}), noShow: true, noShowReportId: r.id };
        await em.save(Booking, booking);
      }

      r.status = NoShowStatus.APPROVED;
      r.reviewedBy = adminEmail;
      r.reviewedAt = new Date();
      r.updatedBy = adminEmail;
      return em.save(NoShowReport, r);
    });

    await this.notifyDriver(report, NotificationType.NO_SHOW_APPROVED,
      'No-show approved', `₦${report.amount} has been credited to your wallet.`);
    return report;
  }

  async decline(id: string, reason: string, adminEmail: string) {
    const report = await this.dataSource.transaction(async (em) => {
      const r = await em.findOne(NoShowReport, { where: { id } });
      if (!r) throw new NotFoundException('No-show report not found');
      if (r.status !== NoShowStatus.PENDING) throw new BadRequestException('Report is not pending');

      // Unfreeze the escrow back to HELD (admin can handle refund separately)
      await em.update(Escrow, { id: r.escrowId, status: EscrowStatus.DISPUTED }, { status: EscrowStatus.HELD });

      r.status = NoShowStatus.DECLINED;
      r.declineReason = reason;
      r.reviewedBy = adminEmail;
      r.reviewedAt = new Date();
      r.updatedBy = adminEmail;
      return em.save(NoShowReport, r);
    });

    await this.notifyDriver(report, NotificationType.NO_SHOW_DECLINED,
      'No-show declined', `Your no-show report was declined: ${reason}`);
    return report;
  }

  // ───────────────────────── helpers ─────────────────────────


  /** departureLatlong is jsonb any[] — tolerate [lat,lng], [{lat,lng}] or [{latitude,longitude}] */
  private pickupCoords(trip: Trip): { lat: number; lng: number } | null {
    const raw: any = trip.departureLatlong;
    if (!Array.isArray(raw) || !raw.length) return null;
    let lat: any, lng: any;
    if (typeof raw[0] === 'number') [lat, lng] = raw;
    else {
      const o = raw[0] ?? {};
      lat = o.lat ?? o.latitude;
      lng = o.lng ?? o.lon ?? o.longitude;
    }
    lat = Number(lat); lng = Number(lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  private haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000, rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }

  private withMapLink(r: NoShowReport) {
    return {
      ...r,
      mapUrl: `https://www.google.com/maps?q=${r.reportedLat},${r.reportedLng}`,
      withinWindow: r.reportedAt >= r.windowOpensAt && r.reportedAt <= r.windowClosesAt,
    };
  }

//   private withMapLink(r: NoShowReport) {
//   return {
//     ...r,
//     mapUrl: `https://www.google.com/maps?q=${r.reportedLat},${r.reportedLng}`,
//   };
// }

  private computeWindow(trip: Trip) {
    // Lagos is UTC+1 with no DST. Adjust if trips can be created in other zones.
    const t = trip.departureTime.length === 5 ? `${trip.departureTime}:00` : trip.departureTime;
    const departure = new Date(`${trip.departureDate}T${t}+01:00`);
    return {
      opensAt: new Date(departure.getTime() + MIN_WAIT_MINUTES * 60_000),
      closesAt: new Date(departure.getTime() + WINDOW_HOURS * 3_600_000),
    };
  }

  private async notifyDriver(r: NoShowReport, type: NotificationType, title: string, body: string) {
    try {
      const driver = await this.driverRepo.findOne({ where: { id: r.driverId } });
      if (!driver?.userId) return;
      await this.notificationService.notify({
        userId: driver.userId, title, body, type,
        data: { reportId: r.id, bookingId: r.bookingId },
      });
    } catch (e) {
      this.logger.warn(`Failed to notify driver for no-show ${r.id}: ${e?.message}`);
    }
  }
}