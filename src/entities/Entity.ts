// Oi mate! This is a coo!
import Phaser from 'phaser';
import type { Faction, Point } from '../types';

let nextEntityId = 1;

export abstract class Entity {
  readonly id = nextEntityId++;
  readonly scene: Phaser.Scene;
  readonly faction: Faction;
  readonly maxHp: number;
  hp: number;
  x: number;
  y: number;
  selected = false;
  alive = true;
  container: Phaser.GameObjects.Container;
  protected overlay: Phaser.GameObjects.Graphics;

  protected constructor(scene: Phaser.Scene, faction: Faction, x: number, y: number, maxHp: number) {
    this.scene = scene;
    this.faction = faction;
    this.x = x;
    this.y = y;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.container = scene.add.container(x, y);
    this.overlay = scene.add.graphics();
    this.container.add(this.overlay);
  }

  abstract get label(): string;
  abstract get portraitTexture(): string;
  abstract containsPoint(point: Point): boolean;
  abstract refreshVisual(): void;

  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.container.setPosition(x, y);
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.refreshVisual();
  }

  get position(): Point {
    return { x: this.x, y: this.y };
  }

  takeDamage(amount: number): void {
    if (!this.alive) {
      return;
    }
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.alive = false;
      this.selected = false;
      this.container.setAlpha(0.35);
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        duration: 700,
        onComplete: () => this.container.destroy()
      });
    }
    this.refreshVisual();
  }

  protected drawHealth(width: number, y: number): void {
    if (!this.selected && this.hp >= this.maxHp) {
      return;
    }

    const pct = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.overlay.fillStyle(0x11151c, 0.85);
    this.overlay.fillRoundedRect(-width / 2, y, width, 5, 1);
    this.overlay.fillStyle(pct > 0.5 ? 0x63d56f : pct > 0.25 ? 0xd9b247 : 0xdf6057, 0.95);
    this.overlay.fillRoundedRect(-width / 2 + 1, y + 1, (width - 2) * pct, 3, 1);
  }

  protected selectionColour(): number {
    return this.faction === 'pigeon' ? 0x69d3ff : 0xffb05e;
  }
}
