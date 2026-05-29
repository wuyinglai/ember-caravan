import { BattleState, CharacterState, EnemyState, CardDef, CardEffect } from '../data/types';
import { DeckManager } from './DeckManager';
import { getEnemyNextAction } from '../data/enemies';

export class BattleManager {
  state: BattleState;
  private selectedCard: { charIndex: number; cardIndex: number } | null = null;
  private selectedEnemy: number | null = null;
  private onBattleEnd: ((victory: boolean) => void) | null = null;
  
  // 被动技能触发标记
  private guardianPassiveTriggered: boolean = false;
  private repairmanPassiveTriggered: boolean = false;
  
  // 调试日志
  logs: string[] = [];
  
  constructor(
    characters: CharacterState[],
    enemies: EnemyState[],
    onBattleEnd?: (victory: boolean) => void,
    caravanDurability?: number,
    caravanMaxDurability?: number
  ) {
    this.state = {
      characters: characters,
      enemies: enemies,
      actionPoints: 3,
      maxActionPoints: 3,
      turn: 1,
      caravanArmor: 0,
      caravanDurability: caravanDurability ?? 45,
      caravanMaxDurability: caravanMaxDurability ?? 45,
    };

    this.guardianPassiveTriggered = false;
    this.repairmanPassiveTriggered = false;

    if (onBattleEnd) {
      this.onBattleEnd = onBattleEnd;
    }

    this.logs = [];
  }
  
  // 开始战斗
  startBattle(): void {
    this.log('=== 战斗开始 ===');
    this.log(`商队耐久: ${this.state.caravanDurability}/${this.state.caravanMaxDurability}`);
    
    // 初始化每个角色的牌组
    for (const char of this.state.characters) {
      DeckManager.initCharacterDeck(char);
      this.log(`${char.def.name} 加入战斗 (HP: ${char.currentHp}/${char.def.maxHp})`);
      this.log(`  牌组: ${char.deck.length}张 - ${char.deck.map(c => c.name).join(', ')}`);
      this.log(`  初始手牌: ${char.hand.map(c => c.name).join(', ')}`);
    }
    
    // 设置敌人初始意图
    this.updateEnemyIntents();
    
    this.log(`第 ${this.state.turn} 回合开始，行动力: ${this.state.actionPoints}/${this.state.maxActionPoints}`);
  }
  
  // 更新敌人意图
  updateEnemyIntents(): void {
    for (let i = 0; i < this.state.enemies.length; i++) {
      const enemy = this.state.enemies[i];
      if (enemy.currentHp > 0) {
        enemy.nextAction = getEnemyNextAction(enemy.def.id, this.state.turn);
      }
    }
  }
  
  // 选择卡牌
  selectCard(charIndex: number, cardIndex: number): boolean {
    const char = this.state.characters[charIndex];
    if (!char) return false;
    
    const card = char.hand[cardIndex];
    if (!card) return false;
    
    if (card.cost > this.state.actionPoints) {
      this.log(`行动力不足！需要 ${card.cost} 点，当前 ${this.state.actionPoints} 点`);
      return false;
    }
    
    this.selectedCard = { charIndex, cardIndex };
    return true;
  }
  
  // 选择敌人
  selectEnemy(enemyIndex: number): boolean {
    if (enemyIndex < 0 || enemyIndex >= this.state.enemies.length) return false;
    if (this.state.enemies[enemyIndex].currentHp <= 0) return false;
    
    this.selectedEnemy = enemyIndex;
    return true;
  }
  
  // 执行出牌
  playCard(): boolean {
    if (!this.selectedCard) {
      this.log('请先选择一张牌');
      return false;
    }
    
    const { charIndex, cardIndex } = this.selectedCard;
    const char = this.state.characters[charIndex];
    const card = char.hand[cardIndex];
    
    // 检查是否需要选择目标
    const needsTarget = card.effects.some(e => e.target === 'enemy');
    if (needsTarget && this.selectedEnemy === null) {
      this.log('请选择目标敌人');
      return false;
    }
    
    // 消耗行动力
    this.state.actionPoints -= card.cost;
    this.log(`${char.def.name} 使用【${card.name}】，消耗 ${card.cost} 行动力`);
    this.log(`  剩余行动力: ${this.state.actionPoints}`);
    
    // 从手牌移除
    DeckManager.playCard(char, cardIndex);
    
    // 执行效果
    this.executeCardEffects(char, card, this.selectedEnemy);
    
    // 清除选择
    this.selectedCard = null;
    this.selectedEnemy = null;
    
    // 检查战斗结束
    this.checkBattleEnd();
    
    return true;
  }
  
