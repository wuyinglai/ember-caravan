import { EnemyDef, EnemyState } from './types';

// 敌人定义
export const ENEMY_DEFS: Record<string, EnemyDef> = {
  bandit: {
    id: 'bandit',
    name: '荒原强盗',
    maxHp: 24,
    icon: '👺',
    color: 0xcc4444,
  },
  beast: {
    id: 'beast',
    name: '野兽',
    maxHp: 20,
    icon: '🐺',
    color: 0x884422,
  },
  raider: {
    id: 'raider',
    name: '掠夺者',
    maxHp: 32,
    icon: '⚔️',
    color: 0xaa3333,
  },
  slinger: {
    id: 'slinger',
    name: '投石者',
    maxHp: 18,
    icon: '🪨',
    color: 0x666666,
  },
  destroyer: {
    id: 'destroyer',
    name: '破坏者',
    maxHp: 22,
    icon: '🔨',
    color: 0x552222,
  },
  boss: {
    id: 'boss',
    name: '荒原劫掠首领',
    maxHp: 90,
    icon: '👹',
    color: 0xff0000,
  },
};

// 敌人行动库
export const ENEMY_ACTIONS = {
  bandit_attack: {
    name: '挥砍',
    description: '攻击随机角色6点',
    damage: 6,
    target: 'random_character' as const,
  },
  beast_attack: {
    name: '撕咬',
    description: '攻击商队5点',
    damage: 5,
    target: 'caravan' as const,
  },
  raider_attack: {
    name: '掠夺',
    description: '攻击随机角色4点，同时攻击商队3点',
    damage: 4,
    target: 'random_character' as const,
  },
  slinger_attack: {
    name: '投石',
    description: '攻击生命最低的角色5点',
    damage: 5,
    target: 'lowest_hp_character' as const,
  },
  destroyer_attack: {
    name: '重击',
    description: '攻击商队6点',
    damage: 6,
    target: 'caravan' as const,
  },
  // Boss行动
  boss_attack_char: {
    name: '首领斩击',
    description: '攻击随机角色9点',
    damage: 9,
    target: 'random_character' as const,
  },
  boss_attack_caravan: {
    name: '破坏商队',
    description: '攻击商队10点',
    damage: 10,
    target: 'caravan' as const,
  },
  boss_summon: {
    name: '召唤援军',
    description: '召唤一个荒原强盗',
    damage: 0,
    target: 'random_character' as const,
  },
  boss_buff: {
    name: '战吼',
    description: '所有敌人获得4点护甲',
    damage: 0,
    target: 'random_character' as const,
  },
};

// 创建敌人状态
export function createEnemyState(enemyId: string): EnemyState {
  const def = ENEMY_DEFS[enemyId];
  return {
    def,
    currentHp: def.maxHp,
    armor: 0,
    marks: 0,
    suppressedDamage: 0, // 压制效果初始为0
    nextAction: null,
  };
}

// 获取敌人下一行动
export function getEnemyNextAction(enemyId: string, turn: number): typeof ENEMY_ACTIONS[keyof typeof ENEMY_ACTIONS] | null {
  switch (enemyId) {
    case 'bandit':
      return ENEMY_ACTIONS.bandit_attack;
    case 'beast':
      return ENEMY_ACTIONS.beast_attack;
    case 'raider':
      return ENEMY_ACTIONS.raider_attack;
    case 'slinger':
      return ENEMY_ACTIONS.slinger_attack;
    case 'destroyer':
      return ENEMY_ACTIONS.destroyer_attack;
    case 'boss':
      // Boss行动循环：1-攻击角色, 2-攻击商队, 3-召唤或buff
      const cycle = (turn - 1) % 3;
      if (cycle === 0) return ENEMY_ACTIONS.boss_attack_char;
      if (cycle === 1) return ENEMY_ACTIONS.boss_attack_caravan;
      return ENEMY_ACTIONS.boss_summon;
    default:
      return null;
  }
}

// 生成普通战斗敌人
export function generateNormalEnemies(): string[] {
  const pool = ['bandit', 'beast', 'raider', 'slinger', 'destroyer'];
  const count = Math.floor(Math.random() * 2) + 1; // 1-2个敌人
  const enemies: string[] = [];
  
  for (let i = 0; i < count; i++) {
    enemies.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  
  return enemies;
}
