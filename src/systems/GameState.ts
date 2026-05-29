import { CharacterId } from '../data/characters';

// 地图格子类型
export type CellType = 'obstacle' | 'boss' | 'elite' | 'camp' | 'supply' | 'question' | 'empty';
export type ResolvedType = 'combat' | 'event' | 'opportunity' | 'danger' | 'empty';

// 地图格子
export interface MapCell {
  x: number;
  y: number;
  type: CellType;
  resolvedType: ResolvedType | null; // 揭示后的真实类型
  visited: boolean;
  isCurrent: boolean;
  isReachable: boolean;
  isRevealed: boolean; // 是否已揭示
  isCleared: boolean; // 是否已处理完成
}

// 游戏全局状态
export interface GameState {
  // 队伍
  selectedCharacters: CharacterId[];
  reserveCharacters: CharacterId[];

  // 资源
  day: number;
  maxDay: number;
  food: number;
  morale: number;
  caravanHp: number;
  caravanMaxHp: number;

  // 地图
  mapWidth: number;
  mapHeight: number;
  mapCells: MapCell[][];
  currentPosition: { x: number; y: number };
  startPosition: { x: number; y: number };
  bossPosition: { x: number; y: number };

  // 战斗相关
  currentBattleType: 'normal' | 'elite' | 'boss' | null;
  battleResult: 'victory' | 'defeat' | null;
}

// 初始游戏状态
export function createInitialGameState(): GameState {
  return {
    selectedCharacters: [],
    reserveCharacters: [],

    day: 1,
    maxDay: 40,
    food: 8,
    morale: 3,
    caravanHp: 45,
    caravanMaxHp: 45,

    mapWidth: 16,
    mapHeight: 10,
    mapCells: [],
    currentPosition: { x: 0, y: 0 },
    startPosition: { x: 0, y: 0 },
    bossPosition: { x: 0, y: 0 },

    currentBattleType: null,
    battleResult: null,
  };
}

// 创建半隐藏远征地图
export function createExpeditionMap(width: number, height: number): {
  cells: MapCell[][];
  startPos: { x: number; y: number };
  bossPos: { x: number; y: number };
} {
  let cells: MapCell[][];
  let startPos: { x: number; y: number };
  let bossPos: { x: number; y: number };
  let hasPath = false;

  // 尝试生成直到有通路
  while (!hasPath) {
    cells = createEmptyMap(width, height);

    // 起点在左下区域
    startPos = {
      x: Math.floor(Math.random() * 3),
      y: height - 1 - Math.floor(Math.random() * 3),
    };

    // Boss在右上远端区域
    bossPos = {
      x: width - 1 - Math.floor(Math.random() * 4),
      y: Math.floor(Math.random() * 4),
    };

    // 确保起点和Boss距离足够远
    const distance = Math.abs(startPos.x - bossPos.x) + Math.abs(startPos.y - bossPos.y);
    if (distance < 12) continue;

    // 设置起点
    cells[startPos.y][startPos.x].type = 'empty';
    cells[startPos.y][startPos.x].isCurrent = true;
    cells[startPos.y][startPos.x].visited = true;
    cells[startPos.y][startPos.x].isRevealed = true;

    // 设置Boss
    cells[bossPos.y][bossPos.x].type = 'boss';
    cells[bossPos.y][bossPos.x].isRevealed = true;

    // 生成障碍团块
    generateObstacleClusters(cells, width, height, startPos, bossPos);

    // 生成障碍带
    generateObstacleBands(cells, width, height, startPos, bossPos);

    // 放置关键节点（营地、补给点、强敌）
    placeKeyNodes(cells, width, height, startPos, bossPos);

    // 检查是否有通路
    hasPath = checkPathExists(cells, startPos, bossPos, width, height);
  }

  return { cells: cells!, startPos: startPos!, bossPos: bossPos! };
}

// 创建空地图
function createEmptyMap(width: number, height: number): MapCell[][] {
  const cells: MapCell[][] = [];
  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      cells[y][x] = {
        x,
        y,
        type: 'question',
        resolvedType: null,
        visited: false,
        isCurrent: false,
        isReachable: false,
        isRevealed: false,
        isCleared: false,
      };
    }
  }
  return cells;
}

