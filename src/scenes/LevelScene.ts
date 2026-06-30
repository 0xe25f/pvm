// Oi mate! This is a coo!
import Phaser from 'phaser';
import { AUDIO_KEYS, TEXTURE_KEYS } from '../assets';
import {
  BUILDING_CONFIG,
  LEVEL_OBJECTIVE,
  POPULATION,
  STARTING_STOCKPILE,
  UNIT_CONFIG,
  WORLD
} from '../config/balance';
import { setDebugState } from '../debug';
import { Building } from '../entities/Building';
import { ResourceNode } from '../entities/ResourceNode';
import { Unit, type AttackTarget } from '../entities/Unit';
import {
  getSaveSummary,
  getSettings,
  loadLevelState,
  saveLevelState,
  updateSettings,
  type SavedBuildingState,
  type SavedLevelState,
  type SavedResourceState,
  type SavedUnitState
} from '../persistence/GamePersistence';
import { AISystem } from '../systems/AISystem';
import type { BuildingKind, Faction, HudCommand, HudSelection, HudSnapshot, Point, ResourceKind, Stockpile, UnitKind } from '../types';
import { clamp, distance, distanceSq, gridSnap, spiralOffset } from '../utils/math';

type Selectable = Unit | Building;
type CommandTarget = Selectable | ResourceNode | undefined;

interface PlacementState {
  kind: BuildingKind;
  builder: Unit;
  ghost: Phaser.GameObjects.Rectangle;
  centre: Point;
  valid: boolean;
}

export class LevelScene extends Phaser.Scene {
  resources: Record<Faction, Stockpile> = {
    pigeon: { ...STARTING_STOCKPILE },
    magpie: { crumbs: 260, twigs: 160 }
  };
  units: Unit[] = [];
  buildings: Building[] = [];
  nodes: ResourceNode[] = [];

  private selected: Selectable[] = [];
  private ai?: AISystem;
  private elapsedSeconds = 0;
  private gameOver?: 'win' | 'lose';
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<'w' | 'a' | 's' | 'd' | 'esc', Phaser.Input.Keyboard.Key>;
  private dragStart?: {
    screen: Point;
    world: Point;
  };
  private selectionRect?: Phaser.GameObjects.Rectangle;
  private placement?: PlacementState;
  private message = '';
  private messageUntil = 0;
  private gameMusic?: Phaser.Sound.BaseSound;
  private paused = false;
  private pendingSave?: SavedLevelState;
  private cameraKeyState = {
    left: false,
    right: false,
    up: false,
    down: false
  };
  private readonly handleWindowKeyDown = (event: KeyboardEvent): void => {
    if ((event.code === 'Escape' || event.code === 'KeyP') && !event.repeat) {
      event.preventDefault();
      if (this.placement) {
        this.cancelPlacement();
      } else {
        this.setPaused(!this.paused);
      }
      return;
    }

    if (this.paused && !event.repeat) {
      if (event.code === 'KeyS') {
        event.preventDefault();
        void this.saveCurrentGame();
        return;
      }
      if (event.code === 'KeyL') {
        event.preventDefault();
        void this.loadSavedGame();
        return;
      }
      if (event.code === 'KeyM') {
        event.preventDefault();
        this.returnToMenu();
        return;
      }
    }

    if (this.handleCameraKey(event.code, event.key, true)) {
      this.nudgeCameraForKey(event.code, event.key);
      event.preventDefault();
    }
  };
  private readonly handleWindowKeyUp = (event: KeyboardEvent): void => {
    if (this.handleCameraKey(event.code, event.key, false)) {
      event.preventDefault();
    }
  };
  private readonly handleWindowPointerUp = (event: PointerEvent): void => {
    this.handleWindowPauseMenuClick(event);
  };
  private readonly handleWindowMouseUp = (event: MouseEvent): void => {
    this.handleWindowPauseMenuClick(event);
  };
  private readonly handleWindowClick = (event: MouseEvent): void => {
    this.handleWindowPauseMenuClick(event);
  };

  constructor() {
    super('LevelScene');
  }

  init(data?: { save?: SavedLevelState }): void {
    this.pendingSave = data?.save;
  }

