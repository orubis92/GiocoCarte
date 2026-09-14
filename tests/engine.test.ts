import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, DB, sampleDeck } from './fixtures';
import { applyAction, createGame } from '../src/engine/reducer';
import { getLegalActions, whoActs } from '../src/engine/rules';
import { chooseAction } from '../src/engine/ai';
import type { Action, CardData, CardInstance, GameState, PlayerId } from '../src/engine/types';
import { monstersOf } from '../src/engine/cards';

// ------------------------------------------------------------ helper

function newGame(seed = 1): GameState {
  return createGame(DB, [sampleDeck(), sampleDeck()], { seed, firstPlayer: 0 });
}

function clearBoard(s: GameState) {
  for (const p of s.players) {
    p.hand = []; p.monsterZone = [null, null, null, null, null]; p.spellTrapZone = [null, null, null, null, null]; p.graveyard = [];
  }
}

function put(s: GameState, p: PlayerId, data: CardData, zone: 'hand' | 'monster' | 'spellTrap' | 'graveyard' | 'extra', opts: Partial<CardInstance> = {}): CardInstance {
  const card: CardInstance = { uid: s.nextUid++, cardId: data.id, owner: p, controller: p, ...opts };
  const ps = s.players[p];
  if (zone === 'hand') ps.hand.push(card);
  else if (zone === 'graveyard') ps.graveyard.push(card);
  else if (zone === 'extra') ps.extraDeck.push(card);
  else if (zone === 'monster') { card.position ??= 'atk'; card.placedTurn ??= 0; ps.monsterZone[ps.monsterZone.indexOf(null)] = card; }
  else { card.faceDown ??= true; card.placedTurn ??= 0; ps.spellTrapZone[ps.spellTrapZone.indexOf(null)] = card; }
  return card;
}

function find(actions: Action[], pred: (a: Action) => boolean): Action {
  const a = actions.find(pred);
  assert.ok(a, `azione non trovata tra: ${actions.map((x) => x.type).join(',')}`);
  return a!;
}

function toBattle(s: GameState): GameState {
  s = applyAction(s, DB, { type: 'nextPhase' });
  assert.equal(s.phase, 'battle');
  return s;
}

// ------------------------------------------------------------- test

test('setup: 5 carte in mano, 40 nel deck meno 5, turno 1 senza pescata', () => {
  const s = newGame();
  assert.equal(s.players[0].hand.length, 5);
  assert.equal(s.players[1].hand.length, 5);
  assert.equal(s.players[0].deck.length, sampleDeck().main.length - 5);
  assert.equal(s.turn, 1);
  assert.equal(s.phase, 'main1');
});

test('evocazione normale una sola volta per turno, tributi per livello alto', () => {
  let s = newGame();
  clearBoard(s);
  const elf = put(s, 0, C.geminiElf, 'hand');
  const skull = put(s, 0, C.summonedSkull, 'hand');
  let actions = getLegalActions(s, DB);
  assert.ok(actions.some((a) => a.type === 'normalSummon' && a.cardUid === elf.uid));
  assert.ok(!actions.some((a) => a.type === 'normalSummon' && a.cardUid === skull.uid), 'senza mostri non si può evocare per tributo');
  s = applyAction(s, DB, { type: 'normalSummon', cardUid: elf.uid, position: 'atk', tributeUids: [] });
  assert.equal(monstersOf(s.players[0]).length, 1);
  actions = getLegalActions(s, DB);
  assert.ok(!actions.some((a) => a.type === 'normalSummon'), 'una sola evocazione normale per turno');
  // Turno successivo: tributo possibile.
  s = applyAction(s, DB, { type: 'nextPhase' });
  s = applyAction(s, DB, { type: 'nextPhase' });
  s = applyAction(s, DB, { type: 'nextPhase' }); // fine turno 1
  assert.equal(s.turnPlayer, 1);
  s.players[1].hand = [];
  s = applyAction(s, DB, { type: 'nextPhase' }); s = applyAction(s, DB, { type: 'nextPhase' }); s = applyAction(s, DB, { type: 'nextPhase' });
  assert.equal(s.turnPlayer, 0);
  actions = getLegalActions(s, DB);
  const trib = find(actions, (a) => a.type === 'normalSummon' && a.cardUid === skull.uid && a.tributeUids.length === 1);
  s = applyAction(s, DB, trib);
  assert.equal(monstersOf(s.players[0]).length, 1);
  assert.equal(DB[monstersOf(s.players[0])[0].cardId].name, 'Summoned Skull');
  assert.equal(s.players[0].graveyard.length, 1);
});

