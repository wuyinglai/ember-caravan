import { CharacterId } from '../data/characters';

// 地图格子类型
export type CellType = 'obstacle' | 'boss' | 'elite' | 'camp' | 'supply' | 'reward' | 'question' | 'empty';
export type ResolvedType = 'combat' | 'event' | 'opportunity' | 'danger' | 'reward' | 'empty';

// 地图格子
export interface MapCell {
  x: number;
  y: number;
  type: CellType;
  resolvedType: ResolvedType | null;
  visited: boolean;
  isCurrent: boolean;
  isReachable: boolean;       // 仅用于显示高亮，不用于核心移动判断
  isRevealed: boolean;
  isCleared: boolean;
  isGoal: boolean;
  rewardType: 'small' | 'medium' | 'large' | null;
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
  gold: number;

  // 地图
  mapWidth: number;
  mapHeight: number;
  mapCells: MapCell[][];
  currentPosition: { x: number; y: number };
  startPosition: { x: number; y: number };
  bossPosition: { x: number; y: number };

  // 远征目标
  expeditionGoal: 'boss' | 'sanctuary';

  // 战斗相关
  currentBattleType: 'normal' | 'elite' | 'boss' | null;
  battleResult: 'victory' | 'defeat' | null;

  // 自动移动测试状态（调试用）
  _isAutoMoving: boolean;
  _autoMoveResumeStep: number;
  _autoMovePrevPos: { x: number; y: number } | null;
  _debugStep: number;

  // 鼠标点击模拟测试状态（调试用）
  _isClickTesting: boolean;
  _clickTestStep: number;
  _clickTestResumeStep: number;
  _clickTestMaxSteps: number;

  // 方向模拟测试状态（G键调试用，独立于T键）
  _isDirectionalTesting: boolean;
  _directionalTestStep: number;
  _directionalTestResumeStep: number;
  _directionalTestMaxSteps: number;
}

// 初始游戏状态
export function createInitialGameState(): GameState {
  return {
    selectedCharacters: [],
    reserveCharacters: [],

    day: 1,
    maxDay: 60,
    food: 8,
    morale: 3,
    caravanHp: 45,
    caravanMaxHp: 45,
    gold: 0,

    mapWidth: 20,
    mapHeight: 12,
    mapCells: [],
    currentPosition: { x: 0, y: 0 },
    startPosition: { x: 0, y: 0 },
    bossPosition: { x: 0, y: 0 },

    expeditionGoal: 'boss',

    currentBattleType: null,
    battleResult: null,

    _isAutoMoving: false,
    _autoMoveResumeStep: 0,
    _autoMovePrevPos: null,
    _debugStep: 0,

    _isClickTesting: false,
    _clickTestStep: 0,
    _clickTestResumeStep: 0,
    _clickTestMaxSteps: 0,

    _isDirectionalTesting: false,
    _directionalTestStep: 0,
    _directionalTestResumeStep: 0,
    _directionalTestMaxSteps: 0,
  };
}

// ==================== 核心移动判断 ====================

/**
 * 动态判断是否可以移动到目标格子。
 * 只检查三个条件：
 * 1. 上下左右相邻（曼哈顿距离 = 1）
 * 2. 在地图范围内
 * 3. 不是障碍
 *
 * 不检查：visited, isCleared, isRevealed, resolvedType, question, camp, supply, reward, elite, boss
 */
export function canMoveTo(
  state: GameState,
  x: number,
  y: number
): boolean {
  const current = state.currentPosition;

  // 检查是否相邻
  const isAdjacent =
    Math.abs(x - current.x) + Math.abs(y - current.y) === 1;
  if (!isAdjacent) return false;

  // 检查边界
  if (x < 0 || y < 0 || x >= state.mapWidth || y >= state.mapHeight) {
    return false;
  }

  // 检查障碍
  const cell = state.mapCells[y][x];
  if (cell.type === 'obstacle') return false;

  return true;
}

/**
 * 获取当前四邻格中所有可移动的格子列表。
 */
export function getMovableNeighbors(
  state: GameState
): { x: number; y: number }[] {
  const { x, y } = state.currentPosition;
  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  const movable: { x: number; y: number }[] = [];
  for (const dir of directions) {
    const nx = x + dir.dx;
    const ny = y + dir.dy;
    if (canMoveTo(state, nx, ny)) {
      movable.push({ x: nx, y: ny });
    }
  }

  return movable;
}

// ==================== 地图生成 ====================

