// Oi mate! This is a coo!
import { AI } from '../config/balance';
import type { UnitKind } from '../types';
import type { Building } from '../entities/Building';
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

    this.level.resources.magpie.crumbs += AI.resourceTrickle.crumbs * deltaSeconds;
    this.level.resources.magpie.twigs += AI.resourceTrickle.twigs * deltaSeconds;

    this.keepWorkersGathering();
    this.keepTraining();
    this.launchWaveWhenReady();
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
