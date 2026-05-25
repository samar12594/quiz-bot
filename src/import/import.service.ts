import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parse } from 'csv-parse/sync';

interface CsvRow {
  quiz_title: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct: string;
  explain?: string;
}

@Injectable()
export class ImportService {
  constructor(private prisma: PrismaService) {}

  parseCSV(buffer: Buffer): CsvRow[] {
    try {
      const records = parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as CsvRow[];
      return records;
    } catch (e: any) {
      throw new BadRequestException(`CSV xatolik: ${e.message}`);
    }
  }

  async previewCSV(buffer: Buffer) {
    const rows = this.parseCSV(buffer);
    const grouped = this.groupByQuiz(rows);
    // Mavjud test nomlarini ham qaytaramiz - frontend ogohlantirishi uchun
    const titles = Object.keys(grouped);
    const existing = await this.prisma.quiz.findMany({
      where: { title: { in: titles } },
      select: { id: true, title: true, _count: { select: { questions: true } } },
    });
    const existingMap = new Map(existing.map(q => [q.title, q]));

    return Object.entries(grouped).map(([title, questions]) => ({
      title,
      questionCount: questions.length,
      questions: questions.slice(0, 3),
      existing: existingMap.get(title) || null,
    }));
  }

  async importCSV(
    buffer: Buffer,
    opts?: {
      customTitle?: string;
      timeLimit?: number;
      shuffleQ?: boolean;
      shuffleA?: boolean;
      mode?: 'append' | 'replace' | 'rename' | 'auto';
      newTitle?: string;
    },
  ) {
    const rows = this.parseCSV(buffer);
    let grouped = this.groupByQuiz(rows);

    // Agar customTitle berilgan bo'lsa - barcha savollarni shu nom ostida birlashtiramiz
    const customTitle = opts?.customTitle?.trim();
    if (customTitle) {
      const allQuestions = Object.values(grouped).flat();
      grouped = { [customTitle]: allQuestions };
    }

    const results: any[] = [];
    const mode = opts?.mode || 'auto';

    for (const [origTitle, questions] of Object.entries(grouped)) {
      let title = origTitle;
      let quiz = await this.prisma.quiz.findFirst({ where: { title } });

      if (quiz && mode === 'rename' && opts?.newTitle) {
        // Yangi nom bilan alohida to'plam yaratish
        title = opts.newTitle.trim();
        quiz = null;
      } else if (quiz && mode === 'replace') {
        // Eski savollarni o'chirib, yangidan yozish
        await this.prisma.question.deleteMany({ where: { quizId: quiz.id } });
        // Sozlamalarni ham yangilash
        await this.prisma.quiz.update({
          where: { id: quiz.id },
          data: {
            timeLimit: opts?.timeLimit ?? quiz.timeLimit,
            shuffleQ: opts?.shuffleQ ?? quiz.shuffleQ,
            shuffleA: opts?.shuffleA ?? quiz.shuffleA,
          },
        });
      }
      // mode === 'append' yoki 'auto' va quiz mavjud — savollarni qo'shamiz

      if (!quiz) {
        quiz = await this.prisma.quiz.create({
          data: {
            title,
            isActive: true,
            timeLimit: opts?.timeLimit ?? 30,
            shuffleQ: opts?.shuffleQ ?? true,
            shuffleA: opts?.shuffleA ?? true,
          },
        });
      }

      let order = await this.prisma.question.count({ where: { quizId: quiz.id } });

      for (const q of questions) {
        const correctMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
        const correct = correctMap[q.correct?.toUpperCase()];

        if (correct === undefined) {
          throw new BadRequestException(`Noto'g'ri "correct" qiymat: "${q.correct}". A, B, C yoki D bo'lishi kerak`);
        }

        await this.prisma.question.create({
          data: {
            quizId: quiz.id,
            text: q.question,
            options: [q.option_a, q.option_b, q.option_c, q.option_d],
            correct,
            explain: q.explain || null,
            order: order++,
          },
        });
      }

      results.push({ quizId: quiz.id, title: quiz.title, imported: questions.length });
    }

    return results;
  }

  private groupByQuiz(rows: CsvRow[]): Record<string, CsvRow[]> {
    const grouped: Record<string, CsvRow[]> = {};
    for (const row of rows) {
      const title = row.quiz_title?.trim();
      if (!title) continue;
      if (!grouped[title]) grouped[title] = [];
      grouped[title].push(row);
    }
    return grouped;
  }
}