// 创建半隐藏远征地图
export function createExpeditionMap(
  width: number,
  height: number
): {
  cells: MapCell[][];
  startPos: { x: number; y: number };
  bossPos: { x: number; y: number };
  expeditionGoal: 'boss' | 'sanctuary';
} {
  let cells: MapCell[][];
  let startPos: { x: number; y: number };
  let bossPos: { x: number; y: number };
  let hasPath = false;
  let expeditionGoal: 'boss' | 'sanctuary';

  while (!hasPath) {
    cells = createEmptyMap(width, height);

    // 起点在左下区域
    startPos = {
      x: Math.floor(Math.random() * 3),
      y: height - 1 - Math.floor(Math.random() * 3),
    };

    // 目标点在右上区域
    bossPos = {
      x: width - 1 - Math.floor(Math.random() * 4),
      y: Math.floor(Math.random() * 4),
    };

    // 确保起点和目标距离足够远
    const distance =
      Math.abs(startPos.x - bossPos.x) +
      Math.abs(startPos.y - bossPos.y);
    if (distance < 18) continue;

    // 随机选择远征目标
    expeditionGoal = Math.random() < 0.7 ? 'boss' : 'sanctuary';

    // 设置起点
    cells[startPos.y][startPos.x].type = 'empty';
    cells[startPos.y][startPos.x].isCurrent = true;
    cells[startPos.y][startPos.x].visited = true;
    cells[startPos.y][startPos.x].isRevealed = true;

    // 设置目标点
    if (expeditionGoal === 'boss') {
      cells[bossPos.y][bossPos.x].type = 'boss';
      cells[bossPos.y][bossPos.x].isRevealed = true;
    } else {
      cells[bossPos.y][bossPos.x].type = 'empty';
      cells[bossPos.y][bossPos.x].isRevealed = true;
      cells[bossPos.y][bossPos.x].isGoal = true;
    }

    // 生成障碍
    generateObstacleClusters(cells, width, height, startPos, bossPos);
    generateObstacleBands(cells, width, height, startPos, bossPos);

    // 放置关键节点
    placeKeyNodes(cells, width, height, startPos, bossPos);

    // 检查通路
    const pathExists = checkPathExists(
      cells, startPos, bossPos, width, height
    );
    if (!pathExists) continue;

    // 检查所有关键节点可达
    hasPath = checkAllKeyNodesReachable(
      cells, startPos, width, height
    );
  }

  return {
    cells: cells!,
    startPos: startPos!,
    bossPos: bossPos!,
    expeditionGoal: expeditionGoal!,
  };
}