  // 执行卡牌效果
  private executeCardEffects(char: CharacterState, card: CardDef, targetEnemyIndex: number | null): void {
    for (const effect of card.effects) {
      this.executeEffect(char, card, effect, targetEnemyIndex);
    }
  }
  
  // 执行单个效果
  private executeEffect(char: CharacterState, card: CardDef, effect: CardEffect, targetEnemyIndex: number | null): void {
    switch (effect.type) {
      case 'damage':
        if (targetEnemyIndex !== null) {
          const enemy = this.state.enemies[targetEnemyIndex];
          if (enemy && enemy.currentHp > 0) {
            let damage = effect.value;
            
            // 检查标记加成（射手被动）
            if (char.def.id === 'sharpshooter' && enemy.marks > 0) {
              damage += 2;
              this.log(`  射手被动触发！标记加成 +2 伤害`);
            }
            
            // 护路人盾击特殊效果
            if (char.def.id === 'guardian' && card.id === 'guardian_shield_bash' && char.armor > 0) {
              damage += 4;
              this.log(`  盾击特效触发！有护甲额外 +4 伤害`);
            }
            
            this.dealDamageToEnemy(enemy, damage);
          }
        }
        break;
        
      case 'armor':
        if (effect.target === 'self') {
          char.armor += effect.value;
          this.log(`  ${char.def.name} 获得 ${effect.value} 点护甲`);
          
          // 护路人被动：第一次获得护甲时，商队也获得2点护甲
          if (char.def.id === 'guardian' && !this.guardianPassiveTriggered) {
            this.guardianPassiveTriggered = true;
            this.state.caravanArmor += 2;
            this.log(`  护路人被动触发！商队护甲 +2`);
          }
        } else if (effect.target === 'all_allies') {
          for (const c of this.state.characters) {
            c.armor += effect.value;
          }
          this.log(`  全队获得 ${effect.value} 点护甲`);
          
          // 护路人被动：第一次获得护甲时
          if (char.def.id === 'guardian' && !this.guardianPassiveTriggered) {
            this.guardianPassiveTriggered = true;
            this.state.caravanArmor += 2;
            this.log(`  护路人被动触发！商队护甲 +2`);
          }
        } else if (effect.target === 'ally') {
          // 拦截：给生命最低的队友护甲
          let lowestHpChar: CharacterState | null = null;
          for (const c of this.state.characters) {
            if (c.currentHp > 0) {
              if (!lowestHpChar || c.currentHp < lowestHpChar.currentHp) {
                lowestHpChar = c;
              }
            }
          }
          if (lowestHpChar) {
            lowestHpChar.armor += effect.value;
            this.log(`  拦截：${lowestHpChar.def.name} 获得 ${effect.value} 点护甲`);
          }
        }
        break;
        
      case 'heal':
        if (effect.target === 'ally') {
          let lowestHpChar: CharacterState | null = null;
          for (const c of this.state.characters) {
            if (c.currentHp > 0 && c.currentHp < c.def.maxHp) {
              if (!lowestHpChar || c.currentHp < lowestHpChar.currentHp) {
                lowestHpChar = c;
              }
            }
          }
          if (lowestHpChar) {
            const healAmount = Math.min(effect.value, lowestHpChar.def.maxHp - lowestHpChar.currentHp);
            lowestHpChar.currentHp += healAmount;
            this.log(`  ${lowestHpChar.def.name} 恢复 ${healAmount} 点生命`);
          }
        }
        break;
        
      case 'mark':
        if (targetEnemyIndex !== null) {
          const enemy = this.state.enemies[targetEnemyIndex];
          if (enemy) {
            enemy.marks += effect.value;
            this.log(`  ${enemy.def.name} 获得 ${effect.value} 层标记`);
          }
        }
        break;
        
      case 'repair_caravan':
        if (effect.value > 0) {
          const repairAmount = Math.min(effect.value, this.state.caravanMaxDurability - this.state.caravanDurability);
          this.state.caravanDurability += repairAmount;
          this.log(`  商队耐久恢复 ${repairAmount} 点`);
          this.log(`  商队耐久: ${this.state.caravanDurability}/${this.state.caravanMaxDurability}`);
          
          // 修补师被动：第一次修理时额外恢复3点
          if (char.def.id === 'repairman' && !this.repairmanPassiveTriggered) {
            this.repairmanPassiveTriggered = true;
            const bonusRepair = Math.min(3, this.state.caravanMaxDurability - this.state.caravanDurability);
            this.state.caravanDurability += bonusRepair;
            this.log(`  修补师被动触发！额外恢复 ${bonusRepair} 点`);
          }
        } else if (effect.value < 0) {
          this.state.caravanDurability = Math.max(0, this.state.caravanDurability + effect.value);
          this.log(`  商队耐久 -${Math.abs(effect.value)}`);
          this.log(`  商队耐久: ${this.state.caravanDurability}/${this.state.caravanMaxDurability}`);
        }
        break;
        
      case 'draw':
        // 应急方案特殊处理
        if (card.id === 'repairman_emergency') {
          const isBelowHalf = this.state.caravanDurability < this.state.caravanMaxDurability / 2;
          const drawCount = isBelowHalf ? 2 : 1;
          DeckManager.drawCards(char, drawCount);
          this.log(`  应急方案：商队耐久${isBelowHalf ? '低于' : '不低于'}一半，抽 ${drawCount} 张牌`);
          this.log(`  当前手牌: ${char.hand.map(c => c.name).join(', ')}`);
        } else {
          DeckManager.drawCards(char, effect.value);
          this.log(`  ${char.def.name} 抽了 ${effect.value} 张牌`);
          this.log(`  当前手牌: ${char.hand.map(c => c.name).join(', ')}`);
        }
        break;
        
      case 'add_action':
        this.state.actionPoints += effect.value;
        this.log(`  获得 ${effect.value} 点额外行动力`);
        this.log(`  行动力: ${this.state.actionPoints}`);
        break;
        
      case 'special':
        // 压制：敌人下次攻击伤害减少4点
        if (targetEnemyIndex !== null && card.id === 'sharpshooter_suppress') {
          const enemy = this.state.enemies[targetEnemyIndex];
          if (enemy) {
            enemy.suppressedDamage = 4;
            this.log(`  压制：${enemy.def.name} 下次攻击伤害减少 4 点`);
          }
        }
        // 精准射击特殊效果
        if (targetEnemyIndex !== null && card.id === 'sharpshooter_precise_shot') {
          const enemy = this.state.enemies[targetEnemyIndex];
          if (enemy && enemy.marks > 0) {
            enemy.marks -= 1;
            this.log(`  精准射击：移除 1 层标记`);
          }
        }
        break;
    }
  }
  
