import type { Action, CardDb, CardInstance, GameState, PendingEvent, PlayerId } from './types';
import { contactFusionMode, findCard, isExtraDeckMonster, isFieldSpell, monstersOf, other, shuffleInPlace, spellTrapsOf } from './cards';
import { effectiveAtk, effectiveDef } from './stats';
import {
  banishCard, cardName, dealDamage, monsterEffectsNegated, placeInSpellZone, destroyCards, drawCards, fireTriggers, firstFreeSlot, flipFaceUp, log, makeContext, placeMonster,
  removeFromZone, resolveTriggerChoice, sendToGraveyard, specialSummon,
} from './context';
import { getLegalActions, whoActs } from './rules';
import { scriptFor } from './effects/library';

// ---------------------------------------------------------------------------
// Reducer: applica un'azione e restituisce il nuovo stato (copia profonda).
// ---------------------------------------------------------------------------

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export class IllegalActionError extends Error {}

export function applyAction(prev: GameState, db: CardDb, action: Action, opts: { validate?: boolean } = {}): GameState {
  const state = cloneState(prev);
  if (opts.validate !== false) {
    const legal = getLegalActions(state, db);
    if (!legal.some((l) => sameAction(l, action))) {
      throw new IllegalActionError(`Azione non legale: ${JSON.stringify(action)}`);
    }
  }
  const actor = whoActs(state);
  switch (action.type) {
    case 'surrender':
      state.winner = other(actor);
      state.winReason = `Il giocatore ${actor + 1} si è arreso.`;
      break;
    case 'choose':
      resolveChoice(state, db, action.picks);
      break;
    case 'pass':
      resolvePendingAfterResponse(state, db);
      break;
    case 'nextPhase':
      nextPhase(state, db);
      break;
    case 'normalSummon':
      normalSummon(state, db, actor, action.cardUid, action.position, action.tributeUids);
      break;
    case 'flipSummon':
      flipSummon(state, db, actor, action.cardUid);
      break;
    case 'changePosition':
      changePosition(state, db, action.cardUid);
      break;
    case 'setSpellTrap':
      setSpellTrap(state, db, actor, action.cardUid);
      break;
    case 'activateSpell':
    case 'activateTrap':
      activateSpellTrap(state, db, actor, action.cardUid, action.targets);
      break;
    case 'activateMonsterEffect':
      activateMonsterEffect(state, db, actor, action.cardUid, action.targets);
      break;
    case 'fusionSummon':
      fusionSummon(state, db, actor, action.fusionUid, action.materialUids, action.polymerizationUid);
      break;
    case 'synchroSummon':
      extraDeckSummon(state, db, actor, action.synchroUid, action.materialUids, 'Synchro');
      break;
    case 'ritualSummon':
      ritualSummon(state, db, actor, action.ritualSpellUid, action.ritualMonsterUid, action.tributeUids);
      break;
    case 'attack':
      declareAttack(state, db, actor, action.attackerUid, action.targetUid);
      break;
  }
  autoResolve(state, db);
  applyContinuousEffects(state, db);
  checkExodia(state, db);
  state.priority = whoActs(state);
  return state;
}

const EXODIA = ['Exodia the Forbidden One', 'Right Arm of the Forbidden One', 'Left Arm of the Forbidden One', 'Right Leg of the Forbidden One', 'Left Leg of the Forbidden One'];

/** Vittoria immediata con i cinque pezzi di Exodia in mano. */
function checkExodia(state: GameState, db: CardDb): void {
  if (state.winner !== null) return;
  for (const p of [0, 1] as PlayerId[]) {
    const names = new Set(state.players[p].hand.map((c) => db[c.cardId]?.name));
    if (EXODIA.every((n) => names.has(n))) {
      state.winner = p;
      state.winReason = `Il giocatore ${p + 1} ha riunito i cinque pezzi di Exodia!`;
      log(state, state.winReason, p);
    }
  }
}

/** Effetti continui che vanno riapplicati dopo ogni azione (Limite di Livello - Area B). */
function applyContinuousEffects(state: GameState, db: CardDb): void {
  const sources: { p: PlayerId; c: CardInstance }[] = [];
  for (const p of [0, 1] as PlayerId[]) {
    for (const s of spellTrapsOf(state.players[p])) if (!s.faceDown && scriptFor(db[s.cardId])?.forceDefense) sources.push({ p, c: s });
  }
  if (sources.length === 0) return;
  for (const p of [0, 1] as PlayerId[]) {
    for (const m of monstersOf(state.players[p])) {
      if (m.position !== 'atk') continue;
      for (const src of sources) {
        const fd = scriptFor(db[src.c.cardId])!.forceDefense!;
        if (fd(makeContext(state, db, src.p, src.c, [], null), m)) {
          m.position = 'def';
          break;
        }
      }
    }
  }
}

