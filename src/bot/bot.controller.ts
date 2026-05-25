import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { BotService } from './bot.service';

function checkAuth(secret: string) {
  if (secret !== process.env.ADMIN_SECRET) throw new UnauthorizedException('Ruxsat yo\'q');
}

@Controller('api/bot')
export class BotController {
  constructor(private botService: BotService) {}

  @Post('send-to-group')
  async sendToGroup(
    @Headers('x-admin-secret') secret: string,
    @Body() body: { chatId: string; quizId: number },
  ) {
    checkAuth(secret);
    return this.botService.sendQuizToGroup(body.chatId, body.quizId);
  }
}
