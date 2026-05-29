import { CharacterDef, CardDef, CharacterId } from './types';

export type { CharacterId };

// 5个初始角色定义
export const CHARACTER_DEFS: Record<CharacterId, CharacterDef> = {
  guardian: {
    id: 'guardian',
    name: '护路人',
    role: '防御、保护队友和商队',
    maxHp: 35,
    passiveDesc: '每场战斗第一次获得护甲时，商队也获得2点护甲',
    color: 0x4488ff,
    icon: '🛡️',
  },
  sharpshooter: {
    id: 'sharpshooter',
    name: '荒野射手',
    role: '标记、单体输出',
    maxHp: 26,
    passiveDesc: '攻击带有标记的敌人时，额外造成2点伤害',
    color: 0xff6644,
    icon: '🏹',
  },
  repairman: {
    id: 'repairman',
    name: '修补师',
    role: '治疗、修理商队、资源管理',
    maxHp: 24,
    passiveDesc: '每场战斗第一次修理商队时，额外恢复3点商队耐久',
    color: 0x44cc88,
    icon: '🔧',
  },
  scout: {
    id: 'scout',
    name: '斥候',
    role: '地图探索、闪避、事件收益',
    maxHp: 22,
    passiveDesc: '进入事件格时，有25%概率提前看到风险提示',
    color: 0xffcc44,
    icon: '👁️',
  },
  inspirer: {
    id: 'inspirer',
    name: '鼓舞者',
    role: '士气、抽牌、团队支援',
    maxHp: 23,
    passiveDesc: '士气大于等于5时，每场战斗第一回合额外抽1张牌',
    color: 0xff88cc,
    icon: '🎵',
  },
};

