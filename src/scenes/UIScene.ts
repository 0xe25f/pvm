// Oi mate! This is a coo!
import Phaser from 'phaser';
import type { HudCommand, HudSelection, HudSnapshot } from '../types';

export class UIScene extends Phaser.Scene {
  private topGraphics?: Phaser.GameObjects.Graphics;
  private bottomGraphics?: Phaser.GameObjects.Graphics;
  private resourceText?: Phaser.GameObjects.Text;
  private objectiveText?: Phaser.GameObjects.Text;
  private selectionName?: Phaser.GameObjects.Text;
  private selectionStats?: Phaser.GameObjects.Text;
  private messageText?: Phaser.GameObjects.Text;
  private portrait?: Phaser.GameObjects.Image;
  private commandLayer?: Phaser.GameObjects.Container;
  private pauseLayer?: Phaser.GameObjects.Container;
  private endLayer?: Phaser.GameObjects.Container;
  private latest?: HudSnapshot;

  constructor() {
    super('UIScene');
  }

  create(): void {
    this.topGraphics = this.add.graphics().setScrollFactor(0).setDepth(20000);
    this.bottomGraphics = this.add.graphics().setScrollFactor(0).setDepth(20000);
    this.resourceText = this.add.text(0, 0, '', this.textStyle(18, '#f0e6c7')).setDepth(20001);
    this.objectiveText = this.add.text(0, 0, '', this.textStyle(14, '#c7d3e8')).setDepth(20001);
    this.selectionName = this.add.text(0, 0, '', this.textStyle(20, '#f0e6c7')).setDepth(20001);
    this.selectionStats = this.add.text(0, 0, '', this.textStyle(14, '#b9c1d4')).setDepth(20001);
    this.messageText = this.add.text(0, 0, '', this.textStyle(15, '#ffd56b')).setOrigin(0.5).setDepth(20002);
    this.portrait = this.add.image(0, 0, '__WHITE').setVisible(false).setDepth(20001);
    this.commandLayer = this.add.container(0, 0).setDepth(20002);
    this.pauseLayer = this.add.container(0, 0).setDepth(21500).setVisible(false);
    this.endLayer = this.add.container(0, 0).setDepth(22000).setVisible(false);

    this.game.events.on('hud:update', this.updateHud, this);
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', this.shutdown, this);
    this.layout();
  }

  private updateHud(snapshot: HudSnapshot): void {
    this.latest = snapshot;
    const elapsed = this.formatTime(snapshot.elapsedSeconds);
    this.resourceText?.setText(
      `Breadcrumbs ${snapshot.resources.crumbs}    Twigs ${snapshot.resources.twigs}    Flock ${snapshot.population.used}/${snapshot.population.cap}    ${elapsed}`
    );
    this.objectiveText?.setText(snapshot.objective);
    this.messageText?.setText(snapshot.message);
    this.updateSelection(snapshot.selected);
    this.updateCommands(snapshot.commands);
    this.updatePauseLayer(snapshot);
    this.updateEndLayer(snapshot);
    this.layout();
  }

  private updateSelection(selection: HudSelection[]): void {
    if (selection.length === 0) {
      this.selectionName?.setText('No selection');
      this.selectionStats?.setText('');
      this.portrait?.setVisible(false);
      return;
    }

    if (selection.length > 1) {
      this.selectionName?.setText(`${selection.length} birds selected`);
      const pigeons = selection.filter((item) => item.faction === 'pigeon').length;
      this.selectionStats?.setText(`${pigeons} ready for orders`);
      this.portrait?.setVisible(false);
      return;
    }

    const selected = selection[0];
    this.selectionName?.setText(selected.name);
    this.selectionStats?.setText(
      `${selected.faction === 'pigeon' ? 'Pigeons' : 'Magpies'}  HP ${selected.hp}/${selected.maxHp}${
        selected.queueLabel ? `  ${selected.queueLabel}` : ''
      }`
    );
    this.portrait?.setTexture(selected.portraitTexture).setVisible(true);
  }