// 生成障碍团块
function generateObstacleClusters(
  cells: MapCell[][],
  width: number,
  height: number,
  startPos: { x: number; y: number },
  bossPos: { x: number; y: number }
): void {
  const numClusters = 3 + Math.floor(Math.random() * 3); // 3-5个团块

  for (let i = 0; i < numClusters; i++) {
    // 随机选择团块中心
    let cx: number, cy: number;
    let attempts = 0;

    do {
      cx = Math.floor(Math.random() * width);
      cy = Math.floor(Math.random() * height);
      attempts++;
    } while (
      attempts < 100 &&
      ((Math.abs(cx - startPos.x) < 2 && Math.abs(cy - startPos.y) < 2) ||
        (Math.abs(cx - bossPos.x) < 2 && Math.abs(cy - bossPos.y) < 2))
    );

    // 团块大小
    const clusterSize = 5 + Math.floor(Math.random() * 8); // 5-12个格子

    // 从中心向外扩散
    const queue = [{ x: cx, y: cy }];
    const added = new Set<string>([`${cx},${cy}`]);

    while (added.size < clusterSize && queue.length > 0) {
      const { x, y } = queue.shift()!;

      if (cells[y][x].type === 'question') {
        cells[y][x].type = 'obstacle';
      }

      // 添加相邻格子
      const directions = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
      ];

      for (const dir of directions) {
        const nx = x + dir.dx;
        const ny = y + dir.dy;
        const key = `${nx},${ny}`;

        if (
          nx >= 0 && nx < width && ny >= 0 && ny < height &&
          !added.has(key) &&
          cells[ny][nx].type === 'question' &&
          !(Math.abs(nx - startPos.x) < 2 && Math.abs(ny - startPos.y) < 2) &&
          !(Math.abs(nx - bossPos.x) < 2 && Math.abs(ny - bossPos.y) < 2)
        ) {
          added.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }
}

// 生成障碍带
function generateObstacleBands(
  cells: MapCell[][],
  width: number,
  height: number,
  startPos: { x: number; y: number },
  bossPos: { x: number; y: number }
): void {
  // 1-2条障碍带
  const numBands = 1 + Math.floor(Math.random() * 2);

  for (let b = 0; b < numBands; b++) {
    const bandType = Math.random() < 0.5 ? 'horizontal' : 'vertical';

    if (bandType === 'horizontal') {
      // 横向山脉
      const y = 2 + Math.floor(Math.random() * (height - 4));
      const gapStart = Math.floor(Math.random() * (width - 4));
      const gapEnd = gapStart + 2 + Math.floor(Math.random() * 3);

      for (let x = 0; x < width; x++) {
        if (x >= gapStart && x <= gapEnd) continue; // 留出缺口
        if (cells[y][x].type === 'question' &&
            !(Math.abs(x - startPos.x) < 2 && Math.abs(y - startPos.y) < 2) &&
            !(Math.abs(x - bossPos.x) < 2 && Math.abs(y - bossPos.y) < 2)) {
          cells[y][x].type = 'obstacle';
        }
      }
    } else {
      // 纵向峡谷
      const x = 3 + Math.floor(Math.random() * (width - 6));
      const gapStart = Math.floor(Math.random() * (height - 4));
      const gapEnd = gapStart + 2 + Math.floor(Math.random() * 3);

      for (let y = 0; y < height; y++) {
        if (y >= gapStart && y <= gapEnd) continue; // 留出缺口
        if (cells[y][x].type === 'question' &&
            !(Math.abs(x - startPos.x) < 2 && Math.abs(y - startPos.y) < 2) &&
            !(Math.abs(x - bossPos.x) < 2 && Math.abs(y - bossPos.y) < 2)) {
          cells[y][x].type = 'obstacle';
        }
      }
    }
  }
}

// 放置关键节点
function placeKeyNodes(
  cells: MapCell[][],
  width: number,
  height: number,
  startPos: { x: number; y: number },
  bossPos: { x: number; y: number }
): void {
  // 放置营地 (3-4个)
  placeNodesOfType(cells, width, height, startPos, bossPos, 'camp', 3, 4);

  // 放置补给点 (2-3个)
  placeNodesOfType(cells, width, height, startPos, bossPos, 'supply', 2, 3);

  // 放置强敌 (3-5个)
  placeNodesOfType(cells, width, height, startPos, bossPos, 'elite', 3, 5);
}

// 放置特定类型的节点
function placeNodesOfType(
  cells: MapCell[][],
  width: number,
  height: number,
  startPos: { x: number; y: number },
  bossPos: { x: number; y: number },
  type: CellType,
  minCount: number,
  maxCount: number
): void {
  const count = minCount + Math.floor(Math.random() * (maxCount - minCount + 1));
  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < 1000) {
    attempts++;
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);

    // 不能靠近起点和Boss
    if (Math.abs(x - startPos.x) < 3 && Math.abs(y - startPos.y) < 3) continue;
    if (Math.abs(x - bossPos.x) < 3 && Math.abs(y - bossPos.y) < 3) continue;

    // 必须是问号格
    if (cells[y][x].type !== 'question') continue;

    // 放置节点
    cells[y][x].type = type;
    cells[y][x].isRevealed = true;
    placed++;
  }
}

