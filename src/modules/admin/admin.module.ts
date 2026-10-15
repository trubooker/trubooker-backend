import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { User } from '@modules/core/entities/user.entity';
import { Driver } from '@modules/core/entities/driver.entity';
import { Trip } from '@modules/core/entities/trip.entity';
import { Booking } from '@modules/core/entities/booking.entity';
import { Payout } from '@modules/core/entities/payout.entity';
import { DocumentVerification } from '@modules/core/entities/document-verification.entity';
import { Coupon } from '@modules/core/entities/coupon.entity';
import { Passenger } from '@modules/core/entities/passenger.entity';
import { Admin } from '@modules/core/entities/admin.entity';
import { Role } from '@modules/core/entities/role.entity';

import { PaystackAdapter } from '@adapters/payment/paystack/paystack.adapter';
import { PaystackProvider } from '@adapters/payment/paystack/providers/paystack.provider';
import { AdminRepository } from '@adapters/repositories/admin.repository';
import { UserRepository } from '@adapters/repositories/user.repository';

import { Broker } from '@broker/broker';
import { RandomnessUtil } from '@shared/utils/encryption/randomness.util';
import { BcryptHashingUtil } from '@shared/utils/hashing/bcrypt.utils';
import { HashingUtil } from '@shared/utils/hashing/hashing.utils';

import { AdminService } from './services/admin.service';
import { AdminController } from './controllers/admin.controller';



// ─── Dashboard ───────────────────────────────────────────────────────────────
import { GetDashboardUsecase } from './usecases/getdashboard.usecase';

// ─── Users ───────────────────────────────────────────────────────────────────
import { ListUsersUsecase } from './usecases/listuser.usecase';
import { GetUserUsecase } from './usecases/getuser.usecase';
import { SuspendUserUsecase } from './usecases/suspenduser.usecase';
import { ActivateUserUsecase } from './usecases/activateuser.usecase';

// ─── Documents ───────────────────────────────────────────────────────────────
import {
  ApproveDocumentUsecase,
  ListPendingDocumentsUsecase,
  RejectDocumentUsecase,
} from './usecases/document.usecase';

// ─── Trips ───────────────────────────────────────────────────────────────────
import { GetTripUsecase, ListTripsUsecase } from './usecases/trip.usecase';

// ─── Bookings ────────────────────────────────────────────────────────────────
import {
  GetBookingUsecase,
  ListBookingsUsecase,
  RefundBookingUsecase,
} from './usecases/booking.usecase';

// ─── Payouts ─────────────────────────────────────────────────────────────────
import {
  ApprovePayoutUsecase,
  DeclinePayoutUsecase,
  ListPayoutsUsecase,
} from './usecases/payout.usecase';

