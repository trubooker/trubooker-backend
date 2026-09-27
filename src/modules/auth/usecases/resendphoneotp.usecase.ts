import { Injectable } from '@nestjs/common';
import { Usecase } from '@broker/types';
import { AuthService } from '../services/auth.service';
import { ResendPhoneOtpDto } from '../dtos/verify-otp.dto';
import { EntityManager } from 'typeorm';

@Injectable()
export class ResendPhoneOtpUsecase extends Usecase {
  constructor(private readonly authService: AuthService) { super(); }

  async execute(
    entityManager: EntityManager,
    args: { userId: string; dto: ResendPhoneOtpDto },
  ): Promise<{ message: string }> {
    await this.authService.resendPhoneOtp(args.userId, args.dto, entityManager);
    return { message: 'OTP sent successfully' };
  }
}

// import { Injectable } from '@nestjs/common';
// import { Usecase } from '@broker/types';
// import { AuthService } from '../services/auth.service';
// import { ResendPhoneOtpDto } from '../dtos/verify-otp.dto';
// import { EntityManager } from 'typeorm';

// @Injectable()
// export class ResendPhoneOtpUsecase extends Usecase {
//   constructor(private readonly authService: AuthService) { super(); }

//   async execute(entityManager: EntityManager, args: ResendPhoneOtpDto): Promise<{ message: string }> {
//     await this.authService.resendPhoneOtp(args, entityManager);
//     return { message: 'OTP sent successfully' };
//   }
// }