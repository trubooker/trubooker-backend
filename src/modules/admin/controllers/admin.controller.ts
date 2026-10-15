import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { AdminOnly } from '@shared/decorators/roles.decorator';
import { AuthUser } from '@shared/decorators/authUser.decorator';
import { Broker } from '@broker/broker';
import { KillSwitchService } from '../../kill-switch/kill-switch.service';
import { SkipKillSwitch } from '../../kill-switch/kill-switch.guard';
import {
  AdminListQueryDto,
  CreateCouponDto,
  DeclinePayoutDto,
  RejectDocumentDto,
  SuspendUserDto,
  UpdateAdminProfileDto,
  UpdateDriverDocumentDto,
} from '../dtos/admin.dto';

import { ToggleKillSwitchDto } from '../../kill-switch/kill-switch.dto';


// ─── Dashboard ───────────────────────────────────────────────────────────────
import { GetDashboardUsecase } from '../usecases/getdashboard.usecase';

// ─── Users ───────────────────────────────────────────────────────────────────
import { ListUsersUsecase } from '../usecases/listuser.usecase';
import { GetUserUsecase } from '../usecases/getuser.usecase';
import { SuspendUserUsecase } from '../usecases/suspenduser.usecase';
import { ActivateUserUsecase } from '../usecases/activateuser.usecase';

// ─── Documents ───────────────────────────────────────────────────────────────
import {
  ApproveDocumentUsecase,
  ListPendingDocumentsUsecase,
  RejectDocumentUsecase,
} from '../usecases/document.usecase';

// ─── Trips ───────────────────────────────────────────────────────────────────
import { GetTripUsecase, ListTripsUsecase } from '../usecases/trip.usecase';

// ─── Bookings ────────────────────────────────────────────────────────────────
import {
  GetBookingUsecase,
  ListBookingsUsecase,
  RefundBookingUsecase,
} from '../usecases/booking.usecase';

// ─── Payouts ─────────────────────────────────────────────────────────────────
import {
  ApprovePayoutUsecase,
  DeclinePayoutUsecase,
  ListPayoutsUsecase,
} from '../usecases/payout.usecase';

// ─── Coupons ─────────────────────────────────────────────────────────────────
import {
  CreateCouponUsecase,
  DeactivateCouponUsecase,
  ListCouponsUsecase,
} from '../usecases/cupons.usecase';
import { ServiceName } from '@shared/decorators/servicename.decorators';
import { Permission } from 'src/types/enums/permission.enums';
import { PermissionsGuard } from '@shared/guards/permissions.guard';
import { RequirePermissions } from '@shared/decorators/permissions.decorator';
import { AdminService } from '../services/admin.service';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { GetAdminProfileUsecase } from '../usecases/getprofile.usecase';
import { UpdatePasswordUsecase } from '../usecases/updatepassword.usecase';
import { UpdatePasswordDto } from '../dtos/updatePassword.dto';
import { GetDriversUsecase } from '../usecases/getdrivers.usecase';
import { GetDriverByIdUsecase } from '../usecases/getdriverbyid.usecase';
import { ActivateDriverUsecase } from '../usecases/activatedriver.usecase';
import { GetDriverHistoryUsecase } from '../usecases/getdriverdochistory.usecase';
import { DeleteDriverDocHistoryUsecase } from '../usecases/deletedriverdochis.usecase';
import { UpdateDriverDocUsecase } from '../usecases/updatedriverdoc.usecase';
import { AddDriverDocUsecase } from '../usecases/adddriverdoc.usecase';
import { AddDriverDocumentsDto, UploadDriverDocumentDto  } from '../dtos/adddoc.dto';
import { GetPassengersUsecase } from '../usecases/getpassenger.usecase';
import { GetPassengerByIdUsecase } from '../usecases/getpassengerid.usecase';
import { GetDriverVehicleByIdUsecase } from '../usecases/getdrivervehicle.usecase';
import { GetAgentByIdUsecase } from '../usecases/getagentbyid.usecase';
import { GetAgentWithDetailUsecase } from '../usecases/getagentdetails.usecase';
import { GetAgentReferralUsecase } from '../usecases/getagentreferral.usecase';
import { GetAgentsUsecase } from '../usecases/getagents.usecase';
import { ToggleAgentStatusUsecase } from '../usecases/toggleagent.usecase';
import { ApproveAgentUsecase } from '../usecases/approveagent.usecase';
import { RejectAgentUsecase } from '../usecases/rejectagent.usecase';
import { ToggledriverStatusUsecase } from '../usecases/toggledriver.usecase';
import { TogglePassengerStatusUsecase } from '../usecases/togglepassenger.usecase';
import { FetchDriverDocUsecase } from '../usecases/fetchdriverdoc.usecase';
import { NotificationService } from '@modules/notification/services/notification.service';
import { CreateAnnouncementDto } from '@modules/notification/dtos/announcement.dto';
import { CreateSubAdminUsecase } from '../usecases/createsubadmin.usecase';
import { CreateSubAdminDto } from '../dtos/create-subadmin.dto';
import { GetFinacialReportUsecase } from '../usecases/getfinacialreport.usecase';
import {
  GetDriversEarningsUsecase,
  GetAgentsEarningsUsecase,
  GetRefundRequestsUsecase,
} from '../usecases/finance.usecase';
import { AdminNotificationActivityQueryDto } from '../dtos/admin-notification-query.dto';
import { GetAdminNotificationActivityUseCase } from '../usecases/getadminnotify.usecase';
import { AdminGetVehicleTypesUsecase } from '../usecases/getvehicletypes.usecase';
import { AdminAddVehicleDto } from '../dtos/add-vehicle.dto';
import { ApproveVehicleUsecase, ListPendingVehiclesUsecase, RejectVehicleUsecase } from '../usecases/vehicle-verification.usecase';
import { GetTotalApproveDriverUsecase } from '../usecases/gettotalapprove.usecase';
import { NoVehicleUploadedUsecase } from '../usecases/noVehicleUploaded.usecase';
import { AdminUpdateVehicleDto } from '../dtos/update-vehicle.dto';
import { DeleteUserUsecase } from '../usecases/deleteuser.usecase';
import { DeleteUserDto } from '@modules/auth/dtos/deleteuser.dto';