// ─── Coupons ─────────────────────────────────────────────────────────────────
import {
  CreateCouponUsecase,
  DeactivateCouponUsecase,
  ListCouponsUsecase,
} from './usecases/cupons.usecase';
import { Agent } from '@modules/core/entities/agent.entity';
import { CloudinaryModule } from '@modules/cloudinary/cloudinary.module';
import { GetAdminProfileUsecase } from './usecases/getprofile.usecase';
import { UpdatePasswordUsecase } from './usecases/updatepassword.usecase';
import { GetDriversUsecase } from './usecases/getdrivers.usecase';
import { GetDriverByIdUsecase } from './usecases/getdriverbyid.usecase';
import { ActivateDriverUsecase } from './usecases/activatedriver.usecase';
import { GetDriverHistoryUsecase } from './usecases/getdriverdochistory.usecase';
import { DeleteDriverDocHistoryUsecase } from './usecases/deletedriverdochis.usecase';
import { UpdateDriverDocUsecase } from './usecases/updatedriverdoc.usecase';
import { AddDriverDocUsecase } from './usecases/adddriverdoc.usecase';
import { Beneficiary } from '@modules/core/entities/beneficiary.entity';
import { GetPassengersUsecase } from './usecases/getpassenger.usecase';
import { GetPassengerByIdUsecase } from './usecases/getpassengerid.usecase';
import { Vehicle } from '@modules/core/entities/vehicle.entity';
import { GetDriverVehicleByIdUsecase } from './usecases/getdrivervehicle.usecase';
import { Review } from '@modules/core/entities/review.entity';
import { GetAgentsUsecase } from './usecases/getagents.usecase';
import { GetAgentByIdUsecase } from './usecases/getagentbyid.usecase';
import { GetAgentWithDetailUsecase } from './usecases/getagentdetails.usecase';
import { GetAgentReferralUsecase } from './usecases/getagentreferral.usecase';
import { ToggleAgentStatusUsecase } from './usecases/toggleagent.usecase';
import { ApproveAgentUsecase } from './usecases/approveagent.usecase';
import { RejectAgentUsecase } from './usecases/rejectagent.usecase';
import { TogglePassengerStatusUsecase } from './usecases/togglepassenger.usecase';
import { ToggledriverStatusUsecase } from './usecases/toggledriver.usecase';
import { GetFinacialReportUsecase } from './usecases/getfinacialreport.usecase';
import { FetchDriverDocUsecase } from './usecases/fetchdriverdoc.usecase';
import { GetDriverWithDetailUsecase } from './usecases/getdriverwithdetails.usecase';
import { CreateSubAdminUsecase } from './usecases/createsubadmin.usecase';
import { Permission } from '@modules/core/entities/permission.entity';
import { RolesController } from './controllers/roles.controller';
import { RolesService } from './services/roles.service';
import { AgentReferral } from '@modules/core/entities/agent-referral.entity';
import { Referral } from '@modules/core/entities/referal.entity';
import { AgentCommission } from '@modules/core/entities/agent-commission.entity';
import {
  GetDriversEarningsUsecase,
  GetAgentsEarningsUsecase,
  GetRefundRequestsUsecase,
} from './usecases/finance.usecase';
import { GetAdminNotificationActivityUseCase } from './usecases/getadminnotify.usecase';
import { Notification } from '@modules/core/entities/notification.entity';
import { Escrow } from '@modules/core/entities/escro.entity';
import { DriverModule } from '@modules/driver/driver.module';
import { AdminGetVehicleTypesUsecase } from './usecases/getvehicletypes.usecase';
import { DriverRepository } from '@adapters/repositories/driver.repository';
import { VehicleRepository } from '@adapters/repositories/vehicle.repository';
import { VehicleType } from '@modules/core/entities/vehicletype.entity';
import { ExpoService } from '@modules/notification/services/expo.service';
// ─── Vehicle Verification ───────────────────────────────────────────────────
import {
  ApproveVehicleUsecase,
  ListPendingVehiclesUsecase,
  RejectVehicleUsecase,
} from './usecases/vehicle-verification.usecase';
import { GetTotalApproveDriverUsecase } from './usecases/gettotalapprove.usecase';
import { NoVehicleUploadedUsecase } from './usecases/noVehicleUploaded.usecase';
import { AcGrantsModule } from '@shared/access-control/ac-grants.module';
import { DeleteUserUsecase } from './usecases/deleteuser.usecase';

