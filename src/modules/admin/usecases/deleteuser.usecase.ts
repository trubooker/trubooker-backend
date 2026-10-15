import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Usecase } from '@broker/types';
import { AdminService } from '../services/admin.service';

@Injectable()
export class DeleteUserUsecase extends Usecase {
  constructor(private readonly adminService: AdminService) {
    super();
  }

  async execute(
    _entityManager: EntityManager,
    args: { id: string; adminId: string; reason?: string },
  ) {
    return this.adminService.deleteUser(args.id, args.adminId, args.reason);
  }
}