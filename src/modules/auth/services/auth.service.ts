import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EntityManager, Repository } from 'typeorm';
import { UserRepository } from '@adapters/repositories/user.repository';
import { PassengerRepository } from '@adapters/repositories/passenger.repository';
import { DriverRepository } from '@adapters/repositories/driver.repository';
import { RandomnessUtil } from '@shared/utils/encryption/randomness.util';
import { User } from '@modules/core/entities/user.entity';
import { NotificationType, UserRole, UserStatus } from '../../../types/enums';
import { getOtpExpiry, isOtpExpired } from '@shared/utils/helpers/common.utils';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { HashingUtil } from '@shared/utils/hashing/hashing.utils';
import { EmailService } from '@modules/email/email.service';
import { ExpoService } from '@modules/notification/services/expo.service';
import { ResendOtpDto, ResendPhoneOtpDto } from '../dtos/verify-otp.dto';
import { CouponService } from '@modules/coupon-referral/service/cupon.service';
import { ReferralService } from '@modules/coupon-referral/service/referal.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Role } from '@modules/core/entities/role.entity';
import { DojahAdapter } from '@adapters/kyc/dojah/dojah.adapter';
import { DeleteUserDto } from '../dtos/deleteuser.dto';
import { AdminRepository } from '@adapters/repositories/admin.repository';
import { LoginAdminDto } from '@modules/admin/dtos/login.dto';
import { Admin } from '@modules/core/entities/admin.entity';
import { CreateAdminDto } from '@modules/admin/dtos/create-admin.dto';
import { AgentRepository } from '@adapters/repositories/agent.repository';
import { NotificationService } from '@modules/notification/services/notification.service';
import { UpdatePasswordDto } from '../dtos/updatepassword.dto';
import { Agent } from '@modules/core/entities/agent.entity';
import { SmsFactory } from '@adapters/sms/sms.factory';
import { ChangePhoneDto } from '../dtos/change-phone.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passengerRepository: PassengerRepository,
    private readonly driverRepository: DriverRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly randomnessUtil: RandomnessUtil,
    private readonly hashingUtil: HashingUtil,
    private readonly emailService: EmailService,
    private readonly expoService: ExpoService,
    private readonly referralService: ReferralService,
    private readonly couponService: CouponService,
    private readonly dojahAdapter: DojahAdapter,
    private readonly smsFactory: SmsFactory,
    private readonly adminRepo: AdminRepository,
    private readonly agentRepo: AgentRepository,
    private readonly notificationService: NotificationService,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>
    
    
    
  ) {}
    private static readonly MAX_OTP_ATTEMPTS = 5;

  async register(dto: RegisterDto, entityManager?: EntityManager): Promise<User> {
    const existingUser = await this.userRepository.findByEmail(dto.email);
    if (existingUser) throw new ConflictException('Email already in use');

    const existingPhone = await this.userRepository.findByPhone(dto.phone);
    if (existingPhone) throw new ConflictException('Phone number already in use');

      // Public signup may ONLY create passenger or driver accounts.
  const ALLOWED_PUBLIC_ROLES = [UserRole.PASSENGER, UserRole.DRIVER, UserRole.AGENT];
  const requestedRole = (dto.role ?? UserRole.PASSENGER) as UserRole;
  const safeRole = ALLOWED_PUBLIC_ROLES.includes(requestedRole)
    ? requestedRole
    : UserRole.PASSENGER;

      const role = await this.roleRepository.findOne({ 
      where: { name: safeRole } 
    });
    
    if (!role) {
      throw new NotFoundException(`Role '${dto.role}' not found`);
    }

    const hashedPassword = await this.hashingUtil.hash(dto.password);
    const referralCode = this.randomnessUtil.generateRandomStringWithNumbers(8);
    const otp = this.randomnessUtil.generateOtp();
    const hasedOtp = await this.hashingUtil.hash(otp)


    await this.emailService.sendOtp({ to: dto.email, firstName: dto.firstName, otp });
    await this.emailService.sendWelcome({ to: dto.email, firstName: dto.lastName, role: safeRole });
    const otpExpiresAt = getOtpExpiry(this.configService.get<number>('common.otp.durationMinutes'));

    const user = await this.userRepository.createUser(
      {
        ...dto,
        password: hashedPassword,
        referralCode,
        otpCode: hasedOtp,
        otpExpiresAt,
        roleId: role.id,
        role: safeRole,
        status: UserStatus.PENDING,
      },
      entityManager,
    );


    // Create role-specific profile
    if (user.role === UserRole.PASSENGER) {
      await this.passengerRepository.createPassenger({ userId: user.id }, entityManager);
    } else if (user.role === UserRole.DRIVER) {

      await this.driverRepository.createDriver({ userId: user.id }, entityManager);
            
    }else if(user.role === UserRole.AGENT){
      await this.agentRepo.createAgent({userId: user.id}, entityManager)
    }

    // ── Phone verification OTP — for passengers AND drivers ──


      // ── Referral: record who referred this user (if referralCode supplied) ──
  if (dto.referralCode && user.role === UserRole.PASSENGER) {
    await this.referralService.recordReferral(
      user.id,
      dto.referralCode,
      entityManager,
    );
  }

    // ── Welcome coupon: send if admin has an active welcome coupon running ──
  if (user.role === UserRole.PASSENGER) {
    // Fire-and-forget — never blocks registration
    this.couponService.dispatchWelcomeCouponIfActive(user).catch((err) => {
      // Already logged inside the service
    });
  }
  

     // SEND PUSH NOTIFICATION
  if (user.expoToken) {
    await this.expoService.sendPushNotification(
      user.expoToken,
      'Welcome',
      `Your ${user.role} account was created successfully`,
      {
        userId: user.id,
      },
    );
  }

   this.notificationService.notify({
    userId: user.id,
    title: 'Welcome to Tru Booker',
    body: `Your ${user.role} account was created successfully. Please verify your email to get started.`,
    type: NotificationType.BROADCAST,
    data: { userId: user.id, role: user.role },
  });

    // TODO: Send OTP via notification service
    return user;
  }

  async login(dto: LoginDto): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');


    const isPasswordValid = await this.hashingUtil.compare(dto.password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isEmailVerified) throw new UnauthorizedException('Please verify your email first');
    //if (!user.isPhoneVerified) throw new UnauthorizedException('Please verify your phone first');

    if (user.status === UserStatus.SUSPENDED)
      throw new UnauthorizedException('Your account has been suspended');

 

      // Persist the device's push token before we try to push to it.
  if (dto.expo_token && dto.expo_token !== user.expoToken) {
    await this.userRepository.setExpoToken(user.id, dto.expo_token);
    user.expoToken = dto.expo_token;
  }

    const tokens = this.generateTokens(user);

  

  //     await this.notificationService.notify({
  //   userId: user.id,
  //   title: 'New Login',
  //   body: `You signed in to your Tru Booker account on ${new Date().toLocaleString()}.`,
  //   type: NotificationType.BROADCAST,
  //   data: { userId: user.id, at: new Date().toISOString() },
  // });

