// Oi mate! This is a coo!
import Phaser from 'phaser';
import { TEXTURE_KEYS } from '../assets';
import { BUILDING_CONFIG, COMBAT, RESOURCE_CONFIG, UNIT_CONFIG } from '../config/balance';
import type { Faction, Point, ResourceKind, UnitKind, UnitState } from '../types';
import { distance, normalise } from '../utils/math';
import type { Building } from './Building';
import { Entity } from './Entity';
import type { ResourceNode } from './ResourceNode';
import type { LevelScene } from '../scenes/LevelScene';

export type AttackTarget = Unit | Building;

export class Unit extends Entity {
  readonly kind: UnitKind;
  state: UnitState = 'idle';
  targetPoint?: Point;
  targetEntity?: AttackTarget;
  gatherNode?: ResourceNode;
  buildTarget?: Building;
  carrying?: {
    kind: ResourceKind;
    amount: number;
  };
  homePost: Point;
  private gatherElapsed = 0;
  private attackElapsed = 0;
  private sprite: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, kind: UnitKind, faction: Faction, x: number, y: number) {
    const config = UNIT_CONFIG[kind];
    super(scene, faction, x, y, config.hp);
    this.kind = kind;
    this.homePost = { x, y };

    this.sprite = scene.add.image(0, 0, this.textureFor());
    const scale = kind === 'poopBomber' ? 48 : 42;
    this.sprite.setDisplaySize(scale, scale);
    this.container.addAt(this.sprite, 0);
    this.container.setDepth(this.y);
    this.refreshVisual();
  }

  get label(): string {
    return UNIT_CONFIG[this.kind].label;
  }

  get portraitTexture(): string {
    return this.textureFor();
  }

  get speed(): number {
    return UNIT_CONFIG[this.kind].speed;
  }

  get isCombatUnit(): boolean {
    return UNIT_CONFIG[this.kind].combat;
  }

  get radius(): number {
    return 17;
  }

  containsPoint(point: Point): boolean {
    return distance(this.position, point) <= this.radius + 8;
  }

  moveTo(point: Point): void {
    if (!this.alive) {
      return;
    }
    this.state = 'moving';
    this.targetPoint = point;
    this.targetEntity = undefined;
    this.gatherNode = undefined;
    this.buildTarget = undefined;
    this.gatherElapsed = 0;
  }

  attack(target: AttackTarget): void {
    if (!this.alive || target.faction === this.faction) {
      return;
    }
    this.state = 'attacking';
    this.targetEntity = target;
    this.targetPoint = undefined;
    this.gatherNode = undefined;
    this.buildTarget = undefined;
  }

  gather(node: ResourceNode): void {
    if (!this.alive || this.kind !== 'forager') {
      return;
    }
    this.state = this.carrying ? 'returning' : 'gathering';
    this.gatherNode = node;
    this.targetEntity = undefined;
    this.targetPoint = undefined;
    this.buildTarget = undefined;
    this.gatherElapsed = 0;
  }

  build(building: Building): void {
    if (!this.alive || this.kind !== 'forager') {
      return;
    }
    this.state = 'building';
    this.buildTarget = building;
    this.targetPoint = undefined;
    this.targetEntity = undefined;
    this.gatherNode = undefined;
    this.gatherElapsed = 0;
  }

  stop(): void {
    this.state = 'idle';
    this.targetPoint = undefined;
    this.targetEntity = undefined;
    this.gatherNode = undefined;
    this.buildTarget = undefined;
    this.gatherElapsed = 0;
  }

  update(deltaSeconds: number, level: LevelScene): void {
    if (!this.alive) {
      return;
    }

    this.attackElapsed += deltaSeconds;

    if (this.state === 'idle' && this.isCombatUnit) {
      const target = level.findNearestEnemy(this, COMBAT.aggroRadius);
      if (target) {
        this.attack(target);
      }
    }

    if (this.state === 'moving') {
      if (!this.targetPoint || this.moveTowards(this.targetPoint, deltaSeconds, 4, level)) {
        this.stop();
      }
    } else if (this.state === 'gathering') {
      this.updateGathering(deltaSeconds, level);
    } else if (this.state === 'returning') {
      this.updateReturning(deltaSeconds, level);
    } else if (this.state === 'building') {
      this.updateBuilding(deltaSeconds, level);
    } else if (this.state === 'attacking') {
      this.updateAttacking(deltaSeconds, level);
    }

    this.container.setDepth(this.y);
    this.refreshVisual();
  }

  refreshVisual(): void {
    const g = this.overlay;
    g.clear();

    if (this.selected) {
      g.lineStyle(2, this.selectionColour(), 0.95);
      g.strokeEllipse(0, 11, 38, 17);
    }

    if (this.carrying) {
      g.fillStyle(this.carrying.kind === 'crumbs' ? 0xe8c46b : 0x8fd47a, 1);
      g.fillCircle(13, -10, 4);
    }

    if (this.state === 'attacking') {
      g.fillStyle(this.faction === 'pigeon' ? 0x69d3ff : 0xffb05e, 0.75);
      g.fillTriangle(-5, -22, 5, -22, 0, -28);
    }

    this.drawHealth(34, -27);
  }

  private updateGathering(deltaSeconds: number, level: LevelScene): void {
    if (!this.gatherNode || this.gatherNode.amount <= 0) {
      this.stop();
      return;
    }

    if (!this.moveTowards(this.gatherNode.position, deltaSeconds, this.gatherNode.radius + 8, level)) {
      return;
    }

    this.gatherElapsed += deltaSeconds;
    const config = RESOURCE_CONFIG[this.gatherNode.kind];
    if (this.gatherElapsed >= config.gatherSeconds) {
      const amount = this.gatherNode.harvest(config.carry);
      if (amount <= 0) {
        this.stop();
        return;
      }
      this.carrying = {
        kind: this.gatherNode.kind,
        amount
      };
      this.gatherElapsed = 0;
      this.state = 'returning';
      level.pruneEmptyNodes();
    }
  }

  private updateReturning(deltaSeconds: number, level: LevelScene): void {
    if (!this.carrying) {
      this.state = this.gatherNode ? 'gathering' : 'idle';
      return;
    }

    const home = level.findNearestDropOff(this.faction, this.position);
    if (!home) {
      this.stop();
      return;
    }

    const dropOffPoint = level.getBuildingApproachPoint(home, this.position, this.radius + 8);
    if (this.moveTowards(dropOffPoint, deltaSeconds, 6, level, home)) {
      level.deposit(this.faction, this.carrying.kind, this.carrying.amount);
      this.carrying = undefined;
      this.state = this.gatherNode && this.gatherNode.amount > 0 ? 'gathering' : 'idle';
    }
  }

  private updateBuilding(deltaSeconds: number, level: LevelScene): void {
    if (!this.buildTarget || !this.buildTarget.alive) {
      this.stop();
      return;
    }

    const buildPoint = level.getBuildingApproachPoint(this.buildTarget, this.position, this.radius + 10);
    if (!this.moveTowards(buildPoint, deltaSeconds, 6, level, this.buildTarget)) {
      return;
    }

    this.buildTarget.advanceConstruction(deltaSeconds);
    if (this.buildTarget.built) {
      this.stop();
    }
  }

  private updateAttacking(deltaSeconds: number, level: LevelScene): void {
    const target = this.targetEntity;
    if (!target || !target.alive) {
      this.stop();
      return;
    }

    const config = UNIT_CONFIG[this.kind];
    const currentDistance = distance(this.position, target.position);
    if (currentDistance > COMBAT.aggroRadius * COMBAT.leashMultiplier && this.isCombatUnit) {
      this.moveTo(this.homePost);
      return;
    }

    const targetPadding = target instanceof Unit ? target.radius : Math.max(target.width, target.height) / 2;
    const range = config.range + targetPadding;
    if (currentDistance > range) {
      this.moveTowards(target.position, deltaSeconds, range - 4, level, target instanceof Unit ? undefined : target);
      return;
    }

    if (this.attackElapsed >= config.cooldown) {
      this.attackElapsed = 0;
      target.takeDamage(config.damage);
      level.addHitEffect(this.position, target.position, Boolean(config.ranged));
    }
  }

  private moveTowards(
    point: Point,
    deltaSeconds: number,
    stopDistance: number,
    level?: LevelScene,
    ignoreBuilding?: Building
  ): boolean {
    const waypoint = level?.getMovementWaypoint(this.position, point, this.radius, ignoreBuilding);
    const activeTarget = waypoint ?? point;
    const activeStopDistance = waypoint ? 5 : stopDistance;
    const dx = activeTarget.x - this.x;
    const dy = activeTarget.y - this.y;
    const length = Math.hypot(dx, dy);
    if (length <= activeStopDistance) {
      return !waypoint;
    }

    const dir = normalise(dx, dy);
    const step = Math.min(length - activeStopDistance, this.speed * deltaSeconds);
    const next = level?.resolveUnitBuildingOverlap(
      this,
      {
        x: this.x + dir.x * step,
        y: this.y + dir.y * step
      },
      ignoreBuilding
    ) ?? {
      x: this.x + dir.x * step,
      y: this.y + dir.y * step
    };
    this.setPosition(next.x, next.y);
    if (Math.abs(dir.x) > 0.05) {
      this.sprite.setFlipX(dir.x < 0);
    }
    return false;
  }

  private textureFor(): string {
    if (this.faction === 'pigeon') {
      if (this.kind === 'poopBomber') {
        return TEXTURE_KEYS.pigeonBomber;
      }
      if (this.kind === 'pecker') {
        return TEXTURE_KEYS.pigeonPecker;
      }
      return TEXTURE_KEYS.pigeonForager;
    }

    if (this.kind === 'poopBomber') {
      return TEXTURE_KEYS.magpieBomber;
    }
    if (this.kind === 'pecker') {
      return TEXTURE_KEYS.magpiePecker;
    }
    return TEXTURE_KEYS.magpieForager;
  }
}
