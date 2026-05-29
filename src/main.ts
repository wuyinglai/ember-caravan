import Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';

// 全局错误处理
window.onerror = (message, source, lineno, colno, error) => {
  console.error('[全局错误]', message, source, lineno, colno, error);
  return false;
};

window.onunhandledrejection = (event) => {
  console.error('[未处理的Promise]', event.reason);
};

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 960,
  height: 640,
  parent: 'app',
  backgroundColor: '#0a0a1a',
  scene: [BattleScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
console.log('[余烬商队] 核心战斗原型已启动');
