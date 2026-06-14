// Oi mate! This is a coo!
import Phaser from 'phaser';
import './style.css';
import { LevelScene } from './scenes/LevelScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { PreloaderScene } from './scenes/PreloaderScene';
import { UIScene } from './scenes/UIScene';
import { initPersistence } from './persistence/GamePersistence';

await initPersistence();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-shell',
  backgroundColor: '#11151c',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight
  },
  input: {
    activePointers: 3
  },
  render: {
    antialias: false
  },
  scene: [PreloaderScene, MainMenuScene, LevelScene, UIScene]
};

const game = new Phaser.Game(config);

if (import.meta.env.DEV) {
  window.__PVM_GAME__ = game;
}

declare global {
  interface Window {
    __PVM_GAME__?: Phaser.Game;
  }
}
