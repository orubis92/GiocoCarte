import type { CardData, CardDb, CardInstance, GameState, PlayerId, PlayerState } from './types';

// ---------------------------------------------------------------------------
// Classificazione delle carte in base ai dati YGOPRODeck.
// ---------------------------------------------------------------------------

export const isMonster = (c: CardData) => c.type.includes('Monster');
export const isSpell = (c: CardData) => c.type === 'Spell Card';
export const isTrap = (c: CardData) => c.type === 'Trap Card';
export const isFusion = (c: CardData) => c.type.includes('Fusion');
export const isSynchro = (c: CardData) => c.type.includes('Synchro');
export const isRitualMonster = (c: CardData) => isMonster(c) && c.type.includes('Ritual');
export const isTuner = (c: CardData) => c.type.includes('Tuner');
export const isExtraDeckMonster = (c: CardData) => isFusion(c) || isSynchro(c);
export const isFlipMonster = (c: CardData) => c.type.includes('Flip');
export const isNormalMonster = (c: CardData) => c.type === 'Normal Monster' || c.type === 'Normal Tuner Monster';

export const spellSubtype = (c: CardData) => (isSpell(c) ? c.race : '');
export const trapSubtype = (c: CardData) => (isTrap(c) ? c.race : '');
export const isQuickPlay = (c: CardData) => isSpell(c) && c.race === 'Quick-Play';
export const isContinuousSpellTrap = (c: CardData) => (isSpell(c) || isTrap(c)) && c.race === 'Continuous';
export const isEquipSpell = (c: CardData) => isSpell(c) && c.race === 'Equip';
export const isFieldSpell = (c: CardData) => isSpell(c) && c.race === 'Field';
export const isRitualSpell = (c: CardData) => isSpell(c) && c.race === 'Ritual';

/**
 * Tipi di carta che il motore supporta. XYZ, Link, Pendulum e simili sono
 * fuori dallo scope della prima versione (regole "fino ai Synchro").
 */
export function isSupportedCard(c: CardData): boolean {
  const t = c.type;
  if (t.includes('XYZ') || t.includes('Link') || t.includes('Pendulum') || t.includes('Token') || t.includes('Skill')) return false;
  return isMonster(c) || isSpell(c) || isTrap(c);
}

/** Numero di tributi necessari per l'evocazione normale. */
export function tributesNeeded(c: CardData): number {
  const lvl = c.level ?? 0;
  if (lvl >= 7) return 2;
  if (lvl >= 5) return 1;
  return 0;
}

/**
 * Materiali di fusione: la descrizione dei mostri fusione inizia quasi sempre con
 * la lista dei materiali, es. "Gazelle the King of Mythical Beasts" + "Berfomet".
 * Se i nomi sono tra virgolette li estraiamo; altrimenti (materiali generici come
 * "1 Dragon monster + 1 monster") la fusione non è supportata.
 */
export function fusionMaterials(c: CardData): string[] | null {
  if (!isFusion(c)) return null;
  const firstLine = c.desc.split('\n')[0] ?? '';
  if (!firstLine.includes('+')) return null;
  const names = [...firstLine.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (names.length < 2) return null;
  // Se oltre ai nomi tra virgolette ci sono parti generiche ("+ 1 monster"), non supportato.
  const stripped = firstLine.replace(/"[^"]+"/g, '').replace(/[+\s]/g, '');
  if (stripped.length > 0) return null;
  return names;
}

/** Fusioni "a contatto" (XYZ, Neos): evocabili senza Polymerization bandendo o mandando al cimitero i materiali sul terreno. */
export function contactFusionMode(c: CardData): 'banish' | 'gy' | null {
  if (!isFusion(c)) return null;
  if (/Special Summoned \(from your Extra Deck\) by banishing the above cards you control/.test(c.desc)) return 'banish';
  if (/Special Summoned \(from your Extra Deck\) by sending the above cards you control to the (GY|Graveyard)/.test(c.desc)) return 'gy';
  if (/Special Summoned \(from your Extra Deck\) by (?:removing from play|banishing) the above (?:cards|monsters) (?:you control|on your side of the field)/.test(c.desc)) return 'banish';
  return null;
}

/** Requisito sui non-Tuner di un Synchro (es. "non-Tuner Dragon monsters"): razza o attributo, oppure null = qualsiasi. */
export function synchroNonTunerRequirement(c: CardData): { race?: string; attribute?: string } | null {
  if (!isSynchro(c)) return null;
  const firstLine = c.desc.split('\n')[0] ?? '';
  const m = firstLine.match(/non-Tuner\s+([A-Za-z-]+)\s+monsters?/i);
  if (!m) return null;
  const word = m[1];
  const ATTRS = ['DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE'];
  if (ATTRS.includes(word.toUpperCase())) return { attribute: word.toUpperCase() };
  return { race: word };
}

/** Nome del mostro rituale evocabile con una data magia rituale (null = qualsiasi). */
export function ritualSpellTarget(c: CardData): string | null {
  if (!isRitualSpell(c)) return null;
  const m = c.desc.match(/Ritual Summon "([^"]+)"/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Accesso allo stato.
// ---------------------------------------------------------------------------

export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export function findCard(state: GameState, uid: number): { card: CardInstance; zone: Zone; player: PlayerId; index: number } | null {
  for (const p of [0, 1] as PlayerId[]) {
    const ps = state.players[p];
    const zones: [Zone, (CardInstance | null)[]][] = [
      ['hand', ps.hand],
      ['deck', ps.deck],
      ['extraDeck', ps.extraDeck],
      ['graveyard', ps.graveyard],
      ['banished', ps.banished],
      ['monsterZone', ps.monsterZone],
      ['spellTrapZone', ps.spellTrapZone],
      ['fieldZone', [ps.fieldZone]],
    ];
    for (const [zone, arr] of zones) {
      const i = arr.findIndex((c) => c?.uid === uid);
      if (i >= 0) return { card: arr[i] as CardInstance, zone, player: p, index: i };
    }
  }
  return null;
}

export type Zone = 'hand' | 'deck' | 'extraDeck' | 'graveyard' | 'banished' | 'monsterZone' | 'spellTrapZone' | 'fieldZone';

export function monstersOf(ps: PlayerState): CardInstance[] {
  return ps.monsterZone.filter((c): c is CardInstance => c !== null);
}

export function spellTrapsOf(ps: PlayerState): CardInstance[] {
  return ps.spellTrapZone.filter((c): c is CardInstance => c !== null);
}

export function freeMonsterSlots(ps: PlayerState): number {
  return ps.monsterZone.filter((c) => c === null).length;
}

export function freeSpellTrapSlots(ps: PlayerState): number {
  return ps.spellTrapZone.filter((c) => c === null).length;
}

/** ATK effettivo di un mostro sul terreno (base + modificatori). */
export function currentAtk(db: CardDb, card: CardInstance): number {
  return Math.max(0, (db[card.cardId].atk ?? 0) + (card.atkMod ?? 0) + (card.tempAtkMod ?? 0));
}

export function currentDef(db: CardDb, card: CardInstance): number {
  return Math.max(0, (db[card.cardId].def ?? 0) + (card.defMod ?? 0) + (card.tempDefMod ?? 0));
}

export const isToken = (c: CardData) => c.type === 'Token';

// ---------------------------------------------------------------------------
// Generatore casuale deterministico (mulberry32) per pescate e mischiate
// riproducibili nei test.
// ---------------------------------------------------------------------------

export function nextRandom(state: GameState): number {
  let t = (state.rngSeed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffleInPlace<T>(state: GameState, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
