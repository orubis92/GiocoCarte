import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import type { Action, CardData, CardDb, CardInstance, GameState, PlayerId } from '../src/engine/types';
import { createGame } from '../src/engine/reducer';
import { withTokens } from '../src/engine/tokens';

/** Database reale delle carte fino all'era GX (data/cards-gx.json). */
export const GX: CardDb = (() => {
  const cards = JSON.parse(readFileSync(new URL('../data/cards-gx.json', import.meta.url), 'utf8')) as CardData[];
  const db: CardDb = {};
  for (const c of cards) db[c.id] = c;
  return withTokens(db);
})();

export function byName(name: string): CardData {
  for (const id in GX) if (GX[id].name === name) return GX[id];
  throw new Error(`Carta non trovata: ${name}`);
}

/** Partita con deck fittizi (40 Kuriboh) e terreno vuoto, pronta per essere popolata a mano. */
export function blankGame(seed = 1, turn = 3): GameState {
  const filler = byName('Kuriboh').id;
  const s = createGame(GX, [{ main: Array(40).fill(filler), extra: [] }, { main: Array(40).fill(filler), extra: [] }], { seed, firstPlayer: 0 });
  for (const p of s.players) {
    p.hand = []; p.graveyard = []; p.monsterZone = [null, null, null, null, null]; p.spellTrapZone = [null, null, null, null, null];
  }
  s.turn = turn;
  return s;
}

export function put(s: GameState, p: PlayerId, name: string, zone: 'hand' | 'monster' | 'spellTrap' | 'graveyard' | 'extra' | 'deckTop' | 'field', opts: Partial<CardInstance> = {}): CardInstance {
  const data = byName(name);
  const card: CardInstance = { uid: s.nextUid++, cardId: data.id, owner: p, controller: p, ...opts };
  const ps = s.players[p];
  if (zone === 'hand') ps.hand.push(card);
  else if (zone === 'graveyard') ps.graveyard.push(card);
  else if (zone === 'extra') ps.extraDeck.push(card);
  else if (zone === 'deckTop') ps.deck.unshift(card);
  else if (zone === 'field') { card.faceDown = false; card.placedTurn ??= 0; ps.fieldZone = card; }
  else if (zone === 'monster') { card.position ??= 'atk'; card.placedTurn ??= 0; card.properlySummoned = true; ps.monsterZone[ps.monsterZone.indexOf(null)] = card; }
  else { card.faceDown ??= true; card.placedTurn ??= 0; ps.spellTrapZone[ps.spellTrapZone.indexOf(null)] = card; }
  return card;
}

export function find(actions: Action[], pred: (a: Action) => boolean, label = ''): Action {
  const a = actions.find(pred);
  assert.ok(a, `azione non trovata ${label}: ${actions.map((x) => JSON.stringify(x)).join(' ')}`);
  return a!;
}
