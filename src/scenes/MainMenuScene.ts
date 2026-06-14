// Oi mate! This is a coo!
import Phaser from 'phaser';
import { AUDIO_KEYS, TEXTURE_KEYS } from '../assets';
import { setDebugState } from '../debug';
import { getSettings, hasSavedGame, loadLevelState, type SavedLevelState } from '../persistence/GamePersistence';

export class MainMenuScene extends Phaser.Scene {
  private background?: Phaser.GameObjects.Image;
  private logo?: Phaser.GameObjects.Image;
  private menuMusic?: Phaser.Sound.BaseSound;
  private menuItems: Phaser.GameObjects.Container[] = [];
  private menuActions: Array<{
    action: () => void;
    enabled: boolean;
    disabledMessage?: string;
  }> = [];
  private lastMenuActionAt = 0;
  private readonly handleWindowPointerUp = (event: PointerEvent): void => {
    this.handleWindowMenuClick(event);
  };
  private readonly handleWindowMouseUp = (event: MouseEvent): void => {
    this.handleWindowMenuClick(event);
  };
  private readonly handleWindowClick = (event: MouseEvent): void => {
    this.handleWindowMenuClick(event);
  };
  private handleWindowMenuClick(event: MouseEvent): void {
    if (!this.scene.isActive('MainMenuScene')) {
      return;
    }
    if (this.handleMenuPointerAt(event.clientX, event.clientY)) {
      event.preventDefault();
    }
  }

  constructor() {
    super('MainMenuScene');
  }

  create(): void {
    setDebugState({
      scene: 'menu',
      paused: undefined,
      selected: undefined,
      commands: undefined,
      blockedUnits: undefined
    });
    this.cameras.main.setBackgroundColor('#11151c');
    this.background = this.add.image(0, 0, TEXTURE_KEYS.menuBackground).setOrigin(0.5);
    this.add.rectangle(0, 0, 10, 10, 0x06080c, 0.26).setOrigin(0).setScrollFactor(0).setName('shade');
    this.logo = this.add.image(0, 0, TEXTURE_KEYS.logo).setOrigin(0.5);

    this.menuMusic = this.sound.add(AUDIO_KEYS.mainMenu, { loop: true, volume: 0.42 });
    this.input.once('pointerdown', () => this.startMusic());
    this.input.keyboard?.once('keydown', () => this.startMusic());

    this.createButtons();
    this.input.on('pointerup', this.handleMenuPointerUp, this);
    window.addEventListener('pointerup', this.handleWindowPointerUp, { passive: false });
    window.addEventListener('mouseup', this.handleWindowMouseUp, { passive: false });
    window.addEventListener('click', this.handleWindowClick, { passive: false });
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', this.shutdown, this);

    this.input.keyboard?.on('keydown-ENTER', () => this.startLevel());
    this.input.keyboard?.on('keydown-SPACE', () => this.startLevel());
  }

  shutdown(): void {
    this.scale.off('resize', this.layout, this);
    this.input.off('pointerup', this.handleMenuPointerUp, this);
    window.removeEventListener('pointerup', this.handleWindowPointerUp);
    window.removeEventListener('mouseup', this.handleWindowMouseUp);
    window.removeEventListener('click', this.handleWindowClick);
  }

