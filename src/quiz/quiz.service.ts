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

  // Test nomidan "fan" (subject) nomini ajratib oladi — boshidagi raqamli
  // diapazon ("151 - 200", "1-38") yoki "N-variant" qismini olib tashlaydi.
  // Masalan: "1-38 Bolalar adabiyoti" → "Bolalar adabiyoti".
  static subjectOf(title: string): string {
    let s = (title || '').trim();
    s = s.replace(/^\d+\s*[-–—]\s*\d+\s*/, '');
    s = s.replace(/^\d+\s*[-–—]\s*variant\s*/i, '');
    return s.trim() || (title || '').trim();
  }

  // Faol testlarni fan bo'yicha guruhlaydi. Har bir guruh — bir nechta
  // test bo'lagini (1-50, 51-100...) birlashtirgan yagona fan.
  async getSubjectGroups() {
    // Blok testlarni chiqarib tashlaymiz — ular manba fan bo'la olmaydi
    const quizzes = (await this.findActive()).filter((q: any) => !q.isBlok);
    const map = new Map<string, { key: string; label: string; quizIds: number[]; total: number; parts: number }>();
    for (const q of quizzes as any[]) {
      const label = QuizService.subjectOf(q.title);
      const key = label.toLowerCase();
      if (!map.has(key)) map.set(key, { key, label, quizIds: [], total: 0, parts: 0 });
      const g = map.get(key)!;
      g.quizIds.push(q.id);
      g.total += q._count?.questions ?? 0;
      g.parts += 1;
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'uz'));
  }

  // Blok test: bir nechta manbadan tanlangan miqdorda savollarni nusxalab
  // yangi test yaratadi. Har bir manba bir yoki bir nechta test (fan bo'lagi)
  // bo'lishi mumkin — savollar ularning BIRLASHGAN to'plamidan random tanlanadi.
  async createBlok(data: {
    title: string;
    description?: string;
    timeLimit?: number;
    shuffleQ?: boolean;
    shuffleA?: boolean;
    isActive?: boolean;
    sources: { quizId?: number; quizIds?: number[]; count: number }[];
  }) {
    if (!data.sources?.length) {
      throw new NotFoundException('Kamida bitta manba tanlang');
    }

    const quiz = await this.prisma.quiz.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        timeLimit: data.timeLimit ?? 30,
        shuffleQ: data.shuffleQ ?? true,
        shuffleA: data.shuffleA ?? true,
        isActive: data.isActive ?? true,
        isBlok: true, // blok test — fan guruhlashda manba sifatida ko'rinmaydi
      },
    });

    let order = 0;
    const toCreate: any[] = [];
    for (const src of data.sources) {
      const ids = src.quizIds?.length ? src.quizIds : (src.quizId != null ? [src.quizId] : []);
      if (!ids.length || !src.count || src.count < 1) continue;
      const pool = await this.prisma.question.findMany({
        where: { quizId: { in: ids } },
      });
      const picked = this.shuffleArr(pool).slice(0, src.count);
      for (const q of picked) {
        toCreate.push({
          quizId: quiz.id,
          text: q.text,
          options: q.options as any,
          correct: q.correct,
          explain: q.explain,
          order: order++,
        });
      }
    }

    if (toCreate.length) {
      await this.prisma.question.createMany({ data: toCreate });
    }

    return this.findOne(quiz.id);
  }

  // Berilgan testlarning savollarini import shabloniga mos CSV matniga aylantiradi.
  async exportCsv(quizIds: number[]): Promise<{ filename: string; csv: string }> {
    const quizzes = await this.prisma.quiz.findMany({
      where: { id: { in: quizIds } },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const letter = ['A', 'B', 'C', 'D'];
    const rows: string[] = ['quiz_title,question,option_a,option_b,option_c,option_d,correct,explain'];
    let label = 'blok';
    for (const quiz of quizzes) {
      label = QuizService.subjectOf(quiz.title);
      for (const q of quiz.questions) {
        const opts = (q.options as string[]) || [];
        rows.push([
          esc(label),
          esc(q.text),
          esc(opts[0]), esc(opts[1]), esc(opts[2]), esc(opts[3]),
          esc(letter[q.correct] || 'A'),
          esc(q.explain || ''),
        ].join(','));
      }
    }
    const safe = label.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 50) || 'blok';
    return { filename: `${safe}.csv`, csv: rows.join('\n') };
  }

  // ─── Avto blok presetlari ─────────────────────────────────────────────

  async createPreset(data: {
    name: string;
    timeLimit?: number;
    shuffleQ?: boolean;
    shuffleA?: boolean;
    items: { label: string; quizIds: number[]; count: number }[];
  }) {
    if (!data.name?.trim()) throw new NotFoundException('Preset nomini kiriting');
    if (!data.items?.length) throw new NotFoundException('Kamida bitta fan tanlang');
    return this.prisma.blokPreset.create({
      data: {
        name: data.name.trim(),
        timeLimit: data.timeLimit ?? 30,
        shuffleQ: data.shuffleQ ?? true,
        shuffleA: data.shuffleA ?? true,
        items: data.items as any,
      },
    });
  }

  async findPresets() {
    return this.prisma.blokPreset.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findPreset(id: number) {
    const p = await this.prisma.blokPreset.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Preset topilmadi');
    return p;
  }

  async removePreset(id: number) {
    return this.prisma.blokPreset.delete({ where: { id } });
  }

  private shuffleArr<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
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
