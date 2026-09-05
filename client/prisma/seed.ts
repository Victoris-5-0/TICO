import { PrismaClient, Role, Difficulty, ItemType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting TICO production-ready database seed...');

  // 1. Seed or update demo users
  const demoStudent = await prisma.user.upsert({
    where: { email: 'student@tico.dev' },
    update: {
      name: 'Adham Developer',
      role: Role.STUDENT,
      xp: 320,
      streak: 4,
    },
    create: {
      email: 'student@tico.dev',
      name: 'Adham Developer',
      role: Role.STUDENT,
      bio: 'Python student exploring Cairo Metro and Nile algorithms.',
      xp: 320,
      streak: 4,
    },
  });

  const demoTeacher = await prisma.user.upsert({
    where: { email: 'instructor@tico.dev' },
    update: {
      name: 'Professor Tico',
      role: Role.TEACHER,
      xp: 2500,
      streak: 45,
    },
    create: {
      email: 'instructor@tico.dev',
      name: 'Professor Tico',
      role: Role.TEACHER,
      bio: 'Lead Computer Science Instructor at TICO Egypt.',
      xp: 2500,
      streak: 45,
    },
  });

  console.log(`👤 Users seeded: ${demoStudent.email}, ${demoTeacher.email}`);

  // 2. Seed Egypt World Tracks & Lessons
  const cairoMetro = await prisma.track.upsert({
    where: { slug: 'cairo-metro' },
    update: {
      title: 'Cairo Metro: Foundations of Code',
      description: 'Navigate Line 1 and Line 2 through Python variables, calculations, and ticketing logic.',
      icon: 'train',
      language: 'python',
      published: true,
      order: 1,
    },
    create: {
      slug: 'cairo-metro',
      title: 'Cairo Metro: Foundations of Code',
      description: 'Navigate Line 1 and Line 2 through Python variables, calculations, and ticketing logic.',
      icon: 'train',
      language: 'python',
      published: true,
      order: 1,
    },
  });

  await prisma.track.upsert({
    where: { slug: 'el-forn' },
    update: {
      title: 'El Forn Bakery: Loops & Bread Production',
      description: 'Manage daily baladi bread production using for-loops, while-loops, and lists.',
      icon: 'flame',
      language: 'python',
      published: true,
      order: 2,
    },
    create: {
      slug: 'el-forn',
      title: 'El Forn Bakery: Loops & Bread Production',
      description: 'Manage daily baladi bread production using for-loops, while-loops, and lists.',
      icon: 'flame',
      language: 'python',
      published: true,
      order: 2,
    },
  });

  await prisma.track.upsert({
    where: { slug: 'cairo-traffic' },
    update: {
      title: 'Cairo Traffic: Functions & Automation',
      description: 'Control 6th October Bridge traffic signals using modular Python functions and logic.',
      icon: 'car',
      language: 'python',
      published: true,
      order: 3,
    },
    create: {
      slug: 'cairo-traffic',
      title: 'Cairo Traffic: Functions & Automation',
      description: 'Control 6th October Bridge traffic signals using modular Python functions and logic.',
      icon: 'car',
      language: 'python',
      published: true,
      order: 3,
    },
  });

  await prisma.track.upsert({
    where: { slug: 'nile-river' },
    update: {
      title: 'Nile River: Flood Monitoring & Mastery',
      description: 'Monitor water levels from Aswan to the Delta using data structures and algorithms.',
      icon: 'droplets',
      language: 'python',
      published: true,
      order: 4,
    },
    create: {
      slug: 'nile-river',
      title: 'Nile River: Flood Monitoring & Mastery',
      description: 'Monitor water levels from Aswan to the Delta using data structures and algorithms.',
      icon: 'droplets',
      language: 'python',
      published: true,
      order: 4,
    },
  });

  console.log('🗺️ Tracks seeded: Cairo Metro, El Forn, Cairo Traffic, Nile River');

  // 3. Seed Cairo Metro Lesson 1 & Exercise
  const metroLesson1 = await prisma.lesson.upsert({
    where: {
      trackId_slug: {
        trackId: cairoMetro.id,
        slug: 'metro-line-departure',
      },
    },
    update: {
      title: '1. Station Departure & Fare Calculation',
      description: 'Learn Python variable assignment and arithmetic to compute passenger metro fares.',
      order: 1,
    },
    create: {
      trackId: cairoMetro.id,
      slug: 'metro-line-departure',
      title: '1. Station Departure & Fare Calculation',
      description: 'Learn Python variable assignment and arithmetic to compute passenger metro fares.',
      content: `# Station Departure & Fare Calculation
Welcome to the Cairo Metro control room at Sadat Station!
In this lesson, you will learn how to write Python code to calculate total fare revenue.
`,
      order: 1,
    },
  });

  const metroExercise1 = await prisma.exercise.upsert({
    where: { id: 'exercise-cairo-metro-01' },
    update: {
      title: 'Calculate Metro Revenue',
      lessonId: metroLesson1.id,
      instructions: 'Write a function `calculate_revenue(passengers: int, price_per_ticket: int) -> int` that calculates total fare collected.',
      starterCode: `def calculate_revenue(passengers: int, price_per_ticket: int) -> int:
    # Calculate and return total revenue
    pass
`,
      solutionCode: `def calculate_revenue(passengers: int, price_per_ticket: int) -> int:
    return passengers * price_per_ticket
`,
      testCases: [
        { input: 'calculate_revenue(10, 8)', expectedOutput: '80', isHidden: false },
        { input: 'calculate_revenue(50, 10)', expectedOutput: '500', isHidden: false },
        { input: 'calculate_revenue(0, 8)', expectedOutput: '0', isHidden: true },
      ],
      hints: [
        'Multiply `passengers` by `price_per_ticket` using the `*` operator.',
        'Remember to `return` the final calculated value from the function.',
      ],
      difficulty: Difficulty.BEGINNER,
      order: 1,
    },
    create: {
      id: 'exercise-cairo-metro-01',
      lessonId: metroLesson1.id,
      title: 'Calculate Metro Revenue',
      instructions: 'Write a function `calculate_revenue(passengers: int, price_per_ticket: int) -> int` that calculates total fare collected.',
      starterCode: `def calculate_revenue(passengers: int, price_per_ticket: int) -> int:
    # Calculate and return total revenue
    pass
`,
      solutionCode: `def calculate_revenue(passengers: int, price_per_ticket: int) -> int:
    return passengers * price_per_ticket
`,
      testCases: [
        { input: 'calculate_revenue(10, 8)', expectedOutput: '80', isHidden: false },
        { input: 'calculate_revenue(50, 10)', expectedOutput: '500', isHidden: false },
        { input: 'calculate_revenue(0, 8)', expectedOutput: '0', isHidden: true },
      ],
      hints: [
        'Multiply `passengers` by `price_per_ticket` using the `*` operator.',
        'Remember to `return` the final calculated value from the function.',
      ],
      difficulty: Difficulty.BEGINNER,
      order: 1,
    },
  });

  console.log(`🚇 Lessons & Exercises seeded: ${metroLesson1.title} -> ${metroExercise1.title}`);

  // 4. Seed Heroes
  const heroes = [
    {
      id: 'hero-cairo-navigator',
      slug: 'cairo-navigator',
      name: 'Cairo Navigator',
      nameAr: 'مستكشف مترو القاهرة',
      description: 'Agile transit engineer equipped with a digital metro scanner.',
      spriteUrl: '/heroes/cairo-navigator.png',
      unlockRule: { level: 1, xpRequired: 0 },
    },
    {
      id: 'hero-nile-explorer',
      slug: 'nile-explorer',
      name: 'Nile Explorer',
      nameAr: 'مستكشف النيل',
      description: 'Master of water current sensors and botanical river navigation.',
      spriteUrl: '/heroes/nile-explorer.png',
      unlockRule: { level: 3, xpRequired: 300 },
    },
    {
      id: 'hero-pyramid-coder',
      slug: 'pyramid-coder',
      name: 'Pyramid Architect',
      nameAr: 'مهندس الأهرامات',
      description: 'Ancient computational scholar who unlocks geometric secrets.',
      spriteUrl: '/heroes/pyramid-coder.png',
      unlockRule: { level: 5, xpRequired: 1000 },
    },
  ];

  for (const h of heroes) {
    await prisma.hero.upsert({
      where: { slug: h.slug },
      update: h,
      create: h,
    });
  }

  // Equip default hero for demo student
  await prisma.userHero.upsert({
    where: {
      userId_heroId: {
        userId: demoStudent.id,
        heroId: 'hero-cairo-navigator',
      },
    },
    update: { isActive: true },
    create: {
      userId: demoStudent.id,
      heroId: 'hero-cairo-navigator',
      isActive: true,
    },
  });

  console.log('🦸 Heroes seeded & active hero configured for student.');

  // 5. Seed Items (Equipment & Shop)
  const items = [
    {
      id: 'item-pharaoh-staff',
      slug: 'pharaoh-staff',
      name: 'Staff of the Pharaoh',
      nameAr: 'صولجان الفراعنة البرمجي',
      description: 'Empowers your code execution with +10% focus.',
      type: ItemType.POWER_UP,
      spriteUrl: '/items/pharaoh-staff.png',
      cost: 250,
    },
    {
      id: 'item-metro-ticket-badge',
      slug: 'metro-ticket-badge',
      name: 'Golden Metro Pass',
      nameAr: 'تذكرة المترو الذهبية',
      description: 'A shiny commemorative badge for Line 1 graduates.',
      type: ItemType.BADGE,
      spriteUrl: '/items/metro-badge.png',
      cost: 100,
    },
    {
      id: 'item-desert-robe',
      slug: 'sinai-robe',
      name: 'Sinai Desert Cloak',
      nameAr: 'عباءة صحراء سيناء',
      description: 'Woven for night expeditions under the desert stars.',
      type: ItemType.COSMETIC,
      spriteUrl: '/items/sinai-robe.png',
      cost: 200,
    },
    {
      id: 'item-anubis-pet',
      slug: 'anubis-companion',
      name: 'Anubis Digital Pet',
      nameAr: 'مرافق أنوبيس البرمجي',
      description: 'A mythical companion who cheers you on during debugging.',
      type: ItemType.COSMETIC,
      spriteUrl: '/items/anubis-pet.png',
      cost: 450,
    },
  ];

  for (const item of items) {
    await prisma.item.upsert({
      where: { slug: item.slug },
      update: item,
      create: item,
    });
  }

  console.log('🎒 Equipment items seeded.');

  // 6. Seed Achievements
  const achievements = [
    {
      id: 'ach-first-code',
      slug: 'first-code',
      name: 'First Line of Code',
      nameAr: 'السطر البرمجي الأول',
      description: 'Submit your very first correct Python solution in TICO.',
      iconUrl: 'badge-check',
      xpReward: 50,
      criteria: { submissionsCount: 1 },
    },
    {
      id: 'ach-metro-master',
      slug: 'metro-master',
      name: 'Metro Engineer',
      nameAr: 'مهندس المترو',
      description: 'Complete the fare and transit calculations in Cairo Metro.',
      iconUrl: 'train',
      xpReward: 150,
      criteria: { trackCompleted: 'cairo-metro' },
    },
    {
      id: 'ach-streak-3',
      slug: 'streak-3',
      name: 'On Fire',
      nameAr: 'شعلة النشاط - 3 أيام',
      description: 'Maintain a learning streak for 3 consecutive days.',
      iconUrl: 'flame',
      xpReward: 100,
      criteria: { minStreak: 3 },
    },
    {
      id: 'ach-xp-collector',
      slug: 'xp-collector',
      name: 'Centurion',
      nameAr: 'جامع النقاط',
      description: 'Reach 300 total XP earned.',
      iconUrl: 'trophy',
      xpReward: 150,
      criteria: { minXp: 300 },
    },
  ];

  for (const ach of achievements) {
    await prisma.achievement.upsert({
      where: { slug: ach.slug },
      update: ach,
      create: ach,
    });
  }

  // Unlock first achievement for demo student
  await prisma.userAchievement.upsert({
    where: {
      userId_achievementId: {
        userId: demoStudent.id,
        achievementId: 'ach-first-code',
      },
    },
    update: {},
    create: {
      userId: demoStudent.id,
      achievementId: 'ach-first-code',
    },
  });

  // 7. Seed Demo Classroom
  const demoClassroom = await prisma.classroom.upsert({
    where: { joinCode: 'TICO-EGY1' },
    update: {
      name: 'Cairo STEM Academy - Python Cohort A',
      teacherId: demoTeacher.id,
      trackId: cairoMetro.id,
    },
    create: {
      name: 'Cairo STEM Academy - Python Cohort A',
      joinCode: 'TICO-EGY1',
      teacherId: demoTeacher.id,
      trackId: cairoMetro.id,
    },
  });

  await prisma.classroomMember.upsert({
    where: {
      classroomId_userId: {
        classroomId: demoClassroom.id,
        userId: demoStudent.id,
      },
    },
    update: {},
    create: {
      classroomId: demoClassroom.id,
      userId: demoStudent.id,
    },
  });

  console.log(`🏫 Classroom seeded: "${demoClassroom.name}" (Code: ${demoClassroom.joinCode})`);
  console.log('✨ All TICO production-ready baseline data successfully seeded!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