const USECASES = [
  
  // Dashboard
  GetDashboardUsecase,
  // Users
  ListUsersUsecase,
  GetAgentByIdUsecase,
  GetAgentWithDetailUsecase,
  GetAgentReferralUsecase,
  ToggleAgentStatusUsecase,
  ApproveAgentUsecase,
  RejectAgentUsecase,
  TogglePassengerStatusUsecase,
  ToggledriverStatusUsecase,
  FetchDriverDocUsecase,
  GetDriverWithDetailUsecase,
  CreateSubAdminUsecase,
  GetAgentsUsecase,
  GetUserUsecase,
  SuspendUserUsecase,
  ActivateUserUsecase,
  GetDriverVehicleByIdUsecase,
  GetFinacialReportUsecase,
  // Documents
  ListPendingDocumentsUsecase,
  ApproveDocumentUsecase,
  RejectDocumentUsecase,
  GetPassengersUsecase,
  GetPassengerByIdUsecase,
    // Vehicle Verification
  ListPendingVehiclesUsecase,
  ApproveVehicleUsecase,
  RejectVehicleUsecase,
  GetTotalApproveDriverUsecase,
  NoVehicleUploadedUsecase,
  // Trips
  ListTripsUsecase,
  GetTripUsecase,
  UpdatePasswordUsecase,
  DeleteUserUsecase,
  GetDriversUsecase,
  GetDriverByIdUsecase,
  ActivateDriverUsecase,
  GetDriverHistoryUsecase,
  DeleteDriverDocHistoryUsecase,
  UpdateDriverDocUsecase,
  AddDriverDocUsecase,
  // Bookings
  ListBookingsUsecase,
  GetBookingUsecase,
  RefundBookingUsecase,
  GetAdminProfileUsecase,

  GetAdminNotificationActivityUseCase,
  // Payouts
  ListPayoutsUsecase,
  ApprovePayoutUsecase,
  DeclinePayoutUsecase,
  // Coupons
  ListCouponsUsecase,
  CreateCouponUsecase,
  DeactivateCouponUsecase,
];




@Module({
  imports: [
    CloudinaryModule,
    DriverModule,
    AcGrantsModule,
    TypeOrmModule.forFeature([
      
      Admin,
      Role,
      User,
      Driver,
      Trip,
      Booking,
      Payout,
      AgentReferral,
      DocumentVerification,
      Referral,
      AgentCommission,
      Coupon,
      Passenger,
      Agent,
      Escrow,
      Beneficiary,
      Vehicle,
      Permission,
      Review,
      Notification,
      VehicleType
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('common.auth.jwt.accessSecret'),
        signOptions: {
          expiresIn: configService.get<string>('common.auth.jwt.accessExpiresIn'),
        },
      }),
    }),
  ],
  controllers: [AdminController, RolesController],
  providers: [
    Broker,
    AdminService,
    AdminRepository,
    RolesService,
    UserRepository,
    PaystackAdapter,
    ExpoService,
    PaystackProvider,
      GetDriversEarningsUsecase,
  GetAgentsEarningsUsecase,
  GetRefundRequestsUsecase,
  AdminGetVehicleTypesUsecase,
      DriverRepository,
    VehicleRepository,
    { provide: HashingUtil, useClass: BcryptHashingUtil },
    RandomnessUtil,
    ...USECASES,
  ],
  exports: [AdminService, AdminRepository, UserRepository],
})
export class AdminModule {}

// import { Module } from '@nestjs/common';
// import { TypeOrmModule } from '@nestjs/typeorm';
// import { JwtModule } from '@nestjs/jwt/dist/jwt.module';
// import { ConfigModule, ConfigService } from '@nestjs/config';

// import { User } from '@modules/core/entities/user.entity';
// import { Driver } from '@modules/core/entities/driver.entity';
// import { Trip } from '@modules/core/entities/trip.entity';
// import { Booking } from '@modules/core/entities/booking.entity';
// import { Payout } from '@modules/core/entities/payout.entity';
// import { DocumentVerification } from '@modules/core/entities/document-verification.entity';
// import { Coupon } from '@modules/core/entities/coupon.entity';
// import { Passenger } from '@modules/core/entities/passenger.entity';
// import { Admin } from '@modules/core/entities/admin.entity';
// import { Role } from '@modules/core/entities/role.entity';

// import { PaystackAdapter } from '@adapters/payment/paystack/paystack.adapter';
// import { PaystackProvider } from '@adapters/payment/paystack/providers/paystack.provider';
// import { AdminRepository } from '@adapters/repositories/admin.repository';
// import { UserRepository } from '@adapters/repositories/user.repository';

// import { Broker } from '@broker/broker';
// import { RandomnessUtil } from '@shared/utils/encryption/randomness.util';
// import { BcryptHashingUtil } from '@shared/utils/hashing/bcrypt.utils';
// import { HashingUtil } from '@shared/utils/hashing/hashing.utils';