export function sameAction(a: Action, b: Action): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Chiude automaticamente le finestre di risposta in cui l'unica azione possibile
 * è "passa", così la UI non mostra prompt inutili e l'IA non spreca cicli.
 */
function autoResolve(state: GameState, db: CardDb): void {
  let guard = 0;
  while (state.winner === null && state.pending && state.pendingChoices.length === 0 && guard++ < 10) {
    const legal = getLegalActions(state, db);
    if (legal.length === 1 && legal[0].type === 'pass') resolvePendingAfterResponse(state, db);
    else break;
  }
  // Coda di scelte con un'unica opzione obbligatoria: risolta automaticamente.
  guard = 0;
  while (state.winner === null && state.pendingChoices.length > 0 && guard++ < 10) {
    const ch = state.pendingChoices[0];
    if (ch.options.length === 0) {
      state.pendingChoices.shift();
      continue;
    }
    if (ch.min === ch.max && ch.options.length === ch.min) {
      resolveChoice(state, db, [...ch.options]);
      continue;
    }
    break;
  }
  if (state.winner === null && state.pending && state.pendingChoices.length === 0) {
    const legal = getLegalActions(state, db);
    if (legal.length === 1 && legal[0].type === 'pass') autoResolve(state, db);
  }
}

// ---------------------------------------------------------------- Fasi

function nextPhase(state: GameState, db: CardDb): void {
  switch (state.phase) {
    case 'main1':
      state.phase = 'battle';
      log(state, 'Battle Phase.', state.turnPlayer);
      state.pending = { kind: 'battleStart', responder: other(state.turnPlayer) };
      break;
    case 'battle':
      state.phase = 'main2';
      log(state, 'Main Phase 2.', state.turnPlayer);
      break;
    case 'main2':
      state.phase = 'end';
      endPhase(state, db);
      break;
    default:
      state.phase = 'main1';
  }
}

function endPhase(state: GameState, db: CardDb): void {
  const p = state.turnPlayer;
  const ps = state.players[p];
  log(state, 'End Phase.', p);
  for (const q of [0, 1] as PlayerId[]) {
    const qs = state.players[q];
    for (const m of [...monstersOf(qs).filter((c) => c.position !== 'facedown'), ...spellTrapsOf(qs).filter((c) => !c.faceDown), ...(qs.fieldZone ? [qs.fieldZone] : [])]) {
      if (q === p) fireTriggers(state, db, m, 'endPhase', q, null);
      fireTriggers(state, db, m, 'endPhaseAny', q, null);
    }
  }
  // Change of Heart: i mostri tornano al proprietario.
  for (const q of [0, 1] as PlayerId[]) {
    for (const m of monstersOf(state.players[q])) {
      if (m.controlUntilEndOfTurn && m.owner !== q) {
        const slot = firstFreeSlot(state.players[m.owner].monsterZone);
        const idx = state.players[q].monsterZone.findIndex((c) => c?.uid === m.uid);
        if (slot >= 0) {
          state.players[q].monsterZone[idx] = null;
          m.controller = m.owner;
          m.controlUntilEndOfTurn = false;
          state.players[m.owner].monsterZone[slot] = m;
          log(state, `${cardName(db, m)} torna al proprietario.`);
        }
      }
    }
  }
  // Mostri Spirit: tornano in mano se evocati normalmente o scoperti in questo turno.
  for (const m of monstersOf(ps)) {
    const script = scriptFor(db[m.cardId]);
    if (script?.spiritReturn && m.position !== 'facedown' && (m.placedTurn === state.turn || m.positionChangedTurn === state.turn)) {
      const c = removeFromZone(state, db, m.uid)!;
      state.players[c.owner].hand.push(c);
      log(state, `${cardName(db, c)} torna in mano (Spirit).`, p);
    }
  }
  // Spade della Luce Rivelatrice scadute.
  for (const q of [0, 1] as PlayerId[]) {
    for (const st of spellTrapsOf(state.players[q])) {
      if (st.expiresTurn !== undefined && state.turn >= st.expiresTurn && q !== p) sendToGraveyard(state, db, st.uid);
    }
  }
  // Limite di carte in mano.
  if (ps.hand.length > 6) {
    state.pendingChoices.push({
      player: p,
      prompt: `Scarta ${ps.hand.length - 6} carte per il limite di mano`,
      options: ps.hand.map((c) => c.uid),
      min: ps.hand.length - 6,
      max: ps.hand.length - 6,
      resolve: { kind: 'endPhaseDiscard' },
    });
    return; // il passaggio di turno avviene dopo lo scarto
  }
  startNextTurn(state, db);
}

