import { Module } from '@nestjs/common';
import { BotUpdate } from './bot.update';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { QuizModule } from '../quiz/quiz.module';

@Module({
  imports: [QuizModule],
  controllers: [BotController],
  providers: [BotUpdate, BotService],
  exports: [BotService],
})
export class BotModule {}
