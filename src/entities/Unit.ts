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

// Path-following tuning: how close counts as "reached" for an intermediate waypoint, how far
// the goal must move before we recompute, and the periodic re-route interval (for moving
// targets or buildings raised mid-journey).
const PATH_NODE_REACH = 8;
const PATH_REPATH_DISTANCE = 28;
const PATH_REPATH_SECONDS = 0.5;

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
  private attackOrdered = false;
  private buildingActive = false;
  private gatherElapsed = 0;
  private attackElapsed = 0;
  private navPath: Point[] = [];
  private navGoal?: Point;
  private navRepathTimer = 0;
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
    this.clearPath();
  }

  // `ordered` distinguishes an explicit player/AI attack command (chase the target wherever
  // it goes) from an auto-acquired target picked up while idle (which leashes back to post).
  attack(target: AttackTarget, ordered = true): void {
    if (!this.alive || target.faction === this.faction) {
      return;
    }
    this.state = 'attacking';
    this.attackOrdered = ordered;
    this.targetEntity = target;
    this.targetPoint = undefined;
    this.gatherNode = undefined;
    this.buildTarget = undefined;
    this.clearPath();
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
    this.clearPath();
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
    this.clearPath();
  }

  stop(): void {
    this.state = 'idle';
    this.clearPath();
    this.targetPoint = undefined;
    this.targetEntity = undefined;
    this.gatherNode = undefined;
    this.buildTarget = undefined;
    this.gatherElapsed = 0;
    this.buildingActive = false;
  }

  update(deltaSeconds: number, level: LevelScene): void {
    if (!this.alive) {
      return;
    }

    this.attackElapsed += deltaSeconds;

    if (this.state === 'idle' && this.isCombatUnit) {
      const target = level.findNearestEnemy(this, COMBAT.aggroRadius);
      if (target) {
        // Guard the spot the unit is actually standing on, not its birth spawn, so the leash
        // pulls it back here after a short chase instead of fleeing across the map.
        this.homePost = { x: this.x, y: this.y };
        this.attack(target, false);
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

    // Gather progress: a bar above the head fills while the Forager is harvesting at a node
    // (gatherElapsed only ticks up once it has actually reached the node, not while walking).
    if (this.state === 'gathering' && this.gatherNode && this.gatherElapsed > 0) {
      const total = RESOURCE_CONFIG[this.gatherNode.kind].gatherSeconds;
      const colour = this.gatherNode.kind === 'crumbs' ? 0xe8c46b : 0x8fd47a;
      this.drawProgressBar(this.gatherElapsed / total, colour);
    }

    // Build progress: the same bar, driven by the building's construction progress, shown
    // only once the Forager is on site and actually building (not while walking there).
    if (this.state === 'building' && this.buildingActive && this.buildTarget) {
      this.drawProgressBar(this.buildTarget.buildProgress, 0xd9b247);
    }

    this.drawHealth(34, -27);
  }

  // Draws a small progress bar above the unit's head (used for gather and build progress).
  // Mirrors the building queue/health bars so it renders clearly above the sprite.
  private drawProgressBar(progress: number, colour: number): void {
    const g = this.overlay;
    const pct = Phaser.Math.Clamp(progress, 0, 1);
    const width = 32;
    const height = 7;
    const y = -38;
    g.fillStyle(0x05070a, 0.9);
    g.fillRoundedRect(-width / 2 - 1, y - 1, width + 2, height + 2, 2);
    g.fillStyle(0x11151c, 0.85);
    g.fillRoundedRect(-width / 2, y, width, height, 2);
    g.fillStyle(colour, 1);
    g.fillRoundedRect(-width / 2 + 1, y + 1, (width - 2) * pct, height - 2, 2);
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
      this.buildingActive = false;
      this.stop();
      return;
    }

    const buildPoint = level.getBuildingApproachPoint(this.buildTarget, this.position, this.radius + 10);
    if (!this.moveTowards(buildPoint, deltaSeconds, 6, level, this.buildTarget)) {
      this.buildingActive = false;
      return;
    }

    // The Forager has reached the site and is now actively constructing (drives the ring).
    this.buildingActive = true;
    this.buildTarget.advanceConstruction(deltaSeconds);
    if (this.buildTarget.built) {
      this.buildingActive = false;
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
    // Only auto-acquired targets leash: give up and return to post if the target strays
    // beyond 1.5x aggro from this unit's home post. Ordered attacks chase to the death.
    if (
      !this.attackOrdered &&
      this.isCombatUnit &&
      distance(this.homePost, target.position) > COMBAT.aggroRadius * COMBAT.leashMultiplier
    ) {
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
    // (Re)compute a route when the goal changes meaningfully, the cached path is exhausted, or
    // the periodic refresh fires (lets units re-route around buildings raised mid-journey and
    // keep chasing a moving target). When no level is provided, fall back to straight steering.
    this.navRepathTimer -= deltaSeconds;
    const goalMoved = !this.navGoal || distance(this.navGoal, point) > PATH_REPATH_DISTANCE;
    if (level && (goalMoved || this.navPath.length === 0 || this.navRepathTimer <= 0)) {
      this.navPath = level.requestPath(this.position, point, this.radius, ignoreBuilding);
      this.navGoal = { x: point.x, y: point.y };
      this.navRepathTimer = PATH_REPATH_SECONDS;
    }
    if (this.navPath.length === 0) {
      this.navPath = [point];
    }

    // Drop intermediate waypoints already reached; steer toward the next one.
    while (this.navPath.length > 1 && distance(this.position, this.navPath[0]) <= PATH_NODE_REACH) {
      this.navPath.shift();
    }
    const isFinal = this.navPath.length <= 1;
    const node = this.navPath[0];
    const reach = isFinal ? stopDistance : PATH_NODE_REACH;

    const dx = node.x - this.x;
    const dy = node.y - this.y;
    const length = Math.hypot(dx, dy);
    if (length <= reach) {
      if (isFinal) {
        return true;
      }
      this.navPath.shift();
      return false;
    }

    const dir = normalise(dx, dy);
    const step = Math.min(length - reach, this.speed * deltaSeconds);
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

  private clearPath(): void {
    this.navPath = [];
    this.navGoal = undefined;
    this.navRepathTimer = 0;
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