@ServiceName('admin') // For kill switch targeting
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly broker: Broker,
    private readonly killSwitchService: KillSwitchService,
    private readonly adminService: AdminService,
    
    private readonly getDriversUsecase:GetDriversUsecase,
    private readonly getDriversByIdUsecase:GetDriverByIdUsecase,
    private readonly activateDriverUsecase:ActivateDriverUsecase,
    private readonly getDriverDocHistoryUsecase:GetDriverHistoryUsecase,
    private readonly deleteDriverDocHistoryUsecase:DeleteDriverDocHistoryUsecase,
    private readonly updateDriverDocUsecase:UpdateDriverDocUsecase,
    private readonly addDriverDocUsecase:AddDriverDocUsecase,
    private readonly getPassengersUsecase:GetPassengersUsecase,
    private readonly getPassegerByIdUsecase:GetPassengerByIdUsecase,
    private readonly getDriverVehicleByIdUsecase:GetDriverVehicleByIdUsecase,
    private readonly createSubAdminUsecase: CreateSubAdminUsecase,

    private readonly getFinancialReportUsecase: GetFinacialReportUsecase,
private readonly getDriversEarningsUsecase: GetDriversEarningsUsecase,
private readonly getAgentsEarningsUsecase: GetAgentsEarningsUsecase,
private readonly getRefundRequestsUsecase: GetRefundRequestsUsecase,
private readonly getTotalApproveDriverUsecase:GetTotalApproveDriverUsecase,

    // Dashboard
    private readonly getDashboardUsecase: GetDashboardUsecase,

    // Users
    private readonly listUsersUsecase: ListUsersUsecase,
    private readonly getUserUsecase: GetUserUsecase,
    private readonly suspendUserUsecase: SuspendUserUsecase,
    private readonly activateUserUsecase: ActivateUserUsecase,
    private readonly getAdminProfileUsecase:GetAdminProfileUsecase,
    // Documents
    private readonly listPendingDocumentsUsecase: ListPendingDocumentsUsecase,
    private readonly approveDocumentUsecase: ApproveDocumentUsecase,
    private readonly rejectDocumentUsecase: RejectDocumentUsecase,

    // Trips
    private readonly listTripsUsecase: ListTripsUsecase,
    private readonly getTripUsecase: GetTripUsecase,

    // Bookings
    private readonly listBookingsUsecase: ListBookingsUsecase,
    private readonly getBookingUsecase: GetBookingUsecase,
    private readonly refundBookingUsecase: RefundBookingUsecase,

    // Payouts
    private readonly listPayoutsUsecase: ListPayoutsUsecase,
    private readonly approvePayoutUsecase: ApprovePayoutUsecase,
    private readonly declinePayoutUsecase: DeclinePayoutUsecase,

    // Coupons
    private readonly listCouponsUsecase: ListCouponsUsecase,
    private readonly createCouponUsecase: CreateCouponUsecase,
    private readonly deactivateCouponUsecase: DeactivateCouponUsecase,
    private readonly updatePasswordUsecase:UpdatePasswordUsecase,

    private readonly getAgentByIdUsecase:GetAgentByIdUsecase,
    private readonly getAgentWithDetailUsecase:GetAgentWithDetailUsecase,
    private readonly getAgentReferralUsecase:GetAgentReferralUsecase,
    private readonly getAgentUsecase:GetAgentsUsecase,
    private readonly toggleAgentStatusUsecase:ToggleAgentStatusUsecase,
    private readonly approveAgentUsecase:ApproveAgentUsecase,
    private readonly rejectAgentUsecase:RejectAgentUsecase,
    private readonly toggleDriverStatusUsecase:ToggledriverStatusUsecase,
    private readonly togglePassengerStatusUsecase:TogglePassengerStatusUsecase,
    private readonly fetchDriverDocUsecase:FetchDriverDocUsecase,
    private readonly notificationService: NotificationService,
    private readonly getAdminNotificationActivityUsecase: GetAdminNotificationActivityUseCase,
     private readonly adminGetVehicleTypesUsecase:AdminGetVehicleTypesUsecase,
     // Vehicle Verification
    private readonly listPendingVehiclesUsecase: ListPendingVehiclesUsecase,
    private readonly approveVehicleUsecase: ApproveVehicleUsecase,
    private readonly rejectVehicleUsecase: RejectVehicleUsecase,
    private readonly   noVehicleUploadedUsecase: NoVehicleUploadedUsecase,
    private readonly deleteUserUsecase: DeleteUserUsecase,
  ) {}






  // ─── Dashboard ───────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.DASHBOARD_VIEW)
  @Get('dashboard')
  @ApiOperation({ summary: 'Platform dashboard statistics' })
  @ApiBody({ type: AdminListQueryDto })
  getDashboard(@Query() query: AdminListQueryDto) {
    return this.broker.runUsecases([this.getDashboardUsecase], query);
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_VIEW)
  @Get('agent/:id')
  @ApiOperation({ summary: 'get Agent by Id' })
  @ApiParam({ name: 'id', type: String, description: 'Agent UUID' })
  getAgentById(@Param('id') id: string) {
    return this.broker.runUsecases([this.getAgentByIdUsecase], {id: id});
  }

  // ─── Vehicle Verification ────────────────────────────────────────────────────
 
  @ApiBearerAuth()
  @AdminOnly()
  @Get('vehicles/pending')
  @ApiOperation({ summary: 'List vehicles pending admin approval' })
  listPendingVehicles(@Query() query: AdminListQueryDto) {
    return this.broker.runUsecases([this.listPendingVehiclesUsecase], query);
  }

  @ApiBearerAuth()
  @AdminOnly()
  @Patch('vehicles/:id/approve')
  @ApiOperation({ summary: 'Approve a driver vehicle' })
  @ApiParam({ name: 'id', type: String, description: 'Vehicle UUID' })
  approveVehicle(@Param('id') id: string, @AuthUser() user: any) {
    return this.broker.runUsecases([this.approveVehicleUsecase], {
      id,
      adminEmail: user.email,
    });
  }

  @ApiBearerAuth()
  @AdminOnly()
  @Patch('vehicles/:id/reject')
  @ApiOperation({ summary: 'Reject a driver vehicle' })
  @ApiParam({ name: 'id', type: String, description: 'Vehicle UUID' })
  @ApiBody({ type: RejectDocumentDto })
  rejectVehicle(
    @Param('id') id: string,
    @Body() dto: RejectDocumentDto,
    @AuthUser() user: any,
  ) {
    return this.broker.runUsecases([this.rejectVehicleUsecase], {
      id,
      reason: dto.reason,
      adminEmail: user.email,
    });
  }

  // ─── Vehicle Verification ────────────────────────────────────────────────────


  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_VIEW)
  @Get('agent-details/:id')
  @ApiOperation({ summary: 'get Agent-details by Id' })
  @ApiParam({ name: 'id', type: String, description: 'Agent UUID' })
  getAgentDetail(@Param('id') id: string) {
    return this.broker.runUsecases([this.getAgentWithDetailUsecase], {id: id});
  }

  
