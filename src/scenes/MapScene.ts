import Phaser from 'phaser';
import {
  getGameState,
  setGameState,
  moveToCell,
  checkGameOver,
  checkVictory,
  MapCell,
  resetGameState,
  resolveQuestionCell,
  updateReachableCells,
  canMoveTo,
  getMovableNeighbors,
} from '../systems/GameState';
import { CHARACTER_DEFS } from '../data/characters';

/**
 * MapScene V2 - 稳定重构版
 *
 * 核心改动：
 * 1. 整个地图只监听一次 pointerdown，根据坐标换算格子
 * 2. 动态 canMoveTo() 判断移动，不依赖 isReachable 状态
 * 3. 统一 tryMoveTo() 入口，所有移动方式共用
 * 4. 单一 modalContainer 弹窗系统
 * 5. WASD/方向键移动商队（不是镜头）
 * 6. T/Y 自动测试键（Y 跳过战斗）
 */
export class MapScene extends Phaser.Scene {
  // 地图格子图形和文字
  private cellGraphics: Phaser.GameObjects.Graphics[][] = [];
  private cellTexts: Phaser.GameObjects.Text[][] = [];

  // 资源显示
  private resourceTexts: { [key: string]: Phaser.GameObjects.Text } = {};
  private debugTexts: { [key: string]: Phaser.GameObjects.Text } = {};

  // 地图参数
  private cellSize = 42;
  private cellGap = 4;
  private mapContainer!: Phaser.GameObjects.Container;

  // 弹窗系统：单一容器
  private modalContainer?: Phaser.GameObjects.Container;
  private modalActions: (() => void)[] = [];

