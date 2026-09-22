export const trafficVehicleSprites = {
  coach: {
    nw: "/assets/traffic-v2/vehicles/all-directions/coach-nw.webp",
    ne: "/assets/traffic-v2/vehicles/all-directions/coach-ne.webp",
    se: "/assets/traffic-v2/vehicles/all-directions/coach-se.webp",
    sw: "/assets/traffic-v2/vehicles/all-directions/coach-sw.webp",
  },
  sedan: {
    nw: "/assets/traffic-v2/vehicles/all-directions/sedan-nw.webp",
    ne: "/assets/traffic-v2/vehicles/all-directions/sedan-ne.webp",
    se: "/assets/traffic-v2/vehicles/all-directions/sedan-se.webp",
    sw: "/assets/traffic-v2/vehicles/all-directions/sedan-sw.webp",
  },
  minibus: {
    nw: "/assets/traffic-v2/vehicles/all-directions/minibus-nw.webp",
    ne: "/assets/traffic-v2/vehicles/all-directions/minibus-ne.webp",
    se: "/assets/traffic-v2/vehicles/all-directions/minibus-se.webp",
    sw: "/assets/traffic-v2/vehicles/all-directions/minibus-sw.webp",
  },
  taxi: {
    nw: "/assets/traffic-v2/vehicles/all-directions/taxi-nw.webp",
    ne: "/assets/traffic-v2/vehicles/all-directions/taxi-ne.webp",
    se: "/assets/traffic-v2/vehicles/all-directions/taxi-se.webp",
    sw: "/assets/traffic-v2/vehicles/all-directions/taxi-sw.webp",
  },
  tuktuk: {
    nw: "/assets/traffic-v2/vehicles/all-directions/tuktuk-nw.webp",
    ne: "/assets/traffic-v2/vehicles/all-directions/tuktuk-ne.webp",
    se: "/assets/traffic-v2/vehicles/all-directions/tuktuk-se.webp",
    sw: "/assets/traffic-v2/vehicles/all-directions/tuktuk-sw.webp",
  },
} as const;

export type TrafficDirection = keyof (typeof trafficVehicleSprites)["taxi"];