function startNextTurn(state: GameState, db: CardDb): void {
  const prevPlayer = state.turnPlayer;
  const ps = state.players[prevPlayer];
  ps.normalSummonedThisTurn = false;
  for (const q of [0, 1] as PlayerId[]) {
    for (const m of monstersOf(state.players[q])) {
      delete m.tempAtkMod;
      delete m.tempDefMod;
    }
  }
  for (const m of monstersOf(ps)) {
    m.hasAttackedThisTurn = false;
    m.attacksThisTurn = 0;
  }
  state.attackNegatedForUids = [];
  state.turn += 1;
  state.turnPlayer = other(prevPlayer);
  state.phase = 'draw';
  log(state, `— Turno ${state.turn}: giocatore ${state.turnPlayer + 1} —`, state.turnPlayer);
  const np = state.players[state.turnPlayer];
  if (np.skipDraws && np.skipDraws > 0) {
    np.skipDraws -= 1;
    log(state, 'Draw Phase saltata.', state.turnPlayer);
  } else {
    drawCards(state, db, state.turnPlayer, 1);
  }
  if (state.winner !== null) return;
  state.phase = 'standby';
  const tp = state.players[state.turnPlayer];
  for (const m of [...monstersOf(tp).filter((c) => c.position !== 'facedown'), ...spellTrapsOf(tp).filter((c) => !c.faceDown), ...(tp.fieldZone ? [tp.fieldZone] : [])]) {
    fireTriggers(state, db, m, 'standby', state.turnPlayer, null);
  }
  for (const q of [0, 1] as PlayerId[]) {
    const qs = state.players[q];
    for (const m of [...monstersOf(qs).filter((c) => c.position !== 'facedown'), ...spellTrapsOf(qs).filter((c) => !c.faceDown), ...(qs.fieldZone ? [qs.fieldZone] : [])]) {
      fireTriggers(state, db, m, 'standbyAny', q, null);
    }
  }
  state.phase = 'main1';
}

// ------------------------------------------------------------ Evocazioni

function normalSummon(state: GameState, db: CardDb, p: PlayerId, cardUid: number, position: 'atk' | 'facedown', tributeUids: number[]): void {
  for (const t of tributeUids) {
    const loc = findCard(state, t);
    if (!loc) continue;
    log(state, `${cardName(db, loc.card)} viene offerto come tributo.`, p);
    const tributedCard = loc.card;
    const controller = loc.card.controller;
    sendToGraveyard(state, db, t);
    fireTriggers(state, db, tributedCard, 'tributed', controller, null);
  }
  const loc = findCard(state, cardUid)!;
  placeMonster(state, db, cardUid, p, position, position === 'atk' ? 'normal' : 'none');
  loc.card.summonTributes = tributeUids.length;
  state.players[p].normalSummonedThisTurn = true;
  const name = db[loc.card.cardId].name;
  if (position === 'atk') {
    log(state, `${name} viene evocato in attacco.`, p);
    const card = findCard(state, cardUid)!.card;
    fireTriggers(state, db, card, 'normalSummon', p, null);
    if (tributeUids.length > 0) fireTriggers(state, db, card, 'tributeSummon', p, null);
    fireTriggers(state, db, card, 'summon', p, null);
    state.pending = { kind: 'summon', cardUid, how: 'normal', responder: other(p) };
  } else {
    log(state, `Giocatore ${p + 1} posiziona un mostro coperto.`, p);
  }
}

