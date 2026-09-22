import type { PhasedMissionOut } from "@/lib/ai/types";
import reviewedSample from "./generated-loop-preview.json";

/** The reviewed second traffic lesson is available even if the AI service is down. */
export function pedestrianTrafficFallback(id: string): PhasedMissionOut {
  return {
    ...reviewedSample.data,
    id,
    source: "template",
    validated: true,
  } as unknown as PhasedMissionOut;
}
