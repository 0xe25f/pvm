// Oi mate! This is a coo!
import type { Point } from '../types';

export interface ObstacleRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PathfindOptions {
  worldWidth: number;
  worldHeight: number;
  cell: number;
}

// A tiny binary min-heap keyed by an f-score. Uses lazy deletion (stale entries are skipped
// on pop via the caller's closed set), so we never need decrease-key.
class MinHeap {
  private keys: number[] = [];
  private scores: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, score: number): void {
    this.keys.push(key);
    this.scores.push(score);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.scores[parent] <= this.scores[i]) {
        break;
      }
      this.swap(parent, i);
      i = parent;
    }
  }

  pop(): number {
    const topKey = this.keys[0];
    const lastKey = this.keys.pop() as number;
    const lastScore = this.scores.pop() as number;
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.scores[0] = lastScore;
      this.bubbleDown(0);
    }
    return topKey;
  }

  private bubbleDown(start: number): void {
    const length = this.keys.length;
    let i = start;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < length && this.scores[left] < this.scores[smallest]) {
        smallest = left;
      }
      if (right < length && this.scores[right] < this.scores[smallest]) {
        smallest = right;
      }
      if (smallest === i) {
        break;
      }
      this.swap(smallest, i);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.scores[a], this.scores[b]] = [this.scores[b], this.scores[a]];
  }
}

function octile(dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return ax + ay + (Math.SQRT2 - 2) * Math.min(ax, ay);
}

// 8-connected A* over a uniform grid. A cell is blocked when its centre lands inside any
// obstacle rect (the rects are pre-inflated by the unit radius, so a centre-line route keeps
// the body clear). Diagonal steps are forbidden when either shared orthogonal cell is blocked,
// so units never clip a building corner. Returns world-space waypoints after `from` up to and
// including `to`, or undefined when no route exists.
export function findGridPath(
  from: Point,
  to: Point,
  obstacles: ObstacleRect[],
  options: PathfindOptions
): Point[] | undefined {
  const { worldWidth, worldHeight, cell } = options;
  const cols = Math.max(1, Math.ceil(worldWidth / cell));
  const rows = Math.max(1, Math.ceil(worldHeight / cell));

  const blockedAt = (col: number, row: number): boolean => {
    const x = (col + 0.5) * cell;
    const y = (row + 0.5) * cell;
    for (const o of obstacles) {
      if (x >= o.left && x <= o.right && y >= o.top && y <= o.bottom) {
        return true;
      }
    }
    return false;
  };

  const clampInt = (value: number, max: number): number => Math.max(0, Math.min(max, value));
  const startCol = clampInt(Math.floor(from.x / cell), cols - 1);
  const startRow = clampInt(Math.floor(from.y / cell), rows - 1);
  let goalCol = clampInt(Math.floor(to.x / cell), cols - 1);
  let goalRow = clampInt(Math.floor(to.y / cell), rows - 1);

  // If the goal cell is blocked (e.g. ordered right up against a building), retarget to the
  // nearest free cell so the route still ends beside the obstacle rather than failing.
  if (blockedAt(goalCol, goalRow)) {
    const free = nearestFreeCell(goalCol, goalRow, cols, rows, blockedAt);
    if (!free) {
      return undefined;
    }
    goalCol = free.col;
    goalRow = free.row;
  }

  const startKey = startRow * cols + startCol;
  const goalKey = goalRow * cols + goalCol;
  if (startKey === goalKey) {
    return [{ x: to.x, y: to.y }];
  }

  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  gScore.set(startKey, 0);
  open.push(startKey, octile(goalCol - startCol, goalRow - startRow));

  const steps: Array<[number, number, number]> = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2]
  ];

  let found = false;
  while (open.size > 0) {
    const currentKey = open.pop();
    if (currentKey === goalKey) {
      found = true;
      break;
    }
    if (closed.has(currentKey)) {
      continue;
    }
    closed.add(currentKey);

    const col = currentKey % cols;
    const row = Math.floor(currentKey / cols);
    const baseG = gScore.get(currentKey) ?? Infinity;

    for (const [dx, dy, cost] of steps) {
      const ncol = col + dx;
      const nrow = row + dy;
      if (ncol < 0 || ncol >= cols || nrow < 0 || nrow >= rows) {
        continue;
      }
      const nKey = nrow * cols + ncol;
      if (nKey !== goalKey && blockedAt(ncol, nrow)) {
        continue;
      }
      if (dx !== 0 && dy !== 0 && (blockedAt(col + dx, row) || blockedAt(col, row + dy))) {
        continue;
      }
      const tentative = baseG + cost;
      if (tentative < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, currentKey);
        gScore.set(nKey, tentative);
        open.push(nKey, tentative + octile(goalCol - ncol, goalRow - nrow));
      }
    }
  }

  if (!found) {
    return undefined;
  }

  const cellKeys: number[] = [];
  let key: number | undefined = goalKey;
  while (key !== undefined && key !== startKey) {
    cellKeys.push(key);
    key = cameFrom.get(key);
  }
  cellKeys.reverse();

  const points: Point[] = cellKeys.map((cellKey) => ({
    x: (cellKey % cols + 0.5) * cell,
    y: (Math.floor(cellKey / cols) + 0.5) * cell
  }));
  // Replace the final grid centre with the true destination for a precise arrival.
  points[points.length - 1] = { x: to.x, y: to.y };
  return points;
}

// Breadth-first ring search for the closest walkable cell to a blocked goal.
function nearestFreeCell(
  col: number,
  row: number,
  cols: number,
  rows: number,
  blockedAt: (c: number, r: number) => boolean
): { col: number; row: number } | undefined {
  const maxRadius = Math.max(cols, rows);
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
          continue;
        }
        const c = col + dx;
        const r = row + dy;
        if (c < 0 || c >= cols || r < 0 || r >= rows) {
          continue;
        }
        if (!blockedAt(c, r)) {
          return { col: c, row: r };
        }
      }
    }
  }
  return undefined;
}
