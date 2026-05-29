import Phaser from 'phaser';
import { getGameState, setGameState, moveToCell, checkGameOver, checkVictory, MapCell, CellType, resetGameState } from '../systems/GameState';
import { CHARACTER_DEFS } from '../data/characters';

export class MapScene extends Phaser.Scene {
  private cellGraphics: Phaser.GameObjects.Graphics[][] = [];
  private cellTexts: Phaser.GameObjects.Text[][] = [];
  private cellHitAreas: Phaser.GameObjects.Zone[][] = [];
  private resourceTexts: { [key: string]: Phaser.GameObjects.Text } = {};
  private cellSize = 60;
  private cellGap = 8;

  constructor() {
    super({ key: 'MapScene' });
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRect(0, 0, w, h);

    // 获取游戏状态
    const gameState = getGameState();

    // 创建资源显示
    this.createResourceDisplay(w, h);

    // 计算地图起始位置（居中）
    const mapWidth = gameState.mapWidth * (this.cellSize + this.cellGap) - this.cellGap;
    const mapHeight = gameState.mapHeight * (this.cellSize + this.cellGap) - this.cellGap;
    const startX = (w - mapWidth) / 2;
    const startY = (h - mapHeight) / 2 + 20;

    // 创建地图格子
    this.createMapGrid(startX, startY, gameState);

    // 创建队伍显示
    this.createPartyDisplay(startX, startY - 60, gameState);

    // 键盘方向键移动（备用操作方式）
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const gameState = getGameState();
      const { x, y } = gameState.currentPosition;
      let nx = x, ny = y;
      switch (event.key) {
        case 'ArrowUp': ny = y - 1; break;
        case 'ArrowDown': ny = y + 1; break;
        case 'ArrowLeft': nx = x - 1; break;
        case 'ArrowRight': nx = x + 1; break;
        default: return;
      }
      if (nx >= 0 && nx < gameState.mapWidth && ny >= 0 && ny < gameState.mapHeight) {
        if (gameState.mapCells[ny][nx].isReachable) {
          this.onCellClick(nx, ny);
        }
      }
    });

    // 检查游戏结束
    this.checkGameStatus(gameState);

    console.log('[地图] 地图场景已加载');
  }

  private createResourceDisplay(w: number, h: number): void {
    const gameState = getGameState();
    const y = 15;
    const spacing = 140;
    const startX = w / 2 - spacing * 2.5;

    // 天数
    this.resourceTexts['day'] = this.add.text(startX, y, `📅 ${gameState.day}/${gameState.maxDay}`, {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });

    // 粮食
    const foodColor = gameState.food > 0 ? '#88ff88' : '#ff6666';
    this.resourceTexts['food'] = this.add.text(startX + spacing, y, `🍞 ${gameState.food}`, {
      fontSize: '16px',
      color: foodColor,
      fontFamily: 'monospace',
    });

    // 士气
    const moraleColor = gameState.morale >= 3 ? '#ffcc44' : (gameState.morale > 0 ? '#ff8844' : '#ff4444');
    this.resourceTexts['morale'] = this.add.text(startX + spacing * 2, y, `💪 ${gameState.morale}`, {
      fontSize: '16px',
      color: moraleColor,
      fontFamily: 'monospace',
    });

    // 商队耐久
    const caravanColor = gameState.caravanHp > gameState.caravanMaxHp * 0.5 ? '#88ccff' : '#ffaa44';
    this.resourceTexts['caravan'] = this.add.text(startX + spacing * 3, y, `🚗 ${gameState.caravanHp}/${gameState.caravanMaxHp}`, {
      fontSize: '16px',
      color: caravanColor,
      fontFamily: 'monospace',
    });

    // 当前位置
    this.resourceTexts['position'] = this.add.text(startX + spacing * 4, y,
      `📍 ${gameState.currentPosition.x},${gameState.currentPosition.y}`, {
      fontSize: '16px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    });
  }

  private updateResourceDisplay(): void {
    const gameState = getGameState();

    this.resourceTexts['day'].setText(`📅 ${gameState.day}/${gameState.maxDay}`);

    const foodColor = gameState.food > 0 ? '#88ff88' : '#ff6666';
    this.resourceTexts['food'].setText(`🍞 ${gameState.food}`);
    this.resourceTexts['food'].setColor(foodColor);

    const moraleColor = gameState.morale >= 3 ? '#ffcc44' : (gameState.morale > 0 ? '#ff8844' : '#ff4444');
    this.resourceTexts['morale'].setText(`💪 ${gameState.morale}`);
    this.resourceTexts['morale'].setColor(moraleColor);

    const caravanColor = gameState.caravanHp > gameState.caravanMaxHp * 0.5 ? '#88ccff' : '#ffaa44';
    this.resourceTexts['caravan'].setText(`🚗 ${gameState.caravanHp}/${gameState.caravanMaxHp}`);
    this.resourceTexts['caravan'].setColor(caravanColor);

    this.resourceTexts['position'].setText(`📍 ${gameState.currentPosition.x},${gameState.currentPosition.y}`);
  }

  private createPartyDisplay(x: number, y: number, gameState: ReturnType<typeof getGameState>): void {
    this.add.text(x, y, '远征队伍:', {
      fontSize: '14px',
      color: '#888888',
      fontFamily: 'monospace',
    });

    let offsetX = 80;
    for (const charId of gameState.selectedCharacters) {
      const charDef = CHARACTER_DEFS[charId];
      this.add.text(x + offsetX, y, `${charDef.icon} ${charDef.name}`, {
        fontSize: '14px',
        color: '#' + charDef.color.toString(16).padStart(6, '0'),
        fontFamily: 'monospace',
      });
      offsetX += 100;
    }
  }

  private createMapGrid(startX: number, startY: number, gameState: ReturnType<typeof getGameState>): void {
    for (let y = 0; y < gameState.mapHeight; y++) {
      this.cellGraphics[y] = [];
      this.cellTexts[y] = [];
      this.cellHitAreas[y] = [];

      for (let x = 0; x < gameState.mapWidth; x++) {
        const cell = gameState.mapCells[y][x];
        const px = startX + x * (this.cellSize + this.cellGap);
        const py = startY + y * (this.cellSize + this.cellGap);

        // 创建格子图形
        const graphics = this.add.graphics();
        this.drawCell(graphics, cell, px, py);
        this.cellGraphics[y][x] = graphics;

        // 格子类型图标
        const icon = this.getCellIcon(cell.type);
        const text = this.add.text(px + this.cellSize / 2, py + this.cellSize / 2, icon, {
          fontSize: '24px',
        }).setOrigin(0.5);
        this.cellTexts[y][x] = text;

        // 给所有格子创建点击区域（可到达的格子显示手型光标）
        const hitArea = this.add.zone(px + this.cellSize / 2, py + this.cellSize / 2, this.cellSize, this.cellSize)
          .setInteractive({ useHandCursor: cell.isReachable });
        this.cellHitAreas[y][x] = hitArea;

        // 悬停效果（仅可到达格子）
        hitArea.on('pointerover', () => {
          if (cell.isReachable) {
            graphics.clear();
            this.drawCellHover(graphics, cell, px, py);
          }
        });

        hitArea.on('pointerout', () => {
          graphics.clear();
          this.drawCell(graphics, cell, px, py);
        });

        // 点击事件
        hitArea.on('pointerdown', () => {
          this.onCellClick(x, y);
        });
      }
    }
  }

  private drawCell(graphics: Phaser.GameObjects.Graphics, cell: MapCell, x: number, y: number): void {
    // 基础颜色
    let fillColor = 0x2a2a3e;
    let alpha = 1;
    let borderColor = 0x444466;
    let borderWidth = 1;

    if (cell.isCurrent) {
      // 当前位置 - 高亮
      fillColor = 0x4a4a6e;
      borderColor = 0xffcc44;
      borderWidth = 3;
    } else if (cell.visited) {
      // 已访问 - 变暗
      fillColor = 0x1a1a2e;
      alpha = 0.6;
      borderColor = 0x333344;
    } else if (cell.isReachable) {
      // 可到达 - 高亮边框
      fillColor = 0x3a3a5e;
      borderColor = 0x66aa66;
      borderWidth = 2;
    }

    // 特殊格子类型颜色
    if (!cell.isCurrent && !cell.visited) {
      switch (cell.type) {
        case 'combat':
          fillColor = 0x4a2a2a;
          break;
        case 'boss':
          fillColor = 0x4a1a1a;
          borderColor = 0xff4444;
          borderWidth = 2;
          break;
        case 'event':
          fillColor = 0x3a3a2a;
          break;
        case 'camp':
          fillColor = 0x2a3a2a;
          break;
        case 'supply':
          fillColor = 0x2a3a4a;
          break;
      }
    }

    graphics.fillStyle(fillColor, alpha);
    graphics.fillRect(x, y, this.cellSize, this.cellSize);
    graphics.lineStyle(borderWidth, borderColor, 1);
    graphics.strokeRect(x, y, this.cellSize, this.cellSize);
  }

  private drawCellHover(graphics: Phaser.GameObjects.Graphics, cell: MapCell, x: number, y: number): void {
    let fillColor = 0x5a5a7e;
    let borderColor = 0x88cc88;

    switch (cell.type) {
      case 'combat':
        fillColor = 0x6a3a3a;
        break;
      case 'boss':
        fillColor = 0x6a2a2a;
        borderColor = 0xff6666;
        break;
      case 'event':
        fillColor = 0x4a4a3a;
        break;
      case 'camp':
        fillColor = 0x3a4a3a;
        break;
      case 'supply':
        fillColor = 0x3a4a5a;
        break;
    }

    graphics.fillStyle(fillColor, 1);
    graphics.fillRect(x, y, this.cellSize, this.cellSize);
    graphics.lineStyle(3, borderColor, 1);
    graphics.strokeRect(x, y, this.cellSize, this.cellSize);
  }

  private getCellIcon(type: CellType): string {
    switch (type) {
      case 'empty': return '';
      case 'combat': return '⚔️';
      case 'boss': return '👹';
      case 'event': return '❓';
      case 'camp': return '⛺';
      case 'supply': return '📦';
      default: return '';
    }
  }

  private onCellClick(x: number, y: number): void {
    const gameState = getGameState();
    const cell = gameState.mapCells[y][x];

    if (!cell.isReachable) {
      console.log(`[地图] 点击 (${x}, ${y}) 不可到达`);
      return;
    }

    // 执行移动
    const moved = moveToCell(gameState, x, y);
    if (!moved) {
      console.log(`[地图] 移动到 (${x}, ${y}) 失败`);
      return;
    }

    setGameState(gameState);
    console.log(`[地图] 移动到 (${x}, ${y})，day=${gameState.day}, food=${gameState.food}`);

    this.updateResourceDisplay();

    // 重新绘制所有格子
    this.redrawMap();

    // 更新所有 hitArea 的 cursor 状态
    this.updateHitAreaCursors();

    // 检查游戏状态
    if (this.checkGameStatus(gameState)) return;

    // 处理格子事件
    this.handleCellEvent(cell);
  }

  private updateHitAreaCursors(): void {
    const gameState = getGameState();
    for (let y = 0; y < gameState.mapHeight; y++) {
      for (let x = 0; x < gameState.mapWidth; x++) {
        const cell = gameState.mapCells[y][x];
        const hitArea = this.cellHitAreas[y][x];
        if (hitArea) {
          hitArea.setInteractive({ useHandCursor: cell.isReachable });
        }
      }
    }
  }

  private redrawMap(): void {
    const gameState = getGameState();
    const w = this.scale.width;
    const h = this.scale.height;
    const mapWidth = gameState.mapWidth * (this.cellSize + this.cellGap) - this.cellGap;
    const mapHeight = gameState.mapHeight * (this.cellSize + this.cellGap) - this.cellGap;
    const startX = (w - mapWidth) / 2;
    const startY = (h - mapHeight) / 2 + 20;

    for (let y = 0; y < gameState.mapHeight; y++) {
      for (let x = 0; x < gameState.mapWidth; x++) {
        const cell = gameState.mapCells[y][x];
        const px = startX + x * (this.cellSize + this.cellGap);
        const py = startY + y * (this.cellSize + this.cellGap);

        this.cellGraphics[y][x].clear();
        this.drawCell(this.cellGraphics[y][x], cell, px, py);
      }
    }
  }

  private handleCellEvent(cell: MapCell): void {
    const gameState = getGameState();

    switch (cell.type) {
      case 'combat':
      case 'boss':
        // 保存战斗类型并进入战斗
        gameState.currentBattleType = cell.type === 'boss' ? 'boss' : 'normal';
        setGameState(gameState);
        this.scene.start('BattleScene');
        break;

      case 'event':
        // 事件占位
        this.showPlaceholderMessage('事件系统', '功能后续开放');
        break;

      case 'camp':
        // 营地占位
        this.showPlaceholderMessage('营地', '功能后续开放');
        break;

      case 'supply':
        // 补给点占位
        this.showPlaceholderMessage('补给点', '功能后续开放');
        break;

      default:
        // 空地，继续
        break;
    }
  }

  private showPlaceholderMessage(title: string, message: string): void {
    const w = this.scale.width;
    const h = this.scale.height;

    // 遮罩
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, w, h);

    // 弹窗背景
    const popupBg = this.add.graphics();
    popupBg.fillStyle(0x2a2a3e, 1);
    popupBg.fillRect(w / 2 - 200, h / 2 - 100, 400, 200);
    popupBg.lineStyle(2, 0x4488ff, 1);
    popupBg.strokeRect(w / 2 - 200, h / 2 - 100, 400, 200);

    // 标题
    const titleText = this.add.text(w / 2, h / 2 - 60, title, {
      fontSize: '24px',
      color: '#ffcc44',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 消息
    const msgText = this.add.text(w / 2, h / 2, message, {
      fontSize: '18px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // 确认按钮
    const btn = this.add.text(w / 2, h / 2 + 60, '确定', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#2a4a8a',
      padding: { x: 30, y: 10 },
      fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#3a6aca' }));
    btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#2a4a8a' }));
    btn.on('pointerdown', () => {
      overlay.destroy();
      popupBg.destroy();
      titleText.destroy();
      msgText.destroy();
      btn.destroy();
    });
  }

  private checkGameStatus(gameState: ReturnType<typeof getGameState>): boolean {
    // 检查失败
    const gameOver = checkGameOver(gameState);
    if (gameOver.isOver) {
      this.showGameOver(gameOver.reason || '远征失败');
      return true;
    }

    // 检查胜利
    if (checkVictory(gameState)) {
      this.showGameOver('远征胜利！', true);
      return true;
    }

    return false;
  }

  private showGameOver(message: string, isVictory: boolean = false): void {
    const w = this.scale.width;
    const h = this.scale.height;

    // 遮罩
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.8);
    overlay.fillRect(0, 0, w, h);

    // 弹窗背景
    const popupBg = this.add.graphics();
    popupBg.fillStyle(0x2a2a3e, 1);
    popupBg.fillRect(w / 2 - 250, h / 2 - 120, 500, 240);
    const borderColor = isVictory ? 0xffcc44 : 0xff4444;
    popupBg.lineStyle(3, borderColor, 1);
    popupBg.strokeRect(w / 2 - 250, h / 2 - 120, 500, 240);

    // 标题
    const titleText = this.add.text(w / 2, h / 2 - 70, isVictory ? '🎉 远征胜利！' : '💀 远征失败', {
      fontSize: '36px',
      color: isVictory ? '#ffcc44' : '#ff4444',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 消息
    const msgText = this.add.text(w / 2, h / 2 - 10, message, {
      fontSize: '20px',
      color: '#cccccc',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // 重新开始按钮
    const btn = this.add.text(w / 2, h / 2 + 60, '返回主菜单', {
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#2a4a8a',
      padding: { x: 40, y: 12 },
      fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#3a6aca' }));
    btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#2a4a8a' }));
    btn.on('pointerdown', () => {
      // 重置游戏状态
      resetGameState();
      this.scene.start('MainMenuScene');
    });
  }
}
