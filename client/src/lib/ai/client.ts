import {
  AnalyzeRequest, AnalyzeResponse,
  ApiError,
  ChallengeRequest,
  Envelope,
  PhasedMissionOut,
  GenerateMissionRequest, GenerateMissionResponse,
  HintRequest, HintResponse,
  NextMissionRequest,
  PlanRequest, PlanResponse,
  RefreshRequest, RefreshResponse,
  SessionClose,
  SessionCreate, SessionOut,
  SessionDebriefResponse,
  SessionPhaseUpdate,
} from './types';

/**
 * Thrown when the AI service answers with the documented error envelope.
 *
 * Carries `requestId`, which is the same id the Python service logged the failure
 * under — so a bug report from a classroom becomes a log query instead of a guess.
 */
export class AiServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly requestId: string,
    readonly retryable: boolean,
    readonly status: number,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AiServiceError';
  }
}

function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class AiClient {
  private baseUrl: string;

  constructor() {
    // Configuration only. There used to be a hardcoded EC2 host as a final fallback,
    // which meant a deploy with no `AI_SERVICE_URL` looked healthy while quietly talking
    // to whatever was at that address — including, after the box moved, nothing at all.
    // An empty value fails loudly in `fetchAi`, and every caller already has a fallback
    // path for an unreachable AI service.
    this.baseUrl = (process.env.AI_SERVICE_URL || process.env.AI_BACKEND_URL || '').replace(/\/+$/, '');
  }

  /** Is the service configured at all? Callers log this rather than guessing. */
  get configured(): boolean {
    return this.baseUrl.length > 0;
  }

  /**
   * Every call goes through here.
   *
   * Sends `X-Request-ID` (docs/06 requires it on all /v1 requests) and unwraps the
   * `{ data, meta }` envelope, so callers get the payload type directly. Errors come
   * back as `AiServiceError` carrying the code and request id rather than a bare
   * status number.
   */
  private async fetchAi<T>(path: string, token: string, body: unknown, requestId = newRequestId(), method: 'POST' | 'PATCH' = 'POST'): Promise<T> {
    if (!this.configured) {
      throw new AiServiceError('AI_SERVICE_URL is not set', 'NOT_CONFIGURED', requestId, false, 0);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Request-ID': requestId,
      },
      body: JSON.stringify(body),
      // AI calls sit in a student's interaction loop; 15s is already generous.
      signal: AbortSignal.timeout(15000),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const err = (payload as ApiError | null)?.error;
      throw new AiServiceError(
        err?.message ?? `AI service failed with status ${response.status}`,
        err?.code ?? 'unknown',
        err?.request_id ?? requestId,
        err?.retryable ?? response.status >= 500,
        response.status,
        err?.details ?? {},
      );
    }

    // Unwrap { data, meta }; tolerate a bare body so a stub or a proxy can't break us.
    const envelope = payload as Envelope<T> | T;
    return (envelope && typeof envelope === 'object' && 'data' in envelope)
      ? (envelope as Envelope<T>).data
      : (envelope as T);
  }

  async getHint(token: string, req: HintRequest): Promise<HintResponse> {
    return this.fetchAi<HintResponse>('/v1/hints', token, req);
  }

  async analyzeSubmission(token: string, req: AnalyzeRequest): Promise<AnalyzeResponse> {
    return this.fetchAi<AnalyzeResponse>('/v1/submissions/analyze', token, req);
  }

  async refreshStudent(token: string, studentId: string, req: RefreshRequest): Promise<RefreshResponse> {
    return this.fetchAi<RefreshResponse>(`/v1/students/${studentId}/refresh`, token, req);
  }

  async getStudentPlan(token: string, studentId: string, req: PlanRequest): Promise<PlanResponse> {
    return this.fetchAi<PlanResponse>(`/v1/students/${studentId}/plan`, token, req);
  }

  /** Decides what this student should play next. Contrast `generateMission`. */
  async getNextMission(token: string, req: NextMissionRequest): Promise<PhasedMissionOut> {
    return this.fetchAi<PhasedMissionOut>('/v1/missions/next', token, req);
  }

  async createSession(token: string, req: SessionCreate): Promise<SessionOut> {
    return this.fetchAi<SessionOut>('/v1/sessions', token, req);
  }

  async updateSessionPhase(token: string, sessionId: string, req: SessionPhaseUpdate): Promise<SessionOut> {
    return this.fetchAi<SessionOut>(`/v1/sessions/${sessionId}/phase`, token, req, newRequestId(), 'PATCH');
  }

  async closeSession(token: string, sessionId: string, req: SessionClose): Promise<SessionOut> {
    return this.fetchAi<SessionOut>(`/v1/sessions/${sessionId}/close`, token, req);
  }

  /** Builds a mission when you already know what you want. Contrast `getNextMission`. */
  async generateMission(token: string, req: GenerateMissionRequest): Promise<GenerateMissionResponse> {
    return this.fetchAi<GenerateMissionResponse>('/v1/missions/generate', token, req);
  }

  async getNextChallenge(token: string, req: ChallengeRequest): Promise<PhasedMissionOut> {
    return this.fetchAi<PhasedMissionOut>('/v1/challenges/next', token, req);
  }

  async getSessionDebrief(token: string, sessionId: string): Promise<SessionDebriefResponse> {
    return this.fetchAi<SessionDebriefResponse>(`/v1/sessions/${sessionId}/debrief`, token, {});
  }

  /**
   * TICO's chat. Returns the raw `Response` because this one streams SSE and is the
   * single endpoint that is never enveloped — read `delta` off each frame until `done`.
   *
   * TICO is the only companion. There was once a separate "mentor" endpoint here; it was
   * removed when TICO became the single mascot, and it never existed server-side.
   */
  async streamTicoMessage(token: string, body: unknown): Promise<Response> {
    if (!this.configured) {
      throw new AiServiceError('AI_SERVICE_URL is not set', 'NOT_CONFIGURED', newRequestId(), false, 0);
    }
    return fetch(`${this.baseUrl}/v1/tico/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Request-ID': newRequestId(),
      },
      body: JSON.stringify(body),
    });
  }

  async checkHealth(): Promise<{ reachable: boolean; status?: number; latencyMs?: number }> {
    const start = Date.now();
    if (!this.configured) return { reachable: false, latencyMs: 0 };
    try {
      // Note the /v1 prefix: every route on this service is versioned, health included.
      const res = await fetch(`${this.baseUrl}/v1/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return { reachable: res.ok, status: res.status, latencyMs: Date.now() - start };
    } catch {
      return { reachable: false, latencyMs: Date.now() - start };
    }
  }
}

export const aiClient = new AiClient();