  private createButtons(): void {
    this.menuItems = [];
    this.menuActions = [];
    const canContinue = hasSavedGame();
    const buttons = [
      ['Continue', () => this.continueSavedGame(), canContinue],
      ['First Level', () => this.startLevel(), true],
      ['Skirmish', () => this.startLevel(), true],
      ['Options', () => this.flashButtonMessage(), false],
      ['Credits', () => this.flashButtonMessage(), false]
    ] as const;

    buttons.forEach(([label, action, enabled], index) => {
      const container = this.add.container(0, 0);
      const width = 280;
      const height = 58;
      const base = this.add
        .rectangle(0, 0, width, height, enabled ? 0x173255 : 0x22242a, 0.93)
        .setStrokeStyle(2, enabled ? 0xb8924c : 0x58595f);
      const text = this.add
        .text(0, 0, label, {
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: '25px',
          color: enabled ? '#f0d58f' : '#8d8f96',
          stroke: '#121212',
          strokeThickness: 3
        })
        .setOrigin(0.5);
      container.add([base, text]);
      container.setSize(width, height);
      container.setInteractive(new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height), Phaser.Geom.Rectangle.Contains);
      if (enabled) {
        container.input!.cursor = 'pointer';
      }
      container.on('pointerover', () => {
        if (enabled) {
          base.setFillStyle(0x24476f, 0.98);
        }
      });
      container.on('pointerout', () => {
        base.setFillStyle(enabled ? 0x173255 : 0x22242a, 0.93);
      });
      container.on('pointerdown', () => {
        this.activateMenuItem(index);
      });
      this.menuItems.push(container);
      this.menuActions.push({
        action,
        enabled,
        disabledMessage: label === 'Continue' ? 'No local save found yet.' : undefined
      });
    });
  }

  private handleMenuPointerUp(pointer: Phaser.Input.Pointer): void {
    this.handleMenuPointerAt(pointer.x, pointer.y);
  }

  private handleMenuPointerAt(screenX: number, screenY: number): boolean {
    for (const [index, item] of this.menuItems.entries()) {
      const width = 280 * item.scaleX;
      const height = 58 * item.scaleY;
      if (Math.abs(screenX - item.x) <= width / 2 && Math.abs(screenY - item.y) <= height / 2) {
        this.activateMenuItem(index);
        return true;
      }
    }
    return false;
  }

  private activateMenuItem(index: number): void {
    if (this.time.now - this.lastMenuActionAt < 180) {
      return;
    }
    this.lastMenuActionAt = this.time.now;
    const entry = this.menuActions[index];
    if (!entry) {
      return;
    }
    if (entry.enabled) {
      entry.action();
    } else {
      this.flashButtonMessage(entry.disabledMessage);
    }
  }

  private layout(): void {
    if (!this.cameras.main) {
      return;
    }

    const width = this.scale.width;
    const height = this.scale.height;
    this.cameras.main.setViewport(0, 0, width, height);

    if (this.background) {
      const bgScale = Math.max(width / this.background.width, height / this.background.height);
      this.background.setPosition(width / 2, height / 2).setScale(bgScale);
    }

    const shade = this.children.getByName('shade') as Phaser.GameObjects.Rectangle | null;
    shade?.setSize(width, height);

    if (this.logo) {
      const logoScale = Phaser.Math.Clamp(width / 780, 0.52, 1);
      const logoX = width < 760 ? width / 2 : Math.min(width * 0.28, 340);
      const logoY = width < 760 ? Math.max(105, height * 0.16) : Math.max(130, height * 0.19);
      this.logo.setPosition(logoX, logoY).setScale(logoScale);
    }

    const compact = width < 760;
    const buttonX = compact ? width / 2 : width - Math.min(260, width * 0.2);
    const startY = compact ? Math.max(height * 0.48, 300) : Math.max(height * 0.26, 210);
    const gap = compact ? 64 : 72;
    for (const [index, item] of this.menuItems.entries()) {
      item.setPosition(buttonX, startY + index * gap);
      item.setScale(compact ? 0.86 : 1);
    }
    setDebugState({
      menuX: Math.round(buttonX),
      menuStartY: Math.round(startY),
      menuGap: gap
    });
  }

  private startMusic(): void {
    const settings = getSettings();
    if (this.menuMusic && !this.menuMusic.isPlaying) {
      this.sound.volume = settings.musicEnabled ? Math.min(0.48, settings.musicVolume + 0.14) : 0;
      this.menuMusic.play();
    }
  }

  private startLevel(save?: SavedLevelState): void {
    setDebugState({ scene: 'level-loading' });
    this.startMusic();
    this.cameras.main.fadeOut(360, 0, 0, 0);
    window.setTimeout(() => {
      this.menuMusic?.stop();
      this.game.scene.start('LevelScene', save ? { save } : undefined);
    }, 360);
  }

  private continueSavedGame(): void {
    const save = loadLevelState();
    if (!save) {
      this.flashButtonMessage('No local save found yet.');
      return;
    }
    this.startLevel(save);
  }

  private flashButtonMessage(message = 'Available after the first park skirmish.'): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const note = this.add
      .text(width / 2, height - 42, message, {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '15px',
        color: '#e8e1cf',
        stroke: '#11151c',
        strokeThickness: 3
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: note,
      alpha: 0,
      y: note.y - 12,
      duration: 1200,
      onComplete: () => note.destroy()
    });
  }
}