  // 对敌人造成伤害
  private dealDamageToEnemy(enemy: EnemyState, damage: number): void {
    // 先扣护甲
    if (enemy.armor > 0) {
      const absorbed = Math.min(enemy.armor, damage);
      enemy.armor -= absorbed;
      damage -= absorbed;
      if (absorbed > 0) this.log(`  ${enemy.def.name} 护甲吸收 ${absorbed} 点伤害`);
    }
    
    // 扣生命
    enemy.currentHp = Math.max(0, enemy.currentHp - damage);
    this.log(`  ${enemy.def.name} 受到 ${damage} 点伤害，剩余 ${enemy.currentHp}/${enemy.def.maxHp}`);
    
    if (enemy.currentHp <= 0) {
      this.log(`  ${enemy.def.name} 被击败！`);
    }
  }
  
  // 结束玩家回合
  endTurn(): void {
    this.log(`--- 玩家回合结束 ---`);
    
    // 敌人行动
    this.enemyTurn();
    
    // 检查战斗结束
    if (this.checkBattleEnd()) {
      return;
    }
    
    // 进入下一回合
    this.state.turn++;
    this.state.actionPoints = this.state.maxActionPoints;
    
    // 清空所有角色护甲
    for (const char of this.state.characters) {
      char.armor = 0;
    }
    for (const enemy of this.state.enemies) {
      enemy.armor = 0;
    }
    
    // 每个角色弃牌并抽新牌
    for (const char of this.state.characters) {
      if (char.currentHp > 0) {
        const beforeCount = char.hand.length;
        DeckManager.discardHand(char);
        DeckManager.drawCards(char, 2);
        this.log(`${char.def.name} 回合开始，弃${beforeCount}牌，抽2张`);
        this.log(`  手牌: ${char.hand.map(c => c.name).join(', ')}`);
      }
    }
    
    // 更新敌人意图
    this.updateEnemyIntents();
    
    this.log(`=== 第 ${this.state.turn} 回合开始 ===`);
    this.log(`行动力: ${this.state.actionPoints}/${this.state.maxActionPoints}`);
    this.log(`商队耐久: ${this.state.caravanDurability}/${this.state.caravanMaxDurability}`);
  }
  
