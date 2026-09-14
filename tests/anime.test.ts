import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GX, byName, blankGame, put, find } from './helpers';
import { applyAction, createGame } from '../src/engine/reducer';
import { getLegalActions, whoActs } from '../src/engine/rules';
import { monstersOf, spellTrapsOf } from '../src/engine/cards';
import { chooseAction } from '../src/engine/ai';
import { STARTER_DECKS } from '../src/data/decks';
import { effectiveAtk } from '../src/engine/stats';

const next = (s: ReturnType<typeof blankGame>) => applyAction(s, GX, { type: 'nextPhase' });

test('Bestia Cristallo distrutta va nella Zona Magie/Trappole; Promessa di Cristallo la rievoca', () => {
  let s = blankGame();
  s.turnPlayer = 1; s.priority = 1;
  put(s, 1, 'Summoned Skull', 'monster');
  put(s, 0, 'Crystal Beast Topaz Tiger', 'monster');
  s = next(s); // battle
  s = applyAction(s, GX, find(getLegalActions(s, GX), (a) => a.type === 'attack' && a.targetUid !== null));
  assert.equal(monstersOf(s.players[0]).length, 0);
  assert.equal(spellTrapsOf(s.players[0]).length, 1, 'la Bestia Cristallo è nella zona magie/trappole');
  assert.equal(s.players[0].graveyard.length, 0);
  // turno del giocatore 0
  s = next(s); s = next(s);
  s.players[0].hand = [];
  const promise = put(s, 0, 'Crystal Promise', 'hand');
  const a = find(getLegalActions(s, GX), (x) => x.type === 'activateSpell' && x.cardUid === promise.uid, 'Crystal Promise');
  s = applyAction(s, GX, a);
  assert.equal(monstersOf(s.players[0]).length, 1);
  assert.equal(GX[monstersOf(s.players[0])[0].cardId].name, 'Crystal Beast Topaz Tiger');
});

test('Faro di Cristallo richiede 2 Bestie Cristallo nella zona magie', () => {
  const s = blankGame();
  const beacon = put(s, 0, 'Crystal Beacon', 'hand');
  put(s, 0, 'Crystal Beast Ruby Carbuncle', 'deckTop');
  assert.ok(!getLegalActions(s, GX).some((a) => a.type === 'activateSpell' && a.cardUid === beacon.uid));
  put(s, 0, 'Crystal Beast Amber Mammoth', 'spellTrap', { faceDown: false });
  put(s, 0, 'Crystal Beast Cobalt Eagle', 'spellTrap', { faceDown: false });
  assert.ok(getLegalActions(s, GX).some((a) => a.type === 'activateSpell' && a.cardUid === beacon.uid));
});

test('XYZ-Dragon Cannon: fusione a contatto bandendo i materiali', () => {
  let s = blankGame();
  s.players[0].extraDeck = [];
  put(s, 0, 'XYZ-Dragon Cannon', 'extra');
  put(s, 0, 'X-Head Cannon', 'monster');
  put(s, 0, 'Y-Dragon Head', 'monster');
  put(s, 0, 'Z-Metal Tank', 'monster');
  const a = find(getLegalActions(s, GX), (x) => x.type === 'fusionSummon' && x.polymerizationUid < 0, 'contatto');
  s = applyAction(s, GX, a);
  assert.equal(monstersOf(s.players[0]).length, 1);
  assert.equal(s.players[0].banished.length, 3);
});

test('Toon: evocazione con Mondo Toon e tributo, attacco diretto', () => {
  let s = blankGame();
  put(s, 0, 'Toon World', 'spellTrap', { faceDown: false });
  const skull = put(s, 0, 'Toon Summoned Skull', 'hand');
  put(s, 0, 'Kuriboh', 'monster');
  put(s, 1, 'Gemini Elf', 'monster');
  const a = find(getLegalActions(s, GX), (x) => x.type === 'activateMonsterEffect' && x.cardUid === skull.uid, 'toon');
  s = applyAction(s, GX, a);
  assert.equal(GX[monstersOf(s.players[0])[0].cardId].name, 'Toon Summoned Skull');
  s = next(s);
  assert.ok(!getLegalActions(s, GX).some((x) => x.type === 'attack'), 'non attacca nel turno in cui è evocato');
});

test('Exodia: vittoria con i cinque pezzi in mano', () => {
  let s = blankGame();
  for (const n of ['Right Arm of the Forbidden One', 'Left Arm of the Forbidden One', 'Right Leg of the Forbidden One', 'Left Leg of the Forbidden One']) put(s, 0, n, 'hand');
  put(s, 0, 'Exodia the Forbidden One', 'deckTop');
  const pot = put(s, 0, 'Pot of Greed', 'hand');
  s = applyAction(s, GX, { type: 'activateSpell', cardUid: pot.uid, targets: [] });
  assert.equal(s.winner, 0);
});

test('Gilford il Fulmine con 3 tributi distrugge i mostri avversari', () => {
  let s = blankGame();
  const g = put(s, 0, 'Gilford the Lightning', 'hand');
  for (let i = 0; i < 3; i++) put(s, 0, 'Kuriboh', 'monster');
  put(s, 1, 'Summoned Skull', 'monster');
  const a = find(getLegalActions(s, GX), (x) => x.type === 'normalSummon' && x.cardUid === g.uid && x.tributeUids.length === 3, '3 tributi');
  s = applyAction(s, GX, a);
  assert.equal(monstersOf(s.players[1]).length, 0);
});

test('Relinquished assorbe un mostro avversario', () => {
  let s = blankGame();
  const rel = put(s, 0, 'Relinquished', 'monster');
  put(s, 1, 'Blue-Eyes White Dragon', 'monster');
  s = applyAction(s, GX, find(getLegalActions(s, GX), (x) => x.type === 'activateMonsterEffect' && x.cardUid === rel.uid, 'relinquished'));
  assert.equal(monstersOf(s.players[1]).length, 0);
  assert.equal(effectiveAtk(s, GX, monstersOf(s.players[0])[0]), 3000);
  assert.equal(spellTrapsOf(s.players[0]).length, 1);
});

test('Deck dei personaggi: partite IA vs IA senza errori', () => {
  const byName2 = new Map(Object.values(GX).map((c) => [c.name, c.id]));
  const toList = (d: (typeof STARTER_DECKS)[number]) => ({ main: d.main.map((n) => byName2.get(n)!).filter(Boolean), extra: d.extra.map((n) => byName2.get(n)!).filter(Boolean) });
  const decks = STARTER_DECKS.filter((d) => d.section !== 'base');
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < decks.length; i++) {
    const a = decks[i]; const b = decks[(i + 5) % decks.length];
    let s = createGame(GX, [toList(a), toList(b)], { seed: 100 + i, firstPlayer: 0 });
    let steps = 0;
    while (s.winner === null && steps++ < 2500) {
      const act = chooseAction(s, GX, whoActs(s) === 0 ? 'medio' : 'facile', { random });
      s = applyAction(s, GX, act);
    }
    assert.ok(s.winner !== null, `${a.name} vs ${b.name}: nessun vincitore dopo ${steps} passi`);
  }
});