//   if (user.expoToken) {
//   this.expoService
//     .sendPushNotification(user.expoToken, 'New Login', 'You signed in to your account', { userId: user.id })
//     .catch(err => console.error('Expo push failed', err));
// }
  
    return { user, ...tokens };
  }

  async loginAdmin(
      dto: LoginAdminDto,
    ): Promise<{ user: Admin; accessToken: string; refreshToken: string }> {
      const user = await this.adminRepo.findByEmail(dto.email);
      if (!user) throw new UnauthorizedException('Invalid credentials');
  
      const isPasswordValid = await this.hashingUtil.compare(dto.password, user.password);
      if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');
  
      if (!user.isEmailVerified) throw new UnauthorizedException('Please verify your email first');
  
      if (user.status === UserStatus.SUSPENDED)
        throw new UnauthorizedException('Your account has been suspended');
  
      const tokens = this.generateAdminTokens(user);
      return { user, ...tokens };
    }


    

      

  async createAdmin(dto: CreateAdminDto, entityManager?: EntityManager): Promise<Admin> {
        const existingUser = await this.adminRepo.findByEmail(dto.email);
    
        if (existingUser) {
          throw new Error('Email already in use');
        }
    
        const role = await this.roleRepository.findOne({ 
      where: { name: dto.role } 
    });
    
    if (!role) {
      throw new NotFoundException(`Role '${dto.role}' not found`);
    }
    
        const hashedPassword = await this.hashingUtil.hash(dto.password);
            const otp = this.randomnessUtil.generateOtp();
            await this.emailService.sendOtp({ to: dto.email, firstName: dto.firstName, otp });
                await this.emailService.sendWelcome({ to: dto.email, firstName: dto.firstName, role: dto.role });
    
           const otpExpiresAt = getOtpExpiry(this.configService.get<number>('common.otp.durationMinutes'));
            
        const user = await this.adminRepo.createAdmin(
         {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          fullName: `${dto.firstName} ${dto.lastName}`,  // ← entity uses fullName
          phone: dto.phoneNumber,                         // ← entity uses phone
          roleId: role.id,                                // ← entity uses roleId, not roleName
          password: hashedPassword,
          role:role.name,
          country:dto.country,
          address: dto.address,
          city: dto.city,
          gender: dto.gender,
          dob: dto.dob,
          otpCode: otp,
          otpExpiresAt,
          status: UserStatus.PENDING,
          metadata: dto.meta,
        },
          entityManager,
        );
    
       
    
        return user;
      }


      
    
 async verifyOtp(email: string, otp: string, entityManager?: EntityManager): Promise<{ user: User; accessToken: string; refreshToken: string }> {
  const user = await this.userRepository.findByEmail(email);
  if (!user) throw new BadRequestException('User not found');
  if (isOtpExpired(user.otpExpiresAt)) throw new BadRequestException('OTP has expired');

  if ((user.otpAttempts ?? 0) >= AuthService.MAX_OTP_ATTEMPTS) {
    await this.userRepository.updateUser(
      user.id,
      { otpCode: null, otpExpiresAt: null },
      entityManager,
    );
    throw new BadRequestException('Too many attempts. Please request a new code.');
  }

  const valid = user.otpCode
    ? await this.hashingUtil.compare(otp, user.otpCode)
    : false;

  if (!valid) {
    await this.userRepository.updateUser(
      user.id,
      { otpAttempts: (user.otpAttempts ?? 0) + 1 },
      entityManager,
    );
    throw new BadRequestException('Invalid OTP');
  }

  const updatedUser = await this.userRepository.updateUser(
    user.id,
    { isEmailVerified: true, status: UserStatus.ACTIVE, otpCode: null, otpExpiresAt: null },
    entityManager,
  );

  const tokens = this.generateTokens(updatedUser);

  return {
    user: updatedUser,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

async loginAgent(dto: LoginDto): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.role !== UserRole.AGENT)
      throw new UnauthorizedException('This account is not registered as an agent');

    const isPasswordValid = await this.hashingUtil.compare(dto.password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    //if (!user.isEmailVerified) throw new UnauthorizedException('Please verify your email first');

    if (user.status === UserStatus.SUSPENDED)
      throw new UnauthorizedException('Your account has been suspended');

    // ── Agent-table gate: admin must approve before an agent can log in ──
    const agent = await this.agentRepo.findByUserId(user.id);
    if (!agent) throw new UnauthorizedException('Agent profile not found');

    if (agent.status === UserStatus.PENDING)
      throw new UnauthorizedException('Your agent account is pending admin approval');

    if (agent.status === UserStatus.SUSPENDED)
      throw new UnauthorizedException('Your agent account has been suspended');

    if (agent.status === UserStatus.INACTIVE)
      throw new UnauthorizedException('Your agent account is inactive. Please contact support');

    if (dto.expo_token && dto.expo_token !== user.expoToken) {
      await this.userRepository.setExpoToken(user.id, dto.expo_token);
      user.expoToken = dto.expo_token;
    }

    const tokens = this.generateTokens(user);



    return { user, ...tokens };
  }

  // async verifyPhoneOtp(phone: string, otp:string, entityManager?: EntityManager): Promise<User>{
  //    const user = await this.userRepository.findByPhone(phone);
  //    if (!user) throw new BadRequestException('User not found');
  //   //  if (user.phoneOtpCode !== otp) throw new BadRequestException('Invalid OTP');
  //    if (isOtpExpired(user.phoneOtpExpiresAt)) throw new BadRequestException('OTP has expired');

  //   if ((user.phoneOtpAttempts ?? 0) >= AuthService.MAX_OTP_ATTEMPTS) {
  //   // Invalidate so a fresh OTP must be requested
  //   await this.userRepository.updateUser(
  //     user.id,
  //     { phoneOtpCode: null, phoneOtpExpiresAt: null },
  //     entityManager,
  //   );
  //   throw new BadRequestException('Too many attempts. Please request a new code.');
  // }

  //   const valid = user.phoneOtpCode
  //   ? await this.hashingUtil.compare(otp, user.phoneOtpCode)
  //   : false;
  //     if (!valid) {
  //   await this.userRepository.updateUser(
  //     user.id,
  //     { phoneOtpAttempts: (user.phoneOtpAttempts ?? 0) + 1 },
  //     entityManager,
  //   );
  //   throw new BadRequestException('Invalid OTP');
  // }

  //   return this.userRepository.updateUser(
  //     user.id,
  //     { isPhoneVerified: true, status: UserStatus.ACTIVE, phoneOtpCode: null, phoneOtpExpiresAt: null },
  //     entityManager,
  //   );
  
  // }

    async verifyAdminOtp(email: string, otp: string, entityManager?: EntityManager): Promise<Admin> {
      const user = await this.adminRepo.findByEmail(email);
      if (!user) throw new UnauthorizedException('User not found');
      if (user.otpCode !== otp) throw new UnauthorizedException('Invalid OTP');
      if (isOtpExpired(user.otpExpiresAt)) throw new UnauthorizedException('OTP has expired');
  
      return this.adminRepo.updateUser(
        user.id,
        { isEmailVerified: true, status: UserStatus.ACTIVE, otpCode: null, otpExpiresAt: null },
        entityManager,
      );
    }


  async resendOtp({email}: ResendOtpDto, entityManager?: EntityManager): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new BadRequestException('User not found');
    if (user.isEmailVerified) throw new BadRequestException('Email already verified');


    const otp = this.randomnessUtil.generateOtp();
    const otpExpiresAt = getOtpExpiry(this.configService.get<number>('common.otp.durationMinutes'));
    await this.emailService.sendOtp({ to: user.email, firstName: user.firstName, otp });
    const hasedOtp = await this.hashingUtil.hash(otp);

    await this.userRepository.updateUser(user.id, { otpCode: hasedOtp, otpExpiresAt }, entityManager);

    
    // TODO: send OTP via notification service
  }