// import { AdminService } from './services/admin.service';
// import { AdminController } from './controllers/admin.controller';



// // ─── Dashboard ───────────────────────────────────────────────────────────────
// import { GetDashboardUsecase } from './usecases/getdashboard.usecase';

// // ─── Users ───────────────────────────────────────────────────────────────────
// import { ListUsersUsecase } from './usecases/listuser.usecase';
// import { GetUserUsecase } from './usecases/getuser.usecase';
// import { SuspendUserUsecase } from './usecases/suspenduser.usecase';
// import { ActivateUserUsecase } from './usecases/activateuser.usecase';

// // ─── Documents ───────────────────────────────────────────────────────────────
// import {
//   ApproveDocumentUsecase,
//   ListPendingDocumentsUsecase,
//   RejectDocumentUsecase,
// } from './usecases/document.usecase';

// // ─── Trips ───────────────────────────────────────────────────────────────────
// import { GetTripUsecase, ListTripsUsecase } from './usecases/trip.usecase';

// // ─── Bookings ────────────────────────────────────────────────────────────────
// import {
//   GetBookingUsecase,
//   ListBookingsUsecase,
//   RefundBookingUsecase,
// } from './usecases/booking.usecase';

// // ─── Payouts ─────────────────────────────────────────────────────────────────
// import {
//   ApprovePayoutUsecase,
//   DeclinePayoutUsecase,
//   ListPayoutsUsecase,
// } from './usecases/payout.usecase';

// // ─── Coupons ─────────────────────────────────────────────────────────────────
// import {
//   CreateCouponUsecase,
//   DeactivateCouponUsecase,
//   ListCouponsUsecase,
// } from './usecases/cupons.usecase';
// import { Agent } from '@modules/core/entities/agent.entity';
// import { CloudinaryModule } from '@modules/cloudinary/cloudinary.module';
// import { GetAdminProfileUsecase } from './usecases/getprofile.usecase';
// import { UpdatePasswordUsecase } from './usecases/updatepassword.usecase';
// import { GetDriversUsecase } from './usecases/getdrivers.usecase';
// import { GetDriverByIdUsecase } from './usecases/getdriverbyid.usecase';
// import { ActivateDriverUsecase } from './usecases/activatedriver.usecase';
// import { GetDriverHistoryUsecase } from './usecases/getdriverdochistory.usecase';
// import { DeleteDriverDocHistoryUsecase } from './usecases/deletedriverdochis.usecase';
// import { UpdateDriverDocUsecase } from './usecases/updatedriverdoc.usecase';
// import { AddDriverDocUsecase } from './usecases/adddriverdoc.usecase';
// import { Beneficiary } from '@modules/core/entities/beneficiary.entity';
// import { GetPassengersUsecase } from './usecases/getpassenger.usecase';
// import { GetPassengerByIdUsecase } from './usecases/getpassengerid.usecase';
// import { Vehicle } from '@modules/core/entities/vehicle.entity';
// import { GetDriverVehicleByIdUsecase } from './usecases/getdrivervehicle.usecase';
// import { Review } from '@modules/core/entities/review.entity';
// import { GetAgentsUsecase } from './usecases/getagents.usecase';
// import { GetAgentByIdUsecase } from './usecases/getagentbyid.usecase';
// import { GetAgentWithDetailUsecase } from './usecases/getagentdetails.usecase';
// import { GetAgentReferralUsecase } from './usecases/getagentreferral.usecase';
// import { ToggleAgentStatusUsecase } from './usecases/toggleagent.usecase';
// import { TogglePassengerStatusUsecase } from './usecases/togglepassenger.usecase';
// import { ToggledriverStatusUsecase } from './usecases/toggledriver.usecase';
// import { GetFinacialReportUsecase } from './usecases/getfinacialreport.usecase';
// import { FetchDriverDocUsecase } from './usecases/fetchdriverdoc.usecase';
// import { GetDriverWithDetailUsecase } from './usecases/getdriverwithdetails.usecase';
// import { CreateSubAdminUsecase } from './usecases/createsubadmin.usecase';
// import { Permission } from '@modules/core/entities/permission.entity';
// import { RolesController } from './controllers/roles.controller';
// import { RolesService } from './services/roles.service';
// import { AgentReferral } from '@modules/core/entities/agent-referral.entity';
// import { Referral } from '@modules/core/entities/referal.entity';
// import { AgentCommission } from '@modules/core/entities/agent-commission.entity';
// import {
//   GetDriversEarningsUsecase,
//   GetAgentsEarningsUsecase,
//   GetRefundRequestsUsecase,
// } from './usecases/finance.usecase';



