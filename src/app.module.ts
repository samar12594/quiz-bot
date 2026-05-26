import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { PrismaModule } from './prisma/prisma.module';
import { EventsModule } from './events/events.module';
import { BotModule } from './bot/bot.module';
import { QuizModule } from './quiz/quiz.module';
import { ImportModule } from './import/import.module';
import { AdminModule } from './admin/admin.module';
import { UserModule } from './user/user.module';
import { SessionModule } from './session/session.module';

function telegrafConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const appUrl = process.env.APP_URL || '';
  if (appUrl.startsWith('https://')) {
    return {
      token,
      launchOptions: {
        webhook: { domain: appUrl, hookPath: '/tg-hook' },
      },
    };
  }
  return { token };
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TelegrafModule.forRoot(telegrafConfig()),
    PrismaModule,
    EventsModule,
    BotModule,
    QuizModule,
    ImportModule,
    AdminModule,
    UserModule,
    SessionModule,
  ],
})
export class AppModule {}