// async resendPhoneOtp({ phone }: ResendPhoneOtpDto, entityManager?: EntityManager): Promise<void> {
//   const user = await this.userRepository.findByPhone(phone);
//   if (!user) throw new BadRequestException('User not found');
//   if (user.isPhoneVerified) throw new BadRequestException('User phone already verified');

//   const phoneOtp = this.randomnessUtil.generateOtp();
//   const minutes = this.configService.get<number>('common.otp.durationMinutes');
//   const phoneExpires = getOtpExpiry(minutes);

//   const hashedPhoneOtp = await this.hashingUtil.hash(phoneOtp);

//   // send the PLAINTEXT otp via SMS, store the HASH
//   // await this.dojahAdapter.sendSms({
//   //   destination: user.phone,
//   //   message: `Your Tru Booker verification code is ${phoneOtp}. It expires in ${minutes} minutes.`,
//   // });

//   const sent = await this.smsFactory.sendSms({
//   destination: user.phone,
//   message: `Your Tru Booker verification code is ${phoneOtp}. It expires in ${minutes} minutes.`,
// });
// if (!sent) throw new BadRequestException('Could not send SMS. Please try again.');

//   await this.userRepository.updateUser(
//     user.id,
//     { phoneOtpCode: hashedPhoneOtp, phoneOtpExpiresAt: phoneExpires, phoneOtpAttempts: 0 },
//     entityManager,
//   );
// }

