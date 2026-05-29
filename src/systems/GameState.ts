import { CharacterId } from '../data/characters';

// 地图格子类型
export type CellType = 'obstacle' | 'boss' | 'question' | 'empty';
export type ResolvedType = 'combat' | 'event' | 'opportunity' | 'danger' | 'camp' | 'supply' | 'empty';

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
  currentBattleType: 'normal' | 'boss' | null;
  battleResult: 'victory' | 'defeat' | null;
}

// 初始游戏状态
export function createInitialGameState(): GameState {
  return {
    selectedCharacters: [],
    reserveCharacters: [],

    day: 1,
    maxDay: 30,
    food: 8,
    morale: 3,
    caravanHp: 45,
    caravanMaxHp: 45,

    mapWidth: 12,
    mapHeight: 8,
    mapCells: [],
    currentPosition: { x: 0, y: 0 },
    startPosition: { x: 0, y: 0 },
    bossPosition: { x: 0, y: 0 },

    currentBattleType: null,
    battleResult: null,
  };
}

// 创建随机地图
export function createRandomMap(width: number, height: number): {
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
    cells = [];

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

    // 起点在左下区域 (x: 0-2, y: height-3 to height-1)
    startPos = {
      x: Math.floor(Math.random() * 3),
      y: height - 1 - Math.floor(Math.random() * 3),
    };

    // Boss在右上区域 (x: width-3 to width-1, y: 0-2)
    bossPos = {
      x: width - 1 - Math.floor(Math.random() * 3),
      y: Math.floor(Math.random() * 3),
    };

    // 确保起点和Boss不在同一格
    if (startPos.x === bossPos.x && startPos.y === bossPos.y) {
      continue;
    }

    // 设置起点
    cells[startPos.y][startPos.x].type = 'empty';
    cells[startPos.y][startPos.x].isCurrent = true;
    cells[startPos.y][startPos.x].visited = true;
    cells[startPos.y][startPos.x].isRevealed = true;

    // 设置Boss
    cells[bossPos.y][bossPos.x].type = 'boss';
    cells[bossPos.y][bossPos.x].isRevealed = true;

    // 生成障碍 (约15%)
    const obstacleCount = Math.floor(width * height * 0.15);
    let placed = 0;
    let attempts = 0;

    while (placed < obstacleCount && attempts < 1000) {
      attempts++;
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);

      // 不能阻挡起点和Boss
      if ((x === startPos.x && y === startPos.y) || (x === bossPos.x && y === bossPos.y)) {
        continue;
      }

      if (cells[y][x].type === 'question') {
        cells[y][x].type = 'obstacle';
        placed++;
      }
    }

    // 检查是否有通路
    hasPath = checkPathExists(cells, startPos, bossPos, width, height);
  }

  return { cells: cells!, startPos: startPos!, bossPos: bossPos! };
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

  // 权重：战斗40%，事件25%，机遇15%，危险10%，营地5%，补给5%
  if (rand < 0.40) return 'combat';
  if (rand < 0.65) return 'event';
  if (rand < 0.80) return 'opportunity';
  if (rand < 0.90) return 'danger';
  if (rand < 0.95) return 'camp';
  return 'supply';
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
  // TODO: 后续补给、营地、事件系统完善后，再恢复移动消耗 food
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