test('battaglia: ATK vs ATK, danni e distruzione; nessun attacco al turno 1', () => {
  let s = newGame();
  clearBoard(s);
  put(s, 0, C.geminiElf, 'monster');
  put(s, 1, C.celticGuardian, 'monster');
  s = toBattle(s);
  assert.ok(!getLegalActions(s, DB).some((a) => a.type === 'attack'), 'al turno 1 non si attacca');
  s.turn = 3; // simula turno successivo
  const att = find(getLegalActions(s, DB), (a) => a.type === 'attack' && a.targetUid !== null);
  s = applyAction(s, DB, att);
  assert.equal(s.players[1].lp, 8000 - 500);
  assert.equal(monstersOf(s.players[1]).length, 0);
  assert.equal(monstersOf(s.players[0]).length, 1);
});

test('battaglia: attacco a mostro in difesa, danno di ritorno se DEF maggiore', () => {
  let s = newGame();
  clearBoard(s);
  s.turn = 3;
  put(s, 0, C.celticGuardian, 'monster');
  put(s, 1, C.mysticalElf, 'monster', { position: 'def' });
  s = toBattle(s);
  s = applyAction(s, DB, find(getLegalActions(s, DB), (a) => a.type === 'attack' && a.targetUid !== null));
  assert.equal(s.players[0].lp, 8000 - 600);
  assert.equal(monstersOf(s.players[1]).length, 1);
});

test('attacco diretto e vittoria per LP a 0', () => {
  let s = newGame();
  clearBoard(s);
  s.turn = 3;
  s.players[1].lp = 2000;
  put(s, 0, C.summonedSkull, 'monster');
  s = toBattle(s);
  s = applyAction(s, DB, find(getLegalActions(s, DB), (a) => a.type === 'attack' && a.targetUid === null));
  assert.equal(s.players[1].lp, 0);
  assert.equal(s.winner, 0);
  assert.equal(getLegalActions(s, DB).length, 0);
});

test('Mirror Force: finestra di risposta e distruzione dei mostri in attacco', () => {
  let s = newGame();
  clearBoard(s);
  s.turn = 3;
  put(s, 0, C.summonedSkull, 'monster');
  put(s, 0, C.geminiElf, 'monster');
  put(s, 1, C.kuriboh, 'monster', { position: 'def' });
  const mf = put(s, 1, C.mirrorForce, 'spellTrap');
  s = toBattle(s);
  s = applyAction(s, DB, find(getLegalActions(s, DB), (a) => a.type === 'attack'));
  assert.equal(s.pending?.kind, 'attack');
  assert.equal(whoActs(s), 1);
  const act = find(getLegalActions(s, DB), (a) => a.type === 'activateTrap' && a.cardUid === mf.uid);
  s = applyAction(s, DB, act);
  assert.equal(s.pending, null);
  assert.equal(monstersOf(s.players[0]).length, 0);
  assert.equal(monstersOf(s.players[1]).length, 1);
  assert.equal(s.players[1].lp, 8000);
  assert.equal(whoActs(s), 0);
});

