// Oi mate! This is a coo!
import Phaser from 'phaser';
import { ASSETS, AUDIO_KEYS, TEXTURE_KEYS } from '../assets';
import { setDebugState } from '../debug';

interface CropRect {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  transparent?: boolean;
}

const SPRITE_CROPS: CropRect[] = [
  { key: TEXTURE_KEYS.logo, x: 20, y: 32, width: 300, height: 178, transparent: true },
  { key: TEXTURE_KEYS.pigeonForager, x: 492, y: 86, width: 58, height: 60, transparent: true },
  { key: TEXTURE_KEYS.pigeonPecker, x: 594, y: 176, width: 72, height: 58, transparent: true },
  { key: TEXTURE_KEYS.pigeonBomber, x: 672, y: 258, width: 78, height: 68, transparent: true },
  { key: TEXTURE_KEYS.magpieForager, x: 426, y: 574, width: 58, height: 68, transparent: true },
  { key: TEXTURE_KEYS.magpiePecker, x: 540, y: 666, width: 80, height: 56, transparent: true },
  { key: TEXTURE_KEYS.magpieBomber, x: 760, y: 748, width: 82, height: 78, transparent: true },
  { key: TEXTURE_KEYS.pigeonNest, x: 1280, y: 92, width: 160, height: 126, transparent: true },
  { key: TEXTURE_KEYS.pigeonBarracks, x: 1270, y: 270, width: 190, height: 136, transparent: true },
  { key: TEXTURE_KEYS.magpieNest, x: 1280, y: 575, width: 162, height: 128, transparent: true },
  { key: TEXTURE_KEYS.magpieBarracks, x: 1270, y: 750, width: 195, height: 142, transparent: true }
];

export class PreloaderScene extends Phaser.Scene {
  private progressFill?: Phaser.GameObjects.Rectangle;
  private progressText?: Phaser.GameObjects.Text;

  constructor() {
    super('PreloaderScene');
  }

  preload(): void {
    setDebugState({ scene: 'preloader' });
    this.createLoadingScreen();

    this.load.image(TEXTURE_KEYS.menuBackground, ASSETS.images.mainMenuBackground);
    this.load.image(TEXTURE_KEYS.menuMockup, ASSETS.images.mainMenuMockup);
    this.load.image(TEXTURE_KEYS.sprites, ASSETS.images.sprites);
    this.load.image(TEXTURE_KEYS.uiElements, ASSETS.images.uiElements);
    this.load.image(TEXTURE_KEYS.worldMockup, ASSETS.images.worldMockup);
    this.load.audio(AUDIO_KEYS.mainMenu, ASSETS.audio.mainMenu);
    this.load.audio(AUDIO_KEYS.gameLoopOne, ASSETS.audio.gameLoopOne);
    this.load.audio(AUDIO_KEYS.gameLoopTwo, ASSETS.audio.gameLoopTwo);

    this.load.on('progress', (progress: number) => {
      this.progressFill?.setScale(progress, 1);
      this.progressText?.setText(`Loading ${Math.round(progress * 100)}%`);
    });
  }

  create(): void {
    this.createCroppedTextures();
    this.createGeneratedTextures();
    setDebugState({ scene: 'menu-ready' });
    window.setTimeout(() => {
      setDebugState({ scene: 'menu-starting' });
      this.game.scene.start('MainMenuScene');
    }, 0);
  }

  private createLoadingScreen(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#11151c');

    const title = this.add
      .text(width / 2, height / 2 - 72, 'Pigeons vs Magpies', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: `${Math.round(Math.min(width, 760) / 11)}px`,
        color: '#e8e1cf',
        stroke: '#181818',
        strokeThickness: 5
      })
      .setOrigin(0.5);

    const barWidth = Math.min(440, width * 0.72);
    this.add.rectangle(width / 2, height / 2 + 6, barWidth, 14, 0x0b0d12, 0.9).setStrokeStyle(2, 0x7f6f51);
    this.progressFill = this.add
      .rectangle(width / 2 - barWidth / 2 + 2, height / 2 + 6, barWidth - 4, 10, 0xd8aa42, 1)
      .setOrigin(0, 0.5)
      .setScale(0, 1);