  // 敌人回合
  private enemyTurn(): void {
    for (const enemy of this.state.enemies) {
      if (enemy.currentHp <= 0 || !enemy.nextAction) continue;
      
      const action = enemy.nextAction;
      this.log(`${enemy.def.name} 行动: ${action.name}`);
      
      // 计算实际伤害（考虑压制）
      let actualDamage = action.damage || 0;
      if (enemy.suppressedDamage > 0) {
        const suppressedAmount = Math.min(enemy.suppressedDamage, actualDamage);
        actualDamage -= suppressedAmount;
        this.log(`  压制生效：伤害减少 ${suppressedAmount} 点`);
        enemy.suppressedDamage = 0; // 消耗压制效果
      }
      
      // 如果是攻击商队
      if (action.target === 'caravan' && actualDamage > 0) {
        let damage = actualDamage;
        
        // 先扣商队护甲
        if (this.state.caravanArmor > 0) {
          const absorbed = Math.min(this.state.caravanArmor, damage);
          this.state.caravanArmor -= absorbed;
          damage -= absorbed;
          if (absorbed > 0) this.log(`  商队护甲吸收 ${absorbed} 点`);
        }
        
        // 扣商队耐久
        this.state.caravanDurability = Math.max(0, this.state.caravanDurability - damage);
        this.log(`  商队受到 ${damage} 点伤害`);
        this.log(`  商队耐久: ${this.state.caravanDurability}/${this.state.caravanMaxDurability}`);
        continue;
      }
      
      // 攻击角色
      if (actualDamage > 0) {
        let targetChar: CharacterState | null = null;
        
        if (action.target === 'random_character') {
          const aliveChars = this.state.characters.filter(c => c.currentHp > 0);
          if (aliveChars.length > 0) {
            targetChar = aliveChars[Math.floor(Math.random() * aliveChars.length)];
          }
        } else if (action.target === 'lowest_hp_character') {
          let lowestHp = Infinity;
          for (const c of this.state.characters) {
            if (c.currentHp > 0 && c.currentHp < lowestHp) {
              lowestHp = c.currentHp;
              targetChar = c;
            }
          }
        }
        
        if (targetChar) {
          let damage = actualDamage;
          
          // 先扣护甲
          if (targetChar.armor > 0) {
            const absorbed = Math.min(targetChar.armor, damage);
            targetChar.armor -= absorbed;
            damage -= absorbed;
            if (absorbed > 0) this.log(`  ${targetChar.def.name} 护甲吸收 ${absorbed} 点`);
          }
          
          // 扣生命
          targetChar.currentHp = Math.max(0, targetChar.currentHp - damage);
          this.log(`  ${enemy.def.name} 对 ${targetChar.def.name} 造成 ${actualDamage} 点伤害`);
          this.log(`  ${targetChar.def.name} 剩余 ${targetChar.currentHp}/${targetChar.def.maxHp} HP`);
          
          // 角色倒下
          if (targetChar.currentHp <= 0) {
            this.log(`  ${targetChar.def.name} 倒下了！`);
          }
        }
      }
    }
  }
  
  // 检查战斗结束
  private checkBattleEnd(): boolean {
    // 检查是否所有敌人都被击败
    const allEnemiesDead = this.state.enemies.every(e => e.currentHp <= 0);
    if (allEnemiesDead) {
      this.log('=============================');
      this.log('       战 斗 胜 利 ！');
      this.log('=============================');
      if (this.onBattleEnd) {
        this.onBattleEnd(true);
      }
      return true;
    }
    
    // 检查是否所有角色都倒下
    const allCharsDown = this.state.characters.every(c => c.currentHp <= 0);
    if (allCharsDown) {
      this.log('=============================');
      this.log('       战 斗 失 败 ...');
      this.log('       所有角色倒下');
      this.log('=============================');
      if (this.onBattleEnd) {
        this.onBattleEnd(false);
      }
      return true;
    }
    
    // 检查商队耐久
    if (this.state.caravanDurability <= 0) {
      this.log('=============================');
      this.log('       战 斗 失 败 ...');
      this.log('       商队被摧毁');
      this.log('=============================');
      if (this.onBattleEnd) {
        this.onBattleEnd(false);
      }
      return true;
    }
    
    return false;
  }
  
  // 添加日志
  private log(message: string): void {
    this.logs.push(message);
    console.log(`[战斗] ${message}`);
  }
  
  // 获取可用的角色（用于UI显示）
  getActiveCharacters(): CharacterState[] {
    return this.state.characters.filter(c => c.currentHp > 0);
  }
  
  // 获取存活的敌人
  getAliveEnemies(): EnemyState[] {
    return this.state.enemies.filter(e => e.currentHp > 0);
  }
}
