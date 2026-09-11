import { db } from '@/lib/db';
import { aiClient } from '@/lib/ai/client';
import { PhasedMissionOut, GenerateMissionRequest, GenerateMissionResponse } from '@/lib/ai/types';

/**
 * The account the pre-generation script writes missions under. Its rows are a pool for
 * real students, and its sessions are prep artefacts rather than anyone's play.
 */
const CONTENT_PREP_USER = "system-content-prep";

/**
 * A row whose `content` lost its phases renders as six empty panels, so it is treated as
 * missing everywhere rather than shown.
 */
function hasPhases(content: unknown): boolean {
  const mission = content as PhasedMissionOut | null;
  return Boolean(mission?.phases?.encounter && mission.phases.guided && mission.phases.remix);
}

/** One stored mission plus the world context the player chrome needs. */
export interface StoredMission {
  mission: PhasedMissionOut;
  trackSlug: string;
  trackTitle: string;
  difficultyBand: number;
  /** The lesson this mission belongs to, so a session can be opened against it. */
  lessonId: string | null;
}

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
   * One stored mission, with all six phases intact.
   *
   * The counterpart to `getNextMission`, which flattens a mission down to what a code
   * editor can show. The player renders the whole loop, so it needs `content` as the
   * Python service wrote it — that column is the mission, not a cache of one.
   *
   * Reads the database directly rather than calling the AI service: the row is already
   * here, and a student re-entering a mission they are halfway through must not depend
   * on the AI service being up. Returns null rather than throwing so the route can
   * answer 404 without unwrapping an error message.
   */
  async getPhasedMission(missionId: string): Promise<StoredMission | null> {
    const row = await db.generatedMission.findUnique({
      where: { id: missionId },
      include: { template: { include: { track: true } } },
    });
    if (!row) return null;

    const mission = row.content as unknown as PhasedMissionOut | null;

    // A row whose `content` lost its phases is the failure the long comment in
    // `getNextMission` describes. Treat it as missing rather than rendering a player
    // with six empty panels.
    if (!mission?.phases?.encounter || !mission.phases.guided) return null;

    // `validated` is set by a Python validator that actually runs the code. False is
    // never shown to a student — an unsolvable mission in front of a child who is
    // already unsure is the worst thing this system can do.
    if (!row.validated) return null;

    // The lesson the student launched this from, recorded by `claim`. Falling back to the
    // track's first lesson keeps older rows playable, but it is a guess and is only right
    // for lesson one — which is why `claim` records the real one going forward.
    const recorded = (row.params as { lessonId?: unknown } | null)?.lessonId;
    const lesson = typeof recorded === "string"
      ? await db.lesson.findUnique({ where: { id: recorded }, select: { id: true } })
      : await db.lesson.findFirst({
          where: { trackId: row.template.trackId },
          orderBy: { order: "asc" },
          select: { id: true },
        });

    return {
      mission,
      trackSlug: row.template.track.slug,
      trackTitle: row.template.track.title,
      difficultyBand: row.template.difficultyBand,
      lessonId: lesson?.id ?? null,
    };
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
   * The mission this student should play for this lesson, claimed for them.
   *
   * Every student gets their own row. `generated_missions.user_id` is what makes a
   * mission theirs, and `find_reusable` on the Python side skips anything another student
   * has already opened a session on — so two children starting the same lesson get
   * different scenarios rather than sharing one.
   *
   * Three sources, in order of preference:
   *
   *   1. A mission this student already has for this lesson. Re-entering a lesson must
   *      return them to their own mission, not hand them a new one and lose their place.
   *   2. `/v1/missions/next`, which reuses a pre-generated row when it can (~1s) and
   *      composes a fresh one when it cannot (~25s).
   *   3. An unclaimed pre-generated row, claimed directly here.
   *
   * The third exists because the AI service is the one part of this that can be down, and
   * a pool of validated missions is already sitting in the database. Returning null means
   * every source failed; the caller shows that rather than a broken player.
   */
  async startForStudent(userId: string, lessonId: string, token: string): Promise<string | null> {
    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, trackId: true },
    });
    if (!lesson) return null;

    // 1. Already theirs.
    const claimed = await db.generatedMission.findFirst({
      where: { userId, validated: true, template: { trackId: lesson.trackId } },
      orderBy: { createdAt: "desc" },
      select: { id: true, content: true },
    });
    if (claimed && hasPhases(claimed.content)) return claimed.id;

    // 2. Ask the service.
    try {
      const playback = await this.getNextMission(userId, lessonId, token);
      if (playback.isAiGenerated) {
        await this.claim(playback.id, userId, lessonId);
        return playback.id;
      }
    } catch (err) {
      console.warn("mission start: AI service unavailable:", err instanceof Error ? err.message : err);
    }

    // 3. Claim one from the pre-generated pool.
    const spare = await db.generatedMission.findFirst({
      where: {
        validated: true,
        template: { trackId: lesson.trackId },
        // Unclaimed, or held by the content-prep account that pre-generates them.
        OR: [{ userId: null }, { userId: CONTENT_PREP_USER }],
        // No *student* has played it. Pre-generation opens a session on each row as it
        // validates it, so `sessions: { none: {} }` would rule out the entire pool — all
        // 37 prepared missions, permanently. Only a session belonging to a real student
        // means the mission is taken.
        sessions: { none: { userId: { not: CONTENT_PREP_USER } } },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, content: true },
    });
    if (!spare || !hasPhases(spare.content)) return null;

    await this.claim(spare.id, userId, lessonId);
    return spare.id;
  }

  /**
   * Mark a mission as this student's, and remember which lesson they opened it from.
   *
   * Nothing on `generated_missions` ties a mission to a lesson — a template carries a
   * track and a target concept, not a lesson — so the lesson was being guessed as "the
   * first one in the track". That is right for lesson one and wrong for every lesson
   * after it, and the guess propagates: the session records it, and the session is what
   * decides which lesson gets marked complete and earns XP.
   *
   * `params` is where "how this row came to be" already lives (pre-generation stores
   * repetition there), so the launching lesson belongs beside it. `content` stays
   * untouched — that column is the contract with the frontend.
   */
  private async claim(missionId: string, userId: string, lessonId: string): Promise<void> {
    const row = await db.generatedMission.findUnique({
      where: { id: missionId },
      select: { params: true },
    });
    const params = (row?.params && typeof row.params === "object" ? row.params : {}) as Record<string, unknown>;

    await db.generatedMission.update({
      where: { id: missionId },
      data: { userId, params: { ...params, lessonId } },
    });
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
