import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ReportNoShowDto {
  @ApiProperty({ example: 6.4541 }) @IsLatitude() latitude: number;
  @ApiProperty({ example: 3.3947 }) @IsLongitude() longitude: number;

  @ApiPropertyOptional({ description: 'GPS accuracy in metres from the phone' })
  @IsOptional() @IsNumber() @Min(0) accuracy?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class DeclineNoShowDto {
  @ApiProperty() @IsNotEmpty() @IsString() @MaxLength(255) reason: string;
}