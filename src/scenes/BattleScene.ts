import Phaser from 'phaser';
import { BattleManager } from '../systems/BattleManager';
import { createCharacterState } from '../data/characters';
import { createEnemyState } from '../data/enemies';
import { CharacterState, EnemyState, CardDef } from '../data/types';

export class BattleScene extends Phaser.Scene {
  private battleManager!: BattleManager;
  
  // UI元素
  private characterPanels: Phaser.GameObjects.Container[] = [];
  private enemyPanels: Phaser.GameObjects.Container[] = [];
  private cardTexts: Phaser.GameObjects.Text[] = [];
  private actionPointText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private caravanText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private endTurnBtn!: Phaser.GameObjects.Text;
  private restartBtn!: Phaser.GameObjects.Text;
  
  // 状态
  private selectedCard: { charIndex: number; cardIndex: number } | null = null;
  private selectedEnemy: number | null = null;
  private battleEnded: boolean = false;
  
  constructor() {
    super({ key: 'BattleScene' });
  }
  
  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    
    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRect(0, 0, w, h);
    
    // 创建测试队伍（3个角色）
    const characters = [
      createCharacterState('guardian'),
      createCharacterState('sharpshooter'),
      createCharacterState('repairman'),
    ];
    
    // 固定测试敌人：1个荒原强盗 + 1个野兽
    const enemies = [
      createEnemyState('bandit'),
      createEnemyState('beast'),
    ];
    
    // 创建战斗管理器
    this.battleManager = new BattleManager(characters, enemies, (victory) => {
      this.onBattleEnd(victory);
    });
    
    // 开始战斗
    this.battleManager.startBattle();
    
    // 创建UI
    this.createUI();
    
    // 键盘快捷键
    this.input.keyboard?.on('keydown-E', () => this.endTurn());
    this.input.keyboard?.on('keydown-ENTER', () => this.endTurn());
    this.input.keyboard?.on('keydown-R', () => this.restart());
    
