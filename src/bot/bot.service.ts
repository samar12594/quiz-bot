import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QuizService } from '../quiz/quiz.service';
import { EventsService } from '../events/events.service';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

interface ActiveQuiz {
  sessionId: number;
  quizId: number;
  quizTitle: string;
  questions: any[];
  currentIndex: number;
  startTime: Date;
  timeLimit: number;
  currentPollId?: string;
  nextTimer?: NodeJS.Timeout;
  isBlok?: boolean;
}

// Blok test quruvchi - foydalanuvchi bir nechta FANdan savollarni
// birlashtirib yangi test yaratadigan ko'p bosqichli holat.
export interface BlokSubject { key: string; label: string; quizIds: number[]; total: number }
export interface BlokBuilder {
  step: 'select' | 'count' | 'time';
  subjects: BlokSubject[];
  page: number;
  selected: string[];               // tanlangan fan kalitlari (key)
  counts: Record<string, number>;   // key -> savollar soni
  countIdx: number;
  timeLimit?: number;
}

// Telegram Markdown (v1) special characters that need escaping inside text
// to avoid "can't parse entities" errors (e.g. username "Healer_css" treated
// as start of italic). Applied to user-supplied data (usernames, titles, ...).
function escapeMd(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s).replace(/([_*`\[\]])/g, '\\$1');
}

@Injectable()
export class BotService implements OnModuleInit {
  private activeQuizzes = new Map<string, ActiveQuiz>();
  private pollMap = new Map<string, { chatId: string; questionId: number; sessionId: number; correctIndex: number }>();
  private blokBuilders = new Map<string, BlokBuilder>();

  constructor(
    private prisma: PrismaService,
    private quizService: QuizService,
    private events: EventsService,
    @InjectBot() private bot: Telegraf,
  ) {}

  async onModuleInit() {
    try {
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: "Botni ishga tushirish" },
        { command: 'quiz', description: "Testlar ro'yxati" },
        { command: 'blok', description: "Blok test tuzish" },
        { command: 'avtoblok', description: "Tayyor avto blok testlar" },
        { command: 'stop', description: "Testni to'xtatish" },
        { command: 'score', description: 'Joriy natija' },
      ]);
    } catch (e: any) {
      console.error('setMyCommands error:', e.message);
    }
  }

  hasActiveQuiz(chatId: string) { return this.activeQuizzes.has(chatId); }
  getActiveQuiz(chatId: string) { return this.activeQuizzes.get(chatId); }

  // ─── Blok test quruvchi ───────────────────────────────────────────────

  async startBlokBuilder(chatId: string): Promise<BlokBuilder> {
    const subjects = await this.quizService.getSubjectGroups();
    const builder: BlokBuilder = {
      step: 'select',
      subjects,
      page: 0,
      selected: [],
      counts: {},
      countIdx: 0,
    };
    this.blokBuilders.set(chatId, builder);
    return builder;
  }

  getBlokBuilder(chatId: string) { return this.blokBuilders.get(chatId); }
  cancelBlokBuilder(chatId: string) { this.blokBuilders.delete(chatId); }

  setBlokPage(chatId: string, page: number) {
    const b = this.blokBuilders.get(chatId);
    if (b) b.page = page;
  }

  toggleBlokSubject(chatId: string, key: string): BlokBuilder | undefined {
    const b = this.blokBuilders.get(chatId);
    if (!b) return undefined;
    const i = b.selected.indexOf(key);
    if (i >= 0) b.selected.splice(i, 1);
    else b.selected.push(key);
    return b;
  }

  // Joriy (count bosqichidagi) fanni qaytaradi yoki barchasi bo'lsa null.
  currentBlokCountSubject(chatId: string): BlokSubject | null {
    const b = this.blokBuilders.get(chatId);
    if (!b) return null;
    const key = b.selected[b.countIdx];
    return b.subjects.find(s => s.key === key) || null;
  }

  // Joriy fan uchun savollar sonini saqlaydi; keyingi bosqichni belgilaydi.
  setBlokCount(chatId: string, count: number): 'count' | 'time' | null {
    const b = this.blokBuilders.get(chatId);
    if (!b || b.step !== 'count') return null;
    const s = b.subjects.find(x => x.key === b.selected[b.countIdx]);
    if (!s) return null;
    b.counts[s.key] = Math.max(1, Math.min(count, s.total));
    b.countIdx++;
    if (b.countIdx >= b.selected.length) {
      b.step = 'time';
      return 'time';
    }
    return 'count';
  }

  beginBlokCounts(chatId: string): boolean {
    const b = this.blokBuilders.get(chatId);
    if (!b || b.selected.length === 0) return false;
    b.step = 'count';
    b.countIdx = 0;
    return true;
  }

  setBlokTime(chatId: string, seconds: number) {
    const b = this.blokBuilders.get(chatId);
    if (!b) return;
    b.timeLimit = Math.max(5, seconds);
  }

  async startQuiz(chatId: string, quizId: number) {
    const quiz = await this.quizService.findOne(quizId);
    if (!quiz?.isActive) throw new Error('Test topilmadi yoki faol emas');
    if (!quiz.questions?.length) throw new Error("Bu testda savollar yo'q!");
    return this.launchQuiz(chatId, quiz, false);
  }

  // Tayyor quiz (savollari bilan) obyektidan testni xotirada ishga tushiradi.
  // startQuiz va blok test (finalizeBlok) shu metodga tayanadi.
  private async launchQuiz(chatId: string, quiz: any, isBlok: boolean) {
    let questions = [...quiz.questions];
    if (quiz.shuffleQ) questions = this.shuffle(questions);
    if (quiz.shuffleA) questions = questions.map(q => this.shuffleOptions(q));

    const session = await this.prisma.session.create({
      data: { quizId: quiz.id, chatId, isActive: true },
    });

    this.activeQuizzes.set(chatId, {
      sessionId: session.id,
      quizId: quiz.id,
      quizTitle: quiz.title,
      questions,
      currentIndex: 0,
      startTime: new Date(),
      timeLimit: Math.max(5, quiz.timeLimit),
      isBlok,
    });

    return { session, quiz, questions };
  }

  // Blok-builder yakunlanganda: tanlangan testlardan savollarni nusxalab
  // yashirin (isActive:false) yangi quiz yaratadi va uni darhol ishga tushiradi.
  // Yashirin — chunki bu shaxsiy/bir martalik blok, umumiy testlar ro'yxatini
  // to'ldirmasligi kerak, lekin natijalari adminda ko'rinadi.
  async finalizeBlok(chatId: string) {
    const b = this.blokBuilders.get(chatId);
    if (!b || !b.selected.length) throw new Error('Blok test sozlanmadi');

    const chosen = b.selected
      .map(key => b.subjects.find(s => s.key === key))
      .filter(Boolean) as BlokSubject[];

    const sources = chosen.map(s => ({ quizIds: s.quizIds, count: b.counts[s.key] ?? 0 }));
    let title = '🧩 Blok: ' + chosen.map(s => s.label).join(' + ');
    if (title.length > 90) title = title.slice(0, 89) + '…';

    const quiz = await this.quizService.createBlok({
      title,
      timeLimit: b.timeLimit ?? 30,
      shuffleQ: true,
      shuffleA: true,
      isActive: false,
      sources,
    });

    this.blokBuilders.delete(chatId);

    if (!quiz.questions?.length) throw new Error("Tanlangan fanlarda savollar yo'q!");
    return this.launchQuiz(chatId, quiz, true);
  }

  // ─── Avto blok: admin saqlagan preset asosida darhol test tuzadi ──────

  async listPresets() {
    return this.quizService.findPresets();
  }

  async runPreset(chatId: string, presetId: number) {
    const preset: any = await this.quizService.findPreset(presetId);
    const items = (preset.items as any[]) || [];
    const sources = items
      .map(it => ({ quizIds: it.quizIds || [], count: it.count || 0 }))
      .filter(s => s.quizIds.length && s.count > 0);
    if (!sources.length) throw new Error('Bu presetda fanlar yo\'q');

    let title = `🤖 ${preset.name}`;
    if (title.length > 90) title = title.slice(0, 89) + '…';

    const quiz = await this.quizService.createBlok({
      title,
      timeLimit: preset.timeLimit ?? 30,
      shuffleQ: preset.shuffleQ ?? true,
      shuffleA: preset.shuffleA ?? true,
      isActive: false,
      sources,
    });

    if (!quiz.questions?.length) throw new Error("Presetdagi fanlarda savollar yo'q!");
    return this.launchQuiz(chatId, quiz, true);
  }

  async sendQuestion(chatId: string) {
    const active = this.activeQuizzes.get(chatId);
    if (!active) return;

    if (active.nextTimer) clearTimeout(active.nextTimer);

    const q = active.questions[active.currentIndex];
    const options = q.options as string[];
    const timeLimit = active.timeLimit;
    const questionText = `[${active.currentIndex + 1}/${active.questions.length}] ${q.text}`;

    try {
      const pollMsg: any = await (this.bot.telegram as any).sendPoll(
        chatId,
        questionText,
        options,
        {
          type: 'quiz',
          correct_option_id: q.correct,
          explanation: q.explain || undefined,
          is_anonymous: false,
          open_period: timeLimit,
        },
      );

      const pollId = pollMsg?.poll?.id;
      if (pollId) {
        active.currentPollId = pollId;
        this.pollMap.set(pollId, { chatId, questionId: q.id, sessionId: active.sessionId, correctIndex: q.correct });
      }
    } catch (e: any) {
      console.error('sendPoll error:', e.message);
    }

    this.events.emit(chatId, 'question', {
      sessionId: active.sessionId,
      questionId: q.id,
      text: q.text,
      options: q.options,
      timeLimit,
      current: active.currentIndex + 1,
      total: active.questions.length,
    });

    active.nextTimer = setTimeout(() => {
      this.nextQuestion(chatId);
    }, (timeLimit + 2) * 1000);
  }

  async handlePollAnswer(pollId: string, userId: string, username: string, chosen: number) {
    const info = this.pollMap.get(pollId);
    if (!info) return;

    const existing = await this.prisma.answer.findFirst({
      where: { sessionId: info.sessionId, questionId: info.questionId, userId },
    });
    if (existing) return;

    // info.correctIndex is the SHUFFLED correct index (matches what user saw in the poll).
    // Fetching q.correct from DB here would be the ORIGINAL pre-shuffle index — wrong.
    const isCorrect = chosen === info.correctIndex;
    await this.prisma.answer.create({
      data: { sessionId: info.sessionId, userId, username, questionId: info.questionId, chosen, isCorrect },
    });

    const count = await this.prisma.answer.count({
      where: { sessionId: info.sessionId, questionId: info.questionId },
    });
    this.events.emit(info.chatId, 'answer_count', { questionId: info.questionId, count });

    // Solo mode: private chat (positive chatId) → immediately advance
    const active = this.activeQuizzes.get(info.chatId);
    if (active && !info.chatId.startsWith('-')) {
      if (active.nextTimer) clearTimeout(active.nextTimer);
      active.nextTimer = undefined;
      setTimeout(() => this.nextQuestion(info.chatId), 800);
    }
  }

  async nextQuestion(chatId: string) {
    const active = this.activeQuizzes.get(chatId);
    if (!active) return;

    const prevQ = active.questions[active.currentIndex];

    const answers = await this.prisma.answer.findMany({
      where: { sessionId: active.sessionId, questionId: prevQ.id },
    });
    const counts = [0, 0, 0, 0];
    for (const a of answers) { if (a.chosen >= 0 && a.chosen <= 3) counts[a.chosen]++; }

    this.events.emit(chatId, 'question_result', {
      questionId: prevQ.id,
      correctIndex: prevQ.correct,
      explain: prevQ.explain || null,
      answerCounts: counts,
    });

    await new Promise(r => setTimeout(r, 1500));

    active.currentIndex++;
    if (active.currentIndex >= active.questions.length) {
      await this.finishQuiz(chatId);
    } else {
      await this.sendQuestion(chatId);
    }
  }

  async finishQuiz(chatId: string) {
    const active = this.activeQuizzes.get(chatId);
    if (!active) return;

    if (active.nextTimer) clearTimeout(active.nextTimer);

    await this.prisma.session.update({ where: { id: active.sessionId }, data: { isActive: false } });

    const elapsed = Math.floor((Date.now() - active.startTime.getTime()) / 1000);
    const answers = await this.prisma.answer.findMany({ where: { sessionId: active.sessionId } });
    const totalQ = active.questions.length;

    const byUser: Record<string, { username: string; correct: number }> = {};
    for (const a of answers) {
      if (!byUser[a.userId]) byUser[a.userId] = { username: a.username || a.userId, correct: 0 };
      if (a.isCorrect) byUser[a.userId].correct++;
    }

    const sorted = Object.values(byUser).sort((a, b) => b.correct - a.correct);
    const medals = ['🥇', '🥈', '🥉'];
    const m = Math.floor(elapsed / 60), s = elapsed % 60;
    const timeStr = `${m}:${String(s).padStart(2, '0')}`;
    const SEP = '━━━━━━━━━━━━━━━━';

    // Header
    let result = `🏁 *${escapeMd(active.quizTitle)}* yakunlandi!\n`;
    result += `${SEP}\n`;

    if (!sorted.length) {
      result += `\n😕 _Hech kim javob bermadi_\n\n`;
      result += `⏱ Vaqt: *${timeStr}*\n`;
      result += `📝 Savollar soni: *${totalQ} ta*\n`;
    } else {
      // Top participants (max 5)
      result += `\n📊 *Yetakchilar*\n\n`;
      const TOP_LIMIT = 5;
      const topN = sorted.slice(0, TOP_LIMIT);
      topN.forEach((u, i) => {
        const pct = Math.round((u.correct / totalQ) * 100);
        const filled = Math.round(pct / 10);
        const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
        const rank = medals[i] || `${i + 1}.`;
        result += `${rank} @${escapeMd(u.username)}\n`;
        result += `   \`${bar}\` ${u.correct}/${totalQ} · ${pct}%\n`;
      });
      if (sorted.length > TOP_LIMIT) {
        result += `\n_... va yana ${sorted.length - TOP_LIMIT} ta ishtirokchi_\n`;
      }

      // Stats
      const topPct = Math.round((sorted[0].correct / totalQ) * 100);
      const avgCorrect = sorted.reduce((sum, u) => sum + u.correct, 0) / sorted.length;
      const avgPct = Math.round((avgCorrect / totalQ) * 100);
      const perfectCount = sorted.filter(u => u.correct === totalQ).length;

      result += `\n${SEP}\n`;
      result += `📈 *Statistika*\n`;
      result += `👥 Ishtirokchilar: *${sorted.length}*\n`;
      result += `⏱ Umumiy vaqt: *${timeStr}*\n`;
      result += `🏆 Eng yuqori: *${topPct}%*\n`;
      if (sorted.length > 1) {
        result += `📊 O'rtacha: *${avgPct}%*\n`;
      }
      if (perfectCount > 0) {
        result += `💎 Mukammal natija: *${perfectCount}* kishi\n`;
      }

      // Motivational message based on top score
      result += `\n`;
      if (topPct === 100) {
        result += `💎 _Mukammal! Hech kim sizdan o'tolmadi._`;
      } else if (topPct >= 80) {
        result += `🌟 _Ajoyib natija! Davom eting!_`;
      } else if (topPct >= 60) {
        result += `👍 _Yaxshi harakat!_`;
      } else if (topPct >= 40) {
        result += `💪 _Yaxshi, lekin yana yaxshilash mumkin._`;
      } else {
        result += `📚 _Materialni takrorlab, qayta urinib ko'ring._`;
      }
    }

    const quizId = active.quizId;
    // Telegram URL tugmalari uchun HTTPS yoki public URL kerak.
    // localhost ishlamaydi - bunday holda tugmani tushirib qoldiramiz.
    const appUrl = process.env.APP_URL;
    const isPublicHttps = appUrl && /^https:\/\//i.test(appUrl);

    const secondRow: any[] = [{ text: '📋 Boshqa testlar', callback_data: 'quiz_list' }];
    if (isPublicHttps) {
      secondRow.push({ text: '🌐 Web ilova', url: `${appUrl}/app` });
    }

    // Blok test yashirin quiz ustida ishlaydi — uni qayta boshlab bo'lmaydi,
    // shuning uchun "Yangi blok test" tugmasini ko'rsatamiz.
    const firstRow = active.isBlok
      ? [{ text: '🧩 Yangi blok test', callback_data: 'blok_new' }]
      : [{ text: '🔄 Qaytadan urinish', callback_data: `restart_${quizId}` }];

    await this.bot.telegram.sendMessage(chatId, result, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          firstRow,
          secondRow,
        ],
      },
    });

    this.events.emit(chatId, 'quiz_end', {
      results: sorted.map(u => ({ ...u, total: totalQ })),
      totalQuestions: totalQ,
      elapsed,
    });

    this.activeQuizzes.delete(chatId);
  }

  async stopQuiz(chatId: string) {
    const active = this.activeQuizzes.get(chatId);
    if (!active) return;
    if (active.nextTimer) clearTimeout(active.nextTimer);
    await this.prisma.session.update({ where: { id: active.sessionId }, data: { isActive: false } });
    this.activeQuizzes.delete(chatId);
  }

  async getCurrentScore(chatId: string): Promise<string | null> {
    const active = this.activeQuizzes.get(chatId);
    if (!active) return null;
    const answers = await this.prisma.answer.findMany({ where: { sessionId: active.sessionId } });
    const totalQ = active.questions.length;
    const byUser: Record<string, { username: string; correct: number }> = {};
    for (const a of answers) {
      if (!byUser[a.userId]) byUser[a.userId] = { username: a.username || a.userId, correct: 0 };
      if (a.isCorrect) byUser[a.userId].correct++;
    }
    const sorted = Object.values(byUser).sort((a, b) => b.correct - a.correct);
    const cur = active.currentIndex + 1;
    const pctDone = Math.round((cur / totalQ) * 100);
    const filled = Math.round(pctDone / 10);
    const progressBar = '█'.repeat(filled) + '░'.repeat(10 - filled);

    let text = `📊 *${escapeMd(active.quizTitle)}*\n`;
    text += `━━━━━━━━━━━━━━━━\n`;
    text += `📍 Joriy savol: *${cur}/${totalQ}*\n`;
    text += `   \`${progressBar}\` ${pctDone}%\n\n`;
    if (!sorted.length) return text + '_Hali hech kim javob bermadi_';

    const medals = ['🥇', '🥈', '🥉'];
    text += `*Joriy yetakchilar:*\n`;
    sorted.slice(0, 5).forEach((u, i) => {
      const rank = medals[i] || `${i + 1}.`;
      text += `${rank} @${escapeMd(u.username)} — *${u.correct}* ✅\n`;
    });
    if (sorted.length > 5) text += `_... va yana ${sorted.length - 5} ishtirokchi_`;
    return text;
  }

  async sendQuizToGroup(chatId: string, quizId: number) {
    const quiz = await this.quizService.findOne(quizId);
    const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    await this.bot.telegram.sendMessage(
      chatId,
      `📚 *${escapeMd(quiz.title)}*\n` +
      `📝 ${quiz.questions.length} ta savol · ⏱ ${quiz.timeLimit} soniya/savol\n` +
      (quiz.description ? `\n_${escapeMd(quiz.description)}_\n` : '') +
      `\n▶️ Testni boshlash: /quiz\n` +
      `🌐 Web orqali: ${appUrl}/app`,
      { parse_mode: 'Markdown' },
    );
    return { success: true };
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private shuffleOptions(q: any): any {
    const opts = (q.options as string[]) || [];
    const indices = opts.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const newOptions = indices.map(i => opts[i]);
    const newCorrect = indices.indexOf(q.correct);
    return { ...q, options: newOptions, correct: newCorrect };
  }
}
