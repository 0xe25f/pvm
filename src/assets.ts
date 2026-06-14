// Oi mate! This is a coo!
import mainMenuBackgroundUrl from '../resources/art/main-menu-background.png?url';
import mainMenuMockupUrl from '../resources/art/main-menu-mockup.jpg?url';
import spritesUrl from '../resources/art/sprites.png?url';
import uiElementsUrl from '../resources/art/ui-elements.png?url';
import worldMockupUrl from '../resources/art/pvm-game-world-mockup.png?url';
import gameLoopOneUrl from '../resources/music/game-loop-1.mp3?url';
import gameLoopTwoUrl from '../resources/music/game-loop-2.mp3?url';
import mainMenuMusicUrl from '../resources/music/main-menu.mp3?url';

export const ASSETS = {
  images: {
    mainMenuBackground: mainMenuBackgroundUrl,
    mainMenuMockup: mainMenuMockupUrl,
    sprites: spritesUrl,
    uiElements: uiElementsUrl,
    worldMockup: worldMockupUrl
  },
  audio: {
    mainMenu: mainMenuMusicUrl,
    gameLoopOne: gameLoopOneUrl,
    gameLoopTwo: gameLoopTwoUrl
  }
} as const;

export const TEXTURE_KEYS = {
  menuBackground: 'menu-background',
  menuMockup: 'menu-mockup',
  sprites: 'sprites',
  uiElements: 'ui-elements',
  worldMockup: 'world-mockup',
  logo: 'pvm-logo',
  pigeonForager: 'pigeon-forager',
  pigeonPecker: 'pigeon-pecker',
  pigeonBomber: 'pigeon-bomber',
  magpieForager: 'magpie-forager',
  magpiePecker: 'magpie-pecker',
  magpieBomber: 'magpie-bomber',
  pigeonNest: 'pigeon-nest',
  pigeonBarracks: 'pigeon-barracks',
  magpieNest: 'magpie-nest',
  magpieBarracks: 'magpie-barracks',
  pigeonBirdbath: 'pigeon-birdbath',
  magpieBirdbath: 'magpie-birdbath',
  grassTile: 'grass-tile',
  dirtTile: 'dirt-tile',
  sparkle: 'sparkle'
} as const;

export const AUDIO_KEYS = {
  mainMenu: 'main-menu',
  gameLoopOne: 'game-loop-1',
  gameLoopTwo: 'game-loop-2'
} as const;