// 所有卡牌定义
export const ALL_CARDS: CardDef[] = [
  // === 护路人牌组 ===
  {
    id: 'guardian_shield_up',
    name: '举盾',
    cost: 1,
    characterId: 'guardian',
    type: 'defense',
    description: '护路人获得8点护甲',
    effects: [{ type: 'armor', value: 8, target: 'self' }],
  },
  {
    id: 'guardian_shield_bash',
    name: '盾击',
    cost: 1,
    characterId: 'guardian',
    type: 'attack',
    description: '造成6点伤害。如果护路人有护甲，额外造成4点伤害',
    effects: [
      { type: 'damage', value: 6, target: 'enemy' },
      { type: 'special', value: 4, target: 'enemy', condition: 'has_armor' },
    ],
  },
  {
    id: 'guardian_intercept',
    name: '拦截',
    cost: 1,
    characterId: 'guardian',
    type: 'skill',
    description: '本回合替生命最低的队友承受下一次伤害',
    effects: [{ type: 'special', value: 0, target: 'ally' }],
  },
  {
    id: 'guardian_hold_line',
    name: '稳住阵线',
    cost: 2,
    characterId: 'guardian',
    type: 'defense',
    description: '所有能上场的角色获得4点护甲',
    effects: [{ type: 'armor', value: 4, target: 'all_allies' }],
  },

  // === 荒野射手牌组 ===
  {
    id: 'sharpshooter_aim',
    name: '瞄准',
    cost: 1,
    characterId: 'sharpshooter',
    type: 'skill',
    description: '给目标敌人1层标记',
    effects: [{ type: 'mark', value: 1, target: 'enemy' }],
  },
  {
    id: 'sharpshooter_shoot',
    name: '射击',
    cost: 1,
    characterId: 'sharpshooter',
    type: 'attack',
    description: '造成7点伤害',
    effects: [{ type: 'damage', value: 7, target: 'enemy' }],
  },
  {
    id: 'sharpshooter_precise_shot',
    name: '精准射击',
    cost: 2,
    characterId: 'sharpshooter',
    type: 'attack',
    description: '造成12点伤害。如果目标有标记，额外造成6点伤害，并移除1层标记',
    effects: [
      { type: 'damage', value: 12, target: 'enemy' },
      { type: 'special', value: 6, target: 'enemy', condition: 'has_mark' },
    ],
  },
  {
    id: 'sharpshooter_suppress',
    name: '压制',
    cost: 1,
    characterId: 'sharpshooter',
    type: 'skill',
    description: '目标敌人下一次攻击伤害减少4点',
    effects: [{ type: 'special', value: 4, target: 'enemy' }],
  },

  // === 修补师牌组 ===
  {
    id: 'repairman_bandage',
    name: '包扎',
    cost: 1,
    characterId: 'repairman',
    type: 'heal',
    description: '恢复生命最低的可上场角色5点生命',
    effects: [{ type: 'heal', value: 5, target: 'ally' }],
  },
  {
    id: 'repairman_quick_fix',
    name: '临时修理',
    cost: 1,
    characterId: 'repairman',
    type: 'repair',
    description: '商队耐久恢复6点',
    effects: [{ type: 'repair_caravan', value: 6, target: 'caravan' }],
  },
  {
    id: 'repairman_scrap',
    name: '拆零件',
    cost: 0,
    characterId: 'repairman',
    type: 'skill',
    description: '商队耐久-2，本回合行动力+1，抽1张修补师的牌',
    effects: [
      { type: 'repair_caravan', value: -2, target: 'caravan' },
      { type: 'add_action', value: 1, target: 'self' },
      { type: 'draw', value: 1, target: 'self' },
    ],
  },
  {
    id: 'repairman_emergency',
    name: '应急方案',
    cost: 1,
    characterId: 'repairman',
    type: 'skill',
    description: '如果商队耐久低于一半，抽2张牌；否则抽1张牌',
    effects: [{ type: 'draw', value: 1, target: 'self' }],
  },

  // === 斥候牌组 ===
  {
    id: 'scout_recon',
    name: '侦查',
    cost: 1,
    characterId: 'scout',
    type: 'skill',
    description: '抽1张任意角色的牌；下一次敌人攻击伤害减少2点',
    effects: [
      { type: 'draw', value: 1, target: 'self' },
      { type: 'special', value: 2, target: 'self' },
    ],
  },
  {
    id: 'scout_quick_step',
    name: '快步',
    cost: 1,
    characterId: 'scout',
    type: 'defense',
    description: '斥候获得6点护甲；如果本回合没有受伤，士气+1',
    effects: [{ type: 'armor', value: 6, target: 'self' }],
  },
  {
    id: 'scout_stab',
    name: '刺击',
    cost: 1,
    characterId: 'scout',
    type: 'attack',
    description: '造成5点伤害。如果敌人有标记，额外造成5点伤害',
    effects: [
      { type: 'damage', value: 5, target: 'enemy' },
      { type: 'special', value: 5, target: 'enemy', condition: 'has_mark' },
    ],
  },
  {
    id: 'scout_find_path',
    name: '找路',
    cost: 1,
    characterId: 'scout',
    type: 'skill',
    description: '战斗中抽1张牌；在事件中可以作为特殊选项条件',
    effects: [{ type: 'draw', value: 1, target: 'self' }],
  },

  // === 鼓舞者牌组 ===
  {
    id: 'inspirer_inspire',
    name: '鼓舞',
    cost: 1,
    characterId: 'inspirer',
    type: 'skill',
    description: '士气+1，抽1张任意角色的牌',
    effects: [
      { type: 'morale', value: 1, target: 'self' },
      { type: 'draw', value: 1, target: 'self' },
    ],
  },
  {
    id: 'inspirer_comfort',
    name: '安抚',
    cost: 1,
    characterId: 'inspirer',
    type: 'heal',
    description: '移除一名角色1个负面状态，并恢复3点生命',
    effects: [{ type: 'heal', value: 3, target: 'ally' }],
  },
  {
    id: 'inspirer_battle_song',
    name: '战歌',
    cost: 2,
    characterId: 'inspirer',
    type: 'skill',
    description: '本回合所有攻击牌伤害+2',
    effects: [{ type: 'special', value: 2, target: 'all_allies' }],
  },
  {
    id: 'inspirer_chorus',
    name: '合唱',
    cost: 1,
    characterId: 'inspirer',
    type: 'defense',
    description: '全队获得等同当前士气的护甲，最多8点',
    effects: [{ type: 'armor', value: 0, target: 'all_allies' }],
  },
];