test('trappola posata questo turno non attivabile; con Jinzo scoperto nessuna trappola', () => {
  let s = newGame();
  clearBoard(s);
  s.turn = 3;
  put(s, 0, C.geminiElf, 'monster');
  put(s, 1, C.mirrorForce, 'spellTrap', { placedTurn: 3 });
  s = toBattle(s);
  s = applyAction(s, DB, find(getLegalActions(s, DB), (a) => a.type === 'attack'));
  // La finestra si chiude da sola: nessuna risposta possibile → attacco diretto risolto.
  assert.equal(s.pending, null);
  assert.equal(s.players[1].lp, 8000 - 1900);

  let s2 = newGame();
  clearBoard(s2);
  s2.turn = 3;
  put(s2, 0, C.jinzo, 'monster');
  put(s2, 1, C.mirrorForce, 'spellTrap');
  s2 = toBattle(s2);
  s2 = applyAction(s2, DB, find(getLegalActions(s2, DB), (a) => a.type === 'attack'));
  assert.equal(s2.pending, null);
  assert.equal(s2.players[1].lp, 8000 - 2400);
});

test('Trap Hole risponde all\'evocazione normale con ATK >= 1000', () => {
  let s = newGame();
  clearBoard(s);
  const elf = put(s, 0, C.geminiElf, 'hand');
  const th = put(s, 1, C.trapHole, 'spellTrap');
  s = applyAction(s, DB, { type: 'normalSummon', cardUid: elf.uid, position: 'atk', tributeUids: [] });
  assert.equal(whoActs(s), 1);
  s = applyAction(s, DB, find(getLegalActions(s, DB), (a) => a.type === 'activateTrap' && a.cardUid === th.uid));
  assert.equal(monstersOf(s.players[0]).length, 0);
  assert.equal(s.players[0].graveyard.length, 1);
  assert.equal(s.players[1].graveyard.length, 1);
});

test('Pot of Greed pesca 2 e va al cimitero; magia non implementata non attivabile ma posabile', () => {
  let s = newGame();
  clearBoard(s);
  const pot = put(s, 0, C.potOfGreed, 'hand');
  const uns = put(s, 0, C.unsupportedSpell, 'hand');
  const actions = getLegalActions(s, DB);
  assert.ok(actions.some((a) => a.type === 'activateSpell' && a.cardUid === pot.uid));
  assert.ok(!actions.some((a) => a.type === 'activateSpell' && a.cardUid === uns.uid));
  assert.ok(actions.some((a) => a.type === 'setSpellTrap' && a.cardUid === uns.uid));
  const deckBefore = s.players[0].deck.length;
  s = applyAction(s, DB, { type: 'activateSpell', cardUid: pot.uid, targets: [] });
  assert.equal(s.players[0].hand.length, 3);
  assert.equal(s.players[0].deck.length, deckBefore - 2);
  assert.equal(s.players[0].graveyard[0].cardId, C.potOfGreed.id);
});

test('Graceful Charity: pesca 3 poi scelta obbligatoria di 2 scarti', () => {
  let s = newGame();
  clearBoard(s);
  const gc = put(s, 0, C.gracefulCharity, 'hand');
  s = applyAction(s, DB, { type: 'activateSpell', cardUid: gc.uid, targets: [] });
  assert.equal(s.pendingChoices.length, 1);
  assert.equal(whoActs(s), 0);
  const choices = getLegalActions(s, DB);
  assert.ok(choices.every((a) => a.type === 'choose' && a.picks.length === 2));
  assert.equal(choices.length, 3);
  s = applyAction(s, DB, choices[0]);
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.players[0].graveyard.length, 3);
  assert.equal(s.pendingChoices.length, 0);
});

test('Monster Reborn con bersaglio dal cimitero avversario', () => {
  let s = newGame();
  clearBoard(s);
  const reborn = put(s, 0, C.monsterReborn, 'hand');
  const be = put(s, 1, C.blueEyes, 'graveyard');
  const a = find(getLegalActions(s, DB), (x) => x.type === 'activateSpell' && x.cardUid === reborn.uid && x.targets[0] === be.uid);
  s = applyAction(s, DB, a);
  const m = monstersOf(s.players[0])[0];
  assert.equal(m.cardId, C.blueEyes.id);
  assert.equal(m.controller, 0);
  assert.equal(m.owner, 1);
});