async changePhone(userId: string, dto: ChangePhoneDto, entityManager?: EntityManager): Promise<void> {
  const user = await this.userRepository.findById(userId);
  if (!user) throw new BadRequestException('User not found');

  if (user.phone === dto.phone) {
    throw new BadRequestException('This is already your current phone number');
  }

  const taken = await this.userRepository.findByPhoneOrPendingPhone(dto.phone);
  if (taken && taken.id !== userId) {
    throw new ConflictException('Phone number already in use');
  }

  const otp = this.randomnessUtil.generateOtp();
  const minutes = this.configService.get<number>('common.otp.durationMinutes');
  const phoneExpires = getOtpExpiry(minutes);
  const hashedOtp = await this.hashingUtil.hash(otp);

  const sent = await this.smsFactory.sendSms({
    destination: dto.phone,
    message: `Your Tru Booker verification code is ${otp}. It expires in ${minutes} minutes.`,
  });
  if (!sent) throw new BadRequestException('Could not send SMS. Please try again.');

  await this.userRepository.updateUser(
    user.id,
    {
      pendingPhone: dto.phone,
      phoneOtpCode: hashedOtp,
      phoneOtpExpiresAt: phoneExpires,
      phoneOtpAttempts: 0,
    },
    entityManager,
  );
}

