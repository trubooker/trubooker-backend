import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';

import { Admin } from '@modules/core/entities/admin.entity';
import { AdminRepository } from '@adapters/repositories/admin.repository';
import { EntityManager, Repository } from 'typeorm';
import { AdminListQueryDto, UpdateAdminProfileDto, UpdateDriverDocumentDto } from '../dtos/admin.dto';
import { HashingUtil } from '@shared/utils/hashing/hashing.utils';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from '@modules/email/email.service';
import { RandomnessUtil } from '@shared/utils/encryption/randomness.util';
import { Role } from '@modules/core/entities/role.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { CloudinaryService } from '@modules/cloudinary/services/cloudinary.service';
import { UpdatePasswordDto } from '../dtos/updatePassword.dto';
import { AddDriverDocumentsDto, UploadDriverDocumentDto } from '../dtos/adddoc.dto';
import { RedisCacheService } from '@modules/cache/redis-cache.service';
import { CACHE_KEYS, CACHE_TTL } from '@modules/cache/redis-cache.constants';
import { AdminNotificationActivityQuery, DocumentStatus, UserStatus } from 'src/types/enums';
import { CreateSubAdminDto } from '../dtos/create-subadmin.dto';
import { DriverRepository } from '@adapters/repositories/driver.repository';
import { VehicleRepository } from '@adapters/repositories/vehicle.repository';
import { Vehicle } from '@modules/core/entities/vehicle.entity';


@Injectable()
export class AdminService {
  constructor(
    private readonly adminRepo: AdminRepository,
    private readonly hashingUtil: HashingUtil,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly randomnessUtil: RandomnessUtil,
    private readonly configService: ConfigService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly cache: RedisCacheService, 
    private readonly driverRepo: DriverRepository,
    private readonly vehicleRepo: VehicleRepository,

    @InjectRepository(Role)
  private readonly roleRepository: Repository<Role>
  
  ) {}

private static readonly VEHICLE_DOC_TYPES = ['insurance', 'registration_doc', 'vehicle'];

async getDashboardStats(query: { page?: number; limit?: number } = {}) {
  const page = query?.page ?? 1;
  const limit = query?.limit ?? 20;
  const key = `${CACHE_KEYS.DASHBOARD_STATS}:${page}:${limit}`;
  return this.cache.getOrSet(
    key,
    () => this.adminRepo.getDashboardStats(query ?? {}),
    CACHE_TTL.MEDIUM,
  );
}

 async addVehicleForDriver(
    rawBody: Record<string, any>,
    files: Express.Multer.File[] = [],
  ) {
    const driverId = rawBody?.driver_id;
    if (!driverId) {
      throw new BadRequestException('driver_id is required');
    }

    // driver_id may be either the drivers.id PK or the underlying users.id —
    // support both so the frontend doesn't need to know which one it has.
    const driver = await this.driverRepo.findByIdOrUserId(driverId);
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const vehicleTypeId = rawBody?.vehicle_type_id;
    if (!vehicleTypeId) {
      throw new BadRequestException('vehicle_type_id is required');
    }
    const vehicleType = await this.driverRepo.getVehicleTypeById(vehicleTypeId);
    if (!vehicleType) {
      throw new NotFoundException('Vehicle type not found');
    }

    const model = rawBody?.model;
    const licensePlateNumber = rawBody?.license_plate_number;
    const color = rawBody?.color;
    const capacity = Number(rawBody?.capacity);

    if (!model || !licensePlateNumber || !color || !capacity || Number.isNaN(capacity)) {
      throw new BadRequestException('model, license_plate_number, capacity and color are required');
    }

    const plateTaken = await this.vehicleRepo.findByPlateOrLicense(licensePlateNumber);
    if (plateTaken) {
      throw new BadRequestException('A vehicle with this plate number already exists');
    }

    const features = this.extractIndexedFormArray(rawBody, 'features');

    const photoFiles = (files ?? []).filter((f) => f.fieldname?.startsWith('photos'));
    if (photoFiles.length < 3) {
      throw new BadRequestException('At least 3 vehicle photos are required');
    }

    const vehiclePhoto: string[] = [];
    for (const file of photoFiles) {
      const uploaded = await this.cloudinaryService.upload(file, {
        resource_type: 'image',
        folder: `vehicles/${driver.id}/photos`,
      });
      vehiclePhoto.push(uploaded.secure_url);
    }

    const vehicle = await this.vehicleRepo.createVehicle({
      driverId: driver.id,
      type: vehicleType.name,
      model,
      plateNumber: licensePlateNumber,
      licensePlateNumber,
      capacity,
      color,
      features,
      vehiclePhoto,
      isActive: true,
      isVerified: false,
    });

    await this.driverRepo.update({ id: driver.id }, { vehicleId: vehicle.id });

    return vehicle;
  }


