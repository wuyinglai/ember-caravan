import Phaser from 'phaser';
import { CHARACTER_DEFS, CharacterId } from '../data/characters';
import { getGameState, setGameState, createFixedMap, updateReachableCells } from '../systems/GameState';

export class CharacterSelectScene extends Phaser.Scene {
  private selectedChars: CharacterId[] = [];
  private characterCards: Phaser.GameObjects.Container[] = [];
  private confirmBtn!: Phaser.GameObjects.Text;
  private selectionText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'CharacterSelectScene' });
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRect(0, 0, w, h);

    // 标题
    this.add.text(w / 2, 40, '选择远征队伍', {
      fontSize: '36px',
      color: '#ffcc44',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 说明文字
    this.selectionText = this.add.text(w / 2, 90, '请选择 3 名角色 (0/3)', {
      fontSize: '20px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // 创建5个角色卡片
    const allChars: CharacterId[] = ['guardian', 'sharpshooter', 'repairman', 'scout', 'inspirer'];
    const cardWidth = 200;
    const cardHeight = 280;
    const startX = (w - allChars.length * cardWidth - (allChars.length - 1) * 20) / 2 + cardWidth / 2;

    for (let i = 0; i < allChars.length; i++) {
      const charId = allChars[i];
      const charDef = CHARACTER_DEFS[charId];
      const x = startX + i * (cardWidth + 20);
      const y = h / 2;

      const card = this.createCharacterCard(x, y, charId, charDef, cardWidth, cardHeight);
      this.characterCards.push(card);
    }

    // 确认按钮
    this.confirmBtn = this.add.text(w / 2, h - 80, '开始远征', {
      fontSize: '28px',
      color: '#666666',
      backgroundColor: '#2a2a3a',
      padding: { x: 50, y: 15 },
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.updateConfirmButton();

    // 键盘快捷键：按1-5选择角色，Enter确认
    const charList: CharacterId[] = ['guardian', 'sharpshooter', 'repairman', 'scout', 'inspirer'];
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const num = parseInt(event.key);
      if (num >= 1 && num <= 5) {
        this.toggleCharacterByIndex(num - 1);
      }
      if (event.key === 'Enter' && this.selectedChars.length === 3) {
        this.startExpedition();
      }
    });

    console.log('[角色选择] 角色选择场景已加载');
  }

  private createCharacterCard(
    x: number,
    y: number,
    charId: CharacterId,
    charDef: typeof CHARACTER_DEFS['guardian'],
    width: number,
    height: number
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // 背景框
    const bg = this.add.graphics();
    const color = charDef.color;
    bg.fillStyle(0x2a2a3e, 1);
    bg.fillRect(-width / 2, -height / 2, width, height);
    bg.lineStyle(2, color, 0.8);
    bg.strokeRect(-width / 2, -height / 2, width, height);
    container.add(bg);

    // 选中标记（初始隐藏）
    const selectedMark = this.add.graphics();
    selectedMark.fillStyle(color, 0.3);
    selectedMark.fillRect(-width / 2, -height / 2, width, height);
    selectedMark.lineStyle(4, color, 1);
    selectedMark.strokeRect(-width / 2, -height / 2, width, height);
    selectedMark.setVisible(false);
    container.add(selectedMark);

    // 图标
    const icon = this.add.text(0, -height / 2 + 40, charDef.icon, {
      fontSize: '48px',
    }).setOrigin(0.5);
    container.add(icon);

    // 名字
    const name = this.add.text(0, -height / 2 + 90, charDef.name, {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add(name);

    // 定位
    const role = this.add.text(0, -height / 2 + 120, charDef.role, {
      fontSize: '14px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    container.add(role);

    // 生命值
    const hp = this.add.text(0, -height / 2 + 155, `❤️ ${charDef.maxHp} HP`, {
      fontSize: '16px',
      color: '#ff6666',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    container.add(hp);

    // 被动说明（自动换行）
    const passive = this.add.text(0, 20, charDef.passiveDesc, {
      fontSize: '13px',
      color: '#cccccc',
      fontFamily: 'monospace',
      align: 'center',
      wordWrap: { width: width - 20 },
    }).setOrigin(0.5);
    container.add(passive);

    // 点击区域
    const hitArea = this.add.zone(0, 0, width, height).setInteractive({ useHandCursor: true });
    container.add(hitArea);

    // 点击事件
    hitArea.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(0x3a3a4e, 1);
      bg.fillRect(-width / 2, -height / 2, width, height);
      bg.lineStyle(2, color, 1);
      bg.strokeRect(-width / 2, -height / 2, width, height);
    });

    hitArea.on('pointerout', () => {
      const isSelected = this.selectedChars.includes(charId);
      bg.clear();
      bg.fillStyle(0x2a2a3e, 1);
      bg.fillRect(-width / 2, -height / 2, width, height);
      bg.lineStyle(2, color, isSelected ? 1 : 0.8);
      bg.strokeRect(-width / 2, -height / 2, width, height);
    });

    hitArea.on('pointerdown', () => {
      this.toggleCharacter(charId, selectedMark, bg, color, width, height);
    });

    return container;
  }

  private toggleCharacterByIndex(index: number): void {
    const allChars: CharacterId[] = ['guardian', 'sharpshooter', 'repairman', 'scout', 'inspirer'];
    if (index >= 0 && index < allChars.length) {
      const charId = allChars[index];
      const existingIndex = this.selectedChars.indexOf(charId);
      if (existingIndex > -1) {
        this.selectedChars.splice(existingIndex, 1);
      } else if (this.selectedChars.length < 3) {
        this.selectedChars.push(charId);
      }
      this.updateUI();
    }
  }

  private toggleCharacter(
    charId: CharacterId,
    selectedMark: Phaser.GameObjects.Graphics,
    bg: Phaser.GameObjects.Graphics,
    color: number,
    width: number,
    height: number
  ): void {
    const index = this.selectedChars.indexOf(charId);

    if (index > -1) {
      // 取消选择
      this.selectedChars.splice(index, 1);
      selectedMark.setVisible(false);
      bg.clear();
      bg.fillStyle(0x2a2a3e, 1);
      bg.fillRect(-width / 2, -height / 2, width, height);
      bg.lineStyle(2, color, 0.8);
      bg.strokeRect(-width / 2, -height / 2, width, height);
    } else {
      // 选择（最多3个）
      if (this.selectedChars.length < 3) {
        this.selectedChars.push(charId);
        selectedMark.setVisible(true);
        bg.clear();
        bg.fillStyle(0x3a3a4e, 1);
        bg.fillRect(-width / 2, -height / 2, width, height);
        bg.lineStyle(2, color, 1);
        bg.strokeRect(-width / 2, -height / 2, width, height);
      }
    }

    this.updateUI();
  }

  private updateUI(): void {
    this.selectionText.setText(`请选择 3 名角色 (${this.selectedChars.length}/3)`);
    this.updateConfirmButton();
  }

  private updateConfirmButton(): void {
    const canStart = this.selectedChars.length === 3;

    if (canStart) {
      this.confirmBtn.setStyle({
        color: '#ffffff',
        backgroundColor: '#2a8a4a',
      });
      this.confirmBtn.setInteractive({ useHandCursor: true });

      this.confirmBtn.off('pointerover');
      this.confirmBtn.off('pointerout');
      this.confirmBtn.off('pointerdown');

      this.confirmBtn.on('pointerover', () => {
        this.confirmBtn.setStyle({ backgroundColor: '#3aca6a' });
      });

      this.confirmBtn.on('pointerout', () => {
        this.confirmBtn.setStyle({ backgroundColor: '#2a8a4a' });
      });

      this.confirmBtn.on('pointerdown', () => {
        this.startExpedition();
      });
    } else {
      this.confirmBtn.setStyle({
        color: '#666666',
        backgroundColor: '#2a2a3a',
      });
      this.confirmBtn.disableInteractive();
    }
  }

  private startExpedition(): void {
    // 保存选择
    const gameState = getGameState();
    gameState.selectedCharacters = [...this.selectedChars];

    // 未选择的角色进入候补池
    const allChars: CharacterId[] = ['guardian', 'sharpshooter', 'repairman', 'scout', 'inspirer'];
    gameState.reserveCharacters = allChars.filter(c => !this.selectedChars.includes(c));

    // 初始化地图
    gameState.mapCells = createFixedMap(gameState.mapWidth, gameState.mapHeight);
    updateReachableCells(gameState);

    setGameState(gameState);

    console.log('[角色选择] 队伍:', gameState.selectedCharacters);
    console.log('[角色选择] 候补:', gameState.reserveCharacters);

    // 进入地图场景
    this.scene.start('MapScene');
  }
}