async resendPhoneOtp(
  userId: string,
  { phone }: ResendPhoneOtpDto,
  entityManager?: EntityManager,
): Promise<void> {
  const user = await this.userRepository.findById(userId);
  if (!user) throw new BadRequestException('User not found');

  let destination = user.pendingPhone || user.phone;
  let pendingPhoneUpdate: string | undefined;

  if (phone && phone !== user.phone) {
    // A different number was supplied — treat this as a phone CHANGE.
    const taken = await this.userRepository.findByPhoneOrPendingPhone(phone);
    if (taken && taken.id !== userId) {
      throw new ConflictException('Phone number already in use');
    }
    destination = phone;
    pendingPhoneUpdate = phone;
  } else if (!user.pendingPhone && user.isPhoneVerified) {
    // Plain resend for the number already on file.
    throw new BadRequestException('User phone already verified');
  }

  const phoneOtp = this.randomnessUtil.generateOtp();
  const minutes = this.configService.get<number>('common.otp.durationMinutes');
  const phoneExpires = getOtpExpiry(minutes);
  const hashedPhoneOtp = await this.hashingUtil.hash(phoneOtp);

  const sent = await this.smsFactory.sendSms({
    destination,
    message: `Your Tru Booker verification code is ${phoneOtp}. It expires in ${minutes} minutes.`,
  });
  if (!sent) throw new BadRequestException('Could not send SMS. Please try again.');

  await this.userRepository.updateUser(
    user.id,
    {
      phoneOtpCode: hashedPhoneOtp,
      phoneOtpExpiresAt: phoneExpires,
      phoneOtpAttempts: 0,
      ...(pendingPhoneUpdate ? { pendingPhone: pendingPhoneUpdate } : {}),
    },
    entityManager,
  );
}

async verifyPhoneOtp(phone: string, otp: string, entityManager?: EntityManager): Promise<User> {
  const user = await this.userRepository.findByPhoneOrPendingPhone(phone);
  if (!user) throw new BadRequestException('User not found');
  if (isOtpExpired(user.phoneOtpExpiresAt)) throw new BadRequestException('OTP has expired');

  if ((user.phoneOtpAttempts ?? 0) >= AuthService.MAX_OTP_ATTEMPTS) {
    await this.userRepository.updateUser(user.id, { phoneOtpCode: null, phoneOtpExpiresAt: null }, entityManager);
    throw new BadRequestException('Too many attempts. Please request a new code.');
  }

  const valid = user.phoneOtpCode ? await this.hashingUtil.compare(otp, user.phoneOtpCode) : false;
  if (!valid) {
    await this.userRepository.updateUser(user.id, { phoneOtpAttempts: (user.phoneOtpAttempts ?? 0) + 1 }, entityManager);
    throw new BadRequestException('Invalid OTP');
  }

  const updates: Partial<User> = {
    isPhoneVerified: true,
    status: UserStatus.ACTIVE,
    phoneOtpCode: null,
    phoneOtpExpiresAt: null,
  };
  if (user.pendingPhone) {
    updates.phone = user.pendingPhone;
    updates.pendingPhone = null;
  }

  return this.userRepository.updateUser(user.id, updates, entityManager);
}