  async getDrivers(query: {
  page?: number;
  limit?: number;
  search?: string;
}){
  
    return await this.adminRepo.getDrivers(query)
  }

async getPassengers(query: {
  page?: number;
  limit?: number;
  search?: string;
}){
  
    return await this.adminRepo.getPassengers(query)
  }

  async getTripsWithPassenger(tripId: string, query: { page?: number; limit?: number }){
    return await this.adminRepo.getTripWithPassengers(tripId, query)
  }

  async getDriverWithDetalis(id: string, query: { page?: number; limit?: number }){
    return await this.adminRepo.getDriverWithDetails(id, query)
  }

    async deleteUser(id: string, adminId: string, reason?: string) {
    return await this.adminRepo.deleteUser(id, adminId, reason);
  }

  async getPassengerWithDetails(id: string, query: { page?: number; limit?: number }){
    return await this.adminRepo.getPassengerWithDetails(id, query)
  }

  async toggleDriverStatus(id:string){
    return await this.adminRepo.toggleDriverStatus(id)
  }
// -------------------------
async getFinancialReport(query: {
  page?: number;
  limit?: number;
  filter_by?: 'daily' | 'monthly' | 'yearly';
}) {
  return await this.adminRepo.getFinancialReport(query);
}

  async getRevenueGraph(){
    return await this.adminRepo.getRevenueGraph()
  }

  async getTransactionHistory(query: { page?: number; limit?: number }){
    return await this.adminRepo.getTransactionHistory(query)
  }

  async getRefundRequests(query: { page?: number; limit?: number }){
    return await this.adminRepo.getRefundRequests(query)
  }

  async getDriversEarnings(query: { page?: number; limit?: number }){
    return await this.adminRepo.getDriversEarnings(query)
  }

  async getAgentsEarnings(query: { page?: number; limit?: number }){
    return await this.adminRepo.getAgentsEarnings(query)
  }

async createSubAdmin(creatorAdminId: string, dto: CreateSubAdminDto) {
  const existing = await this.adminRepo.findByEmail(dto.email);
  if (existing) throw new ConflictException('Email already in use');

  const role = await this.roleRepository.findOne({ where: { name: dto.role } });
  if (!role) throw new NotFoundException(`Role '${dto.role}' not found`);

  // Temporary password the sub-admin uses for first login
  const tempPassword = this.randomnessUtil.generateRandomStringWithNumbers(10);
  const hashedPassword = await this.hashingUtil.hash(tempPassword);

  const subAdmin = await this.adminRepo.createAdmin({
    email: dto.email.toLowerCase().trim(),
    firstName: dto.firstName,
    lastName: dto.lastName,
    fullName: `${dto.firstName} ${dto.lastName}`,
    phone: dto.phoneNumber,
    roleId: role.id,
    role: role.name,
    password: hashedPassword,
    city: dto.city,
    country: dto.country,
    address: dto.address,
    gender: dto.gender,
    isEmailVerified: true,        // provisioned by an admin
    status: UserStatus.ACTIVE,
    createdBy: creatorAdminId,    // BaseEntity column
  });

  // Email the temporary credentials (uses the generic send())
  const emailResult = await this.emailService.send({
    to: dto.email,
    subject: 'Your Tru Booker admin account',
    html: `
      <p>Hi ${dto.firstName},</p>
      <p>An admin account has been created for you with the role
         <strong>${role.name}</strong>.</p>
      <p>Your temporary password is: <strong>${tempPassword}</strong></p>
      <p>Please log in and change it immediately.</p>
    `,
  });

  if (!emailResult.success) {
  // roll the sub-admin back, or surface a clear warning to the caller
  throw new InternalServerErrorException(
    'Sub-admin created but the credentials email failed to send. Reset the password before they can log in.',
  );
}

  return {
    id: subAdmin.id,
    email: subAdmin.email,
    fullName: subAdmin.fullName,
    role: subAdmin.role,
    status: subAdmin.status,
  };
}

// ─── Vehicle Verification ────────────────────────────────────────────────
  async listPendingVehicles(query: AdminListQueryDto) {
    return await this.adminRepo.listPendingVehicles(query);
  }

