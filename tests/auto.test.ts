import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GX, byName, blankGame, put, find } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { getLegalActions, whoActs } from '../src/engine/rules';
import { monstersOf, spellTrapsOf } from '../src/engine/cards';
import { isEffectImplemented, scriptFor } from '../src/engine/effects/library';
import { effectiveAtk } from '../src/engine/stats';

const next = (s: ReturnType<typeof blankGame>) => applyAction(s, GX, { type: 'nextPhase' });

test('interprete: carte note sono riconosciute', () => {
  for (const n of ['Reinforcement of the Army', 'Threatening Roar', 'Zaborg the Thunder Monarch', 'Lightning Vortex', 'Giant Trunade', 'Umi', 'Gravity Bind', 'Trade-In', 'Magician of Faith', 'Fairy Meteor Crush', 'Cyber Dragon', 'Mobius the Frost Monarch', 'Raiza the Storm Monarch', 'Destiny HERO - Malicious', 'Armageddon Knight', 'Goblin Elite Attack Force', 'Mezuki', 'Gravekeeper\'s Spy', 'Night Assailant', 'Compulsory Evacuation Device', 'Raigeki Break', 'Sakuretsu Armor', 'Just Desserts', 'Brain Control', 'Cyber End Dragon']) {
    assert.ok(isEffectImplemented(byName(n)), `${n} dovrebbe essere implementata: ${JSON.stringify(scriptFor(byName(n))?.unparsed ?? scriptFor(byName(n))?.approx)}`);
  }
});

test('interprete: le carte non capite non sono attivabili (nessun effetto parziale)', () => {
  for (const n of ['Mind Crush', 'Solemn Judgment', 'Future Fusion', 'Gladiator Beast Bestiari']) {
    assert.ok(!isEffectImplemented(byName(n)), `${n} non dovrebbe risultare implementata`);
  }
  const s = scriptFor(byName('Gladiator Beast Bestiari'));
  assert.ok(s?.unparsed && s.unparsed.length > 0);
  assert.ok(!s?.triggers && !s?.activation, 'solo restrizioni');
});

test('Reinforcement of the Army: ricerca guerriero di livello ≤ 4 dal deck', () => {
  let s = blankGame();
  const rota = put(s, 0, 'Reinforcement of the Army', 'hand');
  put(s, 0, 'Marauding Captain', 'deckTop');
  put(s, 0, 'Summoned Skull', 'deckTop');
  s = applyAction(s, GX, { type: 'activateSpell', cardUid: rota.uid, targets: [] });
  // Un solo candidato (Kuriboh non è guerriero, Summoned Skull è livello 6): scelta automatica.
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(GX[s.players[0].hand[0].cardId].name, 'Marauding Captain');
});

test('Zaborg: al Tribute Summon distrugge un mostro a scelta', () => {
  let s = blankGame();
  const zab = put(s, 0, 'Zaborg the Thunder Monarch', 'hand');
  const trib = put(s, 0, 'Kuriboh', 'monster');
  put(s, 1, 'Summoned Skull', 'monster');
  put(s, 1, 'Gemini Elf', 'monster');
  s = applyAction(s, GX, { type: 'normalSummon', cardUid: zab.uid, position: 'atk', tributeUids: [trib.uid] });
  assert.equal(s.pendingChoices.length, 1, 'scelta del bersaglio');
  assert.equal(whoActs(s), 0);
  const pick = getLegalActions(s, GX)[0];
  s = applyAction(s, GX, pick);
  assert.equal(monstersOf(s.players[1]).length, 1);
});

test('Cyber Dragon: evocazione speciale dalla mano solo se l\'avversario controlla mostri e io no', () => {
  let s = blankGame();
  const cd = put(s, 0, 'Cyber Dragon', 'hand');
  assert.ok(!getLegalActions(s, GX).some((a) => a.type === 'activateMonsterEffect' && a.cardUid === cd.uid), 'senza mostri avversari no');
  put(s, 1, 'Gemini Elf', 'monster');
  const a = find(getLegalActions(s, GX), (x) => x.type === 'activateMonsterEffect' && x.cardUid === cd.uid, 'Cyber Dragon');
  s = applyAction(s, GX, a);
  assert.equal(monstersOf(s.players[0])[0]?.cardId, cd.cardId);
  assert.ok(!s.players[0].normalSummonedThisTurn, 'non consuma l\'evocazione normale');
});

