import { CharacterId } from '../data/characters';

// 地图格子类型
export type CellType = 'obstacle' | 'boss' | 'elite' | 'camp' | 'supply' | 'reward' | 'question' | 'empty';
export type ResolvedType = 'combat' | 'event' | 'opportunity' | 'danger' | 'reward' | 'empty';

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
  isGoal: boolean; // 是否为远征目标点
  rewardType: 'small' | 'medium' | 'large' | null; // 奖励类型
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
  };
}

// 创建半隐藏远征地图
export function createExpeditionMap(width: number, height: number): {
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

  // 尝试生成直到有通路且所有关键节点可达
  while (!hasPath) {
    cells = createEmptyMap(width, height);

    // 起点在左下区域：x: 0-2, y: height-1 到 height-3
    startPos = {
      x: Math.floor(Math.random() * 3),
      y: height - 1 - Math.floor(Math.random() * 3),
    };

    // 目标点在右上区域：x: width-1 到 width-4, y: 0-3
    bossPos = {
      x: width - 1 - Math.floor(Math.random() * 4),
      y: Math.floor(Math.random() * 4),
    };

    // 确保起点和目标距离足够远（地图更大了）
    const distance = Math.abs(startPos.x - bossPos.x) + Math.abs(startPos.y - bossPos.y);
    if (distance < 18) continue;

    // 随机选择远征目标：70% boss，30% sanctuary
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
      // sanctuary 目标：类型为 empty，标记为目标点，提前可见
      cells[bossPos.y][bossPos.x].type = 'empty';
      cells[bossPos.y][bossPos.x].isRevealed = true;
      cells[bossPos.y][bossPos.x].isGoal = true;
    }

    // 生成障碍团块
    generateObstacleClusters(cells, width, height, startPos, bossPos);

    // 生成障碍带
    generateObstacleBands(cells, width, height, startPos, bossPos);

    // 放置关键节点（营地、补给点、强敌、奖励点）
    placeKeyNodes(cells, width, height, startPos, bossPos);

    // 检查是否有通路
    const pathExists = checkPathExists(cells, startPos, bossPos, width, height);
    if (!pathExists) continue;

    // 检查所有关键节点是否从起点可达
    hasPath = checkAllKeyNodesReachable(cells, startPos, width, height);
  }

  return { cells: cells!, startPos: startPos!, bossPos: bossPos!, expeditionGoal: expeditionGoal! };
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
  const numClusters = 4 + Math.floor(Math.random() * 4); // 4-7个团块（地图更大了）

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

    // 团块大小（地图更大了）
    const clusterSize = 6 + Math.floor(Math.random() * 10); // 6-15个格子

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
  // 2-3条障碍带（地图更大了）
  const numBands = 2 + Math.floor(Math.random() * 2);

  for (let b = 0; b < numBands; b++) {
    const bandType = Math.random() < 0.5 ? 'horizontal' : 'vertical';

    if (bandType === 'horizontal') {
      // 横向山脉
      const y = 2 + Math.floor(Math.random() * (height - 4));

      // 留 2-3 个缺口
      const numGaps = 2 + Math.floor(Math.random() * 2);
      const gaps: { start: number; end: number }[] = [];
      for (let g = 0; g < numGaps; g++) {
        const gapStart = Math.floor(Math.random() * (width - 3));
        const gapEnd = gapStart + 1 + Math.floor(Math.random() * 2);
        gaps.push({ start: gapStart, end: gapEnd });
      }

      for (let x = 0; x < width; x++) {
        // 检查是否在任何缺口内
        const inGap = gaps.some(gap => x >= gap.start && x <= gap.end);
        if (inGap) continue;
        if (cells[y][x].type === 'question' &&
            !(Math.abs(x - startPos.x) < 2 && Math.abs(y - startPos.y) < 2) &&
            !(Math.abs(x - bossPos.x) < 2 && Math.abs(y - bossPos.y) < 2)) {
          cells[y][x].type = 'obstacle';
        }
      }
    } else {
      // 纵向峡谷
      const x = 3 + Math.floor(Math.random() * (width - 6));

      // 留 2-3 个缺口
      const numGaps = 2 + Math.floor(Math.random() * 2);
      const gaps: { start: number; end: number }[] = [];
      for (let g = 0; g < numGaps; g++) {
        const gapStart = Math.floor(Math.random() * (height - 3));
        const gapEnd = gapStart + 1 + Math.floor(Math.random() * 2);
        gaps.push({ start: gapStart, end: gapEnd });
      }

      for (let y = 0; y < height; y++) {
        // 检查是否在任何缺口内
        const inGap = gaps.some(gap => y >= gap.start && y <= gap.end);
        if (inGap) continue;
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

  // 放置奖励点 (4-6个，提前可见)
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

    // 奖励点需要设置 rewardType
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
        if (!visited.has(key) && cells[ny][nx].type !== 'obstacle') {
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
  // 先用 BFS 从起点遍历所有可达格子
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
        if (!visited.has(key) && cells[ny][nx].type !== 'obstacle') {
          visited.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }

  // 检查所有关键节点是否在可达集合中
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

// 随机决定问号格内容（按区域调整概率）
export function resolveQuestionCell(
  cell: MapCell,
  startPos: { x: number; y: number },
  goalPos: { x: number; y: number }
): ResolvedType {
  // 计算地图对角线距离
  const diagonalDist = Math.sqrt(
    Math.pow(goalPos.x - startPos.x, 2) + Math.pow(goalPos.y - startPos.y, 2)
  );

  // 计算问号格到起点和目标的距离
  const distFromStart = Math.sqrt(
    Math.pow(cell.x - startPos.x, 2) + Math.pow(cell.y - startPos.y, 2)
  );
  const distFromGoal = Math.sqrt(
    Math.pow(cell.x - goalPos.x, 2) + Math.pow(cell.y - goalPos.y, 2)
  );

  // 按区域确定概率
  let combatWeight: number, eventWeight: number, opportunityWeight: number, dangerWeight: number, rewardWeight: number;

  if (distFromStart < diagonalDist / 3) {
    // 靠近起点：战斗少，事件多，机遇多，危险少
    combatWeight = 0.20;
    eventWeight = 0.35;
    opportunityWeight = 0.30;
    dangerWeight = 0.10;
    rewardWeight = 0.05;
  } else if (distFromGoal < diagonalDist / 3) {
    // 靠近目标：战斗多，危险多
    combatWeight = 0.40;
    eventWeight = 0.15;
    opportunityWeight = 0.15;
    dangerWeight = 0.25;
    rewardWeight = 0.05;
  } else {
    // 中段区域
    combatWeight = 0.35;
    eventWeight = 0.25;
    opportunityWeight = 0.20;
    dangerWeight = 0.15;
    rewardWeight = 0.05;
  }

  const rand = Math.random();
  if (rand < combatWeight) return 'combat';
  if (rand < combatWeight + eventWeight) return 'event';
  if (rand < combatWeight + eventWeight + opportunityWeight) return 'opportunity';
  if (rand < combatWeight + eventWeight + opportunityWeight + dangerWeight) return 'danger';
  return 'reward';
}

// 更新可到达格子
export function updateReachableCells(state: GameState): void {
  const { currentPosition, mapCells } = state;
  const { x, y } = currentPosition;

  console.log('[地图] 更新可到达格子，当前坐标:', { x, y });

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

  const reachableCells: { x: number; y: number }[] = [];

  for (const dir of directions) {
    const nx = x + dir.dx;
    const ny = y + dir.dy;

    if (nx >= 0 && nx < state.mapWidth && ny >= 0 && ny < state.mapHeight) {
      const cell = mapCells[ny][nx];
      // 障碍不可移动，但其他所有类型都可以移动（包括已清理的战斗格、营地、补给等）
      if (cell.type !== 'obstacle') {
        cell.isReachable = true;
        reachableCells.push({ x: nx, y: ny });
      }
    }
  }

  // reachableCount=0 兜底机制：如果四周全部是障碍，强制设置非障碍格为可达
  if (reachableCells.length === 0) {
    console.log('[地图调试] reachableCount=0，检查四周格子...');
    let forcedCount = 0;
    for (const dir of directions) {
      const nx = x + dir.dx;
      const ny = y + dir.dy;
      if (nx >= 0 && nx < state.mapWidth && ny >= 0 && ny < state.mapHeight) {
        const cell = mapCells[ny][nx];
        if (cell.type === 'obstacle') {
          // 强制将障碍格设为可达（兜底）
          cell.isReachable = true;
          reachableCells.push({ x: nx, y: ny });
          forcedCount++;
          console.log(`[地图调试]   强制设置 (${nx},${ny}) 为可达（原为障碍）`);
        }
      }
    }
    if (forcedCount > 0) {
      console.log(`[地图兜底] 修复 reachableCount=0，强制设置 ${forcedCount} 个格子为可达`);
    }
  }

  console.log('[地图] 可移动格子:', reachableCells);

  // 非障碍可达比例检查：BFS 计算从起点可达的非障碍格总数
  const bfsVisited = new Set<string>();
  const bfsQueue = [{ x: state.startPosition.x, y: state.startPosition.y }];
  bfsVisited.add(`${state.startPosition.x},${state.startPosition.y}`);

  while (bfsQueue.length > 0) {
    const pos = bfsQueue.shift()!;
    for (const dir of directions) {
      const nx = pos.x + dir.dx;
      const ny = pos.y + dir.dy;
      const key = `${nx},${ny}`;
      if (nx >= 0 && nx < state.mapWidth && ny >= 0 && ny < state.mapHeight &&
          !bfsVisited.has(key) && mapCells[ny][nx].type !== 'obstacle') {
        bfsVisited.add(key);
        bfsQueue.push({ x: nx, y: ny });
      }
    }
  }

  // 计算总非障碍格数
  let totalNonObstacle = 0;
  for (const row of mapCells) {
    for (const cell of row) {
      if (cell.type !== 'obstacle') totalNonObstacle++;
    }
  }

  const reachableRatio = totalNonObstacle > 0 ? bfsVisited.size / totalNonObstacle : 0;
  if (reachableRatio < 0.85) {
    console.log(`[地图调试] 警告：非障碍可达比例偏低！BFS可达=${bfsVisited.size} 总非障碍=${totalNonObstacle} 比例=${(reachableRatio * 100).toFixed(1)}%`);
  }
}

// 移动到新格子
export function moveToCell(state: GameState, x: number, y: number): boolean {
  const targetCell = state.mapCells[y][x];

  console.log('[地图] 尝试移动:', { from: state.currentPosition, to: { x, y }, targetCell: { type: targetCell.type, isReachable: targetCell.isReachable, isCleared: targetCell.isCleared } });

  // 检查是否可到达
  if (!targetCell.isReachable) {
    console.log('[地图] 移动失败: 目标格子不可到达');
    return false;
  }

  // 检查是否是障碍
  if (targetCell.type === 'obstacle') {
    console.log('[地图] 移动失败: 目标格子是障碍');
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

  console.log('[地图] 移动成功，新位置:', { x, y }, 'day:', state.day);

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
  const currentCell = state.mapCells[state.currentPosition.y][state.currentPosition.x];
  if (state.expeditionGoal === 'boss') {
    return currentCell.type === 'boss' && state.battleResult === 'victory';
  } else {
    // sanctuary 目标：到达目标点即胜利
    return currentCell.isGoal && state.currentPosition.x === state.bossPosition.x && state.currentPosition.y === state.bossPosition.y;
  }
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
