import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

interface SoloState {
  sessionId: number;
  questions: any[];
  currentIndex: number;
  timeLimit: number;
  startTime: Date;
  answeredUsers: Set<string>;
  timer?: NodeJS.Timeout;
  started: boolean;
}

@Injectable()
export class SessionService {
  private soloSessions = new Map<string, SoloState>();

  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  async getActiveSessions() {
    return this.prisma.session.findMany({
      where: { isActive: true },
      include: { quiz: { select: { title: true, timeLimit: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async startSolo(quizId: number, userId: string, username: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!quiz?.isActive) throw new NotFoundException('Test topilmadi');
    if (!quiz.questions.length) throw new NotFoundException('Savollar yo\'q');

    const chatId = `solo_${userId}_${Date.now()}`;
    const session = await this.prisma.session.create({
      data: { quizId, chatId, isActive: true },
    });

    let questions = [...quiz.questions];
    if (quiz.shuffleQ) questions = this.shuffle(questions);

    const state: SoloState = {
      sessionId: session.id,
      questions,
      currentIndex: 0,
      timeLimit: quiz.timeLimit,
      startTime: new Date(),
      answeredUsers: new Set(),
      started: false,
    };
    this.soloSessions.set(chatId, state);

    // On first SSE connect: start the quiz.
    // On reconnect (mid-quiz): resend the current question only to that client.
    this.events.onConnect(chatId, (res) => {
      const s = this.soloSessions.get(chatId);
      if (!s) return;
      if (!s.started) {
        s.started = true;
        this.sendSoloQuestion(chatId);
      } else {
        const q = s.questions[s.currentIndex];
        res.write(`event: question\ndata: ${JSON.stringify({
          sessionId: s.sessionId,
          questionId: q.id,
          text: q.text,
          options: q.options,
          timeLimit: s.timeLimit,
          current: s.currentIndex + 1,
          total: s.questions.length,
        })}\n\n`);
      }
    });

    return { sessionId: session.id, chatId, quizTitle: quiz.title, total: questions.length };
  }

  private sendSoloQuestion(chatId: string) {
    const state = this.soloSessions.get(chatId);
    if (!state) return;

    if (state.timer) clearTimeout(state.timer);
    state.answeredUsers.clear();

    const q = state.questions[state.currentIndex];
    const total = state.questions.length;

    this.events.emit(chatId, 'question', {
      sessionId: state.sessionId,
      questionId: q.id,
      text: q.text,
      options: q.options,
      timeLimit: state.timeLimit,
      current: state.currentIndex + 1,
      total,
    });

    state.timer = setTimeout(() => {
      this.revealSoloAnswer(chatId);
    }, state.timeLimit * 1000);
  }

  private async revealSoloAnswer(chatId: string) {
    const state = this.soloSessions.get(chatId);
    if (!state) return;

    const q = state.questions[state.currentIndex];

    const answers = await this.prisma.answer.findMany({
      where: { sessionId: state.sessionId, questionId: q.id },
    });
    const answerCounts = [0, 0, 0, 0];
    for (const a of answers) {
      if (a.chosen >= 0 && a.chosen <= 3) answerCounts[a.chosen]++;
    }

    this.events.emit(chatId, 'question_result', {
      questionId: q.id,
      correctIndex: q.correct,
      explain: q.explain || null,
      answerCounts,
    });

    // 1.5s pause then next question
    setTimeout(() => {
      state.currentIndex++;
      if (state.currentIndex >= state.questions.length) {
        this.finishSolo(chatId);
      } else {
        this.sendSoloQuestion(chatId);
      }
    }, 1500);
  }

  private async finishSolo(chatId: string) {
    const state = this.soloSessions.get(chatId);
    if (!state) return;

    this.events.clearOnConnect(chatId);

    await this.prisma.session.update({
      where: { id: state.sessionId },
      data: { isActive: false },
    });

    const answers = await this.prisma.answer.findMany({
      where: { sessionId: state.sessionId },
    });

    const totalQ = state.questions.length;
    const byUser: Record<string, { username: string; correct: number }> = {};
    for (const a of answers) {
      if (!byUser[a.userId]) byUser[a.userId] = { username: a.username || a.userId, correct: 0 };
      if (a.isCorrect) byUser[a.userId].correct++;
    }

    const results = Object.values(byUser).sort((a, b) => b.correct - a.correct);

    this.events.emit(chatId, 'quiz_end', {
      results,
      totalQuestions: totalQ,
      elapsed: Math.floor((Date.now() - state.startTime.getTime()) / 1000),
    });

    this.soloSessions.delete(chatId);
  }

  async submitWebAnswer(chatId: string, questionId: number, userId: string, username: string, chosen: number) {
    const state = this.soloSessions.get(chatId);
    if (!state) {
      // It might be a Telegram group session — just find the session
      const session = await this.prisma.session.findFirst({
        where: { chatId, isActive: true },
      });
      if (!session) throw new NotFoundException('Sessiya topilmadi');

      const q = await this.prisma.question.findUnique({ where: { id: questionId } });
      if (!q) throw new NotFoundException('Savol topilmadi');

      const existing = await this.prisma.answer.findFirst({
        where: { sessionId: session.id, questionId, userId },
      });
      if (existing) return { alreadyAnswered: true, isCorrect: existing.isCorrect, correct: q.correct };

      const isCorrect = chosen === q.correct;
      await this.prisma.answer.create({
        data: { sessionId: session.id, userId, username, questionId, chosen, isCorrect },
      });

      const count = await this.prisma.answer.count({
        where: { sessionId: session.id, questionId },
      });
      this.events.emit(chatId, 'answer_count', { questionId, count });

      return { alreadyAnswered: false, isCorrect, correct: q.correct, explain: q.explain };
    }

    // Solo session
    if (state.answeredUsers.has(userId)) {
      const q = state.questions[state.currentIndex];
      return { alreadyAnswered: true, isCorrect: chosen === q.correct, correct: q.correct };
    }

    const q = state.questions[state.currentIndex];
    if (q.id !== questionId) return { alreadyAnswered: true, isCorrect: false, correct: q.correct };

    state.answeredUsers.add(userId);
    const isCorrect = chosen === q.correct;

    await this.prisma.answer.create({
      data: { sessionId: state.sessionId, userId, username, questionId, chosen, isCorrect },
    });

    this.events.emit(chatId, 'answer_count', { questionId, count: state.answeredUsers.size });

    // Solo: clear timer and immediately reveal → next
    if (state.timer) clearTimeout(state.timer);
    this.revealSoloAnswer(chatId);

    return { alreadyAnswered: false, isCorrect, correct: q.correct, explain: q.explain };
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
