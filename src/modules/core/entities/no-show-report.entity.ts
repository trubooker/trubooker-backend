import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Booking } from './booking.entity';
import { Trip } from './trip.entity';
import { Driver } from './driver.entity';
import { Passenger } from './passenger.entity';
import { Escrow } from './escro.entity';
import { NoShowStatus } from '../../../types/enums';

@Entity('no_show_reports')
export class NoShowReport extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  bookingId: string;
  @ManyToOne(() => Booking) @JoinColumn({ name: 'bookingId' }) booking: Booking;

  @Column({ type: 'uuid' }) tripId: string;
  @ManyToOne(() => Trip) @JoinColumn({ name: 'tripId' }) trip: Trip;

  @Column({ type: 'uuid' }) driverId: string;
  @ManyToOne(() => Driver) @JoinColumn({ name: 'driverId' }) driver: Driver;

  @Column({ type: 'uuid' }) passengerId: string;
  @ManyToOne(() => Passenger) @JoinColumn({ name: 'passengerId' }) passenger: Passenger;

  @Column({ type: 'uuid' }) escrowId: string;
  @ManyToOne(() => Escrow) @JoinColumn({ name: 'escrowId' }) escrow: Escrow;

  /** Net amount that will be credited to the driver on approval */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', enum: NoShowStatus, default: NoShowStatus.PENDING })
  status: NoShowStatus;

  // ── Where the driver was when they tapped "Passenger didn't show up?" ──
  @Column({ type: 'decimal', precision: 10, scale: 7 }) reportedLat: number;
  @Column({ type: 'decimal', precision: 10, scale: 7 }) reportedLng: number;
  @Column({ type: 'float', nullable: true }) accuracyMeters: number | null;
  /** Straight-line distance to the trip's pickup point (null if pickup coords unusable) */
  @Column({ type: 'float', nullable: true }) distanceFromPickupMeters: number | null;

  // ── Time window ──
  // @Column({ type: 'timestamp with time zone' }) windowOpensAt: Date;
  // @Column({ type: 'timestamp with time zone' }) windowClosesAt: Date;
  @Column({ type: 'timestamp with time zone' }) reportedAt: Date; // server time

  @Column({ type: 'varchar', nullable: true }) driverNote: string | null;

  // ── Admin review ──
  @Column({ type: 'varchar', nullable: true }) reviewedBy: string | null;
  @Column({ type: 'timestamp with time zone', nullable: true }) reviewedAt: Date | null;
  @Column({ type: 'varchar', nullable: true }) declineReason: string | null;
}