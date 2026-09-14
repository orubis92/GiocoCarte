import type { Action, CardData, CardDb, Difficulty, GameState, PlayerId } from './types';
import { monstersOf, other, shuffleInPlace, spellTrapsOf } from './cards';
import { effectiveAtk, effectiveDef } from './stats';
import { applyAction, cloneState } from './reducer';
import { getLegalActions, whoActs } from './rules';
import { isEffectImplemented } from './effects/library';

// ---------------------------------------------------------------------------
// Avversario automatico a tre livelli.
//  - facile:    sceglie a caso tra le azioni legali (con un minimo di buon senso).
//  - medio:     valuta ogni azione simulandola (1 mossa di profondità) e prende la migliore.
//  - difficile: cerca sequenze di mosse nel proprio turno (profondità 4, ampiezza 4)
//               stimando anche la minaccia avversaria del turno successivo.
// L'IA non bara: prima di simulare, le carte coperte e la mano dell'avversario
// vengono sostituite con carte "ignote" e i deck vengono rimescolati.
// ---------------------------------------------------------------------------

const UNKNOWN_MONSTER_ID = -1;
const UNKNOWN_SPELLTRAP_ID = -2;
const UNKNOWN_HAND_ID = -3;

const UNKNOWN_MONSTER: CardData = { id: UNKNOWN_MONSTER_ID, name: 'Mostro ignoto', type: 'Normal Monster', frameType: 'normal', desc: '', race: 'Unknown', attribute: 'DARK', level: 4, atk: 1300, def: 1300 };
const UNKNOWN_SPELLTRAP: CardData = { id: UNKNOWN_SPELLTRAP_ID, name: 'Carta ignota', type: 'Trap Card', frameType: 'trap', desc: '', race: 'Normal' };
const UNKNOWN_HAND: CardData = { id: UNKNOWN_HAND_ID, name: 'Carta ignota', type: 'Normal Monster', frameType: 'normal', desc: '', race: 'Unknown', level: 12, atk: 0, def: 0 };

export interface AiOptions {
  /** Generatore casuale (default Math.random) per rendere i test deterministici. */
  random?: () => number;
}

export function chooseAction(state: GameState, db: CardDb, difficulty: Difficulty, opts: AiOptions = {}): Action {
  const random = opts.random ?? Math.random;
  const legal = getLegalActions(state, db).filter((a) => a.type !== 'surrender');
  if (legal.length === 0) throw new Error('Nessuna azione legale per l\'IA.');
  if (legal.length === 1) return legal[0];
  const me = whoActs(state);
  switch (difficulty) {
    case 'facile': return chooseEasy(state, db, legal, random);
    case 'medio': return chooseGreedy(state, db, legal, me, random);
    case 'difficile': return chooseSearch(state, db, legal, me, random);
  }
}

// ------------------------------------------------------------------ facile

function chooseEasy(state: GameState, db: CardDb, legal: Action[], random: () => number): Action {
  // Evita attacchi palesemente suicidi e ripetizioni inutili; per il resto è casuale.
  const sane = legal.filter((a) => {
    if (a.type === 'attack' && a.targetUid !== null) {
      const att = findMonster(state, a.attackerUid);
      const tgt = findMonster(state, a.targetUid);
      if (att && tgt && tgt.position === 'atk' && effectiveAtk(state, db, tgt) > effectiveAtk(state, db, att)) return false;
    }
    if (a.type === 'changePosition') return random() < 0.2;
    return true;
  });
  const pool = sane.length ? sane : legal;
  // "Fase successiva" pesa meno quando ci sono alternative, così l'IA gioca davvero le carte.
  const weighted: Action[] = [];
  for (const a of pool) {
    const w = a.type === 'nextPhase' || a.type === 'pass' ? 1 : 3;
    for (let i = 0; i < w; i++) weighted.push(a);
  }
  return weighted[Math.floor(random() * weighted.length)];
}

// ------------------------------------------------------------------- medio

