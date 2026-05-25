import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('api/users')
export class UserController {
  constructor(private userService: UserService) {}

  @Post('register')
  async register(@Body() body: { name: string; phone: string }) {
    if (!body.name?.trim()) throw new BadRequestException('Ism kiriting');
    if (!body.phone?.trim()) throw new BadRequestException('Telefon raqam kiriting');
    const user = await this.userService.register(body.name.trim(), body.phone.trim());
    return { id: String(user.id), name: user.name, token: user.token };
  }
}