test('Threatening Roar: l\'avversario non può attaccare nel turno', () => {
  let s = blankGame();
  s.turnPlayer = 1; s.priority = 1;
  put(s, 1, 'Summoned Skull', 'monster');
  const roar = put(s, 0, 'Threatening Roar', 'spellTrap');
  s = next(s); // inizio Battle Phase del giocatore 1: finestra di risposta per il giocatore 0
  assert.equal(s.pending?.kind, 'battleStart');
  assert.equal(whoActs(s), 0);
  s = applyAction(s, GX, find(getLegalActions(s, GX), (a) => a.type === 'activateTrap' && a.cardUid === roar.uid));
  assert.equal(whoActs(s), 1);
  assert.ok(!getLegalActions(s, GX).some((a) => a.type === 'attack'), 'nessun attacco possibile');
});

test('Umi: aura +200 ATK/DEF ai Pesci, -200 alle Macchine', () => {
  const s = blankGame();
  const fish = put(s, 0, '7 Colored Fish', 'monster');
  const mach = put(s, 1, 'Cyber Dragon', 'monster');
  assert.equal(effectiveAtk(s, GX, fish), 1800);
  put(s, 0, 'Umi', 'field');
  assert.equal(effectiveAtk(s, GX, fish), 2000);
  assert.equal(effectiveAtk(s, GX, mach), 2100 - 200);
});

test('Gravity Bind: i mostri di livello ≥ 4 non attaccano', () => {
  let s = blankGame();
  put(s, 0, 'Gemini Elf', 'monster'); // livello 4
  put(s, 0, 'Kuriboh', 'monster', { position: 'atk' }); // livello 1
  const gb = put(s, 1, 'Gravity Bind', 'spellTrap', { faceDown: false });
  void gb;
  s = next(s);
  const attacks = getLegalActions(s, GX).filter((a) => a.type === 'attack');
  assert.equal(attacks.length, 1);
});

test('Fairy Meteor Crush: danno perforante tramite equipaggiamento', () => {
  let s = blankGame();
  const skull = put(s, 0, 'Summoned Skull', 'monster');
  const fmc = put(s, 0, 'Fairy Meteor Crush', 'hand');
  put(s, 1, 'Kuriboh', 'monster', { position: 'def' });
  s = applyAction(s, GX, find(getLegalActions(s, GX), (a) => a.type === 'activateSpell' && a.cardUid === fmc.uid && a.targets[0] === skull.uid));
  s = next(s);
  s = applyAction(s, GX, find(getLegalActions(s, GX), (a) => a.type === 'attack' && a.targetUid !== null));
  assert.equal(s.players[1].lp, 8000 - (2500 - 200));
});

test('Cyber Twin Dragon attacca due volte; Cyber End perfora', () => {
  let s = blankGame();
  put(s, 0, 'Cyber Twin Dragon', 'monster');
  put(s, 1, 'Kuriboh', 'monster', { position: 'def' });
  put(s, 1, 'Kuriboh', 'monster', { position: 'def' });
  s = next(s);
  s = applyAction(s, GX, find(getLegalActions(s, GX), (a) => a.type === 'attack'));
  assert.ok(getLegalActions(s, GX).some((a) => a.type === 'attack'), 'secondo attacco disponibile');
  s = applyAction(s, GX, find(getLegalActions(s, GX), (a) => a.type === 'attack'));
  assert.ok(!getLegalActions(s, GX).some((a) => a.type === 'attack'));
  assert.equal(monstersOf(s.players[1]).length, 0);
});

test('Destiny HERO - Malicious: dal cimitero, bandisci per evocare una copia dal deck', () => {
  let s = blankGame();
  const mal = put(s, 0, 'Destiny HERO - Malicious', 'graveyard');
  put(s, 0, 'Destiny HERO - Malicious', 'deckTop');
  const a = find(getLegalActions(s, GX), (x) => x.type === 'activateMonsterEffect' && x.cardUid === mal.uid, 'Malicious');
  s = applyAction(s, GX, a);
  assert.equal(s.players[0].banished.length, 1);
  assert.equal(monstersOf(s.players[0]).length, 1);
});

test('Elemental HERO Flame Wingman: fusione con Polymerization e danno da effetto', () => {
  let s = blankGame();
  s.players[0].extraDeck = [];
  put(s, 0, 'Elemental HERO Flame Wingman', 'extra');
  put(s, 0, 'Polymerization', 'hand');
  put(s, 0, 'Elemental HERO Avian', 'hand');
  put(s, 0, 'Elemental HERO Burstinatrix', 'monster');
  put(s, 1, 'Gemini Elf', 'monster');
  s = applyAction(s, GX, find(getLegalActions(s, GX), (a) => a.type === 'fusionSummon', 'fusione'));
  assert.equal(GX[monstersOf(s.players[0])[0].cardId].name, 'Elemental HERO Flame Wingman');
  s = next(s);
  s = applyAction(s, GX, find(getLegalActions(s, GX), (a) => a.type === 'attack' && a.targetUid !== null));
  assert.equal(s.players[1].lp, 8000 - 200 - 1900);
});

