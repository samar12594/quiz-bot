import { Update, Start, Command, Ctx, On, Action, Hears } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { BotService } from './bot.service';
import { QuizService } from '../quiz/quiz.service';

// Markdown (v1) special chars need escaping for user-supplied text
// (titles, usernames). Otherwise '_' / '*' in content can break parser.
function escapeMd(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s).replace(/([_*`\[\]])/g, '\\$1');
}

@Update()
export class BotUpdate {
  constructor(
    private botService: BotService,
    private quizService: QuizService,
  ) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    await ctx.reply(
      `🤖 *QuizBot V2.0*\n\n` +
      `Salom! Test platformasiga xush kelibsiz.\n\n` +
      `📌 *Buyruqlar:*\n` +
      `/quiz — Testlar ro'yxati\n` +
      `/stop — Testni to'xtatish\n` +
      `/score — Joriy natija\n\n` +
      `🌐 Web ilova: ${appUrl}/app`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            [{ text: '📋 Testlar ro\'yxati' }, { text: '📊 Joriy natija' }],
            [{ text: '🛑 Testni to\'xtatish' }],
          ],
          resize_keyboard: true,
        },
      },
    );
  }

  @Command('quiz')
  async onQuizCommand(@Ctx() ctx: Context) {
    await this.handleQuiz(ctx);
  }

  @Hears('📋 Testlar ro\'yxati')
  async onQuizKeyboard(@Ctx() ctx: Context) {
    await this.handleQuiz(ctx);
  }

  private async handleQuiz(ctx: any) {
    const chatId = String(ctx.chat.id);
    if (this.botService.hasActiveQuiz(chatId)) {
      await ctx.reply("⚠️ Allaqachon test davom etmoqda! Avval /stop yuboring.");
      return;
    }
    await this.showQuizList(ctx);
  }

  @Command('stop')
  async onStopCommand(@Ctx() ctx: Context) {
    await this.handleStop(ctx);
  }

  @Hears('🛑 Testni to\'xtatish')
  async onStopKeyboard(@Ctx() ctx: Context) {
    await this.handleStop(ctx);
  }

  private async handleStop(ctx: any) {
    const chatId = String(ctx.chat.id);
    if (!this.botService.hasActiveQuiz(chatId)) { await ctx.reply('❌ Faol test yo\'q.'); return; }
    await this.botService.stopQuiz(chatId);
    await ctx.reply('🛑 Test to\'xtatildi.');
  }

  @Command('score')
  async onScoreCommand(@Ctx() ctx: Context) {
    await this.handleScore(ctx);
  }

  @Hears('📊 Joriy natija')
  async onScoreKeyboard(@Ctx() ctx: Context) {
    await this.handleScore(ctx);
  }

  private async handleScore(ctx: any) {
    const chatId = String(ctx.chat.id);
    const score = await this.botService.getCurrentScore(chatId);
    if (!score) { await ctx.reply('❌ Faol test yo\'q.'); return; }
    await ctx.reply(score, { parse_mode: 'Markdown' });
  }

  @Hears(/^\/quiz_(\d+)/)
  async onQuizById(@Ctx() ctx: any) {
    const chatId = String(ctx.chat.id);
    const quizId = parseInt(ctx.match[1]);

    if (this.botService.hasActiveQuiz(chatId)) {
      await ctx.reply('⚠️ Allaqachon test davom etmoqda! Avval /stop yuboring.');
      return;
    }

    await this.doStartQuiz(ctx, chatId, quizId);
  }

  @Action(/^sq_(\d+)$/)
  async onSelectQuiz(@Ctx() ctx: any) {
    const chatId = String(ctx.chat.id);
    const quizId = parseInt(ctx.match[1]);
    await ctx.answerCbQuery().catch(() => {});

    if (this.botService.hasActiveQuiz(chatId)) {
      await ctx.reply('⚠️ Allaqachon test davom etmoqda!');
      return;
    }

    await this.doStartQuiz(ctx, chatId, quizId);
  }

  @Action(/^restart_(\d+)$/)
  async onRestart(@Ctx() ctx: any) {
    const chatId = String(ctx.chat.id);
    const quizId = parseInt(ctx.match[1]);
    await ctx.answerCbQuery('🔄 Qaytadan boshlanmoqda...').catch(() => {});

    if (this.botService.hasActiveQuiz(chatId)) {
      await ctx.reply('⚠️ Allaqachon test davom etmoqda! Avval /stop yuboring.');
      return;
    }

    await this.doStartQuiz(ctx, chatId, quizId);
  }

  @Action('quiz_list')
  async onQuizList(@Ctx() ctx: any) {
    await ctx.answerCbQuery().catch(() => {});
    await this.showQuizList(ctx);
  }

  private async showQuizList(ctx: any) {
    const quizzes = await this.quizService.findActive();
    if (!quizzes.length) {
      await ctx.reply("😕 Faol testlar yo'q. Admin paneldan test yarating.");
      return;
    }
    const kb = quizzes.map(q => [{
      text: `📚 ${q.title} (${(q as any)._count.questions} savol)`,
      callback_data: `sq_${q.id}`,
    }]);
    await ctx.reply('📋 *Test tanlang:*', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
  }

  private async doStartQuiz(ctx: any, chatId: string, quizId: number) {
    try {
      const { quiz, questions } = await this.botService.startQuiz(chatId, quizId);
      const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;

      await ctx.reply(
        `🎯 *${escapeMd(quiz.title)}* boshlanmoqda!\n\n` +
        `📊 Savollar soni: *${questions.length} ta*\n` +
        `⏱ Har savol: *${quiz.timeLimit} soniya*\n\n` +
        `🌐 Web orqali qo'shilish:\n${appUrl}/app?join=${chatId}`,
        { parse_mode: 'Markdown' },
      );

      setTimeout(() => this.botService.sendQuestion(chatId), 2000);
    } catch (e: any) {
      await ctx.reply(`❌ ${e.message}`);
    }
  }

  @On('poll_answer')
  async onPollAnswer(@Ctx() ctx: any) {
    const pa = ctx.update?.poll_answer;
    if (!pa || !pa.option_ids?.length) return;

    const userId = String(pa.user?.id || pa.voter_chat?.id || '');
    const username = pa.user?.username || pa.user?.first_name || userId;
    const chosen = pa.option_ids[0];

    await this.botService.handlePollAnswer(pa.poll_id, userId, username, chosen);
  }
}