function flipSummon(state: GameState, db: CardDb, p: PlayerId, cardUid: number): void {
  const loc = findCard(state, cardUid)!;
  loc.card.positionChangedTurn = state.turn;
  loc.card.properlySummoned = true;
  flipFaceUp(state, db, cardUid, null);
  loc.card.position = 'atk';
  log(state, `Evocazione flip di ${cardName(db, loc.card)}.`, p);
  fireTriggers(state, db, loc.card, 'flipSummon', p, null);
  fireTriggers(state, db, loc.card, 'summon', p, null);
  state.pending = { kind: 'summon', cardUid, how: 'flip', responder: other(p) };
}

function changePosition(state: GameState, db: CardDb, cardUid: number): void {
  const loc = findCard(state, cardUid)!;
  loc.card.position = loc.card.position === 'atk' ? 'def' : 'atk';
  loc.card.positionChangedTurn = state.turn;
  log(state, `${cardName(db, loc.card)} passa in posizione di ${loc.card.position === 'atk' ? 'attacco' : 'difesa'}.`);
}

function setSpellTrap(state: GameState, db: CardDb, p: PlayerId, cardUid: number): void {
  const ps = state.players[p];
  const slot = firstFreeSlot(ps.spellTrapZone);
  const card = removeFromZone(state, db, cardUid)!;
  card.faceDown = true;
  card.placedTurn = state.turn;
  ps.spellTrapZone[slot] = card;
  log(state, `Giocatore ${p + 1} posiziona una magia/trappola coperta.`, p);
}

function activateSpellTrap(state: GameState, db: CardDb, p: PlayerId, cardUid: number, targets: number[]): void {
  const loc = findCard(state, cardUid)!;
  const data = db[loc.card.cardId];
  const act = scriptFor(data)?.activation!;
  const ps = state.players[p];
  if (isFieldSpell(data)) {
    // Magia terreno: prende il posto di quella eventualmente presente.
    if (ps.fieldZone) sendToGraveyard(state, db, ps.fieldZone.uid);
    const card = removeFromZone(state, db, cardUid)!;
    card.faceDown = false;
    card.placedTurn = state.turn;
    ps.fieldZone = card;
  } else if (loc.zone === 'hand') {
    // La carta va sul terreno scoperta (se era in mano).
    const slot = firstFreeSlot(ps.spellTrapZone);
    const card = removeFromZone(state, db, cardUid)!;
    card.faceDown = false;
    card.placedTurn = state.turn;
    ps.spellTrapZone[slot] = card;
  } else {
    loc.card.faceDown = false;
  }
  const card = findCard(state, cardUid)!.card;
  log(state, `Giocatore ${p + 1} attiva ${data.name}.`, p);
  const ctx = makeContext(state, db, p, card, targets, state.pending);
  act.resolve(ctx);
  if (!act.staysOnField && !isFieldSpell(data)) {
    const still = findCard(state, cardUid);
    if (still && still.zone === 'spellTrapZone') sendToGraveyard(state, db, cardUid);
  }
}

function activateMonsterEffect(state: GameState, db: CardDb, p: PlayerId, cardUid: number, targets: number[]): void {
  const loc = findCard(state, cardUid)!;
  const data = db[loc.card.cardId];
  const act = scriptFor(data)?.activation!;
  log(state, `Giocatore ${p + 1} attiva l'effetto di ${data.name}.`, p);
  loc.card.effectUsedTurn = state.turn;
  if (act.tributeSelf) sendToGraveyard(state, db, cardUid);
  if (loc.zone === 'hand' && !act.selfSummon) {
    log(state, `${data.name} viene scartato come costo.`, p);
    sendToGraveyard(state, db, cardUid, { fromField: false });
  }
  if (loc.zone === 'graveyard' && act.fromGraveyard) {
    log(state, `${data.name} viene bandito dal cimitero come costo.`, p);
    banishCard(state, db, cardUid);
  }
  const ctx = makeContext(state, db, p, loc.card, targets, state.pending);
  act.resolve(ctx);
}

