import Phaser from 'phaser';
import {
  getGameState, setGameState, moveToCell, checkGameOver, checkVictory,
  MapCell, CellType, ResolvedType, resetGameState, resolveQuestionCell, updateReachableCells
} from '../systems/GameState';
import { CHARACTER_DEFS } from '../data/characters';

export class MapScene extends Phaser.Scene {
  private cellGraphics: Phaser.GameObjects.Graphics[][] = [];
  private cellTexts: Phaser.GameObjects.Text[][] = [];
  private cellHitAreas: Phaser.GameObjects.Zone[][] = [];
  private resourceTexts: { [key: string]: Phaser.GameObjects.Text } = {};
  private cellSize = 42;
  private cellGap = 4;
  private mapContainer!: Phaser.GameObjects.Container;
  private cameraOffsetX = 0;
  private cameraOffsetY = 0;
  private scrollSpeed = 40;

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

    // 创建地图容器（所有格子放入此容器，通过移动容器实现视角滚动）
    this.mapContainer = this.add.container(0, 30);

    // 创建资源显示（固定UI层，不加到mapContainer）
    this.createResourceDisplay(w, h);

    // 创建地图格子（加到mapContainer）
    this.createMapGrid(gameState);

    // 创建队伍显示（固定UI层，不加到mapContainer）
    this.createPartyDisplay(gameState);

