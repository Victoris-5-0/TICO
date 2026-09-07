'use server';

import { requireUser, getAuthToken } from '@/lib/auth';
import { planService } from '@/services/plan.service';

export async function getStudentPlanAction() {
  try {
    const user = await requireUser();
    const plan = await planService.getStudentPlan(user.id);
    return { success: true, plan };
  } catch (error: unknown) {
    console.error('Failed to get student plan:', error);
    return { success: false, error: 'Failed to get student plan' };
  }
}

export async function buildStudentPlanAction(options?: { isBeginner?: boolean }) {
  try {
    const user = await requireUser();
    const token = await getAuthToken();
    const plan = await planService.buildStudentPlan(user.id, token, {
      isBeginner: options?.isBeginner ?? true,
    });
    return { success: true, plan };
  } catch (error: unknown) {
    console.error('Failed to build student plan:', error);
    return { success: false, error: 'Failed to build student plan' };
  }
}