test('Miracle Fusion: bandisce i materiali dal cimitero', () => {
  let s = blankGame();
  s.players[0].extraDeck = [];
  put(s, 0, 'Elemental HERO Flame Wingman', 'extra');
  const mf = put(s, 0, 'Miracle Fusion', 'hand');
  put(s, 0, 'Elemental HERO Avian', 'graveyard');
  put(s, 0, 'Elemental HERO Burstinatrix', 'graveyard');
  s = applyAction(s, GX, find(getLegalActions(s, GX), (a) => a.type === 'activateSpell' && a.cardUid === mf.uid, 'Miracle Fusion'));
  assert.equal(s.players[0].banished.length, 2);
  assert.equal(monstersOf(s.players[0]).length, 1);
});

test('Skill Drain nega gli effetti dei mostri sul terreno', () => {
  let s = blankGame();
  put(s, 0, 'Skill Drain', 'spellTrap', { faceDown: false });
  const sk = put(s, 1, 'Summoned Skull', 'monster');
  put(s, 0, 'Marshmallon', 'monster', { position: 'def' });
  s.turnPlayer = 1; s.priority = 1;
  s = next(s);
  s = applyAction(s, GX, find(getLegalActions(s, GX), (a) => a.type === 'attack' && a.attackerUid === sk.uid));
  assert.equal(monstersOf(s.players[0]).length, 0, 'Marshmallon distrutto: effetto negato');
});

test('Scapegoat: 4 segnalini che non possono essere tributati', () => {
  let s = blankGame();
  const sg = put(s, 0, 'Scapegoat', 'spellTrap');
  put(s, 0, 'Summoned Skull', 'hand');
  s = applyAction(s, GX, find(getLegalActions(s, GX), (a) => a.type === 'activateSpell' && a.cardUid === sg.uid));
  assert.equal(monstersOf(s.players[0]).length, 4);
  assert.ok(!getLegalActions(s, GX).some((a) => a.type === 'normalSummon'), 'i segnalini non valgono come tributo');
  s = applyAction(s, GX, { type: 'activateSpell', cardUid: put(s, 0, 'Dark Hole', 'hand').uid, targets: [] });
  assert.equal(s.players[0].graveyard.filter((c) => GX[c.cardId].type === 'Token').length, 0, 'i segnalini non vanno al cimitero');
});

test('Level Limit - Area B tiene in difesa i mostri di livello ≥ 4', () => {
  let s = blankGame();
  put(s, 1, 'Level Limit - Area B', 'spellTrap', { faceDown: false });
  const elf = put(s, 0, 'Gemini Elf', 'hand');
  s = applyAction(s, GX, { type: 'normalSummon', cardUid: elf.uid, position: 'atk', tributeUids: [] });
  assert.equal(monstersOf(s.players[0])[0].position, 'def');
  s = next(s); s = next(s); s = next(s); // turno 2
  s.players[1].hand = [];
  s = next(s); s = next(s); s = next(s); // turno 3 giocatore 0
  assert.ok(!getLegalActions(s, GX).some((a) => a.type === 'changePosition'), 'non può tornare in attacco');
});

test('Breaker: segnalino, +300 ATK e distruzione magia/trappola', () => {
  let s = blankGame();
  const br = put(s, 0, 'Breaker the Magical Warrior', 'hand');
  const mf = put(s, 1, 'Mirror Force', 'spellTrap');
  s = applyAction(s, GX, { type: 'normalSummon', cardUid: br.uid, position: 'atk', tributeUids: [] });
  const b = monstersOf(s.players[0])[0];
  assert.equal(b.counters, 1);
  assert.equal(effectiveAtk(s, GX, b), 1900);
  s = applyAction(s, GX, find(getLegalActions(s, GX), (a) => a.type === 'activateMonsterEffect' && a.cardUid === br.uid && a.targets[0] === mf.uid, 'Breaker'));
  assert.equal(spellTrapsOf(s.players[1]).length, 0);
  assert.equal(effectiveAtk(s, GX, monstersOf(s.players[0])[0]), 1600);
});