// 创建空地图
function createEmptyMap(
  width: number,
  height: number
): MapCell[][] {
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
        isGoal: false,
        rewardType: null,
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
  const numClusters = 4 + Math.floor(Math.random() * 4);

  for (let i = 0; i < numClusters; i++) {
    let cx: number, cy: number;
    let attempts = 0;

    do {
      cx = Math.floor(Math.random() * width);
      cy = Math.floor(Math.random() * height);
      attempts++;
    } while (
      attempts < 100 &&
      ((Math.abs(cx - startPos.x) < 2 &&
        Math.abs(cy - startPos.y) < 2) ||
        (Math.abs(cx - bossPos.x) < 2 &&
          Math.abs(cy - bossPos.y) < 2))
    );

    const clusterSize = 6 + Math.floor(Math.random() * 10);
    const queue = [{ x: cx, y: cy }];
    const added = new Set<string>([`${cx},${cy}`]);

    while (added.size < clusterSize && queue.length > 0) {
      const { x, y } = queue.shift()!;

      if (cells[y][x].type === 'question') {
        cells[y][x].type = 'obstacle';
      }

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
          !(Math.abs(nx - startPos.x) < 2 &&
            Math.abs(ny - startPos.y) < 2) &&
          !(Math.abs(nx - bossPos.x) < 2 &&
            Math.abs(ny - bossPos.y) < 2)
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
  const numBands = 2 + Math.floor(Math.random() * 2);

  for (let b = 0; b < numBands; b++) {
    const bandType = Math.random() < 0.5 ? 'horizontal' : 'vertical';

    if (bandType === 'horizontal') {
      const y = 2 + Math.floor(Math.random() * (height - 4));
      const numGaps = 2 + Math.floor(Math.random() * 2);
      const gaps: { start: number; end: number }[] = [];
      for (let g = 0; g < numGaps; g++) {
        const gapStart = Math.floor(Math.random() * (width - 3));
        const gapEnd = gapStart + 1 + Math.floor(Math.random() * 2);
        gaps.push({ start: gapStart, end: gapEnd });
      }

      for (let x = 0; x < width; x++) {
        const inGap = gaps.some(
          (gap) => x >= gap.start && x <= gap.end
        );
        if (inGap) continue;
        if (
          cells[y][x].type === 'question' &&
          !(Math.abs(x - startPos.x) < 2 &&
            Math.abs(y - startPos.y) < 2) &&
          !(Math.abs(x - bossPos.x) < 2 &&
            Math.abs(y - bossPos.y) < 2)
        ) {
          cells[y][x].type = 'obstacle';
        }
      }
    } else {
      const x = 3 + Math.floor(Math.random() * (width - 6));
      const numGaps = 2 + Math.floor(Math.random() * 2);
      const gaps: { start: number; end: number }[] = [];
      for (let g = 0; g < numGaps; g++) {
        const gapStart = Math.floor(Math.random() * (height - 3));
        const gapEnd = gapStart + 1 + Math.floor(Math.random() * 2);
        gaps.push({ start: gapStart, end: gapEnd });
      }

      for (let y = 0; y < height; y++) {
        const inGap = gaps.some(
          (gap) => y >= gap.start && y <= gap.end
        );
        if (inGap) continue;
        if (
          cells[y][x].type === 'question' &&
          !(Math.abs(x - startPos.x) < 2 &&
            Math.abs(y - startPos.y) < 2) &&
          !(Math.abs(x - bossPos.x) < 2 &&
            Math.abs(y - bossPos.y) < 2)
        ) {
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
  placeNodesOfType(cells, width, height, startPos, bossPos, 'camp', 3, 4);
  placeNodesOfType(cells, width, height, startPos, bossPos, 'supply', 2, 3);
  placeNodesOfType(cells, width, height, startPos, bossPos, 'elite', 3, 5);
  placeNodesOfType(cells, width, height, startPos, bossPos, 'reward', 4, 6);
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
  const count =
    minCount + Math.floor(Math.random() * (maxCount - minCount + 1));
  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < 1000) {
    attempts++;
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);

    if (
      Math.abs(x - startPos.x) < 3 &&
      Math.abs(y - startPos.y) < 3
    )
      continue;
    if (
      Math.abs(x - bossPos.x) < 3 &&
      Math.abs(y - bossPos.y) < 3
    )
      continue;

    if (cells[y][x].type !== 'question') continue;

    cells[y][x].type = type;
    cells[y][x].isRevealed = true;

    if (type === 'reward') {
      const rand = Math.random();
      if (rand < 0.5) {
        cells[y][x].rewardType = 'small';
      } else if (rand < 0.85) {
        cells[y][x].rewardType = 'medium';
      } else {
        cells[y][x].rewardType = 'large';
      }
    }

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
        if (
          !visited.has(key) &&
          cells[ny][nx].type !== 'obstacle'
        ) {
          visited.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }

  return false;
}

// BFS检查所有关键节点是否从起点可达
function checkAllKeyNodesReachable(
  cells: MapCell[][],
  startPos: { x: number; y: number },
  width: number,
  height: number
): boolean {
  const visited = new Set<string>();
  const queue = [{ x: startPos.x, y: startPos.y }];
  visited.add(`${startPos.x},${startPos.y}`);

  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;

    for (const dir of directions) {
      const nx = x + dir.dx;
      const ny = y + dir.dy;

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const key = `${nx},${ny}`;
        if (
          !visited.has(key) &&
          cells[ny][nx].type !== 'obstacle'
        ) {
          visited.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];
      const isKeyNode =
        cell.type === 'camp' ||
        cell.type === 'supply' ||
        cell.type === 'elite' ||
        cell.type === 'reward' ||
        cell.type === 'boss' ||
        cell.isGoal;

      if (isKeyNode && !visited.has(`${x},${y}`)) {
        return false;
      }
    }
  }

  return true;
}

// ==================== 问号格揭示 ====================

export function resolveQuestionCell(
  cell: MapCell,
  startPos: { x: number; y: number },
  goalPos: { x: number; y: number }
): ResolvedType {
  const diagonalDist = Math.sqrt(
    Math.pow(goalPos.x - startPos.x, 2) +
      Math.pow(goalPos.y - startPos.y, 2)
  );

  const distFromStart = Math.sqrt(
    Math.pow(cell.x - startPos.x, 2) +
      Math.pow(cell.y - startPos.y, 2)
  );
  const distFromGoal = Math.sqrt(
    Math.pow(cell.x - goalPos.x, 2) +
      Math.pow(cell.y - goalPos.y, 2)
  );

  let combatWeight: number;
  let eventWeight: number;
  let opportunityWeight: number;
  let dangerWeight: number;
  let rewardWeight: number;

  if (distFromStart < diagonalDist / 3) {
    combatWeight = 0.20;
    eventWeight = 0.35;
    opportunityWeight = 0.30;
    dangerWeight = 0.10;
    rewardWeight = 0.05;
  } else if (distFromGoal < diagonalDist / 3) {
    combatWeight = 0.40;
    eventWeight = 0.15;
    opportunityWeight = 0.15;
    dangerWeight = 0.25;
    rewardWeight = 0.05;
  } else {
    combatWeight = 0.35;
    eventWeight = 0.25;
    opportunityWeight = 0.20;
    dangerWeight = 0.15;
    rewardWeight = 0.05;
  }

  const rand = Math.random();
  if (rand < combatWeight) return 'combat';
  if (rand < combatWeight + eventWeight) return 'event';
  if (
    rand <
    combatWeight + eventWeight + opportunityWeight
  )
    return 'opportunity';
  if (
    rand <
    combatWeight +
      eventWeight +
      opportunityWeight +
      dangerWeight
  )
    return 'danger';
  return 'reward';
}

// ==================== 可达格显示更新（仅用于显示） ====================

/**
 * 更新所有格子的 isReachable 标记，仅用于地图绘制高亮。
 * 核心移动判断使用 canMoveTo()，不依赖此函数。
 */
export function updateReachableCells(state: GameState): void {
  const { currentPosition, mapCells } = state;
  const { x, y } = currentPosition;

  // 重置所有格子的可到达状态
  for (const row of mapCells) {
    for (const cell of row) {
      cell.isReachable = false;
    }
  }

  // 标记上下左右相邻非障碍格为可到达（仅显示用）
  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  for (const dir of directions) {
    const nx = x + dir.dx;
    const ny = y + dir.dy;

    if (
      nx >= 0 &&
      nx < state.mapWidth &&
      ny >= 0 &&
      ny < state.mapHeight
    ) {
      const cell = mapCells[ny][nx];
      if (cell.type !== 'obstacle') {
        cell.isReachable = true;
      }
    }
  }
}

// ==================== 移动执行 ====================

/**
 * 执行移动到目标格子。
 * 使用 canMoveTo() 动态判断，不依赖 isReachable 状态。
 */
export function moveToCell(
  state: GameState,
  x: number,
  y: number
): boolean {
  // 使用动态判断
  if (!canMoveTo(state, x, y)) {
    console.log(
      '[地图] 移动失败: canMoveTo 返回 false',
      { from: state.currentPosition, to: { x, y } }
    );
    return false;
  }

  const targetCell = state.mapCells[y][x];
  console.log(
    '[地图] 尝试移动:',
    {
      from: state.currentPosition,
      to: { x, y },
      type: targetCell.type,
      isCleared: targetCell.isCleared,
    }
  );

  // 更新旧位置
  const oldCell =
    state.mapCells[state.currentPosition.y][
      state.currentPosition.x
    ];
  oldCell.isCurrent = false;
  oldCell.visited = true;

  // 更新新位置
  state.currentPosition = { x, y };
  const newCell = state.mapCells[y][x];
  newCell.isCurrent = true;
  newCell.visited = true;

  // 天数 +1
  state.day += 1;

  console.log(
    '[地图] 移动成功，新位置:',
    { x, y },
    'day:',
    state.day
  );

  // 更新可达格显示
  updateReachableCells(state);

  return true;
}

// ==================== 游戏状态检查 ====================

export function checkGameOver(
  state: GameState
): { isOver: boolean; reason?: string } {
  if (state.day > state.maxDay) {
    return { isOver: true, reason: '远征失败：错过期限' };
  }
  if (state.morale <= 0) {
    return { isOver: true, reason: '远征失败：士气崩溃' };
  }
  if (state.caravanHp <= 0) {
    return { isOver: true, reason: '远征失败：商队被摧毁' };
  }
  return { isOver: false };
}

export function checkVictory(state: GameState): boolean {
  const currentCell =
    state.mapCells[state.currentPosition.y][
      state.currentPosition.x
    ];
  if (state.expeditionGoal === 'boss') {
    return (
      currentCell.type === 'boss' &&
      state.battleResult === 'victory'
    );
  } else {
    return (
      currentCell.isGoal &&
      state.currentPosition.x === state.bossPosition.x &&
      state.currentPosition.y === state.bossPosition.y
    );
  }
}

// ==================== 全局状态管理 ====================

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