function fusionSummon(state: GameState, db: CardDb, p: PlayerId, fusionUid: number, materialUids: number[], polyUid: number): void {
  if (polyUid < 0) {
    // Fusione "a contatto": i materiali sul terreno vengono banditi (-1) o mandati al cimitero (-2).
    const mode = contactFusionMode(db[findCard(state, fusionUid)!.card.cardId]);
    log(state, `Giocatore ${p + 1} evoca una fusione senza Polymerization.`, p);
    if (mode === 'banish') for (const m of materialUids) banishCard(state, db, m);
    else for (const m of materialUids) sendToGraveyard(state, db, m, { fromField: true });
    placeMonster(state, db, fusionUid, p, 'atk', 'special');
    const card = findCard(state, fusionUid)!.card;
    log(state, `Evocazione Fusione: ${cardName(db, card)}!`, p);
    fireTriggers(state, db, card, 'specialSummon', p, null);
    fireTriggers(state, db, card, 'summon', p, null);
    state.pending = { kind: 'summon', cardUid: fusionUid, how: 'special', responder: other(p) };
    return;
  }
  const polyLoc = findCard(state, polyUid)!;
  log(state, `Giocatore ${p + 1} attiva Polymerization.`, p);
  // Polymerization va al cimitero (dalla mano o dal terreno).
  sendToGraveyard(state, db, polyUid, { fromField: polyLoc.zone !== 'hand' });
  extraDeckSummon(state, db, p, fusionUid, materialUids, 'Fusione');
}

function extraDeckSummon(state: GameState, db: CardDb, p: PlayerId, monsterUid: number, materialUids: number[], label: string): void {
  for (const m of materialUids) sendToGraveyard(state, db, m, { fromField: true });
  placeMonster(state, db, monsterUid, p, 'atk', 'special');
  const card = findCard(state, monsterUid)!.card;
  log(state, `Evocazione ${label}: ${cardName(db, card)}!`, p);
  fireTriggers(state, db, card, 'specialSummon', p, null);
  fireTriggers(state, db, card, 'summon', p, null);
  state.pending = { kind: 'summon', cardUid: monsterUid, how: 'special', responder: other(p) };
}

function ritualSummon(state: GameState, db: CardDb, p: PlayerId, spellUid: number, monsterUid: number, tributeUids: number[]): void {
  const spellLoc = findCard(state, spellUid)!;
  log(state, `Giocatore ${p + 1} attiva ${cardName(db, spellLoc.card)}.`, p);
  sendToGraveyard(state, db, spellUid, { fromField: false });
  for (const t of tributeUids) sendToGraveyard(state, db, t);
  placeMonster(state, db, monsterUid, p, 'atk', 'special');
  const card = findCard(state, monsterUid)!.card;
  log(state, `Evocazione Rituale: ${cardName(db, card)}!`, p);
  fireTriggers(state, db, card, 'specialSummon', p, null);
  fireTriggers(state, db, card, 'summon', p, null);
  state.pending = { kind: 'summon', cardUid: monsterUid, how: 'special', responder: other(p) };
}

// -------------------------------------------------------------- Battaglia

function declareAttack(state: GameState, db: CardDb, p: PlayerId, attackerUid: number, targetUid: number | null): void {
  const att = findCard(state, attackerUid)!.card;
  att.hasAttackedThisTurn = true;
  att.attacksThisTurn = (att.attacksThisTurn ?? 0) + 1;
  const targetName = targetUid === null ? 'direttamente' : (findCard(state, targetUid)?.card.position === 'facedown' ? 'un mostro coperto' : cardName(db, findCard(state, targetUid)!.card));
  log(state, `${cardName(db, att)} attacca ${targetName}.`, p);
  state.pending = { kind: 'attack', attackerUid, targetUid, responder: other(p) };
}

/** Chiamata quando la finestra di risposta si chiude (pass o dopo la risoluzione di una trappola). */
function resolvePendingAfterResponse(state: GameState, db: CardDb): void {
  const ev = state.pending;
  if (!ev) return;
  state.pending = null;
  if (ev.kind === 'attack') resolveBattle(state, db, ev);
  // Per 'summon' non c'è nulla da risolvere: si prosegue.
}

