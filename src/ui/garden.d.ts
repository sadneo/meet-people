export type GardenState = {
  balance: number;
  decor: {
    icon: string;
    name: string;
    cost: number;
    wx?: number;
    wy?: number;
  }[];
  day: number;
  connections: string[];
  blocked: string[];
  removedConnections: string[];
};
export const SkyGarden: {
  html: (state: GardenState) => string;
  mount: (state: GardenState) => void;
  dispose: () => void;
};
