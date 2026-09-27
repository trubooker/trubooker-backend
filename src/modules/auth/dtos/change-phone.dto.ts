import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ChangePhoneDto {
  @ApiProperty({ example: '+2348012345678' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\+?\d{10,15}$/, { message: 'Enter a valid phone number' })
  phone: string;
}