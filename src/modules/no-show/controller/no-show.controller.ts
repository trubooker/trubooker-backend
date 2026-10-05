import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminOnly, DriverOnly } from '@shared/decorators/roles.decorator';
import { AuthUser } from '@shared/decorators/authUser.decorator';
import { RequirePermissions } from '@shared/decorators/permissions.decorator';
import { Permission } from 'src/types/enums/permission.enums';
import { NoShowService } from '../service/no-show.service';
import { DeclineNoShowDto, ReportNoShowDto } from '../dtos/no-show.dto';
import { NoShowStatus } from '../../../types/enums';

@ApiTags('No-show')
@ApiBearerAuth()
@Controller('v1/no-shows')
export class DriverNoShowController {
  constructor(private readonly service: NoShowService) {}

  @DriverOnly()
  @Post('bookings/:bookingId')
  @ApiOperation({ summary: "Driver: report passenger didn't show up (records GPS location)" })
  report(@AuthUser() user: any, @Param('bookingId') bookingId: string, @Body() dto: ReportNoShowDto) {
    return this.service.report(user.sub, bookingId, dto);
  }

  @DriverOnly()
  @Get('mine')
  @ApiOperation({ summary: 'Driver: my no-show reports and their status' })
  mine(@AuthUser() user: any) {
    return this.service.listMine(user.sub);
  }
}

@ApiTags('Admin - No-show')
@ApiBearerAuth()
@Controller('v1/admin/no-shows') // match your existing admin prefix
export class AdminNoShowController {
  constructor(private readonly service: NoShowService) {}

  @AdminOnly() @RequirePermissions(Permission.PAYOUT_VIEW)
  @Get()
  list(@Query() q: { page?: number; limit?: number; status?: NoShowStatus }) {
    return this.service.adminList(q);
  }

  @AdminOnly() @RequirePermissions(Permission.PAYOUT_VIEW)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.adminGet(id);
  }

  @AdminOnly() @RequirePermissions(Permission.PAYOUT_APPROVE)
  @Patch(':id/approve')
  approve(@Param('id') id: string, @AuthUser() user: any) {
    return this.service.approve(id, user.email);
  }

  @AdminOnly() @RequirePermissions(Permission.PAYOUT_DECLINE)
  @Patch(':id/decline')
  decline(@Param('id') id: string, @Body() dto: DeclineNoShowDto, @AuthUser() user: any) {
    return this.service.decline(id, dto.reason, user.email);
  }
}