    console.log('[余烬商队] 阶段1战斗原型初始化完成');
    console.log('敌人: 荒原强盗(24HP) + 野兽(20HP)');
  }
  
  private createUI(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    
    // 顶部信息栏
    this.turnText = this.add.text(w / 2, 16, `第 ${this.battleManager.state.turn} 回合`, {
      fontSize: '20px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    
    this.actionPointText = this.add.text(w / 2, 44, `⚡ 行动力: ${this.battleManager.state.actionPoints}/${this.battleManager.state.maxActionPoints}`, {
      fontSize: '18px', color: '#ffcc00', fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
    
    // 商队状态（顶部中央下方）
    this.caravanText = this.add.text(w / 2, 72, `🚗 商队耐久: ${this.battleManager.state.caravanDurability}/${this.battleManager.state.caravanMaxDurability}`, {
      fontSize: '16px', color: '#88cc88', fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
    
    // 角色面板（左侧）
    this.createCharacterPanels();
    
    // 敌人面板（右侧）
    this.createEnemyPanels();
    
    // 手牌区域（底部）
    this.createHandArea();
    
    // 结束回合按钮
    this.endTurnBtn = this.add.text(w - 20, h - 60, '【结束回合】(E)', {
      fontSize: '16px', color: '#ffffff', backgroundColor: '#336633',
      padding: { x: 16, y: 8 }, fontFamily: 'monospace',
    }).setOrigin(1, 0).setInteractive();
    
    this.endTurnBtn.on('pointerdown', () => this.endTurn());
    this.endTurnBtn.on('pointerover', () => this.endTurnBtn.setStyle({ backgroundColor: '#447744' }));
    this.endTurnBtn.on('pointerout', () => this.endTurnBtn.setStyle({ backgroundColor: '#336633' }));
    
    // 重新开始按钮
    this.restartBtn = this.add.text(w - 20, h - 100, '【重新开始】(R)', {
      fontSize: '14px', color: '#aaaaaa', backgroundColor: '#333333',
      padding: { x: 12, y: 6 }, fontFamily: 'monospace',
    }).setOrigin(1, 0).setInteractive();
    
    this.restartBtn.on('pointerdown', () => this.restart());
    this.restartBtn.on('pointerover', () => this.restartBtn.setStyle({ backgroundColor: '#444444' }));
    this.restartBtn.on('pointerout', () => this.restartBtn.setStyle({ backgroundColor: '#333333' }));
    
    // 战斗日志
    this.logText = this.add.text(20, h - 160, '', {
      fontSize: '11px', color: '#88aa88', fontFamily: 'monospace',
      lineSpacing: 3,
    });
    
    // 操作提示
    this.add.text(20, h - 190, '操作：点击手牌选择 → 点击敌人目标 → 再次点击手牌出牌', {
      fontSize: '11px', color: '#666666', fontFamily: 'monospace',
    });
    
    this.updateUI();
  }
  
  private createCharacterPanels(): void {
    const chars = this.battleManager.state.characters;
    const startY = 110;
    const spacing = 80;
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const panel = this.add.container(20, startY + i * spacing);
      
      // 背景框
      const bg = this.add.graphics();
      bg.fillStyle(char.def.color, 0.15);
      bg.fillRect(0, 0, 200, 70);
      bg.lineStyle(2, char.def.color, 1);
      bg.strokeRect(0, 0, 200, 70);
      panel.add(bg);
      
      // 角色名
      const nameText = this.add.text(10, 8, `${char.def.icon} ${char.def.name}`, {
        fontSize: '15px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
      });
      panel.add(nameText);
      
      // 生命值
      const hpText = this.add.text(10, 30, `❤️ ${char.currentHp}/${char.def.maxHp}`, {
        fontSize: '14px', color: '#ff6666', fontFamily: 'monospace',
      });
      panel.add(hpText);
      
      // 护甲
      const armorText = this.add.text(100, 30, `🛡️ ${char.armor}`, {
        fontSize: '14px', color: '#6688ff', fontFamily: 'monospace',
      });
      panel.add(armorText);
      
      // 状态
      if (char.currentHp <= 0) {
        const statusText = this.add.text(10, 50, '💀 已倒下', {
          fontSize: '12px', color: '#ff4444', fontFamily: 'monospace',
        });
        panel.add(statusText);
      }
      
      this.characterPanels.push(panel);
    }
  }
  
  private createEnemyPanels(): void {
    const enemies = this.battleManager.state.enemies;
    const w = this.scale.width;
    const startY = 110;
    const spacing = 120;
    
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      const panel = this.add.container(w - 220, startY + i * spacing);
      
      // 背景框
      const bg = this.add.graphics();
      bg.fillStyle(enemy.def.color, 0.15);
      bg.fillRect(0, 0, 200, 100);
      bg.lineStyle(2, enemy.def.color, 1);
      bg.strokeRect(0, 0, 200, 100);
      panel.add(bg);
      
      // 敌人名
      const nameText = this.add.text(10, 8, `${enemy.def.icon} ${enemy.def.name}`, {
        fontSize: '15px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
      });
      panel.add(nameText);
      
      // 生命值
      const hpText = this.add.text(10, 30, `❤️ ${enemy.currentHp}/${enemy.def.maxHp}`, {
        fontSize: '14px', color: '#ff6666', fontFamily: 'monospace',
      });
      panel.add(hpText);
      
      // 护甲
      const armorText = this.add.text(10, 50, `🛡️ ${enemy.armor}`, {
        fontSize: '14px', color: '#6688ff', fontFamily: 'monospace',
      });
      panel.add(armorText);
      
      // 标记
      if (enemy.marks > 0) {
        const markText = this.add.text(100, 50, `👁️ ${enemy.marks}层`, {
          fontSize: '14px', color: '#ffaa00', fontFamily: 'monospace',
        });
        panel.add(markText);
      }
      
      // 意图
      if (enemy.nextAction) {
        const intentColor = enemy.nextAction.target === 'caravan' ? '#88cc88' : '#ff8866';
        const intentText = this.add.text(10, 72, `👉 ${enemy.nextAction.name}`, {
          fontSize: '12px', color: intentColor, fontFamily: 'monospace',
        });
        panel.add(intentText);
      }
      
      // 点击选择敌人
      if (enemy.currentHp > 0) {
        const hitArea = this.add.zone(100, 50, 200, 100).setInteractive();
        hitArea.on('pointerdown', () => this.onEnemyClick(i));
        panel.add(hitArea);
      }
      
      this.enemyPanels.push(panel);
    }
  }
  
  private createHandArea(): void {
    this.updateHandDisplay();
  }
  
  private updateHandDisplay(): void {
    // 清除旧的手牌显示
    this.cardTexts.forEach(t => t.destroy());
    this.cardTexts = [];
    
    const w = this.scale.width;
    const h = this.scale.height;
    const chars = this.battleManager.state.characters;
    
    let cardX = 240;
    const cardY = h - 80;
    const cardSpacing = 120;
    
    for (let charIndex = 0; charIndex < chars.length; charIndex++) {
      const char = chars[charIndex];
      if (char.currentHp <= 0) continue;
      
      // 角色分隔线
      if (charIndex > 0) {
        // 检查前面是否有存活的角色
        let hasPrevAlive = false;
        for (let j = 0; j < charIndex; j++) {
          if (chars[j].currentHp > 0) hasPrevAlive = true;
        }
      }
      
      for (let cardIndex = 0; cardIndex < char.hand.length; cardIndex++) {
        const card = char.hand[cardIndex];
        const isSelected = this.selectedCard?.charIndex === charIndex && 
                           this.selectedCard?.cardIndex === cardIndex;
        
        const canPlay = card.cost <= this.battleManager.state.actionPoints;
        const cardText = this.createCardText(cardX, cardY, card, char.def.color, isSelected, canPlay);
        
        // 点击事件
        cardText.setInteractive();
        cardText.on('pointerdown', () => this.onCardClick(charIndex, cardIndex));
        cardText.on('pointerover', () => {
          if (!isSelected && canPlay) cardText.setStyle({ backgroundColor: '#3a3a5a' });
        });
        cardText.on('pointerout', () => {
          if (!isSelected) cardText.setStyle({ backgroundColor: canPlay ? '#2a2a4a' : '#1a1a2a' });
        });
        
        this.cardTexts.push(cardText);
        cardX += cardSpacing;
      }
    }
  }
  
  private createCardText(x: number, y: number, card: CardDef, charColor: number, isSelected: boolean, canPlay: boolean): Phaser.GameObjects.Text {
    const bgColor = isSelected ? '#555588' : (canPlay ? '#2a2a4a' : '#1a1a2a');
    const textColor = canPlay ? '#ffffff' : '#666666';
    const borderColor = isSelected ? '#ffff00' : (canPlay ? '#' + charColor.toString(16).padStart(6, '0') : '#333333');
    
    // 简化描述显示
    const shortDesc = card.description.length > 15 ? card.description.slice(0, 15) + '...' : card.description;
    
    const text = this.add.text(x, y, 
      `[${card.cost}] ${card.name}\n${shortDesc}`, {
      fontSize: '12px', color: textColor,
      backgroundColor: bgColor,
      padding: { x: 8, y: 6 },
      align: 'center',
      fontFamily: 'monospace',
      lineSpacing: 4,
    }).setOrigin(0.5);
    
    return text;
  }
  
  private onCardClick(charIndex: number, cardIndex: number): void {
    if (this.battleEnded) return;
    
    // 如果已经选了这张牌，尝试出牌
    if (this.selectedCard?.charIndex === charIndex && 
        this.selectedCard?.cardIndex === cardIndex) {
      this.tryPlayCard();
      return;
    }
    
    // 选择这张牌
    if (this.battleManager.selectCard(charIndex, cardIndex)) {
      this.selectedCard = { charIndex, cardIndex };
      this.updateHandDisplay();
      console.log(`[选择] ${this.battleManager.state.characters[charIndex].def.name} 选择了【${this.battleManager.state.characters[charIndex].hand[cardIndex]?.name || '未知'}】`);
    }
  }
  
  private onEnemyClick(enemyIndex: number): void {
    if (this.battleEnded) return;
    
    if (this.battleManager.selectEnemy(enemyIndex)) {
      this.selectedEnemy = enemyIndex;
      console.log(`[选择] 目标: ${this.battleManager.state.enemies[enemyIndex].def.name}`);
      
      // 如果已经选了牌，尝试出牌
      if (this.selectedCard) {
        this.tryPlayCard();
      }
    }
  }
  
  private tryPlayCard(): void {
    if (this.battleManager.playCard()) {
      this.selectedCard = null;
      this.selectedEnemy = null;
      this.updateUI();
    }
  }
  
  private endTurn(): void {
    if (this.battleEnded) return;
    
    this.selectedCard = null;
    this.selectedEnemy = null;
    this.battleManager.endTurn();
    this.updateUI();
  }
  
  private restart(): void {
    this.scene.restart();
  }
  
  private updateUI(): void {
    // 更新回合和行动力
    this.turnText.setText(`第 ${this.battleManager.state.turn} 回合`);
    this.actionPointText.setText(`⚡ 行动力: ${this.battleManager.state.actionPoints}/${this.battleManager.state.maxActionPoints}`);
    
    // 更新商队状态
    const dur = this.battleManager.state.caravanDurability;
    const maxDur = this.battleManager.state.caravanMaxDurability;
    const caravanColor = dur < maxDur * 0.3 ? '#ff4444' : (dur < maxDur * 0.6 ? '#ffaa44' : '#88cc88');
    this.caravanText.setText(`🚗 商队耐久: ${dur}/${maxDur}`);
    this.caravanText.setStyle({ color: caravanColor });
    
    // 更新角色面板
    for (let i = 0; i < this.characterPanels.length; i++) {
      this.updateCharacterPanel(i);
    }
    
    // 更新敌人面板
    for (let i = 0; i < this.enemyPanels.length; i++) {
      this.updateEnemyPanel(i);
    }
    
    // 更新手牌
    this.updateHandDisplay();
    
    // 更新日志（显示最后8条）
    const recentLogs = this.battleManager.logs.slice(-8);
    this.logText.setText(recentLogs.join('\n'));
  }
  
  private updateCharacterPanel(index: number): void {
    const panel = this.characterPanels[index];
    const char = this.battleManager.state.characters[index];
    
    // 清除旧文本
    panel.each((child) => {
      if (child instanceof Phaser.GameObjects.Text) {
        child.destroy();
      }
    });
    
    // 角色名
    const nameText = this.add.text(10, 8, `${char.def.icon} ${char.def.name}`, {
      fontSize: '15px', color: char.currentHp > 0 ? '#ffffff' : '#666666', fontFamily: 'monospace', fontStyle: 'bold',
    });
    panel.add(nameText);
    
    // 生命值
    const hpColor = char.currentHp > char.def.maxHp * 0.5 ? '#ff6666' : (char.currentHp > 0 ? '#ffaa44' : '#666666');
    const hpText = this.add.text(10, 30, `❤️ ${char.currentHp}/${char.def.maxHp}`, {
      fontSize: '14px', color: hpColor, fontFamily: 'monospace',
    });
    panel.add(hpText);
    
    // 护甲
    const armorText = this.add.text(100, 30, `🛡️ ${char.armor}`, {
      fontSize: '14px', color: '#6688ff', fontFamily: 'monospace',
    });
    panel.add(armorText);
    
    // 状态
    if (char.currentHp <= 0) {
      const statusText = this.add.text(10, 50, '💀 已倒下', {
        fontSize: '12px', color: '#ff4444', fontFamily: 'monospace',
      });
      panel.add(statusText);
    }
  }
  
  private updateEnemyPanel(index: number): void {
    const panel = this.enemyPanels[index];
    const enemy = this.battleManager.state.enemies[index];
    
    // 清除旧文本
    panel.each((child) => {
      if (child instanceof Phaser.GameObjects.Text) {
        child.destroy();
      }
    });
    
    // 敌人名
    const nameText = this.add.text(10, 8, `${enemy.def.icon} ${enemy.def.name}`, {
      fontSize: '15px', color: enemy.currentHp > 0 ? '#ffffff' : '#666666', fontFamily: 'monospace', fontStyle: 'bold',
    });
    panel.add(nameText);
    
    // 生命值
    const hpColor = enemy.currentHp > enemy.def.maxHp * 0.5 ? '#ff6666' : (enemy.currentHp > 0 ? '#ffaa44' : '#666666');
    const hpText = this.add.text(10, 30, `❤️ ${enemy.currentHp}/${enemy.def.maxHp}`, {
      fontSize: '14px', color: hpColor, fontFamily: 'monospace',
    });
    panel.add(hpText);
    
    // 护甲
    const armorText = this.add.text(10, 50, `🛡️ ${enemy.armor}`, {
      fontSize: '14px', color: '#6688ff', fontFamily: 'monospace',
    });
    panel.add(armorText);
    
    // 标记
    if (enemy.marks > 0) {
      const markText = this.add.text(100, 50, `👁️ ${enemy.marks}层`, {
        fontSize: '14px', color: '#ffaa00', fontFamily: 'monospace',
      });
      panel.add(markText);
    }
    
    // 意图
    if (enemy.nextAction && enemy.currentHp > 0) {
      const intentColor = enemy.nextAction.target === 'caravan' ? '#88cc88' : '#ff8866';
      const intentText = this.add.text(10, 72, `👉 ${enemy.nextAction.name}`, {
        fontSize: '12px', color: intentColor, fontFamily: 'monospace',
      });
      panel.add(intentText);
    }
    
    // 已死亡
    if (enemy.currentHp <= 0) {
      const deadText = this.add.text(10, 72, '💀 已击败', {
        fontSize: '12px', color: '#666666', fontFamily: 'monospace',
      });
      panel.add(deadText);
    }
  }
  
  private onBattleEnd(victory: boolean): void {
    this.battleEnded = true;
    
    const w = this.scale.width;
    const h = this.scale.height;
    
    // 遮罩
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, w, h);
    
    // 显示结果
    const resultText = this.add.text(w / 2, h / 2 - 40, 
      victory ? '🎉 战 斗 胜 利 🎉' : '💀 战 斗 失 败 💀', {
      fontSize: '36px', color: victory ? '#44ff44' : '#ff4444',
      fontStyle: 'bold', fontFamily: 'monospace',
    }).setOrigin(0.5);
    
    // 结果说明
    const resultDesc = this.add.text(w / 2, h / 2 + 10, 
      victory ? '所有敌人被击败！' : '队伍全灭或商队被摧毁！', {
      fontSize: '16px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setOrigin(0.5);
    
    // 重新开始提示
    this.add.text(w / 2, h / 2 + 50, '按 R 或点击下方按钮重新开始', {
      fontSize: '14px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5);
    
    // 重新开始按钮
    const btn = this.add.text(w / 2, h / 2 + 90, '【重新开始】', {
      fontSize: '18px', color: '#ffffff', backgroundColor: '#444466',
      padding: { x: 20, y: 10 }, fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive();
    
    btn.on('pointerdown', () => this.restart());
    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#555577' }));
    btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#444466' }));
  }
}