// 复制卡牌（创建新的卡牌实例）
function copyCard(cardDef: CardDef): CardDef {
  return {
    ...cardDef,
    effects: cardDef.effects.map(e => ({ ...e })),
  };
}

// 添加指定数量的卡牌副本
function addCardCopies(cards: CardDef[], cardId: string, count: number): void {
  const cardDef = ALL_CARDS.find(c => c.id === cardId);
  if (!cardDef) {
    console.error(`Card not found: ${cardId}`);
    return;
  }
  for (let i = 0; i < count; i++) {
    cards.push(copyCard(cardDef));
  }
}

// 获取角色的初始牌组
export function getStartingDeck(characterId: CharacterId): CardDef[] {
  const cards: CardDef[] = [];
  
  // 根据文档，每个角色有特定的初始牌数量
  switch (characterId) {
    case 'guardian':
      // 举盾×2, 盾击×2, 拦截×1, 稳住阵线×1 = 6张
      addCardCopies(cards, 'guardian_shield_up', 2);
      addCardCopies(cards, 'guardian_shield_bash', 2);
      addCardCopies(cards, 'guardian_intercept', 1);
      addCardCopies(cards, 'guardian_hold_line', 1);
      break;
    case 'sharpshooter':
      // 瞄准×2, 射击×2, 精准射击×1, 压制×1 = 6张
      addCardCopies(cards, 'sharpshooter_aim', 2);
      addCardCopies(cards, 'sharpshooter_shoot', 2);
      addCardCopies(cards, 'sharpshooter_precise_shot', 1);
      addCardCopies(cards, 'sharpshooter_suppress', 1);
      break;
    case 'repairman':
      // 包扎×2, 临时修理×2, 拆零件×1, 应急方案×1 = 6张
      addCardCopies(cards, 'repairman_bandage', 2);
      addCardCopies(cards, 'repairman_quick_fix', 2);
      addCardCopies(cards, 'repairman_scrap', 1);
      addCardCopies(cards, 'repairman_emergency', 1);
      break;
    case 'scout':
      // 侦查×2, 快步×2, 刺击×1, 找路×1 = 6张
      addCardCopies(cards, 'scout_recon', 2);
      addCardCopies(cards, 'scout_quick_step', 2);
      addCardCopies(cards, 'scout_stab', 1);
      addCardCopies(cards, 'scout_find_path', 1);
      break;
    case 'inspirer':
      // 鼓舞×2, 安抚×2, 战歌×1, 合唱×1 = 6张
      addCardCopies(cards, 'inspirer_inspire', 2);
      addCardCopies(cards, 'inspirer_comfort', 2);
      addCardCopies(cards, 'inspirer_battle_song', 1);
      addCardCopies(cards, 'inspirer_chorus', 1);
      break;
  }
  
  console.log(`[牌组] ${characterId} 初始牌组: ${cards.length}张 - ${cards.map(c => c.name).join(', ')}`);
  return cards;
}

// 创建角色初始状态
export function createCharacterState(characterId: CharacterId) {
  const def = CHARACTER_DEFS[characterId];
  const deck = getStartingDeck(characterId);
  
  return {
    def,
    currentHp: def.maxHp,
    armor: 0,
    graveWounds: 0,
    isWounded: false,
    restNodes: 0,
    isDead: false,
    deck: [...deck],
    drawPile: [] as CardDef[],
    discardPile: [] as CardDef[],
    hand: [] as CardDef[],
  };
}
