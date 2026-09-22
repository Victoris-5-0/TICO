export const trafficPedestrianWalkCycles = {
  "young-man": "/assets/traffic-v2/characters/walk-cycles/young-man-walk-sheet.webp",
  "elderly-woman": "/assets/traffic-v2/characters/walk-cycles/elderly-woman-walk-sheet.webp",
  "hijabi-woman": "/assets/traffic-v2/characters/walk-cycles/hijabi-woman-walk-sheet.webp",
  "cap-man": "/assets/traffic-v2/characters/walk-cycles/cap-man-walk-sheet.webp",
} as const;

export type TrafficPedestrianId = keyof typeof trafficPedestrianWalkCycles;

export const trafficWalkCycle = {
  columns: 3,
  rows: 2,
  frames: 6,
  direction: "southwest",
} as const;
