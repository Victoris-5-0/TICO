/**
 * The ElevenLabs calls the recording scripts share.
 *
 * Two scripts record audio — `generate-mission-audio.ts` for the pinned missions and
 * `generate-tour-audio.ts` for the opening tour — and they must agree on the voice, the
 * model and the output format, or the same child hears two narrators. So the choice is
 * made once, here.
 *
 * ## The voice
 *
 * Sarah is a premade voice, usable on the free tier. Library voices are not, however they
 * were added to the account: every Arabic-native voice ElevenLabs offers (Fatima, Mona,
 * Haneen, Sara, …) is a library voice and the API answers `402 paid_plan_required` for all
 * of them on a free key. The premade voices verified for Arabic are Sarah, Laura, Alice,
 * Matilda and Jessica; Sarah was chosen by ear on 2026-09-15. Override with
 * `ELEVENLABS_VOICE_ID`.
 */

export const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL";
export const MODEL = "eleven_multilingual_v2";
const API = "https://api.elevenlabs.io/v1";

export const voiceId = () => process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;

/**
 * The account has nothing left. Thrown as its own class because a recording script that
 * has been told to use up the quota wants to stop cleanly here, not crash.
 *
 * `remainingCharacters` cannot be relied on to predict it: the subscription counter lags
 * the credit ledger, and a run that it said had 107 characters left was refused with
 * "0 credits remaining".
 */
export class QuotaExceededError extends Error {}

/** What the account has left, so a run can stop before it fails halfway. */
export async function remainingCharacters(key: string): Promise<number | null> {
  try {
    const res = await fetch(`${API}/user/subscription`, { headers: { "xi-api-key": key } });
    if (!res.ok) return null;
    const body = (await res.json()) as { character_count?: number; character_limit?: number };
    if (typeof body.character_count !== "number" || typeof body.character_limit !== "number") return null;
    return body.character_limit - body.character_count;
  } catch {
    return null;
  }
}

export async function synthesise(key: string, voice: string, text: string): Promise<Buffer> {
  const res = await fetch(`${API}/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    if (detail.includes('"quota_exceeded"')) throw new QuotaExceededError(`${res.status}: ${detail.slice(0, 300)}`);
    // The one failure worth naming: a library voice on a free key looks like a bad
    // request until you read the body.
    if (res.status === 402) {
      throw new Error(
        `${res.status}: this voice needs a paid plan. Free keys can only use premade voices — ${detail.slice(0, 200)}`,
      );
    }
    throw new Error(`${res.status}: ${detail.slice(0, 300)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
