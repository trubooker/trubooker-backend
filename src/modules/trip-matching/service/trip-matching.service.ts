import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';

import { TripRequest } from '@modules/core/entities/trip-request.entity';
import { TripRequestPool } from '@modules/core/entities/trip-request-pool.entity';
import { Driver } from '@modules/core/entities/driver.entity';
import { Trip } from '@modules/core/entities/trip.entity';

import { NotificationService } from '@modules/notification/services/notification.service';
import { PagedDto } from '@shared/interface/paged.interface';
import {
  NotificationType,
  TripPoolStatus,
  TripRequestStatus,
  PreferredTime,
  PREFERRED_TIME_SLOT_TO_TIME,
  PREFERRED_TIME_SLOT_TO_RANGE,
} from 'src/types/enums';
import {
  isInterStateTrip,
  resolveNigeriaState,
  districtToken,
  isDefinitelyInterState,
  locationInDistrict,
  locationInState,
} from '@shared/utils/geo/nigeria-geo.util';
import { BoardQueryDto, ClaimPoolDto } from '../dtos/trip-matching.dto';
import { ExpoService } from '@modules/notification/services/expo.service';
import { User } from '@modules/core/entities/user.entity';
import { SystemSettingService } from '@modules/system/service/system.service';
import {
  ResolvedPlace,
  compareDeparture,
  placeFromColumns,
} from '@shared/utils/geo/place.util';

/** Fallback lead times (hours), used only when the admin hasn't set one. */
const INTRA_STATE_WINDOW_HOURS = 12; // within a state
const INTER_STATE_WINDOW_HOURS = 18; // across states
const DEFAULT_DEPARTURE_TIME = '06:00:00';

