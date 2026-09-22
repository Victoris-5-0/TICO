import { Difficulty, Prisma, PrismaClient } from '@prisma/client';

import { firstTrafficLoopMission } from '../src/lib/traffic/missions/first-loop';
import { pedestrianTrafficFallback } from '../src/lib/traffic/missions/pedestrian-fallback';

/** Idempotent content seed for the two reviewed traffic stops and their AI fallbacks. */
export async function seedTrafficWorldContent(
  prisma: PrismaClient,
  ids: { track: string; loops: string; variables: string; functions: string; conditionals: string },
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const first = await tx.lesson.upsert({
      where: { trackId_slug: { trackId: ids.track, slug: 'signal-rules' } },
      update: {
        title: 'دور كل عربية',
        description: 'حلقة for تمر على العربيات واحدة واحدة عند الإشارة.',
        content: 'الضابط كريم ينظم مرور العربيات والمشاة في إشارة القاهرة.',
        order: 1,
      },
      create: {
        trackId: ids.track, slug: 'signal-rules', title: 'دور كل عربية',
        description: 'حلقة for تمر على العربيات واحدة واحدة عند الإشارة.',
        content: 'الضابط كريم ينظم مرور العربيات والمشاة في إشارة القاهرة.',
        order: 1,
      },
    });
    const second = await tx.lesson.upsert({
      where: { trackId_slug: { trackId: ids.track, slug: 'pedestrian-crossing' } },
      update: {
        title: 'دور المشاة',
        description: 'حلقة for تعد المشاة وهم يعبرون بأمان.',
        content: 'علي ونادية ينتظران عند ممر المشاة مع الضابط كريم.',
        order: 2,
      },
      create: {
        trackId: ids.track, slug: 'pedestrian-crossing', title: 'دور المشاة',
        description: 'حلقة for تعد المشاة وهم يعبرون بأمان.',
        content: 'علي ونادية ينتظران عند ممر المشاة مع الضابط كريم.',
        order: 2,
      },
    });

    const carCode = 'cars = ["taxi", "minibus", "tuktuk"]\nreleased_count = 0\nfor car in cars:\n    released_count = released_count + 1';
    const peopleCode = 'people = ["ali", "nadia"]\ncrossed_count = 0\nfor person in people:\n    crossed_count = crossed_count + 1';
    const exercises = [
      {
        id: 'exercise-traffic-01', lessonId: first.id, title: 'دور كل عربية',
        instructions: 'كمّل حلقة for عشان كل عربية تعدّي بدورها.',
        starterCode: 'cars = ["taxi", "minibus", "tuktuk"]\nreleased_count = 0\nfor car in cars:\n    pass',
        solutionCode: carCode,
        testCases: [{ input: 'released_count', expectedOutput: '3', isHidden: false }],
        hints: ['for car in cars تمر على كل عربية مرة واحدة.'],
        difficulty: Difficulty.BEGINNER, order: 1,
      },
      {
        id: 'exercise-traffic-02', lessonId: second.id, title: 'دور المشاة',
        instructions: 'كمّل حلقة for عشان كل شخص يعبر بدوره.',
        starterCode: 'people = ["ali", "nadia"]\ncrossed_count = 0\nfor person in people:\n    pass',
        solutionCode: peopleCode,
        testCases: [{ input: 'crossed_count', expectedOutput: '2', isHidden: false }],
        hints: ['for person in people تمر على كل شخص مرة واحدة.'],
        difficulty: Difficulty.BEGINNER, order: 1,
      },
    ];
    for (const exercise of exercises) {
      await tx.exercise.upsert({
        where: { id: exercise.id },
        update: { ...exercise },
        create: { ...exercise },
      });
      await tx.exerciseConcept.upsert({
        where: { exerciseId_conceptId: { exerciseId: exercise.id, conceptId: ids.loops } },
        update: { isPrimary: true, weight: 1 },
        create: { exerciseId: exercise.id, conceptId: ids.loops, isPrimary: true, weight: 1 },
      });
      await tx.exerciseConcept.upsert({
        where: { exerciseId_conceptId: { exerciseId: exercise.id, conceptId: ids.variables } },
        update: { isPrimary: false, weight: 0.3 },
        create: { exerciseId: exercise.id, conceptId: ids.variables, isPrimary: false, weight: 0.3 },
      });
    }
    // The old first traffic seed taught a function. Its links must not make a loops
    // lesson appear to carry functions the learner has not met yet.
    await tx.exerciseConcept.deleteMany({
      where: { exerciseId: 'exercise-traffic-01', conceptId: { in: [ids.functions, ids.conditionals] } },
    });

    const template = await tx.missionTemplate.upsert({
      where: { id: 'template-isharet-loops' },
      update: {
        trackId: ids.track, mechanicId: 'traffic_loops', targetConceptId: ids.loops,
        carriedConceptIds: ['variables'], scenes: ['traffic_establishing'],
        propsRequired: ['signal', 'waiting_cars', 'waiting_pedestrians'],
        paramSchema: { stops: [1, 2] }, difficultyBand: 3, manifestVersion: '1.0.0',
      },
      create: {
        id: 'template-isharet-loops', trackId: ids.track,
        mechanicId: 'traffic_loops', targetConceptId: ids.loops,
        carriedConceptIds: ['variables'], scenes: ['traffic_establishing'],
        propsRequired: ['signal', 'waiting_cars', 'waiting_pedestrians'],
        paramSchema: { stops: [1, 2] }, difficultyBand: 3, manifestVersion: '1.0.0',
      },
    });
    for (const [index, lesson] of [first, second].entries()) {
      const id = `prebuilt-isharet-loop-${index + 1}`;
      const mission = index === 0 ? firstTrafficLoopMission(id) : pedestrianTrafficFallback(id);
      await tx.generatedMission.upsert({
        where: { id },
        update: {
          templateId: template.id, sceneId: mission.sceneId,
          params: { prebuilt: true, repetition: index + 1, lessonId: lesson.id },
          content: mission as unknown as Prisma.InputJsonValue,
          scaffoldPlan: {}, validated: true, manifestVersion: '1.0.0',
        },
        create: {
          id, templateId: template.id, sceneId: mission.sceneId,
          params: { prebuilt: true, repetition: index + 1, lessonId: lesson.id },
          content: mission as unknown as Prisma.InputJsonValue,
          scaffoldPlan: {}, validated: true, manifestVersion: '1.0.0',
        },
      });
    }
    return { first: first.id, second: second.id };
  }, { timeout: 30_000 });
}