    this.progressText = this.add
      .text(width / 2, height / 2 + 34, 'Loading 0%', {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '16px',
        color: '#b9c1d4'
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: title,
      alpha: 0.72,
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  private createCroppedTextures(): void {
    for (const crop of SPRITE_CROPS) {
      this.addCroppedTexture(TEXTURE_KEYS.sprites, crop);
    }
  }

  private addCroppedTexture(sourceKey: string, crop: CropRect): void {
    const texture = this.textures.get(sourceKey);
    const sourceImage = texture.getSourceImage() as CanvasImageSource;
    const canvas = document.createElement('canvas');
    canvas.width = crop.width;
    canvas.height = crop.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return;
    }

    context.drawImage(sourceImage, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    if (crop.transparent) {
      this.removeConnectedBackdrop(context, crop.width, crop.height);
    }

    if (this.textures.exists(crop.key)) {
      this.textures.remove(crop.key);
    }
    this.textures.addCanvas(crop.key, canvas);
  }

  private removeConnectedBackdrop(context: CanvasRenderingContext2D, width: number, height: number): void {
    const image = context.getImageData(0, 0, width, height);
    const data = image.data;
    const cornerSamples = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1]
    ];

    const average = cornerSamples.reduce(
      (acc, [x, y]) => {
        const index = (y * width + x) * 4;
        acc.r += data[index];
        acc.g += data[index + 1];
        acc.b += data[index + 2];
        return acc;
      },
      { r: 0, g: 0, b: 0 }
    );
    average.r /= cornerSamples.length;
    average.g /= cornerSamples.length;
    average.b /= cornerSamples.length;

    const isBackdrop = (x: number, y: number): boolean => {
      const index = (y * width + x) * 4;
      if (data[index + 3] === 0) {
        return false;
      }
      const dr = data[index] - average.r;
      const dg = data[index + 1] - average.g;
      const db = data[index + 2] - average.b;
      const colourDistance = Math.sqrt(dr * dr + dg * dg + db * db);
      const brightness = Math.max(data[index], data[index + 1], data[index + 2]);
      return colourDistance < 34 && brightness < 76;
    };

    const queue: Point2D[] = [];
    const seen = new Uint8Array(width * height);
    for (let x = 0; x < width; x += 1) {
      queue.push({ x, y: 0 }, { x, y: height - 1 });
    }
    for (let y = 1; y < height - 1; y += 1) {
      queue.push({ x: 0, y }, { x: width - 1, y });
    }

    for (let head = 0; head < queue.length; head += 1) {
      const point = queue[head];
      if (point.x < 0 || point.y < 0 || point.x >= width || point.y >= height) {
        continue;
      }
      const key = point.y * width + point.x;
      if (seen[key] || !isBackdrop(point.x, point.y)) {
        continue;
      }
      seen[key] = 1;
      data[key * 4 + 3] = 0;
      queue.push(
        { x: point.x + 1, y: point.y },
        { x: point.x - 1, y: point.y },
        { x: point.x, y: point.y + 1 },
        { x: point.x, y: point.y - 1 }
      );
    }

    context.putImageData(image, 0, 0);
  }

  private createGeneratedTextures(): void {
    this.createTileTexture(TEXTURE_KEYS.grassTile, '#3d7738', '#2f6530', '#60934f');
    this.createTileTexture(TEXTURE_KEYS.dirtTile, '#775c35', '#5c462b', '#9d7a45');
    this.createBirdbathTexture(TEXTURE_KEYS.pigeonBirdbath, 0x3973bd);
    this.createBirdbathTexture(TEXTURE_KEYS.magpieBirdbath, 0x2d2f37);
    this.createSparkleTexture();
  }

  private createTileTexture(key: string, base: string, shadow: string, highlight: string): void {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.fillStyle = base;
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = shadow;
    for (let i = 0; i < 18; i += 1) {
      context.fillRect((i * 19) % 64, (i * 31) % 64, 2 + (i % 4), 1);
    }
    context.fillStyle = highlight;
    for (let i = 0; i < 14; i += 1) {
      context.fillRect((i * 29 + 8) % 64, (i * 17 + 11) % 64, 1, 3);
    }
    this.textures.addCanvas(key, canvas);
  }

  private createBirdbathTexture(key: string, accent: number): void {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0x1a1e25, 0);
    graphics.fillRect(0, 0, 80, 80);
    graphics.fillStyle(0x686b70, 1);
    graphics.fillEllipse(40, 45, 58, 24);
    graphics.fillStyle(0x4a4d53, 1);
    graphics.fillEllipse(40, 47, 48, 16);
    graphics.fillStyle(accent, 0.9);
    graphics.fillEllipse(40, 43, 38, 10);
    graphics.fillStyle(0x3d3f46, 1);
    graphics.fillRect(34, 49, 12, 19);
    graphics.fillStyle(0x2c2f35, 1);
    graphics.fillRoundedRect(25, 65, 30, 7, 2);
    graphics.generateTexture(key, 80, 80);
    graphics.destroy();
  }

  private createSparkleTexture(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(8, 8, 2);
    graphics.lineStyle(1, 0xffffff, 0.8);
    graphics.lineBetween(8, 1, 8, 15);
    graphics.lineBetween(1, 8, 15, 8);
    graphics.generateTexture(TEXTURE_KEYS.sparkle, 16, 16);
    graphics.destroy();
  }
}

interface Point2D {
  x: number;
  y: number;
}