function resolveBattle(state: GameState, db: CardDb, ev: Extract<PendingEvent, { kind: 'attack' }>): void {
  const attLoc = findCard(state, ev.attackerUid);
  if (!attLoc || attLoc.zone !== 'monsterZone' || attLoc.card.position !== 'atk') return; // attaccante sparito o coperto
  if (state.attackNegatedForUids.includes(ev.attackerUid)) {
    state.attackNegatedForUids = state.attackNegatedForUids.filter((u) => u !== ev.attackerUid);
    return;
  }
  const attacker = attLoc.card;
  const ap = attacker.controller;
  const dp = other(ap);
  const waboku = state.players[dp].wabokuTurn === state.turn || state.players[ap].wabokuTurn === state.turn;
  const noDmg = (p: PlayerId) => state.players[p].noBattleDamageTurn === state.turn;
  const atkA = effectiveAtk(state, db, attacker);

  if (ev.targetUid === null) {
    if (monstersOf(state.players[dp]).length > 0 && !scriptFor(db[attacker.cardId])?.canAttackDirectly) return; // nel frattempo è apparso un mostro: attacco annullato
    if (!waboku && !noDmg(dp)) {
      dealDamage(state, dp, atkA);
      if (state.winner === null) fireTriggers(state, db, attacker, 'inflictsBattleDamage', ap, ev);
    }
    if (findCard(state, attacker.uid)?.zone === 'monsterZone') afterAttack(state, db, attacker);
    return;
  }
  const tLoc = findCard(state, ev.targetUid);
  if (!tLoc || tLoc.zone !== 'monsterZone') return;
  const target = tLoc.card;
  const wasFaceDown = target.position === 'facedown';
  if (wasFaceDown) {
    fireTriggers(state, db, target, 'attackedFaceDown', dp, ev);
    flipFaceUp(state, db, target.uid, ev);
    if (state.winner !== null) return;
  }
  const stillThere = findCard(state, target.uid);
  if (!stillThere || stillThere.zone !== 'monsterZone') return;
  const attStill = findCard(state, attacker.uid);
  if (!attStill || attStill.zone !== 'monsterZone') return;

  const tFlags = battleFlags(state, db, target);
  const aFlags = battleFlags(state, db, attacker);
  const destroyed: CardInstance[] = [];
  let damagedOpponent = false;

  if (target.position === 'atk') {
    const atkT = effectiveAtk(state, db, target);
    if (atkA > atkT) {
      if (!waboku && !noDmg(dp)) { dealDamage(state, dp, atkA - atkT); damagedOpponent = true; }
      if (!waboku && !tFlags.indestructible) destroyed.push(target);
    } else if (atkA < atkT) {
      if (!waboku && !noDmg(ap)) dealDamage(state, ap, atkT - atkA);
      if (!waboku && !aFlags.indestructible) destroyed.push(attacker);
    } else if (!waboku) {
      if (!tFlags.indestructible) destroyed.push(target);
      if (!aFlags.indestructible) destroyed.push(attacker);
    }
  } else {
    const defT = effectiveDef(state, db, target);
    if (atkA > defT) {
      if (!waboku && aFlags.piercing && !noDmg(dp)) { dealDamage(state, dp, atkA - defT); damagedOpponent = true; }
      if (!waboku && !tFlags.indestructible) destroyed.push(target);
    } else if (atkA < defT) {
      if (!waboku && !noDmg(ap)) dealDamage(state, ap, defT - atkA);
    }
  }
  if (damagedOpponent && state.winner === null && findCard(state, attacker.uid)?.zone === 'monsterZone') {
    fireTriggers(state, db, attacker, 'inflictsBattleDamage', ap, ev);
  }
  for (const d of destroyed) {
    const controller = d.controller;
    destroyCards(state, db, [d.uid]);
    fireTriggers(state, db, d, 'destroyedByBattle', controller, ev);
  }
  if (destroyed.includes(target) && !destroyed.includes(attacker) && findCard(state, attacker.uid)?.zone === 'monsterZone') {
    fireTriggers(state, db, attacker, 'destroysByBattle', ap, ev);
  }
  if (findCard(state, attacker.uid)?.zone === 'monsterZone') afterAttack(state, db, attacker);
}

/** Flag di battaglia di un mostro: propri + quelli delle carte equipaggiate. */
function battleFlags(state: GameState, db: CardDb, m: CardInstance): { indestructible: boolean; piercing: boolean } {
  const s = monsterEffectsNegated(state, db) ? undefined : scriptFor(db[m.cardId]);
  const flags = { indestructible: !!s?.cannotBeDestroyedByBattle, piercing: !!s?.piercing };
  for (const p of [0, 1] as PlayerId[]) {
    for (const st of spellTrapsOf(state.players[p])) {
      if (st.equippedTo !== m.uid || st.faceDown) continue;
      const e = scriptFor(db[st.cardId])?.equip;
      if (e?.cannotBeDestroyedByBattle) flags.indestructible = true;
      if (e?.piercing) flags.piercing = true;
    }
  }
  return flags;
}

function afterAttack(state: GameState, db: CardDb, attacker: CardInstance): void {
  fireTriggers(state, db, attacker, 'afterAttack', attacker.controller, null);
}

