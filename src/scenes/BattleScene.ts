import Phaser from 'phaser';
import { BattleManager } from '../systems/BattleManager';
import { createCharacterState, getStartingDeck, CHARACTER_DEFS } from '../data/characters';
import { createEnemyState, ENEMY_DEFS, ENEMY_ACTIONS, getEnemyNextAction } from '../data/enemies';
import { CharacterState, EnemyState, CardDef } from '../data/types';
import { getGameState, setGameState, resetGameState, checkVictory, updateReachableCells } from '../systems/GameState';

export class BattleScene extends Phaser.Scene {
  private battleManager!: BattleManager;
  
  // UI元素
  private characterPanels: Phaser.GameObjects.Container[] = [];
  private characterSkillTexts: Phaser.GameObjects.Text[] = [];
  private enemyPanels: Phaser.GameObjects.Container[] = [];
  private cardTexts: Phaser.GameObjects.Text[] = [];
  private actionPointText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private caravanText!: Phaser.GameObjects.Text;
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
    // 重置实例变量（Scene 可能被重用）
    this.characterPanels = [];
    this.characterSkillTexts = [];
    this.enemyPanels = [];
    this.cardTexts = [];
    this.selectedCard = null;
    this.selectedEnemy = null;
    this.battleEnded = false;
    this.skillTooltip = null;

    const w = this.scale.width;
    const h = this.scale.height;

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRect(0, 0, w, h);

    // 获取游戏状态
    const gameState = getGameState();

    // 创建队伍（从游戏状态中读取选择的角色）
    let characters: CharacterState[];
    if (gameState.selectedCharacters.length === 3) {
      // 使用玩家选择的角色
      characters = gameState.selectedCharacters.map(id => createCharacterState(id));
    } else {
      // 默认测试队伍（用于直接测试战斗场景）
      characters = [
        createCharacterState('guardian'),
        createCharacterState('sharpshooter'),
        createCharacterState('repairman'),
      ];
    }

    // 根据战斗类型创建敌人
    let enemies: EnemyState[];
    if (gameState.currentBattleType === 'boss') {
      // Boss战：更强的敌人
      enemies = [
        createEnemyState('boss'),
      ];
    } else if (gameState.currentBattleType === 'elite') {
      // 精英战斗：更强的敌人组合
      enemies = [
        createEnemyState('bandit'),
        createEnemyState('bandit'),
        createEnemyState('beast'),
      ];
    } else {
      // 普通战斗
      enemies = [
        createEnemyState('bandit'),
        createEnemyState('beast'),
      ];
    }

    // 同步商队耐久
    const caravanDurability = gameState.caravanHp;
    const caravanMaxDurability = gameState.caravanMaxHp;

    // 创建战斗管理器
    this.battleManager = new BattleManager(characters, enemies, (victory) => {
      this.onBattleEnd(victory);
    }, caravanDurability, caravanMaxDurability);

    // 开始战斗
    this.battleManager.startBattle();

    // 创建UI
    this.createUI();

    // 键盘快捷键
    this.input.keyboard?.on('keydown-E', () => this.endTurn());
    this.input.keyboard?.on('keydown-ENTER', () => this.endTurn());
    this.input.keyboard?.on('keydown-R', () => this.restart());
    // Q 键：强制胜利（测试用，配合自动移动测试）
    this.input.keyboard?.on('keydown-Q', () => {
      if (!this.battleEnded) {
        console.log('[战斗调试] 强制胜利（测试用）');
        this.battleEnded = true;
        const gameState = getGameState();
        gameState.battleResult = 'victory';
        gameState.caravanHp = this.battleManager.state.caravanDurability;
        const { x, y } = gameState.currentPosition;
        const cell = gameState.mapCells[y][x];
        cell.isCleared = true;
        cell.isRevealed = true;
        gameState.currentBattleType = null;
        updateReachableCells(gameState);
        setGameState(gameState);
        this.scene.start('MapScene');
      }
    });

    console.log('[余烬商队] 战斗场景初始化完成');
    console.log('队伍:', characters.map(c => c.def.name).join(', '));
    console.log('敌人:', enemies.map(e => e.def.name).join(', '));

