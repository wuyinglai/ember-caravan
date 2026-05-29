import { BattleState, CharacterState, EnemyState, CardDef, CardEffect } from '../data/types';
import { DeckManager } from './DeckManager';
import { getEnemyNextAction } from '../data/enemies';

export class BattleManager {
  state: BattleState;
  private selectedCard: { charIndex: number; cardIndex: number } | null = null;
  private selectedEnemy: number | null = null;
  private onBattleEnd: ((victory: boolean) => void) | null = null;
  
  // 战斗日志
  logs: string[] = [];
  
  constructor(
    characters: CharacterState[],
    enemies: EnemyState[],
    onBattleEnd?: (victory: boolean) => void
  ) {
    this.state = {
      characters: characters,
      enemies: enemies,
      actionPoints: 3,
      maxActionPoints: 3,
      turn: 1,
      caravanArmor: 0,
      morale: 3,
    };
    
    if (onBattleEnd) {
      this.onBattleEnd = onBattleEnd;
    }
    
    this.logs = [];
  }
  
  // 开始战斗
  startBattle(): void {
    this.log('战斗开始！');
    
    // 初始化每个角色的牌组
    for (const char of this.state.characters) {
      if (!char.isWounded && !char.isDead) {
        DeckManager.initCharacterDeck(char);
        this.log(`${char.def.name}加入战斗`);
      }
    }
    
    // 设置敌人初始意图
    this.updateEnemyIntents();
    
    this.log(`第${this.state.turn}回合开始`);
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
    if (!char || char.isWounded || char.isDead) return false;
    
    const card = char.hand[cardIndex];
    if (!card) return false;
    
    if (card.cost > this.state.actionPoints) {
      this.log('行动力不足！');
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
    
    // 从手牌移除
    DeckManager.playCard(char, cardIndex);
    
    // 执行效果
    this.executeCardEffects(char, card, this.selectedEnemy);
    
    this.log(`${char.def.name}使用了【${card.name}】`);
    
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
      this.executeEffect(char, effect, targetEnemyIndex);
    }
  }
  
  // 执行单个效果
  private executeEffect(char: CharacterState, effect: CardEffect, targetEnemyIndex: number | null): void {
    switch (effect.type) {
      case 'damage':
        if (targetEnemyIndex !== null) {
          const enemy = this.state.enemies[targetEnemyIndex];
          if (enemy && enemy.currentHp > 0) {
            let damage = effect.value;
            // 检查标记加成（射手被动）
            if (char.def.id === 'sharpshooter' && enemy.marks > 0) {
              damage += 2;
              this.log('射手被动触发：标记加成+2伤害');
            }
            this.dealDamageToEnemy(enemy, damage);
          }
        }
        break;
        
      case 'armor':
        if (effect.target === 'self') {
          char.armor += effect.value;
          this.log(`${char.def.name}获得${effect.value}点护甲`);
          
          // 护路人被动：第一次获得护甲时，商队也获得2点护甲
          if (char.def.id === 'guardian' && this.state.turn === 1 && this.state.caravanArmor === 0) {
            this.state.caravanArmor += 2;
            this.log('护路人被动：商队获得2点护甲');
          }
        } else if (effect.target === 'all_allies') {
          for (const c of this.state.characters) {
            if (!c.isWounded && !c.isDead) {
              c.armor += effect.value;
            }
          }
          this.log(`全队获得${effect.value}点护甲`);
        }
        break;
        
      case 'heal':
        if (effect.target === 'ally') {
          // 治疗生命最低的队友
          let lowestHpChar: CharacterState | null = null;
          for (const c of this.state.characters) {
            if (!c.isWounded && !c.isDead && c.currentHp < c.def.maxHp) {
              if (!lowestHpChar || c.currentHp < lowestHpChar.currentHp) {
                lowestHpChar = c;
              }
            }
          }
          if (lowestHpChar) {
            lowestHpChar.currentHp = Math.min(lowestHpChar.def.maxHp, lowestHpChar.currentHp + effect.value);
            this.log(`${lowestHpChar.def.name}恢复${effect.value}点生命`);
          }
        }
        break;
        
      case 'mark':
        if (targetEnemyIndex !== null) {
          const enemy = this.state.enemies[targetEnemyIndex];
          if (enemy) {
            enemy.marks += effect.value;
            this.log(`${enemy.def.name}获得${effect.value}层标记`);
          }
        }
        break;
        
      case 'repair_caravan':
        // 简化处理：阶段1先不实现商队耐久系统
        this.log('商队耐久系统将在后续阶段实现');
        break;
        
      case 'draw':
        DeckManager.drawCards(char, effect.value);
        this.log(`${char.def.name}抽了${effect.value}张牌`);
        break;
        
      case 'add_action':
        this.state.actionPoints += effect.value;
        this.log(`获得${effect.value}点额外行动力`);
        break;
        
      case 'morale':
        this.state.morale += effect.value;
        this.log(`士气${effect.value > 0 ? '+' : ''}${effect.value}`);
        break;
        
      case 'special':
        // 特殊效果简化处理
        this.log('特殊效果触发');
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
    }
    
    // 扣生命
    enemy.currentHp = Math.max(0, enemy.currentHp - damage);
    this.log(`${enemy.def.name}受到${damage}点伤害`);
    
    if (enemy.currentHp <= 0) {
      this.log(`${enemy.def.name}被击败！`);
    }
  }
  
