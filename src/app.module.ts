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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TelegrafModule.forRoot({ token: process.env.TELEGRAM_BOT_TOKEN, middlewares: [] }),
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