@Injectable()
export class TripMatchingService {
  private readonly logger = new Logger(TripMatchingService.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly notificationService: NotificationService,
    private readonly expoService: ExpoService,
    private readonly systemSettings: SystemSettingService,
    @InjectRepository(TripRequestPool)
    private readonly poolRepo: Repository<TripRequestPool>,
    @InjectRepository(TripRequest)
    private readonly requestRepo: Repository<TripRequest>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Trip)
    private readonly tripRepo: Repository<Trip>,
      @InjectRepository(User) private readonly userRepo: Repository<User>,

  ) {}

  /**
   * Admin-configurable lead time (hours before departure) for pushing a
   * MATCHING pool to the driver board — separate values for intra-state and
   * inter-state trips (`PriceControlDto.intraStateDispatchWindowHours` /
   * `interStateDispatchWindowHours`, set via the price-control admin route).
   * Falls back to the built-in defaults (12h / 18h) when unset, invalid, or
   * when no price-control row exists yet — this must never block matching.
   */
  private async dispatchWindowHours(isInter: boolean): Promise<number> {
    let hours: number | undefined;
    try {
      const settings = await this.systemSettings.getPriceControl();
      hours = isInter
        ? settings?.interStateDispatchWindowHours
        : settings?.intraStateDispatchWindowHours;
    } catch {
      // No price-control row yet — fall back to the default silently.
    }
    const fallback = isInter ? INTER_STATE_WINDOW_HOURS : INTRA_STATE_WINDOW_HOURS;
    const n = Number(hours);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  // ════════════════════════════════════════════════════════════════════════
  // 1. MATCHING — group pending requests on the same route + date into pools
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Sweep every PENDING request that isn't in a pool yet and group them by
   * route + date. Requests already dispatched to the board are never disturbed.
   * Safe to run repeatedly (idempotent) — it's driven by a cron.
   */
  async matchPendingRequests(
    em?: EntityManager,
  ): Promise<{ pooled: number; poolsTouched: number }> {
    const manager = em ?? this.entityManager;
    const today = new Date().toISOString().slice(0, 10);

    const pending = await manager.find(TripRequest, {
      where: {
        status: TripRequestStatus.PENDING,
        poolId: IsNull(),
      },
      order: { createdAt: 'ASC' },
    });

    // Only consider requests whose date is today or later.
    const eligible = pending.filter((r) => r.requestedDate >= today);
    if (!eligible.length) return { pooled: 0, poolsTouched: 0 };

    // Bucket by a normalised route+date key.
    // const buckets = new Map<string, TripRequest[]>();
    // for (const req of eligible) {
    //   const key = this.matchKey(req.origin, req.destination, req.requestedDate);
    //   const list = buckets.get(key) ?? [];
    //   list.push(req);
    //   buckets.set(key, list);
    // }
        const buckets = new Map<string, TripRequest[]>();
    for (const req of eligible) {
      const key = this.requestMatchKey(req);
      const list = buckets.get(key) ?? [];
      list.push(req);
      buckets.set(key, list);
    }

    let pooled = 0;
    const touched = new Set<string>();

    for (const [key, members] of buckets) {
      // When we're handed a transaction (e.g. pooling a request the moment
      // it's created), reuse it so the new row is visible and everything
      // commits atomically. On the cron path we own the boundary, so each
      // bucket gets its own short transaction to avoid holding locks across
      // the whole sweep.
      const pool = em
        ? await this.upsertPool(key, members, em)
        : await this.entityManager.transaction((t) =>
            this.upsertPool(key, members, t),
          );
      if (!pool) continue; // e.g. departure already passed
      touched.add(pool.id);
      pooled += members.length;
    }

    if (pooled) {
      this.logger.log(`Matched ${pooled} request(s) into ${touched.size} pool(s).`);
    }
    return { pooled, poolsTouched: touched.size };
  }

  /**
   * Pool a single freshly-created request straight away, inside the caller's
   * transaction, so a passenger's request enters the matching pipeline the
   * instant it's made — no admin step, no waiting for the next cron tick.
   * Idempotent and best-effort: an already-pooled request or one whose
   * departure has passed is simply skipped.
   */
  async matchRequestNow(
    requestId: string,
    em: EntityManager,
  ): Promise<TripRequestPool | null> {
    const req = await em.findOne(TripRequest, { where: { id: requestId } });
    if (!req) return null;
    if (req.status !== TripRequestStatus.PENDING) return null;
    if (req.poolId) return null; // already in a pool

    const today = new Date().toISOString().slice(0, 10);
    if (req.requestedDate < today) return null;

    // return this.upsertPool(
    //   this.matchKey(req.origin, req.destination, req.requestedDate),
    //   [req],
    //   em,
    // );
    return this.upsertPool(this.requestMatchKey(req), [req], em);
  }

  /** Create or extend the MATCHING pool for a route+date and attach members. */
 

  // ════════════════════════════════════════════════════════════════════════
  // 2. DISPATCH — push due pools to the driver board (12h/18h before departure)
  // ════════════════════════════════════════════════════════════════════════

    /** Create or extend the MATCHING pool for a route+date and attach members. */
  private async upsertPool(
    matchKey: string,
    members: TripRequest[],
    em: EntityManager,
  ): Promise<TripRequestPool | null> {
    const [sample] = members;
    const requestedDate = sample.requestedDate;

    // Earliest preferred time wins (default 06:00 when nobody stated one).
    // The concrete clock time comes from each member's chosen slot; the raw
    // `preferredTime` field now holds a display range, not a parseable time.
    const earliestTime = members
      .map((m) => this.slotDepartureTime(m))
      .filter(Boolean)
      .sort()[0] ?? DEFAULT_DEPARTURE_TIME;

    const departureAt = new Date(`${requestedDate}T${earliestTime}`);
    if (Number.isNaN(departureAt.getTime())) return null;
    if (departureAt.getTime() <= Date.now()) return null; // already in the past

    const isInter = isInterStateTrip(sample.origin, sample.destination);
    const windowHours = await this.dispatchWindowHours(isInter);
    const now = new Date();

    // A pool reaches the driver board `windowHours` before departure
    // (12h intra-state / 18h inter-state by default). A request made INSIDE
    // that window has nothing to wait for, so it goes on the board instantly.
    const HOUR_MS = 60 * 60 * 1000;
    const scheduledDispatchAt = new Date(departureAt.getTime() - windowHours * HOUR_MS);
    const dispatchNow = scheduledDispatchAt.getTime() <= now.getTime();
    let goneToBoardNow = false;  // this call puts the pool on the board
    let joinedBoardPool = false; // a new request joined a pool already on the board

    // Runs inside the caller's transaction (cron sweep or on-create match).
    // Reuse an existing OPEN pool for this route+date — one that's still
    // MATCHING or already on the BOARD — so late arrivals join the same group.
    // CLAIMED/EXPIRED/FULFILLED pools are excluded, so a new request there
    // starts a fresh pool.
    let pool = await em.findOne(TripRequestPool, {
      where: {
        matchKey,
        status: In([TripPoolStatus.MATCHING, TripPoolStatus.BOARD]),
      },
    });

    if (!pool) {
      // Keep origin/destination EXACTLY as the passenger requested them —
      // don't collapse to the resolved district. originState/destinationState
      // carry the resolved state for internal filtering/grouping.
      pool = em.create(TripRequestPool, {
        matchKey,
        origin: sample.origin,
        destination: sample.destination,
        originState: resolveNigeriaState(sample.origin),
        destinationState: resolveNigeriaState(sample.destination),
        isInterState: isInter,
        requestedDate,
        departureTime: earliestTime,
        departureAt,
        dispatchWindowHours: windowHours,
        // Outside the window: wait as MATCHING until dispatchAt (the cron
        // dispatchDuePools() moves it to BOARD). Inside the window: board now.
        dispatchAt: dispatchNow ? now : scheduledDispatchAt,
        dispatchedAt: dispatchNow ? now : null,
        status: dispatchNow ? TripPoolStatus.BOARD : TripPoolStatus.MATCHING,
        totalSeats: 0,
        memberCount: 0,
      });
      pool = await em.save(TripRequestPool, pool);
      goneToBoardNow = dispatchNow;
    } else {
      // A new request landing on a pool that's already claimable: drivers
      // should hear about the extra demand.
      joinedBoardPool = pool.status === TripPoolStatus.BOARD;

      // Keep the earliest preferred time if a new member wants to leave sooner.
      if (earliestTime < (pool.departureTime ?? DEFAULT_DEPARTURE_TIME)) {
        pool.departureTime = earliestTime;
        pool.departureAt = departureAt;

        // Earlier departure => earlier dispatch. Re-time a pool that is still
        // waiting, and promote it if its (new) window has already opened.
        if (pool.status === TripPoolStatus.MATCHING) {
          const newDispatchAt = new Date(
            departureAt.getTime() - (pool.dispatchWindowHours ?? windowHours) * HOUR_MS,
          );
          if (newDispatchAt.getTime() <= now.getTime()) {
            pool.status = TripPoolStatus.BOARD;
            pool.dispatchAt = now;
            pool.dispatchedAt = now;
            goneToBoardNow = true;
          } else {
            pool.dispatchAt = newDispatchAt;
          }
        }
      }
    }

    // Attach members and recompute totals from the DB (authoritative).
    const ids = members.map((m) => m.id);
    await em.update(TripRequest, { id: In(ids) }, { poolId: pool.id });

    const all = await em.find(TripRequest, { where: { poolId: pool.id } });
    pool.memberCount = all.length;
    pool.totalSeats = all.reduce((sum, r) => sum + (r.seats ?? 1), 0);
    const saved = await em.save(TripRequestPool, pool);

    // Notify drivers whenever a request makes a pool claimable right now:
    // either the pool just landed on the board, or a new request joined one
    // that's already there. A pool still waiting (MATCHING) is announced later
    // by dispatchDuePools() when its window opens — drivers can't claim it
    // before then, so notifying earlier would point them at nothing.
    // Fire-and-forget: fanning out to every driver must not slow down (or
    // fail) the passenger's request. notifyDriversOfBoard swallows its errors.
    if (goneToBoardNow || joinedBoardPool) {
      void this.notifyDriversOfBoard(saved, {
        isNewDemand: joinedBoardPool && !goneToBoardNow,
      });
    }

    return saved;
  }
    /** Create or extend the MATCHING pool for a route+date and attach members. */
  // private async upsertPool(
  //   matchKey: string,
  //   members: TripRequest[],
  //   em: EntityManager,
  // ): Promise<TripRequestPool | null> {
  //   const [sample] = members;
  //   const requestedDate = sample.requestedDate;

  //   // Earliest preferred time wins (default 06:00 when nobody stated one).
  //   // The concrete clock time comes from each member's chosen slot; the raw
  //   // `preferredTime` field now holds a display range, not a parseable time.
  //   const earliestTime = members
  //     .map((m) => this.slotDepartureTime(m))
  //     .filter(Boolean)
  //     .sort()[0] ?? DEFAULT_DEPARTURE_TIME;

  //   const departureAt = new Date(`${requestedDate}T${earliestTime}`);
  //   if (Number.isNaN(departureAt.getTime())) return null;
  //   if (departureAt.getTime() <= Date.now()) return null; // already in the past

  //   const isInter = isInterStateTrip(sample.origin, sample.destination);
  //   const windowHours = await this.dispatchWindowHours(isInter);
  //   const now = new Date();

  //   // A pool reaches the driver board `windowHours` before departure
  //   // (12h intra-state / 18h inter-state by default). A request made INSIDE
  //   // that window has nothing to wait for, so it goes on the board instantly.
  //   const HOUR_MS = 60 * 60 * 1000;
  //   const scheduledDispatchAt = new Date(departureAt.getTime() - windowHours * HOUR_MS);
  //   const dispatchNow = scheduledDispatchAt.getTime() <= now.getTime();
  //   let goneToBoardNow = false; // true when this call puts the pool on the board
    

  //   // Runs inside the caller's transaction (cron sweep or on-create match).
  //   // Reuse an existing OPEN pool for this route+date — one that's still
  //   // MATCHING or already on the BOARD — so late arrivals join the same group.
  //   // CLAIMED/EXPIRED/FULFILLED pools are excluded, so a new request there
  //   // starts a fresh pool.
  //   let pool = await em.findOne(TripRequestPool, {
  //     where: {
  //       matchKey,
  //       status: In([TripPoolStatus.MATCHING, TripPoolStatus.BOARD]),
  //     },
  //   });

  //   if (!pool) {
  //     // Keep origin/destination EXACTLY as the passenger requested them —
  //     // don't collapse to the resolved district. originState/destinationState
  //     // carry the resolved state for internal filtering/grouping.
  //     pool = em.create(TripRequestPool, {
  //       matchKey,
  //       origin: sample.origin,
  //       destination: sample.destination,
  //       originState: resolveNigeriaState(sample.origin),
  //       destinationState: resolveNigeriaState(sample.destination),
  //       isInterState: isInter,
  //       requestedDate,
  //       departureTime: earliestTime,
  //       departureAt,
  //       dispatchWindowHours: windowHours,
  //       // Outside the window: wait as MATCHING until dispatchAt (the cron
  //       // dispatchDuePools() moves it to BOARD). Inside the window: board now.
  //       dispatchAt: dispatchNow ? now : scheduledDispatchAt,
  //       dispatchedAt: dispatchNow ? now : null,
  //       status: dispatchNow ? TripPoolStatus.BOARD : TripPoolStatus.MATCHING,
  //       totalSeats: 0,
  //       memberCount: 0,
  //     });
  //     pool = await em.save(TripRequestPool, pool);
  //     goneToBoardNow = dispatchNow;
  //   } else {
  //     // Keep the earliest preferred time if a new member wants to leave sooner.
  //     if (earliestTime < (pool.departureTime ?? DEFAULT_DEPARTURE_TIME)) {
  //       pool.departureTime = earliestTime;
  //       pool.departureAt = departureAt;

  //       // Earlier departure => earlier dispatch. Re-time a pool that is still
  //       // waiting, and promote it if its (new) window has already opened.
  //       if (pool.status === TripPoolStatus.MATCHING) {
  //         const newDispatchAt = new Date(
  //           departureAt.getTime() - (pool.dispatchWindowHours ?? windowHours) * HOUR_MS,
  //         );
  //         if (newDispatchAt.getTime() <= now.getTime()) {
  //           pool.status = TripPoolStatus.BOARD;
  //           pool.dispatchAt = now;
  //           pool.dispatchedAt = now;
  //           goneToBoardNow = true;
  //         } else {
  //           pool.dispatchAt = newDispatchAt;
  //         }
  //       }
  //     }
  //   }

  //   // Attach members and recompute totals from the DB (authoritative).
  //   const ids = members.map((m) => m.id);
  //   await em.update(TripRequest, { id: In(ids) }, { poolId: pool.id });

  //   const all = await em.find(TripRequest, { where: { poolId: pool.id } });
  //   pool.memberCount = all.length;
  //   pool.totalSeats = all.reduce((sum, r) => sum + (r.seats ?? 1), 0);
  //   const saved = await em.save(TripRequestPool, pool);

  //   // Notify drivers only when the pool actually lands on the board now.
  //   // A pool that is still waiting (MATCHING) is announced later by
  //   // dispatchDuePools() when its window opens.
  //   if (goneToBoardNow) {
  //     await this.notifyDriversOfBoard(saved);
  //   }

  //   return saved;
  // }
  
  async dispatchDuePools(): Promise<{ dispatched: number }> {
    const now = new Date();

    const due = await this.poolRepo.find({
      where: {
        status: TripPoolStatus.MATCHING,
        dispatchAt: LessThanOrEqual(now),
        departureAt: MoreThan(now),
      },
      order: { departureAt: 'ASC' },
    });

    if (!due.length) return { dispatched: 0 };

    for (const pool of due) {
      pool.status = TripPoolStatus.BOARD;
      pool.dispatchedAt = now;
      await this.poolRepo.save(pool);
      await this.notifyDriversOfBoard(pool);
    }

    this.logger.log(`Dispatched ${due.length} pool(s) to the driver board.`);
    return { dispatched: due.length };
  }

  /** Expire pools whose departure has passed with no driver. */
  async expireStalePools(): Promise<{ expired: number }> {
    const now = new Date();
    const stale = await this.poolRepo.find({
      where: {
        status: In([TripPoolStatus.MATCHING, TripPoolStatus.BOARD]),
        departureAt: LessThanOrEqual(now),
      },
    });
    if (!stale.length) return { expired: 0 };

    for (const pool of stale) {
      pool.status = TripPoolStatus.EXPIRED;
      await this.poolRepo.save(pool);
    }
    return { expired: stale.length };
  }

  /**
   * Notify active drivers that a new pooled request is on the board.
   *
   * DISABLED: drivers are intentionally NOT notified when a passenger creates
   * a trip request. Both channels are turned off here in one place — the
   * in-app NotificationService (notifyMany) and the direct Expo push
   * (pushToUser -> ExpoService.sendPushNotification). Drivers can still see
   * open requests via the driver board (getDriverBoard); they simply no longer
   * receive a notification or a push when a request lands.
   *
   * To re-enable, delete the early `return` and uncomment the body below.
   */


    /**
   * Notify verified drivers that a pooled request is on the board.
   *
   * NotificationService.notify() already does all three channels per driver —
   * persists the in-app notification, emits over the websocket, and sends the
   * Expo push to the driver's expoToken — so there is deliberately no separate
   * pushToUser() call here (that would deliver every push twice).
   */
  private async notifyDriversOfBoard(
    pool: TripRequestPool,
    opts: { isNewDemand?: boolean } = {},
  ): Promise<void> {
    try {
      const drivers = await this.driverRepo.find({
        where: { licenseVerified: true },
        select: ['userId'],
      });
      const userIds = drivers.map((d) => d.userId).filter(Boolean);
      if (!userIds.length) return;

      await this.notificationService.notifyMany(userIds, {
        title: opts.isNewDemand
          ? 'More passengers on a trip request'
          : 'New trip request on the board',
        body:
          `${pool.totalSeats} passenger(s) want ${pool.origin} → ${pool.destination} ` +
          `on ${pool.requestedDate}. Tap to claim.`,
        type: NotificationType.TRIP_REQUEST_BOARD,
        data: {
          poolId: pool.id,
          origin: pool.origin,
          destination: pool.destination,
          requestedDate: pool.requestedDate,
          departureTime: pool.departureTime,
          totalSeats: pool.totalSeats,
          isInterState: pool.isInterState,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to notify drivers for pool ${pool.id}: ${err?.message}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 3. DRIVER BOARD — list + claim
  // ════════════════════════════════════════════════════════════════════════

  async getDriverBoard(query: BoardQueryDto): Promise<PagedDto<any>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.poolRepo
      .createQueryBuilder('pool')
      .where('pool.status = :status', { status: TripPoolStatus.BOARD })
      .andWhere('pool.departureAt > NOW()');

    if (query.scope === 'intra') qb.andWhere('pool.isInterState = false');
    if (query.scope === 'inter') qb.andWhere('pool.isInterState = true');

    // Combined: origin OR destination in the given state.
    if (query.state) {
      qb.andWhere(
        '(pool.originState ILIKE :st OR pool.destinationState ILIKE :st)',
        { st: `%${query.state}%` },
      );
    }

    // Direction-specific: leaving a state, and/or heading to a state.
    if (query.originState) {
      qb.andWhere('pool.originState ILIKE :os', { os: `%${query.originState}%` });
    }
    if (query.destinationState) {
      qb.andWhere('pool.destinationState ILIKE :ds', {
        ds: `%${query.destinationState}%`,
      });
    }

    qb.orderBy('pool.departureAt', 'ASC').addOrderBy('pool.id', 'ASC');

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    // Pull the passenger notes for the pools on this page in one query, then
    // group them by pool (a pool can hold several passengers, so notes is a list).
    const poolIds = data.map((p) => p.id);
    const members = poolIds.length
      ? await this.requestRepo.find({
          where: { poolId: In(poolIds) },
          select: ['id', 'poolId', 'note'],
        })
      : [];

    const notesByPool = new Map<string, string[]>();
    for (const m of members) {
      if (!m.poolId || !m.note) continue;
      const list = notesByPool.get(m.poolId) ?? [];
      list.push(m.note);
      notesByPool.set(m.poolId, list);
    }

    // Surface the human departure window (e.g. "5:00 PM - 7:00 PM") alongside
    // the pool's concrete departureTime, plus the passenger note, so drivers
    // see the same label passengers picked and any context they added. When a
    // pool has several passengers their notes are joined into one string.
    const enriched = data.map((pool) => {
      const poolNotes = notesByPool.get(pool.id);
      return {
        ...pool,
        preferredTime: this.rangeForTime(pool.departureTime),
        note: poolNotes?.length ? poolNotes.join(' | ') : null,
      };
    });

    return this.toPaged(enriched, total, page, limit, skip);
  }

  /** Map a concrete HH:mm:ss departure time back to its display window. */
  private rangeForTime(time?: string | null): string | null {
    const hhmm = this.normalizeTime(time);
    if (!hhmm) return null;
    const slot = (Object.keys(PREFERRED_TIME_SLOT_TO_TIME) as PreferredTime[]).find(
      (s) => PREFERRED_TIME_SLOT_TO_TIME[s] === hhmm,
    );
    return slot ? PREFERRED_TIME_SLOT_TO_RANGE[slot] : null;
  }

  /** A driver claims a pooled request; optionally attaches a trip they own. */
  async claimPool(
    driverUserId: string,
    poolId: string,
    dto: ClaimPoolDto,
  ): Promise<TripRequestPool> {
    return this.entityManager.transaction(async (em) => {
      const driver = await em.findOne(Driver, { where: { userId: driverUserId } });
      if (!driver) throw new NotFoundException('Driver profile not found');

      const pool = await em.findOne(TripRequestPool, { where: { id: poolId } });
      if (!pool) throw new NotFoundException('Trip request pool not found');

      if (pool.status !== TripPoolStatus.BOARD) {
        throw new BadRequestException(
          `This request is ${pool.status} and can no longer be claimed.`,
        );
      }

      // Optional trip attachment — must belong to the claiming driver.
      let linkedTripId: string | null = null;
      if (dto.tripId) {
        const trip = await em.findOne(Trip, { where: { id: dto.tripId } });
        if (!trip) throw new NotFoundException('Linked trip not found');
        if (trip.driverId !== driver.id) {
          throw new ForbiddenException('That trip does not belong to you');
        }
        linkedTripId = trip.id;
      }

      pool.status = TripPoolStatus.CLAIMED;
      pool.claimedByDriverId = driver.id;
      pool.claimedAt = new Date();
      pool.linkedTripId = linkedTripId;
      pool.metadata = { ...(pool.metadata ?? {}), claimNote: dto.note ?? null };
      await em.save(TripRequestPool, pool);

      // Move member requests to APPROVED and notify each passenger.
      const members = await em.find(TripRequest, { where: { poolId: pool.id } });
      for (const req of members) {
        req.status = TripRequestStatus.APPROVED;
        req.linkedTripId = linkedTripId;
        req.processedAt = new Date();
        await em.save(TripRequest, req);
        await this.notifyPassengerClaimed(req, pool, linkedTripId);
      }

      return pool;
    });
  }

  private async notifyPassengerClaimed(
    req: TripRequest,
    pool: TripRequestPool,
    linkedTripId: string | null,
  ): Promise<void> {
    try {
      await this.notificationService.notify({
        userId: req.requesterUserId,
        title: 'A driver is arranging your trip',
        body:
          `Good news — a driver picked up your request for ${pool.origin} → ` +
          `${pool.destination} on ${pool.requestedDate}.` +
          (linkedTripId ? ' Tap to book your seat.' : ''),
        type: NotificationType.TRIP_REQUEST_CLAIMED,
        data: {
          tripRequestId: req.id,
          poolId: pool.id,
          tripId: linkedTripId,
          origin: pool.origin,
          destination: pool.destination,
          requestedDate: pool.requestedDate,
        },
      });
      await this.pushToUser(req.requesterUserId, 'Trip Request Claimed', `Your trip request for ${pool.origin} → ${pool.destination} has been claimed by a driver.`);
    } catch (err) {
      this.logger.warn(`Failed to notify passenger ${req.requesterUserId}: ${err?.message}`);
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  /** Fetch the user's Expo token and push directly. Best-effort. */
private async pushToUser(userId: string, title: string, body: string, data?: any) {
  try {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user?.expoToken) {
      this.logger.warn(`No expoToken for user ${userId}; skipping push`);
      return;
    }
    await this.expoService.sendPushNotification(user.expoToken, title, body, data);
  } catch (err) {
    this.logger.warn(`Expo push failed for ${userId}: ${err?.message}`);
  }
}

 /**
 * Called when a driver creates a trip. Finds every PENDING request on the
 * same route + date, approves it, links it to the new trip, closes its pool,
 * and notifies the passenger — no admin. Best-effort, runs in the caller's
 * transaction/manager, and only touches PENDING requests so nobody is
 * approved or notified twice.
 */




  /**
 * Called when a driver creates a trip. Finds the PENDING passenger requests
 * this trip serves and tells those passengers.
 *
 * A request is served when, on the same date (and compatible time slot):
 *   1. DEPARTURE is the same town / district as the passenger asked for —
 *      a Warri departure never serves an Agbor passenger; and
 *   2. ARRIVAL is either
 *        • the same district            → 'exact'  (request approved + linked,
 *                                          its pool closed), or
 *        • (INTER-STATE requests only) a different district inside the
 *          requested destination state  → 'state'  (passenger is notified and
 *          can book, but their request stays open for an exact trip).
 *
 * Best-effort, runs in the caller's transaction/manager, and only touches
 * PENDING requests.
 */
async fulfillRequestsForTrip(
  args: {
    tripId: string;
    origin: string;
    destination: string;
    /** Arrival state as the driver entered it (arrivalDestination[0].state). */
    destinationState?: string | null;
    originPlace?: ResolvedPlace | null;
    date: string;
    departureTime?: string | null;
  },
  em: EntityManager,
): Promise<number> {
  const { tripId, origin, destination, originPlace, destinationState, date, departureTime } = args;
  if (!origin || !destination || !date) return 0;

  // Both sides must be ISO before comparison. Requests are normalised on
  // create; trips are not, so coerce here.
  const iso = (d: string) => {
    const t = String(d ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const m = t.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : t;
  };

  const tripDate = iso(date);
  // Everything that names the trip's arrival (place + state) in one string.
  const tripArrival = [destination, destinationState].filter(Boolean).join(', ');
  // Short label for messages: "Ikorodu" out of "Ikorodu, Ikorodu Rd, Lagos".
  const arrivalLabel = String(destination).split(',')[0].trim() || destination;
  // The slot the trip's departure time falls in (null when it can't be parsed).
  const tripSlot = this.slotForClock(departureTime);
  this.logger.debug(
    `fulfillRequestsForTrip: trip ${tripId} ${origin} → ${tripArrival} on ${tripDate} slot=${tripSlot ?? 'any'}`,
  );

  // All requests still waiting. We compare in memory so date-format
  // differences never hide a match at the SQL layer.
  const pending = await em.find(TripRequest, {
    where: { status: TripRequestStatus.PENDING },
  });

  const matches: { req: TripRequest; type: 'exact' | 'state' }[] = [];
  for (const r of pending) {
    if (iso(r.requestedDate) !== tripDate) continue;

    const type = this.tripServesRequest(origin, tripArrival, r, originPlace);
    if (!type) continue;

    // Honour the time-of-day: only pull in passengers whose slot matches the
    // trip's. If the trip time is unknown, or a passenger stated no slot,
    // treat it as compatible rather than dropping the match.
    if (tripSlot) {
      const reqSlot = this.requestSlot(r);
      if (!(reqSlot === 'any' || reqSlot === tripSlot)) continue;
    }

    matches.push({ req: r, type });
  }

  if (!matches.length) {
    this.logger.debug(
      `fulfillRequestsForTrip: no PENDING request matched trip ${tripId} ` +
        `(scanned ${pending.length})`,
    );
    return 0;
  }

  for (const { req, type } of matches) {
    // Only an EXACT match consumes the request. A same-state match just tells
    // the passenger — their request stays PENDING (and its pool open) so a
    // driver going to their exact destination can still pick it up.
    if (type === 'exact') {
      req.status = TripRequestStatus.APPROVED;
      req.linkedTripId = tripId;
      req.processedAt = new Date();
      await em.save(TripRequest, req);

      // Close the pool this request was sitting in, if any.
      if (req.poolId) {
        await em.update(
          TripRequestPool,
          { id: req.poolId },
          {
            status: TripPoolStatus.CLAIMED,
            linkedTripId: tripId,
            claimedAt: new Date(),
          },
        );
      }
    }

    const title =
      type === 'exact'
        ? 'Your trip request was approved'
        : 'A trip is available for your route';
    const body =
      type === 'exact'
        ? `A driver created a trip for ${req.origin} → ${req.destination} ` +
          `on ${req.requestedDate}. Tap to book your seat.`
        : `A driver is leaving ${req.origin} for ${arrivalLabel} on ${req.requestedDate}. ` +
          `It's in the same state as ${req.destination}. Tap to view and book a seat.`;
    const data = {
      tripRequestId: req.id,
      tripId,
      origin: req.origin,
      destination: req.destination,
      requestedDate: req.requestedDate,
      matchType: type,
      tripDestination: arrivalLabel,
    };

    // Notify the passenger (per-passenger best-effort — one failure must
    // not stop the others).
    try {
      await this.notificationService.notify({
        userId: req.requesterUserId,
        title,
        body,
        type: NotificationType.TRIP_REQUEST_APPROVED,
        data,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to notify passenger ${req.requesterUserId}: ${err?.message}`,
      );
    }
    await this.pushToUser(req.requesterUserId, title, body, data);
  }

  const exactCount = matches.filter((m) => m.type === 'exact').length;
  this.logger.log(
    `Trip ${tripId}: ${exactCount} request(s) auto-approved, ` +
      `${matches.length - exactCount} notified (same destination state).`,
  );
  return matches.length;
}

/**
 * Does a trip leaving `tripOrigin` and arriving at `tripArrival` serve `req`?
 *   'exact' → same departure town AND same arrival district
 *   'state' → same departure town; different arrival district inside the
 *             requested destination state — INTER-STATE requests only
 *   null    → no
 *
 * Examples (passenger asks Agbor, Delta → Ikeja, Lagos):
 *   Agbor → Ikeja        exact
 *   Agbor → Ikorodu/Lekki  state   (still Lagos)
 *   Warri → Ikeja        null      (departure differs)
 *   Agbor → Abuja        null      (different state)
 * An intra-state request (Benin City → Ekpoma) never gets 'state': a trip to
 * Uromi is not a trip to Ekpoma.
 */



private tripServesRequest(
  tripOrigin: string,
  tripArrival: string,
  req: TripRequest,
  tripPlace?: ResolvedPlace | null,
): 'exact' | 'state' | null {
  // 1. Departure must be the same town / district.
  //    Prefer the resolved places: same city or same LGA → yes; different
  //    state, or city AND LGA both differ → no. When either side couldn't be
  //    resolved, fall back to the address text.
  const geo = compareDeparture(
    tripPlace,
    placeFromColumns(req.originState, req.originLga, req.originCity),
  );
  const sameDeparture = geo ?? locationInDistrict(tripOrigin, req.origin);
  if (!sameDeparture) return null;

  // 2a. Same arrival district.
  if (locationInDistrict(tripArrival, req.destination)) return 'exact';

  // 2b. Inter-state request: any arrival inside the requested state.
  if (!isDefinitelyInterState(req.origin, req.destination)) return null;
  const wantedState = resolveNigeriaState(req.destination);
  if (wantedState && locationInState(tripArrival, wantedState)) return 'state';

  return null;
}
  /** `origin|destination|date`, each side normalised to a stable token. */


  private normalizeTime(t?: string | null): string | null {
    if (!t) return null;
    const m = String(t).trim().match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    return `${m[1]}:${m[2]}:${m[3] ?? '00'}`;
  }

  /**
   * Concrete HH:mm:ss departure time for pool scheduling. Preferred source is
   * the chosen slot in metadata; falls back to a raw clock value in
   * `preferredTime` for rows created before it became a display range.
   */
  private slotDepartureTime(req: TripRequest): string | null {
    const slot = req.metadata?.preferredSlot as PreferredTime | undefined;
    if (slot && PREFERRED_TIME_SLOT_TO_TIME[slot]) {
      return PREFERRED_TIME_SLOT_TO_TIME[slot];
    }
    return this.normalizeTime(req.preferredTime);
  }

  private toPaged(
    data: any[],
    total: number,
    page: number,
    limit: number,
    skip: number,
  ): PagedDto<any> {
    const paged = new PagedDto();
    paged.data = data;
    paged.meta = {
      page,
      limit,
      count: data.length,
      previousPage: page > 1 ? page - 1 : false,
      nextPage: skip + limit < total ? page + 1 : false,
      pageCount: Math.ceil(total / limit),
      totalRecords: total,
    };
    return paged;
  }


   /**
   * Route + date key: `originDistrict|destinationDistrict|YYYY-MM-DD`.
   * Every address in the same town collapses to one district token, so a
   * passenger's exact house address never affects grouping — only the district
   * (e.g. Ekpoma → Benin City) does.
   */
  private routeDateKey(origin: string, destination: string, date: string): string {
    return `${this.locationToken(origin)}|${this.locationToken(destination)}|${date}`;
  }

  /**
   * Full grouping key: route + date + preferred time slot. Adding the slot
   * means a MORNING request and an AFTERNOON request on the same route/date
   * fall into DIFFERENT pools, while two morning requests share one. Requests
   * with no chosen slot use the 'any' bucket.
   */
  private matchKey(
    origin: string,
    destination: string,
    date: string,
    slot: string,
  ): string {
    return `${this.routeDateKey(origin, destination, date)}|${slot}`;
  }

  /** Build the full grouping key for a passenger request. */
  private requestMatchKey(req: TripRequest): string {
    return this.matchKey(
      req.origin,
      req.destination,
      req.requestedDate,
      this.requestSlot(req),
    );
  }

  /** The time-slot bucket a request belongs to ('morning'/'afternoon'/… or 'any'). */
  private requestSlot(req: TripRequest): string {
    const slot = req.metadata?.preferredSlot as PreferredTime | undefined;
    return slot ?? 'any';
  }

  /**
   * Map a concrete clock time (a driver's trip departure time) to a slot bucket,
   * so a created trip only auto-matches passengers who asked for that part of
   * the day. Returns null when the time can't be parsed — callers then match
   * every slot on the route/date rather than dropping anyone.
   */
  private slotForClock(time?: string | null): string | null {
    const hhmm = this.normalizeTime(time);
    if (!hhmm) return null;
    const hour = Number(hhmm.slice(0, 2));
    if (hour >= 5 && hour < 12) return PreferredTime.MORNING;
    if (hour >= 12 && hour < 17) return PreferredTime.AFTERNOON;
    if (hour >= 17 && hour < 21) return PreferredTime.EVENING;
    return null;
  }

  /** Normalise a free-text location to its district token for grouping. */
  private locationToken(value: string): string {
    return districtToken(value);
  }



    /**
   * Expire individual trip requests whose requested date + departure time has
   * passed while they are still active (PENDING, or APPROVED but never booked).
   * BOOKED / FULFILLED / DECLINED / already-EXPIRED requests are left alone.
   *
   * When a request carries no usable time-of-day we fall back to the END of the
   * requested day, so a same-day request without a stated time is not expired
   * prematurely. The passenger is notified (best-effort) only when the request
   * expired recently, so a one-off pass over a backlog of old requests never
   * blasts historical users with push notifications.
   */
  async expireStaleRequests(): Promise<{ expired: number }> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // Coarse DB filter: only requests on/before today still in an active state.
    // Exact time-of-day is refined in memory below (requestedDate is a date).
    const candidates = await this.requestRepo.find({
      where: {
        status: In([TripRequestStatus.PENDING, TripRequestStatus.APPROVED]),
        requestedDate: LessThanOrEqual(today),
      },
    });
    if (!candidates.length) return { expired: 0 };

    const departureOf = (req: TripRequest): Date => {
      const time = this.slotDepartureTime(req) ?? '23:59:59';
      const at = new Date(`${req.requestedDate}T${time}`);
      return Number.isNaN(at.getTime())
        ? new Date(`${req.requestedDate}T23:59:59`)
        : at;
    };

    const stale = candidates.filter((req) => {
      const at = departureOf(req);
      return !Number.isNaN(at.getTime()) && at <= now;
    });
    if (!stale.length) return { expired: 0 };

    // Only notify for requests that lapsed within the last 48h — keeps a first
    // run over historical data from spamming everyone.
    const notifyCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    for (const req of stale) {
      req.status = TripRequestStatus.EXPIRED;
      req.processedAt = now;
      await this.requestRepo.save(req);

      if (departureOf(req) >= notifyCutoff) {
        try {
          await this.notificationService.notify({
            userId: req.requesterUserId,
            title: 'Trip request expired',
            body:
              `Your request for ${req.origin} → ${req.destination} on ` +
              `${req.requestedDate} has expired because the travel date passed.`,
            type: NotificationType.TRIP_REQUEST_EXPIRED,
            data: {
              tripRequestId: req.id,
              origin: req.origin,
              destination: req.destination,
              requestedDate: req.requestedDate,
            },
          });
        } catch (err) {
          this.logger.warn(
            `Failed to notify passenger ${req.requesterUserId} of expiry: ${err?.message}`,
          );
        }
      }
    }

    this.logger.log(`Expired ${stale.length} stale trip request(s).`);
    return { expired: stale.length };
  }
}

