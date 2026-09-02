import { PrismaClient, Role, Difficulty, SubmissionStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data
  await prisma.companionChat.deleteMany();
  await prisma.userProgress.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.exercise.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.track.deleteMany();
  await prisma.user.deleteMany();

  // Create demo users
  const demoStudent = await prisma.user.create({
    data: {
      email: 'student@tico.dev',
      name: 'Alex Developer',
      role: Role.STUDENT,
      bio: 'Learning full-stack development and algorithms.',
      xp: 120,
      streak: 3,
    },
  });

  const demoTeacher = await prisma.user.create({
    data: {
      email: 'instructor@tico.dev',
      name: 'Professor Tico',
      role: Role.TEACHER,
      bio: 'Lead Instructor at TICO.',
      xp: 1500,
      streak: 42,
    },
  });

  // Create TypeScript Fundamentals Track
  const tsTrack = await prisma.track.create({
    data: {
      title: 'TypeScript Fundamentals',
      slug: 'typescript-fundamentals',
      description: 'Master typed JavaScript from basics to advanced generics.',
      icon: 'typescript',
      language: 'typescript',
      published: true,
      order: 1,
      lessons: {
        create: [
          {
            title: '1. Introduction to TypeScript Types',
            slug: 'intro-to-types',
            description: 'Learn primitive types, type annotations, and basic functions in TypeScript.',
            content: `# Introduction to TypeScript

TypeScript extends JavaScript by adding static type definitions. Types provide a way to describe the shape of an object, providing better documentation, and allowing TypeScript to validate that your code is working correctly.

### Primitive Types
- \`string\`
- \`number\`
- \`boolean\`
- \`array\` (e.g. \`number[]\`)

### Example:
\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`
`,
            order: 1,
            exercises: {
              create: [
                {
                  title: 'Create a typed greeting function',
                  instructions: 'Write a function named `formatUserGreeting` that takes a `name` (string) and an optional `age` (number), returning a formatted string: `"Hello, [name]!"` or `"Hello, [name]! You are [age] years old."`',
                  starterCode: `export function formatUserGreeting(name: string, age?: number): string {
  // Write your code here
  return "";
}
`,
                  solutionCode: `export function formatUserGreeting(name: string, age?: number): string {
  if (age !== undefined) {
    return \`Hello, \${name}! You are \${age} years old.\`;
  }
  return \`Hello, \${name}!\`;
}
`,
                  testCases: [
                    {
                      input: 'formatUserGreeting("Alice")',
                      expectedOutput: 'Hello, Alice!',
                      isHidden: false,
                    },
                    {
                      input: 'formatUserGreeting("Bob", 25)',
                      expectedOutput: 'Hello, Bob! You are 25 years old.',
                      isHidden: false,
                    },
                  ],
                  hints: [
                    'Use an optional parameter with `?` like `age?: number`.',
                    'Check if `age !== undefined` before appending the age.',
                  ],
                  difficulty: Difficulty.BEGINNER,
                  order: 1,
                },
              ],
            },
          },
        ],
      },
    },
    include: {
      lessons: {
        include: {
          exercises: true,
        },
      },
    },
  });

  // Create Python Track
  const pyTrack = await prisma.track.create({
    data: {
      title: 'Python for Problem Solving',
      slug: 'python-problem-solving',
      description: 'Step into computational thinking with Python.',
      icon: 'python',
      language: 'python',
      published: true,
      order: 2,
      lessons: {
        create: [
          {
            title: '1. Variables and Numbers',
            slug: 'variables-and-numbers',
            description: 'Understand integers, floats, and basic arithmetic in Python.',
            content: `# Variables in Python

Python is dynamically typed and uses simple variable assignments.

\`\`\`python
x = 10
y = 20
total = x + y
print(total)
\`\`\`
`,
            order: 1,
            exercises: {
              create: [
                {
                  title: 'Sum of Evens',
                  instructions: 'Write a function `sum_even_numbers(numbers: list[int]) -> int` that returns the sum of all even numbers in the list.',
                  starterCode: `def sum_even_numbers(numbers: list[int]) -> int:
    # Write your solution here
    pass
`,
                  solutionCode: `def sum_even_numbers(numbers: list[int]) -> int:
    return sum(n for n in numbers if n % 2 == 0)
`,
                  testCases: [
                    {
                      input: 'sum_even_numbers([1, 2, 3, 4, 5, 6])',
                      expectedOutput: '12',
                      isHidden: false,
                    },
                    {
                      input: 'sum_even_numbers([1, 3, 5])',
                      expectedOutput: '0',
                      isHidden: false,
                    },
                  ],
                  hints: [
                    'You can use the modulo operator `% 2 == 0` to check for even numbers.',
                  ],
                  difficulty: Difficulty.BEGINNER,
                  order: 1,
                },
              ],
            },
          },
        ],
      },
    },
  });

  console.log(`✅ Seeded ${[tsTrack, pyTrack].length} tracks, demo users (${demoStudent.email}, ${demoTeacher.email}).`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
