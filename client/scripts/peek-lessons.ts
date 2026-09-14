import "dotenv/config";
import { PrismaClient } from "@prisma/client";
async function main() {
  const db = new PrismaClient();
  const lessons = await db.lesson.findMany({
    where: { track: { slug: "el-forn" } },
    orderBy: { order: "asc" },
    select: { id: true, slug: true, order: true, title: true,
      exercises: { select: { id: true, concepts: { select: { conceptId: true, isPrimary: true } } } } },
  });
  for (const l of lessons) {
    const c = l.exercises.flatMap((e) => e.concepts.filter((x) => x.isPrimary).map((x) => x.conceptId));
    console.log(`${l.order}  ${l.slug.padEnd(18)} ex=${l.exercises.length}  primary=${c.join(",") || "-"}  ${l.title}`);
  }
  const concepts = await db.concept.findMany({ select: { id: true, slug: true }, orderBy: { sequenceOrder: "asc" } });
  console.log("concepts:", concepts.map((c) => `${c.slug}=${c.id}`).join("  "));
  await db.$disconnect();
}
main();