test('Man-Eater Bug: effetto flip quando attaccato, scelta del bersaglio', () => {
  let s = newGame();
  clearBoard(s);
  s.turn = 4;
  s.turnPlayer = 1; s.priority = 1;
  put(s, 1, C.geminiElf, 'monster');
  put(s, 1, C.celticGuardian, 'monster');
  put(s, 0, C.manEaterBug, 'monster', { position: 'facedown' });
  s = toBattle(s);
  const att = find(getLegalActions(s, DB), (a) => a.type === 'attack' && a.targetUid !== null);
  s = applyAction(s, DB, att);
  // Il giocatore 0 deve scegliere quale mostro distruggere (2 opzioni).
  assert.equal(s.pendingChoices.length, 1);
  assert.equal(whoActs(s), 0);
  const pick = getLegalActions(s, DB)[0];
  s = applyAction(s, DB, pick);
  assert.equal(monstersOf(s.players[1]).length, 1);
  assert.equal(s.pendingChoices.length, 0);
});

test('Marshmallon: non distrutto in battaglia, 1000 danni se attaccato coperto', () => {
  let s = newGame();
  clearBoard(s);
  s.turn = 3;
  put(s, 0, C.summonedSkull, 'monster');
  put(s, 1, C.marshmallon, 'monster', { position: 'facedown' });
  s = toBattle(s);
  s = applyAction(s, DB, find(getLegalActions(s, DB), (a) => a.type === 'attack' && a.targetUid !== null));
  assert.equal(s.players[0].lp, 7000);
  assert.equal(monstersOf(s.players[1]).length, 1);
  assert.equal(monstersOf(s.players[1])[0].position, 'def');
});

test('Sangan mandato al cimitero: ricerca nel deck', () => {
  let s = newGame();
  clearBoard(s);
  const sangan = put(s, 0, C.sangan, 'monster');
  const skull = put(s, 0, C.summonedSkull, 'hand');
  s = applyAction(s, DB, { type: 'normalSummon', cardUid: skull.uid, position: 'atk', tributeUids: [sangan.uid] });
  // Scelta della carta da cercare (più opzioni nel deck).
  assert.ok(s.pendingChoices.length === 1 || s.players[0].hand.length === 1);
  if (s.pendingChoices.length) {
    const before = s.players[0].hand.length;
    s = applyAction(s, DB, getLegalActions(s, DB)[0]);
    assert.equal(s.players[0].hand.length, before + 1);
  }
});

test('Evocazione Fusione con Polymerization e materiali esatti', () => {
  let s = newGame();
  clearBoard(s);
  s.players[0].extraDeck = [];
  const chimera = put(s, 0, C.chimera, 'extra');
  const poly = put(s, 0, C.polymerization, 'hand');
  put(s, 0, C.gazelle, 'hand');
  put(s, 0, C.berfomet, 'monster');
  const a = find(getLegalActions(s, DB), (x) => x.type === 'fusionSummon' && x.fusionUid === chimera.uid);
  s = applyAction(s, DB, a);
  assert.equal(a.type, 'fusionSummon');
  assert.equal(a.polymerizationUid, poly.uid);
  const m = monstersOf(s.players[0]);
  assert.equal(m.length, 1);
  assert.equal(m[0].cardId, C.chimera.id);
  assert.equal(s.players[0].graveyard.length, 3); // poly + 2 materiali
});

test('Evocazione Synchro: tuner + non-tuner con somma livelli esatta; Junk Warrior guadagna ATK', () => {
  let s = newGame();
  clearBoard(s);
  s.players[0].extraDeck = [];
  const jw = put(s, 0, C.junkWarrior, 'extra');
  put(s, 0, C.goyo, 'extra');
  put(s, 0, C.junkSynchron, 'monster');
  put(s, 0, C.speedWarrior, 'monster');
  put(s, 0, C.kuriboh, 'monster');
  const actions = getLegalActions(s, DB).filter((x) => x.type === 'synchroSummon');
  // Junk Warrior (5) = Synchron 3 + Speed Warrior 2 ; Goyo (6) = 3 + 2 + 1
  assert.equal(actions.length, 2);
  const a = find(actions, (x) => x.type === 'synchroSummon' && x.synchroUid === jw.uid);
  s = applyAction(s, DB, a);
  const m = monstersOf(s.players[0]);
  assert.equal(m.length, 2);
  const junk = m.find((c) => c.cardId === C.junkWarrior.id)!;
  assert.equal(junk.atkMod, 300); // Kuriboh (livello 1, 300 ATK) è rimasto sul terreno
});