  private updateCommands(commands: HudCommand[]): void {
    this.commandLayer?.removeAll(true);
    if (!this.commandLayer) {
      return;
    }

    const compact = this.scale.width < 720 || this.scale.height < 560;
    const size = compact ? 46 : 54;
    const gap = compact ? 8 : 10;
    const columns = compact ? 4 : 5;

    for (const [index, command] of commands.entries()) {
      const x = (index % columns) * (size + gap);
      const y = Math.floor(index / columns) * (size + gap);
      const button = this.add.container(x, y);
      const bg = this.add
        .rectangle(0, 0, size, size, command.enabled ? 0x1e3555 : 0x252932, 0.95)
        .setStrokeStyle(2, command.enabled ? 0xb8924c : 0x525762);
      const icon = this.add.image(0, -6, command.iconTexture).setDisplaySize(size * 0.58, size * 0.58);
      const label = this.add
        .text(0, size / 2 - 12, this.shortLabel(command.label), this.textStyle(compact ? 9 : 10, command.enabled ? '#f0e6c7' : '#858995'))
        .setOrigin(0.5);
      button.add([bg, icon, label]);
      button.setSize(size, size);
      button.setInteractive(new Phaser.Geom.Rectangle(-size / 2, -size / 2, size, size), Phaser.Geom.Rectangle.Contains);
      if (command.enabled) {
        button.input!.cursor = 'pointer';
      }
      button.on('pointerover', () => {
        bg.setFillStyle(command.enabled ? 0x29486e : 0x252932, 0.98);
        this.messageText?.setText(command.detail);
      });
      button.on('pointerout', () => {
        bg.setFillStyle(command.enabled ? 0x1e3555 : 0x252932, 0.95);
        this.messageText?.setText(this.latest?.message ?? '');
      });
      button.on('pointerdown', () => {
        if (command.enabled) {
          this.game.events.emit('ui:command', command.id);
        } else {
          this.messageText?.setText(command.detail);
        }
      });
      this.commandLayer.add(button);
    }
  }

  private updateEndLayer(snapshot: HudSnapshot): void {
    if (!this.endLayer) {
      return;
    }

    if (!snapshot.gameOver) {
      this.endLayer.setVisible(false);
      return;
    }

    this.endLayer.removeAll(true);
    const width = this.scale.width;
    const height = this.scale.height;
    const panelWidth = Math.min(420, width - 38);
    const outcome = snapshot.gameOver === 'win' ? 'Victory' : 'Defeat';
    const detail = snapshot.gameOver === 'win' ? 'Old Fountain Park is yours.' : 'The Magpies hold the park.';

    const shade = this.add.rectangle(width / 2, height / 2, width, height, 0x07090d, 0.65);
    const panel = this.add
      .rectangle(width / 2, height / 2, panelWidth, 240, 0x151b23, 0.96)
      .setStrokeStyle(2, snapshot.gameOver === 'win' ? 0xd8aa42 : 0xc35d55);
    const title = this.add
      .text(width / 2, height / 2 - 70, outcome, this.textStyle(38, snapshot.gameOver === 'win' ? '#f0d58f' : '#ff9f94'))
      .setOrigin(0.5);
    const body = this.add.text(width / 2, height / 2 - 22, detail, this.textStyle(16, '#d7deec')).setOrigin(0.5);
    const retry = this.createEndButton(width / 2 - 76, height / 2 + 54, 'Retry', 'ui:restart');
    const menu = this.createEndButton(width / 2 + 76, height / 2 + 54, 'Menu', 'ui:menu');
    this.endLayer.add([shade, panel, title, body, retry, menu]);
    this.endLayer.setVisible(true);
  }

  private updatePauseLayer(snapshot: HudSnapshot): void {
    if (!this.pauseLayer) {
      return;
    }

    if (!snapshot.paused || !snapshot.pauseMenu || snapshot.gameOver) {
      this.pauseLayer.setVisible(false);
      return;
    }

    this.pauseLayer.removeAll(true);
    const width = this.scale.width;
    const height = this.scale.height;
    const panelWidth = Math.min(390, width - 34);
    const panelHeight = 390;

    const shade = this.add.rectangle(width / 2, height / 2, width, height, 0x06080c, 0.62);
    const panel = this.add
      .rectangle(width / 2, height / 2, panelWidth, panelHeight, 0x151b23, 0.98)
      .setStrokeStyle(2, 0xb8924c);
    const title = this.add.text(width / 2, height / 2 - 154, 'Paused', this.textStyle(34, '#f0d58f')).setOrigin(0.5);
    const saveInfo = this.add
      .text(width / 2, height / 2 + 150, snapshot.pauseMenu.saveLabel, this.textStyle(12, '#aeb8ca'))
      .setOrigin(0.5);

    const buttons = [
      { label: 'Resume', eventName: 'ui:resume', enabled: true },
      { label: 'Save Game', eventName: 'ui:save', enabled: true },
      { label: 'Load Game', eventName: 'ui:load', enabled: snapshot.pauseMenu.canLoad },
      {
        label: snapshot.pauseMenu.musicEnabled ? 'Mute Music' : 'Enable Music',
        eventName: 'ui:toggleMusic',
        enabled: true
      },
      { label: 'Exit to Main Menu', eventName: 'ui:menu', enabled: true }
    ];

    this.pauseLayer.add([shade, panel, title, saveInfo]);
    buttons.forEach((button, index) => {
      this.pauseLayer?.add(
        this.createPauseButton(width / 2, height / 2 - 64 + index * 52, Math.min(320, width - 40), 44, button.label, button.eventName, button.enabled)
      );
    });
    this.pauseLayer.setVisible(true);
  }

