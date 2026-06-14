// Oi mate! This is a coo!
import Phaser from 'phaser';
import type { Point, ResourceKind } from '../types';
import { distance } from '../utils/math';

let nextNodeId = 1;

export class ResourceNode {
  readonly id = nextNodeId++;
  readonly scene: Phaser.Scene;
  readonly kind: ResourceKind;
  readonly maxAmount: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  amount: number;
  container: Phaser.GameObjects.Container;
  private graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, kind: ResourceKind, x: number, y: number, amount: number) {
    this.scene = scene;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.amount = amount;
    this.maxAmount = amount;
    this.radius = kind === 'crumbs' ? 34 : 30;
    this.container = scene.add.container(x, y);
    this.graphics = scene.add.graphics();
    this.container.add(this.graphics);
    this.refreshVisual();
  }

  get label(): string {
    return this.kind === 'crumbs' ? 'Picnic Blanket' : 'Bush';
  }

  get position(): Point {
    return { x: this.x, y: this.y };
  }

  containsPoint(point: Point): boolean {
    return distance(this.position, point) <= this.radius + 8;
  }

  harvest(amount: number): number {
    const taken = Math.min(this.amount, amount);
    this.amount -= taken;
    this.refreshVisual();
    if (this.amount <= 0) {
      this.container.destroy();
    }
    return taken;
  }

  refreshVisual(): void {
    const g = this.graphics;
    g.clear();

    if (this.kind === 'crumbs') {
      g.fillStyle(0x8d3331, 1);
      g.fillRoundedRect(-30, -21, 60, 42, 4);
      for (let x = -30; x < 30; x += 15) {
        for (let y = -21; y < 21; y += 14) {
          if (((x + y) / 7) % 2 === 0) {
            g.fillStyle(0xe7dbc6, 1);
            g.fillRect(x, y, 15, 14);
          }
        }
      }
      g.lineStyle(2, 0x5f211f, 1);
      g.strokeRoundedRect(-30, -21, 60, 42, 4);
      g.fillStyle(0xe6c46b, 1);
      for (let i = 0; i < 10; i += 1) {
        const angle = i * 1.7;
        g.fillCircle(Math.cos(angle) * 17, Math.sin(angle) * 10, 2);
      }
    } else {
      const clumps: Array<[number, number, number, number]> = [
        [-13, 3, 15, 0x3c743d],
        [12, 4, 14, 0x315f33],
        [0, -8, 17, 0x4f8548],
        [2, 12, 13, 0x386a36],
        [-4, 1, 12, 0x5b9650]
      ];
      for (const [x, y, r, colour] of clumps) {
        g.fillStyle(colour, 1);
        g.fillCircle(x, y, r);
      }
      g.fillStyle(0x6f4a2f, 1);
      g.fillRect(-3, 13, 6, 12);
    }

    const pct = Phaser.Math.Clamp(this.amount / this.maxAmount, 0, 1);
    g.fillStyle(0x11151c, 0.75);
    g.fillRoundedRect(-24, -this.radius - 12, 48, 5, 1);
    g.fillStyle(this.kind === 'crumbs' ? 0xe6c46b : 0x83d060, 0.95);
    g.fillRoundedRect(-23, -this.radius - 11, 46 * pct, 3, 1);
  }
}
