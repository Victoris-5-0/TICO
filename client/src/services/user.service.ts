import { db } from '@/lib/db';

export class UserService {
  /**
   * Retrieves user profile with gamified coding stats.
   */
  async getProfile(userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        bio: true,
        xp: true,
        streak: true,
        createdAt: true,
      }
    });

    if (!user) return null;

    const [totalCompletedLessons, totalSubmissions, passedSubmissions, totalHintsUsed] = await Promise.all([
      db.userProgress.count({ where: { userId, completed: true } }),
      db.submission.count({ where: { userId } }),
      db.submission.count({ where: { userId, status: 'PASSED' } }),
      db.hintEvent.count({ where: { session: { userId } } }),
    ]);

    return {
      ...user,
      stats: {
        totalCompletedLessons,
        totalSubmissions,
        passedSubmissions,
        totalHintsUsed,
      }
    };
  }

  /**
   * Updates user profile attributes.
   */
  async updateProfile(userId: string, data: { name?: string; bio?: string; avatarUrl?: string }) {
    return db.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.bio !== undefined ? { bio: data.bio } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        bio: true,
        role: true,
        xp: true,
        streak: true,
      }
    });
  }

  /**
   * Retrieves the top students ordered by XP for the leaderboard.
   */
  async getLeaderboard(limit = 20) {
    const users = await db.user.findMany({
      where: { role: 'STUDENT' },
      orderBy: { xp: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        xp: true,
        streak: true,
      }
    });

    return users.map((u, index) => ({
      rank: index + 1,
      id: u.id,
      name: u.name || 'Student',
      avatarUrl: u.avatarUrl,
      xp: u.xp,
      streak: u.streak,
    }));
  }
}

export const userService = new UserService();
