import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, ILike, In, Repository } from 'typeorm';
import { Admin } from '@modules/core/entities/admin.entity';
import { User } from '@modules/core/entities/user.entity';
import { Driver } from '@modules/core/entities/driver.entity';
import { Trip } from '@modules/core/entities/trip.entity';
import { Booking } from '@modules/core/entities/booking.entity';
import { Payout } from '@modules/core/entities/payout.entity';
import { DocumentVerification } from '@modules/core/entities/document-verification.entity';
import { Coupon } from '@modules/core/entities/coupon.entity';
import { Passenger } from '@modules/core/entities/passenger.entity';
import { PaystackAdapter } from '@adapters/payment/paystack/paystack.adapter';
import {
  AdminNotificationActivityQuery,
  CouponStatus,
  CouponType,
  DocumentStatus,
  KycStatus,
  PayoutStatus,
  TripStatus,
  UserRole,
  UserStatus,
} from 'src/types/enums';
import { Role } from '@modules/core/entities/role.entity';
import { PagedDto } from '@shared/interface/paged.interface';
import { Agent } from '@modules/core/entities/agent.entity';
import { AddDriverDocumentsDto, UploadDriverDocumentDto } from '@modules/admin/dtos/adddoc.dto';
import { Beneficiary } from '@modules/core/entities/beneficiary.entity';
import { Vehicle } from '@modules/core/entities/vehicle.entity';
import { startOfDay, endOfDay, subDays, format,startOfMonth, endOfMonth, startOfYear, endOfYear} from 'date-fns';
import { Review } from '@modules/core/entities/review.entity';
import { AgentReferral } from '@modules/core/entities/agent-referral.entity';
import { Referral } from '@modules/core/entities/referal.entity';
import { AgentCommission } from '@modules/core/entities/agent-commission.entity';
import { NotificationService } from '@modules/notification/services/notification.service';
import { NotificationType } from 'src/types/enums';
import { Notification } from '@modules/core/entities/notification.entity';
import { Escrow } from '@modules/core/entities/escro.entity';
import { ExpoService } from '@modules/notification/services/expo.service';

@Injectable()
export class AdminRepository extends Repository<Admin> {
  constructor(
    @InjectRepository(Admin) private readonly adminRepository: Repository<Admin>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Driver) private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Trip) private readonly tripRepo: Repository<Trip>,
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Payout) private readonly payoutRepo: Repository<Payout>,
    @InjectRepository(DocumentVerification) private readonly docRepo: Repository<DocumentVerification>,
    @InjectRepository(Coupon) private readonly couponRepo: Repository<Coupon>,
    @InjectRepository(Passenger) private readonly passengerRepo: Repository<Passenger>,
    @InjectRepository(Agent) private readonly agentRepo: Repository<Agent>,
    @InjectRepository(Beneficiary) private readonly beneficiaryRepo: Repository<Beneficiary>,
    @InjectRepository(Vehicle) private readonly vehicleRepo: Repository<Vehicle>,
    @InjectRepository(Review) private readonly reviewRepo: Repository<Review>,
    @InjectRepository(Notification) private readonly notificationRepository: Repository<Notification>,    
    @InjectRepository(Escrow) private readonly escroRepository: Repository<Escrow>,    
    @InjectRepository(AgentReferral) private readonly agentReferralRepo: Repository<AgentReferral>,
    @InjectRepository(Referral) private readonly referralRepo: Repository<Referral>,
    @InjectRepository(AgentCommission) private readonly agentCommissionRepo: Repository<AgentCommission>,
    private readonly entityManager: EntityManager,
    private readonly paystackAdapter: PaystackAdapter,
    private readonly notificationService: NotificationService,
    private readonly expoService: ExpoService


  ) {
    super(adminRepository.target, adminRepository.manager, adminRepository.queryRunner);
  }

  async createAdmin(data: Partial<Admin>, entityManager?: EntityManager): Promise<Admin> {
    const manager = entityManager || this.entityManager;
    const user = manager.create(Admin, data);
    return manager.save(Admin, user);
  }

  async getProfile(id: string) {
      const admin = await this.adminRepository.findOne({
        where: { id },
      });
      if (!admin) throw new NotFoundException('Admin profile not found');
      return admin;
    }

  async findByEmail(email: string): Promise<Admin> {
    return this.findOne({ where: { email: email.toLowerCase() } });
  }

  async updateUser(id: string, data: Partial<Admin>, entityManager?: EntityManager): Promise<Admin> {
    const manager = entityManager || this.entityManager;
    await manager.update(Admin, id, data);
    return manager.findOne(Admin, { where: { id } });
  }

  async getOverviews() {


  const [activeTrips, upcomingTrips, completedTrips, cancelledTrips] = await Promise.all([
    this.tripRepo.count({
      where: {
        status: TripStatus.ACTIVE as any,
      },
    }),
    this.tripRepo.count({
      where: {
        status: TripStatus.PENDING as any,
      },
    }),
    this.tripRepo.count({
      where: {
        status: TripStatus.COMPLETED as any,
      },
    }),
    this.tripRepo.count({
      where: {
        status: TripStatus.CANCELLED as any,
      },
    }),
  ]);

  return {
    active_trips: activeTrips,
    upcoming_trips: upcomingTrips,
    completed_trips: completedTrips,
    cancelled_trips: cancelledTrips,
  };
}


async noVehicleUploaded(): Promise<number> {
  return this.driverRepo
    .createQueryBuilder('driver')
    .leftJoin('driver.vehicles', 'vehicle')
    .leftJoin(
      DocumentVerification,
      'doc',
      'doc.driverId = driver.id AND doc.deletedAt IS NULL',
    )
    .where('vehicle.id IS NULL')
    .andWhere('doc.id IS NULL')
    .getCount();
}



async getPassengers(query: {
  page?: number;
  limit?: number;
  search?: string;
  kycStatus?: string;
  status?: string;
}): Promise<PagedDto<any>> {
  const { page = 1, limit = 20, search, kycStatus, status } = query;
  const skip = (page - 1) * limit;

  const qb = this.passengerRepo
    .createQueryBuilder('passenger')
    .leftJoinAndSelect('passenger.user', 'user')
    .where('passenger.deletedAt IS NULL');

if (search) {
  qb.andWhere(
    `("user"."firstName" ILIKE :search
      OR "user"."lastName" ILIKE :search
      OR "user"."email" ILIKE :search
      OR "user"."phone" ILIKE :search)`,
    { search: `%${search}%` },
  );
}

  if (status) {
    qb.andWhere('user.status = :status', { status });
  }

  if (kycStatus) {
    qb.andWhere('passenger.kycStatus = :kycStatus', { kycStatus });
  }

  qb.orderBy('passenger.createdAt', 'DESC').skip(skip).take(limit);

  const [data, total] = await qb.getManyAndCount();

  const pagedDto = new PagedDto();
  pagedDto.data = data;
  pagedDto.meta = {
    page,
    limit,
    count: data.length,
    previousPage: page > 1 ? page - 1 : false,
    nextPage: skip + limit < total ? page + 1 : false,
    pageCount: Math.ceil(total / limit),
    totalRecords: total,
  };
  return pagedDto;
}

 // ─── Revenue (gross passenger payments) for the selected period ────────────
async getRevenue(filter: 'daily' | 'monthly' | 'yearly' = 'monthly') {
  const { start, end } = this.getReportRange(filter);

  // Total for the SELECTED period (was hardcoded to last 7 days before)
  const totalResult = await this.bookingRepo
    .createQueryBuilder('b')
    .select('COALESCE(SUM(b.amountPaid), 0)', 'total')
    .where('b.paymentStatus = :s', { s: 'success' })
    .andWhere('b.createdAt BETWEEN :start AND :end', { start, end })
    .getRawOne();

  // Trend line across ALL time at the chosen granularity, so the graph is useful
  const groupExpr =
    filter === 'yearly' ? "TO_CHAR(b.createdAt, 'YYYY')"
    : filter === 'daily' ? "TO_CHAR(b.createdAt, 'YYYY-MM-DD')"
    : "TO_CHAR(b.createdAt, 'YYYY-MM')";

  const graph = await this.bookingRepo
    .createQueryBuilder('b')
    .select(groupExpr, 'period')
    .addSelect('COALESCE(SUM(b.amountPaid), 0)', 'total')
    .where('b.paymentStatus = :s', { s: 'success' })
    .groupBy('period')
    .orderBy('period', 'ASC')
    .getRawMany();

  return {
    // amountPaid is decimal(10,2) → already naira. NO /100.
    total_revenue: Number(totalResult?.total ?? 0),
    graph_data: graph.map((g) => ({
      period: g.period,
      revenue: Number(g.total ?? 0),
    })),
  };
}

async getApprovedDriversCount(): Promise<number> {
  return this.driverRepo
    .createQueryBuilder('driver')
    .innerJoin('driver.user', 'user')
    .innerJoin('driver.vehicles', 'vehicle')
    .where('vehicle.verificationStatus = :docStatus', {
      docStatus: DocumentStatus.APPROVED,
    })
    .andWhere('vehicle.registrationDoc IS NOT NULL')
    .andWhere('user.status = :userStatus', { userStatus: UserStatus.ACTIVE })
    .getCount();
}

