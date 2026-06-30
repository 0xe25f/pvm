// Oi mate! This is a coo!
import { AI, BUILDING_CONFIG } from '../config/balance';
import type { BuildingKind, UnitKind } from '../types';
import type { Building } from '../entities/Building';
import type { Unit } from '../entities/Unit';
import type { LevelScene } from '../scenes/LevelScene';

export class AISystem {
  private elapsed = 0;
  private trainElapsed = 0;
  private waveLaunched = false;
  private nextCombat: UnitKind = 'pecker';

  constructor(private readonly level: LevelScene) {}

  update(deltaSeconds: number): void {
    if (this.level.isGameOver()) {
      return;
    }

    this.elapsed += deltaSeconds;
    this.trainElapsed += deltaSeconds;

    // CHEAT (per spec §7): the Magpie AI gets a flat resource trickle on top of what its
    // Foragers gather, so it can keep building/training without a clever economy. This is
    // the deliberate "AI cheats lightly rather than gaining complexity" allowance.
    this.level.resources.magpie.crumbs += AI.resourceTrickle.crumbs * deltaSeconds;
    this.level.resources.magpie.twigs += AI.resourceTrickle.twigs * deltaSeconds;

    this.keepWorkersGathering();
    this.maintainBase();
    this.keepTraining();
    this.launchWaveWhenReady();
  }

  // Rebuilds missing economy/production buildings in the spec §7 build order
  // (Birdbath → Branch Barracks). Without this, destroying the Magpie Barracks would
  // permanently stop its combat-unit production — an easy way to neutralise the opponent.
  // The Main Nest is intentionally NOT rebuilt: per spec, losing it collapses the economy.
  private maintainBase(): void {
    const nest = this.level.findPrimaryBuilding('magpie');
    if (!nest || nest.kind !== 'mainNest') {
      return;
    }

    const kind = this.nextBuildingToConstruct();
    if (!kind) {
      return;
    }

    const cost = BUILDING_CONFIG[kind].cost;
    if (this.level.resources.magpie.crumbs < cost.crumbs || this.level.resources.magpie.twigs < cost.twigs) {
      return;
    }

    const builder = this.pickBuilder();
    if (!builder) {
      return;
    }

    const spot = this.level.findBuildPlacement(kind, nest.position);
    if (!spot) {
      return;
    }

    this.level.startConstruction('magpie', kind, builder, spot);
  }

  private nextBuildingToConstruct(): BuildingKind | undefined {
    const has = (kind: BuildingKind): boolean =>
      this.level.buildings.some(
        (building) => building.alive && building.faction === 'magpie' && building.kind === kind
      );

    if (!has('birdbath')) {
      return 'birdbath';
    }
    if (!has('branchBarracks')) {
      return 'branchBarracks';
    }
    return undefined;
  }

  private pickBuilder(): Unit | undefined {
    const foragers = this.level.units.filter(
      (unit) => unit.alive && unit.faction === 'magpie' && unit.kind === 'forager' && unit.state !== 'building'
    );
    return foragers[0];
  }

  private keepWorkersGathering(): void {
    const workers = this.level.units.filter(
      (unit) => unit.alive && unit.faction === 'magpie' && unit.kind === 'forager'
    );
    const idleWorkers = workers.filter((unit) => unit.state === 'idle');

    for (const worker of idleWorkers) {
      const node = this.level.findNearestResource(worker.position, workers.indexOf(worker) % 2 === 0 ? 'crumbs' : 'twigs');
      if (node) {
        worker.gather(node);
      }
    }

    if (workers.length >= AI.workerTarget || this.trainElapsed < 4) {
      return;
    }

    const nest = this.findProduction('mainNest');
    if (nest) {
      this.level.tryTrain(nest, 'forager', true);
    }
  }

  private keepTraining(): void {
    if (this.trainElapsed < 2.5) {
      return;
    }
    this.trainElapsed = 0;

    const barracks = this.findProduction('branchBarracks');
    if (!barracks) {
      return;
    }

    const trained = this.level.tryTrain(barracks, this.nextCombat, true);
    if (trained) {
      this.nextCombat = this.nextCombat === 'pecker' ? 'poopBomber' : 'pecker';
    }
  }

  private launchWaveWhenReady(): void {
    if (this.elapsed < AI.firstWaveSeconds) {
      return;
    }

    const squad = this.level.units.filter(
      (unit) =>
        unit.alive &&
        unit.faction === 'magpie' &&
        unit.isCombatUnit &&
        (unit.state === 'idle' || unit.state === 'moving')
    );

    if (squad.length < AI.squadSize && this.waveLaunched) {
      return;
    }

    if (squad.length < AI.squadSize) {
      return;
    }

    const target = this.level.findPrimaryBuilding('pigeon');
    if (!target) {
      return;
    }

    for (const unit of squad.slice(0, AI.squadSize)) {
      unit.attack(target);
    }
    this.waveLaunched = true;
    this.elapsed = AI.firstWaveSeconds - 35;
  }

  private findProduction(kind: Building['kind']): Building | undefined {
    return this.level.buildings.find(
      (building) => building.alive && building.built && building.faction === 'magpie' && building.kind === kind
    );
  }
}