  async approveVehicle(vehicleId: string, adminEmail: string) {
    return await this.adminRepo.approveVehicle(vehicleId, adminEmail);
  }

  

  async rejectVehicle(vehicleId: string, reason: string, adminEmail: string) {
    return await this.adminRepo.rejectVehicle(vehicleId, reason, adminEmail);
  }

  // --------------------------
  async togglePassengerStatus(id: string){
    return this.adminRepo.togglePassengerStatus(id)
  }

  async toggleAgentStatus(id: string){
    return this.adminRepo.toggleAgentStatus(id);
  }

  async getAgentReferrals(id: string, query: { page?: number; limit?: number }){
    return this.adminRepo.getAgentReferrals(id, query)
  }

  
  async getAgentWithDetails(id: string){
    return this.adminRepo.getAgentWithDetails(id)
  }

  async getAgentById(id: string){
    return this.adminRepo.getAgentById(id)
  }

  async getAgents(query: { page?: number; limit?: number }){
    return this.adminRepo.getAgents(query);
  }
  // ---------------------------------//
  async getDriverById(id: string){
    return await this.adminRepo.getDriverById(id)
  }

  async getDriverVehicleId(id:string){
    return await this.adminRepo.getDriverVehicle(id);
  }

  async getPassengerById(id: string){
    return await this.adminRepo.getPassengerById(id)
  }

  async listUsers(query: AdminListQueryDto) {
    return await this.adminRepo.listUsers(query);
  }

  async getUser(id: string) {
    return await this.adminRepo.getUser(id);
  }

  async suspendUser(id: string, reason?: string) {
    return await this.adminRepo.suspendUser(id, reason);
  }

  async activateUser(id: string) {
    return await this.adminRepo.activateUser(id);
  }

  async activateDriver(id: string){
    return await this.adminRepo.activateDriver(id);
  }

  async getDriverDocHistory(id: string){
    return await this.adminRepo.getDriverDocumentHistory(id);
  }

    async approveAgent(id: string){
    return await this.adminRepo.approveAgent(id);
  }

  async getAdminNotificationActivity(query: AdminNotificationActivityQuery){
    return await this.adminRepo.getNotificationActivityForAdmin(query);
  }

  async rejectAgent(id: string, reason?: string){
    return await this.adminRepo.rejectAgent(id, reason);
  }

  async fetchDriversDocuments(id: string) {
  return await this.adminRepo.fetchDriversDocuments(id);
}

  async updateDriverDocuments(id: string, dto:UpdateDriverDocumentDto){
    return await this.adminRepo.updateDriverDocuments(id, dto)
  }
  