async getDrivers(query: {
  page?: number;
  limit?: number;
  search?: string;
  kycStatus?: string;
  status?: string;
}): Promise<PagedDto<any>> {
  const { page = 1, limit = 20, search, kycStatus, status } = query;
  const skip = (page - 1) * limit;

  const qb = this.driverRepo
    .createQueryBuilder('driver')
    .leftJoinAndSelect('driver.user', 'user')
    .leftJoinAndSelect('driver.vehicle', 'vehicle') // 👈 hydrate the vehicle so verificationStatus reaches the admin list
    .where('driver.deletedAt IS NULL')
    .orderBy('driver.createdAt', 'DESC')
    .skip(skip)
    .take(limit);

  if (kycStatus) {
    qb.andWhere('driver.kycStatus = :kycStatus', { kycStatus });
  }

  if (status) {
    qb.andWhere('driver.status = :status', { status });
  }

  if (search) {
    qb.andWhere(
      '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.phone ILIKE :search)',
      { search: `%${search}%` },
    );
  }

  const [data, total] = await qb.getManyAndCount();

  const pagedDto = new PagedDto();
  pagedDto.data = data;
  pagedDto.meta = {
    page,
    limit,
    count: data.length,
    previousPage: page > 1 ? page - 1 : false,
    nextPage: skip + limit < total ? page + 1 : false,
    pageCount: Math.ceil(total / limit),
    totalRecords: total,
  };
  return pagedDto;
}
async getDriverById(id: string) {
  try {
    const driver = await this.driverRepo.findOne({
      where: { id },
      relations: ['user', 'vehicles'],
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const [tripHistory, tripCount] = await this.tripRepo.findAndCount({
      where: { driverId: id },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    return {
      ...driver,
      tripHistory,
      tripCount,
    };
  } catch (e) {
    console.error('getDriverById error:', e?.message, e?.stack);
    throw e;
  }
}


async getAgents(query: {
  page?: number;
  limit?: number;
  search?: string;
} = {}): Promise<PagedDto<any>> {
  const { page = 1, limit = 10, search } = query ?? {};
  const skip = (page - 1) * limit;

  const qb = this.agentRepo
    .createQueryBuilder('agent')
    .leftJoinAndSelect('agent.user', 'user')   // 👈 join + hydrate the user relation
    .where('agent.deletedAt IS NULL')
    .orderBy('agent.createdAt', 'DESC')
    .skip(skip)
    .take(limit);

  if (search) {
    qb.andWhere(
      '(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search)',
      { search: `%${search}%` },
    );
  }

  const [data, total] = await qb.getManyAndCount();

  const pagedDto = new PagedDto();
  pagedDto.data = data;
  pagedDto.meta = {
    page,
    limit,
    count: data.length,
    previousPage: page > 1 ? page - 1 : false,
    nextPage: skip + limit < total ? page + 1 : false,
    pageCount: Math.ceil(total / limit),
    totalRecords: total,
  };
  return pagedDto;
}
async getDriverVehicle(driverId: string) {
  try {
    const vehicles = await this.vehicleRepo.find({
      where: { driverId },
      order: { createdAt: 'DESC' }, // optional, but usually nice to have
    });
    return vehicles;
  } catch (e) {
    // log it properly instead of swallowing
    throw e;
  }
}

async getPassengerById(id: string){
  const passenger = await this.passengerRepo.findOne({
    where: { id },
    relations: ['user'],
  });
  if (!passenger) throw new NotFoundException('passenger not found');
  return passenger;
}



async getAgentById(id: string) {
  // 1. The agent + its user
  const agent = await this.agentRepo.findOne({
    where: { id },
    relations: { user: true },
  });
  if (!agent) throw new NotFoundException('Agent not found');

  // 2. Fetch the related collections in parallel
  const [agent_referrals, withdrawal_request, refferals, commissions] =
    await Promise.all([
      // agent_referrals — direct on agentId
      this.agentReferralRepo.find({
        where: { agentId: id },
        relations: { driver: true },
        order: { createdAt: 'DESC' },
      }),

      // withdrawal_request — payouts on agentId
      this.payoutRepo.find({
        where: { agentId: id },
        order: { createdAt: 'DESC' },
      }),

      // refferals — these belong to the agent's USER, not the agent
      this.referralRepo.find({
        where: { referrerId: agent.userId },
        relations: { referredUser: true },
        order: { createdAt: 'DESC' },
      }),

      // commissions — used to build earning_overview
      this.agentCommissionRepo.find({ where: { agentId: id } }),
    ]);

  // 3. Build earning_overview (object) from commission rows
  const toNum = (v: any) => Number(v) || 0;
  const earning_overview = {
    totalCommission: commissions.reduce((s, c) => s + toNum(c.commissionAmount), 0),
    releasedCommission: commissions
      .filter((c) => c.status === 'released')
      .reduce((s, c) => s + toNum(c.commissionAmount), 0),
    pendingCommission: commissions
      .filter((c) => c.status === 'pending')
      .reduce((s, c) => s + toNum(c.commissionAmount), 0),
    currentBalance: toNum(agent.currentBalance),
    totalReferrals: agent.totalReferrals,
    totalWithdrawals: withdrawal_request.reduce((s, p) => s + toNum(p.amount), 0),
  };

  // 4. Assemble the exact shape the frontend reads
  return {
    ...agent,
    agent_referrals,
    refferals,          // note: matches the frontend's spelling exactly
    earning_overview,
    withdrawal_request,
  };
}

async getAgentWithDetails(id: string) {
  const agent = await this.agentRepo.findOne({
    where: { id },
    relations: ['referrals', 'payouts'],
  });
  if (!agent) throw new NotFoundException('Agent not found');

   const payouts = await this.payoutRepo.find({
    where: { agentId: id },
    order: { createdAt: 'DESC' },
  });

   const referrals = await this.userRepo.find({
    where: { referredBy: id },
  });

 const totalPaid = payouts
    .filter((p) => p.status === PayoutStatus.APPROVED)
    .reduce((sum, p) => sum + (Number(p.amount) ?? 0), 0);

  const totalEarned = Number(agent.totalCommission ?? 0); 

  return {
    profile: agent,
    total_referrals: agent.totalReferrals, 
    earning_overview: {
      total_earnings: totalEarned,
      payment_processed: totalPaid,
      pending_payment: totalEarned - totalPaid,
    },
    withdrawal_requests: payouts.map((p) => ({
      amount: p.amount,
      status: p.status,
      date: p.createdAt,
    })),
  };
}

async getAgentReferrals(agentId: string, query: { page?: number; limit?: number }) {
  const { page = 1, limit = 15 } = query;
  const skip = (page - 1) * limit;

  const agent = await this.agentRepo.findOne({ where: { id: agentId } });
  if (!agent) throw new NotFoundException('Agent not found');

  const [referrals, total] = await this.userRepo.findAndCount({
    where: { referredBy: agentId },
    skip,
    take: limit,
    order: { createdAt: 'DESC' },
  });

  const data = referrals.map((ref) => ({
    id: ref.id,
    name: `${ref.firstName} ${ref.lastName}`,
    email: ref.email,
    phone_number: ref.phone,
    status: ref.status,
    date_referred: ref.createdAt,
    profile_image: ref.profileImage,
  }));

  const pagedDto = new PagedDto();
  pagedDto.data = data;
  pagedDto.meta = {
    page,
    limit,
    count: data.length,
    previousPage: page > 1 ? page - 1 : false,
    nextPage: skip + limit < total ? page + 1 : false,
    pageCount: Math.ceil(total / limit),
    totalRecords: total,
  };
  return pagedDto;
}

async toggleAgentStatus(id: string) {
  const agent = await this.agentRepo.findOne({ where: { id } });
  if (!agent) throw new NotFoundException('Agent not found');
  agent.status = agent.status === UserStatus.ACTIVE ? UserStatus.SUSPENDED : UserStatus.ACTIVE;
  return this.agentRepo.save(agent);
}

/** Admin approves a pending agent — this is the gate that unblocks agent login. */

async approveAgent(id: string) {
  const agent = await this.agentRepo.findOne({ where: { id }, relations: ['user'] });
  if (!agent) throw new NotFoundException('Agent not found');
  if (agent.status !== UserStatus.PENDING)
    throw new BadRequestException(`Only pending agents can be approved (current status: ${agent.status})`);

  agent.status = UserStatus.ACTIVE;
  await this.agentRepo.save(agent);

  if (agent.user) {
    agent.user.status = UserStatus.ACTIVE;
    await this.userRepo.save(agent.user);
  }

  if (agent.user?.id) {
    await this.notificationService.notify({
      userId: agent.user.id,
      title: 'Agent Account Approved',
      body: 'Your agent account has been approved. You can now log in.',
      type: NotificationType.BROADCAST,
      data: { agentId: agent.id },
    });
  }

  return agent;
}

/** Admin rejects/suspends a pending (or active) agent, with an optional reason. */
async rejectAgent(id: string, reason?: string) {
  const agent = await this.agentRepo.findOne({ where: { id }, relations: ['user'] });
  if (!agent) throw new NotFoundException('Agent not found');

  agent.status = UserStatus.SUSPENDED;
  await this.agentRepo.save(agent);

  if (agent.user?.id) {
    await this.notificationService.notify({
      userId: agent.user.id,
      title: 'Agent Account Not Approved',
      body: reason
        ? `Your agent account application was declined: ${reason}`
        : 'Your agent account application was declined.',
      type: NotificationType.BROADCAST,
      data: { agentId: agent.id, reason },
    });
  }

  return agent;
}

async togglePassengerStatus(id: string) {
  const passenger = await this.passengerRepo.findOne({
    where: { id },
    relations: ['user'],
  });
  if (!passenger) throw new NotFoundException('Passenger not found');
  passenger.user.status =
    passenger.user.status === UserStatus.ACTIVE ? UserStatus.SUSPENDED : UserStatus.ACTIVE;
  return this.userRepo.save(passenger.user);
}

async toggleDriverStatus(id: string) {
  const driver = await this.driverRepo.findOne({
    where: { id },
    relations: ['user'],
  });
  if (!driver) throw new NotFoundException('Driver not found');
  driver.user.status =
    driver.user.status === UserStatus.ACTIVE ? UserStatus.SUSPENDED : UserStatus.ACTIVE;
  return this.userRepo.save(driver.user);
}

async getPassengerWithDetails(id: string, query: { page?: number; limit?: number } = {}) {
  const { page = 1, limit = 10 } = query;
  const skip = (page - 1) * limit;

  const passenger = await this.passengerRepo.findOne({
    where: { id },
    relations: ['user'],
  });
  if (!passenger) throw new NotFoundException('Passenger not found');

  const [tripHistory, tripTotal] = await this.bookingRepo.findAndCount({
    where: { passengerId: passenger.id },
    relations: ['trip'],
    skip,
    take: limit,
    order: { createdAt: 'DESC' },
  });

  const [referrals, referralTotal] = await this.userRepo.findAndCount({
    where: { referredBy: passenger.user.id },
    skip,
    take: limit,
    order: { createdAt: 'DESC' },
  });

  return {
    profile: passenger,
    next_of_kin: {
      name: passenger.nxt_kin_name,
      relationship: passenger.nxt_kin_relationship,
      phone_number: passenger.nxt_kin_telephone,
    },
    referrals: {
      data: referrals.map((r) => ({
        name: `${r.firstName} ${r.lastName}`,
        email: r.email,
        phone_number: r.phone,
        status: r.status,
        date_referred: r.createdAt,
        profile_image: r.profileImage,
      })),
      meta: { page, limit, totalRecords: referralTotal },
    },
    trip_history: {
      data: tripHistory.map((b) => ({
        trip_id: b.id,
        departure_location: b.trip?.departureLocation,
        arrival_location: b.trip?.arrivalDestination,
        departure_date: b.trip?.departureDate,
        departure_time: b.trip?.departureTime,
        arrival_date: b.trip?.arrivalDate,
        arrival_time: b.trip?.arrivalTime,
        amount: (b.amountPaid ?? 0) / 100,
        status: b.status,
      })),
      meta: { page, limit, totalRecords: tripTotal },
    },
  };
}

async getDriverWithDetails(id: string, query: { page?: number; limit?: number } = {}) {
  const { page = 1, limit = 10 } = query;
  const skip = (page - 1) * limit;

  const driver = await this.driverRepo.findOne({
    where: { id },
    relations: ['user', 'vehicles', 'beneficiaries'],
  });
  if (!driver) throw new NotFoundException('Driver not found');

  const reviews = await this.reviewRepo.find({
    where: { driverId: id, isVisible: true },
    relations: ['passenger.user'],
    order: { createdAt: 'DESC' },
  });

  const [tripHistory, tripTotal] = await this.tripRepo.findAndCount({
    where: { driverId: driver.id },
    skip,
    take: limit,
    order: { createdAt: 'DESC' },
  });

  return {
    profile: driver,
    vehicle: driver.vehicle,  
    rating_summary: {
      average: Number(driver.averageRating),
      count: driver.ratingCount,
    },
    reviews: reviews.map((r) => ({
      passenger: `${r.passenger?.user?.firstName ?? ''} ${r.passenger?.user?.lastName ?? ''}`.trim(),
      profile_image: r.passenger?.user?.profileImage,
      date: r.createdAt,
      rating: r.rating,
      comment: r.comment,
    })),
    trip_history: {
      data: tripHistory.map((t) => ({
        trip_id: t.id,
        departure_location: t.departureLocation,
        arrival_location: t.arrivalDestination,
        departure_date: t.departureDate,
        departure_time: t.departureTime,
        arrival_date: t.arrivalDate,
        arrival_time: t.arrivalTime,
        status: t.status,
      })),
      meta: { page, limit, totalRecords: tripTotal },
    },
  };
}

async getTripWithPassengers(tripId: string, query: { page?: number; limit?: number } = {}) {
  const { page = 1, limit = 10 } = query;
  const skip = (page - 1) * limit;

  const trip = await this.tripRepo.findOne({
    where: { id: tripId },
    relations: ['driver.user', 'vehicle.driver'],
  });
  if (!trip) throw new NotFoundException('Trip not found');

  const [bookings, total] = await this.bookingRepo.findAndCount({
    where: { tripId },
    relations: ['passenger.user'],
    skip,
    take: limit,
    order: { createdAt: 'DESC' },
  });

  const pagedDto = new PagedDto();
  pagedDto.data = bookings.map((b) => ({
    id: b.id,
    tracking_id: b.couponCode,
    ticket_number: b.ticketToken,
    profile_image: b.passenger?.user?.profileImage,
    name: `${b.passenger?.user?.firstName} ${b.passenger?.user?.lastName}`,
    email: b.passenger?.user?.email,
    phone_number: b.passenger?.user?.phone,
    status: b.status,
    amount: (b.amountPaid ?? 0) / 100,
    created_at: b.createdAt,
  }));
  pagedDto.meta = {
    page,
    limit,
    count: bookings.length,
    previousPage: page > 1 ? page - 1 : false,
    nextPage: skip + limit < total ? page + 1 : false,
    pageCount: Math.ceil(total / limit),
    totalRecords: total,
  };

  return {
    trip_details: trip,
    passengers: pagedDto,
  };
}

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  async getDashboardStats(query: { page?: number; limit?: number } = {}) {
  const { page = 1, limit = 20 } = query;
  const skip = (page - 1) * limit;

  // Run all counts + overviews + revenue in parallel
  const [
    totalUsers,
    totalDrivers,
    totalPassengers,
    totalTrips,
    totalBookings,
    pendingPayouts,
    pendingDocuments,
    totalAgents,
    overviews,
    revenue,
  ] = await Promise.all([
    this.userRepo.count({ where: { deletedAt: null } }),
    this.driverRepo.count({ where: { deletedAt: null } }),
    this.passengerRepo.count({ where: { deletedAt: null } }),
    this.tripRepo.count({ where: { deletedAt: null } }),
    this.bookingRepo.count({ where: { deletedAt: null } }),
    this.payoutRepo.count({ where: { status: PayoutStatus.PENDING } }),
    this.docRepo.count({ where: { status: DocumentStatus.PENDING } }),
    this.agentRepo.count({ where: { deletedAt: null } }),
    this.getOverviews(),   // today's trip counts by status
    this.getRevenue(),     // 7-day daily revenue with graph
  ]);

  // paginated recent users
  const [recentUsers, recentUsersTotal] = await this.userRepo.findAndCount({
    where: { deletedAt: null },
    skip,
    take: limit,
    order: { createdAt: 'DESC' },
  });

  const [activeTrips, activeTripsTotal] = await this.tripRepo.findAndCount({
    where: { status: TripStatus.ACTIVE as any },
    relations: ['driver.user', 'vehicle'],
    skip,
    take: limit,
    order: { createdAt: 'DESC' },
  });

  const [completedTrips, completedTotal] = await this.tripRepo.findAndCount({
    where: { status: TripStatus.COMPLETED as any },
    relations: ['driver.user', 'vehicle'],
    skip,
    take: limit,
    order: { createdAt: 'DESC' },
  });

  return {
    users: {
      total: totalUsers,
      drivers: totalDrivers,
      passengers: totalPassengers,
      agents: totalAgents,
      recent: recentUsers,
      totalRecentUsers: recentUsersTotal,
    },
    trips: { total: totalTrips },
    bookings: { total: totalBookings },
    finance: {
      totalRevenue: revenue.total_revenue,  
      pendingPayouts,
    },
    revenue: {                             
      total: revenue.total_revenue,
      graph_data: revenue.graph_data,
    },
    overviews,                               
    kyc: { pendingDocuments },
    activeTrips: {
      data: activeTrips,
      meta: {
        page,
        limit,
        count: activeTrips.length,
        pageCount: Math.ceil(activeTripsTotal / limit),
        totalRecords: activeTripsTotal,
      },
    },
    completedTrips: {
      data: completedTrips,
      meta: {
        page,
        limit,
        count: completedTrips.length,
        pageCount: Math.ceil(completedTotal / limit),
        totalRecords: completedTotal,
      },
    },
  };
}
  

  // ─── User Management ─────────────────────────────────────────────────────────

  async listUsers(query: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
  }): Promise<PagedDto<any>> {
    const { page = 1, limit = 20, search, role } = query;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };
    if (search) where.email = ILike(`%${search}%`);
    if (role) where.role = role;

    const [data, total] = await this.userRepo.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const pagedDto = new PagedDto();
    pagedDto.data = data;
    pagedDto.meta = {
      page,
      limit,
      count: data.length,
      previousPage: page > 1 ? page - 1 : false,
      nextPage: skip + limit < total ? page + 1 : false,
      pageCount: Math.ceil(total / limit),
      totalRecords: total,
    };
    return pagedDto;
  }

  async getUser(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async suspendUser(id: string, reason?: string) {
    const user = await this.getUser(id);
    user.status = UserStatus.SUSPENDED;
    if (reason) user.metadata = { ...(user.metadata ?? {}), suspensionReason: reason };
    return this.userRepo.save(user);
  }

  async activateUser(id: string) {
    const user = await this.getUser(id);
    user.status = UserStatus.ACTIVE;
    return this.userRepo.save(user);
  }

    async activateDriver(id: string) {
    const user = await this.getDriverById(id);
    user.status = UserStatus.ACTIVE;
    return this.userRepo.save(user);
  }

  async getDriverDocumentHistory(driverId: string) {
  const driver = await this.driverRepo.findOne({ where: { id: driverId } });
  if (!driver) throw new NotFoundException('Driver not found');

  const documents = await this.docRepo.find({
    where: { driverId },
    order: { createdAt: 'DESC' },
  });

  return documents;
}
async fetchDriversDocuments(driverId: string) {
  const driver = await this.driverRepo.findOne({
    where: { id: driverId },
  });

  if (!driver) {
    throw new NotFoundException('Driver not found');
  }

  return driver.licenseData;
}

async deleteDriverDocumentHistory(driverId: string): Promise<{ message: string; deleted: number }> {
  const driver = await this.driverRepo.findOne({ where: { id: driverId } });
  if (!driver) throw new NotFoundException('Driver not found');

  const result = await this.docRepo.delete({ driverId });

  return {
    message: 'Driver document history deleted successfully',
    deleted: result.affected ?? 0,
  };
}



async updateDriverDocuments(
  documentId: string,
  data: Partial<DocumentVerification>,
): Promise<{ message: string; updated: number }> {
  const document = await this.docRepo.findOne({ where: { id: documentId } });
  if (!document) throw new NotFoundException('Document not found');

  return this.entityManager.transaction(async (manager) => {
    const result = await manager.update(DocumentVerification, { id: documentId }, data);

    const driver = await manager.findOne(Driver, { where: { id: document.driverId } });
    if (driver) {
      const licenseData = { ...(driver.licenseData ?? {}) };
      const existingDocs = { ...(licenseData.documents ?? {}) };
      existingDocs[document.documentType] = {
        ...(existingDocs[document.documentType] ?? {}),
        documentUrl: data.documentUrl ?? document.documentUrl,
        verificationData: data.verificationData ?? document.verificationData,
        status: data.status ?? document.status,
        rejectionReason: data.rejectionReason ?? document.rejectionReason ?? null,
        updatedAt: new Date().toISOString(),
      };
      licenseData.documents = existingDocs;
      await manager.update(Driver, { id: document.driverId }, { licenseData });
    }

    return {
      message: 'Driver document updated successfully',
      updated: result.affected ?? 0,
    };
  });
}

async addDriverDocuments(
  driverId: string,
  dto: UploadDriverDocumentDto,
  documentUrl: string,
): Promise<DocumentVerification | Vehicle> {

  switch (dto.documentType) {
    case 'insurance':
    case 'registration_doc':
    case 'vehicle': {
      if (!dto.vehicleId) {
        throw new BadRequestException(
          `vehicleId is required for documentType "${dto.documentType}"`,
        );
      }

      const vehicle = await this.vehicleRepo.findOne({
        where: { id: dto.vehicleId, driverId },
      });
      if (!vehicle) throw new NotFoundException('Vehicle not found for this driver');

      if (dto.documentType === 'insurance') {
        vehicle.insurance = documentUrl;
      } else if (dto.documentType === 'registration_doc') {
        vehicle.registrationDoc = documentUrl;
      } else {
        vehicle.vehiclePhoto = [...(vehicle.vehiclePhoto ?? []), documentUrl];
      }

      vehicle.verificationStatus = DocumentStatus.PENDING;
      vehicle.rejectionReason = null;

      return this.vehicleRepo.save(vehicle);
    }

    default: {
      // license / other → driver document
      return this.entityManager.transaction(async (manager) => {
        const document = manager.create(DocumentVerification, {
          driverId,
          documentType: dto.documentType,
          documentUrl,
          verificationData: dto.name ? { name: dto.name } : undefined,
          status: DocumentStatus.PENDING,
        });
        const saved = await manager.save(DocumentVerification, document);

        const driver = await manager.findOne(Driver, { where: { id: driverId } });
        const licenseData = { ...(driver.licenseData ?? {}) };
        const existingDocs = { ...(licenseData.documents ?? {}) };
        existingDocs[dto.documentType] = {
          documentUrl,
          verificationData: dto.name ? { name: dto.name } : undefined,
          status: DocumentStatus.PENDING,
          rejectionReason: null,
          updatedAt: new Date().toISOString(),
        };
        licenseData.documents = existingDocs;
        await manager.update(Driver, { id: driverId }, { licenseData });

        return saved;
      });
    }
  }
}

// ─── Vehicle Verification ───────────────────────────────────────────────────

  async listPendingVehicles(query: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<PagedDto<any>> {
    const { page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

    const qb = this.vehicleRepo
      .createQueryBuilder('vehicle')
      .leftJoinAndSelect('vehicle.driver', 'driver')
      .where('vehicle.verificationStatus = :status', { status: DocumentStatus.PENDING })
      .orderBy('vehicle.createdAt', 'ASC')
      .skip(skip)
      .take(limit);

    if (search) {
      qb.andWhere(
        '(driver.email ILIKE :search OR vehicle.plateNumber ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();

    const pagedDto = new PagedDto();
    pagedDto.data = data;
    pagedDto.meta = {
      page,
      limit,
      count: data.length,
      previousPage: page > 1 ? page - 1 : false,
      nextPage: skip + limit < total ? page + 1 : false,
      pageCount: Math.ceil(total / limit),
      totalRecords: total,
    };

    return pagedDto;
  }

  async approveVehicle(vehicleId: string, adminEmail: string) {
    const vehicle = await this.vehicleRepo.findOne({
      where: { id: vehicleId },
      relations: ['driver', 'driver.user'],
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (vehicle.verificationStatus === DocumentStatus.APPROVED) {
      throw new BadRequestException('Vehicle is already approved');
    }

    vehicle.verificationStatus = DocumentStatus.APPROVED;
    vehicle.isVerified = true;
    vehicle.rejectionReason = null;
    vehicle.updatedBy = adminEmail;
    const saved = await this.vehicleRepo.save(vehicle);

    const expoToken = vehicle.driver?.user?.expoToken;
    if (expoToken) {
      await this.expoService.sendPushNotification(
        expoToken,
        'Vehicle approved',
        `Your vehicle (${vehicle.plateNumber}) has been approved. You can now use it for trips.`,
        { driverId: vehicle.driverId },
      );
    }

    return saved;
  }

  async rejectVehicle(vehicleId: string, reason: string, adminEmail: string) {
    const vehicle = await this.vehicleRepo.findOne({
      where: { id: vehicleId },
      relations: ['driver', 'driver.user'],
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    vehicle.verificationStatus = DocumentStatus.REJECTED;
    vehicle.isVerified = false;
    vehicle.rejectionReason = reason;
    vehicle.updatedBy = adminEmail;
    const saved = await this.vehicleRepo.save(vehicle);

    const expoToken = vehicle.driver?.user?.expoToken;
    if (expoToken) {
      await this.expoService.sendPushNotification(
        expoToken,
        'Vehicle rejected',
        `Your vehicle (${vehicle.plateNumber}) was rejected: ${reason}`,
        { driverId: vehicle.driverId },
      );
    }

    return saved;
  }



  // ─── Driver / KYC Management ─────────────────────────────────────────────────

  async listPendingDocuments(query: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<PagedDto<any>>{

        const { page = 1, limit = 20, search } = query;
        const skip = (page - 1) * limit;

      const qb = this.docRepo
    .createQueryBuilder('doc')
    .leftJoinAndSelect('doc.driver', 'driver')
    .where('doc.status = :status', { status: DocumentStatus.PENDING })
    .orderBy('doc.createdAt', 'ASC')
    .skip(skip)
    .take(limit);

      if (search) {
    qb.andWhere('driver.email ILIKE :search', { search: `%${search}%` });
  }
  const [data, total] = await qb.getManyAndCount();

     const pagedDto = new PagedDto();
    pagedDto.data = data;
    pagedDto.meta = {
      page,
      limit,
      count: data.length,
      previousPage: page > 1 ? page - 1 : false,
      nextPage: skip + limit < total ? page + 1 : false,
      pageCount: Math.ceil(total / limit),
      totalRecords: total,
    };
    
    return pagedDto;
  }

  

   async approveDocument(docId: string, adminEmail: string) {
    const doc = await this.docRepo.findOne({
      where: { id: docId },
      relations: ['driver'],
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.status === DocumentStatus.APPROVED)
      throw new BadRequestException('Document is already approve');

    await this.entityManager.transaction(async (manager) => {
      doc.status = DocumentStatus.APPROVED;
      doc.updatedBy = adminEmail;
      await manager.save(DocumentVerification, doc);

      // Keep the licenseData.documents mirror (used by getProfile) in sync
      // with the review outcome, same as updateDriverDocuments does.
      const driverForMirror =
        doc.driver ?? (await manager.findOne(Driver, { where: { id: doc.driverId } }));
      if (driverForMirror) {
        const licenseData = { ...(driverForMirror.licenseData ?? {}) };
        const existingDocs = { ...(licenseData.documents ?? {}) };
        existingDocs[doc.documentType] = {
          ...(existingDocs[doc.documentType] ?? {}),
          documentUrl: doc.documentUrl,
          verificationData: doc.verificationData,
          status: DocumentStatus.APPROVED,
          rejectionReason: null,
          updatedAt: new Date().toISOString(),
        };
        licenseData.documents = existingDocs;
        await manager.update(Driver, { id: doc.driverId }, { licenseData });
      }

      // A license document approved through the admin review queue never
      // touched driver.licenseVerified before — that's the flag the driver
      // app actually reads (to gate trip creation and show "license
      // verified"), separate from the generic document_verifications row.
      // Keep it in sync here so admin approval has the same effect as the
      // automated Dojah verification flow.
      if (this.isLicenseDocumentType(doc.documentType)) {
        const driver = await manager.findOne(Driver, {
          where: { id: doc.driverId },
          relations: ['user'],
        });
        if (driver) {
          await manager.update(Driver, doc.driverId, {
            license: doc.documentUrl,
            licenseVerified: true,
            licenseVerifiedAt: new Date(),
          });
          if (driver.user?.expoToken) {
            await this.expoService.sendPushNotification(
              driver.user.expoToken,
              'Approved ',
              `Your document has been approved: ${doc.documentType}, ${driver.user.firstName}`,
              { userId: driver.id },
            );
          }
        }
      }
    });

    // Check if all required docs are approved → update driver KYC status
    await this.recalculateDriverKyc(doc.driverId);
    return doc;
  }

    private isLicenseDocumentType(documentType: string): boolean {
    const type = (documentType ?? '').toLowerCase();
    // The KYC/Dojah flow and the admin uploader both store the driver's
    // licence as documentType 'license'. The old list only had
    // 'driverLicense' (which could never match a lower-cased value) and the
    // Dojah field names, so admin approval never flipped licenseVerified.
    return [
      'license',
      'driverlicense',
      'document_front_side',
      'document_back_side',
    ].includes(type);
  }

   async rejectDocument(docId: string, reason: string, adminEmail: string) {
    const doc = await this.docRepo.findOne({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Document not found');

    doc.status = DocumentStatus.REJECTED;
    doc.rejectionReason = reason;
    doc.updatedBy = adminEmail;
    const saved = await this.docRepo.save(doc);

    // Load the driver (with user) once — the old code referenced driver.user
    // for the push notification without loading the relation, and outside the
    // null check, so any license rejection threw before returning.
    const driver = await this.driverRepo.findOne({
      where: { id: doc.driverId },
      relations: ['user'],
    });

    if (driver) {
      // Keep the licenseData.documents mirror (read by getProfile) in sync,
      // exactly like approveDocument does — otherwise the profile view still
      // shows the old status after a rejection.
      const licenseData = { ...(driver.licenseData ?? {}) };
      const existingDocs = { ...(licenseData.documents ?? {}) };
      existingDocs[doc.documentType] = {
        ...(existingDocs[doc.documentType] ?? {}),
        documentUrl: doc.documentUrl,
        verificationData: doc.verificationData,
        status: DocumentStatus.REJECTED,
        rejectionReason: reason,
        updatedAt: new Date().toISOString(),
      };
      licenseData.documents = existingDocs;

      const update: Record<string, any> = { licenseData };

      // Mirror finalizeLicenseRejected() so a manually-rejected licence also
      // flips the driver back to unverified instead of leaving a stale flag.
      if (this.isLicenseDocumentType(doc.documentType)) {
        update.licenseVerified = false;
        update.reason = reason;
      }

      await this.driverRepo.update(doc.driverId, update);

      if (driver.user?.expoToken) {
        await this.expoService.sendPushNotification(
          driver.user.expoToken,
          'Rejected',
          `${driver.user.firstName}, your document has been rejected: ${doc.documentType}`,
          { userId: driver.id },
        );
      }
    }

    return saved;
  }

  private async recalculateDriverKyc(driverId: string) {
    const allDocs = await this.docRepo.find({ where: { driverId } });
    const allApproved =
      allDocs.length > 0 && allDocs.every((d) => d.status === DocumentStatus.APPROVED);

    if (allApproved) {
      await this.driverRepo.update(driverId, { kycComplete: KycStatus.COMPLETED });
    }
  }

  // ─── Trip Management ─────────────────────────────────────────────────────────

  
async listTrips(query: { page?: number; limit?: number; status?: string }): Promise<PagedDto<any>> {
  const { page = 1, limit = 20, status } = query;
  const skip = (page - 1) * limit;
  const where: any = {};

  if (status) {
    // "past" is a category, not a stored status — expand it into the concrete
    // TripStatus values that represent a finished trip. Every real status
    // (including "upcoming", the literal value of PENDING) still filters
    // by exact match exactly as before.
    const categories: Record<string, TripStatus[]> = {
      past: [TripStatus.COMPLETED, TripStatus.CANCELLED, TripStatus.CLOSED],
    };

    where.status = categories[status] ? In(categories[status]) : status;
  }

  const [data, total] = await this.tripRepo.findAndCount({
    where,
    skip,
    take: limit,
    relations: ['driver.user'],
    order: { createdAt: 'DESC' },
  });

  const pagedDto = new PagedDto();
  pagedDto.data = data;
  pagedDto.meta = {
    page,
    limit,
    count: data.length,
    previousPage: page > 1 ? page - 1 : false,
    nextPage: skip + limit < total ? page + 1 : false,
    pageCount: Math.ceil(total / limit),
    totalRecords: total,
  };

  return pagedDto;
}

  

  async getTrip(id: string) {
    const trip = await this.tripRepo.findOne({
      where: { id },
      relations: ['driver.user', 'vehicle.driver'],
    });
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

     async deleteUser(id: string, adminId: string, reason?: string) {
    const user = await this.getUser(id);

    if (user.id === adminId) {
      throw new BadRequestException('You cannot delete your own account');
    }
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException('Admin accounts cannot be deleted here');
    }

    // Same safeguards as driver self-delete
    if (user.role === UserRole.DRIVER) {
      const driver = await this.driverRepo.findOne({ where: { userId: id } });
      if (driver) {
        const openTrip = await this.tripRepo.findOne({
          where: [
            { driverId: driver.id, status: TripStatus.PENDING },
            { driverId: driver.id, status: TripStatus.ACTIVE },
            { driverId: driver.id, status: TripStatus.STARTED },
          ],
        });
        if (openTrip) {
          throw new BadRequestException(
            'Driver has an upcoming or in-progress trip. Resolve it before deleting.',
          );
        }
        if (Number(driver.currentBalance) > 0) {
          throw new BadRequestException(
            'Driver has an outstanding wallet balance. Pay it out before deleting.',
          );
        }
      }
    }

    // save() instead of update(): the jsonb `metadata` column fails
    // TypeORM's strict _QueryDeepPartialEntity typing on update()
    user.deleteReason = reason ?? 'Deleted by admin';
    user.metadata = { ...(user.metadata ?? {}), deletedByAdminId: adminId };
    await this.userRepo.save(user);

    await this.userRepo.softDelete(id); // sets deletedAt, keeps the row

    return this.userRepo.findOne({ where: { id }, withDeleted: true });
  }
  // ─── Payout Management ───────────────────────────────────────────────────────

  async listPayouts(query: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<PagedDto<any>> {
    const { page = 1, limit = 20, status } = query;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;

    const [data, total] = await this.payoutRepo.findAndCount({
      where,
      skip,
      take: limit,
      relations: ['driver', 'driver.user'],
      order: { createdAt: 'DESC' },
    });

    const pagedDto = new PagedDto();
    pagedDto.data = data;
    pagedDto.meta = {
      page,
      limit,
      count: data.length,
      previousPage: page > 1 ? page - 1 : false,
      nextPage: skip + limit < total ? page + 1 : false,
      pageCount: Math.ceil(total / limit),
      totalRecords: total,
    };
    return pagedDto;

  }

  async approvePayout(payoutId: string, adminEmail: string) {
  const payout = await this.payoutRepo.findOne({
    where: { id: payoutId },
    relations: ['driver', 'beneficiary'],   // ← pull the beneficiary
  });
  if (!payout) throw new NotFoundException('Payout not found');
  if (payout.status !== PayoutStatus.PENDING)
    throw new BadRequestException('Payout is not pending');

  const beneficiary = payout.beneficiary;
  if (!beneficiary) throw new BadRequestException('No beneficiary attached to this payout');

  if (!beneficiary.bankName || !beneficiary.bankCode)
    throw new BadRequestException('Beneficiary bank details are missing');

  // 1. Reuse cached recipient, or create one
  let recipientCode = beneficiary.recipientCode;
  if (!recipientCode) {
    const created = await this.paystackAdapter.createTransferRecipient({
      name: beneficiary.bankName,
      account_number: beneficiary.accountNumber,
      bank_code: beneficiary.bankCode,
    });
    recipientCode = created.recipient_code;
    await this.beneficiaryRepo.update(beneficiary.id, { recipientCode });
  }

  // 2. Initiate transfer — all account data comes from the beneficiary
  const { transfer_code } = await this.paystackAdapter.initiatePayout({
    recipient_code: recipientCode,
    amount: payout.amount,
    reason: payout.reason || 'Payout',
    account_number: beneficiary.accountNumber,
    bank_code: beneficiary.bankCode,
  });

  // 3. Update the payout — only payout-level fields
  payout.status = PayoutStatus.PROCESSING;
  payout.recipientCode = recipientCode;
  payout.transferCode = transfer_code;
  payout.updatedBy = adminEmail;

  // 4. Deduct wallet (driver payouts only)
  if (payout.driverId) {
    await this.driverRepo.decrement({ id: payout.driverId }, 'walletBalance', payout.amount);
  }
  await this.expoService.sendPushNotification(payout.driver.user.expoToken, "Approved ", `Your payout has been approved: ${payout.amount}`, { userId: payout.driverId });

  return this.payoutRepo.save(payout);
}

  async declinePayout(payoutId: string, reason: string, adminEmail: string) {
    const payout = await this.payoutRepo.findOne({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== PayoutStatus.PENDING)
      throw new BadRequestException('Payout is not pending');

    payout.status = PayoutStatus.DECLINED;
    payout.reason = reason;
    payout.updatedBy = adminEmail;
    await this.expoService.sendPushNotification(payout.driver.user.expoToken, "Declined ", `Your payout has been declined: ${payout.amount}`, { userId: payout.driverId });
    return this.payoutRepo.save(payout);
  }

  // ─── Coupon Management ───────────────────────────────────────────────────────

  async createCoupon(dto: {
    code: string;
    type: CouponType;
    value: number;
    maxDiscount?: number;
    minOrderAmount?: number;
    usageLimit?: number;
    expiresAt?: string;
    adminId: number;
  }) {
    const existing = await this.couponRepo.findOne({ where: { code: dto.code.toUpperCase() } });
    if (existing) throw new BadRequestException('Coupon code already exists');

    const coupon = this.couponRepo.create({
      ...dto,
      code: dto.code.toUpperCase(),
      status: CouponStatus.ACTIVE,
      createdByAdminId: String(dto.adminId),
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });

    return this.couponRepo.save(coupon);
  }

  async deactivateCoupon(id: string) {
    const coupon = await this.couponRepo.findOne({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    coupon.isActive = false;
    coupon.status = CouponStatus.INACTIVE;
    return this.couponRepo.save(coupon);
  }

async listCoupons(query: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<PagedDto<any>> {
  const { page = 1, limit = 20, status } = query;
  const skip = (page - 1) * limit;
  const where: any = {};
  if (status) where.status = status;

  const [data, total] = await this.couponRepo.findAndCount({
    where,
    skip,
    take: limit,
    order: { createdAt: 'DESC' },
  });

      const pagedDto = new PagedDto();
    pagedDto.data = data;
    pagedDto.meta = {
      page,
      limit,
      count: data.length,
      previousPage: page > 1 ? page - 1 : false,
      nextPage: skip + limit < total ? page + 1 : false,
      pageCount: Math.ceil(total / limit),
      totalRecords: total,
    };
    return pagedDto; 
}

  // ─── Booking Management ──────────────────────────────────────────────────────

  async listBookings(query: { page?: number; limit?: number; status?: string }): Promise<PagedDto<any>> {
    const { page = 1, limit = 20, status } = query;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;

    const [data, total] = await this.bookingRepo.findAndCount({
      where,
      skip,
      take: limit,
      relations: ['trip', 'passenger', 'passenger.user'],
      order: { createdAt: 'DESC' },
    });

       const pagedDto = new PagedDto();
    pagedDto.data = data;
    pagedDto.meta = {
      page,
      limit,
      count: data.length,
      previousPage: page > 1 ? page - 1 : false,
      nextPage: skip + limit < total ? page + 1 : false,
      pageCount: Math.ceil(total / limit),
      totalRecords: total,
    };

    return pagedDto;
  }

  async refundBooking(bookingId: string, adminEmail: string) {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (!booking.paymentReference) throw new BadRequestException('No payment reference found');

    // Issue refund via Paystack
    await (this.paystackAdapter as any).initiateRefund(
      booking.paymentReference,
      booking.amountPaid,
    );

    booking.status = 'refunded' as any;
    booking.paymentStatus = 'refunded' as any;
    booking.updatedBy = adminEmail;
    return this.bookingRepo.save(booking);
  }

  reviewDocument(docId: string, approve: boolean, reason: string, email: string) {
    return approve ? this.approveDocument(docId, email) : this.rejectDocument(docId, reason, email);
  }

  getBooking(id: string) {
    return this.bookingRepo.findOne({
      where: { id },
      relations: ['trip', 'passenger', 'passenger.user'],
    });
  }

async findByIdWithPassword(adminId: string): Promise<Admin> {
  const admin = await this.adminRepository.findOne({
    where: { id: adminId },
    select: ['id', 'email', 'password'],
  });
  if (!admin) throw new NotFoundException('Admin not found');
  return admin;
}

async updatePassword(
  adminId: string,
  hashedPassword: string,
): Promise<{ message: string }> {
  await this.adminRepository.update(adminId, { password: hashedPassword });
  return { message: 'Password updated successfully' };
}



// ─── Financial ───────────────────────────────────────────────────────────────



async getFinancialReport(query: {
  page?: number;
  limit?: number;
  filter_by?: 'daily' | 'monthly' | 'yearly';
} = {}) {
  const { page = 1, limit = 50, filter_by = 'monthly' } = query;
  const skip = (page - 1) * limit;
  const { start, end } = this.getReportRange(filter_by);

  // SCALING NOTE:
  //  - bookings.amountPaid & escrow.platformFee are decimal(10,2) → treated as naira (no /100)
  //  - payouts.amount is stored in kobo → still /100 below
  // Confirm against a real DB row and flip if your data differs.

  // Pending withdrawals are point-in-time (current), so NOT date-filtered.
  const [
    totalAgentPendingWithdrawals,
    totalDriverPendingWithdrawals,
    totalPassengerPendingWithdrawals,
  ] = await Promise.all([
    this.payoutRepo.count({ where: { status: PayoutStatus.PENDING, payoutableType: 'agent' } }),
    this.payoutRepo.count({ where: { status: PayoutStatus.PENDING, payoutableType: 'driver' } }),
    this.payoutRepo.count({ where: { status: PayoutStatus.PENDING, payoutableType: 'passenger' } }),
  ]);

  const [agentAmountResult, driverAmountResult, passengerAmountResult] = await Promise.all([
    this.payoutRepo.createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'total')
      .where('p.status = :status', { status: PayoutStatus.PENDING })
      .andWhere('p.payoutableType = :type', { type: 'agent' }).getRawOne(),
    this.payoutRepo.createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'total')
      .where('p.status = :status', { status: PayoutStatus.PENDING })
      .andWhere('p.payoutableType = :type', { type: 'driver' }).getRawOne(),
    this.payoutRepo.createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'total')
      .where('p.status = :status', { status: PayoutStatus.PENDING })
      .andWhere('p.payoutableType = :type', { type: 'passenger' }).getRawOne(),
  ]);

  // Platform earnings for the SELECTED period (was all-time before → mismatched revenue).
  // Filter by releasedAt because the fee is realized when escrow is released.
  const platformEarningResult = await this.escroRepository
    .createQueryBuilder('e')
    .select('COALESCE(SUM(e.platformFee), 0)', 'total')
    .where('e.status = :s', { s: 'released' })
    .andWhere('e.releasedAt BETWEEN :start AND :end', { start, end })
    .getRawOne();

  // Live gateway balance — don't let a Paystack outage break the report.
  let gatewayBalance: { balance: number; currency: string } | null = null;
  try {
    gatewayBalance = await this.paystackAdapter.checkBalance();
  } catch {
    gatewayBalance = null;
  }

  const recentPayouts = await this.payoutRepo.find({
    relations: ['driver.user', 'agent.user', 'beneficiary'],
    order: { createdAt: 'DESC' },
    skip,
    take: limit,
  });

  const allPayouts = recentPayouts.map((p) => ({
    id: p.id,
    type: 'payout',
    amount: Number(p.amount ?? 0) / 100, // payouts stored in kobo
    status: p.status,
    reference: p.reference,
    transfer_code: p.transferCode,
    reason: p.reason,
    paid_to: p.driver?.user
      ? {
          id: p.driver.user.id,
          first_name: p.driver.user.firstName,
          last_name: p.driver.user.lastName,
          email: p.driver.user.email,
          phone: p.driver.user.phone,
          profile_image: p.driver.user.profileImage,
        }
      : p.agent?.user
        ? {
            id: p.agent.user.id,
            first_name: p.agent.user.firstName,
            last_name: p.agent.user.lastName,
            email: p.agent.user.email,
            phone: p.agent.user.phone,
            profile_image: p.agent.user.profileImage,
          }
        : null,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  }));

  const revenue = await this.getRevenue(filter_by);

  return {
    filter_by,
    period: { start, end },
    total_agent_pending_withdrawals: totalAgentPendingWithdrawals,
    total_driver_pending_withdrawals: totalDriverPendingWithdrawals,
    total_passenger_pending_withdrawals: totalPassengerPendingWithdrawals,
    // pending amounts: payouts are kobo → /100
    total_agent_pending_withdrawals_amount: Number(agentAmountResult?.total ?? 0) / 100,
    total_driver_pending_withdrawals_amount: Number(driverAmountResult?.total ?? 0) / 100,
    total_passenger_pending_withdrawals_amount: Number(passengerAmountResult?.total ?? 0) / 100,
    platform_earnings: Number(platformEarningResult?.total ?? 0), // decimal → naira, no /100
    all_payouts: allPayouts,
    revenue,
    gateway_balance: gatewayBalance?.balance ?? null,
    gateway_balance_currency: gatewayBalance?.currency ?? null,
    gateway_balance_available: gatewayBalance !== null,
  };
}

// ─── Revenue Graph (filter: daily | monthly | yearly) ─────────────────────

async getRevenueGraph(filter: 'daily' | 'monthly' | 'yearly' = 'monthly') {
  const now = new Date();

  const qb = this.bookingRepo
    .createQueryBuilder('b')
    .where('b.paymentStatus = :s', { s: 'success' });

  // Apply filter
  if (filter === 'daily') {
    qb.andWhere('DATE(b.createdAt) = CURRENT_DATE');
  } else if (filter === 'monthly') {
    qb.andWhere('EXTRACT(MONTH FROM b.createdAt) = :month', { month: now.getMonth() + 1 })
      .andWhere('EXTRACT(YEAR FROM b.createdAt) = :year', { year: now.getFullYear() });
  } else if (filter === 'yearly') {
    qb.andWhere('EXTRACT(YEAR FROM b.createdAt) = :year', { year: now.getFullYear() });
  }

  const totalRevenueResult = await qb
    .select('SUM(b.amountPaid)', 'total')
    .getRawOne();

  // Graph breakdown
  const graphSelect =
    filter === 'yearly'
      ? "TO_CHAR(b.createdAt, 'YYYY')"
      : filter === 'monthly'
        ? "TO_CHAR(b.createdAt, 'YYYY-MM')"
        : "TO_CHAR(b.createdAt, 'YYYY-MM-DD')";

  const graphData = await this.bookingRepo
    .createQueryBuilder('b')
    .select(graphSelect, 'period')
    .addSelect('SUM(b.amountPaid)', 'total')
    .where('b.paymentStatus = :s', { s: 'success' })
    .groupBy('period')
    .orderBy('period', 'ASC')
    .getRawMany();

  return {
    total_revenue: parseFloat(totalRevenueResult?.total ?? '0') / 100,
    revenue_graph: graphData.map((g) => ({
      period: g.period,
      total: parseFloat(g.total ?? '0') / 100,
    })),
  };
}

async getNotificationActivityForAdmin(
  query: AdminNotificationActivityQuery,
): Promise<PagedDto<any>> {
  const { page = 1, limit = 20, role, type, search, isRead, startDate, endDate } = query;
  const skip = (page - 1) * limit;

  const qb = this.notificationRepository.createQueryBuilder('notification')
    .leftJoin('notification.user', 'user')
    .leftJoin('notification.admin', 'admin')
    .select('notification.id', 'id')
    .addSelect('notification.title', 'title')
    .addSelect('notification.body', 'body')
    .addSelect('notification.type', 'type')
    .addSelect('notification.isRead', 'isRead')
    .addSelect('notification.createdAt', 'createdAt')
    .addSelect('user.id', 'userId')
    .addSelect('user.firstName', 'userFirstName')
    .addSelect('user.lastName', 'userLastName')
    .addSelect('user.email', 'userEmail')
    .addSelect('user.role', 'userRole')
    .addSelect('admin.id', 'adminId')
    .addSelect('admin.firstName', 'adminFirstName')
    .addSelect('admin.lastName', 'adminLastName')
    .orderBy('notification.createdAt', 'DESC')
    .addSelect('admin.role', 'adminRole')

  if (role) {
    qb.andWhere('user.role = :role', { role });
  }
  if (type) {
    qb.andWhere('notification.type = :type', { type });
  }
  if (typeof isRead === 'boolean') {
    qb.andWhere('notification.isRead = :isRead', { isRead });
  }
  if (search) {
    qb.andWhere(
      '(notification.title ILIKE :search OR notification.body ILIKE :search)',
      { search: `%${search}%` },
    );
  }
  if (startDate && endDate) {
    qb.andWhere('notification.createdAt BETWEEN :startDate AND :endDate', {
      startDate,
      endDate,
    });
  }

  const total = await qb.getCount();
  const raw = await qb.offset(skip).limit(limit).getRawMany();

  const data = raw.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type,
    isRead: row.isRead,
    createdAt: row.createdAt,
    recipient: row.userId
      ? {
          id: row.userId,
          name: `${row.userFirstName ?? ''} ${row.userLastName ?? ''}`.trim(),
          email: row.userEmail,
          role: row.userRole,
        }
      : row.adminId
        ? {
            id: row.adminId,
            name: `${row.adminFirstName ?? ''} ${row.adminLastName ?? ''}`.trim(),
            role: row.adminRole ?? UserRole.ADMIN,
          }
        : null,
  }));

const pageCount = Math.ceil(total / limit);
const previousPage = page > 1 ? page - 1 : null;
const nextPage = page < pageCount ? page + 1 : null;

return {
  data,
  meta: {
    page,
    limit,
    count: data.length,
    totalRecords: total,
    pageCount,
    previousPage,
    nextPage,
  },
};
}

// ─── Transaction History ──────────────────────────────────────────────────────

async getTransactionHistory(query: {
  page?: number;
  limit?: number;
  status?: string;
}) {
  const { page = 1, limit = 10, status } = query;
  const skip = (page - 1) * limit;

  const [data, total] = await this.payoutRepo.findAndCount({
    where: { status: PayoutStatus.APPROVED },
    relations: ['driver.user', 'agent.user', 'beneficiary'],
    skip,
    take: limit,
    order: { createdAt: 'DESC' },
  });

  const pagedDto = new PagedDto();
  pagedDto.data = data.map((p) => ({
    id: p.id,
    amount: Number(p.amount ?? 0) / 100,
    status: p.status,
    reference: p.reference,
    reason: p.reason,
    recipient: p.driver?.user
      ? `${p.driver.user.firstName} ${p.driver.user.lastName}`
      : p.agent?.user
        ? `${p.agent.user.firstName} ${p.agent.user.lastName}`
        : 'Unknown',
    created_at: p.createdAt,
  }));
  pagedDto.meta = {
    page,
    limit,
    count: data.length,
    previousPage: page > 1 ? page - 1 : false,
    nextPage: skip + limit < total ? page + 1 : false,
    pageCount: Math.ceil(total / limit),
    totalRecords: total,
  };

  return pagedDto;
}

// ─── Refund Requests ─────────────────────────────────────────────────────────

async getRefundRequests(query: {
  page?: number;
  limit?: number;
  type?: 'passenger' | 'driver';
  search?: string;
}) {
  const { page = 1, limit = 15, type, search } = query;
  const skip = (page - 1) * limit;

  const qb = this.payoutRepo
    .createQueryBuilder('p')
    .leftJoinAndSelect('p.driver', 'driver')
    .leftJoinAndSelect('driver.user', 'driverUser')
    .leftJoinAndSelect('p.beneficiary', 'beneficiary')
    .addSelect(
      'CASE WHEN p.status = :pendingStatus THEN 0 ELSE 1 END',
      'status_order',
    )
    .where('p.payoutableType != :agentType', { agentType: 'agent' }) // exclude agents
    .setParameter('pendingStatus', PayoutStatus.PENDING)
    .orderBy('status_order', 'ASC')
    .addOrderBy('p.createdAt', 'DESC')
    .skip(skip)
    .take(limit);

  if (type === 'passenger') {
    qb.andWhere('p.payoutableType = :type', { type: 'passenger' });
  } else if (type === 'driver') {
    qb.andWhere('p.payoutableType = :type', { type: 'driver' });
  }

  if (search) {
    qb.andWhere(
      '(p.reference ILIKE :search OR p.status ILIKE :search OR p.reason ILIKE :search)',
      { search: `%${search}%` },
    );
  }

  const [data, total] = await qb.getManyAndCount();

  const pagedDto = new PagedDto();
  pagedDto.data = data;
  pagedDto.meta = {
    page,
    limit,
    count: data.length,
    previousPage: page > 1 ? page - 1 : false,
    nextPage: skip + limit < total ? page + 1 : false,
    pageCount: Math.ceil(total / limit),
    totalRecords: total,
  };

  return pagedDto;
}

// ─── Drivers Earnings ─────────────────────────────────────────────────────────

async getDriversEarnings(query: {
  page?: number;
  limit?: number;
  search?: string;
}) {
  const { page = 1, limit = 10, search } = query;
  const skip = (page - 1) * limit;

  const qb = this.tripRepo
    .createQueryBuilder('trip')
    .leftJoinAndSelect('trip.driver', 'driver')
    .leftJoinAndSelect('driver.user', 'user')
    .leftJoinAndSelect('trip.vehicle', 'vehicle')
    .where('trip.status = :status', { status: TripStatus.COMPLETED })
    .orderBy('trip.createdAt', 'DESC')
    .skip(skip)
    .take(limit);

  if (search) {
    qb.andWhere(
      `(
        trip.departureLocation ILIKE :search OR
        trip.arrivalDestination ILIKE :search OR
        trip.departureDate::text ILIKE :search OR
        trip.status ILIKE :search OR
        user.firstName ILIKE :search OR
        user.lastName ILIKE :search OR
        user.email ILIKE :search 
      )`,
      { search: `%${search}%` },
    );
  }

  const [data, total] = await qb.getManyAndCount();

  // Calculate earnings per trip from bookings
  const tripsWithEarnings = await Promise.all(
    data.map(async (trip) => {
      const earningsResult = await this.bookingRepo
        .createQueryBuilder('b')
        .select("COALESCE(SUM((b.metadata->>'netDriverAmount')::numeric), 0)", 'total')
        .where('b.tripId = :tripId', { tripId: trip.id })
        .andWhere("(b.metadata->>'driverCredited')::boolean IS TRUE")
        .getRawOne();

      return {
        trip_id: trip.id,
        departure_location: trip.departureLocation,
        arrival_location: trip.arrivalDestination,
        departure_date: trip.departureDate,
        departure_time: trip.departureTime,
        arrival_date: trip.arrivalDate,
        arrival_time: trip.arrivalTime,
        status: trip.status,
        driver: trip.driver?.user
          ? {
              id: trip.driver.id,
              name: `${trip.driver.user.firstName} ${trip.driver.user.lastName}`,
              email: trip.driver.user.email,
              phone: trip.driver.user.phone,
            }
          : null,
        total_earned: parseFloat(earningsResult?.total ?? '0') / 100,
      };
    }),
  );

  const pagedDto = new PagedDto();
  pagedDto.data = tripsWithEarnings;
  pagedDto.meta = {
    page,
    limit,
    count: data.length,
    previousPage: page > 1 ? page - 1 : false,
    nextPage: skip + limit < total ? page + 1 : false,
    pageCount: Math.ceil(total / limit),
    totalRecords: total,
  };

  return pagedDto;
}

// ─── Agents Earnings ──────────────────────────────────────────────────────────

async getAgentsEarnings(query: { page?: number; limit?: number }) {
  const { page = 1, limit = 10 } = query;
  const skip = (page - 1) * limit;

  const [data, total] = await this.payoutRepo.findAndCount({
    where: { payoutableType: 'agent' },
    relations: ['agent.user', 'beneficiary'],
    skip,
    take: limit,
    order: { createdAt: 'DESC' },
  });

  const pagedDto = new PagedDto();
  pagedDto.data = data.map((p) => ({
    id: p.id,
    amount: Number(p.amount ?? 0) / 100,
    status: p.status,
    reference: p.reference,
    agent: p.agent?.user
      ? {
          id: p.agent.id,
          name: `${p.agent.user.firstName} ${p.agent.user.lastName}`,
          email: p.agent.user.email,
        }
      : null,
    created_at: p.createdAt,
  }));
  pagedDto.meta = {
    page,
    limit,
    count: data.length,
    previousPage: page > 1 ? page - 1 : false,
    nextPage: skip + limit < total ? page + 1 : false,
    pageCount: Math.ceil(total / limit),
    totalRecords: total,
  };

  return pagedDto;
}



private getReportRange(filter: 'daily' | 'monthly' | 'yearly' = 'monthly') {
  const now = new Date();
  if (filter === 'daily')  return { start: startOfDay(now),   end: endOfDay(now) };
  if (filter === 'yearly') return { start: startOfYear(now),  end: endOfYear(now) };
  return { start: startOfMonth(now), end: endOfMonth(now) }; // monthly (default)
}


}

// import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { EntityManager, ILike, In, Repository } from 'typeorm';
// import { Admin } from '@modules/core/entities/admin.entity';
// import { User } from '@modules/core/entities/user.entity';
// import { Driver } from '@modules/core/entities/driver.entity';
// import { Trip } from '@modules/core/entities/trip.entity';
// import { Booking } from '@modules/core/entities/booking.entity';
// import { Payout } from '@modules/core/entities/payout.entity';
// import { DocumentVerification } from '@modules/core/entities/document-verification.entity';
// import { Coupon } from '@modules/core/entities/coupon.entity';
// import { Passenger } from '@modules/core/entities/passenger.entity';
// import { PaystackAdapter } from '@adapters/payment/paystack/paystack.adapter';
// import {
//   AdminNotificationActivityQuery,
//   CouponStatus,
//   CouponType,
//   DocumentStatus,
//   KycStatus,
//   PayoutStatus,
//   TripStatus,
//   UserRole,
//   UserStatus,
// } from 'src/types/enums';
// import { Role } from '@modules/core/entities/role.entity';
// import { PagedDto } from '@shared/interface/paged.interface';
// import { Agent } from '@modules/core/entities/agent.entity';
// import { AddDriverDocumentsDto, UploadDriverDocumentDto } from '@modules/admin/dtos/adddoc.dto';
// import { Beneficiary } from '@modules/core/entities/beneficiary.entity';
// import { Vehicle } from '@modules/core/entities/vehicle.entity';
// import { startOfDay, endOfDay, subDays, format,startOfMonth, endOfMonth, startOfYear, endOfYear} from 'date-fns';
// import { Review } from '@modules/core/entities/review.entity';
// import { AgentReferral } from '@modules/core/entities/agent-referral.entity';
// import { Referral } from '@modules/core/entities/referal.entity';
// import { AgentCommission } from '@modules/core/entities/agent-commission.entity';
// import { NotificationService } from '@modules/notification/services/notification.service';
// import { NotificationType } from 'src/types/enums';
// import { Notification } from '@modules/core/entities/notification.entity';
// import { Escrow } from '@modules/core/entities/escro.entity';
// import { ExpoService } from '@modules/notification/services/expo.service';

// @Injectable()
// export class AdminRepository extends Repository<Admin> {
//   constructor(
//     @InjectRepository(Admin) private readonly adminRepository: Repository<Admin>,
//     @InjectRepository(User) private readonly userRepo: Repository<User>,
//     @InjectRepository(Driver) private readonly driverRepo: Repository<Driver>,
//     @InjectRepository(Trip) private readonly tripRepo: Repository<Trip>,
//     @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
//     @InjectRepository(Payout) private readonly payoutRepo: Repository<Payout>,
//     @InjectRepository(DocumentVerification) private readonly docRepo: Repository<DocumentVerification>,
//     @InjectRepository(Coupon) private readonly couponRepo: Repository<Coupon>,
//     @InjectRepository(Passenger) private readonly passengerRepo: Repository<Passenger>,
//     @InjectRepository(Agent) private readonly agentRepo: Repository<Agent>,
//     @InjectRepository(Beneficiary) private readonly beneficiaryRepo: Repository<Beneficiary>,
//     @InjectRepository(Vehicle) private readonly vehicleRepo: Repository<Vehicle>,
//     @InjectRepository(Review) private readonly reviewRepo: Repository<Review>,
//     @InjectRepository(Notification) private readonly notificationRepository: Repository<Notification>,    
//     @InjectRepository(Escrow) private readonly escroRepository: Repository<Escrow>,    
//     @InjectRepository(AgentReferral) private readonly agentReferralRepo: Repository<AgentReferral>,
//     @InjectRepository(Referral) private readonly referralRepo: Repository<Referral>,
//     @InjectRepository(AgentCommission) private readonly agentCommissionRepo: Repository<AgentCommission>,
//     private readonly entityManager: EntityManager,
//     private readonly paystackAdapter: PaystackAdapter,
//     private readonly notificationService: NotificationService,
//     private readonly expoService: ExpoService


//   ) {
//     super(adminRepository.target, adminRepository.manager, adminRepository.queryRunner);
//   }

//   async createAdmin(data: Partial<Admin>, entityManager?: EntityManager): Promise<Admin> {
//     const manager = entityManager || this.entityManager;
//     const user = manager.create(Admin, data);
//     return manager.save(Admin, user);
//   }

//   async getProfile(id: string) {
//       const admin = await this.adminRepository.findOne({
//         where: { id },
//       });
//       if (!admin) throw new NotFoundException('Admin profile not found');
//       return admin;
//     }

//   async findByEmail(email: string): Promise<Admin> {
//     return this.findOne({ where: { email: email.toLowerCase() } });
//   }

//   async updateUser(id: string, data: Partial<Admin>, entityManager?: EntityManager): Promise<Admin> {
//     const manager = entityManager || this.entityManager;
//     await manager.update(Admin, id, data);
//     return manager.findOne(Admin, { where: { id } });
//   }

//   async getOverviews() {


//   const [activeTrips, upcomingTrips, completedTrips, cancelledTrips] = await Promise.all([
//     this.tripRepo.count({
//       where: {
//         status: TripStatus.ACTIVE as any,
//       },
//     }),
//     this.tripRepo.count({
//       where: {
//         status: TripStatus.PENDING as any,
//       },
//     }),
//     this.tripRepo.count({
//       where: {
//         status: TripStatus.COMPLETED as any,
//       },
//     }),
//     this.tripRepo.count({
//       where: {
//         status: TripStatus.CANCELLED as any,
//       },
//     }),
//   ]);

//   return {
//     active_trips: activeTrips,
//     upcoming_trips: upcomingTrips,
//     completed_trips: completedTrips,
//     cancelled_trips: cancelledTrips,
//   };
// }


// async noVehicleUploaded(): Promise<number> {
//   return this.driverRepo
//     .createQueryBuilder('driver')
//     .leftJoin('driver.vehicles', 'vehicle')
//     .leftJoin(
//       DocumentVerification,
//       'doc',
//       'doc.driverId = driver.id AND doc.deletedAt IS NULL',
//     )
//     .where('vehicle.id IS NULL')
//     .andWhere('doc.id IS NULL')
//     .getCount();
// }



// async getPassengers(query: {
//   page?: number;
//   limit?: number;
//   search?: string;
//   kycStatus?: string;
//   status?: string;
// }): Promise<PagedDto<any>> {
//   const { page = 1, limit = 20, search, kycStatus, status } = query;
//   const skip = (page - 1) * limit;

//   const qb = this.passengerRepo
//     .createQueryBuilder('passenger')
//     .leftJoinAndSelect('passenger.user', 'user')
//     .where('passenger.deletedAt IS NULL');

// if (search) {
//   qb.andWhere(
//     `("user"."firstName" ILIKE :search
//       OR "user"."lastName" ILIKE :search
//       OR "user"."email" ILIKE :search
//       OR "user"."phone" ILIKE :search)`,
//     { search: `%${search}%` },
//   );
// }

//   if (status) {
//     qb.andWhere('user.status = :status', { status });
//   }

//   if (kycStatus) {
//     qb.andWhere('passenger.kycStatus = :kycStatus', { kycStatus });
//   }

//   qb.orderBy('passenger.createdAt', 'DESC').skip(skip).take(limit);

//   const [data, total] = await qb.getManyAndCount();

//   const pagedDto = new PagedDto();
//   pagedDto.data = data;
//   pagedDto.meta = {
//     page,
//     limit,
//     count: data.length,
//     previousPage: page > 1 ? page - 1 : false,
//     nextPage: skip + limit < total ? page + 1 : false,
//     pageCount: Math.ceil(total / limit),
//     totalRecords: total,
//   };
//   return pagedDto;
// }

//  // ─── Revenue (gross passenger payments) for the selected period ────────────
// async getRevenue(filter: 'daily' | 'monthly' | 'yearly' = 'monthly') {
//   const { start, end } = this.getReportRange(filter);

//   // Total for the SELECTED period (was hardcoded to last 7 days before)
//   const totalResult = await this.bookingRepo
//     .createQueryBuilder('b')
//     .select('COALESCE(SUM(b.amountPaid), 0)', 'total')
//     .where('b.paymentStatus = :s', { s: 'success' })
//     .andWhere('b.createdAt BETWEEN :start AND :end', { start, end })
//     .getRawOne();

//   // Trend line across ALL time at the chosen granularity, so the graph is useful
//   const groupExpr =
//     filter === 'yearly' ? "TO_CHAR(b.createdAt, 'YYYY')"
//     : filter === 'daily' ? "TO_CHAR(b.createdAt, 'YYYY-MM-DD')"
//     : "TO_CHAR(b.createdAt, 'YYYY-MM')";

//   const graph = await this.bookingRepo
//     .createQueryBuilder('b')
//     .select(groupExpr, 'period')
//     .addSelect('COALESCE(SUM(b.amountPaid), 0)', 'total')
//     .where('b.paymentStatus = :s', { s: 'success' })
//     .groupBy('period')
//     .orderBy('period', 'ASC')
//     .getRawMany();

//   return {
//     // amountPaid is decimal(10,2) → already naira. NO /100.
//     total_revenue: Number(totalResult?.total ?? 0),
//     graph_data: graph.map((g) => ({
//       period: g.period,
//       revenue: Number(g.total ?? 0),
//     })),
//   };
// }

// async getApprovedDriversCount(): Promise<number> {
//   return this.driverRepo
//     .createQueryBuilder('driver')
//     .innerJoin('driver.user', 'user')
//     .innerJoin('driver.vehicles', 'vehicle')
//     .where('vehicle.verificationStatus = :docStatus', {
//       docStatus: DocumentStatus.APPROVED,
//     })
//     .andWhere('vehicle.registrationDoc IS NOT NULL')
//     .andWhere('user.status = :userStatus', { userStatus: UserStatus.ACTIVE })
//     .getCount();
// }

// async getDrivers(query: {
//   page?: number;
//   limit?: number;
//   search?: string;
//   kycStatus?: string;
//   status?: string;
// }): Promise<PagedDto<any>> {
//   const { page = 1, limit = 20, search, kycStatus, status } = query;
//   const skip = (page - 1) * limit;

//   const qb = this.driverRepo
//     .createQueryBuilder('driver')
//     .leftJoinAndSelect('driver.user', 'user')
//     .leftJoinAndSelect('driver.vehicle', 'vehicle') // 👈 hydrate the vehicle so verificationStatus reaches the admin list
//     .where('driver.deletedAt IS NULL')
//     .orderBy('driver.createdAt', 'DESC')
//     .skip(skip)
//     .take(limit);

//   if (kycStatus) {
//     qb.andWhere('driver.kycStatus = :kycStatus', { kycStatus });
//   }

//   if (status) {
//     qb.andWhere('driver.status = :status', { status });
//   }

//   if (search) {
//     qb.andWhere(
//       '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.phone ILIKE :search)',
//       { search: `%${search}%` },
//     );
//   }

//   const [data, total] = await qb.getManyAndCount();

//   const pagedDto = new PagedDto();
//   pagedDto.data = data;
//   pagedDto.meta = {
//     page,
//     limit,
//     count: data.length,
//     previousPage: page > 1 ? page - 1 : false,
//     nextPage: skip + limit < total ? page + 1 : false,
//     pageCount: Math.ceil(total / limit),
//     totalRecords: total,
//   };
//   return pagedDto;
// }
// async getDriverById(id: string) {
//   try {
//     const driver = await this.driverRepo.findOne({
//       where: { id },
//       relations: ['user', 'vehicles'],
//     });

//     if (!driver) {
//       throw new NotFoundException('Driver not found');
//     }

//     const [tripHistory, tripCount] = await this.tripRepo.findAndCount({
//       where: { driverId: id },
//       order: { createdAt: 'DESC' },
//       take: 10,
//     });

//     return {
//       ...driver,
//       tripHistory,
//       tripCount,
//     };
//   } catch (e) {
//     console.error('getDriverById error:', e?.message, e?.stack);
//     throw e;
//   }
// }


// async getAgents(query: {
//   page?: number;
//   limit?: number;
//   search?: string;
// } = {}): Promise<PagedDto<any>> {
//   const { page = 1, limit = 10, search } = query ?? {};
//   const skip = (page - 1) * limit;

//   const qb = this.agentRepo
//     .createQueryBuilder('agent')
//     .leftJoinAndSelect('agent.user', 'user')   // 👈 join + hydrate the user relation
//     .where('agent.deletedAt IS NULL')
//     .orderBy('agent.createdAt', 'DESC')
//     .skip(skip)
//     .take(limit);

//   if (search) {
//     qb.andWhere(
//       '(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search)',
//       { search: `%${search}%` },
//     );
//   }

//   const [data, total] = await qb.getManyAndCount();

//   const pagedDto = new PagedDto();
//   pagedDto.data = data;
//   pagedDto.meta = {
//     page,
//     limit,
//     count: data.length,
//     previousPage: page > 1 ? page - 1 : false,
//     nextPage: skip + limit < total ? page + 1 : false,
//     pageCount: Math.ceil(total / limit),
//     totalRecords: total,
//   };
//   return pagedDto;
// }
// async getDriverVehicle(driverId: string) {
//   try {
//     const vehicles = await this.vehicleRepo.find({
//       where: { driverId },
//       order: { createdAt: 'DESC' }, // optional, but usually nice to have
//     });
//     return vehicles;
//   } catch (e) {
//     // log it properly instead of swallowing
//     throw e;
//   }
// }

// async getPassengerById(id: string){
//   const passenger = await this.passengerRepo.findOne({
//     where: { id },
//     relations: ['user'],
//   });
//   if (!passenger) throw new NotFoundException('passenger not found');
//   return passenger;
// }



// async getAgentById(id: string) {
//   // 1. The agent + its user
//   const agent = await this.agentRepo.findOne({
//     where: { id },
//     relations: { user: true },
//   });
//   if (!agent) throw new NotFoundException('Agent not found');

//   // 2. Fetch the related collections in parallel
//   const [agent_referrals, withdrawal_request, refferals, commissions] =
//     await Promise.all([
//       // agent_referrals — direct on agentId
//       this.agentReferralRepo.find({
//         where: { agentId: id },
//         relations: { driver: true },
//         order: { createdAt: 'DESC' },
//       }),

//       // withdrawal_request — payouts on agentId
//       this.payoutRepo.find({
//         where: { agentId: id },
//         order: { createdAt: 'DESC' },
//       }),

//       // refferals — these belong to the agent's USER, not the agent
//       this.referralRepo.find({
//         where: { referrerId: agent.userId },
//         relations: { referredUser: true },
//         order: { createdAt: 'DESC' },
//       }),

//       // commissions — used to build earning_overview
//       this.agentCommissionRepo.find({ where: { agentId: id } }),
//     ]);

//   // 3. Build earning_overview (object) from commission rows
//   const toNum = (v: any) => Number(v) || 0;
//   const earning_overview = {
//     totalCommission: commissions.reduce((s, c) => s + toNum(c.commissionAmount), 0),
//     releasedCommission: commissions
//       .filter((c) => c.status === 'released')
//       .reduce((s, c) => s + toNum(c.commissionAmount), 0),
//     pendingCommission: commissions
//       .filter((c) => c.status === 'pending')
//       .reduce((s, c) => s + toNum(c.commissionAmount), 0),
//     currentBalance: toNum(agent.currentBalance),
//     totalReferrals: agent.totalReferrals,
//     totalWithdrawals: withdrawal_request.reduce((s, p) => s + toNum(p.amount), 0),
//   };

//   // 4. Assemble the exact shape the frontend reads
//   return {
//     ...agent,
//     agent_referrals,
//     refferals,          // note: matches the frontend's spelling exactly
//     earning_overview,
//     withdrawal_request,
//   };
// }

// async getAgentWithDetails(id: string) {
//   const agent = await this.agentRepo.findOne({
//     where: { id },
//     relations: ['referrals', 'payouts'],
//   });
//   if (!agent) throw new NotFoundException('Agent not found');

//    const payouts = await this.payoutRepo.find({
//     where: { agentId: id },
//     order: { createdAt: 'DESC' },
//   });

//    const referrals = await this.userRepo.find({
//     where: { referredBy: id },
//   });

//  const totalPaid = payouts
//     .filter((p) => p.status === PayoutStatus.APPROVED)
//     .reduce((sum, p) => sum + (Number(p.amount) ?? 0), 0);

//   const totalEarned = Number(agent.totalCommission ?? 0); 

//   return {
//     profile: agent,
//     total_referrals: agent.totalReferrals, 
//     earning_overview: {
//       total_earnings: totalEarned,
//       payment_processed: totalPaid,
//       pending_payment: totalEarned - totalPaid,
//     },
//     withdrawal_requests: payouts.map((p) => ({
//       amount: p.amount,
//       status: p.status,
//       date: p.createdAt,
//     })),
//   };
// }

// async getAgentReferrals(agentId: string, query: { page?: number; limit?: number }) {
//   const { page = 1, limit = 15 } = query;
//   const skip = (page - 1) * limit;

//   const agent = await this.agentRepo.findOne({ where: { id: agentId } });
//   if (!agent) throw new NotFoundException('Agent not found');

//   const [referrals, total] = await this.userRepo.findAndCount({
//     where: { referredBy: agentId },
//     skip,
//     take: limit,
//     order: { createdAt: 'DESC' },
//   });

//   const data = referrals.map((ref) => ({
//     id: ref.id,
//     name: `${ref.firstName} ${ref.lastName}`,
//     email: ref.email,
//     phone_number: ref.phone,
//     status: ref.status,
//     date_referred: ref.createdAt,
//     profile_image: ref.profileImage,
//   }));

//   const pagedDto = new PagedDto();
//   pagedDto.data = data;
//   pagedDto.meta = {
//     page,
//     limit,
//     count: data.length,
//     previousPage: page > 1 ? page - 1 : false,
//     nextPage: skip + limit < total ? page + 1 : false,
//     pageCount: Math.ceil(total / limit),
//     totalRecords: total,
//   };
//   return pagedDto;
// }

// async toggleAgentStatus(id: string) {
//   const agent = await this.agentRepo.findOne({ where: { id } });
//   if (!agent) throw new NotFoundException('Agent not found');
//   agent.status = agent.status === UserStatus.ACTIVE ? UserStatus.SUSPENDED : UserStatus.ACTIVE;
//   return this.agentRepo.save(agent);
// }

// /** Admin approves a pending agent — this is the gate that unblocks agent login. */

// async approveAgent(id: string) {
//   const agent = await this.agentRepo.findOne({ where: { id }, relations: ['user'] });
//   if (!agent) throw new NotFoundException('Agent not found');
//   if (agent.status !== UserStatus.PENDING)
//     throw new BadRequestException(`Only pending agents can be approved (current status: ${agent.status})`);

//   agent.status = UserStatus.ACTIVE;
//   await this.agentRepo.save(agent);

//   if (agent.user) {
//     agent.user.status = UserStatus.ACTIVE;
//     await this.userRepo.save(agent.user);
//   }

//   if (agent.user?.id) {
//     await this.notificationService.notify({
//       userId: agent.user.id,
//       title: 'Agent Account Approved',
//       body: 'Your agent account has been approved. You can now log in.',
//       type: NotificationType.BROADCAST,
//       data: { agentId: agent.id },
//     });
//   }

//   return agent;
// }

// /** Admin rejects/suspends a pending (or active) agent, with an optional reason. */
// async rejectAgent(id: string, reason?: string) {
//   const agent = await this.agentRepo.findOne({ where: { id }, relations: ['user'] });
//   if (!agent) throw new NotFoundException('Agent not found');

//   agent.status = UserStatus.SUSPENDED;
//   await this.agentRepo.save(agent);

//   if (agent.user?.id) {
//     await this.notificationService.notify({
//       userId: agent.user.id,
//       title: 'Agent Account Not Approved',
//       body: reason
//         ? `Your agent account application was declined: ${reason}`
//         : 'Your agent account application was declined.',
//       type: NotificationType.BROADCAST,
//       data: { agentId: agent.id, reason },
//     });
//   }

//   return agent;
// }

// async togglePassengerStatus(id: string) {
//   const passenger = await this.passengerRepo.findOne({
//     where: { id },
//     relations: ['user'],
//   });
//   if (!passenger) throw new NotFoundException('Passenger not found');
//   passenger.user.status =
//     passenger.user.status === UserStatus.ACTIVE ? UserStatus.SUSPENDED : UserStatus.ACTIVE;
//   return this.userRepo.save(passenger.user);
// }

// async toggleDriverStatus(id: string) {
//   const driver = await this.driverRepo.findOne({
//     where: { id },
//     relations: ['user'],
//   });
//   if (!driver) throw new NotFoundException('Driver not found');
//   driver.user.status =
//     driver.user.status === UserStatus.ACTIVE ? UserStatus.SUSPENDED : UserStatus.ACTIVE;
//   return this.userRepo.save(driver.user);
// }

// async getPassengerWithDetails(id: string, query: { page?: number; limit?: number } = {}) {
//   const { page = 1, limit = 10 } = query;
//   const skip = (page - 1) * limit;

//   const passenger = await this.passengerRepo.findOne({
//     where: { id },
//     relations: ['user'],
//   });
//   if (!passenger) throw new NotFoundException('Passenger not found');

//   const [tripHistory, tripTotal] = await this.bookingRepo.findAndCount({
//     where: { passengerId: passenger.id },
//     relations: ['trip'],
//     skip,
//     take: limit,
//     order: { createdAt: 'DESC' },
//   });

//   const [referrals, referralTotal] = await this.userRepo.findAndCount({
//     where: { referredBy: passenger.user.id },
//     skip,
//     take: limit,
//     order: { createdAt: 'DESC' },
//   });

//   return {
//     profile: passenger,
//     next_of_kin: {
//       name: passenger.nxt_kin_name,
//       relationship: passenger.nxt_kin_relationship,
//       phone_number: passenger.nxt_kin_telephone,
//     },
//     referrals: {
//       data: referrals.map((r) => ({
//         name: `${r.firstName} ${r.lastName}`,
//         email: r.email,
//         phone_number: r.phone,
//         status: r.status,
//         date_referred: r.createdAt,
//         profile_image: r.profileImage,
//       })),
//       meta: { page, limit, totalRecords: referralTotal },
//     },
//     trip_history: {
//       data: tripHistory.map((b) => ({
//         trip_id: b.id,
//         departure_location: b.trip?.departureLocation,
//         arrival_location: b.trip?.arrivalDestination,
//         departure_date: b.trip?.departureDate,
//         departure_time: b.trip?.departureTime,
//         arrival_date: b.trip?.arrivalDate,
//         arrival_time: b.trip?.arrivalTime,
//         amount: (b.amountPaid ?? 0) / 100,
//         status: b.status,
//       })),
//       meta: { page, limit, totalRecords: tripTotal },
//     },
//   };
// }

// async getDriverWithDetails(id: string, query: { page?: number; limit?: number } = {}) {
//   const { page = 1, limit = 10 } = query;
//   const skip = (page - 1) * limit;

//   const driver = await this.driverRepo.findOne({
//     where: { id },
//     relations: ['user', 'vehicles', 'beneficiaries'],
//   });
//   if (!driver) throw new NotFoundException('Driver not found');

//   const reviews = await this.reviewRepo.find({
//     where: { driverId: id, isVisible: true },
//     relations: ['passenger.user'],
//     order: { createdAt: 'DESC' },
//   });

//   const [tripHistory, tripTotal] = await this.tripRepo.findAndCount({
//     where: { driverId: driver.id },
//     skip,
//     take: limit,
//     order: { createdAt: 'DESC' },
//   });

//   return {
//     profile: driver,
//     vehicle: driver.vehicle,  
//     rating_summary: {
//       average: Number(driver.averageRating),
//       count: driver.ratingCount,
//     },
//     reviews: reviews.map((r) => ({
//       passenger: `${r.passenger?.user?.firstName ?? ''} ${r.passenger?.user?.lastName ?? ''}`.trim(),
//       profile_image: r.passenger?.user?.profileImage,
//       date: r.createdAt,
//       rating: r.rating,
//       comment: r.comment,
//     })),
//     trip_history: {
//       data: tripHistory.map((t) => ({
//         trip_id: t.id,
//         departure_location: t.departureLocation,
//         arrival_location: t.arrivalDestination,
//         departure_date: t.departureDate,
//         departure_time: t.departureTime,
//         arrival_date: t.arrivalDate,
//         arrival_time: t.arrivalTime,
//         status: t.status,
//       })),
//       meta: { page, limit, totalRecords: tripTotal },
//     },
//   };
// }

// async getTripWithPassengers(tripId: string, query: { page?: number; limit?: number } = {}) {
//   const { page = 1, limit = 10 } = query;
//   const skip = (page - 1) * limit;

//   const trip = await this.tripRepo.findOne({
//     where: { id: tripId },
//     relations: ['driver.user', 'vehicle.driver'],
//   });
//   if (!trip) throw new NotFoundException('Trip not found');

//   const [bookings, total] = await this.bookingRepo.findAndCount({
//     where: { tripId },
//     relations: ['passenger.user'],
//     skip,
//     take: limit,
//     order: { createdAt: 'DESC' },
//   });

//   const pagedDto = new PagedDto();
//   pagedDto.data = bookings.map((b) => ({
//     id: b.id,
//     tracking_id: b.couponCode,
//     ticket_number: b.ticketToken,
//     profile_image: b.passenger?.user?.profileImage,
//     name: `${b.passenger?.user?.firstName} ${b.passenger?.user?.lastName}`,
//     email: b.passenger?.user?.email,
//     phone_number: b.passenger?.user?.phone,
//     status: b.status,
//     amount: (b.amountPaid ?? 0) / 100,
//     created_at: b.createdAt,
//   }));
//   pagedDto.meta = {
//     page,
//     limit,
//     count: bookings.length,
//     previousPage: page > 1 ? page - 1 : false,
//     nextPage: skip + limit < total ? page + 1 : false,
//     pageCount: Math.ceil(total / limit),
//     totalRecords: total,
//   };

//   return {
//     trip_details: trip,
//     passengers: pagedDto,
//   };
// }

//   // ─── Dashboard ───────────────────────────────────────────────────────────────

//   async getDashboardStats(query: { page?: number; limit?: number } = {}) {
//   const { page = 1, limit = 20 } = query;
//   const skip = (page - 1) * limit;

//   // Run all counts + overviews + revenue in parallel
//   const [
//     totalUsers,
//     totalDrivers,
//     totalPassengers,
//     totalTrips,
//     totalBookings,
//     pendingPayouts,
//     pendingDocuments,
//     totalAgents,
//     overviews,
//     revenue,
//   ] = await Promise.all([
//     this.userRepo.count({ where: { deletedAt: null } }),
//     this.driverRepo.count({ where: { deletedAt: null } }),
//     this.passengerRepo.count({ where: { deletedAt: null } }),
//     this.tripRepo.count({ where: { deletedAt: null } }),
//     this.bookingRepo.count({ where: { deletedAt: null } }),
//     this.payoutRepo.count({ where: { status: PayoutStatus.PENDING } }),
//     this.docRepo.count({ where: { status: DocumentStatus.PENDING } }),
//     this.agentRepo.count({ where: { deletedAt: null } }),
//     this.getOverviews(),   // today's trip counts by status
//     this.getRevenue(),     // 7-day daily revenue with graph
//   ]);

//   // paginated recent users
//   const [recentUsers, recentUsersTotal] = await this.userRepo.findAndCount({
//     where: { deletedAt: null },
//     skip,
//     take: limit,
//     order: { createdAt: 'DESC' },
//   });

//   const [activeTrips, activeTripsTotal] = await this.tripRepo.findAndCount({
//     where: { status: TripStatus.ACTIVE as any },
//     relations: ['driver.user', 'vehicle'],
//     skip,
//     take: limit,
//     order: { createdAt: 'DESC' },
//   });

//   const [completedTrips, completedTotal] = await this.tripRepo.findAndCount({
//     where: { status: TripStatus.COMPLETED as any },
//     relations: ['driver.user', 'vehicle'],
//     skip,
//     take: limit,
//     order: { createdAt: 'DESC' },
//   });

//   return {
//     users: {
//       total: totalUsers,
//       drivers: totalDrivers,
//       passengers: totalPassengers,
//       agents: totalAgents,
//       recent: recentUsers,
//       totalRecentUsers: recentUsersTotal,
//     },
//     trips: { total: totalTrips },
//     bookings: { total: totalBookings },
//     finance: {
//       totalRevenue: revenue.total_revenue,  
//       pendingPayouts,
//     },
//     revenue: {                             
//       total: revenue.total_revenue,
//       graph_data: revenue.graph_data,
//     },
//     overviews,                               
//     kyc: { pendingDocuments },
//     activeTrips: {
//       data: activeTrips,
//       meta: {
//         page,
//         limit,
//         count: activeTrips.length,
//         pageCount: Math.ceil(activeTripsTotal / limit),
//         totalRecords: activeTripsTotal,
//       },
//     },
//     completedTrips: {
//       data: completedTrips,
//       meta: {
//         page,
//         limit,
//         count: completedTrips.length,
//         pageCount: Math.ceil(completedTotal / limit),
//         totalRecords: completedTotal,
//       },
//     },
//   };
// }
  

//   // ─── User Management ─────────────────────────────────────────────────────────

//   async listUsers(query: {
//     page?: number;
//     limit?: number;
//     search?: string;
//     role?: string;
//   }): Promise<PagedDto<any>> {
//     const { page = 1, limit = 20, search, role } = query;
//     const skip = (page - 1) * limit;

//     const where: any = { deletedAt: null };
//     if (search) where.email = ILike(`%${search}%`);
//     if (role) where.role = role;

//     const [data, total] = await this.userRepo.findAndCount({
//       where,
//       skip,
//       take: limit,
//       order: { createdAt: 'DESC' },
//     });

//     const pagedDto = new PagedDto();
//     pagedDto.data = data;
//     pagedDto.meta = {
//       page,
//       limit,
//       count: data.length,
//       previousPage: page > 1 ? page - 1 : false,
//       nextPage: skip + limit < total ? page + 1 : false,
//       pageCount: Math.ceil(total / limit),
//       totalRecords: total,
//     };
//     return pagedDto;
//   }

//   async getUser(id: string) {
//     const user = await this.userRepo.findOne({ where: { id } });
//     if (!user) throw new NotFoundException('User not found');
//     return user;
//   }

//   async suspendUser(id: string, reason?: string) {
//     const user = await this.getUser(id);
//     user.status = UserStatus.SUSPENDED;
//     if (reason) user.metadata = { ...(user.metadata ?? {}), suspensionReason: reason };
//     return this.userRepo.save(user);
//   }

//   async activateUser(id: string) {
//     const user = await this.getUser(id);
//     user.status = UserStatus.ACTIVE;
//     return this.userRepo.save(user);
//   }

//     async activateDriver(id: string) {
//     const user = await this.getDriverById(id);
//     user.status = UserStatus.ACTIVE;
//     return this.userRepo.save(user);
//   }

//   async getDriverDocumentHistory(driverId: string) {
//   const driver = await this.driverRepo.findOne({ where: { id: driverId } });
//   if (!driver) throw new NotFoundException('Driver not found');

//   const documents = await this.docRepo.find({
//     where: { driverId },
//     order: { createdAt: 'DESC' },
//   });

//   return documents;
// }
// async fetchDriversDocuments(driverId: string) {
//   const driver = await this.driverRepo.findOne({
//     where: { id: driverId },
//   });

//   if (!driver) {
//     throw new NotFoundException('Driver not found');
//   }

//   return driver.licenseData;
// }

// async deleteDriverDocumentHistory(driverId: string): Promise<{ message: string; deleted: number }> {
//   const driver = await this.driverRepo.findOne({ where: { id: driverId } });
//   if (!driver) throw new NotFoundException('Driver not found');

//   const result = await this.docRepo.delete({ driverId });

//   return {
//     message: 'Driver document history deleted successfully',
//     deleted: result.affected ?? 0,
//   };
// }



// async updateDriverDocuments(
//   documentId: string,
//   data: Partial<DocumentVerification>,
// ): Promise<{ message: string; updated: number }> {
//   const document = await this.docRepo.findOne({ where: { id: documentId } });
//   if (!document) throw new NotFoundException('Document not found');

//   return this.entityManager.transaction(async (manager) => {
//     const result = await manager.update(DocumentVerification, { id: documentId }, data);

//     const driver = await manager.findOne(Driver, { where: { id: document.driverId } });
//     if (driver) {
//       const licenseData = { ...(driver.licenseData ?? {}) };
//       const existingDocs = { ...(licenseData.documents ?? {}) };
//       existingDocs[document.documentType] = {
//         ...(existingDocs[document.documentType] ?? {}),
//         documentUrl: data.documentUrl ?? document.documentUrl,
//         verificationData: data.verificationData ?? document.verificationData,
//         status: data.status ?? document.status,
//         rejectionReason: data.rejectionReason ?? document.rejectionReason ?? null,
//         updatedAt: new Date().toISOString(),
//       };
//       licenseData.documents = existingDocs;
//       await manager.update(Driver, { id: document.driverId }, { licenseData });
//     }

//     return {
//       message: 'Driver document updated successfully',
//       updated: result.affected ?? 0,
//     };
//   });
// }

// async addDriverDocuments(
//   driverId: string,
//   dto: UploadDriverDocumentDto,
//   documentUrl: string,
// ): Promise<DocumentVerification | Vehicle> {

//   switch (dto.documentType) {
//     case 'insurance':
//     case 'registration_doc':
//     case 'vehicle': {
//       if (!dto.vehicleId) {
//         throw new BadRequestException(
//           `vehicleId is required for documentType "${dto.documentType}"`,
//         );
//       }

//       const vehicle = await this.vehicleRepo.findOne({
//         where: { id: dto.vehicleId, driverId },
//       });
//       if (!vehicle) throw new NotFoundException('Vehicle not found for this driver');

//       if (dto.documentType === 'insurance') {
//         vehicle.insurance = documentUrl;
//       } else if (dto.documentType === 'registration_doc') {
//         vehicle.registrationDoc = documentUrl;
//       } else {
//         vehicle.vehiclePhoto = [...(vehicle.vehiclePhoto ?? []), documentUrl];
//       }

//       vehicle.verificationStatus = DocumentStatus.PENDING;
//       vehicle.rejectionReason = null;

//       return this.vehicleRepo.save(vehicle);
//     }

//     default: {
//       // license / other → driver document
//       return this.entityManager.transaction(async (manager) => {
//         const document = manager.create(DocumentVerification, {
//           driverId,
//           documentType: dto.documentType,
//           documentUrl,
//           verificationData: dto.name ? { name: dto.name } : undefined,
//           status: DocumentStatus.PENDING,
//         });
//         const saved = await manager.save(DocumentVerification, document);

//         const driver = await manager.findOne(Driver, { where: { id: driverId } });
//         const licenseData = { ...(driver.licenseData ?? {}) };
//         const existingDocs = { ...(licenseData.documents ?? {}) };
//         existingDocs[dto.documentType] = {
//           documentUrl,
//           verificationData: dto.name ? { name: dto.name } : undefined,
//           status: DocumentStatus.PENDING,
//           rejectionReason: null,
//           updatedAt: new Date().toISOString(),
//         };
//         licenseData.documents = existingDocs;
//         await manager.update(Driver, { id: driverId }, { licenseData });

//         return saved;
//       });
//     }
//   }
// }

// // ─── Vehicle Verification ───────────────────────────────────────────────────

//   async listPendingVehicles(query: {
//     page?: number;
//     limit?: number;
//     search?: string;
//   }): Promise<PagedDto<any>> {
//     const { page = 1, limit = 20, search } = query;
//     const skip = (page - 1) * limit;

//     const qb = this.vehicleRepo
//       .createQueryBuilder('vehicle')
//       .leftJoinAndSelect('vehicle.driver', 'driver')
//       .where('vehicle.verificationStatus = :status', { status: DocumentStatus.PENDING })
//       .orderBy('vehicle.createdAt', 'ASC')
//       .skip(skip)
//       .take(limit);

//     if (search) {
//       qb.andWhere(
//         '(driver.email ILIKE :search OR vehicle.plateNumber ILIKE :search)',
//         { search: `%${search}%` },
//       );
//     }

//     const [data, total] = await qb.getManyAndCount();

//     const pagedDto = new PagedDto();
//     pagedDto.data = data;
//     pagedDto.meta = {
//       page,
//       limit,
//       count: data.length,
//       previousPage: page > 1 ? page - 1 : false,
//       nextPage: skip + limit < total ? page + 1 : false,
//       pageCount: Math.ceil(total / limit),
//       totalRecords: total,
//     };

//     return pagedDto;
//   }

//   async approveVehicle(vehicleId: string, adminEmail: string) {
//     const vehicle = await this.vehicleRepo.findOne({
//       where: { id: vehicleId },
//       relations: ['driver', 'driver.user'],
//     });
//     if (!vehicle) throw new NotFoundException('Vehicle not found');
//     if (vehicle.verificationStatus === DocumentStatus.APPROVED) {
//       throw new BadRequestException('Vehicle is already approved');
//     }

//     vehicle.verificationStatus = DocumentStatus.APPROVED;
//     vehicle.isVerified = true;
//     vehicle.rejectionReason = null;
//     vehicle.updatedBy = adminEmail;
//     const saved = await this.vehicleRepo.save(vehicle);

//     const expoToken = vehicle.driver?.user?.expoToken;
//     if (expoToken) {
//       await this.expoService.sendPushNotification(
//         expoToken,
//         'Vehicle approved',
//         `Your vehicle (${vehicle.plateNumber}) has been approved. You can now use it for trips.`,
//         { driverId: vehicle.driverId },
//       );
//     }

//     return saved;
//   }

//   async rejectVehicle(vehicleId: string, reason: string, adminEmail: string) {
//     const vehicle = await this.vehicleRepo.findOne({
//       where: { id: vehicleId },
//       relations: ['driver', 'driver.user'],
//     });
//     if (!vehicle) throw new NotFoundException('Vehicle not found');

//     vehicle.verificationStatus = DocumentStatus.REJECTED;
//     vehicle.isVerified = false;
//     vehicle.rejectionReason = reason;
//     vehicle.updatedBy = adminEmail;
//     const saved = await this.vehicleRepo.save(vehicle);

//     const expoToken = vehicle.driver?.user?.expoToken;
//     if (expoToken) {
//       await this.expoService.sendPushNotification(
//         expoToken,
//         'Vehicle rejected',
//         `Your vehicle (${vehicle.plateNumber}) was rejected: ${reason}`,
//         { driverId: vehicle.driverId },
//       );
//     }

//     return saved;
//   }



//   // ─── Driver / KYC Management ─────────────────────────────────────────────────

//   async listPendingDocuments(query: {
//     page?: number;
//     limit?: number;
//     search?: string;
//   }): Promise<PagedDto<any>>{

//         const { page = 1, limit = 20, search } = query;
//         const skip = (page - 1) * limit;

//       const qb = this.docRepo
//     .createQueryBuilder('doc')
//     .leftJoinAndSelect('doc.driver', 'driver')
//     .where('doc.status = :status', { status: DocumentStatus.PENDING })
//     .orderBy('doc.createdAt', 'ASC')
//     .skip(skip)
//     .take(limit);

//       if (search) {
//     qb.andWhere('driver.email ILIKE :search', { search: `%${search}%` });
//   }
//   const [data, total] = await qb.getManyAndCount();

//      const pagedDto = new PagedDto();
//     pagedDto.data = data;
//     pagedDto.meta = {
//       page,
//       limit,
//       count: data.length,
//       previousPage: page > 1 ? page - 1 : false,
//       nextPage: skip + limit < total ? page + 1 : false,
//       pageCount: Math.ceil(total / limit),
//       totalRecords: total,
//     };
    
//     return pagedDto;
//   }

  

//    async approveDocument(docId: string, adminEmail: string) {
//     const doc = await this.docRepo.findOne({
//       where: { id: docId },
//       relations: ['driver'],
//     });
//     if (!doc) throw new NotFoundException('Document not found');
//     if (doc.status === DocumentStatus.APPROVED)
//       throw new BadRequestException('Document is already approve');

//     await this.entityManager.transaction(async (manager) => {
//       doc.status = DocumentStatus.APPROVED;
//       doc.updatedBy = adminEmail;
//       await manager.save(DocumentVerification, doc);

//       // Keep the licenseData.documents mirror (used by getProfile) in sync
//       // with the review outcome, same as updateDriverDocuments does.
//       const driverForMirror =
//         doc.driver ?? (await manager.findOne(Driver, { where: { id: doc.driverId } }));
//       if (driverForMirror) {
//         const licenseData = { ...(driverForMirror.licenseData ?? {}) };
//         const existingDocs = { ...(licenseData.documents ?? {}) };
//         existingDocs[doc.documentType] = {
//           ...(existingDocs[doc.documentType] ?? {}),
//           documentUrl: doc.documentUrl,
//           verificationData: doc.verificationData,
//           status: DocumentStatus.APPROVED,
//           rejectionReason: null,
//           updatedAt: new Date().toISOString(),
//         };
//         licenseData.documents = existingDocs;
//         await manager.update(Driver, { id: doc.driverId }, { licenseData });
//       }

//       // A license document approved through the admin review queue never
//       // touched driver.licenseVerified before — that's the flag the driver
//       // app actually reads (to gate trip creation and show "license
//       // verified"), separate from the generic document_verifications row.
//       // Keep it in sync here so admin approval has the same effect as the
//       // automated Dojah verification flow.
//       if (this.isLicenseDocumentType(doc.documentType)) {
//         const driver = await manager.findOne(Driver, {
//           where: { id: doc.driverId },
//           relations: ['user'],
//         });
//         if (driver) {
//           await manager.update(Driver, doc.driverId, {
//             license: doc.documentUrl,
//             licenseVerified: true,
//             licenseVerifiedAt: new Date(),
//           });
//           if (driver.user?.expoToken) {
//             await this.expoService.sendPushNotification(
//               driver.user.expoToken,
//               'Approved ',
//               `Your document has been approved: ${doc.documentType}, ${driver.user.firstName}`,
//               { userId: driver.id },
//             );
//           }
//         }
//       }
//     });

//     // Check if all required docs are approved → update driver KYC status
//     await this.recalculateDriverKyc(doc.driverId);
//     return doc;
//   }

//     private isLicenseDocumentType(documentType: string): boolean {
//     return ['document_front_side', 'document_back_side', 'driverLicense'].includes(
//       (documentType ?? '').toLowerCase(),
//     );
//   }

//    async rejectDocument(docId: string, reason: string, adminEmail: string) {
//     const doc = await this.docRepo.findOne({ where: { id: docId } });
//     if (!doc) throw new NotFoundException('Document not found');

//     doc.status = DocumentStatus.REJECTED;
//     doc.rejectionReason = reason;
//     doc.updatedBy = adminEmail;
//     const saved = await this.docRepo.save(doc);

//     // Mirror finalizeLicenseRejected() so a manually-rejected license also
//     // flips the driver back to unverified instead of leaving a stale flag.
//     if (this.isLicenseDocumentType(doc.documentType)) {
//       const driver = await this.driverRepo.findOne({ where: { id: doc.driverId } });
//       if (driver) {
//         await this.driverRepo.update(doc.driverId, {
//              licenseVerified: false,
//               reason: reason,
//         });
//       }
//                await this.expoService.sendPushNotification(driver.user.expoToken, "Rejected ", `${driver.user.firstName}Your document has been rejected: ${doc.documentType}`, { userId: driver.id })

//     }

//     return saved;
//   }

//   private async recalculateDriverKyc(driverId: string) {
//     const allDocs = await this.docRepo.find({ where: { driverId } });
//     const allApproved =
//       allDocs.length > 0 && allDocs.every((d) => d.status === DocumentStatus.APPROVED);

//     if (allApproved) {
//       await this.driverRepo.update(driverId, { kycComplete: KycStatus.COMPLETED });
//     }
//   }

//   // ─── Trip Management ─────────────────────────────────────────────────────────

  
// async listTrips(query: { page?: number; limit?: number; status?: string }): Promise<PagedDto<any>> {
//   const { page = 1, limit = 20, status } = query;
//   const skip = (page - 1) * limit;
//   const where: any = {};

//   if (status) {
//     // "past" is a category, not a stored status — expand it into the concrete
//     // TripStatus values that represent a finished trip. Every real status
//     // (including "upcoming", the literal value of PENDING) still filters
//     // by exact match exactly as before.
//     const categories: Record<string, TripStatus[]> = {
//       past: [TripStatus.COMPLETED, TripStatus.CANCELLED, TripStatus.CLOSED],
//     };

//     where.status = categories[status] ? In(categories[status]) : status;
//   }

//   const [data, total] = await this.tripRepo.findAndCount({
//     where,
//     skip,
//     take: limit,
//     relations: ['driver.user'],
//     order: { createdAt: 'DESC' },
//   });

//   const pagedDto = new PagedDto();
//   pagedDto.data = data;
//   pagedDto.meta = {
//     page,
//     limit,
//     count: data.length,
//     previousPage: page > 1 ? page - 1 : false,
//     nextPage: skip + limit < total ? page + 1 : false,
//     pageCount: Math.ceil(total / limit),
//     totalRecords: total,
//   };

//   return pagedDto;
// }

//   // async listTrips(query: { page?: number; limit?: number; status?: string }): Promise<PagedDto<any>> {
//   //   const { page = 1, limit = 20, status } = query;
//   //   const skip = (page - 1) * limit;
//   //   const where: any = {};
//   //   if (status) where.status = status;

//   //   const [data, total] = await this.tripRepo.findAndCount({
//   //     where,
//   //     skip,
//   //     take: limit,
//   //     relations: ['driver.user'],
//   //     order: { createdAt: 'DESC' },
//   //   });

//   //   const pagedDto = new PagedDto();
//   //   pagedDto.data = data;
//   //   pagedDto.meta = {
//   //     page,
//   //     limit,
//   //     count: data.length,
//   //     previousPage: page > 1 ? page - 1 : false,
//   //     nextPage: skip + limit < total ? page + 1 : false,
//   //     pageCount: Math.ceil(total / limit),
//   //     totalRecords: total,
//   //   };

//   //   return pagedDto;
//   // }

//   async getTrip(id: string) {
//     const trip = await this.tripRepo.findOne({
//       where: { id },
//       relations: ['driver.user', 'vehicle.driver'],
//     });
//     if (!trip) throw new NotFoundException('Trip not found');
//     return trip;
//   }

//   // ─── Payout Management ───────────────────────────────────────────────────────

//   async listPayouts(query: {
//     page?: number;
//     limit?: number;
//     status?: string;
//   }): Promise<PagedDto<any>> {
//     const { page = 1, limit = 20, status } = query;
//     const skip = (page - 1) * limit;
//     const where: any = {};
//     if (status) where.status = status;

//     const [data, total] = await this.payoutRepo.findAndCount({
//       where,
//       skip,
//       take: limit,
//       relations: ['driver', 'driver.user'],
//       order: { createdAt: 'DESC' },
//     });

//     const pagedDto = new PagedDto();
//     pagedDto.data = data;
//     pagedDto.meta = {
//       page,
//       limit,
//       count: data.length,
//       previousPage: page > 1 ? page - 1 : false,
//       nextPage: skip + limit < total ? page + 1 : false,
//       pageCount: Math.ceil(total / limit),
//       totalRecords: total,
//     };
//     return pagedDto;

//   }

//   async approvePayout(payoutId: string, adminEmail: string) {
//   const payout = await this.payoutRepo.findOne({
//     where: { id: payoutId },
//     relations: ['driver', 'beneficiary'],   // ← pull the beneficiary
//   });
//   if (!payout) throw new NotFoundException('Payout not found');
//   if (payout.status !== PayoutStatus.PENDING)
//     throw new BadRequestException('Payout is not pending');

//   const beneficiary = payout.beneficiary;
//   if (!beneficiary) throw new BadRequestException('No beneficiary attached to this payout');

//   if (!beneficiary.bankName || !beneficiary.bankCode)
//     throw new BadRequestException('Beneficiary bank details are missing');

//   // 1. Reuse cached recipient, or create one
//   let recipientCode = beneficiary.recipientCode;
//   if (!recipientCode) {
//     const created = await this.paystackAdapter.createTransferRecipient({
//       name: beneficiary.bankName,
//       account_number: beneficiary.accountNumber,
//       bank_code: beneficiary.bankCode,
//     });
//     recipientCode = created.recipient_code;
//     await this.beneficiaryRepo.update(beneficiary.id, { recipientCode });
//   }

//   // 2. Initiate transfer — all account data comes from the beneficiary
//   const { transfer_code } = await this.paystackAdapter.initiatePayout({
//     recipient_code: recipientCode,
//     amount: payout.amount,
//     reason: payout.reason || 'Payout',
//     account_number: beneficiary.accountNumber,
//     bank_code: beneficiary.bankCode,
//   });

//   // 3. Update the payout — only payout-level fields
//   payout.status = PayoutStatus.PROCESSING;
//   payout.recipientCode = recipientCode;
//   payout.transferCode = transfer_code;
//   payout.updatedBy = adminEmail;

//   // 4. Deduct wallet (driver payouts only)
//   if (payout.driverId) {
//     await this.driverRepo.decrement({ id: payout.driverId }, 'walletBalance', payout.amount);
//   }
//   await this.expoService.sendPushNotification(payout.driver.user.expoToken, "Approved ", `Your payout has been approved: ${payout.amount}`, { userId: payout.driverId });

//   return this.payoutRepo.save(payout);
// }

//   async declinePayout(payoutId: string, reason: string, adminEmail: string) {
//     const payout = await this.payoutRepo.findOne({ where: { id: payoutId } });
//     if (!payout) throw new NotFoundException('Payout not found');
//     if (payout.status !== PayoutStatus.PENDING)
//       throw new BadRequestException('Payout is not pending');

//     payout.status = PayoutStatus.DECLINED;
//     payout.reason = reason;
//     payout.updatedBy = adminEmail;
//     await this.expoService.sendPushNotification(payout.driver.user.expoToken, "Declined ", `Your payout has been declined: ${payout.amount}`, { userId: payout.driverId });
//     return this.payoutRepo.save(payout);
//   }

//   // ─── Coupon Management ───────────────────────────────────────────────────────

//   async createCoupon(dto: {
//     code: string;
//     type: CouponType;
//     value: number;
//     maxDiscount?: number;
//     minOrderAmount?: number;
//     usageLimit?: number;
//     expiresAt?: string;
//     adminId: number;
//   }) {
//     const existing = await this.couponRepo.findOne({ where: { code: dto.code.toUpperCase() } });
//     if (existing) throw new BadRequestException('Coupon code already exists');

//     const coupon = this.couponRepo.create({
//       ...dto,
//       code: dto.code.toUpperCase(),
//       status: CouponStatus.ACTIVE,
//       createdByAdminId: String(dto.adminId),
//       expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
//     });

//     return this.couponRepo.save(coupon);
//   }

//   async deactivateCoupon(id: string) {
//     const coupon = await this.couponRepo.findOne({ where: { id } });
//     if (!coupon) throw new NotFoundException('Coupon not found');
//     coupon.isActive = false;
//     coupon.status = CouponStatus.INACTIVE;
//     return this.couponRepo.save(coupon);
//   }

// async listCoupons(query: {
//   page?: number;
//   limit?: number;
//   status?: string;
// }): Promise<PagedDto<any>> {
//   const { page = 1, limit = 20, status } = query;
//   const skip = (page - 1) * limit;
//   const where: any = {};
//   if (status) where.status = status;

//   const [data, total] = await this.couponRepo.findAndCount({
//     where,
//     skip,
//     take: limit,
//     order: { createdAt: 'DESC' },
//   });

//       const pagedDto = new PagedDto();
//     pagedDto.data = data;
//     pagedDto.meta = {
//       page,
//       limit,
//       count: data.length,
//       previousPage: page > 1 ? page - 1 : false,
//       nextPage: skip + limit < total ? page + 1 : false,
//       pageCount: Math.ceil(total / limit),
//       totalRecords: total,
//     };
//     return pagedDto; 
// }

//   // ─── Booking Management ──────────────────────────────────────────────────────

//   async listBookings(query: { page?: number; limit?: number; status?: string }): Promise<PagedDto<any>> {
//     const { page = 1, limit = 20, status } = query;
//     const skip = (page - 1) * limit;
//     const where: any = {};
//     if (status) where.status = status;

//     const [data, total] = await this.bookingRepo.findAndCount({
//       where,
//       skip,
//       take: limit,
//       relations: ['trip', 'passenger', 'passenger.user'],
//       order: { createdAt: 'DESC' },
//     });

//        const pagedDto = new PagedDto();
//     pagedDto.data = data;
//     pagedDto.meta = {
//       page,
//       limit,
//       count: data.length,
//       previousPage: page > 1 ? page - 1 : false,
//       nextPage: skip + limit < total ? page + 1 : false,
//       pageCount: Math.ceil(total / limit),
//       totalRecords: total,
//     };

//     return pagedDto;
//   }

//   async refundBooking(bookingId: string, adminEmail: string) {
//     const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
//     if (!booking) throw new NotFoundException('Booking not found');
//     if (!booking.paymentReference) throw new BadRequestException('No payment reference found');

//     // Issue refund via Paystack
//     await (this.paystackAdapter as any).initiateRefund(
//       booking.paymentReference,
//       booking.amountPaid,
//     );

//     booking.status = 'refunded' as any;
//     booking.paymentStatus = 'refunded' as any;
//     booking.updatedBy = adminEmail;
//     return this.bookingRepo.save(booking);
//   }

//   reviewDocument(docId: string, approve: boolean, reason: string, email: string) {
//     return approve ? this.approveDocument(docId, email) : this.rejectDocument(docId, reason, email);
//   }

//   getBooking(id: string) {
//     return this.bookingRepo.findOne({
//       where: { id },
//       relations: ['trip', 'passenger', 'passenger.user'],
//     });
//   }

// async findByIdWithPassword(adminId: string): Promise<Admin> {
//   const admin = await this.adminRepository.findOne({
//     where: { id: adminId },
//     select: ['id', 'email', 'password'],
//   });
//   if (!admin) throw new NotFoundException('Admin not found');
//   return admin;
// }

// async updatePassword(
//   adminId: string,
//   hashedPassword: string,
// ): Promise<{ message: string }> {
//   await this.adminRepository.update(adminId, { password: hashedPassword });
//   return { message: 'Password updated successfully' };
// }



// // ─── Financial ───────────────────────────────────────────────────────────────



// async getFinancialReport(query: {
//   page?: number;
//   limit?: number;
//   filter_by?: 'daily' | 'monthly' | 'yearly';
// } = {}) {
//   const { page = 1, limit = 50, filter_by = 'monthly' } = query;
//   const skip = (page - 1) * limit;
//   const { start, end } = this.getReportRange(filter_by);

//   // SCALING NOTE:
//   //  - bookings.amountPaid & escrow.platformFee are decimal(10,2) → treated as naira (no /100)
//   //  - payouts.amount is stored in kobo → still /100 below
//   // Confirm against a real DB row and flip if your data differs.

//   // Pending withdrawals are point-in-time (current), so NOT date-filtered.
//   const [
//     totalAgentPendingWithdrawals,
//     totalDriverPendingWithdrawals,
//     totalPassengerPendingWithdrawals,
//   ] = await Promise.all([
//     this.payoutRepo.count({ where: { status: PayoutStatus.PENDING, payoutableType: 'agent' } }),
//     this.payoutRepo.count({ where: { status: PayoutStatus.PENDING, payoutableType: 'driver' } }),
//     this.payoutRepo.count({ where: { status: PayoutStatus.PENDING, payoutableType: 'passenger' } }),
//   ]);

//   const [agentAmountResult, driverAmountResult, passengerAmountResult] = await Promise.all([
//     this.payoutRepo.createQueryBuilder('p')
//       .select('COALESCE(SUM(p.amount), 0)', 'total')
//       .where('p.status = :status', { status: PayoutStatus.PENDING })
//       .andWhere('p.payoutableType = :type', { type: 'agent' }).getRawOne(),
//     this.payoutRepo.createQueryBuilder('p')
//       .select('COALESCE(SUM(p.amount), 0)', 'total')
//       .where('p.status = :status', { status: PayoutStatus.PENDING })
//       .andWhere('p.payoutableType = :type', { type: 'driver' }).getRawOne(),
//     this.payoutRepo.createQueryBuilder('p')
//       .select('COALESCE(SUM(p.amount), 0)', 'total')
//       .where('p.status = :status', { status: PayoutStatus.PENDING })
//       .andWhere('p.payoutableType = :type', { type: 'passenger' }).getRawOne(),
//   ]);

//   // Platform earnings for the SELECTED period (was all-time before → mismatched revenue).
//   // Filter by releasedAt because the fee is realized when escrow is released.
//   const platformEarningResult = await this.escroRepository
//     .createQueryBuilder('e')
//     .select('COALESCE(SUM(e.platformFee), 0)', 'total')
//     .where('e.status = :s', { s: 'released' })
//     .andWhere('e.releasedAt BETWEEN :start AND :end', { start, end })
//     .getRawOne();

//   // Live gateway balance — don't let a Paystack outage break the report.
//   let gatewayBalance: { balance: number; currency: string } | null = null;
//   try {
//     gatewayBalance = await this.paystackAdapter.checkBalance();
//   } catch {
//     gatewayBalance = null;
//   }

//   const recentPayouts = await this.payoutRepo.find({
//     relations: ['driver.user', 'agent.user', 'beneficiary'],
//     order: { createdAt: 'DESC' },
//     skip,
//     take: limit,
//   });

//   const allPayouts = recentPayouts.map((p) => ({
//     id: p.id,
//     type: 'payout',
//     amount: Number(p.amount ?? 0) / 100, // payouts stored in kobo
//     status: p.status,
//     reference: p.reference,
//     transfer_code: p.transferCode,
//     reason: p.reason,
//     paid_to: p.driver?.user
//       ? {
//           id: p.driver.user.id,
//           first_name: p.driver.user.firstName,
//           last_name: p.driver.user.lastName,
//           email: p.driver.user.email,
//           phone: p.driver.user.phone,
//           profile_image: p.driver.user.profileImage,
//         }
//       : p.agent?.user
//         ? {
//             id: p.agent.user.id,
//             first_name: p.agent.user.firstName,
//             last_name: p.agent.user.lastName,
//             email: p.agent.user.email,
//             phone: p.agent.user.phone,
//             profile_image: p.agent.user.profileImage,
//           }
//         : null,
//     created_at: p.createdAt,
//     updated_at: p.updatedAt,
//   }));

//   const revenue = await this.getRevenue(filter_by);

//   return {
//     filter_by,
//     period: { start, end },
//     total_agent_pending_withdrawals: totalAgentPendingWithdrawals,
//     total_driver_pending_withdrawals: totalDriverPendingWithdrawals,
//     total_passenger_pending_withdrawals: totalPassengerPendingWithdrawals,
//     // pending amounts: payouts are kobo → /100
//     total_agent_pending_withdrawals_amount: Number(agentAmountResult?.total ?? 0) / 100,
//     total_driver_pending_withdrawals_amount: Number(driverAmountResult?.total ?? 0) / 100,
//     total_passenger_pending_withdrawals_amount: Number(passengerAmountResult?.total ?? 0) / 100,
//     platform_earnings: Number(platformEarningResult?.total ?? 0), // decimal → naira, no /100
//     all_payouts: allPayouts,
//     revenue,
//     gateway_balance: gatewayBalance?.balance ?? null,
//     gateway_balance_currency: gatewayBalance?.currency ?? null,
//     gateway_balance_available: gatewayBalance !== null,
//   };
// }

// // ─── Revenue Graph (filter: daily | monthly | yearly) ─────────────────────

// async getRevenueGraph(filter: 'daily' | 'monthly' | 'yearly' = 'monthly') {
//   const now = new Date();

//   const qb = this.bookingRepo
//     .createQueryBuilder('b')
//     .where('b.paymentStatus = :s', { s: 'success' });

//   // Apply filter
//   if (filter === 'daily') {
//     qb.andWhere('DATE(b.createdAt) = CURRENT_DATE');
//   } else if (filter === 'monthly') {
//     qb.andWhere('EXTRACT(MONTH FROM b.createdAt) = :month', { month: now.getMonth() + 1 })
//       .andWhere('EXTRACT(YEAR FROM b.createdAt) = :year', { year: now.getFullYear() });
//   } else if (filter === 'yearly') {
//     qb.andWhere('EXTRACT(YEAR FROM b.createdAt) = :year', { year: now.getFullYear() });
//   }

//   const totalRevenueResult = await qb
//     .select('SUM(b.amountPaid)', 'total')
//     .getRawOne();

//   // Graph breakdown
//   const graphSelect =
//     filter === 'yearly'
//       ? "TO_CHAR(b.createdAt, 'YYYY')"
//       : filter === 'monthly'
//         ? "TO_CHAR(b.createdAt, 'YYYY-MM')"
//         : "TO_CHAR(b.createdAt, 'YYYY-MM-DD')";

//   const graphData = await this.bookingRepo
//     .createQueryBuilder('b')
//     .select(graphSelect, 'period')
//     .addSelect('SUM(b.amountPaid)', 'total')
//     .where('b.paymentStatus = :s', { s: 'success' })
//     .groupBy('period')
//     .orderBy('period', 'ASC')
//     .getRawMany();

//   return {
//     total_revenue: parseFloat(totalRevenueResult?.total ?? '0') / 100,
//     revenue_graph: graphData.map((g) => ({
//       period: g.period,
//       total: parseFloat(g.total ?? '0') / 100,
//     })),
//   };
// }

// async getNotificationActivityForAdmin(
//   query: AdminNotificationActivityQuery,
// ): Promise<PagedDto<any>> {
//   const { page = 1, limit = 20, role, type, search, isRead, startDate, endDate } = query;
//   const skip = (page - 1) * limit;

//   const qb = this.notificationRepository.createQueryBuilder('notification')
//     .leftJoin('notification.user', 'user')
//     .leftJoin('notification.admin', 'admin')
//     .select('notification.id', 'id')
//     .addSelect('notification.title', 'title')
//     .addSelect('notification.body', 'body')
//     .addSelect('notification.type', 'type')
//     .addSelect('notification.isRead', 'isRead')
//     .addSelect('notification.createdAt', 'createdAt')
//     .addSelect('user.id', 'userId')
//     .addSelect('user.firstName', 'userFirstName')
//     .addSelect('user.lastName', 'userLastName')
//     .addSelect('user.email', 'userEmail')
//     .addSelect('user.role', 'userRole')
//     .addSelect('admin.id', 'adminId')
//     .addSelect('admin.firstName', 'adminFirstName')
//     .addSelect('admin.lastName', 'adminLastName')
//     .orderBy('notification.createdAt', 'DESC');

//   if (role) {
//     qb.andWhere('user.role = :role', { role });
//   }
//   if (type) {
//     qb.andWhere('notification.type = :type', { type });
//   }
//   if (typeof isRead === 'boolean') {
//     qb.andWhere('notification.isRead = :isRead', { isRead });
//   }
//   if (search) {
//     qb.andWhere(
//       '(notification.title ILIKE :search OR notification.body ILIKE :search)',
//       { search: `%${search}%` },
//     );
//   }
//   if (startDate && endDate) {
//     qb.andWhere('notification.createdAt BETWEEN :startDate AND :endDate', {
//       startDate,
//       endDate,
//     });
//   }

//   const total = await qb.getCount();
//   const raw = await qb.offset(skip).limit(limit).getRawMany();

//   const data = raw.map((row) => ({
//     id: row.id,
//     title: row.title,
//     body: row.body,
//     type: row.type,
//     isRead: row.isRead,
//     createdAt: row.createdAt,
//     recipient: row.userId
//       ? {
//           id: row.userId,
//           name: `${row.userFirstName ?? ''} ${row.userLastName ?? ''}`.trim(),
//           email: row.userEmail,
//           role: row.userRole,
//         }
//       : row.adminId
//         ? {
//             id: row.adminId,
//             name: `${row.adminFirstName ?? ''} ${row.adminLastName ?? ''}`.trim(),
//             role: UserRole.ADMIN,
//           }
//         : null,
//   }));

// const pageCount = Math.ceil(total / limit);
// const previousPage = page > 1 ? page - 1 : null;
// const nextPage = page < pageCount ? page + 1 : null;

// return {
//   data,
//   meta: {
//     page,
//     limit,
//     count: data.length,
//     totalRecords: total,
//     pageCount,
//     previousPage,
//     nextPage,
//   },
// };
// }

// // ─── Transaction History ──────────────────────────────────────────────────────

// async getTransactionHistory(query: {
//   page?: number;
//   limit?: number;
//   status?: string;
// }) {
//   const { page = 1, limit = 10, status } = query;
//   const skip = (page - 1) * limit;

//   const [data, total] = await this.payoutRepo.findAndCount({
//     where: { status: PayoutStatus.APPROVED },
//     relations: ['driver.user', 'agent.user', 'beneficiary'],
//     skip,
//     take: limit,
//     order: { createdAt: 'DESC' },
//   });

//   const pagedDto = new PagedDto();
//   pagedDto.data = data.map((p) => ({
//     id: p.id,
//     amount: Number(p.amount ?? 0) / 100,
//     status: p.status,
//     reference: p.reference,
//     reason: p.reason,
//     recipient: p.driver?.user
//       ? `${p.driver.user.firstName} ${p.driver.user.lastName}`
//       : p.agent?.user
//         ? `${p.agent.user.firstName} ${p.agent.user.lastName}`
//         : 'Unknown',
//     created_at: p.createdAt,
//   }));
//   pagedDto.meta = {
//     page,
//     limit,
//     count: data.length,
//     previousPage: page > 1 ? page - 1 : false,
//     nextPage: skip + limit < total ? page + 1 : false,
//     pageCount: Math.ceil(total / limit),
//     totalRecords: total,
//   };

//   return pagedDto;
// }

// // ─── Refund Requests ─────────────────────────────────────────────────────────

// async getRefundRequests(query: {
//   page?: number;
//   limit?: number;
//   type?: 'passenger' | 'driver';
//   search?: string;
// }) {
//   const { page = 1, limit = 15, type, search } = query;
//   const skip = (page - 1) * limit;

//   const qb = this.payoutRepo
//     .createQueryBuilder('p')
//     .leftJoinAndSelect('p.driver', 'driver')
//     .leftJoinAndSelect('driver.user', 'driverUser')
//     .leftJoinAndSelect('p.beneficiary', 'beneficiary')
//     .addSelect(
//       'CASE WHEN p.status = :pendingStatus THEN 0 ELSE 1 END',
//       'status_order',
//     )
//     .where('p.payoutableType != :agentType', { agentType: 'agent' }) // exclude agents
//     .setParameter('pendingStatus', PayoutStatus.PENDING)
//     .orderBy('status_order', 'ASC')
//     .addOrderBy('p.createdAt', 'DESC')
//     .skip(skip)
//     .take(limit);

//   if (type === 'passenger') {
//     qb.andWhere('p.payoutableType = :type', { type: 'passenger' });
//   } else if (type === 'driver') {
//     qb.andWhere('p.payoutableType = :type', { type: 'driver' });
//   }

//   if (search) {
//     qb.andWhere(
//       '(p.reference ILIKE :search OR p.status ILIKE :search OR p.reason ILIKE :search)',
//       { search: `%${search}%` },
//     );
//   }

//   const [data, total] = await qb.getManyAndCount();

//   const pagedDto = new PagedDto();
//   pagedDto.data = data;
//   pagedDto.meta = {
//     page,
//     limit,
//     count: data.length,
//     previousPage: page > 1 ? page - 1 : false,
//     nextPage: skip + limit < total ? page + 1 : false,
//     pageCount: Math.ceil(total / limit),
//     totalRecords: total,
//   };

//   return pagedDto;
// }

// // ─── Drivers Earnings ─────────────────────────────────────────────────────────

// async getDriversEarnings(query: {
//   page?: number;
//   limit?: number;
//   search?: string;
// }) {
//   const { page = 1, limit = 10, search } = query;
//   const skip = (page - 1) * limit;

//   const qb = this.tripRepo
//     .createQueryBuilder('trip')
//     .leftJoinAndSelect('trip.driver', 'driver')
//     .leftJoinAndSelect('driver.user', 'user')
//     .leftJoinAndSelect('trip.vehicle', 'vehicle')
//     .where('trip.status = :status', { status: TripStatus.COMPLETED })
//     .orderBy('trip.createdAt', 'DESC')
//     .skip(skip)
//     .take(limit);

//   if (search) {
//     qb.andWhere(
//       `(
//         trip.departureLocation ILIKE :search OR
//         trip.arrivalDestination ILIKE :search OR
//         trip.departureDate::text ILIKE :search OR
//         trip.status ILIKE :search OR
//         user.firstName ILIKE :search OR
//         user.lastName ILIKE :search OR
//         user.email ILIKE :search 
//       )`,
//       { search: `%${search}%` },
//     );
//   }

//   const [data, total] = await qb.getManyAndCount();

//   // Calculate earnings per trip from bookings
//   const tripsWithEarnings = await Promise.all(
//     data.map(async (trip) => {
//       const earningsResult = await this.bookingRepo
//         .createQueryBuilder('b')
//         .select("COALESCE(SUM((b.metadata->>'netDriverAmount')::numeric), 0)", 'total')
//         .where('b.tripId = :tripId', { tripId: trip.id })
//         .andWhere("(b.metadata->>'driverCredited')::boolean IS TRUE")
//         .getRawOne();

//       return {
//         trip_id: trip.id,
//         departure_location: trip.departureLocation,
//         arrival_location: trip.arrivalDestination,
//         departure_date: trip.departureDate,
//         departure_time: trip.departureTime,
//         arrival_date: trip.arrivalDate,
//         arrival_time: trip.arrivalTime,
//         status: trip.status,
//         driver: trip.driver?.user
//           ? {
//               id: trip.driver.id,
//               name: `${trip.driver.user.firstName} ${trip.driver.user.lastName}`,
//               email: trip.driver.user.email,
//               phone: trip.driver.user.phone,
//             }
//           : null,
//         total_earned: parseFloat(earningsResult?.total ?? '0') / 100,
//       };
//     }),
//   );

//   const pagedDto = new PagedDto();
//   pagedDto.data = tripsWithEarnings;
//   pagedDto.meta = {
//     page,
//     limit,
//     count: data.length,
//     previousPage: page > 1 ? page - 1 : false,
//     nextPage: skip + limit < total ? page + 1 : false,
//     pageCount: Math.ceil(total / limit),
//     totalRecords: total,
//   };

//   return pagedDto;
// }

// // ─── Agents Earnings ──────────────────────────────────────────────────────────

// async getAgentsEarnings(query: { page?: number; limit?: number }) {
//   const { page = 1, limit = 10 } = query;
//   const skip = (page - 1) * limit;

//   const [data, total] = await this.payoutRepo.findAndCount({
//     where: { payoutableType: 'agent' },
//     relations: ['agent.user', 'beneficiary'],
//     skip,
//     take: limit,
//     order: { createdAt: 'DESC' },
//   });

//   const pagedDto = new PagedDto();
//   pagedDto.data = data.map((p) => ({
//     id: p.id,
//     amount: Number(p.amount ?? 0) / 100,
//     status: p.status,
//     reference: p.reference,
//     agent: p.agent?.user
//       ? {
//           id: p.agent.id,
//           name: `${p.agent.user.firstName} ${p.agent.user.lastName}`,
//           email: p.agent.user.email,
//         }
//       : null,
//     created_at: p.createdAt,
//   }));
//   pagedDto.meta = {
//     page,
//     limit,
//     count: data.length,
//     previousPage: page > 1 ? page - 1 : false,
//     nextPage: skip + limit < total ? page + 1 : false,
//     pageCount: Math.ceil(total / limit),
//     totalRecords: total,
//   };

//   return pagedDto;
// }



// private getReportRange(filter: 'daily' | 'monthly' | 'yearly' = 'monthly') {
//   const now = new Date();
//   if (filter === 'daily')  return { start: startOfDay(now),   end: endOfDay(now) };
//   if (filter === 'yearly') return { start: startOfYear(now),  end: endOfYear(now) };
//   return { start: startOfMonth(now), end: endOfMonth(now) }; // monthly (default)
// }


// }







