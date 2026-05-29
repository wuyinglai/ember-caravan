// 核心类型定义

export type CharacterId = 'guardian' | 'sharpshooter' | 'repairman' | 'scout' | 'inspirer';
export type CardType = 'attack' | 'defense' | 'skill' | 'heal' | 'repair';
export type TargetType = 'enemy' | 'self' | 'ally' | 'all_enemies' | 'all_allies' | 'caravan' | 'none';

// 角色定义
export interface CharacterDef {
  id: CharacterId;
  name: string;
  role: string;
  maxHp: number;
  passiveDesc: string;
  color: number; // Phaser颜色值
  icon: string;
}

// 卡牌效果
export interface CardEffect {
  type: 'damage' | 'heal' | 'armor' | 'draw' | 'mark' | 'repair_caravan' | 'add_action' | 'morale' | 'special';
  value: number;
  target: TargetType;
  condition?: string;
}

// 卡牌定义
export interface CardDef {
  id: string;
  name: string;
  cost: number;
  characterId: CharacterId;
  type: CardType;
  description: string;
  effects: CardEffect[];
}

// 运行时角色状态
export interface CharacterState {
  def: CharacterDef;
  currentHp: number;
  armor: number;
  graveWounds: number; // 重伤次数
  isWounded: boolean; // 是否当前重伤
  restNodes: number; // 还要休息几个节点
  isDead: boolean; // 本局是否死亡/离队
  deck: CardDef[];
  drawPile: CardDef[];
  discardPile: CardDef[];
  hand: CardDef[];
}

// 敌人定义
export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  icon: string;
  color: number;
}

// 运行时敌人状态
export interface EnemyState {
  def: EnemyDef;
  currentHp: number;
  armor: number;
  marks: number; // 标记层数
  nextAction: EnemyAction | null;
}

// 敌人行动
export interface EnemyAction {
  name: string;
  description: string;
  damage?: number;
  target: 'random_character' | 'caravan' | 'lowest_hp_character';
}

// 战斗状态
export interface BattleState {
  characters: CharacterState[];
  enemies: EnemyState[];
  actionPoints: number;
  maxActionPoints: number;
  turn: number;
  caravanArmor: number;
  caravanDurability: number;
  caravanMaxDurability: number;
}

// 商队资源
export interface CaravanResources {
  food: number;
  morale: number;
  durability: number;
  maxDurability: number;
  day: number;
  maxDay: number;
}