  create(): void {
    this.resources = {
      pigeon: { ...STARTING_STOCKPILE },
      magpie: { crumbs: 260, twigs: 160 }
    };
    this.units = [];
    this.buildings = [];
    this.nodes = [];
    this.selected = [];
    this.elapsedSeconds = 0;
    this.gameOver = undefined;
    this.paused = false;
    this.cameraKeyState = {
      left: false,
      right: false,
      up: false,
      down: false
    };

    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.centerOn(330, 1650);
    this.input.mouse?.disableContextMenu();
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC
    }) as Record<'w' | 'a' | 's' | 'd' | 'esc', Phaser.Input.Keyboard.Key>;
    document.getElementById('game-shell')?.focus({ preventScroll: true });

    this.createTerrain();
    if (this.pendingSave) {
      this.restoreLevelEntities(this.pendingSave);
    } else {
      this.createLevelEntities();
    }
    this.createInput();

    this.ai = new AISystem(this);
    this.scene.launch('UIScene');
    this.scene.bringToTop('UIScene');
    const settings = getSettings();
    this.gameMusic = this.sound.add(AUDIO_KEYS.gameLoopOne, {
      loop: true,
      volume: 1
    });
    this.applyMusicSettings(settings.musicEnabled, settings.musicVolume);
    this.gameMusic.play();

    this.game.events.on('ui:command', this.handleUiCommand, this);
    this.game.events.on('ui:restart', this.restartLevel, this);
    this.game.events.on('ui:menu', this.returnToMenu, this);
    this.game.events.on('ui:resume', this.resumeFromPause, this);
    this.game.events.on('ui:save', this.saveCurrentGame, this);
    this.game.events.on('ui:load', this.loadSavedGame, this);
    this.game.events.on('ui:toggleMusic', this.toggleMusicSetting, this);
    this.events.once('shutdown', this.shutdown, this);
    this.scale.on('resize', this.publishHud, this);
    window.addEventListener('keydown', this.handleWindowKeyDown, { passive: false });
    window.addEventListener('keyup', this.handleWindowKeyUp, { passive: false });
    window.addEventListener('pointerup', this.handleWindowPointerUp, { passive: false });
    window.addEventListener('mouseup', this.handleWindowMouseUp, { passive: false });
    window.addEventListener('click', this.handleWindowClick, { passive: false });

    this.setMessage(this.pendingSave ? 'Loaded local save.' : 'First Level: Old Fountain Park', 3);
    setDebugState({ scene: 'level' });
    this.publishHud();
  }

  update(_time: number, deltaMs: number): void {
    const deltaSeconds = Math.min(deltaMs / 1000, 0.05);

    if (this.paused) {
      this.publishHud();
      return;
    }

    this.updateCamera(deltaSeconds);
    this.updatePlacementGhost();

    if (this.gameOver) {
      this.publishHud();
      return;
    }

    this.elapsedSeconds += deltaSeconds;

    for (const building of this.buildings) {
      if (!building.alive) {
        continue;
      }
      const trained = building.updateProduction(deltaSeconds);
      if (trained) {
        this.spawnTrainedUnit(building, trained);
      }
    }

    for (const unit of this.units) {
      unit.update(deltaSeconds, this);
    }

    this.applyUnitSeparation();
    this.ai?.update(deltaSeconds);
    this.cleanupSelection();
    this.checkGameOver();
    this.publishHud();
  }

  isGameOver(): boolean {
    return Boolean(this.gameOver);
  }

  currentPopulation(faction: Faction): number {
    return this.units.filter((unit) => unit.alive && unit.faction === faction).length;
  }

  populationCap(faction: Faction): number {
    const cap = this.buildings.reduce((total, building) => {
      if (!building.alive || building.faction !== faction) {
        return total;
      }
      return total + building.populationProvided;
    }, 0);

    return Math.min(POPULATION.ceiling, cap);
  }

  findNearestEnemy(source: Selectable, range: number): AttackTarget | undefined {
    const enemies: AttackTarget[] = [
      ...this.units.filter((unit) => unit.alive && unit.faction !== source.faction),
      ...this.buildings.filter((building) => building.alive && building.faction !== source.faction)
    ];
    let best: AttackTarget | undefined;
    let bestDistance = range * range;
    for (const enemy of enemies) {
      const d = distanceSq(source.position, enemy.position);
      if (d < bestDistance) {
        best = enemy;
        bestDistance = d;
      }
    }
    return best;
  }

  findNearestDropOff(faction: Faction, point: Point): Building | undefined {
    return this.buildings
      .filter((building) => building.alive && building.built && building.faction === faction && building.kind === 'mainNest')
      .sort((a, b) => distanceSq(a.position, point) - distanceSq(b.position, point))[0];
  }

  findNearestResource(point: Point, kind?: ResourceKind): ResourceNode | undefined {
    return this.nodes
      .filter((node) => node.amount > 0 && (!kind || node.kind === kind))
      .sort((a, b) => distanceSq(a.position, point) - distanceSq(b.position, point))[0];
  }

  findPrimaryBuilding(faction: Faction): Building | undefined {
    return (
      this.buildings.find(
        (building) => building.alive && building.faction === faction && building.kind === 'mainNest'
      ) ?? this.buildings.find((building) => building.alive && building.faction === faction)
    );
  }

  deposit(faction: Faction, kind: ResourceKind, amount: number): void {
    this.resources[faction][kind] += amount;
    if (faction === 'pigeon') {
      this.setMessage(`Deposited ${amount} ${kind === 'crumbs' ? 'breadcrumbs' : 'twigs'}.`, 1.1);
    }
  }

  pruneEmptyNodes(): void {
    this.nodes = this.nodes.filter((node) => node.amount > 0);
  }

  getBuildingApproachPoint(building: Building, from: Point, padding: number): Point {
    const halfW = building.width / 2 + padding;
    const halfH = building.height / 2 + padding;
    const dx = from.x - building.x;
    const dy = from.y - building.y;

    if (Math.abs(dx) / halfW > Math.abs(dy) / halfH) {
      return {
        x: clamp(building.x + Math.sign(dx || 1) * halfW, 20, WORLD.width - 20),
        y: clamp(building.y + dy, 20, WORLD.height - 20)
      };
    }

    return {
      x: clamp(building.x + dx, 20, WORLD.width - 20),
      y: clamp(building.y + Math.sign(dy || 1) * halfH, 20, WORLD.height - 20)
    };
  }

  getMovementWaypoint(from: Point, target: Point, radius: number, ignoreBuilding?: Building): Point | undefined {
    const blocker = this.findBlockingBuilding(from, target, radius + 8, ignoreBuilding);
    if (!blocker) {
      return undefined;
    }

    const pad = radius + 18;
    const left = blocker.x - blocker.width / 2 - pad;
    const right = blocker.x + blocker.width / 2 + pad;
    const top = blocker.y - blocker.height / 2 - pad;
    const bottom = blocker.y + blocker.height / 2 + pad;
    const candidates: Point[] = [
      { x: left, y: top },
      { x: right, y: top },
      { x: left, y: bottom },
      { x: right, y: bottom },
      { x: blocker.x, y: top },
      { x: blocker.x, y: bottom },
      { x: left, y: blocker.y },
      { x: right, y: blocker.y }
    ].map((point) => ({
      x: clamp(point.x, 20, WORLD.width - 20),
      y: clamp(point.y, 20, WORLD.height - 20)
    }));

    return candidates
      .filter((point) => !this.isPointInsideBuilding(point, radius, ignoreBuilding))
      .filter((point) => !this.findBlockingBuilding(from, point, radius + 6, ignoreBuilding))
      .sort((a, b) => distance(from, a) + distance(a, target) - (distance(from, b) + distance(b, target)))[0];
  }

  resolveUnitBuildingOverlap(unit: Unit, point: Point, ignoreBuilding?: Building): Point {
    let resolved = { ...point };
    for (const building of this.buildings) {
      if (!building.alive || building === ignoreBuilding) {
        continue;
      }
      const pad = unit.radius + 4;
      const left = building.x - building.width / 2 - pad;
      const right = building.x + building.width / 2 + pad;
      const top = building.y - building.height / 2 - pad;
      const bottom = building.y + building.height / 2 + pad;
      if (resolved.x < left || resolved.x > right || resolved.y < top || resolved.y > bottom) {
        continue;
      }

      const distances = [
        { side: 'left', value: Math.abs(resolved.x - left) },
        { side: 'right', value: Math.abs(right - resolved.x) },
        { side: 'top', value: Math.abs(resolved.y - top) },
        { side: 'bottom', value: Math.abs(bottom - resolved.y) }
      ].sort((a, b) => a.value - b.value);

      if (distances[0].side === 'left') {
        resolved.x = left;
      } else if (distances[0].side === 'right') {
        resolved.x = right;
      } else if (distances[0].side === 'top') {
        resolved.y = top;
      } else {
        resolved.y = bottom;
      }
    }

    return {
      x: clamp(resolved.x, 10, WORLD.width - 10),
      y: clamp(resolved.y, 10, WORLD.height - 10)
    };
  }

  addHitEffect(from: Point, to: Point, ranged: boolean): void {
    const graphics = this.add.graphics().setDepth(5000);
    graphics.lineStyle(ranged ? 2 : 1, ranged ? 0xf0f3f8 : 0xffd56b, ranged ? 0.75 : 0.45);
    graphics.lineBetween(from.x, from.y, to.x, to.y);
    graphics.fillStyle(ranged ? 0xffffff : 0xffd56b, ranged ? 0.9 : 0.75);
    graphics.fillCircle(to.x, to.y, ranged ? 5 : 3);
    this.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: ranged ? 220 : 150,
      onComplete: () => graphics.destroy()
    });
  }

  tryTrain(building: Building, unitKind: UnitKind, silent = false): boolean {
    if (!building.alive || !building.built || !building.trains.includes(unitKind)) {
      return false;
    }

    if (building.queue) {
      if (!silent && building.faction === 'pigeon') {
        this.setMessage('That building is already training.');
      }
      return false;
    }

    const config = UNIT_CONFIG[unitKind];
    const stockpile = this.resources[building.faction];
    if (stockpile.crumbs < config.cost.crumbs || stockpile.twigs < config.cost.twigs) {
      if (!silent && building.faction === 'pigeon') {
        this.setMessage('Not enough resources.');
      }
      return false;
    }

    if (this.currentPopulation(building.faction) + 1 > this.populationCap(building.faction)) {
      if (!silent && building.faction === 'pigeon') {
        this.setMessage('Population cap reached. Build a Birdbath.');
      }
      return false;
    }

    stockpile.crumbs -= config.cost.crumbs;
    stockpile.twigs -= config.cost.twigs;
    building.startTraining(unitKind);
    if (!silent && building.faction === 'pigeon') {
      this.setMessage(`Training ${config.label}.`);
    }
    return true;
  }

  // Used by the AI to find an empty, on-grid spot for a building near a reference
  // point (its Main Nest). Searches outward in rings so the AI rebuilds close to home.
  findBuildPlacement(kind: BuildingKind, near: Point): Point | undefined {
    const config = BUILDING_CONFIG[kind];
    for (let ring = 1; ring <= 8; ring += 1) {
      const radius = ring * WORLD.grid * 2;
      for (let step = 0; step < 12; step += 1) {
        const angle = (step / 12) * Math.PI * 2;
        const centre = {
          x: clamp(gridSnap(near.x + Math.cos(angle) * radius, WORLD.grid), config.width / 2, WORLD.width - config.width / 2),
          y: clamp(gridSnap(near.y + Math.sin(angle) * radius, WORLD.grid), config.height / 2, WORLD.height - config.height / 2)
        };
        if (this.isValidBuildingSpot(centre, kind)) {
          return centre;
        }
      }
    }
    return undefined;
  }

  // Used by the AI to start constructing a building with a chosen Forager. Mirrors the
  // player's tryPlaceBuilding flow (validate spot, charge resources, assign the builder)
  // but without any UI/ghost. Returns false if the spot is invalid or unaffordable.
  startConstruction(faction: Faction, kind: BuildingKind, builder: Unit, centre: Point): boolean {
    const cost = BUILDING_CONFIG[kind].cost;
    const stockpile = this.resources[faction];
    if (stockpile.crumbs < cost.crumbs || stockpile.twigs < cost.twigs) {
      return false;
    }
    if (!this.isValidBuildingSpot(centre, kind)) {
      return false;
    }

    stockpile.crumbs -= cost.crumbs;
    stockpile.twigs -= cost.twigs;
    const building = this.addBuilding(kind, faction, centre.x, centre.y, false);
    builder.build(building);
    return true;
  }

  private createTerrain(): void {
    this.add
      .tileSprite(WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height, TEXTURE_KEYS.grassTile)
      .setDepth(-1000);

    const paths = this.add.graphics().setDepth(-990);
    paths.lineStyle(118, 0x735937, 0.75);
    paths.beginPath();
    paths.moveTo(235, 1800);
    paths.lineTo(460, 1590);
    paths.lineTo(820, 1230);
    paths.lineTo(1040, 970);
    paths.lineTo(1320, 700);
    paths.lineTo(1700, 270);
    paths.strokePath();
    paths.lineStyle(82, 0x8a7044, 0.38);
    paths.beginPath();
    paths.moveTo(210, 1460);
    paths.lineTo(640, 1540);
    paths.lineTo(1030, 1010);
    paths.lineTo(1510, 1070);
    paths.strokePath();

    const water = this.add.graphics().setDepth(-980);
    water.fillStyle(0x2f6f8a, 0.65);
    water.fillEllipse(1080, 1290, 320, 155);
    water.fillStyle(0x5ca7b6, 0.28);
    water.fillEllipse(1050, 1275, 210, 82);

    const decor = this.add.graphics().setDepth(-970);
    for (const point of [
      [150, 1150],
      [245, 980],
      [470, 930],
      [680, 540],
      [900, 490],
      [1340, 1320],
      [1540, 1490],
      [1800, 1060],
      [1710, 1510],
      [1120, 420]
    ]) {
      this.drawTreeCluster(decor, point[0], point[1]);
    }
  }

  private drawTreeCluster(graphics: Phaser.GameObjects.Graphics, x: number, y: number): void {
    graphics.fillStyle(0x234b2d, 1);
    graphics.fillTriangle(x - 23, y + 17, x, y - 38, x + 23, y + 17);
    graphics.fillStyle(0x2e6b35, 1);
    graphics.fillTriangle(x - 18, y + 3, x + 5, y - 48, x + 28, y + 4);
    graphics.fillStyle(0x5d3f25, 1);
    graphics.fillRect(x - 4, y + 10, 8, 22);
  }

  private createLevelEntities(): void {
    const pigeonNest = this.addBuilding('mainNest', 'pigeon', 300, 1700, true);
    this.addBuilding('birdbath', 'pigeon', 165, 1810, true);
    const magpieNest = this.addBuilding('mainNest', 'magpie', 1700, 300, true);
    this.addBuilding('birdbath', 'magpie', 1840, 205, true);
    const magpieBarracks = this.addBuilding('branchBarracks', 'magpie', 1540, 440, true);

    this.addUnit('forager', 'pigeon', 390, 1660);
    this.addUnit('forager', 'pigeon', 360, 1745);
    this.addUnit('forager', 'pigeon', 255, 1810);
    this.addUnit('pecker', 'pigeon', 420, 1765);

    this.addUnit('forager', 'magpie', 1605, 335);
    this.addUnit('forager', 'magpie', 1740, 410);
    this.addUnit('forager', 'magpie', 1810, 320);
    this.addUnit('pecker', 'magpie', 1510, 545);
    this.addUnit('poopBomber', 'magpie', 1620, 525);

    this.nodes.push(new ResourceNode(this, 'crumbs', 530, 1620, 5000));
    this.nodes.push(new ResourceNode(this, 'twigs', 235, 1470, 1500));
    this.nodes.push(new ResourceNode(this, 'twigs', 570, 1845, 1500));
    this.nodes.push(new ResourceNode(this, 'crumbs', 1000, 1000, 10000));
    this.nodes.push(new ResourceNode(this, 'crumbs', 1500, 360, 5000));
    this.nodes.push(new ResourceNode(this, 'twigs', 1800, 520, 1500));
    this.nodes.push(new ResourceNode(this, 'twigs', 1415, 210, 1500));

    for (const unit of this.units.filter((candidate) => candidate.faction === 'pigeon' && candidate.kind === 'forager')) {
      const node = this.findNearestResource(unit.position, unit.x < pigeonNest.x ? 'twigs' : 'crumbs');
      if (node) {
        unit.gather(node);
      }
    }

    for (const unit of this.units.filter((candidate) => candidate.faction === 'magpie' && candidate.kind === 'forager')) {
      const node = this.findNearestResource(unit.position, unit.y < magpieNest.y + 80 ? 'twigs' : 'crumbs');
      if (node) {
        unit.gather(node);
      }
    }

    magpieBarracks.startTraining('pecker');
  }

  private createInput(): void {
    this.selectionRect = this.add
      .rectangle(0, 0, 1, 1, 0x69d3ff, 0.1)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x69d3ff, 0.85)
      .setScrollFactor(0)
      .setDepth(10000)
      .setVisible(false);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.paused) {
      return;
    }

    if (this.gameOver || this.isPointerOverHud(pointer.y)) {
      return;
    }

    if (this.isRightButton(pointer)) {
      this.issueCommand(this.screenToWorld(pointer));
      return;
    }

    if (this.placement) {
      return;
    }

    this.dragStart = {
      screen: { x: pointer.x, y: pointer.y },
      world: this.screenToWorld(pointer)
    };
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.paused) {
      return;
    }

    if (!this.dragStart || this.placement || this.isPointerOverHud(pointer.y)) {
      return;
    }

    const dx = pointer.x - this.dragStart.screen.x;
    const dy = pointer.y - this.dragStart.screen.y;
    if (Math.hypot(dx, dy) < 7) {
      return;
    }

    const x = Math.min(pointer.x, this.dragStart.screen.x);
    const y = Math.min(pointer.y, this.dragStart.screen.y);
    this.selectionRect?.setPosition(x, y).setSize(Math.abs(dx), Math.abs(dy)).setVisible(true);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.paused) {
      this.handlePauseMenuAt(pointer.x, pointer.y);
      this.dragStart = undefined;
      this.selectionRect?.setVisible(false);
      return;
    }

    if (!this.gameOver && this.handleHudCommandAt(pointer.x, pointer.y)) {
      this.dragStart = undefined;
      this.selectionRect?.setVisible(false);
      return;
    }

    if (this.gameOver || this.isPointerOverHud(pointer.y)) {
      this.dragStart = undefined;
      this.selectionRect?.setVisible(false);
      return;
    }

    const world = this.screenToWorld(pointer);

    if (this.isRightButton(pointer)) {
      this.issueCommand(world);
      this.dragStart = undefined;
      this.selectionRect?.setVisible(false);
      return;
    }

    if (this.placement) {
      this.tryPlaceBuilding();
      return;
    }

    const dragDistance = this.dragStart ? distance(this.dragStart.screen, { x: pointer.x, y: pointer.y }) : 0;
    const additive = Boolean((pointer.event as MouseEvent | undefined)?.shiftKey);
    if (dragDistance > 9 && this.dragStart) {
      this.boxSelect(this.dragStart.world, world, additive);
    } else {
      this.handlePrimaryClick(world, pointer, additive);
    }

    this.dragStart = undefined;
    this.selectionRect?.setVisible(false);
  }

  private handlePrimaryClick(world: Point, pointer: Phaser.Input.Pointer, additive: boolean): void {
    const target = this.findSelectableAt(world);
    const ownSelected = this.selectedOwnUnits();
    const isTouchCommand =
      this.isTouchPointer(pointer) && ownSelected.length > 0 && (!target || target.faction !== 'pigeon');

    if (isTouchCommand) {
      this.issueCommand(world);
      return;
    }

    if (target) {
      this.setSelection([target], additive);
      return;
    }

    if (!additive) {
      this.setSelection([]);
    }
  }

  private issueCommand(world: Point): void {
    const units = this.selectedOwnUnits();
    if (units.length === 0) {
      return;
    }

    const target = this.findCommandTargetAt(world);
    if (target instanceof ResourceNode) {
      const foragers = units.filter((unit) => unit.kind === 'forager');
      if (foragers.length === 0) {
        this.setMessage('Only Foragers can gather there.');
        return;
      }
      for (const forager of foragers) {
        forager.gather(target);
      }
      this.setMessage(`Gathering ${target.kind === 'crumbs' ? 'breadcrumbs' : 'twigs'}.`, 1.5);
      return;
    }

    if (target && target.faction !== 'pigeon') {
      for (const unit of units) {
        unit.attack(target);
      }
      this.setMessage(`Attacking ${target.label}.`, 1.4);
      return;
    }

    units.forEach((unit, index) => {
      const offset = spiralOffset(index);
      unit.moveTo({
        x: clamp(world.x + offset.x, 20, WORLD.width - 20),
        y: clamp(world.y + offset.y, 20, WORLD.height - 20)
      });
    });
  }

  private boxSelect(start: Point, end: Point, additive: boolean): void {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const matches = this.units.filter(
      (unit) =>
        unit.alive &&
        unit.faction === 'pigeon' &&
        unit.x >= minX &&
        unit.x <= maxX &&
        unit.y >= minY &&
        unit.y <= maxY
    );
    this.setSelection(matches, additive);
  }

  private setSelection(selection: Selectable[], additive = false): void {
    if (!additive) {
      for (const selected of this.selected) {
        selected.setSelected(false);
      }
      this.selected = [];
    }

    for (const entity of selection) {
      if (!entity.alive) {
        continue;
      }
      const existing = this.selected.includes(entity);
      if (additive && existing) {
        entity.setSelected(false);
        this.selected = this.selected.filter((candidate) => candidate !== entity);
      } else if (!existing) {
        entity.setSelected(true);
        this.selected.push(entity);
      }
    }
    this.publishHud();
  }

  private cleanupSelection(): void {
    this.selected = this.selected.filter((entity) => {
      const keep = entity.alive;
      if (!keep) {
        entity.setSelected(false);
      }
      return keep;
    });
  }

  private findSelectableAt(point: Point): Selectable | undefined {
    const unit = [...this.units]
      .reverse()
      .filter((candidate) => candidate.alive)
      .find((candidate) => candidate.containsPoint(point));
    if (unit) {
      return unit;
    }

    return [...this.buildings]
      .reverse()
      .filter((candidate) => candidate.alive)
      .find((candidate) => candidate.containsPoint(point));
  }

  private findCommandTargetAt(point: Point): CommandTarget {
    const enemy = [...this.units, ...this.buildings]
      .filter((candidate) => candidate.alive && candidate.faction !== 'pigeon')
      .sort((a, b) => distanceSq(a.position, point) - distanceSq(b.position, point))
      .find((candidate) => candidate.containsPoint(point));
    if (enemy) {
      return enemy;
    }

    const node = this.nodes.find((candidate) => candidate.amount > 0 && candidate.containsPoint(point));
    if (node) {
      return node;
    }

    return this.findSelectableAt(point);
  }

  private selectedOwnUnits(): Unit[] {
    return this.selected.filter(
      (entity): entity is Unit => entity instanceof Unit && entity.alive && entity.faction === 'pigeon'
    );
  }

  private updateCamera(deltaSeconds: number): void {
    let dx = 0;
    let dy = 0;

    if (this.cameraKeyState.left || this.cursors?.left?.isDown || this.keys?.a?.isDown) {
      dx -= 1;
    }
    if (this.cameraKeyState.right || this.cursors?.right?.isDown || this.keys?.d?.isDown) {
      dx += 1;
    }
    if (this.cameraKeyState.up || this.cursors?.up?.isDown || this.keys?.w?.isDown) {
      dy -= 1;
    }
    if (this.cameraKeyState.down || this.cursors?.down?.isDown || this.keys?.s?.isDown) {
      dy += 1;
    }

    const pointer = this.input.activePointer;
    const settings = getSettings();
    // Edge-scroll is anchored to the *visible playfield*, not the raw screen. The top/bottom
    // HUD bars occlude the screen's true top/bottom edges, so triggering there would force
    // the cursor behind the HUD. Instead we scroll near the inner edges of the playfield.
    // The bottom band stops at the HUD so it never fights the command buttons; left/right use
    // the screen edges directly since nothing occludes them.
    if (settings.edgeScrollEnabled && !this.isTouchPointer(pointer)) {
      const playTop = this.topHudHeight();
      const playBottom = this.scale.height - this.bottomHudHeight();
      if (pointer.x <= WORLD.cameraEdge) {
        dx -= 1;
      } else if (pointer.x >= this.scale.width - WORLD.cameraEdge) {
        dx += 1;
      }
      if (pointer.y <= playTop + WORLD.cameraEdge) {
        dy -= 1;
      } else if (pointer.y >= playBottom - WORLD.cameraEdge && pointer.y <= playBottom) {
        dy += 1;
      }
    }

    if (dx !== 0 || dy !== 0) {
      this.scrollCameraBy(dx, dy, WORLD.cameraSpeed * deltaSeconds);
    }
  }

  private beginPlacement(kind: BuildingKind): void {
    const foragers = this.selectedOwnUnits().filter((unit) => unit.kind === 'forager');
    // Prefer a Forager that isn't already mid-construction, so chained builds spread across
    // the selection instead of yanking one busy Forager off its current site.
    const builder = foragers.find((unit) => unit.state !== 'building') ?? foragers[0];
    if (!builder) {
      this.setMessage('Select a Forager to build.');
      return;
    }

    const cost = BUILDING_CONFIG[kind].cost;
    if (this.resources.pigeon.crumbs < cost.crumbs || this.resources.pigeon.twigs < cost.twigs) {
      this.setMessage('Not enough resources.');
      return;
    }

    this.cancelPlacement();
    const config = BUILDING_CONFIG[kind];
    const ghost = this.add
      .rectangle(0, 0, config.width, config.height, 0x69d3ff, 0.24)
      .setStrokeStyle(2, 0x69d3ff, 0.95)
      .setDepth(9000);
    this.placement = {
      kind,
      builder,
      ghost,
      centre: { x: builder.x, y: builder.y },
      valid: false
    };
    this.setMessage(`Placing ${config.label}.`);
  }

  private updatePlacementGhost(): void {
    if (!this.placement) {
      return;
    }

    const pointer = this.input.activePointer;
    const world = this.screenToWorld(pointer);
    const config = BUILDING_CONFIG[this.placement.kind];
    const centre = {
      x: clamp(gridSnap(world.x, WORLD.grid), config.width / 2, WORLD.width - config.width / 2),
      y: clamp(gridSnap(world.y, WORLD.grid), config.height / 2, WORLD.height - config.height / 2)
    };
    const valid = this.isValidBuildingSpot(centre, this.placement.kind);
    this.placement.centre = centre;
    this.placement.valid = valid;
    this.placement.ghost
      .setPosition(centre.x, centre.y)
      .setFillStyle(valid ? 0x5ee879 : 0xe65c52, 0.23)
      .setStrokeStyle(2, valid ? 0x5ee879 : 0xe65c52, 0.95);
  }

  private tryPlaceBuilding(): void {
    if (!this.placement) {
      return;
    }

    if (!this.placement.valid) {
      this.setMessage('Cannot build there.');
      return;
    }

    const config = BUILDING_CONFIG[this.placement.kind];
    this.resources.pigeon.crumbs -= config.cost.crumbs;
    this.resources.pigeon.twigs -= config.cost.twigs;
    const building = this.addBuilding(this.placement.kind, 'pigeon', this.placement.centre.x, this.placement.centre.y, false);
    this.placement.builder.build(building);
    // Keep the Forager(s) selected rather than switching to the half-built building, so the
    // build buttons stay on screen and the player can immediately queue another structure.
    this.setMessage(`${config.label} started.`);
    this.cancelPlacement();
  }

  private cancelPlacement(): void {
    this.placement?.ghost.destroy();
    this.placement = undefined;
  }

  private isValidBuildingSpot(centre: Point, kind: BuildingKind): boolean {
    const config = BUILDING_CONFIG[kind];
    const halfW = config.width / 2;
    const halfH = config.height / 2;
    if (centre.x - halfW < 0 || centre.x + halfW > WORLD.width || centre.y - halfH < 0 || centre.y + halfH > WORLD.height) {
      return false;
    }

    const overlapsBuilding = this.buildings.some((building) => {
      if (!building.alive) {
        return false;
      }
      return (
        Math.abs(building.x - centre.x) < building.width / 2 + halfW + 16 &&
        Math.abs(building.y - centre.y) < building.height / 2 + halfH + 16
      );
    });
    if (overlapsBuilding) {
      return false;
    }

    return !this.nodes.some((node) => distance(node.position, centre) < node.radius + Math.max(halfW, halfH) + 14);
  }

  private addBuilding(kind: BuildingKind, faction: Faction, x: number, y: number, built: boolean): Building {
    const building = new Building(this, kind, faction, x, y, built);
    this.buildings.push(building);
    return building;
  }

  private addUnit(kind: UnitKind, faction: Faction, x: number, y: number): Unit {
    const unit = new Unit(this, kind, faction, x, y);
    this.units.push(unit);
    return unit;
  }

  private spawnTrainedUnit(building: Building, unitKind: UnitKind): void {
    const spawn = {
      x: clamp(building.x + building.width / 2 + 30, 24, WORLD.width - 24),
      y: clamp(building.y + 22 + Phaser.Math.Between(-14, 14), 24, WORLD.height - 24)
    };
    const unit = this.addUnit(unitKind, building.faction, spawn.x, spawn.y);
    unit.moveTo({ x: spawn.x + (building.faction === 'pigeon' ? 48 : -48), y: spawn.y + 24 });
  }

  private applyUnitSeparation(): void {
    const alive = this.units.filter((unit) => unit.alive);
    for (let i = 0; i < alive.length; i += 1) {
      for (let j = i + 1; j < alive.length; j += 1) {
        const a = alive[i];
        const b = alive[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy);
        const minDistance = a.radius + b.radius - 2;
        if (length <= 0.01 || length >= minDistance) {
          continue;
        }
        const push = (minDistance - length) * 0.35;
        const nx = dx / length;
        const ny = dy / length;
        const nextA = this.resolveUnitBuildingOverlap(a, {
          x: clamp(a.x - nx * push, 10, WORLD.width - 10),
          y: clamp(a.y - ny * push, 10, WORLD.height - 10)
        });
        const nextB = this.resolveUnitBuildingOverlap(b, {
          x: clamp(b.x + nx * push, 10, WORLD.width - 10),
          y: clamp(b.y + ny * push, 10, WORLD.height - 10)
        });
        a.setPosition(nextA.x, nextA.y);
        b.setPosition(nextB.x, nextB.y);
      }
    }
  }

  private handleUiCommand(commandId: string): void {
    if (this.gameOver) {
      return;
    }

    const [action, rawKind] = commandId.split(':') as ['train' | 'build', UnitKind | BuildingKind];
    if (action === 'train') {
      const unitKind = rawKind as UnitKind;
      const building = this.selected.find(
        (entity): entity is Building =>
          entity instanceof Building && entity.alive && entity.faction === 'pigeon' && entity.trains.includes(unitKind)
      );
      if (!building) {
        this.setMessage('Select the right building first.');
        return;
      }
      this.tryTrain(building, unitKind);
    } else if (action === 'build') {
      this.beginPlacement(rawKind as BuildingKind);
    }
  }

  private handleHudCommandAt(screenX: number, screenY: number): boolean {
    if (screenY < this.scale.height - this.bottomHudHeight()) {
      return false;
    }

    const commands = this.getCommands();
    if (commands.length === 0) {
      return false;
    }

    const compact = this.scale.width < 720 || this.scale.height < 560;
    const size = compact ? 46 : 54;
    const gap = compact ? 8 : 10;
    const columns = compact ? 4 : 5;
    const originX = compact ? Math.max(this.scale.width - 218, 252) : Math.max(this.scale.width - 336, 430);
    const originY = this.scale.height - this.bottomHudHeight() + (compact ? 22 : 28);
    const localX = screenX - originX;
    const localY = screenY - originY;

    for (const [index, command] of commands.entries()) {
      const x = (index % columns) * (size + gap);
      const y = Math.floor(index / columns) * (size + gap);
      if (Math.abs(localX - x) <= size / 2 && Math.abs(localY - y) <= size / 2) {
        if (command.enabled) {
          this.handleUiCommand(command.id);
        } else {
          this.setMessage(command.detail);
        }
        return true;
      }
    }

    return false;
  }

  private handlePauseMenuAt(screenX: number, screenY: number): boolean {
    for (const button of this.pauseButtonLayout()) {
      if (
        screenX >= button.x - button.width / 2 &&
        screenX <= button.x + button.width / 2 &&
        screenY >= button.y - button.height / 2 &&
        screenY <= button.y + button.height / 2
      ) {
        if (button.action === 'resume') {
          this.resumeFromPause();
        } else if (button.action === 'save') {
          void this.saveCurrentGame();
        } else if (button.action === 'load') {
          void this.loadSavedGame();
        } else if (button.action === 'toggleMusic') {
          void this.toggleMusicSetting();
        } else if (button.action === 'menu') {
          this.returnToMenu();
        }
        return true;
      }
    }
    return false;
  }

  private handleWindowPauseMenuClick(event: MouseEvent): void {
    if (!this.paused || !this.scene.isActive('LevelScene')) {
      return;
    }
    if (this.handlePauseMenuAt(event.clientX, event.clientY)) {
      event.preventDefault();
    }
  }

  private pauseButtonLayout(): Array<{
    action: 'resume' | 'save' | 'load' | 'toggleMusic' | 'menu';
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    const width = Math.min(320, this.scale.width - 40);
    const height = 44;
    const startY = this.scale.height / 2 - 64;
    const x = this.scale.width / 2;
    return ['resume', 'save', 'load', 'toggleMusic', 'menu'].map((action, index) => ({
      action: action as 'resume' | 'save' | 'load' | 'toggleMusic' | 'menu',
      x,
      y: startY + index * 52,
      width,
      height
    }));
  }

  private getCommands(): HudCommand[] {
    const commands: HudCommand[] = [];
    const ownSelection = this.selected.filter((entity) => entity.alive && entity.faction === 'pigeon');
    const selectedProduction = ownSelection.find(
      (entity): entity is Building => entity instanceof Building && entity.built && entity.trains.length > 0
    );

    if (selectedProduction) {
      for (const unitKind of selectedProduction.trains) {
        const config = UNIT_CONFIG[unitKind];
        const enabled =
          !selectedProduction.queue &&
          this.resources.pigeon.crumbs >= config.cost.crumbs &&
          this.resources.pigeon.twigs >= config.cost.twigs &&
          this.currentPopulation('pigeon') + 1 <= this.populationCap('pigeon');
        commands.push({
          id: `train:${unitKind}`,
          label: config.label,
          iconTexture: this.iconForUnit('pigeon', unitKind),
          enabled,
          detail: `${config.cost.crumbs} breadcrumbs, ${config.cost.twigs} twigs`
        });
      }
    }

    if (ownSelection.some((entity) => entity instanceof Unit && entity.kind === 'forager')) {
      for (const kind of ['birdbath', 'branchBarracks'] as BuildingKind[]) {
        const config = BUILDING_CONFIG[kind];
        const enabled = this.resources.pigeon.crumbs >= config.cost.crumbs && this.resources.pigeon.twigs >= config.cost.twigs;
        commands.push({
          id: `build:${kind}`,
          label: config.label,
          iconTexture: this.iconForBuilding('pigeon', kind),
          enabled,
          detail: `${config.cost.crumbs} breadcrumbs, ${config.cost.twigs} twigs`
        });
      }
    }

    return commands;
  }

  private buildSelectionSnapshot(): HudSelection[] {
    return this.selected.map((entity) => ({
      id: entity.id,
      name: entity.label,
      faction: entity.faction,
      hp: Math.ceil(entity.hp),
      maxHp: entity.maxHp,
      portraitTexture: entity.portraitTexture,
      queueLabel:
        entity instanceof Building && entity.queue
          ? `${UNIT_CONFIG[entity.queue.unitKind].label} ${Math.floor(
              (entity.queue.elapsed / entity.queue.total) * 100
            )}%`
          : undefined
    }));
  }

  private publishHud(): void {
    const snapshot: HudSnapshot = {
      resources: {
        crumbs: Math.floor(this.resources.pigeon.crumbs),
        twigs: Math.floor(this.resources.pigeon.twigs)
      },
      population: {
        used: this.currentPopulation('pigeon'),
        cap: this.populationCap('pigeon')
      },
      elapsedSeconds: this.elapsedSeconds,
      selected: this.buildSelectionSnapshot(),
      commands: this.getCommands(),
      objective: LEVEL_OBJECTIVE,
      message: this.time.now < this.messageUntil ? this.message : '',
      paused: this.paused,
      pauseMenu: {
        canLoad: Boolean(loadLevelState()),
        saveLabel: this.saveLabel(),
        musicEnabled: getSettings().musicEnabled
      },
      gameOver: this.gameOver
    };
    setDebugState({
      scene: 'level',
      units: this.units.filter((unit) => unit.alive).length,
      buildings: this.buildings.filter((building) => building.alive).length,
      nodes: this.nodes.length,
      selected: this.selected.length,
      selection: snapshot.selected.map((item) => item.name).join(','),
      commands: snapshot.commands.length,
      firstCommand: snapshot.commands[0]?.id,
      cameraX: Math.round(this.cameras.main.scrollX),
      cameraY: Math.round(this.cameras.main.scrollY),
      blockedUnits: this.units.filter((unit) => unit.alive && this.isPointInsideBuilding(unit.position, unit.radius)).length,
      paused: this.paused,
      canLoad: Boolean(snapshot.pauseMenu?.canLoad),
      pop: snapshot.population.used,
      popCap: snapshot.population.cap,
      crumbs: snapshot.resources.crumbs,
      twigs: snapshot.resources.twigs,
      gameOver: this.gameOver
    });
    this.game.events.emit('hud:update', snapshot);
  }

  private checkGameOver(): void {
    if (this.gameOver) {
      return;
    }

    const pigeonBuildings = this.buildings.some((building) => building.alive && building.faction === 'pigeon');
    const magpieBuildings = this.buildings.some((building) => building.alive && building.faction === 'magpie');
    if (!magpieBuildings) {
      this.gameOver = 'win';
      this.setMessage('Victory.');
      this.gameMusic?.stop();
    } else if (!pigeonBuildings) {
      this.gameOver = 'lose';
      this.setMessage('Defeat.');
      this.gameMusic?.stop();
    }
  }

  private createSaveSnapshot(): SavedLevelState {
    const liveBuildings = this.buildings.filter((building) => building.alive);
    const liveNodes = this.nodes.filter((node) => node.amount > 0);
    const liveUnits = this.units.filter((unit) => unit.alive);
    const buildingIndex = new Map(liveBuildings.map((building, index) => [building, index]));
    const nodeIndex = new Map(liveNodes.map((node, index) => [node, index]));
    const unitIndex = new Map(liveUnits.map((unit, index) => [unit, index]));

    return {
      version: 1,
      savedAt: Date.now(),
      title: 'Old Fountain Park',
      elapsedSeconds: this.elapsedSeconds,
      resources: {
        pigeon: { ...this.resources.pigeon },
        magpie: { ...this.resources.magpie }
      },
      camera: {
        x: this.cameras.main.scrollX,
        y: this.cameras.main.scrollY
      },
      gameOver: this.gameOver,
      buildings: liveBuildings.map((building): SavedBuildingState => ({
        kind: building.kind,
        faction: building.faction,
        x: building.x,
        y: building.y,
        hp: building.hp,
        built: building.built,
        buildProgress: building.buildProgress,
        queue: building.queue ? { ...building.queue } : undefined
      })),
      nodes: liveNodes.map((node): SavedResourceState => ({
        kind: node.kind,
        x: node.x,
        y: node.y,
        amount: node.amount,
        maxAmount: node.maxAmount
      })),
      units: liveUnits.map((unit): SavedUnitState => {
        const targetUnitIndex = unit.targetEntity instanceof Unit ? unitIndex.get(unit.targetEntity) : undefined;
        const targetBuildingIndex = unit.targetEntity instanceof Building ? buildingIndex.get(unit.targetEntity) : undefined;
        return {
          kind: unit.kind,
          faction: unit.faction,
          x: unit.x,
          y: unit.y,
          hp: unit.hp,
          state: unit.state,
          targetPoint: unit.targetPoint ? { ...unit.targetPoint } : undefined,
          targetUnitIndex,
          targetBuildingIndex,
          gatherNodeIndex: unit.gatherNode ? nodeIndex.get(unit.gatherNode) : undefined,
          buildTargetIndex: unit.buildTarget ? buildingIndex.get(unit.buildTarget) : undefined,
          carrying: unit.carrying ? { ...unit.carrying } : undefined,
          homePost: { ...unit.homePost }
        };
      })
    };
  }

  private restoreLevelEntities(save: SavedLevelState): void {
    this.resources = {
      pigeon: { ...save.resources.pigeon },
      magpie: { ...save.resources.magpie }
    };
    this.elapsedSeconds = save.elapsedSeconds;
    this.gameOver = save.gameOver;

    for (const savedNode of save.nodes) {
      const node = new ResourceNode(this, savedNode.kind, savedNode.x, savedNode.y, savedNode.maxAmount);
      node.amount = savedNode.amount;
      node.refreshVisual();
      if (node.amount > 0) {
        this.nodes.push(node);
      }
    }

    for (const savedBuilding of save.buildings) {
      const building = this.addBuilding(savedBuilding.kind, savedBuilding.faction, savedBuilding.x, savedBuilding.y, savedBuilding.built);
      building.hp = savedBuilding.hp;
      building.buildProgress = savedBuilding.buildProgress;
      building.built = savedBuilding.built;
      building.queue = savedBuilding.queue ? { ...savedBuilding.queue } : undefined;
      building.refreshVisual();
    }

    const savedUnits = save.units;
    for (const savedUnit of savedUnits) {
      const unit = this.addUnit(savedUnit.kind, savedUnit.faction, savedUnit.x, savedUnit.y);
      unit.hp = savedUnit.hp;
      unit.state = savedUnit.state;
      unit.targetPoint = savedUnit.targetPoint ? { ...savedUnit.targetPoint } : undefined;
      unit.carrying = savedUnit.carrying ? { ...savedUnit.carrying } : undefined;
      unit.homePost = { ...savedUnit.homePost };
      unit.refreshVisual();
    }

    savedUnits.forEach((savedUnit, index) => {
      const unit = this.units[index];
      unit.gatherNode = savedUnit.gatherNodeIndex === undefined ? undefined : this.nodes[savedUnit.gatherNodeIndex];
      unit.buildTarget = savedUnit.buildTargetIndex === undefined ? undefined : this.buildings[savedUnit.buildTargetIndex];
      unit.targetEntity =
        savedUnit.targetUnitIndex !== undefined
          ? this.units[savedUnit.targetUnitIndex]
          : savedUnit.targetBuildingIndex !== undefined
            ? this.buildings[savedUnit.targetBuildingIndex]
            : undefined;
      unit.refreshVisual();
    });

    this.cameras.main.scrollX = clamp(save.camera.x, 0, WORLD.width - this.cameras.main.width);
    this.cameras.main.scrollY = clamp(save.camera.y, 0, WORLD.height - this.cameras.main.height);
  }

  private setPaused(paused: boolean): void {
    if (this.gameOver) {
      return;
    }
    this.paused = paused;
    this.setMessage(paused ? 'Paused.' : 'Resumed.', paused ? 3600 : 1.2);
    this.publishHud();
  }

  private resumeFromPause(): void {
    this.setPaused(false);
  }

  private async saveCurrentGame(): Promise<void> {
    const summary = await saveLevelState(this.createSaveSnapshot());
    const savedAt = new Date(summary.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.setMessage(`Saved locally at ${savedAt}.`, 2);
    this.publishHud();
  }

  private async loadSavedGame(): Promise<void> {
    const save = loadLevelState();
    if (!save) {
      this.setMessage('No local save found yet.', 2);
      this.publishHud();
      return;
    }
    this.scene.stop('UIScene');
    this.scene.restart({ save });
  }

  private async toggleMusicSetting(): Promise<void> {
    const settings = getSettings();
    const next = await updateSettings({ musicEnabled: !settings.musicEnabled });
    this.applyMusicSettings(next.musicEnabled, next.musicVolume);
    this.setMessage(next.musicEnabled ? 'Music enabled.' : 'Music muted.', 2);
    this.publishHud();
  }

  private applyMusicSettings(musicEnabled = getSettings().musicEnabled, musicVolume = getSettings().musicVolume): void {
    this.sound.volume = musicEnabled ? musicVolume : 0;
  }

  private saveLabel(): string {
    const summary = getSaveSummary();
    if (!summary) {
      return 'No local save yet';
    }
    const savedAt = new Date(summary.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${summary.title} saved ${savedAt}`;
  }

  private iconForUnit(faction: Faction, kind: UnitKind): string {
    if (faction === 'pigeon') {
      if (kind === 'poopBomber') {
        return TEXTURE_KEYS.pigeonBomber;
      }
      return kind === 'pecker' ? TEXTURE_KEYS.pigeonPecker : TEXTURE_KEYS.pigeonForager;
    }
    if (kind === 'poopBomber') {
      return TEXTURE_KEYS.magpieBomber;
    }
    return kind === 'pecker' ? TEXTURE_KEYS.magpiePecker : TEXTURE_KEYS.magpieForager;
  }

  private iconForBuilding(faction: Faction, kind: BuildingKind): string {
    if (kind === 'birdbath') {
      return faction === 'pigeon' ? TEXTURE_KEYS.pigeonBirdbath : TEXTURE_KEYS.magpieBirdbath;
    }
    if (kind === 'branchBarracks') {
      return faction === 'pigeon' ? TEXTURE_KEYS.pigeonBarracks : TEXTURE_KEYS.magpieBarracks;
    }
    return faction === 'pigeon' ? TEXTURE_KEYS.pigeonNest : TEXTURE_KEYS.magpieNest;
  }

  private findBlockingBuilding(from: Point, target: Point, padding: number, ignoreBuilding?: Building): Building | undefined {
    return this.buildings.find((building) => {
      if (!building.alive || building === ignoreBuilding) {
        return false;
      }
      return this.segmentIntersectsBuilding(from, target, building, padding);
    });
  }

  private isPointInsideBuilding(point: Point, padding: number, ignoreBuilding?: Building): boolean {
    return this.buildings.some((building) => {
      if (!building.alive || building === ignoreBuilding) {
        return false;
      }
      return this.pointInExpandedBuilding(point, building, padding);
    });
  }

  private segmentIntersectsBuilding(from: Point, target: Point, building: Building, padding: number): boolean {
    const rect = this.expandedBuildingRect(building, padding);
    if (this.pointInRect(from, rect) || this.pointInRect(target, rect)) {
      return true;
    }

    const topLeft = { x: rect.left, y: rect.top };
    const topRight = { x: rect.right, y: rect.top };
    const bottomLeft = { x: rect.left, y: rect.bottom };
    const bottomRight = { x: rect.right, y: rect.bottom };

    return (
      this.segmentsIntersect(from, target, topLeft, topRight) ||
      this.segmentsIntersect(from, target, topRight, bottomRight) ||
      this.segmentsIntersect(from, target, bottomRight, bottomLeft) ||
      this.segmentsIntersect(from, target, bottomLeft, topLeft)
    );
  }

  private pointInExpandedBuilding(point: Point, building: Building, padding: number): boolean {
    return this.pointInRect(point, this.expandedBuildingRect(building, padding));
  }

  private expandedBuildingRect(building: Building, padding: number): { left: number; right: number; top: number; bottom: number } {
    return {
      left: building.x - building.width / 2 - padding,
      right: building.x + building.width / 2 + padding,
      top: building.y - building.height / 2 - padding,
      bottom: building.y + building.height / 2 + padding
    };
  }

  private pointInRect(point: Point, rect: { left: number; right: number; top: number; bottom: number }): boolean {
    return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
  }

  private segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
    const ccw = (p1: Point, p2: Point, p3: Point): boolean =>
      (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
    return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
  }

  private isPointerOverHud(screenY: number): boolean {
    return screenY < this.topHudHeight() || screenY > this.scale.height - this.bottomHudHeight();
  }

  private topHudHeight(): number {
    return this.scale.width < 720 ? 46 : 54;
  }

  private bottomHudHeight(): number {
    return this.scale.width < 720 || this.scale.height < 560 ? 126 : 158;
  }

  private screenToWorld(pointer: Phaser.Input.Pointer): Point {
    const camera = this.cameras.main;
    return {
      x: pointer.x + camera.scrollX,
      y: pointer.y + camera.scrollY
    };
  }

  private isRightButton(pointer: Phaser.Input.Pointer): boolean {
    return (pointer.event as PointerEvent | undefined)?.button === 2;
  }

  private isTouchPointer(pointer: Phaser.Input.Pointer): boolean {
    return (pointer.event as PointerEvent | undefined)?.pointerType === 'touch' || pointer.wasTouch;
  }

  private cameraDirectionForKey(code: string, key: string): Point | undefined {
    const normalized = (code || key).toLowerCase();
    const keyName = key.toLowerCase();

    if (normalized === 'arrowleft' || normalized === 'keya' || keyName === 'a') {
      return { x: -1, y: 0 };
    }
    if (normalized === 'arrowright' || normalized === 'keyd' || keyName === 'd') {
      return { x: 1, y: 0 };
    }
    if (normalized === 'arrowup' || normalized === 'keyw' || keyName === 'w') {
      return { x: 0, y: -1 };
    }
    if (normalized === 'arrowdown' || normalized === 'keys' || keyName === 's') {
      return { x: 0, y: 1 };
    }
    return undefined;
  }

  private handleCameraKey(code: string, key: string, pressed: boolean): boolean {
    const direction = this.cameraDirectionForKey(code, key);

    if (!direction) {
      return false;
    }

    if (direction.x < 0) {
      this.cameraKeyState.left = pressed;
      return true;
    }
    if (direction.x > 0) {
      this.cameraKeyState.right = pressed;
      return true;
    }
    if (direction.y < 0) {
      this.cameraKeyState.up = pressed;
      return true;
    }
    if (direction.y > 0) {
      this.cameraKeyState.down = pressed;
      return true;
    }
    return false;
  }

  private nudgeCameraForKey(code: string, key: string): void {
    if (this.paused) {
      return;
    }

    const direction = this.cameraDirectionForKey(code, key);
    if (direction) {
      this.scrollCameraBy(direction.x, direction.y, WORLD.cameraSpeed * 0.12);
    }
  }

  private scrollCameraBy(dx: number, dy: number, pixels: number): void {
    const camera = this.cameras.main;
    const length = Math.hypot(dx, dy) || 1;
    camera.scrollX = clamp(camera.scrollX + (dx / length) * pixels, 0, WORLD.width - camera.width);
    camera.scrollY = clamp(camera.scrollY + (dy / length) * pixels, 0, WORLD.height - camera.height);
  }

  private setMessage(message: string, seconds = 2.2): void {
    this.message = message;
    this.messageUntil = this.time.now + seconds * 1000;
  }

  private restartLevel(): void {
    this.paused = false;
    this.scene.stop('UIScene');
    this.scene.restart();
  }

  private returnToMenu(): void {
    this.paused = false;
    this.scene.stop('UIScene');
    this.scene.start('MainMenuScene');
  }

  private shutdown(): void {
    this.cancelPlacement();
    this.gameMusic?.stop();
    this.game.events.off('ui:command', this.handleUiCommand, this);
    this.game.events.off('ui:restart', this.restartLevel, this);
    this.game.events.off('ui:menu', this.returnToMenu, this);
    this.game.events.off('ui:resume', this.resumeFromPause, this);
    this.game.events.off('ui:save', this.saveCurrentGame, this);
    this.game.events.off('ui:load', this.loadSavedGame, this);
    this.game.events.off('ui:toggleMusic', this.toggleMusicSetting, this);
    this.scale.off('resize', this.publishHud, this);
    window.removeEventListener('keydown', this.handleWindowKeyDown);
    window.removeEventListener('keyup', this.handleWindowKeyUp);
    window.removeEventListener('pointerup', this.handleWindowPointerUp);
    window.removeEventListener('mouseup', this.handleWindowMouseUp);
    window.removeEventListener('click', this.handleWindowClick);
  }
}
