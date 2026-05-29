import { CardDef, CharacterState } from '../data/types';

// 洗牌函数
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class DeckManager {
  // 初始化角色牌组（战斗开始时调用）
  static initCharacterDeck(char: CharacterState): void {
    char.drawPile = shuffle([...char.deck]);
    char.discardPile = [];
    char.hand = [];
    
    // 初始抽2张牌
    this.drawCards(char, 2);
  }
  
  // 抽牌
  static drawCards(char: CharacterState, count: number): void {
    for (let i = 0; i < count; i++) {
      // 如果抽牌堆空了，把弃牌堆洗牌放入抽牌堆
      if (char.drawPile.length === 0) {
        if (char.discardPile.length === 0) {
          return; // 没有牌可抽了
        }
        char.drawPile = shuffle([...char.discardPile]);
        char.discardPile = [];
      }
      
      // 从抽牌堆抽一张
      const card = char.drawPile.pop()!;
      char.hand.push(card);
    }
  }
  
  // 弃掉手牌
  static discardHand(char: CharacterState): void {
    char.discardPile.push(...char.hand);
    char.hand = [];
  }
  
  // 使用一张牌
  static playCard(char: CharacterState, cardIndex: number): CardDef | null {
    if (cardIndex < 0 || cardIndex >= char.hand.length) {
      return null;
    }
    
    const card = char.hand.splice(cardIndex, 1)[0];
    char.discardPile.push(card);
    return card;
  }
  
  // 获取角色手牌数量
  static getHandCount(char: CharacterState): number {
    return char.hand.length;
  }
  
  // 获取牌库信息（用于UI显示）
  static getDeckInfo(char: CharacterState): { draw: number; discard: number; total: number } {
    return {
      draw: char.drawPile.length,
      discard: char.discardPile.length,
      total: char.deck.length,
    };
  }
}