@Get('anoucements')
@ApiOperation({ summary: 'Get all announcements' })
@ApiResponse({ status: 200, description: 'Announcements fetched successfully' })
async getAllAnnouncements() {
  return this.notificationService.getAllAnnouncements();
}


@ApiBearerAuth()
@AdminOnly()
@Post('drivers/update-vehicle')
@UseInterceptors(AnyFilesInterceptor())
@ApiConsumes('multipart/form-data')
@ApiOperation({ summary: 'Admin: update an existing vehicle for a driver' })
@ApiBody({ type: AdminUpdateVehicleDto })
@ApiResponse({ status: 200, description: 'Vehicle updated successfully' })
updateVehicleForDriver(
  @Body() body: any,
  @UploadedFiles() files: Express.Multer.File[],
) {
  return this.adminService.updateVehicleForDriver(body, files);
}

@AdminOnly()
@Get('drivers/approved/count')
@ApiOperation({ summary: 'Get total number of approved drivers' })
async getApprovedDriversCount() {
  return  this.broker.runUsecases([this.getTotalApproveDriverUsecase]);
}

@AdminOnly()
@Get('drivers/vehicle-uploaded/count')
@ApiOperation({ summary: 'Get total number of vehicle uploaded by drivers' })
async getVehicleUploadedCount() {
  return  this.broker.runUsecases([this.noVehicleUploadedUsecase]);
}


  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_VIEW)
  @Get('vehicle-types')
  @ApiOperation({ summary: 'Get list of vehicle types' })
  getVehicleTypes() {
    return this.broker.runUsecases([this.adminGetVehicleTypesUsecase]);
  }

  @ApiBearerAuth()
  @AdminOnly()
  @Post('anoucements/create')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Create announcement' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Announcement created successfully' })
  async createAnnouncement(
    @Body() dto: CreateAnnouncementDto,
    @AuthUser() user: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.notificationService.createAnnouncement(dto, file, user);
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_VIEW)
  @Get('agent-referral/:id')
  @ApiOperation({ summary: 'get Agent-referral by Id' })
  @ApiParam({ name: 'id', type: String, description: 'Agent UUID' })
  @ApiBody({ type: AdminListQueryDto })
  getAgentReferral(@Param('id') id: string, @Query() query: AdminListQueryDto) {
    return this.broker.runUsecases([this.getAgentReferralUsecase], {id: id, query: query});
  }


