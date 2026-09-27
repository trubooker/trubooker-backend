import { Body, Controller, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Broker } from '@broker/broker';
import { Public } from '@shared/decorators/isPublic.decorator';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { VerifyOtpDto, ResendOtpDto , VerifyPhoneDto, ResendPhoneOtpDto} from '../dtos/verify-otp.dto';
import { ForgotPasswordDto, ResetPasswordDto, VerifyResetOtpDto } from '../dtos/reset-password.dto';
import { RegisterUsecase } from '../usecases/register.usecase';
import { LoginUsecase } from '../usecases/login.usecase';
import { VerifyOtpUsecase } from '../usecases/verify-otp.usecase';
import { ForgotPasswordUsecase } from '../usecases/forgot-password.usecase';
import { ResetPasswordUsecase } from '../usecases/reset-password.usecase';
import { ServiceName } from '@shared/decorators/servicename.decorators';
import { ResendOtpUsecase } from '../usecases/resendotp.usecase';
import { VerifyPhoneOtpUsecase } from '../usecases/verifyphone-otp.usecase';
import { ResendPhoneOtpUsecase } from '../usecases/resendphoneotp.usecase';
import { RegisterAdminUsecase } from '../usecases/createadmin.usecase';
import { CreateAdminDto } from '@modules/admin/dtos/create-admin.dto';
import { LoginAdminDto } from '@modules/admin/dtos/login.dto';
import { LoginAdminUsecase } from '../usecases/loginadmin.usecase';
import { LoginAgentUsecase } from '../usecases/loginagent.usecase';
import { VerifyAdminOtpUsecase } from '../usecases/verifyadminotp.usecase';
import { UpdatePasswordUsecase } from '../usecases/updatepassword.usecase';
import { AuthUser } from '@shared/decorators/authUser.decorator';
import { UpdatePasswordDto } from '../dtos/updatepassword.dto';
import { DriverOnly, PassengerOnly } from '@shared/decorators/roles.decorator';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { UpdatePassengerPasswordUsecase } from '../usecases/updatepassengerpass.usecase';


@ApiTags('Auth')
@ServiceName('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly broker: Broker,
    private readonly registerUsecase: RegisterUsecase,
    private readonly loginUsecase: LoginUsecase,
    private readonly verifyOtpUsecase: VerifyOtpUsecase,
    private readonly forgotPasswordUsecase: ForgotPasswordUsecase,
    private readonly resetPasswordUsecase: ResetPasswordUsecase,
    private readonly resendotpUsecase: ResendOtpUsecase,
    private readonly verifyphoneUsecase: VerifyPhoneOtpUsecase,
    private readonly resendPhoneOtpUsecase:ResendPhoneOtpUsecase,
    private readonly registerAdminUsecase: RegisterAdminUsecase,
    private readonly loginAdminUsecase: LoginAdminUsecase,
    private readonly loginAgentUsecase: LoginAgentUsecase,
    private readonly verifyAdminOtpUsecase: VerifyAdminOtpUsecase,
    private readonly updatePasswordUsecase:UpdatePasswordUsecase,
    private readonly updatePassengerPasswordUsecase:UpdatePassengerPasswordUsecase
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new a new user' })
  register(@Body() dto: RegisterDto) {
    return this.broker.runUsecases([this.registerUsecase], dto);
  }

    @Public()
    @Post('register-admin')
    @ApiOperation({ summary: 'Create a new admin' })
    @ApiBody({ type: CreateAdminDto })
    createAdmin(@Body() dto: CreateAdminDto) {
      return this.broker.runUsecases([this.registerAdminUsecase], dto);
    }

  @Public()  
  @Post('login-admin')
  @ApiOperation({ summary: 'Admin login' })
  @ApiBody({ type: LoginAdminDto })
  loginAdmin(@Body() dto: LoginAdminDto) {
    return this.broker.runUsecases([this.loginAdminUsecase], dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login' })
  login(@Body() dto: LoginDto) {
    return this.broker.runUsecases([this.loginUsecase], dto);
  }

  @Public()
  @Post('login-agent')
  @ApiOperation({
    summary: 'Agent login',
    description:
      "Logs in an agent. Rejects the login (401) if the agent's status in the agents table is 'pending' (awaiting admin approval) or 'suspended'.",
  })
  @ApiBody({ type: LoginDto })
  loginAgent(@Body() dto: LoginDto) {
    return this.broker.runUsecases([this.loginAgentUsecase], dto);
  }

  @Public()
  @Post('verify-otp')
  @ApiOperation({ summary: 'Verify email OTP' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.broker.runUsecases([this.verifyOtpUsecase], dto);
  }

    @Post('verify-admin-otp')
    @ApiOperation({summary: 'verify admin otp'})
    @ApiBody({type: VerifyOtpDto})
    verifyAdminOtp(@Body() dto: VerifyOtpDto){
      return this.broker.runUsecases([this.verifyAdminOtpUsecase], dto)
  
    }

  @Public()
  @Post('verify-phone-otp')
  @ApiOperation({ summary: 'Verify phone OTP' })
  verifyPhoneOtp(@Body() dto: VerifyPhoneDto) {
    return this.broker.runUsecases([this.verifyphoneUsecase], dto);
  }

  @Public()
  @Post('resend-otp')
  @ApiOperation({ summary: 'Resend OTP' })
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.broker.runUsecases(
      [
       this.resendotpUsecase
      ],
      dto,
    );
  }

  // @Public()
  // @Post('resend-phone-otp')
  // @ApiOperation({ summary: 'Resend phone OTP' })
  // resendPhoneOtp(@Body() dto: ResendPhoneOtpDto) {
  //   return this.broker.runUsecases(
  //     [
  //      this.resendPhoneOtpUsecase
  //     ],
  //     dto,
  //   );
  // }

  @UseGuards(JwtAuthGuard)
@Post('resend-phone-otp')
@ApiOperation({ summary: 'Resend phone OTP — or, if a different phone is supplied, change to it and send OTP there' })
resendPhoneOtp(@AuthUser() user: any, @Body() dto: ResendPhoneOtpDto) {
  return this.broker.runUsecases(
    [this.resendPhoneOtpUsecase],
    { userId: user.sub, dto },
  );
}

  @Public()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset OTP' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.broker.runUsecases([this.forgotPasswordUsecase], dto);
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password ' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.broker.runUsecases([this.resetPasswordUsecase], dto);
  }

@UseGuards(JwtAuthGuard, RolesGuard)
@DriverOnly()
@Patch('drivers/update-password')
updatePassword(
  @AuthUser() user: any,
  @Body() dto: UpdatePasswordDto,
) {
  return this.broker.runUsecases(
    [this.updatePasswordUsecase],
    { userId: user.sub, dto },
  );
}


@UseGuards(JwtAuthGuard, RolesGuard)
@PassengerOnly()
@Patch('passenger/update-password')
updatePassengerPassword(
  @AuthUser() user: any,
  @Body() dto: UpdatePasswordDto,
) {
  return this.broker.runUsecases(
    [this.updatePassengerPasswordUsecase],
    { userId: user.sub, dto },
  );
}


}