// ----------------------------------------------------------------- Scelte

function resolveChoice(state: GameState, db: CardDb, picks: number[]): void {
  const ch = state.pendingChoices.shift();
  if (!ch) return;
  const p = ch.player;
  const r = ch.resolve;
  switch (r.kind) {
    case 'discard':
    case 'endPhaseDiscard':
      for (const uid of picks) {
        const loc = findCard(state, uid);
        if (loc) log(state, `Giocatore ${p + 1} scarta ${cardName(db, loc.card)}.`, p);
        sendToGraveyard(state, db, uid, { fromField: false });
      }
      if (r.kind === 'endPhaseDiscard') startNextTurn(state, db);
      break;
    case 'destroy':
      destroyCards(state, db, picks);
      break;
    case 'addToHand':
      for (const uid of picks) makeContext(state, db, p, findCard(state, uid)!.card, [], null).addToHand(uid);
      if (r.shuffleDeck) shuffleInPlace(state, state.players[p].deck);
      break;
    case 'specialSummon':
      for (const uid of picks) specialSummon(state, db, uid, p, r.position);
      if (r.shuffleDeck) shuffleInPlace(state, state.players[p].deck);
      break;
    case 'returnToHand':
      for (const uid of picks) makeContext(state, db, p, findCard(state, uid)!.card, [], null).returnToHand(uid);
      break;
    case 'sendToGraveyard':
      for (const uid of picks) sendToGraveyard(state, db, uid, { fromField: false });
      if (r.shuffleDeck) shuffleInPlace(state, state.players[p].deck);
      break;
    case 'banish':
      for (const uid of picks) banishCard(state, db, uid);
      break;
    case 'toDeck':
      for (const uid of picks) makeContext(state, db, p, findCard(state, uid)!.card, [], null).toDeck(uid);
      break;
    case 'placeInSpellZone':
      for (const uid of picks) placeInSpellZone(state, db, uid, p);
      if (r.shuffleDeck) shuffleInPlace(state, state.players[p].deck);
      break;
    case 'trigger':
      resolveTriggerChoice(state, db, r.cardUid, r.index, picks, p);
      break;
  }
}

// ---------------------------------------------------------------- Setup

export interface DeckList {
  /** id delle carte del main deck. */
  main: number[];
  /** id delle carte dell'extra deck (fusioni e synchro). */
  extra: number[];
}

export function createGame(db: CardDb, decks: [DeckList, DeckList], opts: { seed?: number; firstPlayer?: PlayerId; lp?: number } = {}): GameState {
  const state: GameState = {
    players: [emptyPlayer(opts.lp ?? 8000), emptyPlayer(opts.lp ?? 8000)],
    turn: 1,
    turnPlayer: opts.firstPlayer ?? 0,
    phase: 'main1',
    priority: opts.firstPlayer ?? 0,
    pending: null,
    pendingChoices: [],
    attackNegatedForUids: [],
    winner: null,
    log: [],
    nextUid: 1,
    rngSeed: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
    firstPlayer: opts.firstPlayer ?? 0,
  };
  for (const p of [0, 1] as PlayerId[]) {
    const ps = state.players[p];
    for (const id of decks[p].main) {
      if (!db[id]) throw new Error(`Carta ${id} non presente nel database.`);
      ps.deck.push({ uid: state.nextUid++, cardId: id, owner: p, controller: p });
    }
    for (const id of decks[p].extra) {
      if (!db[id]) throw new Error(`Carta ${id} non presente nel database.`);
      if (!isExtraDeckMonster(db[id])) throw new Error(`${db[id].name} non può stare nell'Extra Deck.`);
      ps.extraDeck.push({ uid: state.nextUid++, cardId: id, owner: p, controller: p });
    }
    shuffleInPlace(state, ps.deck);
  }
  log(state, '— Inizio del duello —');
  for (const p of [0, 1] as PlayerId[]) drawCards(state, db, p, 5);
  log(state, `— Turno 1: giocatore ${state.turnPlayer + 1} —`, state.turnPlayer);
  return state;
}

function emptyPlayer(lp: number) {
  return {
    lp,
    hand: [],
    deck: [],
    extraDeck: [],
    graveyard: [],
    banished: [],
    monsterZone: [null, null, null, null, null],
    spellTrapZone: [null, null, null, null, null],
    fieldZone: null,
    normalSummonedThisTurn: false,
  };
}

