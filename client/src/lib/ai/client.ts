import { 
  HintRequest, HintResponse, AnalyzeSubmissionRequest, AnalyzeSubmissionResponse,
  RefreshStudentRequest, RefreshStudentResponse, PlanStudentRequest, PlanStudentResponse,
  NextMissionRequest, NextMissionResponse, CreateSessionRequest, CreateSessionResponse,
  GenerateMissionRequest, GenerateMissionResponse, NextChallengeRequest, NextChallengeResponse,
  SessionDebriefResponse
} from './types';

export class AiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.AI_SERVICE_URL || process.env.AI_BACKEND_URL || 'http://localhost:8000';
  }

  private async fetchAi<T>(path: string, token: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body),
      // Adding a 15-second timeout via AbortController for AI boundaries
      signal: AbortSignal.timeout(15000), 
    });

    if (!response.ok) {
      throw new Error(`AI service failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.data || data; // Adapting to HTTP envelope if data exists
  }

  async getHint(token: string, req: HintRequest): Promise<HintResponse> {
    return this.fetchAi<HintResponse>('/v1/hints', token, req);
  }

  async analyzeSubmission(token: string, req: AnalyzeSubmissionRequest): Promise<AnalyzeSubmissionResponse> {
    return this.fetchAi<AnalyzeSubmissionResponse>('/v1/submissions/analyze', token, req);
  }

  async refreshStudent(token: string, studentId: string, req: RefreshStudentRequest): Promise<RefreshStudentResponse> {
    return this.fetchAi<RefreshStudentResponse>(`/v1/students/${studentId}/refresh`, token, req);
  }

  async getStudentPlan(token: string, studentId: string, req: PlanStudentRequest): Promise<PlanStudentResponse> {
    return this.fetchAi<PlanStudentResponse>(`/v1/students/${studentId}/plan`, token, req);
  }

  async getNextMission(token: string, req: NextMissionRequest): Promise<NextMissionResponse> {
    return this.fetchAi<NextMissionResponse>('/v1/missions/next', token, req);
  }

  async createSession(token: string, req: CreateSessionRequest): Promise<CreateSessionResponse> {
    return this.fetchAi<CreateSessionResponse>('/v1/sessions', token, req);
  }

  async generateMission(token: string, req: GenerateMissionRequest): Promise<GenerateMissionResponse> {
    return this.fetchAi<GenerateMissionResponse>('/v1/missions/generate', token, req);
  }

  async getNextChallenge(token: string, req: NextChallengeRequest): Promise<NextChallengeResponse> {
    return this.fetchAi<NextChallengeResponse>('/v1/challenges/next', token, req);
  }

  async getSessionDebrief(token: string, sessionId: string): Promise<SessionDebriefResponse> {
    return this.fetchAi<SessionDebriefResponse>(`/v1/sessions/${sessionId}/debrief`, token, {});
  }

  async streamMentorMessage(token: string, body: unknown): Promise<Response> {
    const url = `${this.baseUrl}/v1/mentor/messages`;
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body),
    });
  }

  async streamTicoMessage(token: string, body: unknown): Promise<Response> {
    const url = `${this.baseUrl}/v1/tico/messages`;
    
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body),
    });
  }

  async checkHealth(): Promise<{ reachable: boolean; status?: number; latencyMs?: number }> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return {
        reachable: res.ok || res.status === 404,
        status: res.status,
        latencyMs: Date.now() - start
      };
    } catch {
      return {
        reachable: false,
        latencyMs: Date.now() - start
      };
    }
  }
}

export const aiClient = new AiClient();
