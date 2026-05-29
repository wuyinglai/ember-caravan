import { CharacterId } from '../data/characters';

// 地图格子类型
export type CellType = 'empty' | 'combat' | 'boss' | 'event' | 'camp' | 'supply';

// 地图格子
export interface MapCell {
  x: number;
  y: number;
  type: CellType;
  visited: boolean;
  isCurrent: boolean;
  isReachable: boolean;
  cleared: boolean; // 战斗格是否已清理
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
    maxDay: 18,
    food: 8,
    morale: 3,
    caravanHp: 45,
    caravanMaxHp: 45,

    mapWidth: 10,
    mapHeight: 6,
    mapCells: [],
    currentPosition: { x: 0, y: 5 }, // 左下角开始

    currentBattleType: null,
    battleResult: null,
  };
}

// 创建固定地图
export function createFixedMap(width: number, height: number): MapCell[][] {
  const cells: MapCell[][] = [];

  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      cells[y][x] = {
        x,
        y,
        type: 'empty',
        visited: false,
        isCurrent: false,
        isReachable: false,
        cleared: false,
      };
    }
  }

  // 设置起点 (左下角)
  cells[height - 1][0].type = 'empty';
  cells[height - 1][0].isCurrent = true;
  cells[height - 1][0].visited = true;

  // 设置终点/Boss (右上角)
  cells[0][width - 1].type = 'boss';

  // 设置一些战斗格子 (固定布局)
  const combatPositions = [
    { x: 2, y: 4 },
    { x: 4, y: 3 },
    { x: 6, y: 2 },
    { x: 3, y: 1 },
    { x: 7, y: 4 },
    { x: 8, y: 3 },
  ];

  for (const pos of combatPositions) {
    if (pos.y < height && pos.x < width) {
      cells[pos.y][pos.x].type = 'combat';
    }
  }

  // 设置一些事件格子 (占位)
  const eventPositions = [
    { x: 1, y: 3 },
    { x: 5, y: 4 },
    { x: 7, y: 1 },
  ];

  for (const pos of eventPositions) {
    if (pos.y < height && pos.x < width) {
      cells[pos.y][pos.x].type = 'event';
    }
  }

  // 设置营地格子 (占位)
  const campPositions = [
    { x: 3, y: 5 },
    { x: 6, y: 0 },
  ];

  for (const pos of campPositions) {
    if (pos.y < height && pos.x < width) {
      cells[pos.y][pos.x].type = 'camp';
    }
  }

  // 设置补给点 (占位)
  const supplyPositions = [
    { x: 5, y: 2 },
    { x: 2, y: 0 },
  ];

  for (const pos of supplyPositions) {
    if (pos.y < height && pos.x < width) {
      cells[pos.y][pos.x].type = 'supply';
    }
  }

  return cells;
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

  // 标记上下左右相邻格子为可到达
  const directions = [
    { dx: 0, dy: -1 }, // 上
    { dx: 0, dy: 1 },  // 下
    { dx: -1, dy: 0 }, // 左
    { dx: 1, dy: 0 },  // 右
  ];

  for (const dir of directions) {
    const nx = x + dir.dx;
    const ny = y + dir.dy;

    if (nx >= 0 && nx < state.mapWidth && ny >= 0 && ny < state.mapHeight) {
      mapCells[ny][nx].isReachable = true;
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

  // 消耗资源
  state.day += 1;
  state.food -= 1;

  // 食物不足时士气下降
  if (state.food < 0) {
    state.morale -= 1;
    state.food = 0;
  }

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
