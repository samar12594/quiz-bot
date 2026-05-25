import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async register(name: string, phone: string) {
    const existing = await this.prisma.webUser.findUnique({ where: { phone } });
    if (existing) {
      return this.prisma.webUser.update({ where: { phone }, data: { name } });
    }
    return this.prisma.webUser.create({ data: { name, phone } });
  }

  async findByToken(token: string) {
    return this.prisma.webUser.findUnique({ where: { token } });
  }
}
