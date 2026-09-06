import { db } from '@/lib/db';
import { aiClient } from '@/lib/ai/client';
import { GeneratedMissionOut, GenerateMissionRequest, GenerateMissionResponse } from '@/lib/ai/types';
import { Prisma } from '@prisma/client';

export interface MissionPlayback {
  id: string;
  lessonId: string;
  trackId: string;
  title: string;
  instructions: string;
  starterCode: string;
  tests: Array<{ name: string; call: string; expected: string }>;
  sceneId?: string;
  scaffoldPlan?: Record<string, unknown>;
  validated: boolean;
  isAiGenerated: boolean;
  isFallback: boolean;
  activeSessionId?: string;
}

export class MissionService {
  /**
   * Helper to ensure a MissionTemplate exists for a given track and concept
   * when persisting AI-generated missions.
   */
  private async getOrCreateTemplate(trackId: string, conceptId: string, sceneId: string): Promise<string> {
    const existing = await db.missionTemplate.findFirst({
      where: { trackId, targetConceptId: conceptId },
    });

    if (existing) {
      return existing.id;
    }

    const created = await db.missionTemplate.create({
      data: {
        trackId,
        targetConceptId: conceptId,
        mechanicId: 'core_mechanic',
        scenes: [sceneId || 'main_scene'],
        propsRequired: [],
        paramSchema: {},
        difficultyBand: 5,
        manifestVersion: '1.0.0',
      },
    });

    return created.id;
  }

  /**
   * Orchestrates fetching or composing the next mission for a student.
   * 1. Asks AI backend (/v1/missions/next) to compose or retrieve an adaptive mission.
   * 2. Persists the GeneratedMission record in PostgreSQL for auditability and session linking.
   * 3. Falls back gracefully to reviewed Exercise templates if the AI backend is offline.
   */
  async getNextMission(
    userId: string,
    lessonId: string,
    token: string,
    options: { forceRegenerate?: boolean; worldManifestVersion?: string } = {}
  ): Promise<MissionPlayback> {
    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      include: {
        track: true,
        exercises: {
          orderBy: { order: 'asc' },
          take: 1,
        },
      },
    });

    if (!lesson) {
      throw new Error(`Lesson not found: ${lessonId}`);
    }

    // 1. Attempt AI Generation
    try {
      const aiMission: GeneratedMissionOut = await aiClient.getNextMission(token, {
        lessonId,
        worldManifestVersion: options.worldManifestVersion || '1.0.0',
        forceRegenerate: options.forceRegenerate ?? false,
      });

      // Persist GeneratedMission to database
      const templateId = await this.getOrCreateTemplate(
        lesson.trackId,
        aiMission.targetConceptId || 'variables',
        aiMission.sceneId
      );

      const savedMission = await db.generatedMission.upsert({
        where: { id: aiMission.id },
        update: {
          sceneId: aiMission.sceneId,
          params: (aiMission.params ?? {}) as unknown as Prisma.InputJsonValue,
          content: {
            brief: aiMission.brief,
            starterCode: aiMission.starterCode,
            tests: aiMission.tests ?? [],
          } as unknown as Prisma.InputJsonValue,
          scaffoldPlan: aiMission.scaffoldPlan as unknown as Prisma.InputJsonValue,
          validated: aiMission.validated,
        },
        create: {
          id: aiMission.id,
          templateId,
          userId,
          sceneId: aiMission.sceneId,
          params: (aiMission.params ?? {}) as unknown as Prisma.InputJsonValue,
          content: {
            brief: aiMission.brief,
            starterCode: aiMission.starterCode,
            tests: aiMission.tests ?? [],
          } as unknown as Prisma.InputJsonValue,
          scaffoldPlan: aiMission.scaffoldPlan as unknown as Prisma.InputJsonValue,
          validated: aiMission.validated,
          manifestVersion: options.worldManifestVersion || '1.0.0',
        },
      });

      return {
        id: savedMission.id,
        lessonId: lesson.id,
        trackId: lesson.trackId,
        title: `${lesson.title} · ${aiMission.sceneId || 'المهمة'}`,
        instructions: aiMission.brief,
        starterCode: aiMission.starterCode,
        tests: aiMission.tests || [],
        sceneId: aiMission.sceneId,
        scaffoldPlan: aiMission.scaffoldPlan as unknown as Record<string, unknown>,
        validated: aiMission.validated,
        isAiGenerated: true,
        isFallback: false,
      };
    } catch (err) {
      console.warn('AI mission generation offline or fallback triggered:', err instanceof Error ? err.message : err);

      // 2. Resilient Template Fallback
      const fallbackExercise = lesson.exercises[0];
      if (!fallbackExercise) {
        throw new Error(`No fallback exercise available for lesson: ${lesson.title}`);
      }

      const rawCases = Array.isArray(fallbackExercise.testCases)
        ? (fallbackExercise.testCases as Array<{ input?: string; expectedOutput?: string }>)
        : [];
      const tests = rawCases.map((tc, i) => ({
        name: `Test ${i + 1}`,
        call: tc.input ?? '',
        expected: tc.expectedOutput ?? '',
      }));

      return {
        id: fallbackExercise.id,
        lessonId: lesson.id,
        trackId: lesson.trackId,
        title: fallbackExercise.title,
        instructions: fallbackExercise.instructions,
        starterCode: fallbackExercise.starterCode,
        tests,
        validated: true,
        isAiGenerated: false,
        isFallback: true,
      };
    }
  }

  /**
   * Explicit generation for authoring or pre-warming.
   */
  async generateMissionExplicit(
    token: string,
    req: GenerateMissionRequest
  ): Promise<GenerateMissionResponse> {
    return aiClient.generateMission(token, req);
  }

  /**
   * Challenge Arena: Fetches an unscaffolded stretch mission for advanced learners.
   */
  async getNextChallenge(
    userId: string,
    worldSlug: string | null,
    token: string
  ): Promise<GeneratedMissionOut> {
    return aiClient.getNextChallenge(token, { worldSlug });
  }
}

export const missionService = new MissionService();