@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@AdminOnly()
@Get('notify/activity')
async getAdminNotificationActivity(@Query() query: AdminNotificationActivityQueryDto) {
  return this.broker.runUsecases([this.getAdminNotificationActivityUsecase], query);
}


@ApiBearerAuth()
@AdminOnly()
@Post('sub-admins')
@ApiOperation({ summary: 'Create a sub-admin account' })
@ApiBody({ type: CreateSubAdminDto })
createSubAdmin(@Body() dto: CreateSubAdminDto, @AuthUser() user: any) {
  return this.broker.runUsecases([this.createSubAdminUsecase], {
    creatorId: user.sub,
    dto,
  });
}

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_VIEW)
  @Get('agents')
  @ApiOperation({ summary: 'get Agents ' })
  @ApiBody({ type: AdminListQueryDto })
  getAgents(@Query() query: AdminListQueryDto) {
    return this.broker.runUsecases([this.getAgentUsecase], {query: query});
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_ACTIVATE)
  @Patch('toggle-agents/:id')
  @ApiOperation({ summary: 'toggle-Agents ' })
  @ApiParam({ name: 'id', type: String, description: 'toggle Agent UUID' })
  toogleAgent(@Param('id') id: string) {
    return this.broker.runUsecases([this.toggleAgentStatusUsecase], {id: id});
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_ACTIVATE)
  @Patch('agent/:id/approve')
  @ApiOperation({ summary: 'Approve a pending agent — unblocks agent login' })
  @ApiParam({ name: 'id', type: String, description: 'Agent UUID' })
  approveAgent(@Param('id') id: string) {
    return this.broker.runUsecases([this.approveAgentUsecase], { id });
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_ACTIVATE)
  @Patch('agent/:id/reject')
  @ApiOperation({ summary: 'Reject/suspend an agent — blocks agent login' })
  @ApiParam({ name: 'id', type: String, description: 'Agent UUID' })
  rejectAgent(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.broker.runUsecases([this.rejectAgentUsecase], { id, reason });
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_ACTIVATE)
  @Patch('toggle-driver/:id')
  @ApiOperation({ summary: 'toggle-driver ' })
  @ApiParam({ name: 'id', type: String, description: 'toggle driver UUID' })

  toogleDriver(@Param('id') id: string) {
    return this.broker.runUsecases([this.toggleDriverStatusUsecase], {id: id});
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_ACTIVATE)
  @Patch('toggle-passenger/:id')
  @ApiOperation({ summary: 'toggle-passenger ' })
  @ApiParam({ name: 'id', type: String, description: 'toggle passenger UUID' })
  tooglePassenger(@Param('id') id: string) {
    return this.broker.runUsecases([this.togglePassengerStatusUsecase], {id: id});
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_VIEW)
  @Get('drivers')
  @ApiOperation({ summary: 'get all drivers' })
  @ApiBody({ type: AdminListQueryDto })
  getDrivers(@Query() query: AdminListQueryDto) {
    return this.broker.runUsecases([this.getDriversUsecase], query);
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_VIEW)
  @Get('passengers')
  @ApiOperation({ summary: 'get all passengers' })
  @ApiBody({ type: AdminListQueryDto })
  getPassengers(@Query() query: AdminListQueryDto) {
    return this.broker.runUsecases([this.getPassengersUsecase], query);
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_VIEW)
  @Get('drivers/:id')
  @ApiOperation({ summary: 'Get driver by ID' })
  @ApiParam({ name: 'id', type: String, description: 'get driver by id' })
  getDriverById(@Param('id') id: string) {
    return this.broker.runUsecases([this.getDriversByIdUsecase], { id });
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_VIEW)
  @Get('drivers/vehicles/:id')
  @ApiOperation({ summary: 'Get driver vehicles by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Get driver vehicles by ID' })
  getDriverVehicle(@Param('id') id: string) {
    return this.broker.runUsecases([this.getDriverVehicleByIdUsecase], { id });
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_VIEW)
  @Get('passengers/:id')
  @ApiOperation({ summary: 'Get passenger by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Get passenger by ID' })
  getPassengerById(@Param('id') id: string) {
    return this.broker.runUsecases([this.getPassegerByIdUsecase], { id });
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_VIEW)
  @Get('drivers/document-history/:id')
  @ApiOperation({ summary: 'Get driver doc history by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Get driver doc history by ID' })
  getDriverDocHistory(@Param('id') id: string) {
    return this.broker.runUsecases([this.getDriverDocHistoryUsecase], { id: id });
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_VIEW)
  @Get('drivers/fetch-drivers-document/:driverId')
  @ApiOperation({ summary: 'Get driver doc history by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Get driver doc  by ID' })
  async fetchDriversDocuments(@Param('driverId') driverId: string) {
    return this.broker.runUsecases([this.fetchDriverDocUsecase], {id:driverId });
  }

  @ApiBearerAuth()
  @AdminOnly()
  @Delete('drivers/delete-document/:id')
  @ApiOperation({ summary: 'delete driver doc history by ID' })
  @ApiParam({ name: 'id', type: String, description: 'delete driver doc history by ID' })
  deleteDriverDocHistory(@Param('id') id: string) {
    return this.broker.runUsecases([this.deleteDriverDocHistoryUsecase], { id });
  }


