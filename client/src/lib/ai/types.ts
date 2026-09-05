export interface HintRequest {
  sessionId: string;
  missionId: string;
  codeExcerpt: string;
  lastResult: 'PASSED' | 'FAILED' | 'ERROR' | 'TIMEOUT' | null;
  locale: string;
}

export interface HintResponse {
  rung: number;
  hint: string;
  cached: boolean;
}

export interface AnalyzeSubmissionRequest {
  sessionId: string;
  attemptNumber: number;
  code: string;
  errorOutput: string | null;
}

export interface AnalyzeSubmissionResponse {
  errorFamily: string;
  errorTag: string;
  confidence: number;
  feedbackKey: string;
}

export interface RefreshStudentRequest {
  watermark: string; // Latest submission or progress ID
}

export interface RefreshStudentResponse {
  masteryDeltas: Record<string, number>;
  reason: string;
}

export interface PlanStudentRequest {
  diagnostic: Record<string, unknown>; // Provisional
}

export interface PlanStudentResponse {
  requiredLessons: string[];
  optionalLessons: string[];
}

export interface NextMissionRequest {
  profileId: string;
  lessonId: string;
  worldManifestVersion: string;
}

export interface NextMissionResponse {
  missionId: string;
  isTemplateFallback: boolean;
  manifestVersion: string;
}

export interface CreateSessionRequest {
  learnerId: string;
  missionVersionId: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  scaffoldPlan: Record<string, unknown>;
}

export interface GenerateMissionRequest {
  lessonId?: string;
  concept?: string;
  worldManifestVersion?: string;
  scaffoldLevel?: 'NONE' | 'PARTIAL' | 'FULL';
  locale?: string;
}

export interface GenerateMissionResponse {
  missionId: string;
  title: string;
  instructions: string;
  starterCode: string;
  testCases: Array<{ input: string; expectedOutput: string; isHidden?: boolean }>;
  hints: string[];
  concepts: { primary: string; carried: string[] };
  scaffoldPlan?: Record<string, unknown>;
  validated: boolean;
  engineVersion: string;
}

export interface NextChallengeRequest {
  profileId?: string;
  worldSlug?: string;
}

export interface NextChallengeResponse {
  challengeId: string;
  title: string;
  instructions: string;
  starterCode: string;
  targetConcepts: string[];
  isUnscaffolded: boolean;
}

export interface SessionDebriefResponse {
  sessionId: string;
  outcome: string;
  totalAttempts: number;
  hintsUsed: number;
  errorsOvercome: string[];
  timeSpentMs: number;
  conceptsMastered: string[];
  ticoFeedback: string;
  starsEarned: number;
}
