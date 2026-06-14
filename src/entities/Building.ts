// Oi mate! This is a coo!
import Phaser from 'phaser';
import { TEXTURE_KEYS } from '../assets';
import { BUILDING_CONFIG, UNIT_CONFIG } from '../config/balance';
import type { BuildingKind, Faction, Point, UnitKind } from '../types';
import { Entity } from './Entity';

export interface TrainingQueue {
  unitKind: UnitKind;
  elapsed: number;
  total: number;
}

export class Building extends Entity {
  readonly kind: BuildingKind;
  readonly width: number;
  readonly height: number;
  built: boolean;
  buildProgress: number;
  queue?: TrainingQueue;
  private sprite: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    kind: BuildingKind,
    faction: Faction,
    x: number,
    y: number,
    built = true
  ) {
    const config = BUILDING_CONFIG[kind];
    super(scene, faction, x, y, config.hp);
    this.kind = kind;
    this.width = config.width;
    this.height = config.height;
    this.built = built;
    this.buildProgress = built ? 1 : 0.1;
    this.hp = built ? this.maxHp : this.maxHp * this.buildProgress;

    this.sprite = scene.add.image(0, 0, this.textureFor());
    this.sprite.setDisplaySize(this.width, this.height);
    this.container.addAt(this.sprite, 0);
    this.container.setDepth(this.y);
    this.refreshVisual();
  }

  get label(): string {
    return BUILDING_CONFIG[this.kind].label;
  }

  get portraitTexture(): string {
    return this.textureFor();
  }

  get trains(): UnitKind[] {
    return BUILDING_CONFIG[this.kind].trains;
  }

  get populationProvided(): number {
    return this.built ? BUILDING_CONFIG[this.kind].population : 0;
  }

  containsPoint(point: Point): boolean {
    return (
      point.x >= this.x - this.width / 2 &&
      point.x <= this.x + this.width / 2 &&
      point.y >= this.y - this.height / 2 &&
      point.y <= this.y + this.height / 2
    );
  }

  startTraining(unitKind: UnitKind): void {
    this.queue = {
      unitKind,
      elapsed: 0,
      total: UNIT_CONFIG[unitKind].trainSeconds
    };
    this.refreshVisual();
  }

  updateProduction(deltaSeconds: number): UnitKind | undefined {
    if (!this.built || !this.queue) {
      return undefined;
    }

    this.queue.elapsed += deltaSeconds;
    if (this.queue.elapsed >= this.queue.total) {
      const unitKind = this.queue.unitKind;
      this.queue = undefined;
      this.refreshVisual();
      return unitKind;
    }

    this.refreshVisual();
    return undefined;
  }

  advanceConstruction(deltaSeconds: number): void {
    if (this.built) {
      return;
    }

    const buildSeconds = BUILDING_CONFIG[this.kind].buildSeconds;
    this.buildProgress = Phaser.Math.Clamp(this.buildProgress + deltaSeconds / buildSeconds, 0.1, 1);
    this.hp = Math.max(this.hp, this.maxHp * this.buildProgress);
    if (this.buildProgress >= 1) {
      this.built = true;
      this.hp = this.maxHp;
    }
    this.refreshVisual();
  }

  refreshVisual(): void {
    const g = this.overlay;
    g.clear();
    this.container.setDepth(this.y + this.height / 2);

    this.sprite.setAlpha(this.built ? 1 : 0.62);
    if (!this.built) {
      this.sprite.setTint(this.faction === 'pigeon' ? 0x89c3ff : 0xf1c58f);
    } else {
      this.sprite.clearTint();
    }

    if (this.selected) {
      g.lineStyle(3, this.selectionColour(), 0.95);
      g.strokeRoundedRect(-this.width / 2 - 5, -this.height / 2 - 5, this.width + 10, this.height + 10, 5);
    }

    if (!this.built) {
      g.fillStyle(0x11151c, 0.85);
      g.fillRoundedRect(-this.width / 2, this.height / 2 + 8, this.width, 7, 2);
      g.fillStyle(0xd9b247, 0.95);
      g.fillRoundedRect(-this.width / 2 + 1, this.height / 2 + 9, (this.width - 2) * this.buildProgress, 5, 2);
    }

    if (this.queue) {
      const pct = Phaser.Math.Clamp(this.queue.elapsed / this.queue.total, 0, 1);
      g.fillStyle(0x11151c, 0.85);
      g.fillRoundedRect(-this.width / 2, -this.height / 2 - 18, this.width, 6, 1);
      g.fillStyle(0x69d3ff, 0.95);
      g.fillRoundedRect(-this.width / 2 + 1, -this.height / 2 - 17, (this.width - 2) * pct, 4, 1);
    }

    this.drawHealth(Math.max(52, this.width * 0.65), -this.height / 2 - 10);
  }

  private textureFor(): string {
    if (this.kind === 'birdbath') {
      return this.faction === 'pigeon' ? TEXTURE_KEYS.pigeonBirdbath : TEXTURE_KEYS.magpieBirdbath;
    }

    if (this.kind === 'branchBarracks') {
      return this.faction === 'pigeon' ? TEXTURE_KEYS.pigeonBarracks : TEXTURE_KEYS.magpieBarracks;
    }

    return this.faction === 'pigeon' ? TEXTURE_KEYS.pigeonNest : TEXTURE_KEYS.magpieNest;
  }
}