async forgotPassword(email: string, entityManager?: EntityManager): Promise<void> {
  const user = await this.userRepository.findByEmail(email);
  if (!user) return; // don't reveal whether the email exists

  const otp = this.randomnessUtil.generateOtp();
  const otpExpiresAt = getOtpExpiry(this.configService.get<number>('common.otp.durationMinutes'));
  const hashedOtp = await this.hashingUtil.hash(otp);

  await this.emailService.sendPasswordReset({ to: user.email, firstName: user.firstName, otp });
  await this.userRepository.updateUser(
    user.id,
    { otpCode: hashedOtp, otpExpiresAt, otpAttempts: 0 },
    entityManager,
  );
}

async resetPassword(
  accessToken: string,
  newPassword: string,
  entityManager?: EntityManager,
): Promise<void> {
  let payload: { sub: string; purpose?: string };
  try {
    payload = this.jwtService.verify(accessToken);
  } catch {
    throw new BadRequestException('Reset link is invalid or has expired');
  }

  const user = await this.userRepository.findById(payload.sub);
  if (!user) throw new BadRequestException('User not found');

  const hashedPassword = await this.hashingUtil.hash(newPassword);
  await this.userRepository.updateUser(
    user.id,
    { password: hashedPassword },
    entityManager,
  );
}

async updatePassword(
  userId: string,
  dto: UpdatePasswordDto,
  entityManager?: EntityManager,
): Promise<void> {
  if (!userId) throw new BadRequestException('Unable to identify user');

  // Guard against missing fields reaching the compare/hash steps
  if (!dto?.current_password || !dto?.password || !dto?.password_confirmation) {
    throw new BadRequestException('All password fields are required');
  }

  if (dto.password !== dto.password_confirmation) {
    throw new BadRequestException('Passwords must match');
  }

  const user = await this.userRepository.findById(userId);
  if (!user) throw new BadRequestException('User not found');

  // If the password column is `select: false`, user.password will be undefined.
  if (!user.password) {
    throw new BadRequestException('Unable to verify current password');
  }

  const isCurrentValid = await this.hashingUtil.compare(
    dto.current_password,
    user.password,
  );
  if (!isCurrentValid) {
    throw new BadRequestException('Current password is incorrect');
  }

  const hashedPassword = await this.hashingUtil.hash(dto.password);
  await this.userRepository.updateUser(
    user.id,
    { password: hashedPassword },
    entityManager,
  );
}

async updatePassengerPassword(
  userId: string,
  dto: UpdatePasswordDto,
  entityManager?: EntityManager,
): Promise<void> {
  if (!userId) throw new BadRequestException('Unable to identify user');

  // Guard against missing fields reaching the compare/hash steps
  if (!dto?.current_password || !dto?.password || !dto?.password_confirmation) {
    throw new BadRequestException('All password fields are required');
  }

  if (dto.password !== dto.password_confirmation) {
    throw new BadRequestException('Passwords must match');
  }

  const user = await this.userRepository.findById(userId);
  if (!user) throw new BadRequestException('User not found');

  // If the password column is `select: false`, user.password will be undefined.
  if (!user.password) {
    throw new BadRequestException('Unable to verify current password');
  }

  const isCurrentValid = await this.hashingUtil.compare(
    dto.current_password,
    user.password,
  );
  if (!isCurrentValid) {
    throw new BadRequestException('Current password is incorrect');
  }

  const hashedPassword = await this.hashingUtil.hash(dto.password);
  await this.userRepository.updateUser(
    user.id,
    { password: hashedPassword },
    entityManager,
  );
}

  async deleteAccount(userId: string, dto: DeleteUserDto, entityManager?: EntityManager){
    const del = await this.userRepository.deleteUser(userId, dto, entityManager)
    return del;
  }

  generateTokens(user: User): { accessToken: string; refreshToken: string } {
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

    generateAdminTokens(user: Admin): { accessToken: string; refreshToken: string } {
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
}