@ApiBearerAuth()
@AdminOnly()
@Post('drivers/update-document/:id')
@ApiOperation({ summary: 'Update a single driver document by document ID' })
@ApiParam({ name: 'id', type: String, description: 'document_verifications row ID (NOT the driver ID)' })
@ApiBody({ type: UpdateDriverDocumentDto })
updateDriverDoc(@Param('id') id: string, @Body() dto: UpdateDriverDocumentDto) {
  return this.broker.runUsecases([this.updateDriverDocUsecase], { id: id, dto: dto });
}

@ApiBearerAuth()
  @AdminOnly()
  @Post('drivers/add-vehicle')
  @UseInterceptors(AnyFilesInterceptor())
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Admin: add a vehicle for a driver' })
  @ApiBody({ type: AdminAddVehicleDto })
  @ApiResponse({ status: 201, description: 'Vehicle added successfully' })
  addVehicleForDriver(
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.adminService.addVehicleForDriver(body, files);
  }


  @ApiBearerAuth()
  @AdminOnly()
  @Post('drivers/add-document/:id')
  @UseInterceptors(FileInterceptor('document'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a new document for a driver' })
  @ApiParam({ name: 'id', type: String, description: 'driver UUID' })
  @ApiBody({ type: UploadDriverDocumentDto })
  addDriverDoc(
    @Param('id') id: string,
    @Body() dto: UploadDriverDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.broker.runUsecases([this.addDriverDocUsecase], { id, dto, file });
  }

  @ApiBearerAuth()
  @AdminOnly()
  @Patch('password-update')
  @ApiBody({ type: UpdatePasswordDto })

  async updatePassword(
    @AuthUser() user: any,
    @Body() dto: UpdatePasswordDto,
  ) {
    return this.broker.runUsecases([this.updatePasswordUsecase], {id: user.sub, dto:dto})
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_ACTIVATE)
  @Patch('drivers/toggle-status/:id')
  @ApiOperation({ summary: 'Activate a driver account' })
  @ApiParam({ name: 'id', type: String, description: 'Activate a driver account' })
  activateDriver(@Param('id') id: string) {
    return this.broker.runUsecases([this.activateDriverUsecase], { id });
  }

    @ApiBearerAuth()
    @AdminOnly()
    @RequirePermissions(Permission.USER_VIEW)
    @Get('get-profile')
    @ApiOperation({ summary: 'Get my passenger profile' })
    getProfile(@AuthUser() user: any) {
      return this.broker.runUsecases([this.getAdminProfileUsecase], { id: user.sub });
    }

  // ─── Kill Switch ─────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @AdminOnly()
  @SkipKillSwitch()
  @Get('kill-switch')
  @ApiOperation({ summary: 'Get kill switch status' })
  getKillSwitchStatus() {
    return this.killSwitchService.getStatus();
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.KILLSWITCH_TOGGLE)
  @SkipKillSwitch()
  @Post('kill-switch/activate')
  @ApiOperation({ summary: 'Activate kill switch — takes the API offline immediately' })
  @ApiBody({ type: ToggleKillSwitchDto })

  activateKillSwitch(@Body() dto: ToggleKillSwitchDto, @AuthUser() user: any) {
    return this.killSwitchService.activate(user.email, dto.deactivationCode, dto.reason);
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.KILLSWITCH_TOGGLE)
  @SkipKillSwitch()
  @Post('kill-switch/deactivate')
  @ApiOperation({ summary: 'Deactivate kill switch — requires deactivation code + 2FA' })
  @ApiBody({ type: ToggleKillSwitchDto })
  deactivateKillSwitch(@Body() dto: ToggleKillSwitchDto, @AuthUser() user: any) {
    return this.killSwitchService.deactivate(user.email, dto.deactivationCode, dto.twoFaCode);
  }

    @AdminOnly()
    @Patch('update-profile')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Update my profile (name, phone, photo, state)' })
    @ApiBody({ type: UpdateAdminProfileDto })

    updateProfile(
      @AuthUser() user: any,
      @UploadedFile() file: Express.Multer.File,
      @Body() dto: UpdateAdminProfileDto,
  
    ) {
      
      return this.adminService.updateProfile(user.id, dto, file);
    }

  // ─── Users ───────────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_VIEW)
  @Get('users')
  @ApiOperation({ summary: 'List all users' })
  @ApiBody({ type: AdminListQueryDto })

  listUsers(@Query() query: AdminListQueryDto) {
    return this.broker.runUsecases([this.listUsersUsecase], query);
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_VIEW)
  @Get('users/:id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Get user by ID' })

  getUser(@Param('id') id: string) {
    return this.broker.runUsecases([this.getUserUsecase], { id });
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_SUSPEND)
  @Patch('users/:id/suspend')
  @ApiOperation({ summary: 'Suspend a user account' })
  @ApiParam({ name: 'id', type: String, description: 'Suspend a user account' })
  @ApiBody({ type: SuspendUserDto })
  suspendUser(
    @Param('id') id: string,
    @Body() dto: SuspendUserDto,
  ) {
    return this.broker.runUsecases([this.suspendUserUsecase], {
      id,
      reason: dto.reason,
    });
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_ACTIVATE)
  @Patch('users/:id/activate')
  @ApiOperation({ summary: 'Activate a user account' })
  @ApiParam({ name: 'id', type: String, description: 'Activate a user account' })
  activateUser(@Param('id') id: string) {
    return this.broker.runUsecases([this.activateUserUsecase], { id });
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.USER_DELETE)
  @Delete('users/:id')
  @ApiOperation({ summary: 'Delete (soft-delete) a user account' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  @ApiBody({ type: DeleteUserDto })
  deleteUser(
    @Param('id') id: string,
    @Body() dto: DeleteUserDto,
    @AuthUser() admin: any,
  ) {
    return this.broker.runUsecases([this.deleteUserUsecase], {
      id,
      adminId: admin.sub,
      reason: dto?.deleteReason,
    });
  }

  // ─── KYC / Documents ─────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.KYC_VIEW)
  @Get('documents/pending')
  @ApiOperation({ summary: 'List pending KYC documents' })
  listPendingDocuments() {
    return this.broker.runUsecases([this.listPendingDocumentsUsecase], {});
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.KYC_APPROVE)
  @Patch('documents/:id/approve')
  @ApiOperation({ summary: 'Approve a KYC document' })
  @ApiParam({ name: 'id', type: String, description: 'Approve a KYC document' })
  approveDocument(@Param('id') id: string, @AuthUser() user: any) {
    return this.broker.runUsecases([this.approveDocumentUsecase], {
      id,
      adminEmail: user.email,
    });
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.KYC_REJECT)
  @Patch('documents/:id/reject')
  @ApiOperation({ summary: 'Reject a KYC document' })
  @ApiParam({ name: 'id', type: String, description: 'Reject KYC document' })
  @ApiBody({ type: RejectDocumentDto })
  rejectDocument(
    @Param('id') id: string,
    @Body() dto: RejectDocumentDto,
    @AuthUser() user: any,
  ) {
    return this.broker.runUsecases([this.rejectDocumentUsecase], {
      id,
      reason: dto.reason,
      adminEmail: user.email,
    });
  }

  // ─── Trips ───────────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @AdminOnly()
  @Get('trips')
  @ApiOperation({ summary: 'List all trips' })
  @ApiBody({ type: AdminListQueryDto })
  listTrips(@Query() query: AdminListQueryDto) {
    return this.broker.runUsecases([this.listTripsUsecase], query);
  }

  @ApiBearerAuth()
  @AdminOnly()
  @Get('trips/:id')
  @ApiOperation({ summary: 'Get trip detail' })
  @ApiParam({ name: 'id', type: String, description: 'Get trip detail' })
  getTrip(@Param('id') id: string) {
    return this.broker.runUsecases([this.getTripUsecase], { id });
  }

  // ─── Bookings ────────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @AdminOnly()
  @Get('bookings')
  @ApiOperation({ summary: 'List all bookings' })
  @ApiBody({ type: AdminListQueryDto })
  listBookings(@Query() query: AdminListQueryDto) {
    return this.broker.runUsecases([this.listBookingsUsecase], query);
  }

  @ApiBearerAuth()
  @AdminOnly()
  @Get('bookings/:id')
  @ApiOperation({ summary: 'Get booking detail' })
  @ApiParam({ name: 'id', type: String, description: 'Get booking detail' })
  getBooking(@Param('id') id: string) {
    return this.broker.runUsecases([this.getBookingUsecase], { id });
  }

  @ApiBearerAuth()
  @AdminOnly()
  @Patch('bookings/:id/refund')
  @ApiOperation({ summary: 'Issue a refund for a booking' })
  @ApiParam({ name: 'id', type: String, description: 'Issue a refund for a booking' })
 
  refundBooking(@Param('id') id: string, @AuthUser() user: any) {
    return this.broker.runUsecases([this.refundBookingUsecase], {
      id,
      adminEmail: user.email,
    });
  }

  // ─── Payouts ─────────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.PAYOUT_VIEW)
  @Get('payouts')
  @ApiOperation({ summary: 'List all payout requests' })
  @ApiBody({type: AdminListQueryDto})
  listPayouts(@Query() query: AdminListQueryDto) {
    return this.broker.runUsecases([this.listPayoutsUsecase], query);
  }

  @ApiBearerAuth()
  @AdminOnly()
@RequirePermissions(Permission.PAYOUT_APPROVE)  
@Patch('payouts/:id/approve')
  @ApiOperation({ summary: 'Approve and execute a payout via Paystack' })
  approvePayout(@Param('id') id: number, @AuthUser() user: any) {
    return this.broker.runUsecases([this.approvePayoutUsecase], {
      id,
      adminEmail: user.email,
    });
  }

  @ApiBearerAuth()
  @AdminOnly()
  @RequirePermissions(Permission.PAYOUT_DECLINE)
  @Patch('payouts/:id/decline')
  @ApiOperation({ summary: 'Decline a payout request' })
  declinePayout(
    @Param('id') id: string,
    @Body() dto: DeclinePayoutDto,
    @AuthUser() user: any,
  ) {
    return this.broker.runUsecases([this.declinePayoutUsecase], {
      id,
      reason: dto.reason,
      adminEmail: user.email,
    });
  }

  // ─── Coupons ─────────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @AdminOnly()
  @Get('coupons')
  @ApiOperation({ summary: 'List all coupons' })
  listCoupons() {
    return this.broker.runUsecases([this.listCouponsUsecase], {});
  }

  @ApiBearerAuth()
  @AdminOnly()
  @Post('coupons')
  @ApiOperation({ summary: 'Create a new coupon' })
  @ApiBody({type: CreateCouponDto})
  createCoupon(@Body() dto: CreateCouponDto, @AuthUser() user: any) {
    return this.broker.runUsecases([this.createCouponUsecase], {
      ...dto,
      adminId: user.id,
    });
  }

  @ApiBearerAuth()
  @AdminOnly()
  @Patch('coupons/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate a coupon' })
  deactivateCoupon(@Param('id') id: string) {
    return this.broker.runUsecases([this.deactivateCouponUsecase], { id });
  }

  // ─── Finance / Transactions ──────────────────────────────────────────────

@ApiBearerAuth()
@AdminOnly()
@Get('transactions/report')
@ApiOperation({ summary: 'Financial report' })
getFinancialReport(@Query() query: AdminListQueryDto) {
  return this.broker.runUsecases([this.getFinancialReportUsecase], { query });
}

@ApiBearerAuth()
@AdminOnly()
@Get('finance/drivers-earnings')
@ApiOperation({ summary: 'List drivers earnings' })
getDriversEarnings(@Query() query: AdminListQueryDto) {
  return this.broker.runUsecases([this.getDriversEarningsUsecase], { query });
}

@ApiBearerAuth()
@AdminOnly()
@Get('finance/agents-earnings')
@ApiOperation({ summary: 'List agents earnings' })
getAgentsEarnings(@Query() query: AdminListQueryDto) {
  return this.broker.runUsecases([this.getAgentsEarningsUsecase], { query });
}

@ApiBearerAuth()
@AdminOnly()
@Get('transactions/refund-requests')
@ApiOperation({ summary: 'List refund requests' })
getRefundRequests(@Query() query: AdminListQueryDto) {
  return this.broker.runUsecases([this.getRefundRequestsUsecase], { query });
}

@ApiBearerAuth()
@AdminOnly()
@RequirePermissions(Permission.PAYOUT_APPROVE)
@Patch('transactions/approve-withdrawal/:payout')
@ApiOperation({ summary: 'Approve a withdrawal request' })
@ApiParam({ name: 'payout', type: String })
approveWithdrawal(@Param('payout') payout: string, @AuthUser() user: any) {
  return this.broker.runUsecases([this.approvePayoutUsecase], {
    id: payout,
    adminEmail: user.email,
  });
}

@ApiBearerAuth()
@AdminOnly()
@RequirePermissions(Permission.PAYOUT_DECLINE)
@Patch('transactions/decline-withdrawal/:payout')
@ApiOperation({ summary: 'Decline a withdrawal request' })
@ApiParam({ name: 'payout', type: String })
declineWithdrawal(@Param('payout') payout: string, @AuthUser() user: any) {
  return this.broker.runUsecases([this.declinePayoutUsecase], {
    id: payout,
    reason: 'Declined by admin',
    adminEmail: user.email,
  });
}
}