// BFS检查是否存在通路
function checkPathExists(
  cells: MapCell[][],
  start: { x: number; y: number },
  end: { x: number; y: number },
  width: number,
  height: number
): boolean {
  const visited = new Set<string>();
  const queue = [{ x: start.x, y: start.y }];
  visited.add(`${start.x},${start.y}`);

  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;

    if (x === end.x && y === end.y) {
      return true;
    }

    for (const dir of directions) {
      const nx = x + dir.dx;
      const ny = y + dir.dy;

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const key = `${nx},${ny}`;
        if (!visited.has(key) && cells[ny][nx].type !== 'obstacle') {
          visited.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }

  return false;
}

// 随机决定问号格内容
export function resolveQuestionCell(cell: MapCell): ResolvedType {
  const rand = Math.random();

  // 权重：普通战斗35%，事件25%，机遇20%，危险15%，小资源点5%
  if (rand < 0.35) return 'combat';
  if (rand < 0.60) return 'event';
  if (rand < 0.80) return 'opportunity';
  if (rand < 0.95) return 'danger';
  return 'opportunity'; // 小资源点合并到机遇
}

// 更新可到达格子
export function updateReachableCells(state: GameState): void {
  const { currentPosition, mapCells } = state;
  const { x, y } = currentPosition;

  // 重置所有格子的可到达状态
  for (const row of mapCells) {
    for (const cell of row) {
      cell.isReachable = false;
    }
  }

  // 标记上下左右相邻格子为可到达（障碍不可移动）
  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  for (const dir of directions) {
    const nx = x + dir.dx;
    const ny = y + dir.dy;

    if (nx >= 0 && nx < state.mapWidth && ny >= 0 && ny < state.mapHeight) {
      const cell = mapCells[ny][nx];
      if (cell.type !== 'obstacle') {
        cell.isReachable = true;
      }
    }
  }
}

// 移动到新格子
export function moveToCell(state: GameState, x: number, y: number): boolean {
  // 检查是否可到达
  if (!state.mapCells[y][x].isReachable) {
    return false;
  }

  // 更新当前位置
  const oldCell = state.mapCells[state.currentPosition.y][state.currentPosition.x];
  oldCell.isCurrent = false;
  oldCell.visited = true;

  state.currentPosition = { x, y };
  const newCell = state.mapCells[y][x];
  newCell.isCurrent = true;
  newCell.visited = true;

  // 只增加天数，不消耗食物
  // TODO: 后续营地、补给、事件系统完善后，再恢复移动消耗 food
  state.day += 1;

  // 更新可到达格子
  updateReachableCells(state);

  return true;
}

// 检查游戏是否失败
export function checkGameOver(state: GameState): { isOver: boolean; reason?: string } {
  // 超过最大天数
  if (state.day > state.maxDay) {
    return { isOver: true, reason: '远征失败：错过期限' };
  }

  // 士气归零
  if (state.morale <= 0) {
    return { isOver: true, reason: '远征失败：士气崩溃' };
  }

  // 商队耐久归零
  if (state.caravanHp <= 0) {
    return { isOver: true, reason: '远征失败：商队被摧毁' };
  }

  return { isOver: false };
}

// 检查是否胜利
export function checkVictory(state: GameState): boolean {
  // 到达Boss格并胜利
  const currentCell = state.mapCells[state.currentPosition.y][state.currentPosition.x];
  return currentCell.type === 'boss' && state.battleResult === 'victory';
}

// 全局游戏状态实例
let globalGameState: GameState | null = null;

export function getGameState(): GameState {
  if (!globalGameState) {
    globalGameState = createInitialGameState();
  }
  return globalGameState;
}

export function setGameState(state: GameState): void {
  globalGameState = state;
}

export function resetGameState(): void {
  globalGameState = createInitialGameState();
}