test('Evocazione Rituale con magia rituale dedicata', () => {
  let s = newGame();
  clearBoard(s);
  put(s, 0, C.blackIllusionRitual, 'hand');
  const rel = put(s, 0, C.relinquished, 'hand');
  put(s, 0, C.kuriboh, 'hand');
  const a = find(getLegalActions(s, DB), (x) => x.type === 'ritualSummon' && x.ritualMonsterUid === rel.uid);
  s = applyAction(s, DB, a);
  assert.equal(monstersOf(s.players[0])[0].cardId, C.relinquished.id);
  assert.equal(s.players[0].hand.length, 0);
});

test('Equipaggiamento: bonus ATK e rimozione quando il mostro lascia il terreno', () => {
  let s = newGame();
  clearBoard(s);
  const axe = put(s, 0, C.axe, 'hand');
  const elf = put(s, 0, C.geminiElf, 'monster');
  s = applyAction(s, DB, find(getLegalActions(s, DB), (x) => x.type === 'activateSpell' && x.cardUid === axe.uid && x.targets[0] === elf.uid));
  assert.equal(monstersOf(s.players[0])[0].atkMod, 1000);
  assert.equal(s.players[0].spellTrapZone.filter(Boolean).length, 1);
  const dh = put(s, 0, C.darkHole, 'hand');
  s = applyAction(s, DB, { type: 'activateSpell', cardUid: dh.uid, targets: [] });
  assert.equal(monstersOf(s.players[0]).length, 0);
  assert.equal(s.players[0].spellTrapZone.filter(Boolean).length, 0, "l'ascia va al cimitero con il mostro");
});

test('Change of Heart: controllo fino alla End Phase', () => {
  let s = newGame();
  clearBoard(s);
  const coh = put(s, 0, C.changeOfHeart, 'hand');
  const be = put(s, 1, C.blueEyes, 'monster');
  s = applyAction(s, DB, find(getLegalActions(s, DB), (x) => x.type === 'activateSpell' && x.cardUid === coh.uid));
  assert.equal(monstersOf(s.players[0])[0].uid, be.uid);
  s = applyAction(s, DB, { type: 'nextPhase' }); s = applyAction(s, DB, { type: 'nextPhase' }); s = applyAction(s, DB, { type: 'nextPhase' });
  assert.equal(monstersOf(s.players[1])[0]?.uid, be.uid);
  assert.equal(monstersOf(s.players[0]).length, 0);
});