    // 如果是鼠标点击模拟测试触发的战斗，自动模拟点击操作
    if (gameState._isClickTesting) {
      console.log('[鼠标模拟测试-战斗] 检测到点击测试模式，自动模拟战斗操作');
      this.time.delayedCall(800, () => {
        this.clickSimAutoBattle();
      });
    }
  }
  
  private createUI(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    
    // 顶部信息栏
    this.turnText = this.add.text(w / 2, 10, `第 ${this.battleManager.state.turn} 回合`, {
      fontSize: '18px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    
    this.actionPointText = this.add.text(w / 2, 34, `⚡ 行动力: ${this.battleManager.state.actionPoints}/${this.battleManager.state.maxActionPoints}`, {
      fontSize: '16px', color: '#ffcc00', fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
    
    // 商队状态（顶部中央下方）
    this.caravanText = this.add.text(w / 2, 56, `🚗 商队耐久: ${this.battleManager.state.caravanDurability}/${this.battleManager.state.caravanMaxDurability}`, {
      fontSize: '14px', color: '#88cc88', fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
    
    // 角色面板（左侧）
    this.createCharacterPanels();
    
    // 敌人面板（右侧）
    this.createEnemyPanels();
    
    // 手牌区域（底部）
    this.createHandArea();
    
    // 结束回合按钮（放在底部手牌区右侧）
    this.endTurnBtn = this.add.text(w - 10, h - 30, '结束回合(E)', {
      fontSize: '14px', color: '#ffffff', backgroundColor: '#336633',
      padding: { x: 10, y: 4 }, fontFamily: 'monospace',
    }).setOrigin(1, 0).setInteractive();
    
    this.endTurnBtn.on('pointerdown', () => this.endTurn());
    this.endTurnBtn.on('pointerover', () => this.endTurnBtn.setStyle({ backgroundColor: '#447744' }));
    this.endTurnBtn.on('pointerout', () => this.endTurnBtn.setStyle({ backgroundColor: '#336633' }));
    
    // 重新开始按钮
    this.restartBtn = this.add.text(w - 10, h - 55, '重新开始(R)', {
      fontSize: '12px', color: '#aaaaaa', backgroundColor: '#333333',
      padding: { x: 8, y: 3 }, fontFamily: 'monospace',
    }).setOrigin(1, 0).setInteractive();
    
    this.restartBtn.on('pointerdown', () => this.restart());
    this.restartBtn.on('pointerover', () => this.restartBtn.setStyle({ backgroundColor: '#444444' }));
    this.restartBtn.on('pointerout', () => this.restartBtn.setStyle({ backgroundColor: '#333333' }));
    
    // 左下角日志和操作提示已移除
    
    this.updateUI();
  }
  
  private createCharacterPanels(): void {
    const chars = this.battleManager.state.characters;
    const startY = 80;
    const panelHeight = 65;
    const spacing = panelHeight + 70; // 大幅增加面板间距
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const panel = this.add.container(10, startY + i * spacing);
      
      // 背景框
      const bg = this.add.graphics();
      bg.fillStyle(char.def.color, 0.15);
      bg.fillRect(0, 0, 220, panelHeight);
      bg.lineStyle(2, char.def.color, 0.8);
      bg.strokeRect(0, 0, 220, panelHeight);
      panel.add(bg);
      
      // 角色名
      const nameText = this.add.text(8, 6, `${char.def.icon} ${char.def.name}`, {
        fontSize: '16px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
      });
      panel.add(nameText);
      
      // HP和护甲
      const hpColor = char.currentHp > char.def.maxHp * 0.5 ? '#ff6666' : (char.currentHp > 0 ? '#ffaa44' : '#666666');
      const statsText = this.add.text(8, 30, `❤️${char.currentHp}/${char.def.maxHp}  🛡️${char.armor}`, {
        fontSize: '14px', color: hpColor, fontFamily: 'monospace',
      });
      panel.add(statsText);
      
      // 状态
      if (char.currentHp <= 0) {
        const statusText = this.add.text(8, 48, '💀已倒下', {
          fontSize: '12px', color: '#ff4444', fontFamily: 'monospace',
        });
        panel.add(statusText);
      }
      
      this.characterPanels.push(panel);
      
      // 技能图标（面板下方）
      this.createSkillIcons(char, i, startY + i * spacing + panelHeight + 5);
    }
  }
  
  private createSkillIcons(char: CharacterState, charIndex: number, startY: number): void {
    const deck = getStartingDeck(char.def.id);
    const skillColor = '#' + char.def.color.toString(16).padStart(6, '0');
    let iconX = 16;
    const radius = 18;
    const diameter = radius * 2;
    
    for (let i = 0; i < deck.length; i++) {
      const card = deck[i];
      const cx = iconX + radius;
      const cy = startY + radius;
      
      // 创建技能图标（圆形背景+文字）
      const iconBg = this.add.graphics();
      iconBg.fillStyle(char.def.color, 0.3);
      iconBg.fillCircle(cx, cy, radius);
      iconBg.lineStyle(1, char.def.color, 1);
      iconBg.strokeCircle(cx, cy, radius);
      
      // 技能名称（取第一个字）
      const skillIcon = this.add.text(cx, cy, card.name.charAt(0), {
        fontSize: '18px', color: skillColor, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);
      
      // 设置交互区域
      const hitArea = this.add.zone(cx, cy, diameter, diameter).setInteractive();
      
      // 悬停显示技能介绍
      hitArea.on('pointerover', () => {
        iconBg.clear();
        iconBg.fillStyle(char.def.color, 0.6);
        iconBg.fillCircle(cx, cy, radius);
        iconBg.lineStyle(2, char.def.color, 1);
        iconBg.strokeCircle(cx, cy, radius);
        this.showSkillTooltip(card, cx, cy - radius - 5);
      });
      
      hitArea.on('pointerout', () => {
        iconBg.clear();
        iconBg.fillStyle(char.def.color, 0.3);
        iconBg.fillCircle(cx, cy, radius);
        iconBg.lineStyle(1, char.def.color, 1);
        iconBg.strokeCircle(cx, cy, radius);
        this.hideSkillTooltip();
      });
      
      iconX += diameter + 12; // 增大技能图标间距
    }
  }
  
  private skillTooltip: Phaser.GameObjects.Container | null = null;
  
  private showSkillTooltip(card: CardDef, x: number, y: number): void {
    this.hideSkillTooltip();
    
    const tooltip = this.add.container(x, y);
    
    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.9);
    bg.lineStyle(1, 0x888888, 1);
    
    // 计算文本尺寸
    const nameText = this.add.text(0, 0, `${card.name} [${card.cost}]`, {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    });
    const descText = this.add.text(0, 18, card.description, {
      fontSize: '10px', color: '#cccccc', fontFamily: 'monospace',
      wordWrap: { width: 150 },
    });
    
    const width = Math.max(nameText.width, Math.min(descText.width, 150)) + 16;
    const height = 20 + descText.height + 8;
    
    bg.fillRoundedRect(-width/2, -height - 5, width, height, 4);
    bg.strokeRoundedRect(-width/2, -height - 5, width, height, 4);
    
    tooltip.add(bg);
    tooltip.add(nameText);
    tooltip.add(descText);
    
    nameText.setPosition(-width/2 + 8, -height + 3);
    descText.setPosition(-width/2 + 8, -height + 21);
    
    this.skillTooltip = tooltip;
  }
  
  private hideSkillTooltip(): void {
    if (this.skillTooltip) {
      this.skillTooltip.destroy();
      this.skillTooltip = null;
    }
  }
  
  private createEnemyPanels(): void {
    const enemies = this.battleManager.state.enemies;
    const w = this.scale.width;
    const startY = 80;
    const panelHeight = 70;
    const spacing = panelHeight + 70; // 大幅增加间距
    
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      const panel = this.add.container(w - 230, startY + i * spacing);
      
      // 背景框
      const bg = this.add.graphics();
      bg.fillStyle(enemy.def.color, 0.15);
      bg.fillRect(0, 0, 220, panelHeight);
      bg.lineStyle(2, enemy.def.color, 0.8);
      bg.strokeRect(0, 0, 220, panelHeight);
      panel.add(bg);
      
      // 敌人名
      const nameText = this.add.text(8, 6, `${enemy.def.icon} ${enemy.def.name}`, {
        fontSize: '16px', color: enemy.currentHp > 0 ? '#ffffff' : '#666666', fontFamily: 'monospace', fontStyle: 'bold',
      });
      panel.add(nameText);
      
      // HP + 护甲 + 标记 合并一行
      const hpColor = enemy.currentHp > enemy.def.maxHp * 0.5 ? '#ff6666' : (enemy.currentHp > 0 ? '#ffaa44' : '#666666');
      let statsStr = `❤️${enemy.currentHp}/${enemy.def.maxHp}  🛡️${enemy.armor}`;
      if (enemy.marks > 0) statsStr += `  👁️${enemy.marks}`;
      const statsText = this.add.text(8, 30, statsStr, {
        fontSize: '14px', color: hpColor, fontFamily: 'monospace',
      });
      panel.add(statsText);
      
      // 意图
      if (enemy.nextAction && enemy.currentHp > 0) {
        const intentColor = enemy.nextAction.target === 'caravan' ? '#88cc88' : '#ff8866';
        const intentText = this.add.text(8, 50, `👉 ${enemy.nextAction.name}`, {
          fontSize: '12px', color: intentColor, fontFamily: 'monospace',
        });
        panel.add(intentText);
      }
      
      // 已死亡
      if (enemy.currentHp <= 0) {
        const deadText = this.add.text(8, 50, '💀已击败', {
          fontSize: '12px', color: '#666666', fontFamily: 'monospace',
        });
        panel.add(deadText);
      }
      
      // 点击选择敌人
      if (enemy.currentHp > 0) {
        const hitArea = this.add.zone(110, panelHeight / 2, 220, panelHeight).setInteractive();
        hitArea.on('pointerdown', () => this.onEnemyClick(i));
        panel.add(hitArea);
      }
      
      this.enemyPanels.push(panel);
      
      // 敌人技能图标（面板下方）
      this.createEnemySkillIcons(enemy, i, startY + i * spacing + panelHeight + 5);
    }
  }
  
  private createEnemySkillIcons(enemy: EnemyState, enemyIndex: number, startY: number): void {
    // 收集该敌人的所有技能
    const enemySkills: { name: string; description: string }[] = [];
    const enemyId = enemy.def.id;
    
    // 遍历 ENEMY_ACTIONS 找到属于该敌人的技能
    const actionMap: Record<string, string[]> = {
      bandit: ['bandit_attack'],
      beast: ['beast_attack'],
      raider: ['raider_attack'],
      slinger: ['slinger_attack'],
      destroyer: ['destroyer_attack'],
      boss: ['boss_attack_char', 'boss_attack_caravan', 'boss_summon', 'boss_buff'],
    };
    
    const skillKeys = actionMap[enemyId] || [];
    for (const key of skillKeys) {
      const action = ENEMY_ACTIONS[key as keyof typeof ENEMY_ACTIONS];
      if (action) {
        enemySkills.push({ name: action.name, description: action.description });
      }
    }
    
    const skillColor = '#' + enemy.def.color.toString(16).padStart(6, '0');
    const w = this.scale.width;
    let iconX = w - 230 + 16;
    const radius = 18;
    const diameter = radius * 2;
    
    for (let i = 0; i < enemySkills.length; i++) {
      const skill = enemySkills[i];
      const cx = iconX + radius;
      const cy = startY + radius;
      
      // 创建技能图标（圆形背景+文字）
      const iconBg = this.add.graphics();
      iconBg.fillStyle(enemy.def.color, 0.3);
      iconBg.fillCircle(cx, cy, radius);
      iconBg.lineStyle(1, enemy.def.color, 1);
      iconBg.strokeCircle(cx, cy, radius);
      
      // 技能名称（取第一个字）
      const skillIcon = this.add.text(cx, cy, skill.name.charAt(0), {
        fontSize: '18px', color: skillColor, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);
      
      // 设置交互区域
      const hitArea = this.add.zone(cx, cy, diameter, diameter).setInteractive();
      
      // 悬停显示技能介绍
      hitArea.on('pointerover', () => {
        iconBg.clear();
        iconBg.fillStyle(enemy.def.color, 0.6);
        iconBg.fillCircle(cx, cy, radius);
        iconBg.lineStyle(2, enemy.def.color, 1);
        iconBg.strokeCircle(cx, cy, radius);
        this.showEnemySkillTooltip(skill, cx, cy - radius - 5);
      });
      
      hitArea.on('pointerout', () => {
        iconBg.clear();
        iconBg.fillStyle(enemy.def.color, 0.3);
        iconBg.fillCircle(cx, cy, radius);
        iconBg.lineStyle(1, enemy.def.color, 1);
        iconBg.strokeCircle(cx, cy, radius);
        this.hideSkillTooltip();
      });
      
      iconX += diameter + 12; // 增大敌人技能图标间距
    }
  }
  
  private showEnemySkillTooltip(skill: { name: string; description: string }, x: number, y: number): void {
    this.hideSkillTooltip();
    
    const tooltip = this.add.container(x, y);
    
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.9);
    bg.lineStyle(1, 0x888888, 1);
    
    const nameText = this.add.text(0, 0, skill.name, {
      fontSize: '12px', color: '#ff8888', fontFamily: 'monospace', fontStyle: 'bold',
    });
    const descText = this.add.text(0, 18, skill.description, {
      fontSize: '10px', color: '#cccccc', fontFamily: 'monospace',
      wordWrap: { width: 150 },
    });
    
    const width = Math.max(nameText.width, Math.min(descText.width, 150)) + 16;
    const height = 20 + descText.height + 8;
    
    bg.fillRoundedRect(-width/2, -height - 5, width, height, 4);
    bg.strokeRoundedRect(-width/2, -height - 5, width, height, 4);
    
    tooltip.add(bg);
    tooltip.add(nameText);
    tooltip.add(descText);
    
    nameText.setPosition(-width/2 + 8, -height + 3);
    descText.setPosition(-width/2 + 8, -height + 21);
    
    this.skillTooltip = tooltip;
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
    
    // 手牌区域：充分利用底部空间
    const leftBound = 10;
    const rightBound = w - 10;
    const availableWidth = rightBound - leftBound;
    
    // 计算总卡牌数
    let totalCards = 0;
    for (const char of chars) {
      if (char.currentHp > 0) totalCards += char.hand.length;
    }
    
    // 充分利用底部空间，卡牌均匀分布不重叠
    const cardSpacing = totalCards > 1 ? (availableWidth - 20) / totalCards : availableWidth;
    const totalWidth = totalCards * cardSpacing;
    let cardX = leftBound + (availableWidth - totalWidth) / 2 + cardSpacing / 2;
    const cardY = h - 80;
    
    for (let charIndex = 0; charIndex < chars.length; charIndex++) {
      const char = chars[charIndex];
      if (char.currentHp <= 0) continue;
      
      for (let cardIndex = 0; cardIndex < char.hand.length; cardIndex++) {
        const card = char.hand[cardIndex];
        const isSelected = this.selectedCard?.charIndex === charIndex && 
                           this.selectedCard?.cardIndex === cardIndex;
        
        const canPlay = card.cost <= this.battleManager.state.actionPoints;
        const cardText = this.createCardText(cardX, cardY, card, char.def.color, isSelected, canPlay, char.def.name);
        
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
  
  private createCardText(x: number, y: number, card: CardDef, charColor: number, isSelected: boolean, canPlay: boolean, charName: string): Phaser.GameObjects.Text {
    const bgColor = isSelected ? '#555588' : (canPlay ? '#2a2a4a' : '#1a1a2a');
    const cardColorHex = '#' + charColor.toString(16).padStart(6, '0');
    const textColor = canPlay ? cardColorHex : '#444444';
    
    // 只显示费用和名字，不显示描述，避免重叠
    const text = this.add.text(x, y, 
      `[${card.cost}] ${card.name}`, {
      fontSize: '18px', color: textColor,
      backgroundColor: bgColor,
      padding: { x: 14, y: 10 },
      align: 'center',
      fontFamily: 'monospace',
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
    for (let i = 0; i < this.battleManager.state.characters.length; i++) {
      if (i < this.characterPanels.length) {
        this.updateCharacterPanel(i);
      }
    }
    
    // 更新敌人面板
    for (let i = 0; i < this.battleManager.state.enemies.length; i++) {
      if (i < this.enemyPanels.length) {
        this.updateEnemyPanel(i);
      }
    }
    
    // 更新手牌
    this.updateHandDisplay();
  }
  
  private updateCharacterPanel(index: number): void {
    const panel = this.characterPanels[index];
    const char = this.battleManager.state.characters[index];
    
    // 检查角色是否存在
    if (!char || !char.def) {
      console.warn(`[战斗] 角色 ${index} 不存在`);
      return;
    }
    
    // 清除旧文本
    panel.each((child) => {
      if (child instanceof Phaser.GameObjects.Text) {
        child.destroy();
      }
    });
    
    // 角色名
    const nameText = this.add.text(8, 6, `${char.def.icon} ${char.def.name}`, {
      fontSize: '16px', color: char.currentHp > 0 ? '#ffffff' : '#666666', fontFamily: 'monospace', fontStyle: 'bold',
    });
    panel.add(nameText);
    
    // HP + 护甲
    const hpColor = char.currentHp > char.def.maxHp * 0.5 ? '#ff6666' : (char.currentHp > 0 ? '#ffaa44' : '#666666');
    const statsText = this.add.text(8, 30, `❤️${char.currentHp}/${char.def.maxHp}  🛡️${char.armor}`, {
      fontSize: '14px', color: hpColor, fontFamily: 'monospace',
    });
    panel.add(statsText);
    
    // 状态
    if (char.currentHp <= 0) {
      const statusText = this.add.text(8, 48, '💀已倒下', {
        fontSize: '12px', color: '#ff4444', fontFamily: 'monospace',
      });
      panel.add(statusText);
    }
  }
  
  private updateEnemyPanel(index: number): void {
    const panel = this.enemyPanels[index];
    const enemy = this.battleManager.state.enemies[index];

    // 检查敌人是否存在
    if (!enemy || !enemy.def) {
      console.warn(`[战斗] 敌人 ${index} 不存在`);
      return;
    }

    // 清除旧文本
    panel.each((child) => {
      if (child instanceof Phaser.GameObjects.Text) {
        child.destroy();
      }
    });
    
    // 敌人名
    const nameText = this.add.text(8, 6, `${enemy.def.icon} ${enemy.def.name}`, {
      fontSize: '16px', color: enemy.currentHp > 0 ? '#ffffff' : '#666666', fontFamily: 'monospace', fontStyle: 'bold',
    });
    panel.add(nameText);
    
    // HP + 护甲 + 标记 合并
    const hpColor = enemy.currentHp > enemy.def.maxHp * 0.5 ? '#ff6666' : (enemy.currentHp > 0 ? '#ffaa44' : '#666666');
    let statsStr = `❤️${enemy.currentHp}/${enemy.def.maxHp}  🛡️${enemy.armor}`;
    if (enemy.marks > 0) statsStr += `  👁️${enemy.marks}`;
    const statsText = this.add.text(8, 30, statsStr, {
      fontSize: '14px', color: hpColor, fontFamily: 'monospace',
    });
    panel.add(statsText);
    
    // 意图
    if (enemy.nextAction && enemy.currentHp > 0) {
      const intentColor = enemy.nextAction.target === 'caravan' ? '#88cc88' : '#ff8866';
      const intentText = this.add.text(8, 50, `👉 ${enemy.nextAction.name}`, {
        fontSize: '12px', color: intentColor, fontFamily: 'monospace',
      });
      panel.add(intentText);
    }
    
    // 已死亡
    if (enemy.currentHp <= 0) {
      const deadText = this.add.text(8, 50, '💀已击败', {
        fontSize: '12px', color: '#666666', fontFamily: 'monospace',
      });
      panel.add(deadText);
    }
  }
  
  private onBattleEnd(victory: boolean): void {
    this.battleEnded = true;

    // 更新游戏状态
    const gameState = getGameState();
    gameState.battleResult = victory ? 'victory' : 'defeat';

    // 同步商队耐久回游戏状态
    gameState.caravanHp = this.battleManager.state.caravanDurability;

    // 如果是Boss战且胜利，标记远征胜利
    if (victory && gameState.currentBattleType === 'boss') {
      gameState.battleResult = 'victory';
      setGameState(gameState);
      this.showExpeditionVictory();
      return;
    }

    // 如果胜利，标记当前格子为已清理（普通战斗、精英战斗、danger战斗）
    if (victory) {
      const { x, y } = gameState.currentPosition;
      const cell = gameState.mapCells[y][x];
      cell.isCleared = true;
      cell.isRevealed = true;
      console.log(`[战斗] 战斗格 (${x}, ${y}) 已清理，battleType=${gameState.currentBattleType}`);
    }

    // 重置战斗状态
    gameState.battleResult = victory ? 'victory' : 'defeat';
    gameState.currentBattleType = null;

    setGameState(gameState);

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

    // 返回地图按钮
    const btn = this.add.text(w / 2, h / 2 + 60, victory ? '【返回地图】' : '【重新开始】', {
      fontSize: '18px', color: '#ffffff', backgroundColor: victory ? '#2a8a4a' : '#444466',
      padding: { x: 20, y: 10 }, fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive();

    btn.on('pointerdown', () => {
      if (victory) {
        // 胜利：重新计算可到达格子并返回地图
        const gameState = getGameState();
        updateReachableCells(gameState);
        setGameState(gameState);
        console.log('[战斗] 返回地图，已重新计算可移动格子');
        this.scene.start('MapScene');
      } else {
        // 失败：重置游戏并返回主菜单
        resetGameState();
        this.scene.start('MainMenuScene');
      }
    });
    btn.on('pointerover', () => btn.setStyle({ backgroundColor: victory ? '#3aca6a' : '#555577' }));
    btn.on('pointerout', () => btn.setStyle({ backgroundColor: victory ? '#2a8a4a' : '#444466' }));
  }

  private showExpeditionVictory(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const gameState = getGameState();

    // 遮罩
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.8);
    overlay.fillRect(0, 0, w, h);

    // 弹窗背景
    const popupBg = this.add.graphics();
    popupBg.fillStyle(0x2a2a3e, 1);
    popupBg.fillRect(w / 2 - 250, h / 2 - 120, 500, 240);
    popupBg.lineStyle(3, 0xffcc44, 1);
    popupBg.strokeRect(w / 2 - 250, h / 2 - 120, 500, 240);

    // 标题
    const titleText = this.add.text(w / 2, h / 2 - 70, '🎉 远征胜利！', {
      fontSize: '36px',
      color: '#ffcc44',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 消息
    const goalMsg = gameState.expeditionGoal === 'boss'
      ? '你成功击败了首领，完成了远征！'
      : '你成功完成了远征目标！';
    const msgText = this.add.text(w / 2, h / 2 - 10, goalMsg, {
      fontSize: '20px',
      color: '#cccccc',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // 返回主菜单按钮
    const btn = this.add.text(w / 2, h / 2 + 60, '【返回主菜单】', {
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#2a4a8a',
      padding: { x: 40, y: 12 },
      fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive();

    btn.on('pointerdown', () => {
      resetGameState();
      this.scene.start('MainMenuScene');
    });
    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#3a6aca' }));
    btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#2a4a8a' }));
  }

  // ==================== 鼠标点击模拟：自动战斗 ====================

  /**
   * 通过 Phaser Input Manager 发出真实的 pointerdown 事件，
   * 模拟人类在战斗中的点击操作：选卡→选敌人→出牌→结束回合。
   */
  private clickSimAutoBattle(): void {
    if (this.battleEnded) {
      console.log('[鼠标模拟测试-战斗] 战斗已结束，模拟点击返回按钮');
      this.clickSimReturnButton();
      return;
    }

    const state = this.battleManager.state;

    // 如果有行动力，尝试出牌
    if (state.actionPoints > 0) {
      // 找到一张可出的牌
      const cardInfo = this.findPlayableCard();
      if (cardInfo) {
        // 找到一个存活的敌人
        const enemyIdx = this.findAliveEnemy();
        if (enemyIdx >= 0) {
          console.log(
            `[鼠标模拟测试-战斗] 模拟出牌: ${state.characters[cardInfo.charIndex].def.name}` +
            ` 的【${state.characters[cardInfo.charIndex].hand[cardInfo.cardIndex]?.name || '?'}】` +
            ` → ${state.enemies[enemyIdx].def.name}`
          );

          // 模拟点击卡牌（通过游戏对象 emit 触发 pointerdown 事件）
          if (this.cardTexts[cardInfo.globalIndex]) {
            this.cardTexts[cardInfo.globalIndex].emit('pointerdown');
          }

          // 延迟后模拟点击敌人
          this.time.delayedCall(300, () => {
            if (this.battleEnded) {
              this.clickSimReturnButton();
              return;
            }
            if (this.enemyPanels[enemyIdx]) {
              // 找到敌人面板中的 Zone（点击区域）
              let hitZone: Phaser.GameObjects.Zone | null = null;
              this.enemyPanels[enemyIdx].each((child) => {
                if (child instanceof Phaser.GameObjects.Zone) {
                  hitZone = child;
                }
              });
              if (hitZone) {
                hitZone.emit('pointerdown');
              }
            }

            // 延迟后继续下一轮
            this.time.delayedCall(500, () => {
              this.clickSimAutoBattle();
            });
          });
          return;
        }
      }
    }

    // 检查是否所有敌人都已死亡
    if (this.findAliveEnemy() < 0) {
      console.log('[鼠标模拟测试-战斗] 所有敌人已死亡，等待战斗结束...');
      this.time.delayedCall(500, () => {
        this.clickSimAutoBattle();
      });
      return;
    }

    // 没有可出的牌或没有行动力，结束回合
    console.log('[鼠标模拟测试-战斗] 模拟点击"结束回合"按钮');
    this.endTurnBtn.emit('pointerdown');

    // 延迟后继续下一轮
    this.time.delayedCall(800, () => {
      this.clickSimAutoBattle();
    });
  }

  /** 找到一张可以打出的牌 */
  private findPlayableCard(): { charIndex: number; cardIndex: number; globalIndex: number } | null {
    const state = this.battleManager.state;
    let globalIdx = 0;
    for (let ci = 0; ci < state.characters.length; ci++) {
      const char = state.characters[ci];
      if (char.currentHp <= 0) continue;
      for (let hi = 0; hi < char.hand.length; hi++) {
        const card = char.hand[hi];
        if (card && card.cost <= state.actionPoints) {
          return { charIndex: ci, cardIndex: hi, globalIndex: globalIdx };
        }
        globalIdx++;
      }
    }
    return null;
  }

  /** 找到一个存活的敌人 */
  private findAliveEnemy(): number {
    const state = this.battleManager.state;
    for (let i = 0; i < state.enemies.length; i++) {
      if (state.enemies[i].currentHp > 0) return i;
    }
    return -1;
  }

  /** 战斗结束后模拟点击返回按钮 */
  private clickSimReturnButton(): void {
    // 优先找"返回地图"按钮（战斗胜利后出现），排除"重新开始(R)"（这是重启战斗的按钮）
    let returnBtn: Phaser.GameObjects.Text | null = null;
    let restartBtn: Phaser.GameObjects.Text | null = null;
    this.children.each((child) => {
      if (child instanceof Phaser.GameObjects.Text && child.input?.enabled) {
        const text = child.text || '';
        if (text.includes('返回地图') || text.includes('返回主菜单')) {
          returnBtn = child;
        } else if (text.includes('重新开始') && !text.includes('R)')) {
          // 仅匹配战斗结束弹窗中的"重新开始"（不含快捷键提示的）
          restartBtn = child;
        }
      }
    });

    const btn = returnBtn || restartBtn;
    if (btn) {
      console.log(`[鼠标模拟测试-战斗] 模拟点击返回按钮: "${btn.text}"`);
      btn.emit('pointerdown');
    } else {
      console.log('[鼠标模拟测试-战斗] 未找到返回按钮，尝试直接切换到MapScene');
      // 如果找不到按钮，直接切换场景
      const gameState = getGameState();
      if (gameState._isClickTesting) {
        updateReachableCells(gameState);
        setGameState(gameState);
        this.scene.start('MapScene');
      }
    }
  }
}