function chooseGreedy(state: GameState, db: CardDb, legal: Action[], me: PlayerId, random: () => number): Action {
  const simDb = makeSimDb(db);
  const masked = maskState(state, me);
  let best: Action = legal[0];
  let bestScore = -Infinity;
  for (const a of legal) {
    const next = safeApply(masked, simDb, a);
    if (!next) continue;
    const score = evaluate(next, simDb, me) + random() * 20;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

// --------------------------------------------------------------- difficile

const SEARCH_DEPTH = 4;
const SEARCH_WIDTH = 4;

function chooseSearch(state: GameState, db: CardDb, legal: Action[], me: PlayerId, random: () => number): Action {
  const simDb = makeSimDb(db);
  const masked = maskState(state, me);
  let best: Action = legal[0];
  let bestScore = -Infinity;
  const budget = { nodes: 0 };
  for (const a of legal) {
    const next = safeApply(masked, simDb, a);
    if (!next) continue;
    const score = searchValue(next, simDb, me, SEARCH_DEPTH - 1, budget) + random() * 10;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

/** Valore di uno stato continuando a giocare al meglio finché il turno (o la scelta) è dell'IA. */
function searchValue(state: GameState, db: CardDb, me: PlayerId, depth: number, budget: { nodes: number }): number {
  budget.nodes++;
  if (state.winner !== null || depth === 0 || whoActs(state) !== me || budget.nodes > 600) return evaluate(state, db, me);
  const legal = getLegalActions(state, db).filter((a) => a.type !== 'surrender');
  if (legal.length === 0) return evaluate(state, db, me);
  // Pre-ordina con la valutazione a 1 mossa e tiene solo le migliori.
  const scored: { a: Action; next: GameState; s: number }[] = [];
  for (const a of legal) {
    const next = safeApply(state, db, a);
    if (next) scored.push({ a, next, s: evaluate(next, db, me) });
  }
  scored.sort((x, y) => y.s - x.s);
  scored.splice(SEARCH_WIDTH);
  let best = -Infinity;
  for (const x of scored) best = Math.max(best, searchValue(x.next, db, me, depth - 1, budget));
  return best === -Infinity ? evaluate(state, db, me) : best;
}

// ------------------------------------------------------------- valutazione

export function evaluate(state: GameState, db: CardDb, me: PlayerId): number {
  if (state.winner === me) return 1_000_000;
  if (state.winner === other(me)) return -1_000_000;
  const opp = other(me);
  const my = state.players[me];
  const op = state.players[opp];
  let score = 0;
  score += (my.lp - op.lp) * 1.0;
  // Presenza sul terreno.
  const myMon = monstersOf(my);
  const opMon = monstersOf(op);
  for (const m of myMon) score += monsterValue(state, db, m, true);
  for (const m of opMon) score -= monsterValue(state, db, m, false);
  // Carte in mano e coperte: risorse.
  score += my.hand.length * 150 - op.hand.length * 150;
  for (const st of spellTrapsOf(my)) {
    const d = db[st.cardId];
    score += st.faceDown ? (isEffectImplemented(d) ? 220 : 20) : 120;
  }
  for (const st of spellTrapsOf(op)) score -= st.faceDown ? 150 : 100;
  // Minaccia: il mostro più forte avversario contro la mia difesa migliore.
  const opMaxAtk = Math.max(0, ...opMon.filter((m) => m.position !== 'facedown').map((m) => effectiveAtk(state, db, m)));
  const myBest = Math.max(0, ...myMon.map((m) => (m.position === 'atk' ? effectiveAtk(state, db, m) : effectiveDef(state, db, m))));
  if (opMon.length > 0 && myMon.length === 0) score -= opMaxAtk * 0.8; // prendo attacchi diretti
  else if (opMaxAtk > myBest) score -= (opMaxAtk - myBest) * 0.5;
  // Mostri in attacco più deboli del massimo avversario: rischio di perdere LP.
  for (const m of myMon) {
    if (m.position === 'atk' && effectiveAtk(state, db, m) < opMaxAtk) score -= (opMaxAtk - effectiveAtk(state, db, m)) * 0.4;
  }
  // Deck quasi finito: penalità.
  if (my.deck.length < 5) score -= (5 - my.deck.length) * 300;
  return score;
}

function monsterValue(state: GameState, db: CardDb, m: NonNullable<GameState['players'][0]['monsterZone'][0]>, mine: boolean): number {
  const atk = effectiveAtk(state, db, m);
  const def = effectiveDef(state, db, m);
  let v = 250 + (m.position === 'def' || m.position === 'facedown' ? Math.max(def * 0.5, atk * 0.4) : atk * 0.6);
  if (m.position === 'facedown') v += mine ? 100 : 0;
  return v;
}

// ------------------------------------------------------------- utilità

function findMonster(state: GameState, uid: number) {
  for (const p of state.players) {
    const m = p.monsterZone.find((c) => c?.uid === uid);
    if (m) return m;
  }
  return null;
}

function safeApply(state: GameState, db: CardDb, a: Action): GameState | null {
  try {
    return applyAction(state, db, a, { validate: false });
  } catch {
    return null;
  }
}

function makeSimDb(db: CardDb): CardDb {
  const sim: CardDb = Object.create(db);
  sim[UNKNOWN_MONSTER_ID] = UNKNOWN_MONSTER;
  sim[UNKNOWN_SPELLTRAP_ID] = UNKNOWN_SPELLTRAP;
  sim[UNKNOWN_HAND_ID] = UNKNOWN_HAND;
  return sim;
}

/** Nasconde all'IA le informazioni che non dovrebbe conoscere. */
export function maskState(state: GameState, me: PlayerId): GameState {
  const s = cloneState(state);
  const op = s.players[other(me)];
  for (const c of op.hand) c.cardId = UNKNOWN_HAND_ID;
  for (const m of op.monsterZone) if (m && m.position === 'facedown') m.cardId = UNKNOWN_MONSTER_ID;
  for (const st of op.spellTrapZone) if (st && st.faceDown) st.cardId = UNKNOWN_SPELLTRAP_ID;
  // Le carte del deck sono in ordine sconosciuto per entrambi.
  s.rngSeed = (s.rngSeed * 7919 + 17) >>> 0;
  shuffleInPlace(s, op.deck);
  shuffleInPlace(s, s.players[me].deck);
  s.log = [];
  return s;
}