test('Swords of Revealing Light blocca gli attacchi avversari per 3 turni', () => {
  let s = newGame();
  clearBoard(s);
  const sw = put(s, 0, C.swords, 'hand');
  put(s, 1, C.blueEyes, 'monster');
  s = applyAction(s, DB, { type: 'activateSpell', cardUid: sw.uid, targets: [] });
  const endTurn = (st: GameState) => { st = applyAction(st, DB, { type: 'nextPhase' }); st = applyAction(st, DB, { type: 'nextPhase' }); return applyAction(st, DB, { type: 'nextPhase' }); };
  s = endTurn(s); // turno 2, giocatore 1
  s.players[1].hand = [];
  s = applyAction(s, DB, { type: 'nextPhase' });
  assert.ok(!getLegalActions(s, DB).some((a) => a.type === 'attack'), 'turno 2: niente attacchi');
  s = applyAction(s, DB, { type: 'nextPhase' }); s = applyAction(s, DB, { type: 'nextPhase' });
  s = endTurn(s); // turno 4
  s.players[1].hand = [];
  s = applyAction(s, DB, { type: 'nextPhase' });
  assert.ok(!getLegalActions(s, DB).some((a) => a.type === 'attack'), 'turno 4: niente attacchi');
  s = applyAction(s, DB, { type: 'nextPhase' }); s = applyAction(s, DB, { type: 'nextPhase' });
  s = endTurn(s); // turno 6
  s.players[1].hand = [];
  s = applyAction(s, DB, { type: 'nextPhase' });
  assert.ok(!getLegalActions(s, DB).some((a) => a.type === 'attack'), 'turno 6: niente attacchi');
  s = applyAction(s, DB, { type: 'nextPhase' }); s = applyAction(s, DB, { type: 'nextPhase' }); // end turno 6: le spade vanno al cimitero
  assert.ok(s.players[0].graveyard.some((c) => c.cardId === C.swords.id), 'spade al cimitero');
  s.players[0].hand = [];
  s = endTurn(s); // turno 8, giocatore 1
  s.players[1].hand = [];
  s = applyAction(s, DB, { type: 'nextPhase' });
  assert.ok(getLegalActions(s, DB).some((a) => a.type === 'attack'), 'turno 8: si attacca di nuovo');
});

test('limite di mano: scarto a fine turno', () => {
  let s = newGame();
  clearBoard(s);
  for (let i = 0; i < 8; i++) put(s, 0, C.kuriboh, 'hand');
  s = applyAction(s, DB, { type: 'nextPhase' }); s = applyAction(s, DB, { type: 'nextPhase' }); s = applyAction(s, DB, { type: 'nextPhase' });
  assert.equal(s.pendingChoices.length, 1);
  assert.equal(s.turnPlayer, 0, 'il turno non passa prima dello scarto');
  s = applyAction(s, DB, getLegalActions(s, DB)[0]);
  assert.equal(s.players[0].hand.length, 6);
  assert.equal(s.turnPlayer, 1);
});

test('azione illegale rifiutata', () => {
  const s = newGame();
  assert.throws(() => applyAction(s, DB, { type: 'attack', attackerUid: 1, targetUid: null }));
});

// ------------------------------------------------------- IA vs IA

function playGame(d0: 'facile' | 'medio' | 'difficile', d1: 'facile' | 'medio' | 'difficile', seed: number) {
  let s = newGame(seed);
  let rngState = seed;
  const random = () => { rngState = (rngState * 1103515245 + 12345) & 0x7fffffff; return rngState / 0x7fffffff; };
  let steps = 0;
  while (s.winner === null && steps < 3000) {
    const who = whoActs(s);
    const a = chooseAction(s, DB, who === 0 ? d0 : d1, { random });
    s = applyAction(s, DB, a);
    steps++;
  }
  return { state: s, steps };
}

test('IA vs IA: le partite terminano senza errori né stalli', () => {
  for (const [d0, d1, seed] of [['facile', 'facile', 1], ['medio', 'facile', 2], ['medio', 'medio', 3], ['difficile', 'medio', 4]] as const) {
    const { state, steps } = playGame(d0, d1, seed);
    assert.ok(state.winner !== null, `${d0} vs ${d1} (seed ${seed}): nessun vincitore dopo ${steps} passi (turno ${state.turn})`);
    assert.ok(state.turn < 120, `partita troppo lunga: ${state.turn} turni`);
  }
});

test('IA media batte IA facile nella maggior parte delle partite', () => {
  let wins = 0;
  const N = 12;
  for (let i = 0; i < N; i++) {
    const { state } = playGame(i % 2 === 0 ? 'medio' : 'facile', i % 2 === 0 ? 'facile' : 'medio', 100 + i);
    const medioIs: PlayerId = i % 2 === 0 ? 0 : 1;
    if (state.winner === medioIs) wins++;
  }
  assert.ok(wins >= N * 0.6, `IA media ha vinto solo ${wins}/${N}`);
});
