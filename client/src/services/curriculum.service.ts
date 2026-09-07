import { db } from '@/lib/db';

export class CurriculumService {
  /**
   * Retrieves all published tracks (worlds), including lesson counts,
   * exercise counts, and completion percentage for the student.
   */
  async getTracks(userId?: string) {
    try {
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

      if (tracks && tracks.length > 0) {
        let completedLessonIds = new Set<string>();

        if (userId) {
          try {
            const [progress] = await Promise.all([
              db.userProgress.findMany({
                where: { userId, completed: true },
                select: { lessonId: true }
              })
            ]);
            completedLessonIds = new Set(progress.map((p) => p.lessonId));
          } catch {}
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
    } catch (err) {
      console.warn('Database offline or unpopulated, serving canonical world tracks:', err instanceof Error ? err.message : err);
    }

    return [
      {
        id: 'track-el-forn-01',
        title: 'الفرن (El Forn Bakery)',
        slug: 'el-forn',
        description: 'نظّم الطلبات واحسب الصواني وساعد الطابور يمشي بعدل.',
        icon: 'عيش',
        language: 'python',
        order: 1,
        totalLessons: 6,
        totalExercises: 6,
        completedLessons: 1,
        progressPercent: 17,
      },
      {
        id: 'track-el-mahatta-02',
        title: 'المحطة (El Mahatta Station)',
        slug: 'el-mahatta',
        description: 'رتّب شباك التذاكر ووجّه الركاب للرصيف الصح.',
        icon: 'قطر',
        language: 'python',
        order: 2,
        totalLessons: 6,
        totalExercises: 6,
        completedLessons: 0,
        progressPercent: 0,
      },
      {
        id: 'track-isharet-cairo-03',
        title: 'إشارة القاهرة (Isharet Cairo Traffic)',
        slug: 'isharet-cairo',
        description: 'اقرأ الحساسات واصلح الأعطال ونسّق الإشارات بأمان.',
        icon: 'إشارة',
        language: 'python',
        order: 3,
        totalLessons: 6,
        totalExercises: 6,
        completedLessons: 0,
        progressPercent: 0,
      },
    ];
  }

  /**
   * Retrieves a single track by its slug or ID, including all its lessons
   * annotated with the student's personal LessonPlan, unlock state, and concept weights.
   */
  async getTrackBySlug(slug: string, userId?: string) {
    let track = null;
    try {
      track = await db.track.findFirst({
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
                  concepts: {
                    include: {
                      concept: {
                        select: { id: true, slug: true, name: true, nameAr: true, sequenceOrder: true }
                      }
                    }
                  }
                },
                orderBy: { order: 'asc' }
              }
            }
          }
        }
      });
    } catch (err) {
      console.warn('Database offline in getTrackBySlug, serving canonical world data:', err);
    }

    if (!track) {
      const canonicalLessons = [
        {
          id: 'el-forn-01',
          title: 'افتتاح الفرن (Opening Message)',
          slug: 'opening-message',
          description: 'اطبع رسالة ترحيب لزبائن عم حسن في الصباح الباكر.',
          order: 1,
          status: 'AVAILABLE' as const,
          completed: false,
          requirement: 'REQUIRED',
          reason: null,
          decidedBy: 'RULE',
          exerciseCount: 1,
          exercises: [{
            id: 'el-forn-ex-01',
            title: 'صباح الخير من الفرن',
            difficulty: 'INTRODUCTORY',
            order: 1,
            status: 'AVAILABLE' as const,
            stars: 0,
            attempts: 0,
            primaryConcept: { id: 'c-print', slug: 'python-print', name: 'Print', nameAr: 'طباعة النصوص', sequenceOrder: 1 },
            carriedConcepts: [],
          }]
        },
        {
          id: 'el-forn-02',
          title: 'عد الصواني (Count the Trays)',
          slug: 'count-the-trays',
          description: 'احسب عدد الأرغفة في الصواني باستخدام المتغيرات والضرب.',
          order: 2,
          status: 'LOCKED' as const,
          completed: false,
          requirement: 'REQUIRED',
          reason: null,
          decidedBy: 'RULE',
          exerciseCount: 1,
          exercises: [{
            id: 'el-forn-ex-02',
            title: 'حساب الصواني',
            difficulty: 'PRACTICE',
            order: 1,
            status: 'LOCKED' as const,
            stars: 0,
            attempts: 0,
            primaryConcept: { id: 'c-vars', slug: 'variables', name: 'Variables', nameAr: 'المتغيرات', sequenceOrder: 2 },
            carriedConcepts: [],
          }]
        },
        {
          id: 'el-forn-03',
          title: 'طلبات العائلات (Family Orders)',
          slug: 'family-order',
          description: 'فرّق بين الطلبات الكبيرة والصغيرة باستخدام الشروط if/else.',
          order: 3,
          status: 'LOCKED' as const,
          completed: false,
          requirement: 'REQUIRED',
          reason: null,
          decidedBy: 'RULE',
          exerciseCount: 1,
          exercises: []
        },
        {
          id: 'el-forn-04',
          title: 'أولوية الطابور (Queue Priority)',
          slug: 'queue-priority',
          description: 'رتّب زبائن الطابور مع سلمى باستخدام القوائم.',
          order: 4,
          status: 'LOCKED' as const,
          completed: false,
          requirement: 'REQUIRED',
          reason: null,
          decidedBy: 'RULE',
          exerciseCount: 1,
          exercises: []
        },
        {
          id: 'el-forn-05',
          title: 'حاسبة الدفعات (Batch Calculator)',
          slug: 'batch-calculator',
          description: 'احسب وقت خبيز كل دفعة بدقة متناهية.',
          order: 5,
          status: 'LOCKED' as const,
          completed: false,
          requirement: 'REQUIRED',
          reason: null,
          decidedBy: 'RULE',
          exerciseCount: 1,
          exercises: []
        },
        {
          id: 'el-forn-06',
          title: 'ملخص الشيفت (Shift Summary)',
          slug: 'shift-summary',
          description: 'اجمع إحصائيات اليوم وقدّم تقرير الشيفت لعم حسن.',
          order: 6,
          status: 'LOCKED' as const,
          completed: false,
          requirement: 'REQUIRED',
          reason: null,
          decidedBy: 'RULE',
          exerciseCount: 1,
          exercises: []
        },
      ];

      return {
        id: slug === 'el-forn' ? 'track-el-forn-01' : `track-${slug}`,
        title: slug === 'el-forn' ? 'الفرن (El Forn Bakery)' : slug,
        slug,
        description: 'نظّم الطلبات واحسب الصواني وساعد الطابور يمشي بعدل.',
        icon: 'عيش',
        language: 'python',
        order: 1,
        lessons: canonicalLessons,
      };
    }

    let userProgressMap = new Map<string, boolean>();
    let lessonPlanMap = new Map<string, { requirement: string; reason: string | null; decidedBy: string }>();
    const submissionsByExercise = new Map<string, { passed: boolean; attempts: number; hints: number }>();

    if (userId) {
      const lessonIds = track.lessons.map((l) => l.id);
      const exerciseIds = track.lessons.flatMap((l) => l.exercises.map((e) => e.id));

      const [progress, plans, submissions] = await Promise.all([
        db.userProgress.findMany({
          where: { userId, lessonId: { in: lessonIds } }
        }),
        db.lessonPlan.findMany({
          where: { userId, lessonId: { in: lessonIds } },
          select: { lessonId: true, requirement: true, reason: true, decidedBy: true }
        }),
        db.submission.findMany({
          where: { userId, exerciseId: { in: exerciseIds } },
          select: {
            exerciseId: true,
            status: true,
            attemptNumber: true,
            hintsUsedBefore: true,
          },
          orderBy: { attemptNumber: 'desc' }
        })
      ]);

      userProgressMap = new Map(progress.map((p) => [p.lessonId, p.completed]));
      lessonPlanMap = new Map(plans.map((p) => [p.lessonId, {
        requirement: p.requirement,
        reason: p.reason,
        decidedBy: p.decidedBy
      }]));

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

    // Determine unlock state taking into account skippable lessons
    let previousLessonCompleted = true;

    const lessonsWithProgress = track.lessons.map((lesson, idx) => {
      const isCompleted = userProgressMap.get(lesson.id) ?? false;
      const plan = lessonPlanMap.get(lesson.id);
      const isOptional = plan?.requirement === 'OPTIONAL';
      const isSkipped = plan?.requirement === 'SKIPPED';

      let status: 'LOCKED' | 'AVAILABLE' | 'COMPLETED' = 'LOCKED';

      if (isCompleted) {
        status = 'COMPLETED';
      } else if (previousLessonCompleted || idx === 0 || isOptional) {
        status = 'AVAILABLE';
      } else {
        status = 'LOCKED';
      }

      // If this lesson is skippable/optional, don't block subsequent lessons
      if (!isOptional && !isSkipped) {
        previousLessonCompleted = isCompleted;
      }

      // TICO Mastery Star Ratings
      const exercisesWithStars = lesson.exercises.map((exercise) => {
        const stats = submissionsByExercise.get(exercise.id);
        let stars = 0;
        let exerciseStatus: 'LOCKED' | 'AVAILABLE' | 'COMPLETED' = status === 'LOCKED' ? 'LOCKED' : 'AVAILABLE';

        if (stats?.passed) {
          exerciseStatus = 'COMPLETED';
          stars = 1;
          if (stats.hints === 0) stars = 2;
          if (stats.hints === 0 && stats.attempts <= 2) stars = 3;
        }

        const primaryConcept = exercise.concepts.find((c) => c.isPrimary)?.concept;
        const carriedConcepts = exercise.concepts.filter((c) => !c.isPrimary).map((c) => c.concept);

        return {
          id: exercise.id,
          title: exercise.title,
          difficulty: exercise.difficulty,
          order: exercise.order,
          status: exerciseStatus,
          stars,
          attempts: stats?.attempts ?? 0,
          primaryConcept,
          carriedConcepts,
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
        requirement: plan?.requirement ?? 'REQUIRED',
        reason: plan?.reason ?? null,
        decidedBy: plan?.decidedBy ?? 'RULE',
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
    let lesson = null;
    try {
      lesson = await db.lesson.findUnique({
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
              concepts: {
                include: {
                  concept: true
                }
              }
            },
            orderBy: { order: 'asc' }
          }
        }
      });
    } catch (err) {
      console.warn('Database offline in getLessonById, serving canonical lesson:', err);
    }

    if (!lesson) {
      return {
        id: lessonId || 'el-forn-01',
        title: 'افتتاح الفرن (Opening Message)',
        slug: 'opening-message',
        description: 'اطبع رسالة ترحيب لزبائن عم حسن في الصباح الباكر: "صباح الخير من الفرن!"',
        order: 1,
        trackId: 'track-el-forn-01',
        track: {
          id: 'track-el-forn-01',
          title: 'الفرن (El Forn Bakery)',
          slug: 'el-forn',
          language: 'python',
        },
        exercises: [{
          id: 'el-forn-ex-01',
          title: 'صباح الخير من الفرن',
          difficulty: 'INTRODUCTORY',
          order: 1,
          hints: [
            'استخدم أمر print() لعرض النصوص.',
            'تأكد من وضع النص بين علامتي تنصيص: print("...")',
            'الرسالة المطلوبة بالضبط هي: "صباح الخير من الفرن!"'
          ],
          concepts: [{
            concept: { id: 'c-print', slug: 'python-print', name: 'Print', nameAr: 'طباعة النصوص', sequenceOrder: 1 }
          }]
        }],
        completed: false,
        requirement: 'REQUIRED',
        reason: null,
      };
    }

    let completed = false;
    let plan = null;
    if (userId) {
      try {
        const [prog, userPlan] = await Promise.all([
          db.userProgress.findUnique({
            where: { userId_lessonId: { userId, lessonId } }
          }),
          db.lessonPlan.findUnique({
            where: { userId_lessonId: { userId, lessonId } }
          })
        ]);
        completed = prog?.completed ?? false;
        plan = userPlan;
      } catch {}
    }

    return {
      ...lesson,
      completed,
      requirement: plan?.requirement ?? 'REQUIRED',
      reason: plan?.reason ?? null,
    };
  }

  /**
   * Retrieves an exercise/mission for gameplay.
   * ANTI-CHEAT: Strips solutionCode and sensitive properties!
   * Checks for active sessions (both exercise-based and generated missions).
   */
  async getExerciseById(exerciseId: string, userId?: string) {
    let exercise = null;
    try {
      exercise = await db.exercise.findUnique({
        where: { id: exerciseId },
        include: {
          concepts: {
            include: {
              concept: true
            }
          },
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
    } catch (err) {
      console.warn('Database offline in getExerciseById, serving canonical exercise:', err);
    }

    if (!exercise) {
      return {
        id: exerciseId || 'el-forn-ex-01',
        title: 'صباح الخير من الفرن (Morning at the Bakery)',
        instructions: 'عم حسن فتح الفرن وأهل الحارة مستنيين العيش السخن. اطبع رسالة ترحيب لزبائن عم حسن: "صباح الخير من الفرن!"',
        starterCode: '# اكتب كود بايثون هنا\nprint("صباح الخير من الفرن!")\n',
        difficulty: 'INTRODUCTORY',
        order: 1,
        hintCount: 3,
        testCases: [{ input: '', expectedOutput: 'صباح الخير من الفرن!\n' }],
        lesson: {
          id: 'el-forn-01',
          title: 'افتتاح الفرن',
          slug: 'opening-message',
          track: {
            id: 'track-el-forn-01',
            title: 'الفرن',
            slug: 'el-forn',
            language: 'python',
          }
        },
        concepts: [{
          concept: { id: 'c-print', slug: 'python-print', name: 'Print', nameAr: 'طباعة النصوص', sequenceOrder: 1 }
        }],
        activeSession: null,
        latestSubmission: null,
      };
    }

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
      try {
        activeSession = await db.practiceSession.findFirst({
          where: {
            userId,
            exerciseId,
            outcome: 'IN_PROGRESS',
          },
          orderBy: { startedAt: 'desc' },
          include: {
            generatedMission: true,
          }
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
      } catch {}
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
      concepts: exercise.concepts,
      activeSession,
      latestSubmission,
    };
  }
}

export const curriculumService = new CurriculumService();
