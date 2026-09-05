import { db } from '@/lib/db';

export class ClassroomService {
  /**
   * Generates a random uppercase join code (e.g. CAIRO-4X8K).
   */
  private generateJoinCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `TICO-${suffix}`;
  }

  /**
   * Creates a new classroom by a teacher.
   */
  async createClassroom(teacherId: string, name: string, trackId?: string) {
    let joinCode = this.generateJoinCode();
    
    // Ensure joinCode uniqueness
    let attempts = 0;
    while (attempts < 5) {
      const existing = await db.classroom.findUnique({ where: { joinCode } });
      if (!existing) break;
      joinCode = this.generateJoinCode();
      attempts++;
    }

    return db.classroom.create({
      data: {
        name,
        joinCode,
        teacherId,
        trackId: trackId || null,
      },
      include: {
        track: {
          select: { id: true, title: true }
        }
      }
    });
  }

  /**
   * Retrieves all classrooms taught by the user.
   */
  async getClassroomsForTeacher(teacherId: string) {
    const classrooms = await db.classroom.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'desc' },
      include: {
        track: {
          select: { id: true, title: true, icon: true }
        },
        _count: {
          select: { members: true }
        }
      }
    });

    return classrooms.map((c) => ({
      id: c.id,
      name: c.name,
      joinCode: c.joinCode,
      track: c.track,
      studentCount: c._count.members,
      createdAt: c.createdAt,
    }));
  }

  /**
   * Enrolls a student in a classroom using the join code.
   */
  async joinClassroom(userId: string, joinCode: string) {
    const normalizedCode = joinCode.trim().toUpperCase();
    const classroom = await db.classroom.findUnique({
      where: { joinCode: normalizedCode },
    });

    if (!classroom) {
      throw new Error('Classroom not found. Please check the code.');
    }

    // Check if already a member
    const existing = await db.classroomMember.findUnique({
      where: {
        classroomId_userId: {
          classroomId: classroom.id,
          userId,
        }
      }
    });

    if (existing) {
      return { success: true, alreadyMember: true, classroom };
    }

    const member = await db.classroomMember.create({
      data: {
        classroomId: classroom.id,
        userId,
        role: 'STUDENT',
      }
    });

    return { success: true, alreadyMember: false, classroom, member };
  }

  /**
   * Retrieves detailed classroom roster and student progress.
   */
  async getClassroomDetails(classroomId: string, requesterId: string) {
    const classroom = await db.classroom.findUnique({
      where: { id: classroomId },
      include: {
        teacher: {
          select: { id: true, name: true, email: true }
        },
        track: {
          select: { id: true, title: true, slug: true }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
                xp: true,
                streak: true,
                progress: {
                  select: { lessonId: true, completed: true }
                }
              }
            }
          }
        }
      }
    });

    if (!classroom) return null;

    // Check authorization: teacher or enrolled member
    const isTeacher = classroom.teacherId === requesterId;
    const isMember = classroom.members.some((m) => m.userId === requesterId);

    if (!isTeacher && !isMember) {
      throw new Error('Unauthorized');
    }

    const students = classroom.members.map((m) => {
      const u = m.user;
      const completedLessons = u.progress.filter((p) => p.completed).length;
      return {
        id: u.id,
        name: u.name || 'Student',
        email: u.email,
        avatarUrl: u.avatarUrl,
        xp: u.xp,
        streak: u.streak,
        completedLessons,
        joinedAt: m.joinedAt,
      };
    });

    return {
      id: classroom.id,
      name: classroom.name,
      joinCode: classroom.joinCode,
      teacher: classroom.teacher,
      track: classroom.track,
      studentCount: students.length,
      students,
    };
  }
}

export const classroomService = new ClassroomService();
