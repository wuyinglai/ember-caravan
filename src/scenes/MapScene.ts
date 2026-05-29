import Phaser from 'phaser';
import {
  getGameState, setGameState, moveToCell, checkGameOver, checkVictory,
  MapCell, CellType, ResolvedType, resetGameState, resolveQuestionCell
} from '../systems/GameState';
import { CHARACTER_DEFS } from '../data/characters';

export class MapScene extends Phaser.Scene {
  private cellGraphics: Phaser.GameObjects.Graphics[][] = [];
  private cellTexts: Phaser.GameObjects.Text[][] = [];
  private cellHitAreas: Phaser.GameObjects.Zone[][] = [];
  private resourceTexts: { [key: string]: Phaser.GameObjects.Text } = {};
  private cellSize = 50;
  private cellGap = 4;

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
    const startY = (h - mapHeight) / 2 + 30;

    // 创建地图格子
    this.createMapGrid(startX, startY, gameState);

    // 创建队伍显示
    this.createPartyDisplay(startX, startY - 50, gameState);

    // 键盘方向键移动
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
        this.onCellClick(nx, ny);
      }
    });

    // 检查游戏状态
    this.checkGameStatus(gameState);

    console.log('[地图] 地图场景已加载');
  }

  private createResourceDisplay(w: number, h: number): void {
    const gameState = getGameState();
    const y = 10;
    const spacing = 130;
    const startX = w / 2 - spacing * 2;

    // 天数
    this.resourceTexts['day'] = this.add.text(startX, y, `📅 ${gameState.day}/${gameState.maxDay}`, {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
    });

    // 粮食
    this.resourceTexts['food'] = this.add.text(startX + spacing, y, `🍞 ${gameState.food}`, {
      fontSize: '14px', color: '#88ff88', fontFamily: 'monospace',
    });

    // 士气
    const moraleColor = gameState.morale >= 3 ? '#ffcc44' : (gameState.morale > 0 ? '#ff8844' : '#ff4444');
    this.resourceTexts['morale'] = this.add.text(startX + spacing * 2, y, `💪 ${gameState.morale}`, {
      fontSize: '14px', color: moraleColor, fontFamily: 'monospace',
    });

    // 商队耐久
    const caravanColor = gameState.caravanHp > gameState.caravanMaxHp * 0.5 ? '#88ccff' : '#ffaa44';
    this.resourceTexts['caravan'] = this.add.text(startX + spacing * 3, y, `🚗 ${gameState.caravanHp}/${gameState.caravanMaxHp}`, {
      fontSize: '14px', color: caravanColor, fontFamily: 'monospace',
    });

    // 提示文字
    this.add.text(w / 2, h - 20, '方向键移动 | 点击问号格探索', {
      fontSize: '12px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5);
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

        // 格子内容图标
        const icon = this.getCellIcon(cell);
        const text = this.add.text(px + this.cellSize / 2, py + this.cellSize / 2, icon, {
          fontSize: '20px',
        }).setOrigin(0.5);
        this.cellTexts[y][x] = text;

        // 给所有格子创建点击区域
        const hitArea = this.add.zone(px + this.cellSize / 2, py + this.cellSize / 2, this.cellSize, this.cellSize)
          .setInteractive({ useHandCursor: cell.isReachable });
        this.cellHitAreas[y][x] = hitArea;

        // 悬停效果
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
    let fillColor = 0x333344;
    let borderColor = 0x555566;

    // 障碍
    if (cell.type === 'obstacle') {
      fillColor = 0x222233;
      borderColor = 0x444455;
    }
    // 起点/Boss/当前位置
    else if (cell.isCurrent) {
      fillColor = 0x44aa44;
      borderColor = 0x66cc66;
    }
    // 已访问
    else if (cell.visited) {
      fillColor = 0x3a3a4e;
      borderColor = 0x5a5a6e;
    }
    // 可到达
    else if (cell.isReachable) {
      fillColor = 0x2a4a6a;
      borderColor = 0x4a8aca;
    }

    graphics.fillStyle(fillColor, 1);
    graphics.fillRect(x, y, this.cellSize, this.cellSize);
    graphics.lineStyle(2, borderColor, 1);
    graphics.strokeRect(x, y, this.cellSize, this.cellSize);
  }

  private drawCellHover(graphics: Phaser.GameObjects.Graphics, cell: MapCell, x: number, y: number): void {
    graphics.fillStyle(0x4a8aca, 1);
    graphics.fillRect(x, y, this.cellSize, this.cellSize);
    graphics.lineStyle(2, 0x6aacda, 1);
    graphics.strokeRect(x, y, this.cellSize, this.cellSize);
  }

  private getCellIcon(cell: MapCell): string {
    // 当前位置
    if (cell.isCurrent) return '🚶';

    // 障碍
    if (cell.type === 'obstacle') return '⬛';

    // Boss
    if (cell.type === 'boss') return '👹';

    // 已揭示的问号格
    if (cell.isRevealed && cell.resolvedType) {
      switch (cell.resolvedType) {
        case 'combat': return cell.isCleared ? '✓' : '⚔️';
        case 'event': return '❓';
        case 'opportunity': return '✨';
        case 'danger': return '⚠️';
        case 'camp': return '⛺';
        case 'supply': return '📦';
        default: return '·';
      }
    }

    // 未揭示的问号格
    if (cell.type === 'question') return '?';

    // 已访问的空格
    if (cell.visited) return '·';

    return '';
  }

  private onCellClick(x: number, y: number): void {
    const gameState = getGameState();
    const cell = gameState.mapCells[y][x];

    // 障碍不可移动
    if (cell.type === 'obstacle') {
      console.log(`[地图] 点击 (${x}, ${y}) 是障碍，不可移动`);
      return;
    }

    // 不可到达
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
    console.log(`[地图] 移动到 (${x}, ${y})，day=${gameState.day}`);

    this.updateResourceDisplay();
    this.redrawMap();
    this.updateHitAreaCursors();

    // 检查游戏状态
    if (this.checkGameStatus(gameState)) return;

    // 处理格子内容
    this.handleCellContent(cell);
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
    const mapWidth = gameState.mapWidth * (this.cellSize + this.cellGap) - this.cellGap;
    const mapHeight = gameState.mapHeight * (this.cellSize + this.cellGap) - this.cellGap;
    const startX = (this.scale.width - mapWidth) / 2;
    const startY = (this.scale.height - mapHeight) / 2 + 30;

    for (let y = 0; y < gameState.mapHeight; y++) {
      for (let x = 0; x < gameState.mapWidth; x++) {
        const cell = gameState.mapCells[y][x];
        const px = startX + x * (this.cellSize + this.cellGap);
        const py = startY + y * (this.cellSize + this.cellGap);

        const graphics = this.cellGraphics[y][x];
        graphics.clear();
        this.drawCell(graphics, cell, px, py);

        const text = this.cellTexts[y][x];
        text.setText(this.getCellIcon(cell));
      }
    }
  }

  private handleCellContent(cell: MapCell): void {
    const gameState = getGameState();

    // Boss格直接进入战斗
    if (cell.type === 'boss') {
      gameState.currentBattleType = 'boss';
      setGameState(gameState);
      this.scene.start('BattleScene');
      return;
    }

    // 问号格揭示内容
    if (cell.type === 'question' && !cell.isRevealed) {
      cell.isRevealed = true;
      cell.resolvedType = resolveQuestionCell(cell);
      this.redrawMap();

      // 根据揭示的内容触发效果
      this.triggerResolvedContent(cell);
    }
  }

  private triggerResolvedContent(cell: MapCell): void {
    if (!cell.resolvedType) return;

    switch (cell.resolvedType) {
      case 'combat':
        this.enterCombat(cell);
        break;
      case 'event':
        this.showEventPopup(cell);
        break;
      case 'opportunity':
        this.showOpportunityPopup(cell);
        break;
      case 'danger':
        this.showDangerPopup(cell);
        break;
      case 'camp':
        this.showCampPopup(cell);
        break;
      case 'supply':
        this.showSupplyPopup(cell);
        break;
    }
  }

  private enterCombat(cell: MapCell): void {
    if (cell.isCleared) {
      console.log(`[地图] 战斗格 (${cell.x}, ${cell.y}) 已清理`);
      return;
    }

    const gameState = getGameState();
    gameState.currentBattleType = 'normal';
    setGameState(gameState);
    this.scene.start('BattleScene');
  }

  private showEventPopup(cell: MapCell): void {
    const events = [
      { name: '废弃货箱', desc: '发现一个废弃的货箱', options: [
        { text: '搜索', action: () => { this.modifyFood(2); this.closePopup(); } },
        { text: '谨慎离开', action: () => { this.closePopup(); } }
      ]},
      { name: '风暴前兆', desc: '天空阴沉，风暴即将来临', options: [
        { text: '强行前进', action: () => { this.modifyCaravanHp(-5); this.closePopup(); } },
        { text: '原地等待', action: () => { this.modifyDay(1); this.closePopup(); } }
      ]},
      { name: '陌生旅人', desc: '遇到一位疲惫的旅人', options: [
        { text: '交易', action: () => { this.modifyFood(1); this.modifyMorale(-1); this.closePopup(); } },
        { text: '帮助他', action: () => { this.modifyMorale(1); this.closePopup(); } }
      ]}
    ];

    const event = events[Math.floor(Math.random() * events.length)];
    this.createPopup(event.name, event.desc, event.options);
  }

  private showOpportunityPopup(cell: MapCell): void {
    const opportunities = [
      { name: '发现补给', desc: '找到一些食物', effect: () => this.modifyFood(2) },
      { name: '士气提升', desc: '队伍状态良好', effect: () => this.modifyMorale(1) },
      { name: '发现零件', desc: '可以修理商队', effect: () => this.modifyCaravanHp(5) },
      { name: '短暂休息', desc: '一位角色恢复了一些体力', effect: () => this.healRandomCharacter(3) }
    ];

    const opp = opportunities[Math.floor(Math.random() * opportunities.length)];
    opp.effect();
    this.createPopup('机遇', opp.desc, [{ text: '确定', action: () => this.closePopup() }]);
  }

  private showDangerPopup(cell: MapCell): void {
    const dangers = [
      { name: '陷阱', desc: '商队触发了陷阱', effect: () => this.modifyCaravanHp(-5) },
      { name: '偷袭', desc: '一名角色受了轻伤', effect: () => this.damageRandomCharacter(3) },
      { name: '恶劣天气', desc: '士气下降', effect: () => this.modifyMorale(-1) }
    ];

    const danger = dangers[Math.floor(Math.random() * dangers.length)];
    danger.effect();

    // 50%概率进入战斗
    if (Math.random() < 0.5) {
      this.createPopup('危险', danger.desc + '\n\n遭遇敌人！', [
        { text: '进入战斗', action: () => this.enterCombat(cell) }
      ]);
    } else {
      this.createPopup('危险', danger.desc, [{ text: '确定', action: () => this.closePopup() }]);
    }
  }

  private showCampPopup(cell: MapCell): void {
    this.healAllCharacters(5);
    this.modifyMorale(1);
    cell.isCleared = true;
    this.createPopup('营地', '在营地休息恢复\n\n所有角色恢复 5 HP\n士气 +1', [
      { text: '继续', action: () => this.closePopup() }
    ]);
  }

  private showSupplyPopup(cell: MapCell): void {
    this.modifyCaravanHp(10);
    this.modifyFood(2);
    cell.isCleared = true;
    this.createPopup('补给点', '获得补给\n\n商队耐久 +10\n食物 +2', [
      { text: '继续', action: () => this.closePopup() }
    ]);
  }

  private createPopup(title: string, desc: string, options: { text: string; action: () => void }[]): void {
    const w = this.scale.width;
    const h = this.scale.height;

    // 遮罩
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, w, h);
    overlay.setName('popupOverlay');

    // 弹窗背景
    const popupBg = this.add.graphics();
    popupBg.fillStyle(0x2a2a3e, 1);
    popupBg.fillRect(w / 2 - 200, h / 2 - 120, 400, 240);
    popupBg.lineStyle(3, 0x555566, 1);
    popupBg.strokeRect(w / 2 - 200, h / 2 - 120, 400, 240);
    popupBg.setName('popupBg');

    // 标题
    const titleText = this.add.text(w / 2, h / 2 - 90, title, {
      fontSize: '24px', color: '#ffcc44', fontFamily: 'monospace', fontStyle: 'bold'
    }).setOrigin(0.5).setName('popupTitle');

    // 描述
    const descText = this.add.text(w / 2, h / 2 - 30, desc, {
      fontSize: '16px', color: '#cccccc', fontFamily: 'monospace', align: 'center'
    }).setOrigin(0.5).setName('popupDesc');

    // 选项按钮
    const btnY = h / 2 + 40;
    const btnSpacing = 120;
    const startX = w / 2 - (options.length - 1) * btnSpacing / 2;

    options.forEach((opt, index) => {
      const btn = this.add.text(startX + index * btnSpacing, btnY, opt.text, {
        fontSize: '16px', color: '#ffffff', backgroundColor: '#2a4a6a',
        padding: { x: 15, y: 8 }, fontFamily: 'monospace'
      }).setOrigin(0.5).setInteractive().setName(`popupBtn${index}`);

      btn.on('pointerdown', opt.action);
      btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#3a6aaa' }));
      btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#2a4a6a' }));
    });
  }

  private closePopup(): void {
    // 移除所有弹窗元素
    ['popupOverlay', 'popupBg', 'popupTitle', 'popupDesc', 'popupBtn0', 'popupBtn1', 'popupBtn2'].forEach(name => {
      const obj = this.children.getByName(name);
      if (obj) obj.destroy();
    });

    this.updateResourceDisplay();
  }

  // 资源修改方法
  private modifyFood(delta: number): void {
    const gameState = getGameState();
    gameState.food = Math.max(0, gameState.food + delta);
    setGameState(gameState);
  }

  private modifyMorale(delta: number): void {
    const gameState = getGameState();
    gameState.morale = Math.max(0, gameState.morale + delta);
    setGameState(gameState);
  }

  private modifyCaravanHp(delta: number): void {
    const gameState = getGameState();
    gameState.caravanHp = Math.max(0, Math.min(gameState.caravanMaxHp, gameState.caravanHp + delta));
    setGameState(gameState);
  }

  private modifyDay(delta: number): void {
    const gameState = getGameState();
    gameState.day += delta;
    setGameState(gameState);
  }

  private healAllCharacters(amount: number): void {
    // TODO: 实现角色治疗
    console.log(`[地图] 所有角色恢复 ${amount} HP`);
  }

  private healRandomCharacter(amount: number): void {
    console.log(`[地图] 随机角色恢复 ${amount} HP`);
  }

  private damageRandomCharacter(amount: number): void {
    console.log(`[地图] 随机角色受到 ${amount} 伤害`);
  }

  private updateResourceDisplay(): void {
    const gameState = getGameState();

    this.resourceTexts['day'].setText(`📅 ${gameState.day}/${gameState.maxDay}`);
    this.resourceTexts['food'].setText(`🍞 ${gameState.food}`);

    const moraleColor = gameState.morale >= 3 ? '#ffcc44' : (gameState.morale > 0 ? '#ff8844' : '#ff4444');
    this.resourceTexts['morale'].setText(`💪 ${gameState.morale}`);
    this.resourceTexts['morale'].setColor(moraleColor);

    const caravanColor = gameState.caravanHp > gameState.caravanMaxHp * 0.5 ? '#88ccff' : '#ffaa44';
    this.resourceTexts['caravan'].setText(`🚗 ${gameState.caravanHp}/${gameState.caravanMaxHp}`);
    this.resourceTexts['caravan'].setColor(caravanColor);
  }

  private createPartyDisplay(startX: number, startY: number, gameState: ReturnType<typeof getGameState>): void {
    const chars = gameState.selectedCharacters;
    const spacing = 100;
    const totalWidth = (chars.length - 1) * spacing;
    const x = startX + (gameState.mapWidth * (this.cellSize + this.cellGap) - this.cellGap - totalWidth) / 2;

    chars.forEach((charId, index) => {
      const char = CHARACTER_DEFS[charId];
      const px = x + index * spacing;

      // 头像背景
      const bg = this.add.graphics();
      bg.fillStyle(char.color, 0.3);
      bg.fillRect(px - 20, startY, 40, 40);
      bg.lineStyle(2, char.color, 1);
      bg.strokeRect(px - 20, startY, 40, 40);

      // 名字
      this.add.text(px, startY + 20, char.name.slice(0, 2), {
        fontSize: '14px', color: '#ffffff', fontFamily: 'monospace'
      }).setOrigin(0.5);
    });
  }

  private checkGameStatus(gameState: ReturnType<typeof getGameState>): boolean {
    // 检查游戏结束
    const gameOver = checkGameOver(gameState);
    if (gameOver.isOver) {
      this.showGameOver(gameOver.reason!);
      return true;
    }

    // 检查胜利
    if (checkVictory(gameState)) {
      this.showVictory();
      return true;
    }

    return false;
  }

  private showGameOver(reason: string): void {
    const w = this.scale.width;
    const h = this.scale.height;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.8);
    overlay.fillRect(0, 0, w, h);

    const title = this.add.text(w / 2, h / 2 - 40, '💀 远征失败', {
      fontSize: '36px', color: '#ff4444', fontFamily: 'monospace', fontStyle: 'bold'
    }).setOrigin(0.5);

    const desc = this.add.text(w / 2, h / 2 + 10, reason, {
      fontSize: '18px', color: '#aaaaaa', fontFamily: 'monospace'
    }).setOrigin(0.5);

    const btn = this.add.text(w / 2, h / 2 + 60, '【返回主菜单】', {
      fontSize: '18px', color: '#ffffff', backgroundColor: '#444466',
      padding: { x: 20, y: 10 }, fontFamily: 'monospace'
    }).setOrigin(0.5).setInteractive();

    btn.on('pointerdown', () => {
      resetGameState();
      this.scene.start('MainMenuScene');
    });
  }

  private showVictory(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.8);
    overlay.fillRect(0, 0, w, h);

    const title = this.add.text(w / 2, h / 2 - 40, '🎉 远征胜利！', {
      fontSize: '36px', color: '#ffcc44', fontFamily: 'monospace', fontStyle: 'bold'
    }).setOrigin(0.5);

    const desc = this.add.text(w / 2, h / 2 + 10, '你成功击败了Boss，完成了远征！', {
      fontSize: '18px', color: '#cccccc', fontFamily: 'monospace'
    }).setOrigin(0.5);

    const btn = this.add.text(w / 2, h / 2 + 60, '【返回主菜单】', {
      fontSize: '18px', color: '#ffffff', backgroundColor: '#2a4a8a',
      padding: { x: 20, y: 10 }, fontFamily: 'monospace'
    }).setOrigin(0.5).setInteractive();

    btn.on('pointerdown', () => {
      resetGameState();
      this.scene.start('MainMenuScene');
    });
  }
}
