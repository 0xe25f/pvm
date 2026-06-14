// Oi mate! This is a coo!
import type { BuildingKind, Cost, ResourceKind, UnitKind } from '../types';

export const WORLD = {
  width: 2000,
  height: 2000,
  grid: 50,
  cameraSpeed: 520,
  cameraEdge: 26
} as const;

export const STARTING_STOCKPILE = {
  crumbs: 220,
  twigs: 110
} as const;

export const POPULATION = {
  ceiling: 30,
  mainNest: 5,
  birdbath: 4
} as const;

export const RESOURCE_CONFIG: Record<
  ResourceKind,
  {
    label: string;
    carry: number;
    gatherSeconds: number;
  }
> = {
  crumbs: {
    label: 'Breadcrumbs',
    carry: 10,
    gatherSeconds: 2
  },
  twigs: {
    label: 'Twigs',
    carry: 8,
    gatherSeconds: 2.5
  }
};

export const UNIT_CONFIG: Record<
  UnitKind,
  {
    label: string;
    hp: number;
    damage: number;
    range: number;
    cooldown: number;
    speed: number;
    cost: Cost;
    trainSeconds: number;
    combat: boolean;
    ranged?: boolean;
  }
> = {
  forager: {
    label: 'Forager',
    hp: 30,
    damage: 2,
    range: 22,
    cooldown: 1,
    speed: 86,
    cost: { crumbs: 75, twigs: 0 },
    trainSeconds: 8,
    combat: false
  },
  pecker: {
    label: 'Pecker',
    hp: 60,
    damage: 8,
    range: 24,
    cooldown: 1,
    speed: 94,
    cost: { crumbs: 100, twigs: 0 },
    trainSeconds: 10,
    combat: true
  },
  poopBomber: {
    label: 'Poop-Bomber',
    hp: 40,
    damage: 6,
    range: 180,
    cooldown: 1.5,
    speed: 88,
    cost: { crumbs: 100, twigs: 25 },
    trainSeconds: 12,
    combat: true,
    ranged: true
  }
};

export const BUILDING_CONFIG: Record<
  BuildingKind,
  {
    label: string;
    width: number;
    height: number;
    hp: number;
    cost: Cost;
    buildSeconds: number;
    trains: UnitKind[];
    population: number;
  }
> = {
  mainNest: {
    label: 'Main Nest',
    width: 116,
    height: 106,
    hp: 600,
    cost: { crumbs: 400, twigs: 200 },
    buildSeconds: 60,
    trains: ['forager'],
    population: POPULATION.mainNest
  },
  birdbath: {
    label: 'Birdbath',
    width: 58,
    height: 58,
    hp: 150,
    cost: { crumbs: 0, twigs: 75 },
    buildSeconds: 15,
    trains: [],
    population: POPULATION.birdbath
  },
  branchBarracks: {
    label: 'Branch Barracks',
    width: 124,
    height: 108,
    hp: 400,
    cost: { crumbs: 150, twigs: 100 },
    buildSeconds: 30,
    trains: ['pecker', 'poopBomber'],
    population: 0
  }
};

export const COMBAT = {
  aggroRadius: 205,
  leashMultiplier: 1.5,
  defenceRadius: 300
} as const;

export const AI = {
  workerTarget: 4,
  firstWaveSeconds: 95,
  squadSize: 5,
  resourceTrickle: {
    crumbs: 2,
    twigs: 1
  }
} as const;

export const LEVEL_OBJECTIVE = 'Destroy every Magpie building.';
