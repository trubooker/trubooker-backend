import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';
import { User } from '@modules/core/entities/user.entity';
import { DeleteUserDto } from '@modules/auth/dtos/deleteuser.dto';

@Injectable()
export class UserRepository extends Repository<User> {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly entityManager: EntityManager,
  ) {
    super(userRepository.target, userRepository.manager, userRepository.queryRunner);
  }

  async createUser(data: Partial<User>, entityManager?: EntityManager): Promise<User> {
    const manager = entityManager || this.entityManager;
    const user = manager.create(User, data);
    return manager.save(User, user);
  }

  async findByEmail(email: string): Promise<User> {
    return this.findOne({ where: { email: email.toLowerCase() } });
  }

  async findByPhone(phone: string): Promise<User> {
    return this.findOne({ where: { phone: phone } });
  }

  async findByReferralCode(referralCode: string): Promise<User> {
    return this.findOne({ where: { referralCode } });
  }

  async findByPhoneOrPendingPhone(phone: string): Promise<User> {
  return this.findOne({ where: [{ phone }, { pendingPhone: phone }] });
}

  async updateUser(id: string, data: Partial<User>, entityManager?: EntityManager): Promise<User> {
    const manager = entityManager || this.entityManager;
    await manager.update(User, id, data);
    return manager.findOne(User, { where: { id } });
  }

async deleteUser(id: string, data: DeleteUserDto, entityManager?: EntityManager): Promise<User> {
  const manager = entityManager || this.entityManager;
  const user = await manager.findOne(User, { where: { id } });
  if (!user) throw new NotFoundException('User not found');
  if (data && Object.keys(data).length > 0) {
    await manager.update(User, id, data);
  }

  await manager.softDelete(User, id);                         
  return manager.findOne(User, { where: { id }, withDeleted: true });
}

async findById(id: string): Promise<User | null> {
  return this.findOne({ where: { id } });
}


async setExpoToken(
  id: string,
  expoToken: string,
  entityManager?: EntityManager,
): Promise<void> {
  const manager = entityManager || this.entityManager;

  // A push token belongs to a device, not a person. If this phone was
  // previously signed in as someone else, detach it from that account
  // so the old owner stops receiving this device's notifications.
  await manager.update(
    User,
    { expoToken, id: Not(id) },
    { expoToken: null },
  );

  await manager.update(User, id, { expoToken });
}

async clearExpoToken(id: string, entityManager?: EntityManager): Promise<void> {
  const manager = entityManager || this.entityManager;
  await manager.update(User, id, { expoToken: null });
}
}
