// Oi mate! This is a coo!
import type { Point } from '../types';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceSq(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function normalise(dx: number, dy: number): Point {
  const length = Math.hypot(dx, dy);
  if (length < 0.0001) {
    return { x: 0, y: 0 };
  }
  return { x: dx / length, y: dy / length };
}

export function gridSnap(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

export function spiralOffset(index: number, spacing = 34): Point {
  if (index === 0) {
    return { x: 0, y: 0 };
  }

  const ring = Math.ceil((Math.sqrt(index + 1) - 1) / 2);
  const side = ring * 2;
  const maxIndexInRing = (side + 1) * (side + 1) - 1;
  const offset = maxIndexInRing - index;
  const sideIndex = Math.floor(offset / side);
  const sideOffset = offset % side;

  let x = ring;
  let y = ring;

  if (sideIndex === 0) {
    x = ring - sideOffset;
    y = ring;
  } else if (sideIndex === 1) {
    x = -ring;
    y = ring - sideOffset;
  } else if (sideIndex === 2) {
    x = -ring + sideOffset;
    y = -ring;
  } else {
    x = ring;
    y = -ring + sideOffset;
  }

  return { x: x * spacing, y: y * spacing };
}
