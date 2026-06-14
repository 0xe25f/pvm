// Oi mate! This is a coo!
import { createStore, type Content } from 'tinybase';
import { createLocalPersister, type LocalPersister } from 'tinybase/persisters/persister-browser';
import type { BuildingKind, Faction, Point, ResourceKind, Stockpile, UnitKind, UnitState } from '../types';

export interface GameSettings {
  musicEnabled: boolean;
  musicVolume: number;
  edgeScrollEnabled: boolean;
}

export interface SavedTrainingQueue {
  unitKind: UnitKind;
  elapsed: number;
  total: number;
}

export interface SavedBuildingState {
  kind: BuildingKind;
  faction: Faction;
  x: number;
  y: number;
  hp: number;
  built: boolean;
  buildProgress: number;
  queue?: SavedTrainingQueue;
}

export interface SavedResourceState {
  kind: ResourceKind;
  x: number;
  y: number;
  amount: number;
  maxAmount: number;
}

export interface SavedUnitState {
  kind: UnitKind;
  faction: Faction;
  x: number;
  y: number;
  hp: number;
  state: UnitState;
  targetPoint?: Point;
  targetUnitIndex?: number;
  targetBuildingIndex?: number;
  gatherNodeIndex?: number;
  buildTargetIndex?: number;
  carrying?: {
    kind: ResourceKind;
    amount: number;
  };
  homePost: Point;
}

export interface SavedLevelState {
  version: 1;
  savedAt: number;
  title: string;
  elapsedSeconds: number;
  resources: Record<Faction, Stockpile>;
  camera: Point;
  gameOver?: 'win' | 'lose';
  buildings: SavedBuildingState[];
  nodes: SavedResourceState[];
  units: SavedUnitState[];
}

export interface SaveSummary {
  slotId: string;
  title: string;
  savedAt: number;
  elapsedSeconds: number;
}

const STORAGE_NAME = 'pigeons-vs-magpies-local-state-v1';
const SAVE_SLOT = 'slot1';

const DEFAULT_SETTINGS: GameSettings = {
  musicEnabled: true,
  musicVolume: 0.28,
  edgeScrollEnabled: true
};

const defaultContent = (): Content => [
  {
    settings: {
      player: { ...DEFAULT_SETTINGS }
    },
    saves: {}
  },
  {}
];

export const gameStore = createStore().setTablesSchema({
  settings: {
    musicEnabled: { type: 'boolean', default: DEFAULT_SETTINGS.musicEnabled },
    musicVolume: { type: 'number', default: DEFAULT_SETTINGS.musicVolume },
    edgeScrollEnabled: { type: 'boolean', default: DEFAULT_SETTINGS.edgeScrollEnabled }
  },
  saves: {
    title: { type: 'string' },
    savedAt: { type: 'number' },
    elapsedSeconds: { type: 'number' },
    snapshot: { type: 'object' }
  }
});

let persister: LocalPersister | undefined;
let readyPromise: Promise<void> | undefined;

export async function initPersistence(): Promise<void> {
  if (!readyPromise) {
    persister = createLocalPersister(gameStore, STORAGE_NAME, (error) => {
      if (import.meta.env.DEV) {
        console.warn('TinyBase persistence ignored an error:', error);
      }
    });
    readyPromise = persister.startAutoPersisting(defaultContent()).then(() => {
      ensureSettingsRow();
    });
  }
  await readyPromise;
}

export function getSettings(): GameSettings {
  ensureSettingsRow();
  const row = gameStore.getRow('settings', 'player');
  return {
    musicEnabled: Boolean(row.musicEnabled),
    musicVolume: Number(row.musicVolume ?? DEFAULT_SETTINGS.musicVolume),
    edgeScrollEnabled: Boolean(row.edgeScrollEnabled ?? DEFAULT_SETTINGS.edgeScrollEnabled)
  };
}

export async function updateSettings(partial: Partial<GameSettings>): Promise<GameSettings> {
  ensureSettingsRow();
  for (const [key, value] of Object.entries(partial) as Array<[keyof GameSettings, GameSettings[keyof GameSettings]]>) {
    gameStore.setCell('settings', 'player', key, value);
  }
  await persister?.save();
  return getSettings();
}

export async function saveLevelState(snapshot: SavedLevelState, slotId = SAVE_SLOT): Promise<SaveSummary> {
  const row = {
    title: snapshot.title,
    savedAt: snapshot.savedAt,
    elapsedSeconds: snapshot.elapsedSeconds,
    snapshot: snapshot as unknown as Record<string, unknown>
  };
  gameStore.setRow('saves', slotId, row);
  await persister?.save();
  return {
    slotId,
    title: snapshot.title,
    savedAt: snapshot.savedAt,
    elapsedSeconds: snapshot.elapsedSeconds
  };
}

export function loadLevelState(slotId = SAVE_SLOT): SavedLevelState | undefined {
  const snapshot = gameStore.getCell('saves', slotId, 'snapshot') as SavedLevelState | undefined;
  return snapshot?.version === 1 ? snapshot : undefined;
}

export function getSaveSummary(slotId = SAVE_SLOT): SaveSummary | undefined {
  if (!gameStore.hasRow('saves', slotId)) {
    return undefined;
  }

  return {
    slotId,
    title: String(gameStore.getCell('saves', slotId, 'title') ?? 'Saved Game'),
    savedAt: Number(gameStore.getCell('saves', slotId, 'savedAt') ?? 0),
    elapsedSeconds: Number(gameStore.getCell('saves', slotId, 'elapsedSeconds') ?? 0)
  };
}

export function hasSavedGame(slotId = SAVE_SLOT): boolean {
  return Boolean(loadLevelState(slotId));
}

function ensureSettingsRow(): void {
  if (!gameStore.hasRow('settings', 'player')) {
    gameStore.setRow('settings', 'player', { ...DEFAULT_SETTINGS });
    return;
  }

  const row = gameStore.getRow('settings', 'player');
  const missing: Partial<GameSettings> = {};
  if (row.musicEnabled === undefined) {
    missing.musicEnabled = DEFAULT_SETTINGS.musicEnabled;
  }
  if (row.musicVolume === undefined) {
    missing.musicVolume = DEFAULT_SETTINGS.musicVolume;
  }
  if (row.edgeScrollEnabled === undefined) {
    missing.edgeScrollEnabled = DEFAULT_SETTINGS.edgeScrollEnabled;
  }
  if (Object.keys(missing).length > 0) {
    gameStore.setPartialRow('settings', 'player', missing);
  }
}
