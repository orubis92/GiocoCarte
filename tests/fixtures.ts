import type { CardData, CardDb } from '../src/engine/types';

// Database di carte fittizio ma fedele ai dati reali di YGOPRODeck per le
// carte usate nei test (nomi, tipi, statistiche). Consente di testare il
// motore senza rete.

let nextId = 1000;
const db: CardDb = {};

function add(c: Omit<CardData, 'id' | 'frameType'> & { id?: number; frameType?: string }): CardData {
  const id = c.id ?? nextId++;
  const frameType = c.frameType ?? (c.type.includes('Spell') ? 'spell' : c.type.includes('Trap') ? 'trap' : c.type.includes('Fusion') ? 'fusion' : c.type.includes('Synchro') ? 'synchro' : c.type.includes('Ritual') ? 'ritual' : c.type.includes('Effect') ? 'effect' : 'normal');
  const data = { ...c, id, frameType } as CardData;
  db[id] = data;
  return data;
}

const M = (name: string, level: number, atk: number, def: number, extra: Partial<CardData> = {}) =>
  add({ name, type: 'Normal Monster', desc: '', race: 'Warrior', attribute: 'EARTH', level, atk, def, ...extra });
const E = (name: string, level: number, atk: number, def: number, extra: Partial<CardData> = {}) =>
  add({ name, type: 'Effect Monster', desc: '', race: 'Warrior', attribute: 'DARK', level, atk, def, ...extra });
const S = (name: string, race = 'Normal', desc = '') => add({ name, type: 'Spell Card', desc, race });
const T = (name: string, race = 'Normal') => add({ name, type: 'Trap Card', desc: '', race });

