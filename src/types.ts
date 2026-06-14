// Oi mate! This is a coo!
export type Faction = 'pigeon' | 'magpie';
export type ResourceKind = 'crumbs' | 'twigs';
export type UnitKind = 'forager' | 'pecker' | 'poopBomber';
export type BuildingKind = 'mainNest' | 'birdbath' | 'branchBarracks';

export type UnitState =
  | 'idle'
  | 'moving'
  | 'gathering'
  | 'returning'
  | 'attacking'
  | 'building'
  | 'dead';

export interface Point {
  x: number;
  y: number;
}

export interface Stockpile {
  crumbs: number;
  twigs: number;
}

export interface Cost {
  crumbs: number;
  twigs: number;
}

export interface HudCommand {
  id: string;
  label: string;
  iconTexture: string;
  enabled: boolean;
  detail: string;
}

export interface HudSelection {
  id: number;
  name: string;
  faction: Faction;
  hp: number;
  maxHp: number;
  portraitTexture: string;
  queueLabel?: string;
}

export interface HudSnapshot {
  resources: Stockpile;
  population: {
    used: number;
    cap: number;
  };
  elapsedSeconds: number;
  selected: HudSelection[];
  commands: HudCommand[];
  objective: string;
  message: string;
  paused?: boolean;
  pauseMenu?: {
    canLoad: boolean;
    saveLabel: string;
    musicEnabled: boolean;
  };
  gameOver?: 'win' | 'lose';
}

export const FACTION_NAMES: Record<Faction, string> = {
  pigeon: 'Pigeons',
  magpie: 'Magpies'
};
