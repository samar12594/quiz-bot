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
      `/blok — Blok test tuzish (bir nechta testdan)\n` +
      `/stop — Testni to'xtatish\n` +
      `/score — Joriy natija\n\n` +
      `🌐 Web ilova: ${appUrl}/app`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            [{ text: '📋 Testlar ro\'yxati' }, { text: '🧩 Blok test' }],
            [{ text: '📊 Joriy natija' }, { text: '🛑 Testni to\'xtatish' }],
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

  // ─── BLOK TEST QURUVCHI ────────────────────────────────────────────────

  @Command('blok')
  async onBlokCommand(@Ctx() ctx: Context) {
    await this.startBlok(ctx);
  }

  @Hears('🧩 Blok test')
  async onBlokKeyboard(@Ctx() ctx: Context) {
    await this.startBlok(ctx);
  }

  @Action('blok_new')
  async onBlokNew(@Ctx() ctx: any) {
    await ctx.answerCbQuery().catch(() => {});
    await this.startBlok(ctx);
  }

  private async startBlok(ctx: any) {
    const chatId = String(ctx.chat.id);
    if (this.botService.hasActiveQuiz(chatId)) {
      await ctx.reply("⚠️ Allaqachon test davom etmoqda! Avval /stop yuboring.");
      return;
    }
    const builder = await this.botService.startBlokBuilder(chatId);
    if (!builder.quizzes.length) {
      await ctx.reply("😕 Faol testlar yo'q. Avval test yarating yoki import qiling.");
      this.botService.cancelBlokBuilder(chatId);
      return;
    }
    const { text, keyboard } = this.blokSelectView(builder);
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
  }

  // Test tanlash bosqichi ko'rinishi (checkbox ro'yxat)
  private blokSelectView(b: any) {
    const text =
      `🧩 *Blok test tuzish*\n\n` +
      `Qaysi testlardan savol olamiz? Belgilang (✅), so'ng *Davom etish* ni bosing.\n` +
      `Tanlangan: *${b.selected.length}* ta test`;
    const keyboard = b.quizzes.map((q: any) => {
      const on = b.selected.includes(q.id);
      return [{
        text: `${on ? '✅' : '⬜️'} ${q.title} (${q.total})`,
        callback_data: `blok_tgl_${q.id}`,
      }];
    });
    keyboard.push([
      { text: `▶️ Davom etish (${b.selected.length})`, callback_data: 'blok_go' },
      { text: '❌ Bekor', callback_data: 'blok_cancel' },
    ]);
    return { text, keyboard };
  }

  @Action(/^blok_tgl_(\d+)$/)
  async onBlokToggle(@Ctx() ctx: any) {
    const chatId = String(ctx.chat.id);
    const quizId = parseInt(ctx.match[1]);
    const b = this.botService.getBlokBuilder(chatId);
    if (!b || b.step !== 'select') { await ctx.answerCbQuery('Eskirgan').catch(() => {}); return; }
    this.botService.toggleBlokQuiz(chatId, quizId);
    await ctx.answerCbQuery().catch(() => {});
    const { text, keyboard } = this.blokSelectView(b);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }).catch(() => {});
  }

  @Action('blok_cancel')
  async onBlokCancel(@Ctx() ctx: any) {
    const chatId = String(ctx.chat.id);
    this.botService.cancelBlokBuilder(chatId);
    await ctx.answerCbQuery('Bekor qilindi').catch(() => {});
    await ctx.editMessageText('❌ Blok test bekor qilindi.').catch(() => {});
  }

  @Action('blok_go')
  async onBlokGo(@Ctx() ctx: any) {
    const chatId = String(ctx.chat.id);
    const b = this.botService.getBlokBuilder(chatId);
    if (!b || b.step !== 'select') { await ctx.answerCbQuery('Eskirgan').catch(() => {}); return; }
    if (!b.selected.length) { await ctx.answerCbQuery('Kamida bitta test tanlang!', { show_alert: true }).catch(() => {}); return; }
    this.botService.beginBlokCounts(chatId);
    await ctx.answerCbQuery().catch(() => {});
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});
    await this.askBlokCount(ctx, chatId);
  }

  // Joriy test uchun "nechta savol?" so'rovi
  private async askBlokCount(ctx: any, chatId: string) {
    const b = this.botService.getBlokBuilder(chatId);
    if (!b) return;
    const q = this.botService.currentBlokCountQuiz(chatId);
    if (!q) { await this.askBlokTime(ctx, chatId); return; }

    const presets = [5, 10, 15, 20, 25, 30].filter(n => n < q.total);
    const rows: any[] = [];
    for (let i = 0; i < presets.length; i += 3) {
      rows.push(presets.slice(i, i + 3).map(n => ({ text: `${n}`, callback_data: `blok_cnt_${n}` })));
    }
    rows.push([{ text: `📚 Hammasi (${q.total})`, callback_data: 'blok_cnt_-1' }]);
    rows.push([{ text: '❌ Bekor', callback_data: 'blok_cancel' }]);

    await ctx.reply(
      `🧩 *Blok test* — ${b.countIdx + 1}/${b.selected.length}\n\n` +
      `📚 *${escapeMd(q.title)}*\n` +
      `Mavjud: *${q.total}* savol\n\n` +
      `Nechta savol olamiz? Tugmani bosing yoki son yozing:`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: rows } },
    );
  }

  @Action(/^blok_cnt_(-?\d+)$/)
  async onBlokCount(@Ctx() ctx: any) {
    const chatId = String(ctx.chat.id);
    const b = this.botService.getBlokBuilder(chatId);
    if (!b || b.step !== 'count') { await ctx.answerCbQuery('Eskirgan').catch(() => {}); return; }
    const q = this.botService.currentBlokCountQuiz(chatId);
    if (!q) { await ctx.answerCbQuery().catch(() => {}); return; }

    let n = parseInt(ctx.match[1]);
    if (n === -1) n = q.total; // "Hammasi"
    await ctx.answerCbQuery().catch(() => {});
    await ctx.editMessageText(`✅ *${escapeMd(q.title)}* — ${Math.min(n, q.total)} savol`, { parse_mode: 'Markdown' }).catch(() => {});

    const next = this.botService.setBlokCount(chatId, n);
    if (next === 'count') await this.askBlokCount(ctx, chatId);
    else if (next === 'time') await this.askBlokTime(ctx, chatId);
  }

  // Vaqt (soniya) so'rovi
  private async askBlokTime(ctx: any, chatId: string) {
    const rows = [
      [10, 15, 20].map(n => ({ text: `${n}s`, callback_data: `blok_time_${n}` })),
      [30, 45, 60].map(n => ({ text: `${n}s`, callback_data: `blok_time_${n}` })),
      [{ text: '❌ Bekor', callback_data: 'blok_cancel' }],
    ];
    await ctx.reply(
      `⏱ *Har bir savolga necha soniya?*\n\nTugmani bosing yoki son yozing:`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: rows } },
    );
  }

  @Action(/^blok_time_(\d+)$/)
  async onBlokTime(@Ctx() ctx: any) {
    const chatId = String(ctx.chat.id);
    const b = this.botService.getBlokBuilder(chatId);
    if (!b || b.step !== 'time') { await ctx.answerCbQuery('Eskirgan').catch(() => {}); return; }
    const seconds = parseInt(ctx.match[1]);
    await ctx.answerCbQuery().catch(() => {});
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});
    await this.finishBlok(ctx, chatId, seconds);
  }

  // Tugmasiz — son yozib kiritish (count yoki time bosqichida)
  @On('text')
  async onBlokTextInput(@Ctx() ctx: any) {
    const chatId = String(ctx.chat.id);
    const b = this.botService.getBlokBuilder(chatId);
    if (!b) return; // blok jarayoni yo'q — e'tibor bermaymiz

    const raw = (ctx.message?.text || '').trim();
    const n = parseInt(raw);
    if (!/^\d+$/.test(raw) || isNaN(n) || n < 1) {
      await ctx.reply('🔢 Iltimos, musbat son yuboring (yoki tugmalardan tanlang).');
      return;
    }

    if (b.step === 'count') {
      const next = this.botService.setBlokCount(chatId, n);
      const q = this.botService.currentBlokCountQuiz(chatId);
      if (next === 'count') await this.askBlokCount(ctx, chatId);
      else if (next === 'time') await this.askBlokTime(ctx, chatId);
    } else if (b.step === 'time') {
      await this.finishBlok(ctx, chatId, n);
    }
  }

  private async finishBlok(ctx: any, chatId: string, seconds: number) {
    this.botService.setBlokTime(chatId, seconds);
    await ctx.reply('🧩 Blok test tayyorlanmoqda...');
    try {
      const { quiz, questions } = await this.botService.finalizeBlok(chatId);
      await ctx.reply(
        `🎯 *Blok test boshlanmoqda!*\n\n` +
        `📊 Jami savollar: *${questions.length} ta*\n` +
        `⏱ Har savol: *${quiz.timeLimit} soniya*`,
        { parse_mode: 'Markdown' },
      );
      setTimeout(() => this.botService.sendQuestion(chatId), 2000);
    } catch (e: any) {
      this.botService.cancelBlokBuilder(chatId);
      await ctx.reply(`❌ ${e.message}`);
    }
  }
}
