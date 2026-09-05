import { db } from '@/lib/db';

export class GameService {
  /**
   * Retrieves all heroes/character skins with student acquisition status.
   */
  async getHeroes(userId?: string) {
    const heroes = await db.hero.findMany({
      orderBy: { createdAt: 'asc' },
    });

    let acquiredHeroIds = new Set<string>();
    let activeHeroId: string | null = null;

    if (userId) {
      const userHeroes = await db.userHero.findMany({
        where: { userId },
      });
      acquiredHeroIds = new Set(userHeroes.map((uh) => uh.heroId));
      const active = userHeroes.find((uh) => uh.isActive);
      if (active) activeHeroId = active.heroId;
    }

    return heroes.map((hero) => ({
      id: hero.id,
      slug: hero.slug,
      name: hero.name,
      nameAr: hero.nameAr,
      description: hero.description,
      spriteUrl: hero.spriteUrl,
      unlockRule: hero.unlockRule,
      isAcquired: acquiredHeroIds.has(hero.id),
      isActive: activeHeroId === hero.id,
    }));
  }

  /**
   * Equips an acquired hero for a student.
   */
  async equipHero(userId: string, heroId: string) {
    // Verify hero is acquired
    const userHero = await db.userHero.findUnique({
      where: {
        userId_heroId: { userId, heroId },
      },
    });

    if (!userHero) {
      throw new Error('Hero is not unlocked or acquired yet');
    }

    // Set all others to isActive: false and target to isActive: true
    await db.$transaction([
      db.userHero.updateMany({
        where: { userId },
        data: { isActive: false },
      }),
      db.userHero.update({
        where: { userId_heroId: { userId, heroId } },
        data: { isActive: true },
      }),
    ]);

    return { success: true, heroId };
  }

  /**
   * Retrieves all achievements with student unlock status.
   */
  async getAchievements(userId?: string) {
    const achievements = await db.achievement.findMany({
      orderBy: { xpReward: 'asc' },
    });

    let unlockedMap = new Map<string, Date>();
    if (userId) {
      const userAchievements = await db.userAchievement.findMany({
        where: { userId },
      });
      unlockedMap = new Map(userAchievements.map((ua) => [ua.achievementId, ua.unlockedAt]));
    }

    return achievements.map((a) => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      nameAr: a.nameAr,
      description: a.description,
      iconUrl: a.iconUrl,
      xpReward: a.xpReward,
      isUnlocked: unlockedMap.has(a.id),
      unlockedAt: unlockedMap.get(a.id) ?? null,
    }));
  }

  /**
   * Retrieves store/inventory items.
   */
  async getItems(userId?: string) {
    const items = await db.item.findMany({
      orderBy: { cost: 'asc' },
    });

    let userItemMap = new Map<string, number>();
    if (userId) {
      const userItems = await db.userItem.findMany({
        where: { userId },
      });
      userItemMap = new Map(userItems.map((ui) => [ui.itemId, ui.quantity]));
    }

    return items.map((item) => ({
      id: item.id,
      slug: item.slug,
      name: item.name,
      nameAr: item.nameAr,
      description: item.description,
      type: item.type,
      spriteUrl: item.spriteUrl,
      cost: item.cost,
      ownedQuantity: userItemMap.get(item.id) ?? 0,
    }));
  }
}

export const gameService = new GameService();
