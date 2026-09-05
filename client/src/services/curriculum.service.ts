import { db } from '@/lib/db';

export class CurriculumService {
  /**
   * Retrieves all published tracks (worlds), including lesson counts,
   * exercise counts, and completion percentage for the student.
   */
  async getTracks(userId?: string) {
    const tracks = await db.track.findMany({
      where: { published: true },
      orderBy: { order: 'asc' },
      include: {
        lessons: {
          select: {
            id: true,
            _count: {
              select: { exercises: true }
            }
          }
        }
      }
    });

    let completedLessonIds = new Set<string>();
    if (userId) {
      const progress = await db.userProgress.findMany({
        where: { userId, completed: true },
        select: { lessonId: true }
      });
      completedLessonIds = new Set(progress.map((p) => p.lessonId));
    }

    return tracks.map((track) => {
      const totalLessons = track.lessons.length;
      const totalExercises = track.lessons.reduce((acc, l) => acc + l._count.exercises, 0);
      const completedLessons = track.lessons.filter((l) => completedLessonIds.has(l.id)).length;
      const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      return {
        id: track.id,
        title: track.title,
        slug: track.slug,
        description: track.description,
        icon: track.icon,
        language: track.language,
        order: track.order,
        totalLessons,
        totalExercises,
        completedLessons,
        progressPercent,
      };
    });
  }

  /**
   * Retrieves a single track by its slug or ID, including all its lessons
   * with derived game map state (LOCKED | AVAILABLE | COMPLETED) and star ratings.
   */
  async getTrackBySlug(slug: string, userId?: string) {
    const track = await db.track.findFirst({
      where: {
        OR: [{ slug }, { id: slug }],
        published: true,
      },
      include: {
        lessons: {
          orderBy: { order: 'asc' },
          include: {
            exercises: {
              select: {
                id: true,
                title: true,
                difficulty: true,
                order: true,
              },
              orderBy: { order: 'asc' }
            }
          }
        }
      }
    });

    if (!track) return null;

    let userProgressMap = new Map<string, boolean>();
    const submissionsByExercise = new Map<string, { passed: boolean; attempts: number; hints: number }>();

    if (userId) {
      const progress = await db.userProgress.findMany({
        where: {
          userId,
          lessonId: { in: track.lessons.map((l) => l.id) }
        }
      });
      userProgressMap = new Map(progress.map((p) => [p.lessonId, p.completed]));

      const exerciseIds = track.lessons.flatMap((l) => l.exercises.map((e) => e.id));
      const submissions = await db.submission.findMany({
        where: {
          userId,
          exerciseId: { in: exerciseIds }
        },
        select: {
          exerciseId: true,
          status: true,
          attemptNumber: true,
          hintsUsedBefore: true,
        },
        orderBy: { attemptNumber: 'desc' }
      });

      for (const s of submissions) {
        if (!submissionsByExercise.has(s.exerciseId)) {
          submissionsByExercise.set(s.exerciseId, {
            passed: s.status === 'PASSED',
            attempts: s.attemptNumber,
            hints: s.hintsUsedBefore,
          });
        } else if (s.status === 'PASSED') {
          const prev = submissionsByExercise.get(s.exerciseId)!;
          prev.passed = true;
        }
      }
    }

    // Determine sequential unlock state (LOCKED, AVAILABLE, COMPLETED)
    let previousLessonCompleted = true; // First lesson is available by default

    const lessonsWithProgress = track.lessons.map((lesson, idx) => {
      const isCompleted = userProgressMap.get(lesson.id) ?? false;
      let status: 'LOCKED' | 'AVAILABLE' | 'COMPLETED' = 'LOCKED';

      if (isCompleted) {
        status = 'COMPLETED';
      } else if (previousLessonCompleted || idx === 0) {
        status = 'AVAILABLE';
      } else {
        status = 'LOCKED';
      }

      // Update condition for subsequent lessons
      previousLessonCompleted = isCompleted;

      // TICO Mastery Star Ratings: 1 star (Solved), 2 stars (Autonomy / Zero Hints), 3 stars (Mastery / Fast & Clean)
      const exercisesWithStars = lesson.exercises.map((exercise) => {
        const stats = submissionsByExercise.get(exercise.id);
        let stars = 0;
        let exerciseStatus: 'LOCKED' | 'AVAILABLE' | 'COMPLETED' = status === 'LOCKED' ? 'LOCKED' : 'AVAILABLE';

        if (stats?.passed) {
          exerciseStatus = 'COMPLETED';
          stars = 1; // Base 1 star for solving
          if (stats.hints === 0) stars = 2; // 2 stars for zero hints
          if (stats.hints === 0 && stats.attempts <= 2) stars = 3; // 3 stars for clean master solve
        }

        return {
          ...exercise,
          status: exerciseStatus,
          stars,
          attempts: stats?.attempts ?? 0,
        };
      });

      return {
        id: lesson.id,
        title: lesson.title,
        slug: lesson.slug,
        description: lesson.description,
        order: lesson.order,
        status,
        completed: isCompleted,
        exerciseCount: lesson.exercises.length,
        exercises: exercisesWithStars,
      };
    });

    return {
      id: track.id,
      title: track.title,
      slug: track.slug,
      description: track.description,
      icon: track.icon,
      language: track.language,
      order: track.order,
      lessons: lessonsWithProgress,
    };
  }

