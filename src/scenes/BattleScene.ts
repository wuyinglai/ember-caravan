import Phaser from 'phaser';
import { BattleManager } from '../systems/BattleManager';
import { createCharacterState, CharacterId } from '../data/characters';
import { createEnemyState, generateNormalEnemies } from '../data/enemies';
import { CharacterState, EnemyState, CardDef } from '../data/types';

export class BattleScene extends Phaser.Scene {
  private battleManager!: BattleManager;
  
  // UI元素
  private characterPanels: Phaser.GameObjects.Container[] = [];
  private enemyPanels: Phaser.GameObjects.Container[] = [];
  private cardTexts: Phaser.GameObjects.Text[] = [];
  private actionPointText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private endTurnBtn!: Phaser.GameObjects.Text;
  
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
    const characters: CharacterState[] = [
      createCharacterState('guardian'),
      createCharacterState('sharpshooter'),
      createCharacterState('repairman'),
    ];
    
    // 创建敌人
    const enemyIds = generateNormalEnemies();
    const enemies: EnemyState[] = enemyIds.map(id => createEnemyState(id));
    
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
    
    console.log('[余烬商队] 战斗场景初始化完成');
  }
  
  private createUI(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    
    // 顶部信息栏
    this.turnText = this.add.text(w / 2, 16, `第 ${this.battleManager.state.turn} 回合`, {
      fontSize: '20px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
    
    this.actionPointText = this.add.text(w / 2, 44, `⚡ 行动力: ${this.battleManager.state.actionPoints}/${this.battleManager.state.maxActionPoints}`, {
      fontSize: '18px', color: '#ffcc00', fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
    
    // 角色面板（左侧）
    this.createCharacterPanels();
    
    // 敌人面板（右侧）
    this.createEnemyPanels();
    
    // 手牌区域（底部）
    this.createHandArea();
    
    // 结束回合按钮
    this.endTurnBtn = this.add.text(w - 20, h - 40, '结束回合 (E)', {
      fontSize: '16px', color: '#ffffff', backgroundColor: '#444444',
      padding: { x: 12, y: 6 }, fontFamily: 'monospace',
    }).setOrigin(1, 1).setInteractive();
    
    this.endTurnBtn.on('pointerdown', () => this.endTurn());
    this.endTurnBtn.on('pointerover', () => this.endTurnBtn.setStyle({ backgroundColor: '#666666' }));
    this.endTurnBtn.on('pointerout', () => this.endTurnBtn.setStyle({ backgroundColor: '#444444' }));
    
    // 战斗日志
    this.logText = this.add.text(20, h - 120, '', {
      fontSize: '12px', color: '#aaaaaa', fontFamily: 'monospace',
      lineSpacing: 4,
    });
    
    // 操作提示
    this.add.text(20, h - 150, '操作：点击手牌选择 → 点击敌人目标 → 点击手牌出牌', {
      fontSize: '12px', color: '#888888', fontFamily: 'monospace',
    });
    
    this.updateUI();
  }
  
  private createCharacterPanels(): void {
    const chars = this.battleManager.state.characters;
    const startY = 100;
    const spacing = 90;
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const panel = this.add.container(20, startY + i * spacing);
      
      // 背景框
      const bg = this.add.graphics();
      bg.fillStyle(char.def.color, 0.2);
      bg.fillRect(0, 0, 180, 80);
      bg.lineStyle(2, char.def.color, 1);
      bg.strokeRect(0, 0, 180, 80);
      panel.add(bg);
      
      // 角色名
      const nameText = this.add.text(10, 8, `${char.def.icon} ${char.def.name}`, {
        fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
      });
      panel.add(nameText);
      
      // 生命值
      const hpText = this.add.text(10, 28, `❤️ ${char.currentHp}/${char.def.maxHp}`, {
        fontSize: '13px', color: '#ff4444', fontFamily: 'monospace',
      });
      panel.add(hpText);
      
      // 护甲
      const armorText = this.add.text(10, 48, `🛡️ ${char.armor}`, {
        fontSize: '13px', color: '#4488ff', fontFamily: 'monospace',
      });
      panel.add(armorText);
      
      // 状态
      if (char.isWounded) {
        const statusText = this.add.text(100, 28, '💀 重伤', {
          fontSize: '12px', color: '#ff0000', fontFamily: 'monospace',
        });
        panel.add(statusText);
      }
      
      this.characterPanels.push(panel);
    }
  }
  
  private createEnemyPanels(): void {
    const enemies = this.battleManager.state.enemies;
    const w = this.scale.width;
    const startY = 100;
    const spacing = 100;
    
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      const panel = this.add.container(w - 200, startY + i * spacing);
      
      // 背景框
      const bg = this.add.graphics();
      bg.fillStyle(enemy.def.color, 0.2);
      bg.fillRect(0, 0, 180, 90);
      bg.lineStyle(2, enemy.def.color, 1);
      bg.strokeRect(0, 0, 180, 90);
      panel.add(bg);
      
      // 敌人名
      const nameText = this.add.text(10, 8, `${enemy.def.icon} ${enemy.def.name}`, {
        fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
      });
      panel.add(nameText);
      
      // 生命值
      const hpText = this.add.text(10, 28, `❤️ ${enemy.currentHp}/${enemy.def.maxHp}`, {
        fontSize: '13px', color: '#ff4444', fontFamily: 'monospace',
      });
      panel.add(hpText);
      
      // 护甲
      const armorText = this.add.text(10, 46, `🛡️ ${enemy.armor}`, {
        fontSize: '13px', color: '#4488ff', fontFamily: 'monospace',
      });
      panel.add(armorText);
      
      // 标记
      if (enemy.marks > 0) {
        const markText = this.add.text(100, 46, `👁️ ${enemy.marks}`, {
          fontSize: '12px', color: '#ff8800', fontFamily: 'monospace',
        });
        panel.add(markText);
      }
      
      // 意图
      if (enemy.nextAction) {
        const intentText = this.add.text(10, 64, `👉 ${enemy.nextAction.name}`, {
          fontSize: '11px', color: enemy.nextAction.damage ? '#ff6644' : '#66aaff', fontFamily: 'monospace',
        });
        panel.add(intentText);
      }
      
      // 点击选择敌人
      const hitArea = this.add.zone(90, 45, 180, 90).setInteractive();
      hitArea.on('pointerdown', () => this.onEnemyClick(i));
      panel.add(hitArea);
      
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
    
    let cardX = 220;
    const cardY = h - 80;
    const cardSpacing = 110;
    
    for (let charIndex = 0; charIndex < chars.length; charIndex++) {
      const char = chars[charIndex];
      if (char.isWounded || char.isDead) continue;
      
      for (let cardIndex = 0; cardIndex < char.hand.length; cardIndex++) {
        const card = char.hand[cardIndex];
        const isSelected = this.selectedCard?.charIndex === charIndex && 
                           this.selectedCard?.cardIndex === cardIndex;
        
        const cardText = this.createCardText(cardX, cardY, card, char.def.color, isSelected);
        
        // 点击事件
        cardText.setInteractive();
        cardText.on('pointerdown', () => this.onCardClick(charIndex, cardIndex));
        cardText.on('pointerover', () => {
          if (!isSelected) cardText.setStyle({ backgroundColor: '#3a3a5a' });
        });
        cardText.on('pointerout', () => {
          if (!isSelected) cardText.setStyle({ backgroundColor: '#2a2a4a' });
        });
        
        this.cardTexts.push(cardText);
        cardX += cardSpacing;
      }
    }
  }
  
  private createCardText(x: number, y: number, card: CardDef, charColor: number, isSelected: boolean): Phaser.GameObjects.Text {
    const bgColor = isSelected ? '#555588' : '#2a2a4a';
    const borderColor = isSelected ? '#ffff00' : charColor.toString(16).padStart(6, '0');
    
    const text = this.add.text(x, y, 
      `[${card.cost}] ${card.name}\n${card.description.slice(0, 20)}...`, {
      fontSize: '11px', color: '#ffffff',
      backgroundColor: bgColor,
      padding: { x: 6, y: 4 },
      align: 'center',
      fontFamily: 'monospace',
      lineSpacing: 2,
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
      console.log(`选中卡牌: ${this.battleManager.state.characters[charIndex].hand[cardIndex].name}`);
    }
  }
  
  private onEnemyClick(enemyIndex: number): void {
    if (this.battleEnded) return;
    
    if (this.battleManager.selectEnemy(enemyIndex)) {
      this.selectedEnemy = enemyIndex;
      console.log(`选中敌人: ${this.battleManager.state.enemies[enemyIndex].def.name}`);
      
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
  
  private updateUI(): void {
    // 更新回合和行动力
    this.turnText.setText(`第 ${this.battleManager.state.turn} 回合`);
    this.actionPointText.setText(`⚡ 行动力: ${this.battleManager.state.actionPoints}/${this.battleManager.state.maxActionPoints}`);
    
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
    
    // 更新日志
    this.updateLog();
  }
  
  private updateCharacterPanel(index: number): void {
    const panel = this.characterPanels[index];
    const char = this.battleManager.state.characters[index];
    
    // 清除旧文本（保留背景和交互区域）
    panel.each((child) => {
      if (child instanceof Phaser.GameObjects.Text) {
        child.destroy();
      }
    });
    
    // 角色名
    const nameText = this.add.text(10, 8, `${char.def.icon} ${char.def.name}`, {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
    });
    panel.add(nameText);
    
    // 生命值
    const hpText = this.add.text(10, 28, `❤️ ${char.currentHp}/${char.def.maxHp}`, {
      fontSize: '13px', color: '#ff4444', fontFamily: 'monospace',
    });
    panel.add(hpText);
    
    // 护甲
    const armorText = this.add.text(10, 48, `🛡️ ${char.armor}`, {
      fontSize: '13px', color: '#4488ff', fontFamily: 'monospace',
    });
    panel.add(armorText);
    
    // 状态
    if (char.isWounded) {
      const statusText = this.add.text(100, 28, '💀 重伤', {
        fontSize: '12px', color: '#ff0000', fontFamily: 'monospace',
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
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
    });
    panel.add(nameText);
    
    // 生命值
    const hpText = this.add.text(10, 28, `❤️ ${enemy.currentHp}/${enemy.def.maxHp}`, {
      fontSize: '13px', color: '#ff4444', fontFamily: 'monospace',
    });
    panel.add(hpText);
    
    // 护甲
    const armorText = this.add.text(10, 46, `🛡️ ${enemy.armor}`, {
      fontSize: '13px', color: '#4488ff', fontFamily: 'monospace',
    });
    panel.add(armorText);
    
    // 标记
    if (enemy.marks > 0) {
      const markText = this.add.text(100, 46, `👁️ ${enemy.marks}`, {
        fontSize: '12px', color: '#ff8800', fontFamily: 'monospace',
      });
      panel.add(markText);
    }
    
    // 意图
    if (enemy.nextAction) {
      const intentText = this.add.text(10, 64, `👉 ${enemy.nextAction.name}`, {
        fontSize: '11px', color: enemy.nextAction.damage ? '#ff6644' : '#66aaff', fontFamily: 'monospace',
      });
      panel.add(intentText);
    }
  }
  
  private updateLog(): void {
    // 显示最近5条日志
    const recentLogs = this.battleManager.logs.slice(-5);
    this.logText.setText(recentLogs.join('\n'));
  }
  
  private onBattleEnd(victory: boolean): void {
    this.battleEnded = true;
    
    const w = this.scale.width;
    const h = this.scale.height;
    
    // 显示结果
    const resultText = this.add.text(w / 2, h / 2, 
      victory ? '战斗胜利！' : '战斗失败...', {
      fontSize: '32px', color: victory ? '#44ff44' : '#ff4444',
      fontStyle: 'bold', fontFamily: 'monospace',
    }).setOrigin(0.5);
    
    // 重新开始提示
    this.add.text(w / 2, h / 2 + 50, '按 R 重新开始', {
      fontSize: '16px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setOrigin(0.5);
    
    // 键盘事件
    this.input.keyboard?.on('keydown-R', () => {
      this.scene.restart();
    });
  }
}