  async addDriverDocuments(id: string, dto: UploadDriverDocumentDto, documentUrl: string){
    return await this.adminRepo.addDriverDocuments(id, dto, documentUrl)
  }

async addDriverDocumentFile(
  id: string,
  dto: UploadDriverDocumentDto,
  file?: Express.Multer.File,
) {
  if (!file) {
    throw new BadRequestException('Document file is required');
  }

  const isVehicleDoc = AdminService.VEHICLE_DOC_TYPES.includes(dto.documentType);

  if (isVehicleDoc) {
    if (!dto.vehicleId) {
      throw new BadRequestException(
        `vehicleId is required for documentType "${dto.documentType}"`,
      );
    }

    const vehicle = await this.vehicleRepo.findOne({
      where: { id: dto.vehicleId, driverId: id },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found for this driver');
    }

    const uploaded = await this.cloudinaryService.upload(file, {
      folder: `vehicles/${vehicle.id}/documents`,
    });

    const update: Record<string, any> = {
      verificationStatus: 'pending',
      rejectionReason: null,
    };

    if (dto.documentType === 'insurance') {
      update.insurance = uploaded.secure_url;
    } else if (dto.documentType === 'registration_doc') {
      update.registrationDoc = uploaded.secure_url;
    } else {
      update.vehiclePhoto = [...(vehicle.vehiclePhoto ?? []), uploaded.secure_url];
    }

    await this.vehicleRepo.update({ id: vehicle.id }, update);
    return { ...vehicle, ...update };
  }

  // license / other → driver document, matches the real 3-arg repo signature
  const uploaded = await this.cloudinaryService.upload(file, {
    folder: `drivers/${id}/documents`,
  });

  return this.adminRepo.addDriverDocuments(id, dto, uploaded.secure_url);
}



  async deleteDriverDocHistory(id: string){
    return await this.adminRepo.deleteDriverDocumentHistory(id); 
  }

 async updateProfile(
    id: string,
    dto: UpdateAdminProfileDto,
    file?: Express.Multer.File,
    entityManager?: EntityManager,
  ) {
    if (file) {
      const uploaded = await this.cloudinaryService.upload(file, {
        folder: `admin/${id}/profile`,
        resource_type: 'image',
      });
      dto.profilePhoto = uploaded.secure_url; // repository maps this onto User.profilePhoto
    }
    return this.adminRepo.updateUser(id, dto, entityManager);
  }

  async getProfile(id: string) {
    return await this.adminRepo.getProfile(id);
  }
  async listPendingDocuments(query: AdminListQueryDto) {
    return await this.adminRepo.listPendingDocuments(query);
  }

  async reviewDocument(documentId: string, approve: boolean, reason?: string, email?: string) {
    return await this.adminRepo.reviewDocument(documentId, approve, reason, email);
  }

  async approveDocument(documentId: string, email: string) {
    return await this.adminRepo.approveDocument(documentId, email);
  }

  async rejectDocument(documentId: string, reason: string, email: string) {
    return await this.adminRepo.rejectDocument(documentId, reason, email);
  }

  async listTrips(query: AdminListQueryDto) {
    return await this.adminRepo.listTrips(query);
  }

  async getTrip(id: string) {
    return await this.adminRepo.getTrip(id);
  }

  async listBookings(query: AdminListQueryDto) {
    return await this.adminRepo.listBookings(query);
  }
async getTotalApproveDriver(){
  return await this.adminRepo.getApprovedDriversCount();
}

async noVehicleUploaded(){
  return await this.adminRepo.noVehicleUploaded();
}
  async getBooking(id: string) {
    return await this.adminRepo.getBooking(id);
  }

  async refundBooking(bookingId: string, reason: string) {
    return await this.adminRepo.refundBooking(bookingId, reason);
  }

  async listPayouts(query: AdminListQueryDto) {
    return await this.adminRepo.listPayouts(query);
  }

  async approvePayout(payoutId: string, email: string) {
    return await this.adminRepo.approvePayout(payoutId, email);
  }

  async declinePayout(payoutId: string, reason: string, email: string) {
    return await this.adminRepo.declinePayout(payoutId, reason, email);
  }

  async listCoupons(query: AdminListQueryDto) {
    return await this.adminRepo.listCoupons(query);
  }

  async createCoupon(dto: any) {
    return await this.adminRepo.createCoupon(dto);
  }

  async deactivateCoupon(couponId: string) {
    return await this.adminRepo.deactivateCoupon(couponId);
  }

  async updatePassword(
  adminId: string,
  dto:UpdatePasswordDto,

): Promise<{ message: string }> {
  const admin = await this.adminRepo.findByIdWithPassword(adminId);

  const isMatch = await this.hashingUtil.compare(dto.currentPassword, admin.password);
  if (!isMatch) throw new BadRequestException('Current password is incorrect');

  const isSame = await this.hashingUtil.compare(dto.newPassword, admin.password);
  if (isSame)
    throw new BadRequestException(
      'New password must be different from the current password',
    );

  const hashed = await this.hashingUtil.hash(dto.newPassword);
  return this.adminRepo.updatePassword(adminId, hashed);
}


async updateVehicleForDriver(
  rawBody: Record<string, any>,
  files: Express.Multer.File[] = [],
) {
  const vehicleId = rawBody?.vehicle_id;
  if (!vehicleId) {
    throw new BadRequestException('vehicle_id is required');
  }

  const vehicle = await this.vehicleRepo.findOne({ where: { id: vehicleId } });
  if (!vehicle) {
    throw new NotFoundException('Vehicle not found');
  }

  const update: Partial<Vehicle> = {};

  // Optional vehicle-type change
  if (rawBody?.vehicle_type_id) {
    const vehicleType = await this.driverRepo.getVehicleTypeById(rawBody.vehicle_type_id);
    if (!vehicleType) throw new NotFoundException('Vehicle type not found');
    update.type = vehicleType.name;
  }

  // Scalar fields — only set the ones actually sent
  if (rawBody?.model !== undefined) update.model = rawBody.model;
  if (rawBody?.make !== undefined) update.make = rawBody.make;
  if (rawBody?.year !== undefined) update.year = rawBody.year;
  if (rawBody?.color !== undefined) update.color = rawBody.color;
  if (rawBody?.insurance !== undefined) update.insurance = rawBody.insurance;

  if (rawBody?.capacity !== undefined) {
    const capacity = Number(rawBody.capacity);
    if (Number.isNaN(capacity)) {
      throw new BadRequestException('capacity must be a number');
    }
    update.capacity = capacity;
  }

  // Plate change — enforce uniqueness against OTHER vehicles
  const newPlate = rawBody?.license_plate_number;
  if (newPlate && newPlate !== vehicle.plateNumber) {
    const plateTaken = await this.vehicleRepo.findByPlateOrLicense(newPlate);
    if (plateTaken && plateTaken.id !== vehicle.id) {
      throw new BadRequestException('A vehicle with this plate number already exists');
    }
    update.plateNumber = newPlate;
    update.licensePlateNumber = newPlate;
  }

  // Features array (features[0], features[1], ... from multipart)
  const features = this.extractIndexedFormArray(rawBody, 'features');
  if (features.length > 0) {
    update.features = features;
  }

  // New photos (optional) — if any are sent, replace the whole set
  const photoFiles = (files ?? []).filter((f) => f.fieldname?.startsWith('photos'));
  if (photoFiles.length > 0) {
    const vehiclePhoto: string[] = [];
    for (const file of photoFiles) {
      const uploaded = await this.cloudinaryService.upload(file, {
        resource_type: 'image',
        folder: `vehicles/${vehicle.driverId}/photos`,
      });
      vehiclePhoto.push(uploaded.secure_url);
    }
    update.vehiclePhoto = vehiclePhoto;
  }

  // New registration document (optional)
  const registrationFile = (files ?? []).find(
    (f) => f.fieldname === 'registrationDoc' || f.fieldname?.startsWith('registrationDoc'),
  );
  if (registrationFile) {
    const uploaded = await this.cloudinaryService.upload(registrationFile, {
      resource_type: 'auto',
      folder: `vehicles/${vehicle.driverId}/documents`,
    });
    update.registrationDoc = uploaded.secure_url;
  }

  if (Object.keys(update).length === 0) {
    throw new BadRequestException('No fields provided to update');
  }

  // Policy: if identity-relevant fields change on an already-approved vehicle,
  // send it back for re-verification. Delete this block to allow silent edits.
  const identityChanged =
    update.plateNumber !== undefined ||
    update.model !== undefined ||
    update.registrationDoc !== undefined;

  if (identityChanged && vehicle.verificationStatus === DocumentStatus.APPROVED) {
    update.verificationStatus = DocumentStatus.PENDING;
    update.isVerified = false;
    update.rejectionReason = null;
  }

  Object.assign(vehicle, update);
  return this.vehicleRepo.save(vehicle);
}


  generateTokens(user: Admin): { accessToken: string; refreshToken: string } {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('common.auth.jwt.accessSecret'),
      expiresIn: this.configService.get<string>('common.auth.jwt.accessExpiresIn'),
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('common.auth.jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('common.auth.jwt.refreshExpiresIn'),
    });
    return { accessToken, refreshToken };
  }

  private extractIndexedFormArray(body: Record<string, any>, prefix: string): string[] {
    return Object.keys(body ?? {})
      .filter((key) => key.startsWith(`${prefix}[`))
      .sort((a, b) => {
        const ai = Number(a.match(/\[(\d+)\]/)?.[1] ?? 0);
        const bi = Number(b.match(/\[(\d+)\]/)?.[1] ?? 0);
        return ai - bi;
      })
      .map((key) => body[key]);
  }
}