  // 自动测试状态
  private _autoTestTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super({ key: 'MapScene' });
  }

  // ==================== 场景创建 ====================

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRect(0, 0, w, h);

    // 获取游戏状态
    const gameState = getGameState();

    // 更新可达格显示
    updateReachableCells(gameState);
    setGameState(gameState);

    // 创建地图容器
    this.mapContainer = this.add.container(0, 30);

    // 创建资源显示（固定UI层）
    this.createResourceDisplay(w, h);

    // 创建地图格子（加到 mapContainer）
    this.createMapGrid(gameState);

    // 创建队伍显示（固定UI层）
    this.createPartyDisplay(gameState);

    // 整个地图只监听一次 pointerdown
    this.setupMapPointer();

    // 键盘事件
    this.setupKeyboard();

    // 初始化时居中到玩家
    this.centerCameraOnPlayer();

    // 检查游戏状态
    this.checkGameStatus(gameState);

    console.log('[地图V2] 地图场景已加载');

    // 如果是从战斗返回的自动移动测试，继续执行
    const gs = getGameState();
    if (gs._isAutoMoving && gs._autoMoveResumeStep > 0) {
      const gameOver = checkGameOver(gs);
      if (gameOver.isOver) {
        console.log('[地图V2] 自动移动测试停止：游戏结束');
        gs._isAutoMoving = false;
        gs._autoMoveResumeStep = 0;
        setGameState(gs);
      } else {
        console.log(
          `[地图V2] 从战斗/弹窗返回，继续自动移动测试 step=${gs._autoMoveResumeStep}`
        );
        this.time.delayedCall(500, () => {
          this.autoMoveStep(gs._autoMoveResumeStep);
        });
      }
    }

    // 如果是从战斗返回的鼠标点击模拟测试，继续执行
    if (gs._isClickTesting && gs._clickTestResumeStep > 0) {
      const gameOver2 = checkGameOver(gs);
      if (gameOver2.isOver) {
        console.log('[鼠标模拟测试] 停止：游戏结束');
        gs._isClickTesting = false;
        gs._clickTestResumeStep = 0;
        gs._clickTestStep = 0;
        setGameState(gs);
      } else {
        console.log(
          `[鼠标模拟测试] 从战斗返回，继续点击模拟测试 step=${gs._clickTestResumeStep}`
        );
        gs._clickTestStep = gs._clickTestResumeStep;
        gs._clickTestResumeStep = 0;
        setGameState(gs);
        this.time.delayedCall(500, () => {
          this.clickSimStep();
        });
      }
    }

    // 如果是从战斗返回的G键方向模拟测试，继续执行
    if (gs._isDirectionalTesting && gs._directionalTestResumeStep > 0) {
      const gameOver3 = checkGameOver(gs);
      if (gameOver3.isOver) {
        console.log('[方向模拟测试] 停止：游戏结束');
        gs._isDirectionalTesting = false;
        gs._directionalTestResumeStep = 0;
        gs._directionalTestStep = 0;
        setGameState(gs);
      } else {
        console.log(
          `[方向模拟测试] 从战斗返回，继续方向模拟测试 step=${gs._directionalTestResumeStep}`
        );
        gs._directionalTestStep = gs._directionalTestResumeStep;
        gs._directionalTestResumeStep = 0;
        setGameState(gs);
        this.time.delayedCall(500, () => {
          this.directionalSimStep();
        });
      }
    }
  }

  // ==================== 单一 pointerdown 监听 ====================

  private setupMapPointer(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handleMapPointer(pointer);
    });
  }

  /** 处理地图 pointer 点击（坐标换算→tryMoveTo） */
  private handleMapPointer(pointer: Phaser.Input.Pointer): void {
    // 如果有弹窗打开，不处理地图点击
    if (this.modalContainer) return;

    // 将鼠标坐标转换为地图容器内坐标
    const worldX = pointer.x - this.mapContainer.x;
    const worldY = pointer.y - this.mapContainer.y;

      // 换算成格子坐标
      const cellX = Math.floor(worldX / (this.cellSize + this.cellGap));
      const cellY = Math.floor(worldY / (this.cellSize + this.cellGap));

      // 检查是否在格子范围内（排除间隙区域）
      const pixelX = cellX * (this.cellSize + this.cellGap);
      const pixelY = cellY * (this.cellSize + this.cellGap);
      const inCellX = worldX - pixelX;
      const inCellY = worldY - pixelY;

      if (inCellX < 0 || inCellX >= this.cellSize) return;
      if (inCellY < 0 || inCellY >= this.cellSize) return;

      const gameState = getGameState();
      if (
        cellX < 0 || cellY < 0 ||
        cellX >= gameState.mapWidth ||
        cellY >= gameState.mapHeight
      ) {
        return;
      }

      console.log(
        `[地图V2] 点击格子 (${cellX}, ${cellY})`,
        `pointer=(${pointer.x},${pointer.y})`,
        `world=(${worldX},${worldY})`
      );

      // 统一调用 tryMoveTo
      this.tryMoveTo(cellX, cellY);
  }

  // ==================== 键盘事件 ====================

  private setupKeyboard(): void {
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      switch (key) {
        case 'w':
        case 'arrowup': {
          const gs = getGameState();
          this.tryMoveTo(gs.currentPosition.x, gs.currentPosition.y - 1);
          break;
        }
        case 's':
        case 'arrowdown': {
          const gs = getGameState();
          this.tryMoveTo(gs.currentPosition.x, gs.currentPosition.y + 1);
          break;
        }
        case 'a':
        case 'arrowleft': {
          const gs = getGameState();
          this.tryMoveTo(gs.currentPosition.x - 1, gs.currentPosition.y);
          break;
        }
        case 'd':
        case 'arrowright': {
          const gs = getGameState();
          this.tryMoveTo(gs.currentPosition.x + 1, gs.currentPosition.y);
          break;
        }
        case ' ':
          this.centerCameraOnPlayer();
          break;
        case 't':
          this.clickSimulationTest();
          break;
        case 'y':
          this.autoMoveTest();
          break;
        case 'g': {
          this.directionalClickTest();
          break;
        }
        case 'escape':
          if (this.modalContainer) {
            console.log('[地图V2] Escape 关闭弹窗');
            this.closeModal();
            // 如果自动移动测试正在进行，关闭弹窗后继续
            const gs = getGameState();
            if (gs._isAutoMoving && gs._autoMoveResumeStep > 0) {
              this.time.delayedCall(300, () => {
                this.autoMoveStep(gs._autoMoveResumeStep);
              });
            }
          }
          break;
        default:
          return;
      }
    });
  }

  // ==================== 统一移动入口 ====================

  /**
   * 唯一移动入口。所有移动方式（鼠标、键盘、T键、Y键）都调用此方法。
   *
   * 逻辑：
   * 1. 判断 canMoveTo(x, y)
   * 2. 如果不能移动，打印日志并 return
   * 3. 更新 currentPosition
   * 4. day +1
   * 5. 标记 cell.isVisited = true
   * 6. 如果未揭示，则揭示
   * 7. 重新绘制地图
   * 8. 更新资源 UI
   * 9. 处理当前格内容
   */
  private tryMoveTo(x: number, y: number): void {
    const gameState = getGameState();

    // 1. 动态判断是否可移动
    if (!canMoveTo(gameState, x, y)) {
      console.log(
        `[地图V2] 不能移动到 (${x}, ${y})`,
        `current=(${gameState.currentPosition.x},${gameState.currentPosition.y})`
      );
      return;
    }

    // 2. 执行移动
    const moved = moveToCell(gameState, x, y);
    if (!moved) {
      console.log(`[地图V2] moveToCell 返回 false`);
      return;
    }

    // 3. 保存状态
    setGameState(gameState);

    // 4. 揭示未揭示的格子
    const cell = gameState.mapCells[y][x];
    if (!cell.isRevealed) {
      cell.isRevealed = true;
      if (cell.type === 'question') {
        cell.resolvedType = resolveQuestionCell(
          cell,
          gameState.startPosition,
          gameState.bossPosition
        );
      }
      setGameState(gameState);
    }

    // 5. 重新绘制地图
    this.redrawMap();
    this.updateResourceDisplay();

    // 6. 居中镜头
    this.centerCameraOnPlayer();

    // 7. 检查游戏状态（胜利/失败）
    if (this.checkGameStatus(gameState)) return;

    // 8. 处理格子内容
    this.handleCellContent(cell);
  }

  // ==================== 弹窗系统（单一 modalContainer） ====================

  /** 关闭弹窗 */
  private closeModal(): void {
    if (this.modalContainer) {
      this.modalContainer.destroy(true);
      this.modalContainer = undefined;
      this.modalActions = [];
      console.log('[弹窗] 已关闭 modalContainer=undefined');
    }
  }

  /** 打开弹窗前先关闭旧弹窗 */
  private openModal(
    title: string,
    desc: string,
    options: { text: string; action: () => void }[]
  ): void {
    // 先关闭旧弹窗
    this.closeModal();

    const w = this.scale.width;
    const h = this.scale.height;

    // 创建弹窗容器
    this.modalContainer = this.add.container(0, 0);

    // 遮罩
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, w, h);
    this.modalContainer.add(overlay);

    // 弹窗背景
    const popupBg = this.add.graphics();
    popupBg.fillStyle(0x2a2a3e, 1);
    popupBg.fillRect(w / 2 - 200, h / 2 - 120, 400, 240);
    popupBg.lineStyle(3, 0x555566, 1);
    popupBg.strokeRect(w / 2 - 200, h / 2 - 120, 400, 240);
    this.modalContainer.add(popupBg);

    // 标题
    const titleText = this.add.text(w / 2, h / 2 - 90, title, {
      fontSize: '24px',
      color: '#ffcc44',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.modalContainer.add(titleText);

    // 描述
    const descText = this.add.text(w / 2, h / 2 - 30, desc, {
      fontSize: '16px',
      color: '#cccccc',
      fontFamily: 'monospace',
      align: 'center',
    }).setOrigin(0.5);
    this.modalContainer.add(descText);

    // 选项按钮
    const btnY = h / 2 + 40;
    const btnSpacing = 120;
    const startX = w / 2 - ((options.length - 1) * btnSpacing) / 2;

    options.forEach((opt, index) => {
      const btn = this.add.text(
        startX + index * btnSpacing,
        btnY,
        opt.text,
        {
          fontSize: '16px',
          color: '#ffffff',
          backgroundColor: '#2a4a6a',
          padding: { x: 15, y: 8 },
          fontFamily: 'monospace',
        }
      )
        .setOrigin(0.5)
        .setInteractive();
      this.modalContainer!.add(btn);
      this.modalActions.push(opt.action);

      btn.on('pointerdown', opt.action);
      btn.on('pointerover', () =>
        btn.setStyle({ backgroundColor: '#3a6aaa' })
      );
      btn.on('pointerout', () =>
        btn.setStyle({ backgroundColor: '#2a4a6a' })
      );
    });

    console.log(
      `[弹窗] 已打开: ${title} modalContainer=${this.modalContainer ? 'ok' : 'undefined'}`
    );
  }

  /** 执行弹窗第一个按钮的 action */
  private executeFirstModalAction(): boolean {
    if (this.modalActions.length > 0) {
      const action = this.modalActions[0];
      action();
      return true;
    }
    return false;
  }

  // ==================== 格子完成处理 ====================

  /** 标记格子为已完成，刷新地图 */
  private completeCell(cell: MapCell): void {
    cell.isCleared = true;
    cell.isRevealed = true;
    setGameState(getGameState());
    console.log(
      `[地图V2] 格子 (${cell.x}, ${cell.y}) 已完成，type=${cell.type}`
    );
  }

  // ==================== 地图创建 ====================

  private createResourceDisplay(w: number, h: number): void {
    const gameState = getGameState();
    const y = 10;
    const spacing = 130;
    const startX = w / 2 - spacing * 2;

    this.resourceTexts['day'] = this.add.text(
      startX,
      y,
      `📅 ${gameState.day}/${gameState.maxDay}`,
      {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: 'monospace',
      }
    );

    this.resourceTexts['food'] = this.add.text(
      startX + spacing,
      y,
      `🍞 ${gameState.food}`,
      {
        fontSize: '14px',
        color: '#88ff88',
        fontFamily: 'monospace',
      }
    );

    const moraleColor =
      gameState.morale >= 3
        ? '#ffcc44'
        : gameState.morale > 0
          ? '#ff8844'
          : '#ff4444';
    this.resourceTexts['morale'] = this.add.text(
      startX + spacing * 2,
      y,
      `💪 ${gameState.morale}`,
      {
        fontSize: '14px',
        color: moraleColor,
        fontFamily: 'monospace',
      }
    );

    const caravanColor =
      gameState.caravanHp > gameState.caravanMaxHp * 0.5
        ? '#88ccff'
        : '#ffaa44';
    this.resourceTexts['caravan'] = this.add.text(
      startX + spacing * 3,
      y,
      `🚗 ${gameState.caravanHp}/${gameState.caravanMaxHp}`,
      {
        fontSize: '14px',
        color: caravanColor,
        fontFamily: 'monospace',
      }
    );

    this.resourceTexts['gold'] = this.add.text(
      startX + spacing * 4,
      y,
      `💰 ${gameState.gold}`,
      {
        fontSize: '14px',
        color: '#ffdd44',
        fontFamily: 'monospace',
      }
    );

    // 调试信息
    this.debugTexts['pos'] = this.add.text(10, y, '', {
      fontSize: '12px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    });

    // 操作提示
    this.add
      .text(
        w / 2,
        h - 20,
        'WASD/方向键=移动商队 | Space=居中 | T=随机走 | Y=自动200步 | 点击格子移动',
        {
          fontSize: '12px',
          color: '#888888',
          fontFamily: 'monospace',
        }
      )
      .setOrigin(0.5);
  }

  private createMapGrid(
    gameState: ReturnType<typeof getGameState>
  ): void {
    for (let y = 0; y < gameState.mapHeight; y++) {
      this.cellGraphics[y] = [];
      this.cellTexts[y] = [];

      for (let x = 0; x < gameState.mapWidth; x++) {
        const cell = gameState.mapCells[y][x];
        const px = x * (this.cellSize + this.cellGap);
        const py = y * (this.cellSize + this.cellGap);

        // 创建格子图形（无 hitArea，点击由全局 pointerdown 处理）
        const graphics = this.add.graphics();
        this.drawCell(graphics, cell, px, py);
        this.cellGraphics[y][x] = graphics;
        this.mapContainer.add(graphics);

        // 格子内容图标
        const icon = this.getCellIcon(cell);
        const text = this.add
          .text(
            px + this.cellSize / 2,
            py + this.cellSize / 2,
            icon,
            {
              fontSize: '20px',
            }
          )
          .setOrigin(0.5);
        this.cellTexts[y][x] = text;
        this.mapContainer.add(text);
      }
    }
  }

  // ==================== 地图绘制 ====================

  private drawCell(
    graphics: Phaser.GameObjects.Graphics,
    cell: MapCell,
    x: number,
    y: number
  ): void {
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
        case 'combat':
          return cell.isCleared ? '✓' : '⚔️';
        case 'event':
          return cell.isCleared ? '✓' : '❓';
        case 'opportunity':
          return cell.isCleared ? '✓' : '✨';
        case 'danger':
          return cell.isCleared ? '✓' : '⚠️';
        case 'reward':
          return cell.isCleared ? '✓' : '🎁';
        default:
          return '·';
      }
    }

    if (cell.type === 'question') return '?';
    if (cell.visited) return '·';
    return '';
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

  // ==================== 视角控制 ====================

  private centerCameraOnPlayer(): void {
    const gameState = getGameState();
    const mapPixelW =
      gameState.mapWidth * (this.cellSize + this.cellGap) - this.cellGap;
    const mapPixelH =
      gameState.mapHeight * (this.cellSize + this.cellGap) - this.cellGap;
    const screenW = this.scale.width;
    const screenH = this.scale.height;

    const playerPixelX =
      gameState.currentPosition.x * (this.cellSize + this.cellGap) +
      this.cellSize / 2;
    const playerPixelY =
      gameState.currentPosition.y * (this.cellSize + this.cellGap) +
      this.cellSize / 2;

    let offsetX = Math.round(screenW / 2 - playerPixelX);
    let offsetY = Math.round(screenH / 2 - playerPixelY + 30);

    offsetX = Math.max(-(mapPixelW - screenW + 40), Math.min(40, offsetX));
    offsetY = Math.max(-(mapPixelH - screenH + 40), Math.min(40, offsetY));

    this.mapContainer.setPosition(offsetX, offsetY);
  }

  // ==================== 格子内容处理 ====================

  private handleCellContent(cell: MapCell): void {
    // 已清理的格子：不触发任何内容
    if (cell.isCleared) {
      console.log(
        `[地图V2] 格子 (${cell.x}, ${cell.y}) 已清理，跳过`
      );
      return;
    }

    const gameState = getGameState();
    const isAutoMoving = gameState._isAutoMoving;

    // Boss 格直接进入战斗（自动测试时跳过）
    if (cell.type === 'boss') {
      if (isAutoMoving) {
        console.log(
          `[地图压力测试] 跳过Boss战斗 (${cell.x},${cell.y})，直接标记已清理`
        );
        cell.isCleared = true;
        setGameState(gameState);
        this.redrawMap();
        this.updateResourceDisplay();
        return;
      }
      gameState.currentBattleType = 'boss';
      setGameState(gameState);
      this.scene.start('BattleScene');
      return;
    }

    // 强敌格进入精英战斗（自动测试时跳过）
    if (cell.type === 'elite') {
      if (isAutoMoving) {
        console.log(
          `[地图压力测试] 跳过精英战斗 (${cell.x},${cell.y})，直接标记已清理`
        );
        cell.isCleared = true;
        setGameState(gameState);
        this.redrawMap();
        this.updateResourceDisplay();
        return;
      }
      gameState.currentBattleType = 'elite';
      setGameState(gameState);
      this.scene.start('BattleScene');
      return;
    }

    // 营地格（自动测试时直接标记清理）
    if (cell.type === 'camp') {
      if (isAutoMoving) {
        console.log(
          `[地图压力测试] 自动处理营地 (${cell.x},${cell.y})`
        );
        cell.isCleared = true;
        setGameState(gameState);
        this.redrawMap();
        this.updateResourceDisplay();
        return;
      }
      this.showCampPopup(cell);
      return;
    }

    // 补给点（自动测试时直接标记清理）
    if (cell.type === 'supply') {
      if (isAutoMoving) {
        console.log(
          `[地图压力测试] 自动处理补给 (${cell.x},${cell.y})`
        );
        cell.isCleared = true;
        setGameState(gameState);
        this.redrawMap();
        this.updateResourceDisplay();
        return;
      }
      this.showSupplyPopup(cell);
      return;
    }

    // 奖励点（自动测试时直接标记清理）
    if (cell.type === 'reward') {
      if (isAutoMoving) {
        console.log(
          `[地图压力测试] 自动处理奖励 (${cell.x},${cell.y})`
        );
        cell.isCleared = true;
        setGameState(gameState);
        this.redrawMap();
        this.updateResourceDisplay();
        return;
      }
      this.showRewardPopup(cell);
      return;
    }

    // 目标点（sanctuary 类型）
    if (cell.isGoal && gameState.expeditionGoal === 'sanctuary') {
      return;
    }

    // 问号格：根据揭示的内容触发
    if (cell.type === 'question' && cell.resolvedType) {
      this.triggerResolvedContent(cell);
    }
  }

  private triggerResolvedContent(cell: MapCell): void {
    if (!cell.resolvedType) return;

    const gameState = getGameState();
    const isAutoMoving = gameState._isAutoMoving;

    switch (cell.resolvedType) {
      case 'combat':
        if (isAutoMoving) {
          console.log(
            `[地图压力测试] 跳过战斗 (${cell.x},${cell.y})，resolvedType=combat，直接标记已清理`
          );
          cell.isCleared = true;
          setGameState(gameState);
          this.redrawMap();
          this.updateResourceDisplay();
          return;
        }
        this.enterCombat(cell);
        break;
      case 'event':
        if (isAutoMoving) {
          console.log(
            `[地图压力测试] 自动处理事件 (${cell.x},${cell.y})`
          );
          cell.isCleared = true;
          setGameState(gameState);
          this.redrawMap();
          this.updateResourceDisplay();
          return;
        }
        this.showEventPopup(cell);
        break;
      case 'opportunity':
        if (isAutoMoving) {
          console.log(
            `[地图压力测试] 自动处理机遇 (${cell.x},${cell.y})`
          );
          cell.isCleared = true;
          setGameState(gameState);
          this.redrawMap();
          this.updateResourceDisplay();
          return;
        }
        this.showOpportunityPopup(cell);
        break;
      case 'danger':
        if (isAutoMoving) {
          console.log(
            `[地图压力测试] 跳过危险 (${cell.x},${cell.y})，resolvedType=danger，直接标记已清理`
          );
          cell.isCleared = true;
          setGameState(gameState);
          this.redrawMap();
          this.updateResourceDisplay();
          return;
        }
        this.showDangerPopup(cell);
        break;
      case 'reward':
        if (isAutoMoving) {
          console.log(
            `[地图压力测试] 自动处理奖励 (${cell.x},${cell.y})`
          );
          cell.isCleared = true;
          setGameState(gameState);
          this.redrawMap();
          this.updateResourceDisplay();
          return;
        }
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
      {
        name: '废弃货箱',
        desc: '发现一个废弃的货箱',
        options: [
          {
            text: '搜索',
            action: () => {
              this.modifyFood(2);
              this.completeCell(cell);
              this.closeModal();
              this.redrawMap();
              this.updateResourceDisplay();
            },
          },
          {
            text: '谨慎离开',
            action: () => {
              this.completeCell(cell);
              this.closeModal();
              this.redrawMap();
              this.updateResourceDisplay();
            },
          },
        ],
      },
      {
        name: '风暴前兆',
        desc: '天空阴沉，风暴即将来临',
        options: [
          {
            text: '强行前进',
            action: () => {
              this.modifyCaravanHp(-5);
              this.completeCell(cell);
              this.closeModal();
              this.redrawMap();
              this.updateResourceDisplay();
            },
          },
          {
            text: '原地等待',
            action: () => {
              this.modifyDay(1);
              this.completeCell(cell);
              this.closeModal();
              this.redrawMap();
              this.updateResourceDisplay();
            },
          },
        ],
      },
      {
        name: '陌生旅人',
        desc: '遇到一位疲惫的旅人',
        options: [
          {
            text: '交易',
            action: () => {
              this.modifyFood(1);
              this.modifyMorale(-1);
              this.completeCell(cell);
              this.closeModal();
              this.redrawMap();
              this.updateResourceDisplay();
            },
          },
          {
            text: '帮助他',
            action: () => {
              this.modifyMorale(1);
              this.completeCell(cell);
              this.closeModal();
              this.redrawMap();
              this.updateResourceDisplay();
            },
          },
        ],
      },
    ];

    const event =
      events[Math.floor(Math.random() * events.length)];
    this.openModal(event.name, event.desc, event.options);
  }

  // ==================== 弹窗：机遇 ====================

  private showOpportunityPopup(cell: MapCell): void {
    const opportunities = [
      {
        name: '发现补给',
        desc: '找到一些食物',
        effect: () => this.modifyFood(2),
      },
      {
        name: '士气提升',
        desc: '队伍状态良好',
        effect: () => this.modifyMorale(1),
      },
      {
        name: '发现零件',
        desc: '可以修理商队',
        effect: () => this.modifyCaravanHp(5),
      },
      {
        name: '短暂休息',
        desc: '一位角色恢复了一些体力',
        effect: () => this.healRandomCharacter(3),
      },
    ];

    const opp =
      opportunities[Math.floor(Math.random() * opportunities.length)];
    opp.effect();
    this.openModal('机遇', opp.desc, [
      {
        text: '确定',
        action: () => {
          this.completeCell(cell);
          this.closeModal();
          this.redrawMap();
          this.updateResourceDisplay();
        },
      },
    ]);
  }

  // ==================== 弹窗：危险 ====================

  private showDangerPopup(cell: MapCell): void {
    const dangers = [
      {
        name: '陷阱',
        desc: '商队触发了陷阱',
        effect: () => this.modifyCaravanHp(-5),
      },
      {
        name: '偷袭',
        desc: '一名角色受了轻伤',
        effect: () => this.damageRandomCharacter(3),
      },
      {
        name: '恶劣天气',
        desc: '士气下降',
        effect: () => this.modifyMorale(-1),
      },
    ];

    const danger =
      dangers[Math.floor(Math.random() * dangers.length)];
    danger.effect();

    // 50% 概率进入战斗
    if (Math.random() < 0.5) {
      this.openModal('危险', danger.desc + '\n\n遭遇敌人！', [
        {
          text: '进入战斗',
          action: () => {
            this.closeModal();
            this.enterCombat(cell);
          },
        },
      ]);
    } else {
      this.openModal('危险', danger.desc, [
        {
          text: '确定',
          action: () => {
            this.completeCell(cell);
            this.closeModal();
            this.redrawMap();
            this.updateResourceDisplay();
          },
        },
      ]);
    }
  }

  // ==================== 弹窗：问号中的奖励 ====================

  private showQuestionRewardPopup(cell: MapCell): void {
    const goldAmount = 5 + Math.floor(Math.random() * 10);
    this.modifyGold(goldAmount);
    this.openModal('意外收获', `发现了 ${goldAmount} 枚金币！`, [
      {
        text: '收下',
        action: () => {
          this.completeCell(cell);
          this.closeModal();
          this.redrawMap();
          this.updateResourceDisplay();
        },
      },
    ]);
  }

  // ==================== 弹窗：营地 ====================

  private showCampPopup(cell: MapCell): void {
    this.healAllCharacters(5);
    this.modifyMorale(1);
    this.openModal(
      '营地',
      '在营地休息恢复\n\n所有角色恢复 5 HP\n士气 +1',
      [
        {
          text: '继续',
          action: () => {
            this.completeCell(cell);
            this.closeModal();
            this.redrawMap();
            this.updateResourceDisplay();
          },
        },
      ]
    );
  }

  // ==================== 弹窗：补给站 ====================

  private showSupplyPopup(cell: MapCell): void {
    const gameState = getGameState();
    const options: { text: string; action: () => void }[] = [
      {
        text: '免费补给 (食物+2)',
        action: () => {
          this.modifyFood(2);
          this.completeCell(cell);
          this.closeModal();
          this.redrawMap();
          this.updateResourceDisplay();
        },
      },
    ];
    if (gameState.gold >= 20) {
      options.push({
        text: '修理商队 (-20金)',
        action: () => {
          this.modifyGold(-20);
          this.modifyCaravanHp(15);
          this.completeCell(cell);
          this.closeModal();
          this.redrawMap();
          this.updateResourceDisplay();
        },
      });
    }
    if (gameState.gold >= 15) {
      options.push({
        text: '鼓舞队伍 (-15金)',
        action: () => {
          this.modifyGold(-15);
          this.modifyMorale(2);
          this.completeCell(cell);
          this.closeModal();
          this.redrawMap();
          this.updateResourceDisplay();
        },
      });
    }
    options.push({
      text: '离开',
      action: () => {
        this.completeCell(cell);
        this.closeModal();
        this.redrawMap();
        this.updateResourceDisplay();
      },
    });
    this.openModal(
      '补给站',
      `剩余金币: ${gameState.gold}\n\n选择补给项目：`,
      options
    );
  }

  // ==================== 弹窗：奖励点 ====================

  private showRewardPopup(cell: MapCell): void {
    const rewards: Record<
      string,
      {
        name: string;
        gold: number;
        food?: number;
        caravanHp?: number;
        morale?: number;
      }
    > = {
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
    if (reward.caravanHp)
      descParts.push(`商队耐久 +${reward.caravanHp}`);
    if (reward.morale) descParts.push(`士气 +${reward.morale}`);

    this.openModal(
      reward.name,
      `发现了${reward.name}！\n\n${descParts.join('\n')}`,
      [
        {
          text: '继续',
          action: () => {
            this.completeCell(cell);
            this.closeModal();
            this.redrawMap();
            this.updateResourceDisplay();
          },
        },
      ]
    );
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
    gameState.caravanHp = Math.max(
      0,
      Math.min(gameState.caravanMaxHp, gameState.caravanHp + delta)
    );
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
    console.log(`[地图V2] 所有角色恢复 ${amount} HP`);
  }

  private healRandomCharacter(amount: number): void {
    console.log(`[地图V2] 随机角色恢复 ${amount} HP`);
  }

  private damageRandomCharacter(amount: number): void {
    console.log(`[地图V2] 随机角色受到 ${amount} 伤害`);
  }

  // ==================== UI 更新 ====================

  private updateResourceDisplay(): void {
    const gameState = getGameState();

    this.resourceTexts['day'].setText(
      `📅 ${gameState.day}/${gameState.maxDay}`
    );
    this.resourceTexts['food'].setText(`🍞 ${gameState.food}`);

    const moraleColor =
      gameState.morale >= 3
        ? '#ffcc44'
        : gameState.morale > 0
          ? '#ff8844'
          : '#ff4444';
    this.resourceTexts['morale'].setText(`💪 ${gameState.morale}`);
    this.resourceTexts['morale'].setColor(moraleColor);

    const caravanColor =
      gameState.caravanHp > gameState.caravanMaxHp * 0.5
        ? '#88ccff'
        : '#ffaa44';
    this.resourceTexts['caravan'].setText(
      `🚗 ${gameState.caravanHp}/${gameState.caravanMaxHp}`
    );
    this.resourceTexts['caravan'].setColor(caravanColor);

    this.resourceTexts['gold'].setText(`💰 ${gameState.gold}`);

    // 调试信息
    const movable = getMovableNeighbors(gameState);
    if (this.debugTexts['pos']) {
      this.debugTexts['pos'].setText(
        `位置:(${gameState.currentPosition.x},${gameState.currentPosition.y}) 可走:${movable.length} 弹窗:${this.modalContainer ? '开' : '关'}`
      );
    }
  }

  private createPartyDisplay(
    gameState: ReturnType<typeof getGameState>
  ): void {
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

      this.add
        .text(px, startY + 20, char.name.slice(0, 2), {
          fontSize: '14px',
          color: '#ffffff',
          fontFamily: 'monospace',
        })
        .setOrigin(0.5);
    });
  }

  // ==================== 游戏状态检查 ====================

  private checkGameStatus(
    gameState: ReturnType<typeof getGameState>
  ): boolean {
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

    const title = this.add
      .text(w / 2, h / 2 - 40, '💀 远征失败', {
        fontSize: '36px',
        color: '#ff4444',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const desc = this.add
      .text(w / 2, h / 2 + 10, reason, {
        fontSize: '18px',
        color: '#aaaaaa',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    const btn = this.add
      .text(w / 2, h / 2 + 60, '【返回主菜单】', {
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#444466',
        padding: { x: 20, y: 10 },
        fontFamily: 'monospace',
      })
      .setOrigin(0.5)
      .setInteractive();

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

    const title = this.add
      .text(w / 2, h / 2 - 40, '🎉 远征胜利！', {
        fontSize: '36px',
        color: '#ffcc44',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const victoryText =
      gameState.expeditionGoal === 'boss'
        ? '你成功击败了首领，完成了远征！'
        : '你成功抵达了安全据点，完成了远征！';

    const desc = this.add
      .text(w / 2, h / 2 + 10, victoryText, {
        fontSize: '18px',
        color: '#cccccc',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    const btn = this.add
      .text(w / 2, h / 2 + 60, '【返回主菜单】', {
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#2a4a8a',
        padding: { x: 20, y: 10 },
        fontFamily: 'monospace',
      })
      .setOrigin(0.5)
      .setInteractive();

    btn.on('pointerdown', () => {
      resetGameState();
      this.scene.start('MainMenuScene');
    });
  }

  // ==================== 调试功能：T 键鼠标点击模拟测试 ====================

  /**
   * 真正的鼠标点击模拟测试。
   * 通过 Phaser Input Manager 发出真实的 pointerdown 事件，
   * 走完整个 UI 交互链路（与人类点击完全一致）。
   *
   * 流程：
   * 1. 模拟点击地图格子移动（pointerdown → setupMapPointer handler → tryMoveTo）
   * 2. 弹窗出现时，找到弹窗按钮游戏对象，emit pointerdown
   * 3. 如果进入战斗，BattleScene 中模拟点击卡牌→敌人→结束回合
   */
  private clickSimulationTest(): void {
    const gs = getGameState();
    if (gs._isClickTesting) {
      console.log('[鼠标模拟测试] 已在进行中，忽略');
      return;
    }
    gs._isClickTesting = true;
    gs._clickTestStep = 0;
    setGameState(gs);
    console.log('[鼠标模拟测试] 开始！模拟人类鼠标点击操作（30步）');
    this.clickSimStep();
  }

  private clickSimStep(): void {
    const gs = getGameState();
    const step = gs._clickTestStep;

    if (step >= 30) {
      console.log('[鼠标模拟测试] 完成！成功模拟 30 步鼠标点击');
      gs._isClickTesting = false;
      gs._clickTestStep = 0;
      setGameState(gs);
      return;
    }

    // 如果有弹窗，模拟点击弹窗按钮
    if (this.modalContainer) {
      this.clickSimModalButton(step);
      return;
    }

    // 模拟点击地图格子
    this.clickSimMapCell(step);
  }

  /** 模拟点击弹窗中的第一个按钮 */
  private clickSimModalButton(step: number): void {
    // 在 modalContainer 中找到按钮（Text 游戏对象且 interactive 的）
    const buttons: Phaser.GameObjects.Text[] = [];
    if (this.modalContainer) {
      this.modalContainer.each((child) => {
        if (child instanceof Phaser.GameObjects.Text && child.input?.enabled) {
          buttons.push(child);
        }
      });
    }

    // 判断当前是方向测试还是T键随机测试
    const gs = getGameState();
    const isDirectional = gs._isDirectionalTesting;

    if (buttons.length > 0) {
      const btn = buttons[0];
      console.log(`[鼠标模拟测试] step=${step} 模拟点击弹窗按钮: "${btn.text}"`);

      // 保存恢复步数
      if (isDirectional) {
        gs._directionalTestResumeStep = step + 1;
      } else {
        gs._clickTestResumeStep = step + 1;
      }
      setGameState(gs);

      // 通过游戏对象的 emit 直接触发 pointerdown 事件
      btn.emit('pointerdown');

      // 延迟检查是否进入战斗
      this.time.delayedCall(500, () => {
        if (!this.scene.isActive()) {
          console.log(`[鼠标模拟测试] step=${step} 弹窗操作后进入战斗，等待返回...`);
          return;
        }
        const gs2 = getGameState();
        if (isDirectional) {
          gs2._directionalTestResumeStep = 0;
          gs2._directionalTestStep = step + 1;
          setGameState(gs2);
          this.directionalSimStep();
        } else {
          gs2._clickTestResumeStep = 0;
          gs2._clickTestStep = step + 1;
          setGameState(gs2);
          this.clickSimStep();
        }
      });
    } else {
      console.log(`[鼠标模拟测试] step=${step} 弹窗中没有找到可点击按钮，跳过`);
      if (isDirectional) {
        gs._directionalTestStep = step + 1;
        setGameState(gs);
        this.directionalSimStep();
      } else {
        gs._clickTestStep = step + 1;
        setGameState(gs);
        this.clickSimStep();
      }
    }
  }

  /** 模拟点击地图格子（通过 Phaser pointerdown 事件） */
  private clickSimMapCell(step: number): void {
    const gameState = getGameState();
    const movable = getMovableNeighbors(gameState);

    if (movable.length === 0) {
      console.log(`[鼠标模拟测试] step=${step} 无可走格，测试结束`);
      const gs = getGameState();
      gs._isClickTesting = false;
      gs._clickTestStep = 0;
      setGameState(gs);
      return;
    }

    const target = movable[Math.floor(Math.random() * movable.length)];

    // 计算格子中心在 canvas 中的坐标
    // 格子坐标 = cellIndex * (cellSize + cellGap) + cellSize/2
    // pointer 坐标 = 格子坐标 + mapContainer 位置（因为 handleMapPointer 会减去 mapContainer 位置）
    const cellCenterX = target.x * (this.cellSize + this.cellGap) + this.cellSize / 2;
    const cellCenterY = target.y * (this.cellSize + this.cellGap) + this.cellSize / 2;

    console.log(
      `[鼠标模拟测试] step=${step + 1} 模拟点击格子 (${target.x},${target.y})`,
      `mapContainer=(${this.mapContainer.x},${this.mapContainer.y})`,
      `pointer=(${cellCenterX + this.mapContainer.x},${cellCenterY + this.mapContainer.y})`
    );

    // 保存恢复步数
    const gs = getGameState();
    gs._clickTestResumeStep = step + 1;
    gs._clickTestStep = step + 1;
    setGameState(gs);

    // 构造模拟 pointer 对象，设置位置为格子中心在屏幕上的实际坐标
    const pointer = this.input.activePointer;
    pointer.x = cellCenterX + this.mapContainer.x;
    pointer.y = cellCenterY + this.mapContainer.y;

    // 直接调用 handleMapPointer，走完完整的坐标换算→tryMoveTo 链路
    // （与人类点击地图格子走完全相同的代码路径）
    this.handleMapPointer(pointer);

    // 延迟后检查状态
    this.time.delayedCall(300, () => {
      // 检查是否弹出了弹窗
      if (this.modalContainer) {
        console.log(`[鼠标模拟测试] step=${step + 1} 点击后弹出弹窗，自动点击按钮`);
        this.time.delayedCall(500, () => {
          this.clickSimStep(); // clickSimStep 会检测到弹窗并点击按钮
        });
        return;
      }

      // 检查是否进入战斗
      if (!this.scene.isActive()) {
        console.log(`[鼠标模拟测试] step=${step + 1} 进入战斗，等待返回...`);
        return; // BattleScene 的 clickSimAutoBattle 会处理战斗，返回后 create 中恢复
      }

      // 正常继续
      const gs2 = getGameState();
      gs2._clickTestResumeStep = 0;
      setGameState(gs2);
      this.clickSimStep();
    });
  }

  // ==================== 调试功能：Y 键自动 200 步 ====================

  private autoMoveTest(): void {
    const gs = getGameState();
    if (gs._isAutoMoving) {
      console.log('[地图V2] 自动移动测试已在进行中，忽略');
      return;
    }

    gs._isAutoMoving = true;
    gs._debugStep = 0;
    setGameState(gs);
    console.log('[地图V2] 开始自动移动测试（200步）');

    this.autoMoveStep(0);
  }

  private autoMoveStep(step: number): void {
    if (step >= 200) {
      console.log('[地图V2] 自动移动测试完成！成功执行 200 步');
      const gs = getGameState();
      gs._isAutoMoving = false;
      gs._autoMoveResumeStep = 0;
      setGameState(gs);
      return;
    }

    // 如果有弹窗，先执行弹窗 action
    if (this.modalContainer) {
      console.log(
        `[地图压力测试] step=${step} 检测到弹窗，自动执行第一个选项`
      );
      // 保存恢复步数（弹窗 action 可能触发战斗）
      const gs = getGameState();
      gs._autoMoveResumeStep = step + 1;
      setGameState(gs);

      this.executeFirstModalAction();

      // 延迟检查是否进入战斗
      this.time.delayedCall(300, () => {
        if (!this.scene.isActive()) {
          console.log(
            `[地图压力测试] step=${step} 弹窗操作导致进入战斗，等待返回...`
          );
          return;
        }
        // 没有进入战斗，继续
        const gs2 = getGameState();
        gs2._autoMoveResumeStep = 0;
        setGameState(gs2);
        this.autoMoveStep(step + 1);
      });
      return;
    }

    const gameState = getGameState();
    let movable = getMovableNeighbors(gameState);

    // 卡死兜底：如果 movableCount=0 但四周存在非障碍格
    if (movable.length === 0) {
      const { x, y } = gameState.currentPosition;
      const dirs = [
        { name: '上', dx: 0, dy: -1 },
        { name: '下', dx: 0, dy: 1 },
        { name: '左', dx: -1, dy: 0 },
        { name: '右', dx: 1, dy: 0 },
      ];

      // 打印四周状态
      for (const dir of dirs) {
        const nx = x + dir.dx;
        const ny = y + dir.dy;
        if (nx >= 0 && nx < gameState.mapWidth && ny >= 0 && ny < gameState.mapHeight) {
          const c = gameState.mapCells[ny][nx];
          console.log(
            `[地图压力测试]   ${dir.name} (${nx},${ny}): type=${c.type} obstacle=${c.type === 'obstacle'}`
          );
        }
      }

      // 检查是否有非障碍格但 canMoveTo 返回 false 的情况
      const nonObstacleNeighbors: { x: number; y: number }[] = [];
      for (const dir of dirs) {
        const nx = x + dir.dx;
        const ny = y + dir.dy;
        if (
          nx >= 0 && nx < gameState.mapWidth &&
          ny >= 0 && ny < gameState.mapHeight &&
          gameState.mapCells[ny][nx].type !== 'obstacle'
        ) {
          nonObstacleNeighbors.push({ x: nx, y: ny });
        }
      }

      if (nonObstacleNeighbors.length > 0) {
        console.log(
          `[地图错误] movableCount=0，但周围存在非障碍格，自动修复`
        );
        // 允许移动到任意相邻非障碍格
        movable = nonObstacleNeighbors;
      } else {
        console.log(
          `[地图压力测试] step=${step + 1} 真正的死胡同，无法继续`
        );
        const gs = getGameState();
        gs._isAutoMoving = false;
        gs._autoMoveResumeStep = 0;
        setGameState(gs);
        return;
      }
    }

    // 每 10 步打印日志
    if ((step + 1) % 10 === 0 || step === 0) {
      console.log(
        `[地图压力测试] step=${step + 1}`,
        `current=(${gameState.currentPosition.x},${gameState.currentPosition.y})`,
        `movableCount=${movable.length}`,
        `day=${gameState.day}`
      );
    }

    // 随机选择一个可移动格
    const target =
      movable[Math.floor(Math.random() * movable.length)];

    // 统一调用 tryMoveTo（内部已处理自动测试跳过战斗逻辑）
    this.tryMoveTo(target.x, target.y);

    // 检查移动后是否弹出了新弹窗（非自动测试弹窗应该不会出现）
    if (this.modalContainer) {
      // 保存恢复步数
      const gsSave = getGameState();
      gsSave._autoMoveResumeStep = step + 1;
      setGameState(gsSave);

      // 下一轮会处理弹窗
      this.time.delayedCall(300, () => {
        if (!this.scene.isActive()) {
          console.log(
            `[地图压力测试] step=${step + 1} 进入战斗，等待返回...`
          );
          return;
        }
        const gs2 = getGameState();
        gs2._autoMoveResumeStep = 0;
        setGameState(gs2);
        this.autoMoveStep(step + 1);
      });
      return;
    }

    // 没有弹窗，检查是否进入战斗（scene 切换了）
    const gsSave = getGameState();
    gsSave._autoMoveResumeStep = step + 1;
    setGameState(gsSave);

    this.time.delayedCall(100, () => {
      if (!this.scene.isActive()) {
        console.log(
          `[地图压力测试] step=${step + 1} 进入战斗，等待返回...`
        );
        return;
      }
      const gs2 = getGameState();
      gs2._autoMoveResumeStep = 0;
      setGameState(gs2);
      this.autoMoveStep(step + 1);
    });
  }

  // ==================== 调试功能：G 键方向模拟测试（走向右上角） ====================

  private directionalClickTest(): void {
    const gs = getGameState();
    if (gs._isDirectionalTesting) {
      console.log('[方向模拟测试] 已在进行中，忽略');
      return;
    }
    // 同时关闭T键测试（避免冲突）
    if (gs._isClickTesting) {
      gs._isClickTesting = false;
      gs._clickTestStep = 0;
      gs._clickTestResumeStep = 0;
    }
    gs._isDirectionalTesting = true;
    gs._directionalTestStep = 0;
    gs._directionalTestMaxSteps = 200;
    setGameState(gs);
    console.log('[方向模拟测试] 开始！目标：地图右上角，最多200步');
    this.directionalSimStep();
  }

  private directionalSimStep(): void {
    const gs = getGameState();
    const step = gs._directionalTestStep;
    const maxSteps = gs._directionalTestMaxSteps || 200;

    if (step >= maxSteps) {
      console.log(`[方向模拟测试] 达到最大步数 ${maxSteps}，测试结束`);
      gs._isDirectionalTesting = false;
      gs._directionalTestStep = 0;
      setGameState(gs);
      return;
    }

    // 检查是否已到达右上角区域 (x >= 17, y <= 2)
    if (gs.currentPosition.x >= 17 && gs.currentPosition.y <= 2) {
      console.log(`[方向模拟测试] 已到达右上角区域 (${gs.currentPosition.x},${gs.currentPosition.y})，测试结束！`);
      gs._isDirectionalTesting = false;
      gs._directionalTestStep = 0;
      setGameState(gs);
      return;
    }

    // 如果有弹窗，模拟点击弹窗按钮
    if (this.modalContainer) {
      this.clickSimModalButton(step);
      return;
    }

    // 获取可移动的相邻格子
    const movable = getMovableNeighbors(gs);
    if (movable.length === 0) {
      console.log(`[方向模拟测试] step=${step} 无可走格，测试结束`);
      gs._isDirectionalTesting = false;
      gs._directionalTestStep = 0;
      setGameState(gs);
      return;
    }

    // 按照朝右上角的方向排序：优先向右(+x)和向上(-y)
    const target = this.pickDirectionalTarget(movable, gs.currentPosition);
    
    console.log(
      `[方向模拟测试] step=${step + 1} → (${target.x},${target.y})` +
      ` 当前位置=(${gs.currentPosition.x},${gs.currentPosition.y})`
    );

    // 保存恢复步数
    gs._directionalTestResumeStep = step + 1;
    gs._directionalTestStep = step + 1;
    setGameState(gs);

    // 模拟点击格子
    const cellCenterX = target.x * (this.cellSize + this.cellGap) + this.cellSize / 2;
    const cellCenterY = target.y * (this.cellSize + this.cellGap) + this.cellSize / 2;
    const pointer = this.input.activePointer;
    pointer.x = cellCenterX + this.mapContainer.x;
    pointer.y = cellCenterY + this.mapContainer.y;
    this.handleMapPointer(pointer);

    // 延迟后检查状态
    this.time.delayedCall(300, () => {
      if (this.modalContainer) {
        console.log(`[方向模拟测试] step=${step + 1} 弹出弹窗，自动点击`);
        this.time.delayedCall(500, () => {
          this.directionalSimStep();
        });
        return;
      }

      // 检查是否进入战斗
      if (!this.scene.isActive()) {
        console.log(`[方向模拟测试] step=${step + 1} 进入战斗，等待返回...`);
        return; // BattleScene 的 clickSimAutoBattle 会处理
      }

      // 正常继续
      const gs2 = getGameState();
      gs2._directionalTestResumeStep = 0;
      setGameState(gs2);
      this.directionalSimStep();
    });
  }

  private pickDirectionalTarget(
    movable: Array<{ x: number; y: number }>,
    current: { x: number; y: number }
  ): { x: number; y: number } {
    // 目标：右上角 (19, 0)
    // 对每个可移动格子计算到目标的曼哈顿距离，选最近的
    // 同时加入少量随机性避免完全 deterministic
    const targetX = 19;
    const targetY = 0;

    // 按 "距离目标的改善程度" 排序，优先选择能显著缩短距离的格子
    const scored = movable.map(m => {
      const currentDist = Math.abs(current.x - targetX) + Math.abs(current.y - targetY);
      const newDist = Math.abs(m.x - targetX) + Math.abs(m.y - targetY);
      const improvement = currentDist - newDist; // 正数表示更接近目标
      return { ...m, improvement, dist: newDist };
    });

    // 优先选择 improvement 最大的（最接近目标的）
    // 如果有多个相同 improvement，随机选一个
    scored.sort((a, b) => b.improvement - a.improvement || (Math.random() - 0.5));

    // 80% 概率选最优，20% 概率随机（避免卡在局部最优）
    if (Math.random() < 0.8 && scored.length > 0) {
      return scored[0];
    }
    return movable[Math.floor(Math.random() * movable.length)];
  }
}