    // WASD/方向键移动视角（不移动玩家）
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      switch (event.key.toLowerCase()) {
        case 'w': case 'arrowup':    this.moveCamera(0, -this.scrollSpeed); break;
        case 's': case 'arrowdown':  this.moveCamera(0, this.scrollSpeed); break;
        case 'a': case 'arrowleft':  this.moveCamera(-this.scrollSpeed, 0); break;
        case 'd': case 'arrowright': this.moveCamera(this.scrollSpeed, 0); break;
        case ' ': this.centerCameraOnPlayer(); break;
        default: return;
      }
    });

    // 初始化时自动居中到玩家位置
    this.centerCameraOnPlayer();

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

    // 金币
    this.resourceTexts['gold'] = this.add.text(startX + spacing * 4, y, `💰 ${gameState.gold}`, {
      fontSize: '14px', color: '#ffdd44', fontFamily: 'monospace',
    });

    // 提示文字
    this.add.text(w / 2, h - 20, 'WASD/方向键移动视角 | Space回到商队 | 点击格子移动', {
      fontSize: '12px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5);
  }

  private createMapGrid(gameState: ReturnType<typeof getGameState>): void {
    for (let y = 0; y < gameState.mapHeight; y++) {
      this.cellGraphics[y] = [];
      this.cellTexts[y] = [];
      this.cellHitAreas[y] = [];

      for (let x = 0; x < gameState.mapWidth; x++) {
        const cell = gameState.mapCells[y][x];
        const px = x * (this.cellSize + this.cellGap);
        const py = y * (this.cellSize + this.cellGap);

        // 创建格子图形
        const graphics = this.add.graphics();
        this.drawCell(graphics, cell, px, py);
        this.cellGraphics[y][x] = graphics;
        this.mapContainer.add(graphics);

        // 格子内容图标
        const icon = this.getCellIcon(cell);
        const text = this.add.text(px + this.cellSize / 2, py + this.cellSize / 2, icon, {
          fontSize: '20px',
        }).setOrigin(0.5);
        this.cellTexts[y][x] = text;
        this.mapContainer.add(text);

        // 给所有格子创建点击区域
        const hitArea = this.add.zone(px + this.cellSize / 2, py + this.cellSize / 2, this.cellSize, this.cellSize)
          .setInteractive({ useHandCursor: cell.isReachable });
        this.cellHitAreas[y][x] = hitArea;
        this.mapContainer.add(hitArea);

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

    // Boss（提前可见）
    if (cell.type === 'boss') return '👹';

    // 强敌（提前可见）
    if (cell.type === 'elite') return cell.isCleared ? '✓' : '💀';

    // 营地（提前可见）
    if (cell.type === 'camp') return '⛺';

    // 补给点（提前可见）
    if (cell.type === 'supply') return '📦';

    // 奖励点（提前可见）
    if (cell.type === 'reward') return cell.isCleared ? '✓' : '🎁';

    // 目标点（提前可见）
    if (cell.isGoal) {
      const gameState = getGameState();
      return gameState.expeditionGoal === 'boss' ? '👹' : '🏠';
    }

    // 已揭示的问号格
    if (cell.isRevealed && cell.resolvedType) {
      switch (cell.resolvedType) {
        case 'combat': return cell.isCleared ? '✓' : '⚔️';
        case 'event': return '❓';
        case 'opportunity': return '✨';
        case 'danger': return '⚠️';
        default: return '·';
      }
    }

    // 未揭示的问号格
    if (cell.type === 'question') return '?';

    // 已访问的空格
    if (cell.visited) return '·';

    return '';
  }

  private moveCamera(dx: number, dy: number): void {
    const gameState = getGameState();
    const mapPixelW = gameState.mapWidth * (this.cellSize + this.cellGap) - this.cellGap;
    const mapPixelH = gameState.mapHeight * (this.cellSize + this.cellGap) - this.cellGap;
    const screenW = this.scale.width;
    const screenH = this.scale.height;

    this.cameraOffsetX = Math.max(-(mapPixelW - screenW + 40), Math.min(40, this.cameraOffsetX + dx));
    this.cameraOffsetY = Math.max(-(mapPixelH - screenH + 40), Math.min(40, this.cameraOffsetY + dy));

    this.mapContainer.setPosition(this.cameraOffsetX, this.cameraOffsetY + 30);
  }

  private centerCameraOnPlayer(): void {
    const gameState = getGameState();
    const mapPixelW = gameState.mapWidth * (this.cellSize + this.cellGap) - this.cellGap;
    const mapPixelH = gameState.mapHeight * (this.cellSize + this.cellGap) - this.cellGap;
    const screenW = this.scale.width;
    const screenH = this.scale.height;

    const playerPixelX = gameState.currentPosition.x * (this.cellSize + this.cellGap) + this.cellSize / 2;
    const playerPixelY = gameState.currentPosition.y * (this.cellSize + this.cellGap) + this.cellSize / 2;

    this.cameraOffsetX = Math.round(screenW / 2 - playerPixelX);
    this.cameraOffsetY = Math.round(screenH / 2 - playerPixelY + 30);

    // 限制边界
    this.cameraOffsetX = Math.max(-(mapPixelW - screenW + 40), Math.min(40, this.cameraOffsetX));
    this.cameraOffsetY = Math.max(-(mapPixelH - screenH + 40), Math.min(40, this.cameraOffsetY));

    this.mapContainer.setPosition(this.cameraOffsetX, this.cameraOffsetY);
  }

  private onCellClick(x: number, y: number): void {
    const gameState = getGameState();
    const cell = gameState.mapCells[y][x];

    console.log('[地图] 点击格子:', { x, y, type: cell.type, isReachable: cell.isReachable, isCleared: cell.isCleared, resolvedType: cell.resolvedType });

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
    console.log(`[地图] 移动到 (${x}, ${y}) 成功，day=${gameState.day}`);

    // 立即刷新地图显示
    this.redrawMap();
    this.updateHitAreaCursors();
    this.updateResourceDisplay();

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

    for (let y = 0; y < gameState.mapHeight; y++) {
      for (let x = 0; x < gameState.mapWidth; x++) {
        const cell = gameState.mapCells[y][x];
        const px = x * (this.cellSize + this.cellGap);
        const py = y * (this.cellSize + this.cellGap);

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

    // 强敌格进入精英战斗
    if (cell.type === 'elite') {
      if (cell.isCleared) {
        console.log(`[地图] 强敌格 (${cell.x}, ${cell.y}) 已清理`);
        return;
      }
      gameState.currentBattleType = 'elite';
      setGameState(gameState);
      this.scene.start('BattleScene');
      return;
    }

    // 营地格直接触发营地效果
    if (cell.type === 'camp') {
      if (cell.isCleared) {
        console.log(`[地图] 营地格 (${cell.x}, ${cell.y}) 已使用`);
        return;
      }
      this.showCampPopup(cell);
      return;
    }

    // 补给点触发补给效果（有选项）
    if (cell.type === 'supply') {
      if (cell.isCleared) {
        console.log(`[地图] 补给点 (${cell.x}, ${cell.y}) 已使用`);
        return;
      }
      this.showSupplyPopup(cell);
      return;
    }

    // 奖励点处理
    if (cell.type === 'reward') {
      if (cell.isCleared) {
        console.log(`[地图] 奖励点 (${cell.x}, ${cell.y}) 已领取`);
        return;
      }
      this.showRewardPopup(cell);
      return;
    }

    // 问号格揭示内容
    if (cell.type === 'question' && !cell.isRevealed) {
      cell.isRevealed = true;
      cell.resolvedType = resolveQuestionCell(cell, gameState.startPosition, gameState.bossPosition);
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
    const gameState = getGameState();
    const options: { text: string; action: () => void }[] = [
      { text: '免费补给 (食物+2)', action: () => {
        this.modifyFood(2);
        cell.isCleared = true;
        this.closePopup();
      }},
    ];
    if (gameState.gold >= 20) {
      options.push({ text: '修理商队 (-20金)', action: () => {
        this.modifyGold(-20);
        this.modifyCaravanHp(15);
        cell.isCleared = true;
        this.closePopup();
      }});
    }
    if (gameState.gold >= 15) {
      options.push({ text: '鼓舞队伍 (-15金)', action: () => {
        this.modifyGold(-15);
        this.modifyMorale(2);
        cell.isCleared = true;
        this.closePopup();
      }});
    }
    options.push({ text: '离开', action: () => this.closePopup() });
    this.createPopup('补给站', `剩余金币: ${gameState.gold}\n\n选择补给项目：`, options);
  }

  private showRewardPopup(cell: MapCell): void {
    const rewards = {
      small: { name: '小货箱', gold: 10, food: 1 },
      medium: { name: '商队残骸', gold: 15, caravanHp: 5 },
      large: { name: '旧世界储藏箱', gold: 25, morale: 1 },
    };
    const reward = rewards[cell.rewardType || 'small'];
    this.modifyGold(reward.gold);
    if ('food' in reward) this.modifyFood(reward.food);
    if ('caravanHp' in reward) this.modifyCaravanHp(reward.caravanHp);
    if ('morale' in reward) this.modifyMorale(reward.morale);
    cell.isCleared = true;
    // 构建描述
    const descParts = [`金币 +${reward.gold}`];
    if ('food' in reward) descParts.push(`食物 +${reward.food}`);
    if ('caravanHp' in reward) descParts.push(`商队耐久 +${reward.caravanHp}`);
    if ('morale' in reward) descParts.push(`士气 +${reward.morale}`);
    this.createPopup(reward.name, `发现了${reward.name}！\n\n${descParts.join('\n')}`, [
      { text: '继续', action: () => this.closePopup() }
    ]);
  }

  private createPopup(title: string, desc: string, options: { text: string; action: () => void }[]): void {
    const w = this.scale.width;
    const h = this.scale.height;

    // 遮罩（加到scene，不随地图滚动）
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, w, h);
    overlay.setName('popupOverlay');

    // 弹窗背景（加到scene）
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
    ['popupOverlay', 'popupBg', 'popupTitle', 'popupDesc', 'popupBtn0', 'popupBtn1', 'popupBtn2', 'popupBtn3'].forEach(name => {
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

  private modifyGold(delta: number): void {
    const gameState = getGameState();
    gameState.gold = Math.max(0, gameState.gold + delta);
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

    this.resourceTexts['gold'].setText(`💰 ${gameState.gold}`);
  }

  private createPartyDisplay(gameState: ReturnType<typeof getGameState>): void {
    const chars = gameState.selectedCharacters;
    const spacing = 100;
    const totalWidth = (chars.length - 1) * spacing;
    const mapPixelW = gameState.mapWidth * (this.cellSize + this.cellGap) - this.cellGap;
    const x = (this.scale.width - totalWidth) / 2;
    const startY = 45;

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
    const gameState = getGameState();

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.8);
    overlay.fillRect(0, 0, w, h);

    const title = this.add.text(w / 2, h / 2 - 40, '🎉 远征胜利！', {
      fontSize: '36px', color: '#ffcc44', fontFamily: 'monospace', fontStyle: 'bold'
    }).setOrigin(0.5);

    const victoryText = gameState.expeditionGoal === 'boss'
      ? '你成功击败了首领，完成了远征！'
      : '你成功抵达了安全据点，完成了远征！';

    const desc = this.add.text(w / 2, h / 2 + 10, victoryText, {
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