  // 结束回合
  endTurn(): void {
    this.log('玩家回合结束');
    
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
      if (!char.isWounded && !char.isDead) {
        DeckManager.discardHand(char);
        DeckManager.drawCards(char, 2);
      }
    }
    
    // 更新敌人意图
    this.updateEnemyIntents();
    
    this.log(`第${this.state.turn}回合开始`);
  }
  
  // 敌人回合
  private enemyTurn(): void {
    for (const enemy of this.state.enemies) {
      if (enemy.currentHp <= 0 || !enemy.nextAction) continue;
      
      const action = enemy.nextAction;
      
      if (action.damage && action.damage > 0) {
        // 确定目标
        let targetChar: CharacterState | null = null;
        
        if (action.target === 'random_character') {
          const availableChars = this.state.characters.filter(c => !c.isWounded && !c.isDead);
          if (availableChars.length > 0) {
            targetChar = availableChars[Math.floor(Math.random() * availableChars.length)];
          }
        } else if (action.target === 'lowest_hp_character') {
          let lowestHp = Infinity;
          for (const c of this.state.characters) {
            if (!c.isWounded && !c.isDead && c.currentHp < lowestHp) {
              lowestHp = c.currentHp;
              targetChar = c;
            }
          }
        }
        
        if (targetChar) {
          // 造成伤害
          let damage = action.damage;
          
          // 先扣护甲
          if (targetChar.armor > 0) {
            const absorbed = Math.min(targetChar.armor, damage);
            targetChar.armor -= absorbed;
            damage -= absorbed;
          }
          
          // 扣生命
          targetChar.currentHp = Math.max(0, targetChar.currentHp - damage);
          this.log(`${enemy.def.name}的${action.name}对${targetChar.def.name}造成${action.damage}点伤害`);
          
          // 检查角色是否重伤
          if (targetChar.currentHp <= 0 && !targetChar.isWounded) {
            this.applyGraveWound(targetChar);
          }
        }
      }
    }
  }
  
  // 应用重伤
  private applyGraveWound(char: CharacterState): void {
    char.isWounded = true;
    char.graveWounds++;
    char.currentHp = 1;
    char.restNodes = 3;
    
    this.log(`${char.def.name}重伤！需要休息3个节点`);
    
    if (char.graveWounds >= 3) {
      char.isDead = true;
      this.log(`${char.def.name}本局死亡/离队`);
    }
  }
  
  // 检查战斗结束
  private checkBattleEnd(): boolean {
    // 检查是否所有敌人都被击败
    const allEnemiesDead = this.state.enemies.every(e => e.currentHp <= 0);
    if (allEnemiesDead) {
      this.log('战斗胜利！');
      if (this.onBattleEnd) {
        this.onBattleEnd(true);
      }
      return true;
    }
    
    // 检查是否所有角色都重伤或死亡
    const allCharsDown = this.state.characters.every(c => c.isWounded || c.isDead);
    if (allCharsDown) {
      this.log('战斗失败...');
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
    return this.state.characters.filter(c => !c.isWounded && !c.isDead);
  }
  
  // 获取存活的敌人
  getAliveEnemies(): EnemyState[] {
    return this.state.enemies.filter(e => e.currentHp > 0);
  }
}