  /**
   * Retrieves detailed lesson content and its exercises.
   */
  async getLessonById(lessonId: string, userId?: string) {
    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      include: {
        track: {
          select: {
            id: true,
            title: true,
            slug: true,
            language: true,
          }
        },
        exercises: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            order: true,
            hints: true,
          },
          orderBy: { order: 'asc' }
        }
      }
    });

    if (!lesson) return null;

    let completed = false;
    if (userId) {
      const prog = await db.userProgress.findUnique({
        where: { userId_lessonId: { userId, lessonId } }
      });
      completed = prog?.completed ?? false;
    }

    return {
      ...lesson,
      completed,
    };
  }

  /**
   * Retrieves an exercise/mission for gameplay.
   * ANTI-CHEAT: Strips solutionCode and sensitive properties!
   */
  async getExerciseById(exerciseId: string, userId?: string) {
    const exercise = await db.exercise.findUnique({
      where: { id: exerciseId },
      include: {
        lesson: {
          select: {
            id: true,
            title: true,
            slug: true,
            track: {
              select: {
                id: true,
                title: true,
                slug: true,
                language: true,
              }
            }
          }
        }
      }
    });

    if (!exercise) return null;

    // Filter public test cases if isHidden is defined
    const rawCases = Array.isArray(exercise.testCases) ? exercise.testCases : [];
    const publicTestCases = rawCases.filter((tc: unknown) => {
      if (typeof tc === 'object' && tc !== null && 'isHidden' in tc) {
        return !(tc as { isHidden?: boolean }).isHidden;
      }
      return true;
    });

    let activeSession = null;
    let latestSubmission = null;

    if (userId) {
      activeSession = await db.practiceSession.findFirst({
        where: {
          userId,
          exerciseId,
          outcome: 'IN_PROGRESS',
        },
        orderBy: { startedAt: 'desc' }
      });

      latestSubmission = await db.submission.findFirst({
        where: { userId, exerciseId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          attemptNumber: true,
          hintsUsedBefore: true,
          executionTimeMs: true,
          createdAt: true,
        }
      });
    }

    return {
      id: exercise.id,
      title: exercise.title,
      instructions: exercise.instructions,
      starterCode: exercise.starterCode,
      difficulty: exercise.difficulty,
      order: exercise.order,
      hintCount: exercise.hints.length,
      testCases: publicTestCases,
      lesson: exercise.lesson,
      activeSession,
      latestSubmission,
      // Note: solutionCode is intentionally NEVER returned to client
    };
  }
}

export const curriculumService = new CurriculumService();
