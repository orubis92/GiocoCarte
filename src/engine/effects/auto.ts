import type { CardData, CardInstance, MonsterPosition, PlayerId } from '../types';
import { isExtraDeckMonster, isFusion, isMonster, isQuickPlay, isSpell, isTrap, isNormalMonster } from '../cards';
import type { Activation, CardScript, EffectContext, Trigger, TriggerKind } from './types';

// ---------------------------------------------------------------------------
// Interprete automatico del testo delle carte.
//
// Riconosce le formule ricorrenti del testo inglese ("Draw 2 cards.", "Target 1
// monster on the field; destroy it.", "FLIP: ...", "When an opponent's monster
// declares an attack: ...") e le traduce in uno script eseguibile dal motore.
// È volutamente conservativo: se anche una sola frase non viene capita, la
// carta NON viene resa attivabile (magie/trappole) o riceve solo le restrizioni
// (mostri), mai un effetto parziale che potrebbe avvantaggiarla.
// ---------------------------------------------------------------------------

// ------------------------------------------------------------ normalizzazione

const REPLACEMENTS: [RegExp, string][] = [
  [/\r\n|\r/g, '\n'],
  [/\([^()]*\)/g, ''], // testo tra parentesi: chiarimenti di regole
  [/●/g, '\n●'],
  [/Life Points/g, 'LP'],
  [/Graveyard/g, 'GY'],
  [/removed from play/gi, 'banished'],
  [/remove(d)? from play/gi, 'banish$1'],
  [/Remove from play/g, 'Banish'],
  [/-Type monsters?/g, ' monster'],
  [/Type monsters?/g, 'monster'],
  [/-Type\b/g, ''],
  [/on your side of the field/g, 'you control'],
  [/on your opponent's side of the field/g, 'your opponent controls'],
  [/on the opponent's side of the field/g, 'your opponent controls'],
  [/from your side of the field/g, 'you control'],
  [/from your opponent's side of the field/g, 'your opponent controls'],
  [/Increase your LP by (\d+) points?/g, 'Gain $1 LP'],
  [/Increases? the LP of both players by (\d+) points?/g, 'Both players gain $1 LP'],
  [/Increase your opponent's LP by (\d+) points?/g, 'Your opponent gains $1 LP'],
  [/Decrease your opponent's LP by (\d+) points?/g, 'Inflict $1 damage to your opponent'],
  [/Inflict (\d+) points of (Direct )?damage to your opponent('s LP)?/g, 'Inflict $1 damage to your opponent'],
  [/Inflict (\d+) points of damage to your opponent/g, 'Inflict $1 damage to your opponent'],
  [/your opponent takes (\d+) damage/g, 'Inflict $1 damage to your opponent'],
  [/Your opponent takes (\d+) damage/g, 'Inflict $1 damage to your opponent'],
  [/Select (\d+|up to \d+)/g, 'Target $1'],
  [/Choose (\d+|up to \d+)/g, 'Target $1'],
  [/is sent to the GY as a result of battle/g, 'is destroyed by battle and sent to the GY'],
  [/is destroyed and sent to the GY as a result of battle/g, 'is destroyed by battle and sent to the GY'],
  [/is destroyed by battle and sent to the GY/g, 'is destroyed by battle'],
  [/is destroyed by battle with an opponent's monster/g, 'is destroyed by battle'],
  [/as a result of battle/g, 'by battle'],
  [/destroys an opponent's monster by battle and sends it to the GY/g, 'destroys a monster by battle'],
  [/destroys a monster by battle and sends it to the GY/g, 'destroys a monster by battle'],
  [/destroys an opponent's monster by battle/g, 'destroys a monster by battle'],
  [/destroys a monster and sends it to the GY by battle/g, 'destroys a monster by battle'],
  [/in face-up (Attack|Defense) Position/g, 'in $1 Position'],
  [/face-up Attack Position/g, 'Attack Position'],
  [/Battle Damage/g, 'battle damage'],
  [/Monster Cards?/g, 'monster'],
  [/(Normal|Special|Flip) Summoned successfully/g, '$1 Summoned'],
  [/your opponent's LP directly/g, 'your opponent directly'],
  [/This monster/g, 'This card'],
  [/^Gains (\d+) ATK/g, 'This card gains $1 ATK'],
  [/\. Gains (\d+) ATK/g, '. This card gains $1 ATK'],
  [/Discard (\d+|a|one) (.+?) from your hand to the GY/g, 'Discard $1 $2'],
  [/Discard (\d+|a|one) (cards?) to the GY/g, 'Discard $1 $2'],
  [/Send (\d+|a|one) (.+?) from your hand to the GY/g, 'Discard $1 $2'],
  [/discard (\d+|a|one) (.+?) from your hand to the GY/g, 'discard $1 $2'],
  [/send (\d+|a|one) (.+?) from your hand to the GY/g, 'discard $1 $2'],
  [/discard this card to the GY/g, 'discard this card'],
  [/Tribute (\d+|a|one) (.+?) as a Tribute/g, 'Tribute $1 $2'],
  [/[Oo]ffer (\d+|a|one) (.+?) as a Tribute/g, 'Tribute $1 $2'],
  [/all your opponent's (.+?) monsters/g, 'all $1 monsters your opponent controls'],
  [/all your opponent's monsters/g, 'all monsters your opponent controls'],
  [/for every /g, 'for each '],
  [/in any GY/g, 'in either GY'],
  [/  +/g, ' '],
  [/ \./g, '.'],
  [/ ,/g, ','],
  [/ :/g, ':'],
];

export function normalizeText(desc: string): string {
  let t = desc;
  for (const [re, rep] of REPLACEMENTS) t = t.replace(re, rep);
  return t.trim();
}

/** Divide il testo in frasi. I ':' che introducono un effetto restano attaccati alla testa. */
function sentences(text: string): string[] {
  return text
    .split('\n')
    .flatMap((line) => line.split(/(?<=\.)\s+(?=[A-Z"●])/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ------------------------------------------------------------------- filtri

const RACES = ['Aqua', 'Beast-Warrior', 'Beast', 'Dinosaur', 'Divine-Beast', 'Dragon', 'Fairy', 'Fiend', 'Fish', 'Insect', 'Machine', 'Plant', 'Psychic', 'Pyro', 'Reptile', 'Rock', 'Sea Serpent', 'Spellcaster', 'Thunder', 'Warrior', 'Winged Beast', 'Zombie'];
const ATTRS = ['DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE'];

const MONSTER_KINDS = new Set(['monster', 'normalMonster', 'fusion', 'ritual', 'flipMonster', 'effectMonster', 'tuner']);

type Zone = 'field' | 'myField' | 'oppField' | 'myGY' | 'oppGY' | 'eitherGY' | 'myDeck' | 'myHand' | 'myHandOrDeck' | 'myDeckOrGY' | 'myHandDeckOrGY' | 'oppHand' | 'myBanished' | 'eitherBanished';

interface Filter {
  races?: string[];
  kind: 'monster' | 'spell' | 'trap' | 'spelltrap' | 'card' | 'equip' | 'fusion' | 'ritual' | 'normalMonster' | 'fieldSpell' | 'flipMonster' | 'effectMonster' | 'tuner';
  faceState?: 'up' | 'down';
  position?: 'atk' | 'def';
  levelMin?: number;
  levelMax?: number;
  levelEq?: number;
  atkMax?: number;
  atkMin?: number;
  defMax?: number;
  attribute?: string;
  race?: string;
  nameIncludes?: string;
  nameEquals?: string;
  nameExcludes?: string;
  zone: Zone;
}

const KIND_WORDS: [RegExp, Filter['kind']][] = [
  [/^Normal Monsters?$/, 'normalMonster'],
  [/^Flip (?:Effect )?Monsters?$/, 'flipMonster'],
  [/^Effect Monsters?$/, 'effectMonster'],
  [/^Tuner( monster)?s?$/, 'tuner'],
  [/^Fusion Monsters?$/, 'fusion'],
  [/^Ritual Monsters?$/, 'ritual'],
  [/^Field Spells?( Cards?)?$/, 'fieldSpell'],
  [/^Equip Cards?$/, 'equip'],
  [/^Equip Spells?( Cards?)?$/, 'equip'],
  [/^(Spell\/Trap|Spell or Trap|Spell and Trap|Spells? and Traps?|Spells?\/Traps?)( Cards?)?$/, 'spelltrap'],
  [/^Spells?( Cards?)?$/, 'spell'],
  [/^Traps?( Cards?)?$/, 'trap'],
  [/^monsters?$/, 'monster'],
  [/^cards?$/, 'card'],
];

const ZONE_WORDS: [RegExp, Zone][] = [
  [/^(you control|on your field|from your field|in your Monster Zone)$/, 'myField'],
  [/^(your opponent controls|on your opponent's field|from your opponent's field|they control)$/, 'oppField'],
  [/^(on the field|from the field|on either field)$/, 'field'],
  [/^(in your GY|from your GY)$/, 'myGY'],
  [/^(in your opponent's GY|from your opponent's GY)$/, 'oppGY'],
  [/^(in either GY|from either GY|in either player's GY|from either player's GY|in any GY|in the GYs?|from the GY)$/, 'eitherGY'],
  [/^(from your Deck|in your Deck)$/, 'myDeck'],
  [/^(from your hand or Deck|from your Deck or hand|in your hand or Deck)$/, 'myHandOrDeck'],
  [/^(from your Deck or GY|from your Deck or Graveyard|in your Deck or GY)$/, 'myDeckOrGY'],
  [/^(from your hand, Deck, or GY|from your hand, Deck or GY)$/, 'myHandDeckOrGY'],
  [/^(from your hand|in your hand)$/, 'myHand'],
  [/^(from your opponent's hand|in your opponent's hand)$/, 'oppHand'],
  [/^(of your banished cards|you have banished|that is banished|from your banished cards)$/, 'myBanished'],
  [/^(that are banished|banished)$/, 'eitherBanished'],
];

/**
 * Analizza una descrizione di gruppo di carte, es. "face-up Level 4 or lower
 * DARK Fiend monsters your opponent controls". Ritorna null se non capita.
 */
function parseFilter(raw: string, defaultZone: Zone): Filter | null {
  let s = raw.trim().replace(/\s+/g, ' ').replace(/,? except this card$/, '').replace(/,? other than this card$/, '').replace(/ that can be Normal Summoned\/Set$/, '');
  const f: Partial<Filter> = {};
  const exc = s.match(/^(.*?),? except "([^"]+)"$/);
  if (exc) { f.nameExcludes = exc[2]; s = exc[1].trim(); }
  if (!/Spell\/Trap|Spells\/Traps|ATK\/DEF/.test(s)) s = s.replace(/(\w)\/(\w)/g, '$1 $2');
  // Liste di tipi: "Insect, Beast, Plant, and Beast-Warrior monsters"
  const raceAlt = RACES.map((r) => r.replace('-', '\\-')).join('|');
  const list = s.match(new RegExp(`^(.*?)\\b((?:${raceAlt})(?:(?:,\\s*|,?\\s+and\\s+|,?\\s+or\\s+)(?:${raceAlt}))+)\\b(.*)$`));
  if (list) {
    f.races = list[2].split(/,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+/).map((x) => x.trim()).filter(Boolean);
    s = `${list[1]}${list[3]}`.replace(/\s+/g, ' ').trim();
  }
  // Nome tra virgolette: "Polymerization" / "Toon" card / face-up "Elemental HERO" monster you control
  const q = s.match(/^(.*?)"([^"]+)"( .*)?$/);
  if (q) {
    f.nameIncludes = q[2];
    const before = q[1].trim();
    const after = (q[3] ?? '').trim();
    const hasKind = /\b(card|cards|monster|monsters|Monster|Monsters)\b/.test(`${before} ${after}`);
    s = hasKind ? `${before} ${after}` : `${before} card ${after}`;
    s = s.replace(/\s+/g, ' ').trim();
  }
  // Qualificatori in coda: "with 1500 or less ATK", "whose ATK is 2000 or more", "with a Level of 4 or lower"
  const trailing: [RegExp, (m: RegExpMatchArray) => void][] = [
    [/ with (\d+) or less ATK$/, (m) => { f.atkMax = Number(m[1]); }],
    [/ with (?:an )?ATK (?:of )?(\d+) or less$/, (m) => { f.atkMax = Number(m[1]); }],
    [/ whose ATK is (\d+) or less$/, (m) => { f.atkMax = Number(m[1]); }],
    [/ with (\d+) or more ATK$/, (m) => { f.atkMin = Number(m[1]); }],
    [/ with (?:an )?ATK (?:of )?(\d+) or more$/, (m) => { f.atkMin = Number(m[1]); }],
    [/ whose ATK is (\d+) or more$/, (m) => { f.atkMin = Number(m[1]); }],
    [/ with (\d+) or less DEF$/, (m) => { f.defMax = Number(m[1]); }],
    [/ with (?:a )?DEF (?:of )?(\d+) or less$/, (m) => { f.defMax = Number(m[1]); }],
    [/ whose DEF is (\d+) or less$/, (m) => { f.defMax = Number(m[1]); }],
    [/ with a Level of (\d+) or lower$/, (m) => { f.levelMax = Number(m[1]); }],
    [/ with a Level of (\d+) or higher$/, (m) => { f.levelMin = Number(m[1]); }],
    [/ that is Level (\d+) or lower$/, (m) => { f.levelMax = Number(m[1]); }],
    [/ that is Level (\d+) or higher$/, (m) => { f.levelMin = Number(m[1]); }],
    [/ that can be Normal Summoned\/Set$/, () => { /* qualificatore ignorato */ }],
  ];
  // Zona (in coda)
  let zone: Zone | null = null;
  for (const [re, z] of ZONE_WORDS) {
    const m = s.match(new RegExp(`^(.*?) (${re.source.slice(1, -1)})$`));
    if (m) {
      zone = z;
      s = m[1];
      break;
    }
  }
  for (let guard = 0; guard < 3; guard++) {
    let hit = false;
    for (const [re, fn] of trailing) {
      const m = s.match(re);
      if (m) { fn(m); s = s.replace(re, ''); hit = true; }
    }
    if (!hit) break;
  }
  const words = s.split(' ');
  // Il tipo di carta è alla fine (1-3 parole)
  let kind: Filter['kind'] | null = null;
  let kindLen = 0;
  for (let len = Math.min(4, words.length); len >= 1; len--) {
    const tail = words.slice(words.length - len).join(' ');
    for (const [re, k] of KIND_WORDS) {
      if (re.test(tail)) {
        kind = k;
        kindLen = len;
        break;
      }
    }
    if (kind) break;
  }
  if (!kind) return null;
  const mods = words.slice(0, words.length - kindLen).join(' ');
  let rest = mods;
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = rest.match(re);
    if (m) rest = rest.replace(re, '').replace(/\s+/g, ' ').trim();
    return m;
  };
  if (take(/\bface-up\b/)) f.faceState = 'up';
  if (take(/\bface-down( Defense Position)?\b/)) f.faceState = 'down';
  if (take(/\bSet\b/)) f.faceState = 'down';
  if (take(/\bAttack Position\b/)) f.position = 'atk';
  if (take(/\bDefense Position\b/)) f.position = 'def';
  let m = take(/\bLevel (\d+) or (higher|lower)\b/);
  if (m) {
    if (m[2] === 'higher') f.levelMin = Number(m[1]);
    else f.levelMax = Number(m[1]);
  }
  m = take(/\bLevel (\d+)\b/);
  if (m) f.levelEq = Number(m[1]);
  m = take(/\bwith (\d+) or less ATK\b/) ?? take(/\bwith ATK (\d+) or less\b/) ?? take(/\bwhose ATK is (\d+) or less\b/);
  if (m) f.atkMax = Number(m[1]);
  m = take(/\bwith (\d+) or more ATK\b/) ?? take(/\bwith ATK (\d+) or more\b/);
  if (m) f.atkMin = Number(m[1]);
  m = take(/\bwith (\d+) or less DEF\b/) ?? take(/\bwith DEF (\d+) or less\b/);
  if (m) f.defMax = Number(m[1]);
  for (const a of ATTRS) if (take(new RegExp(`\\b${a}\\b`))) f.attribute = a;
  for (const r of RACES) if (take(new RegExp(`\\b${r}\\b`))) f.race = r;
  if (take(/^(a|an|1|one)$/)) { /* articolo */ }
  rest = rest.replace(/^(a|an|1|one)\s+/, '').trim();
  if (rest.length > 0) return null; // parole non capite
  return { ...f, kind, zone: zone ?? defaultZone } as Filter;
}

// ------------------------------------------------------------------- passi

type Who = 'you' | 'opp' | 'both';

type Step =
  | { kind: 'draw'; who: Who; n: number }
  | { kind: 'discard'; who: Who; n: number; filter?: Filter }
  | { kind: 'gainLp'; who: Who; n: number }
  | { kind: 'damage'; who: Who; n: number }
  | { kind: 'payLp'; n: number }
  | { kind: 'all'; verb: 'destroy' | 'banish' | 'returnToHand' | 'toDefense' | 'toGraveyard'; filter: Filter }
  | { kind: 'target'; verb: TargetVerb; filter: Filter; min: number; max: number; position?: MonsterPosition }
  | { kind: 'fromDeck'; verb: 'addToHand' | 'specialSummon' | 'toGraveyard'; filter: Filter; min: number; max: number; position?: MonsterPosition }
  | { kind: 'mill'; n: number }
  | { kind: 'millOpp'; n: number }
  | { kind: 'negateAttack' }
  | { kind: 'endBattle' }
  | { kind: 'eventMonster'; verb: 'destroy' | 'banish' | 'returnToHand' | 'toGraveyard' }
  | { kind: 'noAttack'; who: Who }
  | { kind: 'skipDraw'; who: Who; n: number }
  | { kind: 'tributeSelf' }
  | { kind: 'selfFaceDown' }
  | { kind: 'selfSummon'; position: MonsterPosition }
  | { kind: 'cond'; filter: Filter; min: number; max: number }
  | { kind: 'per'; what: 'damage' | 'gainLp'; who: Who; n: number; filter: Filter }
  | { kind: 'noop' };

type TargetVerb = 'destroy' | 'banish' | 'returnToHand' | 'specialSummon' | 'addToHand' | 'toGraveyard' | 'takeControl' | 'takeControlTemp' | 'flipFaceDown' | 'discard' | 'toDeck' | 'toDefense' | 'toTopOfDeck';

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
const num = (s: string) => (s in NUM ? NUM[s] : Number(s));

/** Riconosce un singolo passo. Ritorna null se non capito. */
function parseStep(raw: string, defaultZone: Zone): Step | null {
  let s = raw.trim().replace(/\.$/, '').replace(/,$/, '').trim();
  if (s.length === 0) return { kind: 'noop' };
  s = s.replace(/^(then|and|also|and if you do|if you do|you can|You can) /, '');
  s = s[0].toUpperCase() + s.slice(1);
  let m: RegExpMatchArray | null;

  if ((m = s.match(/^Draw (\d+|a|one|two|three) cards?$/))) return { kind: 'draw', who: 'you', n: num(m[1]) };
  if ((m = s.match(/^Your opponent draws (\d+|a|one|two|three) cards?$/))) return { kind: 'draw', who: 'opp', n: num(m[1]) };
  if ((m = s.match(/^(Both players|Each player) draws? (\d+|a|one|two|three) cards?$/))) return { kind: 'draw', who: 'both', n: num(m[2]) };
  if ((m = s.match(/^Discard (\d+|a|one|two|three) cards?( from your hand)?$/))) return { kind: 'discard', who: 'you', n: num(m[1]) };
  if ((m = s.match(/^Discard (\d+|a|one) (.+?)( from your hand)?$/))) {
    const f = parseFilter(m[2], 'myHand');
    if (f && f.zone === 'myHand') return { kind: 'target', verb: 'discard', filter: f, min: num(m[1]), max: num(m[1]) };
    return null;
  }
  if ((m = s.match(/^Your opponent discards (\d+|a|one|two) (?:random )?cards?( at random)?( from their hand)?$/))) return { kind: 'discard', who: 'opp', n: num(m[1]) };
  if ((m = s.match(/^Gain (\d+) LP$/))) return { kind: 'gainLp', who: 'you', n: Number(m[1]) };
  if ((m = s.match(/^Your opponent gains (\d+) LP$/))) return { kind: 'gainLp', who: 'opp', n: Number(m[1]) };
  if ((m = s.match(/^Both players gain (\d+) LP$/))) return { kind: 'gainLp', who: 'both', n: Number(m[1]) };
  if ((m = s.match(/^Inflict (\d+) damage to your opponent$/))) return { kind: 'damage', who: 'opp', n: Number(m[1]) };
  if ((m = s.match(/^(You take|Take) (\d+) (?:points of )?damage$/))) return { kind: 'damage', who: 'you', n: Number(m[2]) };
  if ((m = s.match(/^You lose (\d+) LP$/))) return { kind: 'damage', who: 'you', n: Number(m[1]) };
  if ((m = s.match(/^Both players take (\d+) damage$/))) return { kind: 'damage', who: 'both', n: Number(m[1]) };
  if ((m = s.match(/^Pay (\d+) LP$/))) return { kind: 'payLp', n: Number(m[1]) };
  if ((m = s.match(/^Send the top (\d+|one|two|three|four|five) cards? of your Deck to the GY$/))) return { kind: 'mill', n: num(m[1]) };
  if ((m = s.match(/^Send the top (\d+|one|two|three|four|five|card) cards? of (?:their|your opponent's) Deck to the GY$/)) || (m = s.match(/^Send the top card of (?:their|your opponent's) Deck to the GY$/))) return { kind: 'millOpp', n: m[1] && m[1] !== 'card' ? num(m[1]) : 1 };
  if (/^Negate (the|that) attack$/.test(s)) return { kind: 'negateAttack' };
  if (/^End the Battle Phase$/.test(s)) return { kind: 'endBattle' };
  if (/^Your opponent cannot declare an attack this turn$/.test(s)) return { kind: 'noAttack', who: 'opp' };
  if (/^Monsters cannot attack this turn$/.test(s)) return { kind: 'noAttack', who: 'both' };
  if ((m = s.match(/^Skip (your|the) next (\d+|one|two) Draw Phases?$/)) || (m = s.match(/^Skip your next Draw Phase$/))) return { kind: 'skipDraw', who: 'you', n: m[2] ? num(m[2]) : 1 };
  if (/^Skip the Draw Phase of your opponent's next turn$/.test(s)) return { kind: 'skipDraw', who: 'opp', n: 1 };
  if (/^Tribute this (face-up )?card$/.test(s) || /^Send this (face-up )?card to the GY$/.test(s)) return { kind: 'tributeSelf' };
  if ((m = s.match(/^Special Summon this card(?: from your hand)?(?: in (Attack|Defense) Position)?$/))) return { kind: 'selfSummon', position: m[1] === 'Defense' ? 'def' : 'atk' };
  if (/^Then shuffle your Deck$/.test(s) || /^Shuffle your Deck$/.test(s)) return { kind: 'noop' };
  if (/^(Flip|Change) this card (into|to) face-down Defense Position$/.test(s)) return { kind: 'selfFaceDown' };
  if (/^Look at your opponent's hand$/.test(s)) return { kind: 'noop' };
  if ((m = s.match(/^Inflict (\d+) damage to your opponent for each (.+)$/))) {
    const f = parseFilter(m[2], 'field');
    return f ? { kind: 'per', what: 'damage', who: 'opp', n: Number(m[1]), filter: f } : null;
  }
  if ((m = s.match(/^Gain (\d+) LP for each (.+)$/))) {
    const f = parseFilter(m[2], 'field');
    return f ? { kind: 'per', what: 'gainLp', who: 'you', n: Number(m[1]), filter: f } : null;
  }
  if (/^Each player discards (\d+|a|one) cards?$/.test(s)) return { kind: 'discard', who: 'both', n: num(s.split(' ')[3]) };
  if ((m = s.match(/^Tribute (\d+|a|one) (.+)$/))) {
    const f = parseFilter(m[2], 'myField');
    if (!f || f.zone !== 'myField' || (f.kind !== 'monster' && f.kind !== 'normalMonster')) return null;
    return { kind: 'target', verb: 'toGraveyard', filter: f, min: num(m[1]), max: num(m[1]) };
  }
  if ((m = s.match(/^Change (\d+|a|one) (.+?) to Defense Position$/))) {
    const f = parseFilter(m[2], 'field');
    return f ? { kind: 'target', verb: 'toDefense', filter: f, min: num(m[1]), max: num(m[1]) } : null;
  }

  // Verbi sul mostro dell'evento (attaccante / evocato)
  if (/^(Destroy|Banish|Return to the hand|Send to the GY) (the attacking monster|that monster|that attacking monster|it|the monster|the Summoned monster|that Summoned monster)$/.test(s) || (m = s.match(/^(Destroy|Banish) (the attacking monster|that monster|it|the Summoned monster)$/))) {
    const verb = s.startsWith('Destroy') ? 'destroy' : s.startsWith('Banish') ? 'banish' : s.startsWith('Return') ? 'returnToHand' : 'toGraveyard';
    return { kind: 'eventMonster', verb };
  }
  if ((m = s.match(/^Return (the attacking monster|that monster|it) to the hand$/))) return { kind: 'eventMonster', verb: 'returnToHand' };

  // "Destroy all X" / "Banish all X" / "Return all X to the hand"
  if ((m = s.match(/^(Destroy|Banish) all (?:other )?(.+)$/))) {
    const f = parseFilter(m[2], defaultZone);
    return f ? { kind: 'all', verb: m[1] === 'Destroy' ? 'destroy' : 'banish', filter: f } : null;
  }
  if ((m = s.match(/^Return all (.+) to the hand$/))) {
    const f = parseFilter(m[1], defaultZone);
    return f ? { kind: 'all', verb: 'returnToHand', filter: f } : null;
  }
  if ((m = s.match(/^Change all (.+) to Defense Position$/))) {
    const f = parseFilter(m[1], defaultZone);
    return f ? { kind: 'all', verb: 'toDefense', filter: f } : null;
  }
  if ((m = s.match(/^Send all (.+) to the GY$/))) {
    const f = parseFilter(m[1], defaultZone);
    return f ? { kind: 'all', verb: 'toGraveyard', filter: f } : null;
  }

  // "Target 1 X" (bersaglio, il verbo arriva nel passo successivo) → gestito da parseSteps
  // Verbo + oggetto diretto: "Destroy 1 X", "Add 1 X from your Deck to your hand", "Special Summon 1 X from your GY"
  if ((m = s.match(/^Add (\d+|a|one|up to \d+) (.+?) to your hand$/))) {
    const [min, max] = range(m[1]);
    const f = parseFilter(m[2], 'myDeck');
    if (!f) return null;
    if (f.zone === 'myDeck' || f.zone === 'myHandOrDeck' || f.zone === 'myDeckOrGY') return { kind: 'fromDeck', verb: 'addToHand', filter: f, min, max };
    return { kind: 'target', verb: 'addToHand', filter: f, min, max };
  }
  if ((m = s.match(/^Special Summon (\d+|a|one|up to \d+|any number of|as many .+? as possible) (.+?)(?: in (Attack|Defense) Position| in face-down Defense Position)?$/))) {
    const [min, max] = /^(any number of|as many)/.test(m[1]) ? [1, 5] : range(m[1]);
    const position: MonsterPosition = s.includes('face-down') ? 'facedown' : m[3] === 'Defense' ? 'def' : 'atk';
    const f = parseFilter(m[2].replace(/^"([^"]+)"s\b/, '"$1"'), 'myGY');
    if (!f) return null;
    if (f.kind === 'card' && f.nameIncludes) f.kind = 'monster';
    if (!MONSTER_KINDS.has(f.kind)) return null;
    if (f.zone === 'myDeck' || f.zone === 'myHand' || f.zone === 'myHandOrDeck' || f.zone === 'myDeckOrGY' || f.zone === 'myHandDeckOrGY') return { kind: 'fromDeck', verb: 'specialSummon', filter: f, min, max, position };
    if (f.zone === 'myGY' || f.zone === 'oppGY' || f.zone === 'eitherGY' || f.zone === 'myBanished') return { kind: 'target', verb: 'specialSummon', filter: f, min, max, position };
    return null;
  }
  if ((m = s.match(/^Send (\d+|a|one) (.+?) to the GY$/))) {
    const f = parseFilter(m[2], 'myDeck');
    if (!f) return null;
    if (f.zone === 'myDeck') return { kind: 'fromDeck', verb: 'toGraveyard', filter: f, min: num(m[1]), max: num(m[1]) };
    return { kind: 'target', verb: 'toGraveyard', filter: f, min: num(m[1]), max: num(m[1]) };
  }
  if ((m = s.match(/^(Destroy|Banish) (\d+|a|one|up to \d+) (.+)$/))) {
    const [min, max] = range(m[2]);
    const f = parseFilter(m[3], defaultZone);
    return f ? { kind: 'target', verb: m[1] === 'Destroy' ? 'destroy' : 'banish', filter: f, min, max } : null;
  }
  if ((m = s.match(/^Return (\d+|a|one|up to \d+) (.+?) to (the|its owner's|your|the owner's) hand$/))) {
    const [min, max] = range(m[2]);
    const f = parseFilter(m[2], defaultZone);
    return f ? { kind: 'target', verb: 'returnToHand', filter: f, min, max } : null;
  }
  if ((m = s.match(/^Take control of (\d+|a|one) (.+)$/))) {
    const f = parseFilter(m[2], 'oppField');
    return f ? { kind: 'target', verb: 'takeControl', filter: f, min: 1, max: 1 } : null;
  }
  return null;
}

function range(s: string): [number, number] {
  const m = s.match(/^up to (\d+)$/);
  if (m) return [1, Number(m[1])];
  const n = num(s);
  return [n, n];
}

/** Verbo applicato a un bersaglio dichiarato prima ("Target 1 X; destroy it"). */
function parseTargetVerb(raw: string): { verb: TargetVerb; position?: MonsterPosition } | null {
  const s = raw.trim().replace(/\.$/, '').replace(/^(then|and|and if you do|if you do) /, '');
  if (/^(destroy|Destroy) (it|that target|those targets|them|that card|that monster)$/.test(s)) return { verb: 'destroy' };
  if (/^(banish|Banish) (it|that target|those targets|them|that card|that monster)$/.test(s)) return { verb: 'banish' };
  if (/^(return|Return) (it|that target|those targets|them|that card|that monster) to (the|its owner's|the owner's|your) hand$/.test(s)) return { verb: 'returnToHand' };
  if (/^(return|Return) (it|that target|those targets|them) to the Deck$/.test(s)) return { verb: 'toDeck' };
  if (/^(return|Return|place|Place) (it|that target|those targets|them|that card) (to|on) the top of (the|your|its owner's|the owner's) Deck$/.test(s)) return { verb: 'toTopOfDeck' };
  if (/^(shuffle|Shuffle) (it|that target|those targets|them|all \d+( targets)?) into the Deck$/.test(s)) return { verb: 'toDeck' };
  if (/^(add|Add) (them|those targets|both those targets|both) to your hand$/.test(s)) return { verb: 'addToHand' };
  if (/^(banish|Banish) (those target|both)$/.test(s)) return { verb: 'banish' };
  if (/^(change|Change) (it|that target|that monster) to (face-up )?Defense Position$/.test(s)) return { verb: 'toDefense' };
  const ss = s.match(/^(Special Summon|special Summon) (it|that target|that monster|them|those targets|both)(?: in (Attack|Defense) Position| in face-down Defense Position)?$/);
  if (ss) return { verb: 'specialSummon', position: s.includes('face-down') ? 'facedown' : ss[3] === 'Defense' ? 'def' : 'atk' };
  if (/^(add|Add) (it|that target|that card) to your hand$/.test(s)) return { verb: 'addToHand' };
  if (/^(send|Send) (it|that target|that card) to the GY$/.test(s)) return { verb: 'toGraveyard' };
  if (/^(take|Take) control of (it|that target|that monster)$/.test(s)) return { verb: 'takeControl' };
  if (/^(take|Take) control of (it|that target|that monster) until the End Phase( of this turn)?$/.test(s)) return { verb: 'takeControlTemp' };
  if (/^(change|Change|flip|Flip) (it|that target|that monster) (to|into) face-down Defense Position$/.test(s)) return { verb: 'flipFaceDown' };
  return null;
}

/**
 * Estrae le condizioni in testa o in coda a una frase: "If you control a face-up X: ...",
 * "If only your opponent controls a monster, ...", "... while "Umi" is on the field".
 */
function extractConditions(text: string): { conds: Step[]; rest: string } | null {
  const conds: Step[] = [];
  let rest = text.trim();
  const cond = (filter: Filter | null, min: number, max: number): boolean => {
    if (!filter) return false;
    conds.push({ kind: 'cond', filter, min, max });
    return true;
  };
  const anyMonster = (zone: Zone): Filter => ({ kind: 'monster', zone });
  let m: RegExpMatchArray | null;
  for (let guard = 0; guard < 4; guard++) {
    if ((m = rest.match(/^If only your opponent controls (?:a|1|any) monsters?[,:]\s*(.*)$/))) {
      cond(anyMonster('oppField'), 1, 99); cond(anyMonster('myField'), 0, 0); rest = m[1]; continue;
    }
    if ((m = rest.match(/^If your opponent controls (?:a|1|any) monsters? and you control no monsters[,:]\s*(.*)$/))) {
      cond(anyMonster('oppField'), 1, 99); cond(anyMonster('myField'), 0, 0); rest = m[1]; continue;
    }
    if ((m = rest.match(/^If your opponent controls (?:a|1|any) monsters?(?: and you do not)?[,:]\s*(.*)$/))) {
      cond(anyMonster('oppField'), 1, 99); rest = m[1]; if (/and you do not/.test(m[0])) cond(anyMonster('myField'), 0, 0); continue;
    }
    if ((m = rest.match(/^(?:If|While) you control no (.+?)[,:]\s*(.*)$/))) {
      if (!cond(parseFilter(m[1], 'myField'), 0, 0)) return null; rest = m[2]; continue;
    }
    if ((m = rest.match(/^(?:If|While) you control (?:a|an|1|a face-up|1 face-up|any) (.+?)[,:]\s*(.*)$/))) {
      if (!cond(parseFilter(`face-up ${m[1]}`.replace('face-up face-up', 'face-up'), 'myField'), 1, 99)) return null; rest = m[2]; continue;
    }
    if ((m = rest.match(/^(?:If|While) (.+?) is (?:face-up )?on the field[,:]\s*(.*)$/))) {
      if (!cond(parseFilter(`face-up ${m[1]}`, 'field'), 1, 99)) return null; rest = m[2]; continue;
    }
    if ((m = rest.match(/^(?:If|While) there (?:is|are) (?:a|an|1|any) (.+?) on the field[,:]\s*(.*)$/))) {
      if (!cond(parseFilter(m[1], 'field'), 1, 99)) return null; rest = m[2]; continue;
    }
    if ((m = rest.match(/^(?:If|While) there are no (.+?) on the field[,:]\s*(.*)$/))) {
      if (!cond(parseFilter(m[1], 'field'), 0, 0)) return null; rest = m[2]; continue;
    }
    if ((m = rest.match(/^If you have no cards in your hand[,:]\s*(.*)$/))) {
      cond({ kind: 'card', zone: 'myHand' }, 0, 0); rest = m[1]; continue;
    }
    // Condizioni in coda
    if ((m = rest.match(/^(.*?)(?:,)? (?:when|while|if) (.+?) is (?:face-up )?on the field\.?$/))) {
      if (!cond(parseFilter(`face-up ${m[2]}`, 'field'), 1, 99)) return null; rest = m[1]; continue;
    }
    if ((m = rest.match(/^(.*?)(?:,)? (?:when|while|if) you control (?:a|an|1|a face-up|1 face-up) (.+?)\.?$/))) {
      if (!cond(parseFilter(`face-up ${m[2]}`.replace('face-up face-up', 'face-up'), 'myField'), 1, 99)) return null; rest = m[1]; continue;
    }
    if ((m = rest.match(/^(.*?)(?:,)? (?:when|while|if) you control no (.+?)\.?$/))) {
      if (!cond(parseFilter(m[2], 'myField'), 0, 0)) return null; rest = m[1]; continue;
    }
    break;
  }
  rest = rest.trim();
  if (rest.length > 0) rest = rest[0].toUpperCase() + rest.slice(1);
  return { conds, rest };
}

/** Ultimo frammento non capito (per la diagnostica della copertura). */
export let lastFailure = '';

/** Suddivide una frase-effetto in passi sequenziali. Ritorna null se un passo non è capito. */
function parseSteps(text: string, defaultZone: Zone): Step[] | null {
  const parts = text
    .replace(/\.$/, '')
    .split(/;\s+|,\s+then\s+|\.\s+(?=[A-Z])|,\s+and if you do,?\s+|,\s+also,?\s+|\s+and then\s+|,?\s+and\s+(?=(?:destroy|banish|return|send|add|Special Summon|take control|change|flip|shuffle|inflict|gain|draw|discard|then)\b)/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.replace(/^(?:you can|You can|then|and|also) /, ''))
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1));
  const steps: Step[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const t = p.match(/^Target (\d+|a|one|up to \d+) (.+)$/);
    if (t) {
      const [min, max] = range(t[1]);
      const v = i + 1 < parts.length ? parseTargetVerb(parts[i + 1]) : null;
      // "Target 1 X and 1 Y" → più bersagli con lo stesso verbo.
      const filterTexts = t[2].split(/\s+and\s+(?:1|a|an|one)\s+/);
      const filters = filterTexts.map((ft) => parseFilter(ft, defaultZone));
      if (filters.some((f) => !f) || !v) {
        lastFailure = filters.some((f) => !f) ? `[filtro] ${filterTexts[filters.findIndex((f) => !f)]}` : `[verbo] ${parts[i + 1] ?? '(manca)'}`;
        return null;
      }
      for (const f of filters) steps.push({ kind: 'target', verb: v.verb, filter: f!, min: filters.length > 1 ? 1 : min, max: filters.length > 1 ? 1 : max, position: v.position });
      i++;
      continue;
    }
    const st = parseStep(p, defaultZone);
    if (!st) {
      lastFailure = `[passo] ${p}`;
      return null;
    }
    steps.push(st);
  }
  return steps.length ? steps : null;
}

// ---------------------------------------------------------------- esecuzione

function matchesFilter(ctx: EffectContext, c: CardInstance, f: Filter, self: CardInstance): boolean {
  if (c.uid === self.uid) return false;
  const d = ctx.data(c.uid);
  if (!d) return false;
  switch (f.kind) {
    case 'monster': if (!isMonster(d)) return false; break;
    case 'normalMonster': if (!isNormalMonster(d)) return false; break;
    case 'flipMonster': if (!d.type.includes('Flip')) return false; break;
    case 'effectMonster': if (!isMonster(d) || isNormalMonster(d)) return false; break;
    case 'tuner': if (!d.type.includes('Tuner')) return false; break;
    case 'fusion': if (!isFusion(d)) return false; break;
    case 'ritual': if (!(isMonster(d) && d.type.includes('Ritual'))) return false; break;
    case 'spell': if (!isSpell(d)) return false; break;
    case 'trap': if (!isTrap(d)) return false; break;
    case 'spelltrap': if (!isSpell(d) && !isTrap(d)) return false; break;
    case 'equip': if (!(isSpell(d) && d.race === 'Equip')) return false; break;
    case 'fieldSpell': if (!(isSpell(d) && d.race === 'Field')) return false; break;
    case 'card': break;
  }
  const onField = c.position !== undefined || c.faceDown !== undefined;
  if (f.faceState === 'up' && onField && (c.position === 'facedown' || c.faceDown)) return false;
  if (f.faceState === 'down' && onField && !(c.position === 'facedown' || c.faceDown)) return false;
  if (f.position === 'atk' && c.position !== 'atk') return false;
  if (f.position === 'def' && !(c.position === 'def' || c.position === 'facedown')) return false;
  const lvl = d.level ?? 0;
  if (f.levelMin !== undefined && lvl < f.levelMin) return false;
  if (f.levelMax !== undefined && lvl > f.levelMax) return false;
  if (f.levelEq !== undefined && lvl !== f.levelEq) return false;
  if (f.atkMax !== undefined && (d.atk ?? 0) > f.atkMax) return false;
  if (f.atkMin !== undefined && (d.atk ?? 0) < f.atkMin) return false;
  if (f.defMax !== undefined && (d.def ?? 0) > f.defMax) return false;
  if (f.attribute && d.attribute !== f.attribute) return false;
  if (f.race && d.race !== f.race) return false;
  if (f.races && !f.races.includes(d.race)) return false;
  if (f.nameIncludes && !d.name.includes(f.nameIncludes)) return false;
  if (f.nameEquals && d.name !== f.nameEquals) return false;
  if (f.nameExcludes && d.name === f.nameExcludes) return false;
  return true;
}

function candidates(ctx: EffectContext, f: Filter, self: CardInstance): CardInstance[] {
  const st = ctx.state;
  const me = st.players[ctx.player];
  const op = st.players[ctx.opponent];
  const fieldOf = (p: typeof me) => [...p.monsterZone, ...p.spellTrapZone, p.fieldZone].filter((c): c is CardInstance => !!c);
  let pool: CardInstance[];
  switch (f.zone) {
    case 'field': pool = [...fieldOf(me), ...fieldOf(op)]; break;
    case 'myField': pool = fieldOf(me); break;
    case 'oppField': pool = fieldOf(op); break;
    case 'myGY': pool = me.graveyard; break;
    case 'oppGY': pool = op.graveyard; break;
    case 'eitherGY': pool = [...me.graveyard, ...op.graveyard]; break;
    case 'myDeck': pool = me.deck; break;
    case 'myHand': pool = me.hand; break;
    case 'myHandOrDeck': pool = [...me.hand, ...me.deck]; break;
    case 'myDeckOrGY': pool = [...me.deck, ...me.graveyard]; break;
    case 'myHandDeckOrGY': pool = [...me.hand, ...me.deck, ...me.graveyard]; break;
    case 'oppHand': pool = op.hand; break;
    case 'myBanished': pool = me.banished; break;
    case 'eitherBanished': pool = [...me.banished, ...op.banished]; break;
  }
  return pool.filter((c) => matchesFilter(ctx, c, f, self));
}

/** Un mostro può essere evocato specialmente da un effetto generico? */
function canSpecialSummonFrom(ctx: EffectContext, c: CardInstance, fromGy: boolean): boolean {
  const d = ctx.data(c.uid);
  if (!isMonster(d)) return false;
  if (isExtraDeckMonster(d) && !(fromGy && c.properlySummoned)) return false;
  if (autoScript(d)?.cannotSpecialSummon) return false;
  return true;
}

function applyVerb(ctx: EffectContext, verb: TargetVerb, uid: number, position?: MonsterPosition): void {
  switch (verb) {
    case 'destroy': ctx.destroy([uid]); break;
    case 'banish': ctx.banish(uid); break;
    case 'returnToHand': ctx.returnToHand(uid); break;
    case 'specialSummon': ctx.specialSummon(uid, ctx.player, position ?? 'atk'); break;
    case 'addToHand': ctx.addToHand(uid); break;
    case 'toGraveyard': ctx.toGraveyard(uid); break;
    case 'takeControl': ctx.takeControl(uid, ctx.player, false); break;
    case 'takeControlTemp': ctx.takeControl(uid, ctx.player, true); break;
    case 'flipFaceDown': ctx.flipFaceDown(uid); break;
    case 'discard': ctx.discard(uid); break;
    case 'toDeck': ctx.toDeck(uid); break;
    case 'toTopOfDeck': ctx.toTopOfDeck(uid); break;
    case 'toDefense': ctx.changeToDefense(uid); break;
  }
}

const who = (ctx: EffectContext, w: Who): PlayerId[] => (w === 'you' ? [ctx.player] : w === 'opp' ? [ctx.opponent] : [ctx.player, ctx.opponent]);

function eventMonster(ctx: EffectContext): CardInstance | null {
  if (!ctx.event) return null;
  if (ctx.event.kind === 'attack') return ctx.get(ctx.event.attackerUid);
  if (ctx.event.kind === 'summon') return ctx.get(ctx.event.cardUid);
  return null;
}

/** Combinazioni di bersagli per tutti i passi "target" (prodotto cartesiano, limitato). */
function targetCombos(ctx: EffectContext, steps: Step[], self: CardInstance): number[][] | undefined {
  const targetSteps = steps.filter((s): s is Extract<Step, { kind: 'target' }> => s.kind === 'target');
  if (targetSteps.length === 0) return undefined;
  let combos: number[][] = [[]];
  for (const ts of targetSteps) {
    let cands = candidates(ctx, ts.filter, self);
    if (ts.verb === 'specialSummon') cands = cands.filter((c) => canSpecialSummonFrom(ctx, c, ts.filter.zone !== 'myHand'));
    // Evita duplicati identici (stessa carta, stessa zona) per non moltiplicare le azioni.
    const seen = new Set<string>();
    cands = cands.filter((c) => {
      const key = `${c.cardId}:${c.position ?? c.faceDown ?? 'x'}:${c.controller}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const options: number[][] = [];
    const max = Math.min(ts.max, cands.length);
    for (let size = Math.min(ts.min, cands.length); size <= max; size++) {
      if (size === 0) continue;
      for (const combo of combinations(cands.map((c) => c.uid), size)) {
        options.push(combo);
        if (options.length >= 12) break;
      }
      if (options.length >= 12) break;
    }
    if (options.length === 0) return [];
    const next: number[][] = [];
    for (const c of combos) for (const o of options) {
      if (o.some((u) => c.includes(u))) continue;
      next.push([...c, ...o]);
      if (next.length >= 24) break;
    }
    combos = next;
  }
  return combos;
}

function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  if (k === 0) { yield []; return; }
  for (let i = 0; i <= arr.length - k; i++) for (const rest of combinations(arr.slice(i + 1), k - 1)) yield [arr[i], ...rest];
}

function canPay(ctx: EffectContext, steps: Step[]): boolean {
  for (const s of steps) {
    if (s.kind === 'cond') {
      const n = candidates(ctx, s.filter, ctx.card).length;
      if (n < s.min || n > s.max) return false;
    }
    if (s.kind === 'selfSummon') {
      const loc = ctx.get(ctx.card.uid);
      if (!loc || loc.position !== undefined || !ctx.hasFreeMonsterSlot(ctx.player)) return false;
      if (autoScript(ctx.data(ctx.card.uid))?.cannotSpecialSummon) return false;
    }
    if (s.kind === 'payLp' && ctx.state.players[ctx.player].lp <= s.n) return false;
    if (s.kind === 'draw' && s.who !== 'opp' && ctx.state.players[ctx.player].deck.length < s.n) return false;
    if (s.kind === 'discard' && s.who === 'you' && ctx.state.players[ctx.player].hand.filter((c) => c.uid !== ctx.card.uid).length < s.n) return false;
    if (s.kind === 'all' && candidates(ctx, s.filter, ctx.card).length === 0 && steps.length === 1) return false;
    if (s.kind === 'fromDeck' && s.min > 0 && candidates(ctx, s.filter, ctx.card).length === 0 && steps.length === 1) return false;
    if ((s.kind === 'fromDeck' && s.verb === 'specialSummon') && !ctx.hasFreeMonsterSlot(ctx.player)) return false;
    if (s.kind === 'target' && s.verb === 'specialSummon' && !ctx.hasFreeMonsterSlot(ctx.player)) return false;
    if (s.kind === 'target' && (s.verb === 'takeControl' || s.verb === 'takeControlTemp') && !ctx.hasFreeMonsterSlot(ctx.player)) return false;
  }
  return true;
}

function runSteps(ctx: EffectContext, steps: Step[]): void {
  let ti = 0; // indice nei bersagli
  for (const s of steps) {
    if (ctx.state.winner !== null) return;
    switch (s.kind) {
      case 'noop': break;
      case 'draw': for (const p of who(ctx, s.who)) ctx.draw(p, s.n); break;
      case 'gainLp': for (const p of who(ctx, s.who)) ctx.gainLp(p, s.n); break;
      case 'damage': for (const p of who(ctx, s.who)) ctx.damage(p, s.n); break;
      case 'payLp': ctx.payLp(ctx.player, s.n); break;
      case 'mill': ctx.mill(ctx.player, s.n); break;
      case 'millOpp': ctx.mill(ctx.opponent, s.n); break;
      case 'negateAttack': ctx.negateAttack(); break;
      case 'endBattle': ctx.endBattlePhase(); break;
      case 'tributeSelf': ctx.toGraveyard(ctx.card.uid); break;
      case 'selfFaceDown': ctx.flipFaceDown(ctx.card.uid); break;
      case 'selfSummon': ctx.specialSummon(ctx.card.uid, ctx.player, s.position); break;
      case 'cond': break;
      case 'per': {
        const n = candidates(ctx, s.filter, ctx.card).length * s.n;
        if (n > 0) for (const p of who(ctx, s.who)) (s.what === 'damage' ? ctx.damage(p, n) : ctx.gainLp(p, n));
        break;
      }
      case 'skipDraw': for (const p of who(ctx, s.who)) ctx.state.players[p].skipDraws = (ctx.state.players[p].skipDraws ?? 0) + s.n; break;
      case 'noAttack': for (const p of who(ctx, s.who)) ctx.state.players[p].noAttackTurn = ctx.state.turn; break;
      case 'discard': {
        for (const p of who(ctx, s.who)) {
          const hand = ctx.state.players[p].hand.filter((c) => c.uid !== ctx.card.uid).map((c) => c.uid);
          const n = Math.min(s.n, hand.length);
          if (n === 0) continue;
          ctx.ask({ player: p, prompt: `Scarta ${n} carta${n > 1 ? 'e' : ''}`, options: hand, min: n, max: n, resolve: { kind: 'discard' } });
        }
        break;
      }
      case 'all': {
        const cs = candidates(ctx, s.filter, ctx.card);
        if (s.verb === 'destroy') ctx.destroy(cs.map((c) => c.uid));
        else if (s.verb === 'banish') for (const c of cs) ctx.banish(c.uid);
        else if (s.verb === 'returnToHand') for (const c of cs) ctx.returnToHand(c.uid);
        else if (s.verb === 'toGraveyard') for (const c of cs) ctx.toGraveyard(c.uid);
        else if (s.verb === 'toDefense') for (const c of cs) ctx.changeToDefense(c.uid);
        break;
      }
      case 'target': {
        const n = countTargets(ctx, s);
        const uids = ctx.targets.slice(ti, ti + n);
        ti += n;
        for (const uid of uids) applyVerb(ctx, s.verb, uid, s.position);
        break;
      }
      case 'fromDeck': {
        let cs = candidates(ctx, s.filter, ctx.card);
        if (s.verb === 'specialSummon') cs = cs.filter((c) => canSpecialSummonFrom(ctx, c, false));
        if (cs.length === 0) break;
        const fromDeck = s.filter.zone === 'myDeck' || s.filter.zone === 'myHandOrDeck' || s.filter.zone === 'myDeckOrGY' || s.filter.zone === 'myHandDeckOrGY';
      const resolve = s.verb === 'addToHand' ? { kind: 'addToHand' as const, shuffleDeck: fromDeck } : s.verb === 'specialSummon' ? { kind: 'specialSummon' as const, position: s.position ?? 'atk', shuffleDeck: fromDeck } : { kind: 'sendToGraveyard' as const, shuffleDeck: fromDeck };
        ctx.ask({ prompt: `${ctx.data(ctx.card.uid).name}: scegli`, options: cs.map((c) => c.uid), min: Math.min(s.min, cs.length), max: Math.min(s.max, cs.length), resolve });
        break;
      }
      case 'eventMonster': {
        const m = eventMonster(ctx);
        if (m) applyVerb(ctx, s.verb, m.uid);
        break;
      }
    }
  }
}

/** Quanti bersagli di questo passo sono presenti in ctx.targets (min..max: prendiamo quelli disponibili in ordine). */
function countTargets(ctx: EffectContext, s: Extract<Step, { kind: 'target' }>): number {
  // I bersagli sono stati scelti in blocco; ogni passo ne consuma tra min e max. Con più passi "target"
  // non ambigui (min === max) la ripartizione è deterministica; altrimenti il primo passo prende tutto.
  if (s.min === s.max) return s.min;
  return ctx.targets.length;
}

// ---------------------------------------------------------- costruzione script

interface Head {
  kind: 'main' | 'attackResponse' | 'summonResponse' | 'anyResponse';
  summonHow?: 'normal' | 'flip' | 'special';
  body: string;
}

const HEADS: [RegExp, Head['kind'], Head['summonHow']?][] = [
  [/^When an opponent's monster declares an attack[,:]\s*(.*)$/, 'attackResponse'],
  [/^When a monster declares an attack[,:]\s*(.*)$/, 'attackResponse'],
  [/^Activate only when an opponent's monster declares an attack\.?\s*(.*)$/, 'attackResponse'],
  [/^Activate only when your opponent declares an attack\.?\s*(.*)$/, 'attackResponse'],
  [/^Activate only when your opponent's monster declares an attack\.?\s*(.*)$/, 'attackResponse'],
  [/^Activate only during your opponent's Battle Phase\.?\s*(.*)$/, 'attackResponse'],
  [/^When your opponent Normal Summons a monster(?:\(s\))?[,:]\s*(.*)$/, 'summonResponse', 'normal'],
  [/^When your opponent (?:Normal or Flip )?Summons a monster(?:\(s\))?[,:]\s*(.*)$/, 'summonResponse'],
  [/^When your opponent Special Summons a monster(?:\(s\))?[,:]\s*(.*)$/, 'summonResponse', 'special'],
  [/^When a monster(?:\(s\))? is Normal Summoned[,:]\s*(.*)$/, 'summonResponse', 'normal'],
  [/^When a monster(?:\(s\))? is (?:Normal or Flip )?Summoned[,:]\s*(.*)$/, 'summonResponse'],
  [/^When a monster(?:\(s\))? is Special Summoned[,:]\s*(.*)$/, 'summonResponse', 'special'],
  [/^Activate only when a monster is (?:Normal or Flip |Normal or Special |Special |Flip |Normal )?Summoned\.?\s*(.*)$/, 'summonResponse'],
  [/^Activate only during your opponent's turn\.?\s*(.*)$/, 'anyResponse'],
];

const IGNORABLE = [
  /^You can only activate (1|one) ".*" per turn\.?$/,
  /^You can only use this effect of ".*" once per turn\.?$/,
  /^Activate only during your Main Phase\.?$/,
  /^This card can only be activated during (your )?Main Phase 1\.?$/,
  /^You cannot activate this card (during|in) the turn (it|this card) (is|was) Set\.?$/,
];

function stripIgnorable(text: string): string {
  return sentences(text).filter((s) => !IGNORABLE.some((re) => re.test(s))).join(' ');
}

function buildActivation(data: CardData, text: string): { activation: Activation; approx?: string } | null {
  let head: Head = { kind: 'main', body: text };
  for (const [re, kind, how] of HEADS) {
    const m = text.match(re);
    if (m) {
      head = { kind, summonHow: how, body: m[1] };
      break;
    }
  }
  if (head.body.trim().length === 0) return null;
  const ex = extractConditions(head.body);
  if (!ex) return null;
  const parsed = parseSteps(ex.rest, 'field');
  if (!parsed) return null;
  const steps = [...ex.conds, ...parsed];
  // Passi che si riferiscono all'evento richiedono una testa di risposta.
  if (steps.some((s) => s.kind === 'eventMonster' || s.kind === 'negateAttack') && head.kind === 'main') return null;
  const spell = isSpell(data);
  const trap = isTrap(data);
  const quick = isQuickPlay(data);
  let timing: Activation['timing'];
  let respondsTo: Activation['respondsTo'];
  if (head.kind === 'attackResponse') { timing = 'response'; respondsTo = ['attack']; }
  else if (head.kind === 'summonResponse') { timing = 'response'; respondsTo = ['summon']; }
  else if (head.kind === 'anyResponse') { timing = 'response'; respondsTo = ['attack', 'summon']; }
  else if (trap || quick) { timing = 'both'; respondsTo = ['attack', 'summon', 'battleStart']; }
  else { timing = 'main'; }
  if (spell && !quick && timing !== 'main') return null; // una magia normale non risponde
  const activation: Activation = {
    timing,
    respondsTo,
    canActivate: (ctx) => {
      if (head.summonHow && ctx.event?.kind === 'summon' && ctx.event.how !== head.summonHow) return false;
      if (head.kind === 'summonResponse' && ctx.event?.kind === 'summon') {
        const m = ctx.get(ctx.event.cardUid);
        if (!m || m.controller === ctx.player) return false;
      }
      return canPay(ctx, steps);
    },
    targets: (ctx) => targetCombos(ctx, steps, ctx.card) ?? [[]],
    resolve: (ctx) => runSteps(ctx, steps),
  };
  return { activation };
}

// ----------------------------------------------------------- mostri

const MONSTER_TRIGGER_HEADS: [RegExp, (TriggerKind | 'flip')[]][] = [
  [/^FLIP:\s*(.*)$/, ['flip']],
  [/^When this card is Normal Summoned[,:]\s*(.*)$/, ['normalSummon']],
  [/^When you Normal Summon this card[,:]\s*(.*)$/, ['normalSummon']],
  [/^When this card is Normal or Flip Summoned[,:]\s*(.*)$/, ['normalSummon', 'flipSummon']],
  [/^When this card is Normal Summoned or Flip Summoned[,:]\s*(.*)$/, ['normalSummon', 'flipSummon']],
  [/^(?:When|If) this card is Normal Summoned or flipped face-up[,:]\s*(.*)$/, ['normalSummon', 'flip']],
  [/^When this card is Normal or Special Summoned[,:]\s*(.*)$/, ['normalSummon', 'specialSummon']],
  [/^When this card is Flip Summoned[,:]\s*(.*)$/, ['flipSummon']],
  [/^When this card is Special Summoned[,:]\s*(.*)$/, ['specialSummon']],
  [/^When this card is (?:Normal, Flip, or Special )?Summoned[,:]\s*(.*)$/, ['summon']],
  [/^(?:When|If) this card is destroyed by battle[,:]\s*(.*)$/, ['destroyedByBattle']],
  [/^(?:When|If) this card is destroyed by battle and sent to the GY[,:]\s*(.*)$/, ['destroyedByBattle']],
  [/^(?:When|If) this card is sent (?:from the field )?to the GY[,:]\s*(.*)$/, ['toGrave']],
  [/^(?:When|If) this card is (?:sent from the hand to the GY|discarded to the GY|discarded from your hand to the GY|sent from your hand to the GY)[,:]\s*(.*)$/, ['discarded']],
  [/^(?:When|If) this card is (?:sent from the hand to the GY|discarded to the GY) by a card effect[,:]\s*(.*)$/, ['discarded']],
  [/^(?:When|If) this card is destroyed (?:by battle or by card effect )?and sent to the GY[,:]\s*(.*)$/, ['toGrave']],
  [/^(?:When|If) this card is destroyed and sent to the GY by (?:battle or by )?(?:a )?card effect[,:]\s*(.*)$/, ['toGrave']],
  [/^(?:When|If) this card destroys a monster by battle[,:]\s*(.*)$/, ['destroysByBattle']],
  [/^(?:When|If) this card inflicts battle damage to your opponent(?:'s LP)?[,:]\s*(.*)$/, ['inflictsBattleDamage']],
  [/^(?:When|If) this card is Tribute Summoned[,:]\s*(.*)$/, ['tributeSummon']],
  [/^(?:Once per turn, )?[Dd]uring (?:each of )?your Standby Phases?[,:]\s*(.*)$/, ['standby']],
  [/^(?:Once per turn, )?[Dd]uring (?:each of )?your End Phases?[,:]\s*(.*)$/, ['endPhase']],
  [/^(?:Once per turn, )?[Dd]uring the End Phase(?: of this turn)?[,:]\s*(.*)$/, ['endPhase']],
  [/^(?:Once per turn, )?[Dd]uring each player's End Phase[,:]\s*(.*)$/, ['endPhaseAny']],
  [/^(?:When|If) you Tribute Summon this card[,:]\s*(.*)$/, ['tributeSummon']],
  [/^(?:When|If) this card attacks your opponent directly and inflicts battle damage(?: to your opponent)?[,:]\s*(.*)$/, ['inflictsBattleDamage']],
];

const MONSTER_FLAGS: [RegExp, keyof CardScript | 'ignore'][] = [
  [/^(This card )?[Cc]annot be destroyed by battle\.?$/, 'cannotBeDestroyedByBattle'],
  [/^This card is not destroyed by battle\.?$/, 'cannotBeDestroyedByBattle'],
  [/^This card (is not|cannot be) destroyed by battle, but you still take battle damage\.?$/, 'cannotBeDestroyedByBattle'],
  [/^(This card )?[Cc]annot be Normal Summoned(\/Set| or Set)?\.?$/, 'cannotNormalSummon'],
  [/^(This card )?[Cc]annot be Special Summoned\.?$/, 'cannotSpecialSummon'],
  [/^(This card )?[Cc]annot be Special Summoned from the GY\.?$/, 'cannotSpecialSummonFromGY'],
  [/^This card cannot attack\.?$/, 'cannotAttack'],
  [/^(This card )?[Cc]annot attack\.?$/, 'cannotAttack'],
  [/^If this card attacks a Defense Position monster, inflict piercing battle damage( to your opponent)?\.?$/, 'piercing'],
  [/^During battle between this attacking card and a Defense Position monster whose DEF is lower than the ATK of this card, inflict the difference as battle damage to your opponent\.?$/, 'piercing'],
  [/^This card can attack your opponent directly\.?$/, 'canAttackDirectly'],
  [/^This card may attack your opponent directly\.?$/, 'canAttackDirectly'],
  [/^This card can attack your opponent directly if there are no monsters on your opponent's side of the field\.?$/, 'ignore'],
  [/^This card can attack your opponent directly if your opponent controls no monsters\.?$/, 'ignore'],
  [/^This card must be face-up on the field to activate and to resolve this effect\.?$/, 'ignore'],
  [/^This card cannot attack the turn you activate this effect\.?$/, 'ignore'],
  [/^If this card attacks, your opponent cannot activate any Spell\/Trap Cards until the end of the Damage Step\.?$/, 'ignore'],
  [/^You cannot conduct your Battle Phase the turn you activate this effect\.?$/, 'ignore'],
  [/^This card's battle position cannot be changed until the end of your next turn(, except with a card effect)?\.?$/, 'ignore'],
  [/^(?:As long as this card remains face-up on the field, )?(?:No Trap Cards can be activated|Trap Cards cannot be activated)(?: and the effects of all face-up Trap Cards are negated)?\.?$/, 'negatesTraps'],
  [/^This card can make a second attack during each Battle Phase\.?$/, 'extraAttack'],
  [/^This card can attack twice during each Battle Phase\.?$/, 'extraAttack'],
  [/^(?:This card )?[Cc]annot attack the turn it is Special Summoned\.?$/, 'noAttackOnSpecialSummonTurn'],
  [/^This card cannot attack (?:during )?the turn (?:it is|this card was) Special Summoned\.?$/, 'noAttackOnSpecialSummonTurn'],
  [/^Neither player can Special Summon monsters\.?$/, 'blocksSpecialSummons'],
  [/^This card returns to (the|its) owner's hand during the End Phase of the turn (it|this card) (is|was) Normal Summoned or flipped face-up\.?$/, 'spiritReturn'],
  [/^During the End Phase of the turn this card is Normal Summoned or flipped face-up: Return it to the hand\.?$/, 'spiritReturn'],
  [/^Once per turn, during the End Phase, if this card was Normal Summoned or flipped face-up this turn: Return it to the hand\.?$/, 'spiritReturn'],
];

/** Frasi che descrivono un metodo di evocazione speciale non supportato: la carta resta evocabile solo se il testo lo consente. */
const SPECIAL_SUMMON_ONLY = [
  /^Must be Special Summoned/,
  /^Must first be Special Summoned/,
  /^This card can only be Special Summoned/,
  /^This card cannot be Special Summoned except/,
  /^Cannot be Special Summoned except/,
  /^This card can only be Normal Summoned/,
  /^Cannot be Normal Summoned\/Set\. Must/,
];

/** Frasi da ignorare per fusioni e rituali: il motore gestisce già i materiali. */
const EXTRA_IGNORABLE = [
  /^Must be Fusion Summoned(?: and cannot be Special Summoned by other ways)?\.?$/,
  /^A Fusion Summon of this card can only be (?:done|conducted) with the above Fusion Materials?(?: Monsters)?\.?$/,
  /^This card can only be Fusion Summoned with the above Fusion Material Monsters\.?$/,
  /^This card can only be Ritual Summoned with the Ritual Spell Card, "[^"]+"\.?$/,
  /^You can Ritual Summon this card with "[^"]+"\.?$/,
  /^You must also (?:Tribute|offer) monsters(?: from your hand or field)? whose total Levels? (?:Stars )?equal (?:\d+ or more|or exceed \d+|\d+)(?: as a Tribute)?(?: from the field or your hand)?\.?$/,
  /^You must also Tribute monsters whose total Levels equal \d+ or more from the field or your hand\.?$/,
];

const GEMINI = /treated as a Normal Monster while face-up on the field or in the GY/;

function buildMonster(data: CardData, text: string): CardScript | null {
  const script: CardScript = { auto: true, triggers: [] };
  const unparsed: string[] = [];
  let ignitions = 0;
  if (GEMINI.test(text)) return { auto: true, approx: 'Mostro Gemini: giocato come mostro normale (seconda evocazione non supportata).' };
  for (const s of sentences(text)) {
    if (IGNORABLE.some((re) => re.test(s))) continue;
    if ((isFusion(data) || data.type.includes('Ritual')) && EXTRA_IGNORABLE.some((re) => re.test(s))) continue;
    const lastFailureAtStart = lastFailure;
    let done = false;
    for (const [re, flag] of MONSTER_FLAGS) {
      if (re.test(s)) {
        if (flag !== 'ignore') (script as Record<string, unknown>)[flag] = true;
        done = true;
        break;
      }
    }
    if (done) continue;
    if (SPECIAL_SUMMON_ONLY.some((re) => re.test(s))) {
      script.cannotNormalSummon = true;
      script.cannotSpecialSummon = true;
      script.approx = 'Metodo di evocazione speciale non supportato: la carta non è evocabile.';
      continue;
    }
    for (const [re, kinds] of MONSTER_TRIGGER_HEADS) {
      const m = s.match(re);
      if (!m) continue;
      const steps = parseSteps(m[1], 'field');
      if (!steps) break;
      if (steps.some((st) => st.kind === 'eventMonster' || st.kind === 'negateAttack')) break;
      for (const k of kinds) script.triggers!.push(makeTrigger(k, steps));
      done = true;
      break;
    }
    if (done) continue;
    // Bonus a sé stesso: "This card gains 500 ATK for each X" / "This card gains 300 ATK while X is on the field"
    const selfGain = parseSelfGain(s);
    if (selfGain) {
      const prev = script.aura;
      script.aura = (ctx, m) => {
        const a = prev?.(ctx, m) ?? null;
        const b = selfGain(ctx, m);
        if (!a && !b) return null;
        return { atk: (a?.atk ?? 0) + (b?.atk ?? 0), def: (a?.def ?? 0) + (b?.def ?? 0) };
      };
      continue;
    }
    // Aura: "As long as this card remains face-up on the field, all X monsters gain N ATK"
    const aura = parseAura(s, true);
    if (aura) {
      const prev = script.aura;
      script.aura = (ctx, m) => {
        const a = prev?.(ctx, m) ?? null;
        const b = aura(ctx, m);
        if (!a && !b) return null;
        return { atk: (a?.atk ?? 0) + (b?.atk ?? 0), def: (a?.def ?? 0) + (b?.def ?? 0) };
      };
      continue;
    }
    // "If this card attacks, it is changed to Defense Position at the end of the Battle Phase/Damage Step."
    if (/^If this card attacks, it is changed to Defense Position at the end of the (Battle Phase|Damage Step)(?:, and (?:it cannot change its battle position|its battle position cannot be changed) until the end of your next turn)?\.?$/.test(s)) {
      script.triggers!.push({ on: 'afterAttack', resolve: (ctx) => { if (ctx.card.position === 'atk') { ctx.card.position = 'def'; ctx.card.positionChangedTurn = ctx.state.turn + 2; } } });
      continue;
    }
    const ex = extractConditions(s);
    const sc = ex ? ex.rest : s;
    // Evocazione speciale dalla mano per effetto proprio: "If only your opponent controls a monster, you can Special Summon this card."
    const selfSummon = ex && sc.match(/^(?:You can |you can )?Special Summon this card(?: from your hand)?(?: in (Attack|Defense) Position)?(?: by (discarding|Tributing) (\d+|a|one) (.+?))?\.?$/);
    if (selfSummon && ignitions === 0) {
      let costSteps: Step[] | null = [];
      if (selfSummon[2]) {
        const verb = selfSummon[2] === 'discarding' ? 'Discard' : 'Tribute';
        costSteps = parseSteps(`${verb} ${selfSummon[3]} ${selfSummon[4]}`, 'myHand');
      }
      if (!costSteps) { unparsed.push(s); continue; }
      const steps: Step[] = [...ex.conds, ...costSteps, { kind: 'selfSummon', position: selfSummon[1] === 'Defense' ? 'def' : 'atk' }];
      script.activation = {
        timing: 'main',
        fromHand: true,
        selfSummon: true,
        canActivate: (ctx) => canPay(ctx, steps),
        targets: (ctx) => targetCombos(ctx, steps, ctx.card) ?? [[]],
        resolve: (ctx) => runSteps(ctx, steps),
      };
      ignitions++;
      continue;
    }
    // Effetto attivabile dal cimitero: "You can banish this card from your GY; <effetto>"
    const gy = sc.match(/^(?:During your Main Phase: |During your Main Phase, if this card is in your GY: |If this card is in your GY: )?You can banish this card from your GY(?:; | to |, then )(.+)$/);
    if (gy && ex && ignitions === 0) {
      const steps0 = parseSteps(gy[1], 'field');
      if (steps0 && !steps0.some((st) => st.kind === 'eventMonster' || st.kind === 'negateAttack' || st.kind === 'selfSummon')) {
        const steps = [...ex.conds, ...steps0];
        script.activation = {
          timing: 'main',
          fromGraveyard: true,
          canActivate: (ctx) => canPay(ctx, steps),
          targets: (ctx) => targetCombos(ctx, steps, ctx.card) ?? [[]],
          resolve: (ctx) => runSteps(ctx, steps),
        };
        ignitions++;
        continue;
      }
    }
    // Effetto attivabile dalla mano: "You can discard this card; <effetto>"
    const hand = sc.match(/^You can discard this card(?:; | to |, then )(.+)$/);
    if (hand && ex) {
      const steps0 = parseSteps(hand[1], 'field');
      const steps = steps0 ? [...ex.conds, ...steps0] : null;
      if (steps && !steps.some((st) => st.kind === 'eventMonster' || st.kind === 'negateAttack') && ignitions === 0) {
        script.activation = {
          timing: 'main',
          fromHand: true,
          canActivate: (ctx) => canPay(ctx, steps),
          targets: (ctx) => targetCombos(ctx, steps, ctx.card) ?? [[]],
          resolve: (ctx) => runSteps(ctx, steps),
        };
        ignitions++;
        continue;
      }
    }
    // Effetto a ignizione: "Once per turn: You can <costo>; <effetto>" / "You can Tribute this card to <effetto>"
    const ign = sc.match(/^(?:Once per turn(?:, during your Main Phase)?[,:]? )?(?:you can |You can )(.+)$/);
    if (ign && ex && (sc.startsWith('Once per turn') || sc.startsWith('You can'))) {
      const cost = ign[1].match(/^(Tribute this (?:face-up )?card|send this (?:face-up )?card to the GY|discard (?:\d+|a|one) cards?|discard (?:\d+|a|one) [^;,]+?|pay \d+ LP|banish (?:\d+|a|one) [^;,]+? from your GY|Tribute (?:\d+|a|one) [^;,]+?)(?:; | to |, then |, and then )(.+)$/);
      const costText = cost ? cost[1] : '';
      const body = cost ? cost[2] : ign[1];
      const steps = parseSteps(body, 'field');
      const costSteps = costText ? parseSteps(costText[0].toUpperCase() + costText.slice(1), 'myHand') : [];
      if (steps && costSteps && !steps.some((st) => st.kind === 'eventMonster' || st.kind === 'negateAttack' || st.kind === 'selfSummon') && ignitions === 0) {
        const all = [...ex.conds, ...costSteps, ...steps];
        script.activation = {
          timing: 'main',
          oncePerTurn: sc.startsWith('Once per turn'),
          canActivate: (ctx) => canPay(ctx, all),
          targets: (ctx) => targetCombos(ctx, all, ctx.card) ?? [[]],
          resolve: (ctx) => runSteps(ctx, all),
        };
        ignitions++;
        continue;
      }
    }
    unparsed.push(lastFailure && lastFailure !== lastFailureAtStart ? `${s} ⟶ ${lastFailure}` : s);
  }
  if (unparsed.length > 0) {
    // Solo restrizioni: mai un effetto parziale.
    const restricted: CardScript = { auto: true, approx: `Testo non interpretato: ${unparsed[0].slice(0, 80)}` };
    for (const k of ['cannotNormalSummon', 'cannotSpecialSummon', 'cannotSpecialSummonFromGY', 'cannotAttack', 'spiritReturn', 'noAttackOnSpecialSummonTurn'] as const) if (script[k]) restricted[k] = true;
    restricted.unparsed = unparsed;
    return restricted;
  }
  if (script.triggers!.length === 0) delete script.triggers;
  return script;
}

function makeTrigger(on: TriggerKind, steps: Step[]): Trigger {
  const hasTargets = steps.some((s) => s.kind === 'target');
  return {
    on,
    targets: hasTargets ? (ctx) => targetCombos(ctx, steps, ctx.card) ?? [] : undefined,
    resolve: (ctx) => runSteps(ctx, steps),
  };
}

// ----------------------------------------------------------- aure

/**
 * "All WATER monsters gain 200 ATK/DEF", "All Dinosaur monsters gain 300 ATK and DEF",
 * "All FIRE monsters gain 500 ATK and lose 400 DEF", "Increase the ATK of all DARK monsters by 200 points".
 */
function parseAura(raw: string, fromMonster: boolean): CardScript['aura'] | null {
  let s = raw.replace(/\.$/, '');
  s = s.replace(/^(?:As long as|While) this card (?:remains|is) face-up on the field, /, '');
  s = s.replace(/^Increase the ATK of all (.+?) by (\d+) points? and decreases? their DEF by (\d+) points?$/, 'All $1 gain $2 ATK and lose $3 DEF');
  s = s.replace(/^Increase the DEF of all (.+?) by (\d+) points?$/, 'All $1 gain $2 DEF');
  s = s.replace(/^(?:All|all) /, 'All ');
  s = s.replace(/^Increase the ATK (?:and DEF )?of all (.+?) by (\d+) points?$/, (_m, f, n) => `All ${f} gain ${n} ${/and DEF/.test(s) ? 'ATK/DEF' : 'ATK'}`);
  s = s.replace(/^All (.+?) monsters? on the field /, 'All $1 monsters ');
  let m = s.match(/^All (.+?) gain (\d+) ATK(?: and (\d+) DEF| and DEF|\/DEF)?$/);
  let atk = 0;
  let def = 0;
  let filterText = '';
  if (m) {
    filterText = m[1];
    atk = Number(m[2]);
    def = m[3] ? Number(m[3]) : /and DEF|\/DEF/.test(s) ? atk : 0;
  } else if ((m = s.match(/^All (.+?) gain (\d+) ATK and lose (\d+) DEF$/))) {
    filterText = m[1]; atk = Number(m[2]); def = -Number(m[3]);
  } else if ((m = s.match(/^All (.+?) lose (\d+) ATK and gain (\d+) DEF$/))) {
    filterText = m[1]; atk = -Number(m[2]); def = Number(m[3]);
  } else if ((m = s.match(/^All (.+?) lose (\d+) ATK(?: and (\d+) DEF|\/DEF)?$/))) {
    filterText = m[1]; atk = -Number(m[2]); def = m[3] ? -Number(m[3]) : /\/DEF/.test(s) ? atk : 0;
  } else if ((m = s.match(/^All (.+?) gain (\d+) DEF$/))) {
    filterText = m[1]; def = Number(m[2]);
  } else return null;
  const other = /^other /.test(filterText);
  filterText = filterText.replace(/^other /, '');
  const f = parseFilter(filterText, 'field');
  if (!f || !MONSTER_KINDS.has(f.kind)) return null;
  return (ctx, monster) => {
    if (monster.position === 'facedown') return null;
    if (other && monster.uid === ctx.card.uid) return null;
    // Il filtro esclude la carta stessa: per le aure va incluso (salvo "other").
    const self = monster.uid === ctx.card.uid ? ({ uid: -1 } as CardInstance) : ctx.card;
    if (!matchesFilter(ctx, monster, f, self)) return null;
    if (f.zone === 'myField' && monster.controller !== ctx.player) return null;
    if (f.zone === 'oppField' && monster.controller === ctx.player) return null;
    void fromMonster;
    return { atk, def };
  };
}

/** "This card gains 300 ATK for each X" / "This card gains 500 ATK while X is on the field" */
function parseSelfGain(raw: string): CardScript['aura'] | null {
  const s = raw.replace(/\.$/, '');
  let m = s.match(/^This card gains (\d+) ATK( and DEF|\/DEF)? for each (.+)$/);
  if (m) {
    const n = Number(m[1]);
    const both = !!m[2];
    const f = parseFilter(m[3], 'field');
    if (!f) return null;
    return (ctx, mon) => {
      if (mon.uid !== ctx.card.uid) return null;
      const k = candidates(ctx, f, { uid: -1 } as CardInstance).length;
      return k ? { atk: n * k, def: both ? n * k : 0 } : null;
    };
  }
  m = s.match(/^This card gains (\d+) ATK( and DEF|\/DEF)? (?:while|if|when) (.+?) is (?:face-up )?on the field$/);
  if (m) {
    const n = Number(m[1]);
    const both = !!m[2];
    const f = parseFilter(`face-up ${m[3]}`, 'field');
    if (!f) return null;
    return (ctx, mon) => {
      if (mon.uid !== ctx.card.uid) return null;
      return candidates(ctx, f, ctx.card).length ? { atk: n, def: both ? n : 0 } : null;
    };
  }
  m = s.match(/^This card gains (\d+) ATK( and DEF|\/DEF)? (?:while|if|when) you control (?:a|an|1|a face-up) (.+)$/);
  if (m) {
    const n = Number(m[1]);
    const both = !!m[2];
    const f = parseFilter(`face-up ${m[3]}`.replace('face-up face-up', 'face-up'), 'myField');
    if (!f) return null;
    return (ctx, mon) => {
      if (mon.uid !== ctx.card.uid) return null;
      return candidates(ctx, f, ctx.card).length ? { atk: n, def: both ? n : 0 } : null;
    };
  }
  return null;
}

/** Magie terreno e continue fatte solo di aure. */
function buildAuraCard(text: string): CardScript | null {
  const ss = sentences(text).flatMap((s) => s.split(/,\s+also\s+/).map((x, i) => (i === 0 ? x : x[0].toUpperCase() + x.slice(1))));
  if (ss.length === 0) return null;
  const auras: NonNullable<CardScript['aura']>[] = [];
  for (const s of ss) {
    const a = parseAura(s, false);
    if (!a) return null;
    auras.push(a);
  }
  return {
    auto: true,
    aura: (ctx, m) => {
      let atk = 0; let def = 0; let any = false;
      for (const a of auras) {
        const b = a(ctx, m);
        if (b) { any = true; atk += b.atk ?? 0; def += b.def ?? 0; }
      }
      return any ? { atk, def } : null;
    },
    activation: { timing: 'main', staysOnField: true, resolve: () => {} },
  };
}

// ----------------------------------------------------------- equipaggiamenti

function buildEquip(text: string): CardScript | null {
  const script: CardScript = { auto: true, equip: {} };
  for (const s of sentences(text)) {
    if (IGNORABLE.some((re) => re.test(s))) continue;
    let m: RegExpMatchArray | null;
    if ((m = s.match(/^(?:Equip only to|You can only equip this card to|This card can only be equipped to) (?:an? )?(.+?)\.$/))) {
      const f = parseFilter(/monster|card/i.test(m[1]) || m[1].startsWith('"') ? m[1] : `${m[1]} monster`, 'field');
      if (!f) return null;
      script.equip!.onlyIf = onlyIfFrom(f);
      continue;
    }
    if ((m = s.match(/^(?:A|An) (.+?) monster equipped with this card (?:increases its|gains) ATK( and DEF)? by (\d+) points?(?: and decreases its DEF by (\d+) points?)?\.$/))) {
      const f = parseFilter(`${m[1]} monster`, 'field');
      if (!f) return null;
      script.equip!.onlyIf = onlyIfFrom(f);
      script.equip!.atk = Number(m[3]);
      if (m[2]) script.equip!.def = Number(m[3]);
      if (m[4]) script.equip!.def = -Number(m[4]);
      continue;
    }
    if ((m = s.match(/^Increase the ATK( and DEF)? of an? (.+?) monster equipped with this card by (\d+) points?(?: and decrease its DEF by (\d+) points?)?\.$/))) {
      const f = parseFilter(`${m[2]} monster`, 'field');
      if (!f) return null;
      script.equip!.onlyIf = onlyIfFrom(f);
      script.equip!.atk = Number(m[3]);
      if (m[1]) script.equip!.def = Number(m[3]);
      if (m[4]) script.equip!.def = -Number(m[4]);
      continue;
    }
    if ((m = s.match(/^(?:The equipped monster|It) gains (\d+) ATK(?: and DEF|\/DEF)\.$/))) { script.equip!.atk = Number(m[1]); script.equip!.def = Number(m[1]); continue; }
    if ((m = s.match(/^(?:The equipped monster|It) gains (\d+) ATK\.$/))) { script.equip!.atk = Number(m[1]); continue; }
    if ((m = s.match(/^(?:The equipped monster|It) gains (\d+) DEF\.$/))) { script.equip!.def = Number(m[1]); continue; }
    if ((m = s.match(/^(?:The equipped monster|It) gains (\d+) ATK,? (?:and|but) loses (\d+) DEF\.$/))) { script.equip!.atk = Number(m[1]); script.equip!.def = -Number(m[2]); continue; }
    if ((m = s.match(/^(?:The equipped monster|It) loses (\d+) ATK,? (?:and|but) gains (\d+) DEF\.$/))) { script.equip!.atk = -Number(m[1]); script.equip!.def = Number(m[2]); continue; }
    if ((m = s.match(/^(?:The equipped monster|It) gains (\d+) ATK and (\d+) DEF\.$/))) { script.equip!.atk = Number(m[1]); script.equip!.def = Number(m[2]); continue; }
    if ((m = s.match(/^(?:The equipped monster|It) loses (\d+) ATK\.$/))) { script.equip!.atk = -Number(m[1]); continue; }
    if ((m = s.match(/^(?:The equipped monster|It) (?:gains|increases its ATK by) (\d+)(?: ATK)?(?: points)?\.$/))) { script.equip!.atk = Number(m[1]); continue; }
    if ((m = s.match(/^(?:A|An|The equipped) monster equipped with this card (?:increases its|gains) ATK (?:by|of) (\d+) points?\.$/))) { script.equip!.atk = Number(m[1]); continue; }
    if ((m = s.match(/^Increase the ATK (?:and DEF )?of (?:a|the) monster equipped with this card by (\d+) points?\.$/))) { script.equip!.atk = Number(m[1]); if (/and DEF/.test(s)) script.equip!.def = Number(m[1]); continue; }
    if ((m = s.match(/^Increase the ATK of (?:a|the) monster equipped with this card by (\d+) points? and decrease its DEF by (\d+) points?\.$/))) { script.equip!.atk = Number(m[1]); script.equip!.def = -Number(m[2]); continue; }
    if ((m = s.match(/^(?:The equipped monster|It) gains (\d+) ATK and DEF\.$/))) { script.equip!.atk = Number(m[1]); script.equip!.def = Number(m[1]); continue; }
    if (/^(?:The equipped monster|It) cannot be destroyed by battle\.$/.test(s)) { script.equip!.cannotBeDestroyedByBattle = true; continue; }
    if (/^If the equipped monster attacks a Defense Position monster, inflict piercing battle damage( to your opponent)?\.$/.test(s)) { script.equip!.piercing = true; continue; }
    if ((m = s.match(/^Increase the ATK of "([^"]+)" by (\d+) points?\.$/))) { script.equip!.atk = Number(m[2]); continue; }
    return null;
  }
  const e = script.equip!;
  if (e.atk === undefined && e.def === undefined && !e.cannotBeDestroyedByBattle && !e.piercing) return null;
  script.activation = {
    timing: 'main',
    staysOnField: true,
    targets: (ctx) => [...ctx.myMonsters(), ...ctx.oppMonsters()].filter((c) => c.position !== 'facedown' && (!e.onlyIf || e.onlyIf(ctx.data(c.uid)))).map((c) => [c.uid]),
    resolve: (ctx) => {
      const target = ctx.get(ctx.targets[0]);
      if (!target) return;
      ctx.card.equippedTo = target.uid;
      target.atkMod = (target.atkMod ?? 0) + (e.atk ?? 0);
      target.defMod = (target.defMod ?? 0) + (e.def ?? 0);
      ctx.log(`${ctx.data(ctx.card.uid).name} equipaggiata a ${ctx.data(target.uid).name}.`);
    },
  };
  return script;
}

function onlyIfFrom(ff: Filter): (d: CardData) => boolean {
  return (d) =>
    isMonster(d) &&
    (!ff.race || d.race === ff.race) &&
    (!ff.races || ff.races.includes(d.race)) &&
    (!ff.attribute || d.attribute === ff.attribute) &&
    (!ff.nameIncludes || d.name.includes(ff.nameIncludes)) &&
    (ff.kind !== 'normalMonster' || isNormalMonster(d)) &&
    (ff.kind !== 'fusion' || isFusion(d)) &&
    (ff.levelMax === undefined || (d.level ?? 0) <= ff.levelMax) &&
    (ff.levelMin === undefined || (d.level ?? 0) >= ff.levelMin);
}

// ----------------------------------------------------------- continue

function buildContinuous(text: string): CardScript | null {
  const s = sentences(text);
  if (s.length !== 1) return buildAuraCard(text);
  let m: RegExpMatchArray | null;
  if ((m = s[0].match(/^(.+?) cannot attack\.$/))) {
    const f = parseFilter(m[1], 'field');
    if (!f || f.kind !== 'monster') return null;
    return {
      auto: true,
      attackRestriction: (ctx, mon) => matchesFilter(ctx, mon, f, ctx.card),
      activation: { timing: 'main', staysOnField: true, resolve: () => {} },
    };
  }
  if (/^Monsters cannot attack the turn they are Summoned\.$/.test(s[0])) {
    return { auto: true, attackRestriction: (ctx, mon) => mon.placedTurn === ctx.state.turn, activation: { timing: 'main', staysOnField: true, resolve: () => {} } };
  }
  return buildAuraCard(text);
}

// ----------------------------------------------------------- entry point

export function autoScript(data: CardData): CardScript | null {
  if (data.type === 'Normal Monster' || data.type === 'Normal Tuner Monster' || data.type === 'Token') return null;
  const text = normalizeText(data.desc);
  if (isSpell(data) || isTrap(data)) {
    if (data.race === 'Field') return buildAuraCard(text);
    if (data.race === 'Ritual') {
      // Gestite dal motore (azione ritualSummon) se il testo è quello standard.
      if (/^This card is used to Ritual Summon (?:"[^"]+"|any 1 Ritual Monster)\. You must also (?:Tribute|offer) monsters(?: from your hand or field)? whose total Levels? (?:equal|equals|is|are) (?:\d+ or more|or exceed \d+|\d+)(?: as a Tribute)?(?: from the field or your hand)?\.$/.test(text)) return { auto: true };
      return null;
    }
    if (data.race === 'Equip') return buildEquip(text);
    if (data.race === 'Continuous') return buildContinuous(text);
    if (data.race === 'Counter') return null; // servono le catene
    const t = stripIgnorable(text);
    const built = buildActivation(data, t);
    if (!built) return null;
    return { auto: true, activation: built.activation, approx: built.approx };
  }
  if (isMonster(data)) {
    let body = text;
    if (isFusion(data) || data.type.includes('Synchro')) {
      // La prima riga sono i materiali.
      const lines = text.split('\n');
      body = lines.slice(1).join('\n').trim();
      if (body.length === 0) return null;
    }
    return buildMonster(data, body);
  }
  return null;
}