export const C = {
  // mostri normali
  blueEyes: M('Blue-Eyes White Dragon', 8, 3000, 2500, { race: 'Dragon', attribute: 'LIGHT' }),
  summonedSkull: M('Summoned Skull', 6, 2500, 1200, { race: 'Fiend', attribute: 'DARK' }),
  geminiElf: M('Gemini Elf', 4, 1900, 900, { race: 'Spellcaster' }),
  celticGuardian: M('Celtic Guardian', 4, 1400, 1200),
  mysticalElf: M('Mystical Elf', 4, 800, 2000, { race: 'Spellcaster', attribute: 'LIGHT' }),
  kuriboh: M('Kuriboh', 1, 300, 200, { race: 'Fiend' }),
  gazelle: M('Gazelle the King of Mythical Beasts', 4, 1500, 1200, { race: 'Beast' }),
  berfomet: M('Berfomet', 5, 1400, 1800, { race: 'Fiend' }),
  // mostri effetto
  manEaterBug: E('Man-Eater Bug', 2, 450, 600, { type: 'Flip Effect Monster', race: 'Insect', attribute: 'EARTH' }),
  sangan: E('Sangan', 3, 1000, 600, { race: 'Fiend' }),
  mysticTomato: E('Mystic Tomato', 4, 1400, 1100, { race: 'Plant' }),
  marshmallon: E('Marshmallon', 3, 300, 500, { race: 'Fairy', attribute: 'LIGHT' }),
  jinzo: E('Jinzo', 6, 2400, 1500, { race: 'Machine' }),
  maraudingCaptain: E('Marauding Captain', 3, 1200, 400, { attribute: 'EARTH' }),
  exiledForce: E('Exiled Force', 4, 1000, 1000, { attribute: 'EARTH' }),
  junkSynchron: E('Junk Synchron', 3, 1300, 500, { type: 'Tuner Monster' }),
  speedWarrior: E('Speed Warrior', 2, 900, 400, { attribute: 'WIND' }),
  // extra deck
  chimera: add({ name: 'Chimera the Flying Mythical Beast', type: 'Fusion Monster', desc: '"Gazelle the King of Mythical Beasts" + "Berfomet"', race: 'Beast', attribute: 'WIND', level: 6, atk: 2100, def: 1800 }),
  junkWarrior: add({ name: 'Junk Warrior', type: 'Synchro Monster', desc: '"Junk Synchron" + 1 or more non-Tuner monsters\nWhen this card is Synchro Summoned: It gains ATK equal to the total ATK of all Level 2 or lower monsters you currently control.', race: 'Warrior', attribute: 'DARK', level: 5, atk: 2300, def: 1300 }),
  goyo: add({ name: 'Goyo Guardian', type: 'Synchro Monster', desc: '1 Tuner + 1 or more non-Tuner monsters', race: 'Warrior', attribute: 'EARTH', level: 6, atk: 2800, def: 2000 }),
  // rituale
  relinquished: add({ name: 'Relinquished', type: 'Ritual Effect Monster', desc: '', race: 'Spellcaster', attribute: 'DARK', level: 1, atk: 0, def: 0 }),
  blackIllusionRitual: S('Black Illusion Ritual', 'Ritual', 'This card is used to Ritual Summon "Relinquished". You must also Tribute monsters from your hand or field whose total Levels equal 1 or more.'),
  // magie
  potOfGreed: S('Pot of Greed'),
  gracefulCharity: S('Graceful Charity'),
  darkHole: S('Dark Hole'),
  raigeki: S('Raigeki'),
  monsterReborn: S('Monster Reborn'),
  mst: S('Mystical Space Typhoon', 'Quick-Play'),
  polymerization: S('Polymerization'),
  changeOfHeart: S('Change of Heart'),
  bookOfMoon: S('Book of Moon', 'Quick-Play'),
  swords: S('Swords of Revealing Light', 'Continuous'),
  axe: S('Axe of Despair', 'Equip'),
  fissure: S('Fissure'),
  unsupportedSpell: S('Some Unsupported Spell'),
  // trappole
  mirrorForce: T('Mirror Force'),
  trapHole: T('Trap Hole'),
  magicCylinder: T('Magic Cylinder'),
  sakuretsu: T('Sakuretsu Armor'),
  waboku: T('Waboku'),
  callOfTheHaunted: T('Call of the Haunted', 'Continuous'),
  negateAttack: T('Negate Attack', 'Counter'),
};

export const DB = db;

/** Deck di prova: 40 carte con un po' di tutto. */
export function sampleDeck(): { main: number[]; extra: number[] } {
  const main: number[] = [];
  const push = (c: CardData, n: number) => { for (let i = 0; i < n; i++) main.push(c.id); };
  push(C.blueEyes, 1); push(C.summonedSkull, 2); push(C.geminiElf, 3); push(C.celticGuardian, 3); push(C.mysticalElf, 2);
  push(C.kuriboh, 1); push(C.gazelle, 2); push(C.berfomet, 2); push(C.manEaterBug, 2); push(C.sangan, 1); push(C.mysticTomato, 2);
  push(C.marshmallon, 1); push(C.jinzo, 1); push(C.maraudingCaptain, 2); push(C.exiledForce, 1); push(C.junkSynchron, 2); push(C.speedWarrior, 2);
  push(C.potOfGreed, 1); push(C.gracefulCharity, 1); push(C.darkHole, 1); push(C.raigeki, 1); push(C.monsterReborn, 1); push(C.mst, 1);
  push(C.polymerization, 1); push(C.changeOfHeart, 1); push(C.bookOfMoon, 1); push(C.swords, 1); push(C.axe, 1); push(C.fissure, 1);
  push(C.mirrorForce, 1); push(C.trapHole, 1); push(C.magicCylinder, 1); push(C.sakuretsu, 1); push(C.waboku, 1); push(C.callOfTheHaunted, 1);
  push(C.relinquished, 1); push(C.blackIllusionRitual, 1);
  return { main, extra: [C.chimera.id, C.junkWarrior.id, C.goyo.id] };
}
