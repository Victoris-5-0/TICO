import { db } from '@/lib/db';
import { aiClient } from '@/lib/ai/client';
import { PlanRequest, PlanResponse } from '@/lib/ai/types';
import { DecidedBy, LessonRequirement } from '@prisma/client';

export class PlanService {
  /**
   * Builds or updates the student's personal lesson path.
   * Calls AI planner (/v1/students/{id}/plan) and persists decisions in db.lessonPlan.
   * Every skip is audited with reason and decidedBy.
   */
  async buildStudentPlan(
    userId: string,
    token: string,
    req: PlanRequest
  ): Promise<PlanResponse> {
    try {
      const planResponse = await aiClient.getStudentPlan(token, userId, req);

      // Atomically persist lesson plan decisions in PostgreSQL for existing lessons
      if (planResponse.lessons && planResponse.lessons.length > 0) {
        const existingLessons = await db.lesson.findMany({
          where: { id: { in: planResponse.lessons.map((l) => l.levelId) } },
          select: { id: true },
        });
        const existingLessonIds = new Set(existingLessons.map((l) => l.id));
        const validEntries = planResponse.lessons.filter((l) => existingLessonIds.has(l.levelId));

        if (validEntries.length > 0) {
          await db.$transaction(
            validEntries.map((entry) =>
              db.lessonPlan.upsert({
                where: {
                  userId_lessonId: { userId, lessonId: entry.levelId },
                },
                update: {
                  requirement: entry.requirement as LessonRequirement,
                  reason: entry.reason || null,
                  decidedBy: entry.decidedBy as DecidedBy,
                  confidence: entry.confidence,
                  decidedAt: entry.decidedAt ? new Date(entry.decidedAt) : new Date(),
                },
                create: {
                  userId,
                  lessonId: entry.levelId,
                  requirement: entry.requirement as LessonRequirement,
                  reason: entry.reason || null,
                  decidedBy: entry.decidedBy as DecidedBy,
                  confidence: entry.confidence,
                  decidedAt: entry.decidedAt ? new Date(entry.decidedAt) : new Date(),
                },
              })
            )
          );
        }
      }

      return planResponse;
    } catch (err) {
      console.warn('AI getStudentPlan offline or failed, using deterministic fallback plan:', err instanceof Error ? err.message : err);

      // Resilient fallback: All lessons required
      let allLessons: { id: string; title: string }[] = [];
      try {
        allLessons = await db.lesson.findMany({
          orderBy: { order: 'asc' },
          select: { id: true, title: true },
        });
      } catch {}

      if (allLessons.length === 0) {
        allLessons = [
          { id: 'el-forn-01', title: 'افتتاح الفرن' },
          { id: 'el-forn-02', title: 'عد الصواني' },
          { id: 'el-forn-03', title: 'طلبات العائلات' },
          { id: 'el-forn-04', title: 'أولوية الطابور' },
          { id: 'el-forn-05', title: 'حاسبة الدفعات' },
          { id: 'el-forn-06', title: 'ملخص الشيفت' },
        ];
      }

      const fallbackLessons = allLessons.map((l) => ({
        levelId: l.id,
        requirement: LessonRequirement.REQUIRED,
        reason: 'مسار افتراضي شامل لكافة المفاهيم الأساسية',
        decidedBy: DecidedBy.RULE,
        confidence: 1.0,
        decidedAt: new Date().toISOString(),
      }));

      try {
        await db.$transaction(
          fallbackLessons.map((entry) =>
            db.lessonPlan.upsert({
              where: {
                userId_lessonId: { userId, lessonId: entry.levelId },
              },
              update: {
                requirement: entry.requirement,
                reason: entry.reason,
                decidedBy: entry.decidedBy,
                confidence: entry.confidence,
              },
              create: {
                userId,
                lessonId: entry.levelId,
                requirement: entry.requirement,
                reason: entry.reason,
                decidedBy: entry.decidedBy,
                confidence: entry.confidence,
              },
            })
          )
        );
      } catch {}

      return {
        lessons: fallbackLessons,
        startingLevelId: allLessons[0]?.id || 'el-forn-01',
        skippedCount: 0,
        summary: 'أهلاً بك! لقد تم تجهيز المسار التعليمي لتبدأ من البداية وتتقن كل مفهوم خطوة بخطوة.',
      };
    }
  }

  /**
   * Retrieves the current lesson plan for a student.
   */
  async getStudentPlan(userId: string) {
    try {
      return await db.lessonPlan.findMany({
        where: { userId },
        include: {
          lesson: {
            select: {
              id: true,
              title: true,
              slug: true,
              order: true,
              trackId: true,
            }
          }
        },
        orderBy: {
          lesson: { order: 'asc' }
        }
      });
    } catch {
      return [
        {
          userId,
          lessonId: 'el-forn-01',
          requirement: 'REQUIRED',
          reason: 'الدرس الافتتاحي في المسار',
          decidedBy: 'RULE',
          confidence: 1.0,
          decidedAt: new Date(),
          lesson: {
            id: 'el-forn-01',
            title: 'افتتاح الفرن',
            slug: 'opening-message',
            order: 1,
            trackId: 'track-el-forn-01',
          }
        }
      ];
    }
  }
}

export const planService = new PlanService();
