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

  // 弹窗系统：用数组管理所有弹窗对象
  private popupObjects: Phaser.GameObjects.GameObject[] = [];

  // 调试计数器
  private debugStep = 0;

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

    // 确保进入地图时重新计算可达格
    updateReachableCells(gameState);
    setGameState(gameState);

    // 创建地图容器（所有格子放入此容器，通过移动容器实现视角滚动）
    this.mapContainer = this.add.container(0, 30);

    // 创建资源显示（固定UI层，不加到mapContainer）
    this.createResourceDisplay(w, h);

    // 创建地图格子（加到mapContainer）
    this.createMapGrid(gameState);

    // 创建队伍显示（固定UI层，不加到mapContainer）
    this.createPartyDisplay(gameState);

    // 键盘事件
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      switch (event.key.toLowerCase()) {
        case 'w': case 'arrowup':    this.moveCamera(0, -this.scrollSpeed); break;
        case 's': case 'arrowdown':  this.moveCamera(0, this.scrollSpeed); break;
        case 'a': case 'arrowleft':  this.moveCamera(-this.scrollSpeed, 0); break;
        case 'd': case 'arrowright': this.moveCamera(this.scrollSpeed, 0); break;
        case ' ': this.centerCameraOnPlayer(); break;
        case 't': this.debugRandomMove(); break;
        case 'escape':
          // Escape 键关闭弹窗（调试用）
          if (this.popupObjects.length > 0) {
            console.log('[地图] Escape 关闭弹窗');
            this.closePopup();
          }
          break;
        default: return;
      }
    });

    // 初始化时自动居中到玩家位置
    this.centerCameraOnPlayer();

    // 检查游戏状态
    this.checkGameStatus(gameState);

    console.log('[地图] 地图场景已加载');
  }

  // ==================== 弹窗系统 ====================

  /** 清理所有弹窗对象 */
  private clearPopup(): void {
    for (const obj of this.popupObjects) {
      if (obj && obj.active) {
        obj.destroy();
      }
    }
    this.popupObjects = [];
    console.log('[地图] 弹窗已清理，popupObjects=', this.popupObjects.length);
  }

  /** 创建弹窗（自动先清理旧弹窗） */
  private createPopup(title: string, desc: string, options: { text: string; action: () => void }[]): void {
    // 先清理旧弹窗
    this.clearPopup();

    const w = this.scale.width;
    const h = this.scale.height;

    // 遮罩（加到scene，不随地图滚动）
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, w, h);
    this.popupObjects.push(overlay);

    // 弹窗背景
    const popupBg = this.add.graphics();
    popupBg.fillStyle(0x2a2a3e, 1);
    popupBg.fillRect(w / 2 - 200, h / 2 - 120, 400, 240);
    popupBg.lineStyle(3, 0x555566, 1);
    popupBg.strokeRect(w / 2 - 200, h / 2 - 120, 400, 240);
    this.popupObjects.push(popupBg);

    // 标题
    const titleText = this.add.text(w / 2, h / 2 - 90, title, {
      fontSize: '24px', color: '#ffcc44', fontFamily: 'monospace', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.popupObjects.push(titleText);

    // 描述
    const descText = this.add.text(w / 2, h / 2 - 30, desc, {
      fontSize: '16px', color: '#cccccc', fontFamily: 'monospace', align: 'center'
    }).setOrigin(0.5);
    this.popupObjects.push(descText);

    // 选项按钮
    const btnY = h / 2 + 40;
    const btnSpacing = 120;
    const startX = w / 2 - (options.length - 1) * btnSpacing / 2;

    options.forEach((opt, index) => {
      const btn = this.add.text(startX + index * btnSpacing, btnY, opt.text, {
        fontSize: '16px', color: '#ffffff', backgroundColor: '#2a4a6a',
        padding: { x: 15, y: 8 }, fontFamily: 'monospace'
      }).setOrigin(0.5).setInteractive();
      this.popupObjects.push(btn);

      btn.on('pointerdown', opt.action);
      btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#3a6aaa' }));
      btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#2a4a6a' }));
    });
  }

  /** 关闭弹窗并刷新地图 */
  private closePopup(): void {
    this.clearPopup();
    this.redrawMap();
    this.updateHitAreaCursors();
    this.updateResourceDisplay();
  }

  // ==================== 格子完成状态统一处理 ====================

  /** 标记格子为已完成，刷新地图 */
  private completeCurrentCell(cell: MapCell): void {
    cell.isCleared = true;
    cell.isRevealed = true;
    const gameState = getGameState();
    setGameState(gameState);
    console.log(`[地图] 格子 (${cell.x}, ${cell.y}) 已完成，type=${cell.type}`);
  }

  // ==================== 地图创建 ====================

  private createResourceDisplay(w: number, h: number): void {
    const gameState = getGameState();
    const y = 10;
    const spacing = 130;
    const startX = w / 2 - spacing * 2;

    this.resourceTexts['day'] = this.add.text(startX, y, `📅 ${gameState.day}/${gameState.maxDay}`, {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
    });

    this.resourceTexts['food'] = this.add.text(startX + spacing, y, `🍞 ${gameState.food}`, {
      fontSize: '14px', color: '#88ff88', fontFamily: 'monospace',
    });

    const moraleColor = gameState.morale >= 3 ? '#ffcc44' : (gameState.morale > 0 ? '#ff8844' : '#ff4444');
    this.resourceTexts['morale'] = this.add.text(startX + spacing * 2, y, `💪 ${gameState.morale}`, {
      fontSize: '14px', color: moraleColor, fontFamily: 'monospace',
    });

    const caravanColor = gameState.caravanHp > gameState.caravanMaxHp * 0.5 ? '#88ccff' : '#ffaa44';
    this.resourceTexts['caravan'] = this.add.text(startX + spacing * 3, y, `🚗 ${gameState.caravanHp}/${gameState.caravanMaxHp}`, {
      fontSize: '14px', color: caravanColor, fontFamily: 'monospace',
    });

    this.resourceTexts['gold'] = this.add.text(startX + spacing * 4, y, `💰 ${gameState.gold}`, {
      fontSize: '14px', color: '#ffdd44', fontFamily: 'monospace',
    });

    this.add.text(w / 2, h - 20, 'WASD/方向键移动视角 | Space回到商队 | T=随机移动 | 点击格子移动', {
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

        // 给所有格子创建点击区域（只创建一次，永不销毁）
        const hitArea = this.add.zone(px + this.cellSize / 2, py + this.cellSize / 2, this.cellSize, this.cellSize)
          .setInteractive({ useHandCursor: false });
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

  // ==================== 地图绘制 ====================

  private drawCell(graphics: Phaser.GameObjects.Graphics, cell: MapCell, x: number, y: number): void {
    let fillColor = 0x333344;
    let borderColor = 0x555566;

    if (cell.type === 'obstacle') {
      fillColor = 0x222233;
      borderColor = 0x444455;
    } else if (cell.isCurrent) {
      fillColor = 0x44aa44;
      borderColor = 0x66cc66;
    } else if (cell.visited) {
      fillColor = 0x3a3a4e;
      borderColor = 0x5a5a6e;
    } else if (cell.isReachable) {
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
    if (cell.isCurrent) return '🚶';
    if (cell.type === 'obstacle') return '⬛';
    if (cell.type === 'boss') return '👹';
    if (cell.type === 'elite') return cell.isCleared ? '✓' : '💀';
    if (cell.type === 'camp') return cell.isCleared ? '✓' : '⛺';
    if (cell.type === 'supply') return cell.isCleared ? '✓' : '📦';
    if (cell.type === 'reward') return cell.isCleared ? '✓' : '🎁';

    if (cell.isGoal) {
      const gameState = getGameState();
      return gameState.expeditionGoal === 'boss' ? '👹' : '🏠';
    }

    // 已揭示的问号格
    if (cell.isRevealed && cell.resolvedType) {
      switch (cell.resolvedType) {
        case 'combat': return cell.isCleared ? '✓' : '⚔️';
        case 'event': return cell.isCleared ? '✓' : '❓';
        case 'opportunity': return cell.isCleared ? '✓' : '✨';
        case 'danger': return cell.isCleared ? '✓' : '⚠️';
        case 'reward': return cell.isCleared ? '✓' : '🎁';
        default: return '·';
      }
    }

    if (cell.type === 'question') return '?';
    if (cell.visited) return '·';
    return '';
  }

  // ==================== 视角移动 ====================

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

    this.cameraOffsetX = Math.max(-(mapPixelW - screenW + 40), Math.min(40, this.cameraOffsetX));
    this.cameraOffsetY = Math.max(-(mapPixelH - screenH + 40), Math.min(40, this.cameraOffsetY));

    this.mapContainer.setPosition(this.cameraOffsetX, this.cameraOffsetY);
  }

  // ==================== 格子点击与移动 ====================

  private onCellClick(x: number, y: number): void {
    const gameState = getGameState();
    const cell = gameState.mapCells[y][x];

    console.log('[地图] 点击格子:', { x, y, type: cell.type, isReachable: cell.isReachable, isCleared: cell.isCleared });

    // 障碍不可移动
    if (cell.type === 'obstacle') return;

    // 不可到达
    if (!cell.isReachable) return;

    // 执行移动
    const moved = moveToCell(gameState, x, y);
    if (!moved) return;

    setGameState(gameState);
    console.log(`[地图] 移动到 (${x}, ${y}) 成功，day=${gameState.day}`);

    // 立即刷新地图显示
    this.redrawMap();
    this.updateHitAreaCursors();
    this.updateResourceDisplay();

    // 检查游戏状态（胜利/失败）
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

  // ==================== 格子内容处理 ====================

  private handleCellContent(cell: MapCell): void {
    const gameState = getGameState();

    // 已清理的格子：不触发任何内容，只作为可通行格
    if (cell.isCleared) {
      console.log(`[地图] 格子 (${cell.x}, ${cell.y}) 已清理，跳过`);
      return;
    }

    // Boss格直接进入战斗
    if (cell.type === 'boss') {
      gameState.currentBattleType = 'boss';
      setGameState(gameState);
      this.scene.start('BattleScene');
      return;
    }

    // 强敌格进入精英战斗
    if (cell.type === 'elite') {
      gameState.currentBattleType = 'elite';
      setGameState(gameState);
      this.scene.start('BattleScene');
      return;
    }

    // 营地格
    if (cell.type === 'camp') {
      this.showCampPopup(cell);
      return;
    }

    // 补给点
    if (cell.type === 'supply') {
      this.showSupplyPopup(cell);
      return;
    }

    // 奖励点
    if (cell.type === 'reward') {
      this.showRewardPopup(cell);
      return;
    }

    // 目标点（sanctuary 类型）
    if (cell.isGoal && gameState.expeditionGoal === 'sanctuary') {
      // 抵达据点即胜利，由 checkGameStatus 处理
      return;
    }

    // 问号格揭示内容
    if (cell.type === 'question' && !cell.isRevealed) {
      cell.isRevealed = true;
      cell.resolvedType = resolveQuestionCell(cell, gameState.startPosition, gameState.bossPosition);
      setGameState(gameState);
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
      case 'reward':
        this.showQuestionRewardPopup(cell);
        break;
    }
  }

  private enterCombat(cell: MapCell): void {
    const gameState = getGameState();
    gameState.currentBattleType = 'normal';
    setGameState(gameState);
    this.scene.start('BattleScene');
  }

  // ==================== 弹窗：事件 ====================

  private showEventPopup(cell: MapCell): void {
    const events = [
      { name: '废弃货箱', desc: '发现一个废弃的货箱', options: [
        { text: '搜索', action: () => {
          this.modifyFood(2);
          this.completeCurrentCell(cell);
          this.closePopup();
        }},
        { text: '谨慎离开', action: () => {
          this.completeCurrentCell(cell);
          this.closePopup();
        }}
      ]},
      { name: '风暴前兆', desc: '天空阴沉，风暴即将来临', options: [
        { text: '强行前进', action: () => {
          this.modifyCaravanHp(-5);
          this.completeCurrentCell(cell);
          this.closePopup();
        }},
        { text: '原地等待', action: () => {
          this.modifyDay(1);
          this.completeCurrentCell(cell);
          this.closePopup();
        }}
      ]},
      { name: '陌生旅人', desc: '遇到一位疲惫的旅人', options: [
        { text: '交易', action: () => {
          this.modifyFood(1);
          this.modifyMorale(-1);
          this.completeCurrentCell(cell);
          this.closePopup();
        }},
        { text: '帮助他', action: () => {
          this.modifyMorale(1);
          this.completeCurrentCell(cell);
          this.closePopup();
        }}
      ]}
    ];

    const event = events[Math.floor(Math.random() * events.length)];
    this.createPopup(event.name, event.desc, event.options);
  }

  // ==================== 弹窗：机遇 ====================

  private showOpportunityPopup(cell: MapCell): void {
    const opportunities = [
      { name: '发现补给', desc: '找到一些食物', effect: () => this.modifyFood(2) },
      { name: '士气提升', desc: '队伍状态良好', effect: () => this.modifyMorale(1) },
      { name: '发现零件', desc: '可以修理商队', effect: () => this.modifyCaravanHp(5) },
      { name: '短暂休息', desc: '一位角色恢复了一些体力', effect: () => this.healRandomCharacter(3) }
    ];

    const opp = opportunities[Math.floor(Math.random() * opportunities.length)];
    opp.effect();
    this.createPopup('机遇', opp.desc, [
      { text: '确定', action: () => {
        this.completeCurrentCell(cell);
        this.closePopup();
      }}
    ]);
  }

  // ==================== 弹窗：危险 ====================

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
        { text: '进入战斗', action: () => {
          // danger 进入战斗时不标记 cleared，等战斗胜利后再标记
          this.clearPopup();
          this.enterCombat(cell);
        }}
      ]);
    } else {
      this.createPopup('危险', danger.desc, [
        { text: '确定', action: () => {
          this.completeCurrentCell(cell);
          this.closePopup();
        }}
      ]);
    }
  }

  // ==================== 弹窗：问号中的奖励 ====================

  private showQuestionRewardPopup(cell: MapCell): void {
    const goldAmount = 5 + Math.floor(Math.random() * 10);
    this.modifyGold(goldAmount);
    this.createPopup('意外收获', `发现了 ${goldAmount} 枚金币！`, [
      { text: '收下', action: () => {
        this.completeCurrentCell(cell);
        this.closePopup();
      }}
    ]);
  }

  // ==================== 弹窗：营地 ====================

  private showCampPopup(cell: MapCell): void {
    this.healAllCharacters(5);
    this.modifyMorale(1);
    this.createPopup('营地', '在营地休息恢复\n\n所有角色恢复 5 HP\n士气 +1', [
      { text: '继续', action: () => {
        this.completeCurrentCell(cell);
        this.closePopup();
      }}
    ]);
  }

  // ==================== 弹窗：补给站 ====================

  private showSupplyPopup(cell: MapCell): void {
    const gameState = getGameState();
    const options: { text: string; action: () => void }[] = [
      { text: '免费补给 (食物+2)', action: () => {
        this.modifyFood(2);
        this.completeCurrentCell(cell);
        this.closePopup();
      }},
    ];
    if (gameState.gold >= 20) {
      options.push({ text: '修理商队 (-20金)', action: () => {
        this.modifyGold(-20);
        this.modifyCaravanHp(15);
        this.completeCurrentCell(cell);
        this.closePopup();
      }});
    }
    if (gameState.gold >= 15) {
      options.push({ text: '鼓舞队伍 (-15金)', action: () => {
        this.modifyGold(-15);
        this.modifyMorale(2);
        this.completeCurrentCell(cell);
        this.closePopup();
      }});
    }
    options.push({ text: '离开', action: () => {
      // 离开不标记 cleared，但必须关闭弹窗
      this.closePopup();
    }});
    this.createPopup('补给站', `剩余金币: ${gameState.gold}\n\n选择补给项目：`, options);
  }

  // ==================== 弹窗：奖励点 ====================

  private showRewardPopup(cell: MapCell): void {
    const rewards: Record<string, { name: string; gold: number; food?: number; caravanHp?: number; morale?: number }> = {
      small: { name: '小货箱', gold: 10, food: 1 },
      medium: { name: '商队残骸', gold: 15, caravanHp: 5 },
      large: { name: '旧世界储藏箱', gold: 25, morale: 1 },
    };
    const reward = rewards[cell.rewardType || 'small'];
    this.modifyGold(reward.gold);
    if (reward.food) this.modifyFood(reward.food);
    if (reward.caravanHp) this.modifyCaravanHp(reward.caravanHp);
    if (reward.morale) this.modifyMorale(reward.morale);

    const descParts = [`金币 +${reward.gold}`];
    if (reward.food) descParts.push(`食物 +${reward.food}`);
    if (reward.caravanHp) descParts.push(`商队耐久 +${reward.caravanHp}`);
    if (reward.morale) descParts.push(`士气 +${reward.morale}`);

    this.createPopup(reward.name, `发现了${reward.name}！\n\n${descParts.join('\n')}`, [
      { text: '继续', action: () => {
        this.completeCurrentCell(cell);
        this.closePopup();
      }}
    ]);
  }

  // ==================== 资源修改方法 ====================

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
    console.log(`[地图] 所有角色恢复 ${amount} HP`);
  }

  private healRandomCharacter(amount: number): void {
    console.log(`[地图] 随机角色恢复 ${amount} HP`);
  }

  private damageRandomCharacter(amount: number): void {
    console.log(`[地图] 随机角色受到 ${amount} 伤害`);
  }

  // ==================== UI 更新 ====================

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
    const x = (this.scale.width - totalWidth) / 2;
    const startY = 45;

    chars.forEach((charId, index) => {
      const char = CHARACTER_DEFS[charId];
      const px = x + index * spacing;

      const bg = this.add.graphics();
      bg.fillStyle(char.color, 0.3);
      bg.fillRect(px - 20, startY, 40, 40);
      bg.lineStyle(2, char.color, 1);
      bg.strokeRect(px - 20, startY, 40, 40);

      this.add.text(px, startY + 20, char.name.slice(0, 2), {
        fontSize: '14px', color: '#ffffff', fontFamily: 'monospace'
      }).setOrigin(0.5);
    });
  }

  // ==================== 游戏状态检查 ====================

  private checkGameStatus(gameState: ReturnType<typeof getGameState>): boolean {
    const gameOver = checkGameOver(gameState);
    if (gameOver.isOver) {
      this.showGameOver(gameOver.reason!);
      return true;
    }

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

  // ==================== 调试功能 ====================

  /** T键：随机移动到一个可达格 */
  private debugRandomMove(): void {
    // 如果有弹窗打开，先关闭
    if (this.popupObjects.length > 0) {
      console.log('[地图测试] 弹窗打开中，先关闭弹窗');
      this.closePopup();
      return;
    }

    const gameState = getGameState();
    const reachable: { x: number; y: number }[] = [];

    for (let y = 0; y < gameState.mapHeight; y++) {
      for (let x = 0; x < gameState.mapWidth; x++) {
        if (gameState.mapCells[y][x].isReachable) {
          reachable.push({ x, y });
        }
      }
    }

    if (reachable.length === 0) {
      console.log(`[地图测试] step=${this.debugStep} 没有可达格！当前坐标:`, gameState.currentPosition);
      // 打印周围四格信息
      const { x: cx, y: cy } = gameState.currentPosition;
      const dirs = [
        { name: '上', dx: 0, dy: -1 },
        { name: '下', dx: 0, dy: 1 },
        { name: '左', dx: -1, dy: 0 },
        { name: '右', dx: 1, dy: 0 },
      ];
      for (const dir of dirs) {
        const nx = cx + dir.dx;
        const ny = cy + dir.dy;
        if (nx >= 0 && nx < gameState.mapWidth && ny >= 0 && ny < gameState.mapHeight) {
          const c = gameState.mapCells[ny][nx];
          console.log(`[地图测试] ${dir.name} (${nx},${ny}): type=${c.type} isReachable=${c.isReachable} isCleared=${c.isCleared} isRevealed=${c.isRevealed} visited=${c.visited} resolvedType=${c.resolvedType}`);
        }
      }
      return;
    }

    const target = reachable[Math.floor(Math.random() * reachable.length)];
    this.debugStep++;

    console.log(`[地图测试] step=${this.debugStep} current=(${gameState.currentPosition.x},${gameState.currentPosition.y}) -> (${target.x},${target.y}) reachableCount=${reachable.length} popupObjects=${this.popupObjects.length} day=${gameState.day}`);

    // 直接调用移动逻辑（跳过弹窗，只处理移动）
    this.onCellClick(target.x, target.y);
  }
}
