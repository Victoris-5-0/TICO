import { PrismaClient } from '@prisma/client';

import { seedTrafficWorldContent } from './traffic-world-content';

const prisma = new PrismaClient();

async function main() {
  const track = await prisma.track.findUnique({ where: { slug: 'isharet-cairo' }, select: { id: true } });
  const concepts = await prisma.concept.findMany({
    where: { slug: { in: ['loops', 'variables', 'functions', 'conditionals'] } },
    select: { id: true, slug: true },
  });
  const bySlug = Object.fromEntries(concepts.map((concept) => [concept.slug, concept.id]));
  if (!track || !bySlug.loops || !bySlug.variables || !bySlug.functions || !bySlug.conditionals) {
    throw new Error('Seed the canonical track and concepts before traffic lessons.');
  }
  await prisma.track.update({
    where: { slug: 'isharet-cairo' },
    data: { description: 'Guide cars and pedestrians safely through the junction with Python for loops.' },
  });
  const result = await seedTrafficWorldContent(prisma, {
    track: track.id, loops: bySlug.loops, variables: bySlug.variables,
    functions: bySlug.functions, conditionals: bySlug.conditionals,
  });
  console.log(`Traffic lessons ready: ${result.first}, ${result.second}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
