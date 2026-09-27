import { Column, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { UserRole, UserStatus } from '../../../types/enums';
import { BaseEntity } from './base.entity';
import { Role } from './role.entity';

@Entity('users')
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar' })
  email: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', nullable: true })
  phone: string;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', nullable: true })
  password: string;

  @Column({ type: 'varchar' })
  firstName: string;

  @Column({ type: 'varchar' })
  lastName: string;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'uuid', nullable: true })
  roleId: string;

  @ManyToOne(() => Role, (role) => role.users, { eager: false })
  @JoinColumn({ name: 'roleId' })
  roletru: Role;

  @Column({ type: 'varchar', enum: UserRole, default: UserRole.PASSENGER })
  role: UserRole;

  @Column({ type: 'varchar', enum: UserStatus, default: UserStatus.PENDING })
  status: UserStatus;

  @Column({ type: 'boolean', default: false })
  isEmailVerified: boolean;

  @Column({ type: 'boolean', default: false })
  isPhoneVerified: boolean;

  @Column({ type: 'varchar', nullable: true })
  profileImage: string;

  @Column({ type: 'varchar', nullable: true })
  referralCode: string;

  @Column({ type: 'varchar', nullable: true })
  referredBy: string;

  @Column({ type: 'varchar', nullable: true })
  expoToken: string;

    @Column({ type: 'varchar', nullable: true })
    deleteReason: string;


  @Column({ type: 'varchar', nullable: true })
  deviceType: string;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', nullable: true })
  otpCode: string;

    // @IsDateString()
    // @Exclude({ toPlainOnly: true })
    // @DeleteDateColumn()
    // dob?: Date;

  @Column({ type: 'date', nullable: true })
  dob: string;

@Column({ type: 'varchar', nullable: true })
pendingPhone: string;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', nullable: true })
  phoneOtpCode: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  otpExpiresAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  phoneOtpExpiresAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

@Exclude({ toPlainOnly: true })
@Column({ type: 'integer', default: 0 })
otpAttempts: number;

@Exclude({ toPlainOnly: true })
@Column({ type: 'integer', default: 0 })
phoneOtpAttempts: number;

  @Column({ type: 'varchar', nullable: true })
  city: string;

  @Column({ type: 'varchar', nullable: true })
  about: string;

  @Column({ type: 'varchar', nullable: true })
  yearOfExp: string;

    @Column({ type: 'varchar', nullable: true })
  state: string;

  @Column({ type: 'varchar', nullable: true })
  country: string;

  @Column({ type: 'varchar', nullable: true })
  address: string;

  @Column({ type: 'varchar', nullable: true })
  gender: string;

  @Column({ type: 'boolean', default: false })
  iAgree: boolean;


}
