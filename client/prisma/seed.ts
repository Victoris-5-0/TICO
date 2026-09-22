import { PrismaClient, Role, Difficulty, ItemType, LessonRequirement, DecidedBy, SkillBand } from '@prisma/client';
import { seedTrafficWorldContent } from '../scripts/traffic-world-content';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting TICO canonical AI-driven database seed...');

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
      bio: 'Python student exploring El Forn, El Mahatta, and Isharet Cairo.',
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

  // 2. Seed The Linear Concept Spine (variables -> conditionals -> loops -> functions)
  const conceptVariables = await prisma.concept.upsert({
    where: { slug: 'variables' },
    update: { sequenceOrder: 1, name: 'Variables & Calculation', nameAr: 'المتغيرات والعمليات الحسابية' },
    create: {
      slug: 'variables',
      name: 'Variables & Calculation',
      nameAr: 'المتغيرات والعمليات الحسابية',
      description: 'Storing values, assigning identifiers, and performing basic arithmetic in Python.',
      sequenceOrder: 1,
    },
  });

  const conceptConditionals = await prisma.concept.upsert({
    where: { slug: 'conditionals' },
    update: { sequenceOrder: 2, name: 'Conditionals & Branching', nameAr: 'الشروط والقرارات المنطقية' },
    create: {
      slug: 'conditionals',
      name: 'Conditionals & Branching',
      nameAr: 'الشروط والقرارات المنطقية',
      description: 'Branching logic using if, elif, else, and comparison operators.',
      sequenceOrder: 2,
    },
  });

  const conceptLoops = await prisma.concept.upsert({
    where: { slug: 'loops' },
    update: { sequenceOrder: 3, name: 'Loops & Collections', nameAr: 'التكرار والقوائم البرمجية' },
    create: {
      slug: 'loops',
      name: 'Loops & Collections',
      nameAr: 'التكرار والقوائم البرمجية',
      description: 'Iterating through queues and batches using for-loops, while-loops, and lists.',
      sequenceOrder: 3,
    },
  });

  const conceptFunctions = await prisma.concept.upsert({
    where: { slug: 'functions' },
    update: { sequenceOrder: 4, name: 'Functions & Modularity', nameAr: 'الدوال والوحدات البرمجية' },
    create: {
      slug: 'functions',
      name: 'Functions & Modularity',
      nameAr: 'الدوال والوحدات البرمجية',
      description: 'Encapsulating reusable logic into functions with parameters and return values.',
      sequenceOrder: 4,
    },
  });

  console.log('📐 Concept spine seeded: variables (1), conditionals (2), loops (3), functions (4)');

  // 3. Seed The 3 Canonical Egypt Worlds (Tracks)
  // World 1: El Forn (The Baladi Bakery)
  const elForn = await prisma.track.upsert({
    where: { slug: 'el-forn' },
    update: {
      title: 'El Forn: Baladi Bakery',
      description: 'Organize bread trays, count portions, and help the morning queue move fairly using Python variables and limits.',
      icon: 'flame',
      language: 'python',
      published: true,
      order: 1,
    },
    create: {
      slug: 'el-forn',
      title: 'El Forn: Baladi Bakery',
      description: 'Organize bread trays, count portions, and help the morning queue move fairly using Python variables and limits.',
      icon: 'flame',
      language: 'python',
      published: true,
      order: 1,
    },
  });

  // World 2: El Mahatta (Egyptian Railway Station)
  const elMahatta = await prisma.track.upsert({
    where: { slug: 'el-mahatta' },
    update: {
      title: 'El Mahatta: Railway Station',
      description: 'Organize ticket lines, route passengers to correct platforms, and structure travel data using lists and loops.',
      icon: 'train',
      language: 'python',
      published: true,
      order: 2,
    },
    create: {
      slug: 'el-mahatta',
      title: 'El Mahatta: Railway Station',
      description: 'Organize ticket lines, route passengers to correct platforms, and structure travel data using lists and loops.',
      icon: 'train',
      language: 'python',
      published: true,
      order: 2,
    },
  });

  // World 3: Isharet Cairo (Traffic Control)
  const isharetCairo = await prisma.track.upsert({
    where: { slug: 'isharet-cairo' },
    update: {
      title: 'Isharet Cairo: Traffic Control',
      description: 'Guide cars and pedestrians safely through the junction with Python for loops.',
      icon: 'car',
      language: 'python',
      published: true,
      order: 3,
    },
    create: {
      slug: 'isharet-cairo',
      title: 'Isharet Cairo: Traffic Control',
      description: 'Guide cars and pedestrians safely through the junction with Python for loops.',
      icon: 'car',
      language: 'python',
      published: true,
      order: 3,
    },
  });

  console.log('🗺️ Canonical Worlds seeded: El Forn (1), El Mahatta (2), Isharet Cairo (3)');

  // 4. Seed Canonical Lessons & Template Exercises with ExerciseConcept Joins

  // World 1 - Lesson 1: Opening Message
  const fornLesson1 = await prisma.lesson.upsert({
    where: { trackId_slug: { trackId: elForn.id, slug: 'opening-message' } },
    update: {
      title: 'رسالة الفتح (Opening Message)',
      description: 'إعداد إشعار فتح المخبز وحساب كمية الخبز الأولى باستخدام المتغيرات.',
      order: 1,
    },
    create: {
      trackId: elForn.id,
      slug: 'opening-message',
      title: 'رسالة الفتح (Opening Message)',
      description: 'إعداد إشعار فتح المخبز وحساب كمية الخبز الأولى باستخدام المتغيرات.',
      content: 'مرحباً بك في مخبز العيش البلدي مع تيكو والعم حسن! في هذه المهمة، ستكتب كوداً لطباعة إشعار فتح المخبز.',
      order: 1,
    },
  });

  const fornExercise1 = await prisma.exercise.upsert({
    where: { id: 'exercise-forn-01' },
    update: {
      title: 'إشعار فتح المخبز (Bakery Opening Notice)',
      lessonId: fornLesson1.id,
      instructions: 'اكتب دالة `opening_notice(station_name: str, loaves: int) -> str` تقوم بتركيب رسالة الفتح: `"مخبز " + station_name + " جاهز بـ " + str(loaves) + " رغيف"`.',
      starterCode: `def opening_notice(station_name: str, loaves: int) -> str:
    # ركّب رسالة الفتح وأرجعها
    pass
`,
      solutionCode: `def opening_notice(station_name: str, loaves: int) -> str:
    return f"مخبز {station_name} جاهز بـ {loaves} رغيف"
`,
      testCases: [
        { input: 'opening_notice("الفرن البلدي", 100)', expectedOutput: '"مخبز الفرن البلدي جاهز بـ 100 رغيف"', isHidden: false },
        { input: 'opening_notice("السيدة زينب", 250)', expectedOutput: '"مخبز السيدة زينب جاهز بـ 250 رغيف"', isHidden: false },
      ],
      hints: [
        'استخدم علامة الجمع `+` أو الـ f-strings لدمج النصوص في بايثون.',
        'تأكد من إرجاع النتيجة باستخدام `return`.',
      ],
      difficulty: Difficulty.BEGINNER,
      order: 1,
    },
    create: {
      id: 'exercise-forn-01',
      lessonId: fornLesson1.id,
      title: 'إشعار فتح المخبز (Bakery Opening Notice)',
      instructions: 'اكتب دالة `opening_notice(station_name: str, loaves: int) -> str` تقوم بتركيب رسالة الفتح: `"مخبز " + station_name + " جاهز بـ " + str(loaves) + " رغيف"`.',
      starterCode: `def opening_notice(station_name: str, loaves: int) -> str:
    # ركّب رسالة الفتح وأرجعها
    pass
`,
      solutionCode: `def opening_notice(station_name: str, loaves: int) -> str:
    return f"مخبز {station_name} جاهز بـ {loaves} رغيف"
`,
      testCases: [
        { input: 'opening_notice("الفرن البلدي", 100)', expectedOutput: '"مخبز الفرن البلدي جاهز بـ 100 رغيف"', isHidden: false },
        { input: 'opening_notice("السيدة زينب", 250)', expectedOutput: '"مخبز السيدة زينب جاهز بـ 250 رغيف"', isHidden: false },
      ],
      hints: [
        'استخدم علامة الجمع `+` أو الـ f-strings لدمج النصوص في بايثون.',
        'تأكد من إرجاع النتيجة باستخدام `return`.',
      ],
      difficulty: Difficulty.BEGINNER,
      order: 1,
    },
  });

  await prisma.exerciseConcept.upsert({
    where: { exerciseId_conceptId: { exerciseId: fornExercise1.id, conceptId: conceptVariables.id } },
    update: { isPrimary: true, weight: 1.0 },
    create: { exerciseId: fornExercise1.id, conceptId: conceptVariables.id, isPrimary: true, weight: 1.0 },
  });

  // World 1 - Lesson 2: Count the Trays
  const fornLesson2 = await prisma.lesson.upsert({
    where: { trackId_slug: { trackId: elForn.id, slug: 'count-the-trays' } },
    update: {
      title: 'عدّ الصواني (Count the Trays)',
      description: 'حساب إجمالي الأرغفة المنتجة بناء على عدد الصواني وسعة كل صينية.',
      order: 2,
    },
    create: {
      trackId: elForn.id,
      slug: 'count-the-trays',
      title: 'عدّ الصواني (Count the Trays)',
      description: 'حساب إجمالي الأرغفة المنتجة بناء على عدد الصواني وسعة كل صينية.',
      content: 'في هذا الدرس، سنحسب مجموع الأرغفة التي يخرجها حسن من الفرن في الصواني.',
      order: 2,
    },
  });

  const fornExercise2 = await prisma.exercise.upsert({
    where: { id: 'exercise-forn-02' },
    update: {
      title: 'حساب إجمالي الأرغفة (Total Loaves Calculation)',
      lessonId: fornLesson2.id,
      instructions: 'اكتب دالة `calculate_loaves(trays: int, loaves_per_tray: int) -> int` تقوم بضرب عدد الصواني في سعة الصينية.',
      starterCode: `def calculate_loaves(trays: int, loaves_per_tray: int) -> int:
    # احسب وأرجع الإجمالي
    pass
`,
      solutionCode: `def calculate_loaves(trays: int, loaves_per_tray: int) -> int:
    return trays * loaves_per_tray
`,
      testCases: [
        { input: 'calculate_loaves(5, 12)', expectedOutput: '60', isHidden: false },
        { input: 'calculate_loaves(10, 8)', expectedOutput: '80', isHidden: false },
      ],
      hints: [
        'استخدم معامل الضرب `*` لضرب المتغيرين.',
      ],
      difficulty: Difficulty.BEGINNER,
      order: 1,
    },
    create: {
      id: 'exercise-forn-02',
      lessonId: fornLesson2.id,
      title: 'حساب إجمالي الأرغفة (Total Loaves Calculation)',
      instructions: 'اكتب دالة `calculate_loaves(trays: int, loaves_per_tray: int) -> int` تقوم بضرب عدد الصواني في سعة الصينية.',
      starterCode: `def calculate_loaves(trays: int, loaves_per_tray: int) -> int:
    # احسب وأرجع الإجمالي
    pass
`,
      solutionCode: `def calculate_loaves(trays: int, loaves_per_tray: int) -> int:
    return trays * loaves_per_tray
`,
      testCases: [
        { input: 'calculate_loaves(5, 12)', expectedOutput: '60', isHidden: false },
        { input: 'calculate_loaves(10, 8)', expectedOutput: '80', isHidden: false },
      ],
      hints: [
        'استخدم معامل الضرب `*` لضرب المتغيرين.',
      ],
      difficulty: Difficulty.BEGINNER,
      order: 1,
    },
  });

  await prisma.exerciseConcept.upsert({
    where: { exerciseId_conceptId: { exerciseId: fornExercise2.id, conceptId: conceptVariables.id } },
    update: { isPrimary: true, weight: 1.0 },
    create: { exerciseId: fornExercise2.id, conceptId: conceptVariables.id, isPrimary: true, weight: 1.0 },
  });

  // ---------------------------------------------------------------------------
  // Bakery lessons 4 and 5.
  //
  // `docs/02-python-curriculum.md` fixes six bakery lessons. Two were seeded, both
  // targeting `variables`, so every mission generated for `conditionals` or `loops` had
  // no lesson to hang off and was unreachable from the world page — fifteen of them.
  //
  // `order` follows the curriculum numbering rather than counting from what exists, so
  // "Family Order" (#3) and "Bakery Calculator" (#6) drop straight into the gaps when
  // content for them lands. A lesson also needs at least one exercise: it carries the
  // primary concept, and `getNextMission` falls back to it when the AI service is down.
  // ---------------------------------------------------------------------------

  const fornLesson4 = await prisma.lesson.upsert({
    where: { trackId_slug: { trackId: elForn.id, slug: 'fair-share' } },
    update: {
      title: 'النصيب العادل (Fair Share)',
      description: 'قارن الطلب بالحد المسموح، وقرر تقبله ولا تعدّله.',
      order: 4,
    },
    create: {
      trackId: elForn.id,
      slug: 'fair-share',
      title: 'النصيب العادل (Fair Share)',
      description: 'قارن الطلب بالحد المسموح، وقرر تقبله ولا تعدّله.',
      content: 'العيش مش بيكفي الكل لو حد خد أكتر من نصيبه. في الدرس ده هنتعلم إزاي الكود ياخد قرار.',
      order: 4,
    },
  });

  const fornExercise4 = await prisma.exercise.upsert({
    where: { id: 'exercise-forn-04' },
    update: {
      title: 'حد الطلب (Order Limit)',
      lessonId: fornLesson4.id,
      instructions: 'اكتب دالة `check_order(loaves: int, limit: int) -> str` ترجع "تمام" لو الطلب في حدود المسموح، و"كتير" لو أكتر.',
      starterCode: `def check_order(loaves: int, limit: int) -> str:
    # قارن الطلب بالحد المسموح
    pass
`,
      solutionCode: `def check_order(loaves: int, limit: int) -> str:
    if loaves <= limit:
        return "تمام"
    return "كتير"
`,
      testCases: [
        { input: 'check_order(4, 6)', expectedOutput: 'تمام', isHidden: false },
        { input: 'check_order(9, 6)', expectedOutput: 'كتير', isHidden: false },
      ],
      hints: ['استخدم `if` مع علامة `<=` عشان تقارن الرقمين.'],
      difficulty: Difficulty.BEGINNER,
      order: 1,
    },
    create: {
      id: 'exercise-forn-04',
      lessonId: fornLesson4.id,
      title: 'حد الطلب (Order Limit)',
      instructions: 'اكتب دالة `check_order(loaves: int, limit: int) -> str` ترجع "تمام" لو الطلب في حدود المسموح، و"كتير" لو أكتر.',
      starterCode: `def check_order(loaves: int, limit: int) -> str:
    # قارن الطلب بالحد المسموح
    pass
`,
      solutionCode: `def check_order(loaves: int, limit: int) -> str:
    if loaves <= limit:
        return "تمام"
    return "كتير"
`,
      testCases: [
        { input: 'check_order(4, 6)', expectedOutput: 'تمام', isHidden: false },
        { input: 'check_order(9, 6)', expectedOutput: 'كتير', isHidden: false },
      ],
      hints: ['استخدم `if` مع علامة `<=` عشان تقارن الرقمين.'],
      difficulty: Difficulty.BEGINNER,
      order: 1,
    },
  });

  await prisma.exerciseConcept.upsert({
    where: { exerciseId_conceptId: { exerciseId: fornExercise4.id, conceptId: conceptConditionals.id } },
    update: { isPrimary: true, weight: 1.0 },
    create: { exerciseId: fornExercise4.id, conceptId: conceptConditionals.id, isPrimary: true, weight: 1.0 },
  });

  await prisma.exerciseConcept.upsert({
    where: { exerciseId_conceptId: { exerciseId: fornExercise4.id, conceptId: conceptVariables.id } },
    update: { isPrimary: false, weight: 0.3 },
    create: { exerciseId: fornExercise4.id, conceptId: conceptVariables.id, isPrimary: false, weight: 0.3 },
  });

  const fornLesson5 = await prisma.lesson.upsert({
    where: { trackId_slug: { trackId: elForn.id, slug: 'morning-batches' } },
    update: {
      title: 'دفعات الصبح (Morning Batches)',
      description: 'لُف على دفعات الخبز واجمع إجمالي الأرغفة.',
      order: 5,
    },
    create: {
      trackId: elForn.id,
      slug: 'morning-batches',
      title: 'دفعات الصبح (Morning Batches)',
      description: 'لُف على دفعات الخبز واجمع إجمالي الأرغفة.',
      content: 'الفرن بيطلع أكتر من دفعة كل صبح. هنعدّها كلها بحلقة تكرار واحدة.',
      order: 5,
    },
  });

  const fornExercise5 = await prisma.exercise.upsert({
    where: { id: 'exercise-forn-05' },
    update: {
      title: 'مجموع الدفعات (Total Batches)',
      lessonId: fornLesson5.id,
      instructions: 'اكتب دالة `total_loaves(batches: list) -> int` تجمع كل الأرغفة في الدفعات.',
      starterCode: `def total_loaves(batches: list) -> int:
    # لُف على الدفعات واجمعها
    pass
`,
      solutionCode: `def total_loaves(batches: list) -> int:
    total = 0
    for batch in batches:
        total = total + batch
    return total
`,
      testCases: [
        { input: 'total_loaves([8, 8, 8])', expectedOutput: '24', isHidden: false },
        { input: 'total_loaves([])', expectedOutput: '0', isHidden: false },
      ],
      hints: ['ابدأ بمتغير `total = 0` وبعدين لُف بـ `for` وزوّد عليه.'],
      difficulty: Difficulty.BEGINNER,
      order: 1,
    },
    create: {
      id: 'exercise-forn-05',
      lessonId: fornLesson5.id,
      title: 'مجموع الدفعات (Total Batches)',
      instructions: 'اكتب دالة `total_loaves(batches: list) -> int` تجمع كل الأرغفة في الدفعات.',
      starterCode: `def total_loaves(batches: list) -> int:
    # لُف على الدفعات واجمعها
    pass
`,
      solutionCode: `def total_loaves(batches: list) -> int:
    total = 0
    for batch in batches:
        total = total + batch
    return total
`,
      testCases: [
        { input: 'total_loaves([8, 8, 8])', expectedOutput: '24', isHidden: false },
        { input: 'total_loaves([])', expectedOutput: '0', isHidden: false },
      ],
      hints: ['ابدأ بمتغير `total = 0` وبعدين لُف بـ `for` وزوّد عليه.'],
      difficulty: Difficulty.BEGINNER,
      order: 1,
    },
  });

  await prisma.exerciseConcept.upsert({
    where: { exerciseId_conceptId: { exerciseId: fornExercise5.id, conceptId: conceptLoops.id } },
    update: { isPrimary: true, weight: 1.0 },
    create: { exerciseId: fornExercise5.id, conceptId: conceptLoops.id, isPrimary: true, weight: 1.0 },
  });

  await prisma.exerciseConcept.upsert({
    where: { exerciseId_conceptId: { exerciseId: fornExercise5.id, conceptId: conceptVariables.id } },
    update: { isPrimary: false, weight: 0.3 },
    create: { exerciseId: fornExercise5.id, conceptId: conceptVariables.id, isPrimary: false, weight: 0.3 },
  });

  // World 2 - Lesson 1: Ticket Queue
  const mahattaLesson1 = await prisma.lesson.upsert({
    where: { trackId_slug: { trackId: elMahatta.id, slug: 'ticket-queue' } },
    update: {
      title: 'طابور التذاكر (Ticket Queue)',
      description: 'تنظيم شباك التذاكر وتوزيع المقاعد باستخدام القوائم والحلقات التكرارية.',
      order: 1,
    },
    create: {
      trackId: elMahatta.id,
      slug: 'ticket-queue',
      title: 'طابور التذاكر (Ticket Queue)',
      description: 'تنظيم شباك التذاكر وتوزيع المقاعد باستخدام القوائم والحلقات التكرارية.',
      content: 'في محطة قطار مصر، تساعد دينا في شباك التذاكر لتنظيم طلبات الركاب.',
      order: 1,
    },
  });

  const mahattaExercise1 = await prisma.exercise.upsert({
    where: { id: 'exercise-mahatta-01' },
    update: {
      title: 'معالجة طابور التذاكر (Process Ticket Queue)',
      lessonId: mahattaLesson1.id,
      instructions: 'اكتب دالة `count_passengers_for_destination(queue: list, destination: str) -> int` لحساب عدد الركاب المتجهين لمحطة معينة.',
      starterCode: `def count_passengers_for_destination(queue: list, destination: str) -> int:
    # عد الركاب المتجهين إلى الوجهة المطلوبة
    pass
`,
      solutionCode: `def count_passengers_for_destination(queue: list, destination: str) -> int:
    count = 0
    for passenger in queue:
        if passenger.get("destination") == destination:
            count += 1
    return count
`,
      testCases: [
        { input: 'count_passengers_for_destination([{"destination": "الإسكندرية"}, {"destination": "أسوان"}, {"destination": "الإسكندرية"}], "الإسكندرية")', expectedOutput: '2', isHidden: false },
      ],
      hints: [
        'استخدم حلقة `for` للمرور على كل راكب في القائمة.',
        'قارن قيمة المفتاح `"destination"` مع الوجهة المطلوبة باستخدام `==`.',
      ],
      difficulty: Difficulty.INTERMEDIATE,
      order: 1,
    },
    create: {
      id: 'exercise-mahatta-01',
      lessonId: mahattaLesson1.id,
      title: 'معالجة طابور التذاكر (Process Ticket Queue)',
      instructions: 'اكتب دالة `count_passengers_for_destination(queue: list, destination: str) -> int` لحساب عدد الركاب المتجهين لمحطة معينة.',
      starterCode: `def count_passengers_for_destination(queue: list, destination: str) -> int:
    # عد الركاب المتجهين إلى الوجهة المطلوبة
    pass
`,
      solutionCode: `def count_passengers_for_destination(queue: list, destination: str) -> int:
    count = 0
    for passenger in queue:
        if passenger.get("destination") == destination:
            count += 1
    return count
`,
      testCases: [
        { input: 'count_passengers_for_destination([{"destination": "الإسكندرية"}, {"destination": "أسوان"}, {"destination": "الإسكندرية"}], "الإسكندرية")', expectedOutput: '2', isHidden: false },
      ],
      hints: [
        'استخدم حلقة `for` للمرور على كل راكب في القائمة.',
        'قارن قيمة المفتاح `"destination"` مع الوجهة المطلوبة باستخدام `==`.',
      ],
      difficulty: Difficulty.INTERMEDIATE,
      order: 1,
    },
  });

  await prisma.exerciseConcept.upsert({
    where: { exerciseId_conceptId: { exerciseId: mahattaExercise1.id, conceptId: conceptLoops.id } },
    update: { isPrimary: true, weight: 1.0 },
    create: { exerciseId: mahattaExercise1.id, conceptId: conceptLoops.id, isPrimary: true, weight: 1.0 },
  });

  await prisma.exerciseConcept.upsert({
    where: { exerciseId_conceptId: { exerciseId: mahattaExercise1.id, conceptId: conceptConditionals.id } },
    update: { isPrimary: false, weight: 0.3 },
    create: { exerciseId: mahattaExercise1.id, conceptId: conceptConditionals.id, isPrimary: false, weight: 0.3 },
  });

  await seedTrafficWorldContent(prisma, {
    track: isharetCairo.id, loops: conceptLoops.id, variables: conceptVariables.id,
    functions: conceptFunctions.id, conditionals: conceptConditionals.id,
  });

  console.log('📚 Lessons, Exercises, and ExerciseConcept weights seeded.');

  // 5. Seed MissionTemplates for Runtime AI Generation
  await prisma.missionTemplate.upsert({
    where: { id: 'template-forn-variables' },
    update: {
      trackId: elForn.id,
      mechanicId: 'bakery_orders',
      targetConceptId: conceptVariables.id,
      carriedConceptIds: [],
      scenes: ['bakery.street', 'bakery.counter', 'bakery.queue'],
      propsRequired: ['bakery.tray', 'bakery.queue_token'],
      paramSchema: { queueLength: { min: 4, max: 12 }, loavesPerPerson: { min: 2, max: 4 } },
      difficultyBand: 3,
      manifestVersion: '1.0.0',
    },
    create: {
      id: 'template-forn-variables',
      trackId: elForn.id,
      mechanicId: 'bakery_orders',
      targetConceptId: conceptVariables.id,
      carriedConceptIds: [],
      scenes: ['bakery.street', 'bakery.counter', 'bakery.queue'],
      propsRequired: ['bakery.tray', 'bakery.queue_token'],
      paramSchema: { queueLength: { min: 4, max: 12 }, loavesPerPerson: { min: 2, max: 4 } },
      difficultyBand: 3,
      manifestVersion: '1.0.0',
    },
  });

  await prisma.missionTemplate.upsert({
    where: { id: 'template-mahatta-loops' },
    update: {
      trackId: elMahatta.id,
      mechanicId: 'station_dispatch',
      targetConceptId: conceptLoops.id,
      carriedConceptIds: [conceptConditionals.id],
      scenes: ['station.concourse', 'station.ticket_hall', 'station.platform'],
      propsRequired: ['station.ticket', 'station.barrier'],
      paramSchema: { passengerCount: { min: 5, max: 20 }, ticketCategories: 3 },
      difficultyBand: 5,
      manifestVersion: '1.0.0',
    },
    create: {
      id: 'template-mahatta-loops',
      trackId: elMahatta.id,
      mechanicId: 'station_dispatch',
      targetConceptId: conceptLoops.id,
      carriedConceptIds: [conceptConditionals.id],
      scenes: ['station.concourse', 'station.ticket_hall', 'station.platform'],
      propsRequired: ['station.ticket', 'station.barrier'],
      paramSchema: { passengerCount: { min: 5, max: 20 }, ticketCategories: 3 },
      difficultyBand: 5,
      manifestVersion: '1.0.0',
    },
  });

  await prisma.missionTemplate.upsert({
    where: { id: 'template-traffic-functions' },
    update: {
      trackId: isharetCairo.id,
      mechanicId: 'traffic_control',
      targetConceptId: conceptFunctions.id,
      carriedConceptIds: [conceptConditionals.id, conceptLoops.id],
      scenes: ['traffic.intersection', 'traffic.sensor', 'traffic.control_room'],
      propsRequired: ['traffic.signal', 'traffic.sensor'],
      paramSchema: { intersectionSensors: 4, peakHourFactor: 1.5 },
      difficultyBand: 7,
      manifestVersion: '1.0.0',
    },
    create: {
      id: 'template-traffic-functions',
      trackId: isharetCairo.id,
      mechanicId: 'traffic_control',
      targetConceptId: conceptFunctions.id,
      carriedConceptIds: [conceptConditionals.id, conceptLoops.id],
      scenes: ['traffic.intersection', 'traffic.sensor', 'traffic.control_room'],
      propsRequired: ['traffic.signal', 'traffic.sensor'],
      paramSchema: { intersectionSensors: 4, peakHourFactor: 1.5 },
      difficultyBand: 7,
      manifestVersion: '1.0.0',
    },
  });

  console.log('🏛️ MissionTemplates seeded for closed world manifests.');

  // 6. Seed StudentProfile & Initial LessonPlan for Demo Student
  await prisma.studentProfile.upsert({
    where: { userId: demoStudent.id },
    update: {
      skillBand: SkillBand.ON_LEVEL,
      hintDependency: 0.2,
      syntaxVsLogic: 0.5,
      locale: 'ar-EG',
      lastComputedAt: new Date(),
    },
    create: {
      userId: demoStudent.id,
      skillBand: SkillBand.ON_LEVEL,
      hintDependency: 0.2,
      syntaxVsLogic: 0.5,
      locale: 'ar-EG',
      lastComputedAt: new Date(),
    },
  });

  await prisma.lessonPlan.upsert({
    where: { userId_lessonId: { userId: demoStudent.id, lessonId: fornLesson1.id } },
    update: { requirement: LessonRequirement.REQUIRED, decidedBy: DecidedBy.RULE },
    create: {
      userId: demoStudent.id,
      lessonId: fornLesson1.id,
      requirement: LessonRequirement.REQUIRED,
      reason: 'بداية المسار التعليمي لأساسيات البرمجة في مخبز العيش البلدي.',
      decidedBy: DecidedBy.RULE,
      confidence: 1.0,
    },
  });

  await prisma.lessonPlan.upsert({
    where: { userId_lessonId: { userId: demoStudent.id, lessonId: fornLesson2.id } },
    update: { requirement: LessonRequirement.REQUIRED, decidedBy: DecidedBy.RULE },
    create: {
      userId: demoStudent.id,
      lessonId: fornLesson2.id,
      requirement: LessonRequirement.REQUIRED,
      reason: 'تطبيق عملي على المتغيرات الحسابية.',
      decidedBy: DecidedBy.RULE,
      confidence: 1.0,
    },
  });

  // 7. Seed Heroes
  const heroes = [
    {
      id: 'hero-cairo-navigator',
      slug: 'cairo-navigator',
      name: 'Cairo Navigator',
      nameAr: 'مستكشف شوارع القاهرة',
      description: 'Agile transit engineer equipped with a digital sensor.',
      spriteUrl: '/heroes/cairo-navigator.png',
      unlockRule: { level: 1, xpRequired: 0 },
    },
    {
      id: 'hero-nile-explorer',
      slug: 'nile-explorer',
      name: 'Nile Explorer',
      nameAr: 'مستكشف النيل',
      description: 'Master of water current sensors and river navigation.',
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

  // 8. Seed Equipment Items
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
      description: 'A shiny commemorative badge for graduates.',
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
  ];

  for (const item of items) {
    await prisma.item.upsert({
      where: { slug: item.slug },
      update: item,
      create: item,
    });
  }

  // 9. Seed Achievements
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
      id: 'ach-forn-master',
      slug: 'forn-master',
      name: 'Master Baker',
      nameAr: 'خباز ماهر',
      description: 'Complete the bread calculations and queue rules in El Forn.',
      iconUrl: 'flame',
      xpReward: 150,
      criteria: { trackCompleted: 'el-forn' },
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
  ];

  for (const ach of achievements) {
    await prisma.achievement.upsert({
      where: { slug: ach.slug },
      update: ach,
      create: ach,
    });
  }

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

  // 10. Seed Demo Classroom
  const demoClassroom = await prisma.classroom.upsert({
    where: { joinCode: 'TICO-EGY1' },
    update: {
      name: 'Cairo STEM Academy - Python Cohort A',
      teacherId: demoTeacher.id,
      trackId: elForn.id,
    },
    create: {
      name: 'Cairo STEM Academy - Python Cohort A',
      joinCode: 'TICO-EGY1',
      teacherId: demoTeacher.id,
      trackId: elForn.id,
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
  console.log('✨ All TICO canonical database data successfully seeded!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