  private createPauseButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    eventName: string,
    enabled: boolean
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const bg = this.add
      .rectangle(0, 0, width, height, enabled ? 0x1e3555 : 0x252932, 0.96)
      .setStrokeStyle(2, enabled ? 0xb8924c : 0x555b66);
    const text = this.add.text(0, 0, label, this.textStyle(18, enabled ? '#f0e6c7' : '#858995')).setOrigin(0.5);
    container.add([bg, text]);
    container.setSize(width, height);
    container.setInteractive(new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height), Phaser.Geom.Rectangle.Contains);
    if (enabled) {
      container.input!.cursor = 'pointer';
    }
    container.on('pointerover', () => {
      if (enabled) {
        bg.setFillStyle(0x29486e, 0.98);
      }
    });
    container.on('pointerout', () => bg.setFillStyle(enabled ? 0x1e3555 : 0x252932, 0.96));
    container.on('pointerdown', () => {
      if (enabled) {
        this.game.events.emit(eventName);
      }
    });
    return container;
  }

  private createEndButton(x: number, y: number, label: string, eventName: string): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, 124, 44, 0x1e3555, 0.95).setStrokeStyle(2, 0xb8924c);
    const text = this.add.text(0, 0, label, this.textStyle(18, '#f0e6c7')).setOrigin(0.5);
    container.add([bg, text]);
    container.setSize(124, 44);
    container.setInteractive(new Phaser.Geom.Rectangle(-62, -22, 124, 44), Phaser.Geom.Rectangle.Contains);
    container.input!.cursor = 'pointer';
    container.on('pointerover', () => bg.setFillStyle(0x29486e, 0.98));
    container.on('pointerout', () => bg.setFillStyle(0x1e3555, 0.95));
    container.on('pointerdown', () => this.game.events.emit(eventName));
    return container;
  }

  private layout(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const topHeight = this.topHudHeight();
    const bottomHeight = this.bottomHudHeight();
    const compact = width < 720 || height < 560;

    this.topGraphics?.clear();
    this.topGraphics?.fillStyle(0x10141b, 0.94);
    this.topGraphics?.fillRect(0, 0, width, topHeight);
    this.topGraphics?.lineStyle(2, 0x5e636f, 1);
    this.topGraphics?.lineBetween(0, topHeight, width, topHeight);

    this.bottomGraphics?.clear();
    this.bottomGraphics?.fillStyle(0x11151c, 0.96);
    this.bottomGraphics?.fillRect(0, height - bottomHeight, width, bottomHeight);
    this.bottomGraphics?.lineStyle(2, 0x5e636f, 1);
    this.bottomGraphics?.lineBetween(0, height - bottomHeight, width, height - bottomHeight);

    this.resourceText?.setFontSize(compact ? 12 : 18).setPosition(compact ? 10 : 18, compact ? 14 : 15);
    this.objectiveText
      ?.setFontSize(compact ? 11 : 14)
      .setPosition(width - (compact ? 10 : 18), compact ? 15 : 16)
      .setOrigin(1, 0);

    const bottomY = height - bottomHeight;
    const portraitSize = compact ? 58 : 86;
    this.portrait
      ?.setPosition(compact ? 42 : 66, bottomY + bottomHeight / 2)
      .setDisplaySize(portraitSize, portraitSize);
    this.selectionName
      ?.setFontSize(compact ? 16 : 22)
      .setPosition(compact ? 80 : 124, bottomY + (compact ? 20 : 28));
    this.selectionStats
      ?.setFontSize(compact ? 12 : 15)
      .setPosition(compact ? 80 : 124, bottomY + (compact ? 48 : 64));

    this.messageText?.setPosition(width / 2, bottomY - 18).setFontSize(compact ? 12 : 15);

    const commandsX = compact ? Math.max(width - 218, 252) : Math.max(width - 336, 430);
    const commandsY = bottomY + (compact ? 22 : 28);
    this.commandLayer?.setPosition(commandsX, commandsY);
  }

  private textStyle(size: number, colour: string): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: 'Trebuchet MS, "Segoe UI", sans-serif',
      fontSize: `${size}px`,
      color: colour,
      stroke: '#05070a',
      strokeThickness: 3
    };
  }

  private shortLabel(label: string): string {
    if (label === 'Poop-Bomber') {
      return 'Bomber';
    }
    if (label === 'Branch Barracks') {
      return 'Barracks';
    }
    return label;
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');
    return `${mins}:${secs}`;
  }

  private topHudHeight(): number {
    return this.scale.width < 720 ? 46 : 54;
  }

  private bottomHudHeight(): number {
    return this.scale.width < 720 || this.scale.height < 560 ? 126 : 158;
  }

  private shutdown(): void {
    this.game.events.off('hud:update', this.updateHud, this);
    this.scale.off('resize', this.layout, this);
  }
}
