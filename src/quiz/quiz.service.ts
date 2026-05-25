import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuizService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.quiz.findMany({
      include: { _count: { select: { questions: true, sessions: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!quiz) throw new NotFoundException(`Quiz #${id} topilmadi`);
    return quiz;
  }

  async findActive() {
    return this.prisma.quiz.findMany({
      where: { isActive: true },
      include: { _count: { select: { questions: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: {
    title: string;
    description?: string;
    timeLimit?: number;
    shuffleQ?: boolean;
    shuffleA?: boolean;
  }) {
    return this.prisma.quiz.create({ data });
  }

  async update(id: number, data: any) {
    return this.prisma.quiz.update({ where: { id }, data });
  }

  async remove(id: number) {
    const sessions = await this.prisma.session.findMany({
      where: { quizId: id },
      select: { id: true },
    });
    if (sessions.length) {
      const ids = sessions.map(s => s.id);
      await this.prisma.answer.deleteMany({ where: { sessionId: { in: ids } } });
      await this.prisma.session.deleteMany({ where: { quizId: id } });
    }
    await this.prisma.question.deleteMany({ where: { quizId: id } });
    return this.prisma.quiz.delete({ where: { id } });
  }

  async addQuestion(quizId: number, q: {
    text: string;
    options: string[];
    correct: number;
    explain?: string;
    order?: number;
  }) {
    return this.prisma.question.create({
      data: { quizId, ...q },
    });
  }

  async getQuestions(quizId: number) {
    return this.prisma.question.findMany({
      where: { quizId },
      orderBy: { order: 'asc' },
    });
  }

  async removeQuestion(id: number) {
    return this.prisma.question.delete({ where: { id } });
  }

  async getStats(quizId: number) {
    const sessions = await this.prisma.session.findMany({
      where: { quizId },
      include: {
        answers: true,
        quiz: { select: { title: true, _count: { select: { questions: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((s) => {
      const byUser: Record<string, { username: string; correct: number; total: number }> = {};
      for (const a of s.answers) {
        if (!byUser[a.userId]) {
          byUser[a.userId] = { username: a.username || a.userId, correct: 0, total: 0 };
        }
        byUser[a.userId].total++;
        if (a.isCorrect) byUser[a.userId].correct++;
      }
      return {
        sessionId: s.id,
        chatId: s.chatId,
        isActive: s.isActive,
        createdAt: s.createdAt,
        quizTitle: s.quiz.title,
        totalQuestions: s.quiz._count.questions,
        participants: Object.values(byUser).sort((a, b) => b.correct - a.correct),
      };
    });
  }
}
