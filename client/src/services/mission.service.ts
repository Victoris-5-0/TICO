import { db } from '@/lib/db';
import { aiClient } from '@/lib/ai/client';
import { PhasedMissionOut, GenerateMissionRequest, GenerateMissionResponse } from '@/lib/ai/types';

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
      const aiMission: PhasedMissionOut = await aiClient.getNextMission(token, {
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

      // The Python service already wrote this row, with all six phases in `content`.
      // Do NOT upsert `content` here: this used to overwrite it with a flattened
      // {brief, starterCode, tests}, and whichever service wrote last won. When it was
      // this one, `content.phases` vanished — and `app/services/hints.py` reads
      // `content.phases.guided.solutionCode` to check hints against the solution, while
      // `app/services/sessions.py` reads `content.targetConceptId` to move mastery. Both
      // degrade silently: hints stop being guarded, mastery stops moving, nothing errors.
      //
      // The row is the AI service's. All this needs to do is make sure it is linked to
      // the right user and template on our side.
      const savedMission = await db.generatedMission.update({
        where: { id: aiMission.id },
        data: { userId, templateId },
      });

      // A six-phase mission is a journey; this view is what a code editor can show,
      // which is the guided phase. Anything that renders the whole loop should read
      // `aiMission.phases` directly rather than this flattened shape.
      const guided = aiMission.phases.guided;

      return {
        id: savedMission.id,
        lessonId: lesson.id,
        trackId: lesson.trackId,
        title: aiMission.titleAr || `${lesson.title} · ${aiMission.sceneId || 'المهمة'}`,
        instructions: aiMission.phases.encounter.lineAr,
        // Guided coding has no single starter: the student fills blanks step by step,
        // so the first step's code — with its `___` still in it — is where the editor
        // begins. A client rendering the full loop walks `guided.steps` instead.
        starterCode: guided.steps[0]?.code ?? '',
        tests: (guided.tests ?? []).map((t, i) => ({
          name: t.name ?? `Test ${i + 1}`,
          call: t.call,
          expected: t.expected,
        })),
        sceneId: aiMission.sceneId,
        scaffoldPlan: {} as Record<string, unknown>,
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
  ): Promise<PhasedMissionOut> {
    return aiClient.getNextChallenge(token, { worldSlug });
  }
}

export const missionService = new MissionService();