// const USECASES = [
  
//   // Dashboard
//   GetDashboardUsecase,
//   // Users
//   ListUsersUsecase,
//   GetAgentByIdUsecase,
//   GetAgentWithDetailUsecase,
//   GetAgentReferralUsecase,
//   ToggleAgentStatusUsecase,
//   TogglePassengerStatusUsecase,
//   ToggledriverStatusUsecase,
//   FetchDriverDocUsecase,
//   GetDriverWithDetailUsecase,
//   CreateSubAdminUsecase,
//   GetAgentsUsecase,
//   GetUserUsecase,
//   SuspendUserUsecase,
//   ActivateUserUsecase,
//   GetDriverVehicleByIdUsecase,
//   GetFinacialReportUsecase,
//   // Documents
//   ListPendingDocumentsUsecase,
//   ApproveDocumentUsecase,
//   RejectDocumentUsecase,
//   GetPassengersUsecase,
//   GetPassengerByIdUsecase,
//   // Trips
//   ListTripsUsecase,
//   GetTripUsecase,
//   UpdatePasswordUsecase,
//   GetDriversUsecase,
//   GetDriverByIdUsecase,
//   ActivateDriverUsecase,
//   GetDriverHistoryUsecase,
//   DeleteDriverDocHistoryUsecase,
//   UpdateDriverDocUsecase,
//   AddDriverDocUsecase,
//   // Bookings
//   ListBookingsUsecase,
//   GetBookingUsecase,
//   RefundBookingUsecase,
//   GetAdminProfileUsecase,
//   // Payouts
//   ListPayoutsUsecase,
//   ApprovePayoutUsecase,
//   DeclinePayoutUsecase,
//   // Coupons
//   ListCouponsUsecase,
//   CreateCouponUsecase,
//   DeactivateCouponUsecase,
// ];




// @Module({
//   imports: [
//     CloudinaryModule,
//     TypeOrmModule.forFeature([
      
//       Admin,
//       Role,
//       User,
//       Driver,
//       Trip,
//       Booking,
//       Payout,
//       AgentReferral,
//       DocumentVerification,
//       Referral,
//       AgentCommission,
//       Coupon,
//       Passenger,
//       Agent,
//       Beneficiary,
//       Vehicle,
//       Permission,
//       Review,
//     ]),
//     JwtModule.registerAsync({
//       imports: [ConfigModule],
//       inject: [ConfigService],
//       useFactory: (configService: ConfigService) => ({
//         secret: configService.get<string>('common.auth.jwt.accessSecret'),
//         signOptions: {
//           expiresIn: configService.get<string>('common.auth.jwt.accessExpiresIn'),
//         },
//       }),
//     }),
//   ],
//   controllers: [AdminController, RolesController],
//   providers: [
//     Broker,
//     AdminService,
//     AdminRepository,
//     RolesService,
//     UserRepository,
//     PaystackAdapter,
//     PaystackProvider,
//       GetDriversEarningsUsecase,
//   GetAgentsEarningsUsecase,
//   GetRefundRequestsUsecase,
//     { provide: HashingUtil, useClass: BcryptHashingUtil },
//     RandomnessUtil,
//     ...USECASES,
//   ],
//   exports: [AdminService, AdminRepository, UserRepository],
// })
// export class AdminModule {}