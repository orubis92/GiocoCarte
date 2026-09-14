import type { CardDb, CardInstance, GameState, MonsterPosition, PendingChoice, PendingEvent, PlayerId } from './types';
import { findCard, isExtraDeckMonster, isMonster, isSpell, isToken, isTrap, monstersOf, nextRandom, other, shuffleInPlace, spellTrapsOf } from './cards';
import { effectiveAtk, effectiveDef } from './stats';
import type { EffectContext, TriggerKind } from './effects/types';
import { scriptFor } from './effects/library';

// ---------------------------------------------------------------------------
// Primitive di gioco: tutte le mutazioni dello stato passano di qui, sia dal
// reducer sia dagli script delle carte. Lo stato viene mutato in place: il
// reducer lavora sempre su una copia.
// ---------------------------------------------------------------------------

export function log(state: GameState, text: string, player?: PlayerId): void {
  state.log.push({ turn: state.turn, player, text });
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
}

export function cardName(db: CardDb, card: CardInstance): string {
  return db[card.cardId]?.name ?? `#${card.cardId}`;
}

/** Rimuove la carta da qualsiasi zona si trovi e la restituisce. Gestisce equipaggiamenti collegati. */
export function removeFromZone(state: GameState, db: CardDb, uid: number): CardInstance | null {
  const loc = findCard(state, uid);
  if (!loc) return null;
  const ps = state.players[loc.player];
  const card = loc.card;
  switch (loc.zone) {
    case 'hand': ps.hand.splice(loc.index, 1); break;
    case 'deck': ps.deck.splice(loc.index, 1); break;
    case 'extraDeck': ps.extraDeck.splice(loc.index, 1); break;
    case 'graveyard': ps.graveyard.splice(loc.index, 1); break;
    case 'banished': ps.banished.splice(loc.index, 1); break;
    case 'monsterZone':
      ps.monsterZone[loc.index] = null;
      onMonsterLeavesField(state, db, card);
      break;
    case 'spellTrapZone':
      ps.spellTrapZone[loc.index] = null;
      onSpellTrapLeavesField(state, db, card);
      break;
    case 'fieldZone': ps.fieldZone = null; break;
  }
  // Ripulisce lo stato "da terreno".
  delete card.position;
  delete card.faceDown;
  delete card.placedTurn;
  delete card.positionChangedTurn;
  delete card.hasAttackedThisTurn;
  delete card.equippedTo;
  delete card.atkMod;
  delete card.defMod;
  delete card.flipped;
  delete card.controlUntilEndOfTurn;
  delete card.expiresTurn;
  delete card.counters;
  card.controller = card.owner;
  return card;
}

function onMonsterLeavesField(state: GameState, db: CardDb, monster: CardInstance): void {
  // Le carte equipaggiate (e Richiamo del Posseduto) vanno al cimitero.
  for (const p of [0, 1] as PlayerId[]) {
    for (const st of spellTrapsOf(state.players[p])) {
      if (st.equippedTo === monster.uid) {
        removeFromZone(state, db, st.uid);
        state.players[st.owner].graveyard.push(st);
      }
    }
  }
  if (state.pending?.kind === 'attack' && state.pending.targetUid === monster.uid) {
    // Il bersaglio dell'attacco è sparito: l'attacco prosegue come "replay" semplificato → annullato.
    state.attackNegatedForUids.push(state.pending.attackerUid);
  }
}

function onSpellTrapLeavesField(state: GameState, db: CardDb, st: CardInstance): void {
  if (st.equippedTo === undefined) return;
  const target = findCard(state, st.equippedTo);
  if (!target || target.zone !== 'monsterZone') return;
  const script = scriptFor(db[st.cardId]);
  if (script?.equip) {
    target.card.atkMod = (target.card.atkMod ?? 0) - (script.equip.atk ?? 0);
    target.card.defMod = (target.card.defMod ?? 0) - (script.equip.def ?? 0);
  } else if (isTrap(db[st.cardId]) || script?.linkedMonster) {
    // Richiamo del Posseduto / Sepoltura Prematura: se la carta lascia il terreno, il mostro viene distrutto.
    destroyCards(state, db, [target.card.uid]);
  }
}

export function sendToGraveyard(state: GameState, db: CardDb, uid: number, opts: { fromField?: boolean } = {}): void {
  const loc = findCard(state, uid);
  if (!loc) return;
  const wasOnField = loc.zone === 'monsterZone' || loc.zone === 'spellTrapZone' || loc.zone === 'fieldZone';
  const controller = loc.card.controller;
  const data = db[loc.card.cardId];
  if (wasOnField && loc.zone === 'monsterZone' && loc.card.position !== 'facedown' && scriptFor(data)?.banishInsteadOfGY && !monsterEffectsNegated(state, db)) {
    banishCard(state, db, uid);
    return;
  }
  const card = removeFromZone(state, db, uid);
  if (!card) return;
  if (isToken(data)) {
    log(state, `${data.name} scompare.`);
    if (data.id === -1002) dealDamage(state, controller, 300); // Segnalino Ojama
    return;
  }
  state.players[card.owner].graveyard.push(card);
  if (wasOnField && (opts.fromField ?? true)) {
    // Effetti "quando viene mandato al cimitero" (Sangan, Strega). Valgono anche se coperto.
    fireTriggers(state, db, card, 'toGrave', controller, null);
  } else if (loc.zone === 'hand') {
    fireTriggers(state, db, card, 'discarded', card.owner, null);
  }
}

export function destroyCards(state: GameState, db: CardDb, targetUids: number[]): void {
  for (const uid of targetUids) {
    const loc = findCard(state, uid);
    if (!loc) continue;
    log(state, `${cardName(db, loc.card)} viene distrutta.`);
    // Bestie Cristallo: dalla Zona Mostri passano alla Zona Magie/Trappole invece del cimitero.
    if (loc.zone === 'monsterZone' && loc.card.position !== 'facedown' && scriptFor(db[loc.card.cardId])?.toSpellZoneWhenDestroyed && !monsterEffectsNegated(state, db)) {
      if (placeInSpellZone(state, db, uid, loc.card.controller)) continue;
    }
    sendToGraveyard(state, db, uid);
  }
}

/** Mette una carta scoperta nella Zona Magie/Trappole come magia continua (Bestie Cristallo). */
export function placeInSpellZone(state: GameState, db: CardDb, uid: number, p: PlayerId): boolean {
  const slot = firstFreeSlot(state.players[p].spellTrapZone);
  if (slot < 0) return false;
  const card = removeFromZone(state, db, uid);
  if (!card) return false;
  card.controller = p;
  card.faceDown = false;
  card.placedTurn = state.turn;
  state.players[p].spellTrapZone[slot] = card;
  log(state, `${cardName(db, card)} viene messa nella Zona Magie/Trappole come magia continua.`, p);
  return true;
}

export function banishCard(state: GameState, db: CardDb, uid: number): void {
  const card = removeFromZone(state, db, uid);
  if (!card) return;
  state.players[card.owner].banished.push(card);
  log(state, `${cardName(db, card)} viene bandita.`);
}

export function drawCards(state: GameState, db: CardDb, p: PlayerId, n: number): void {
  const ps = state.players[p];
  for (let i = 0; i < n; i++) {
    const c = ps.deck.shift();
    if (!c) {
      state.winner = other(p);
      state.winReason = `Il giocatore ${p + 1} non può pescare: deck esaurito.`;
      log(state, state.winReason);
      return;
    }
    ps.hand.push(c);
  }
  if (n > 0) log(state, `Giocatore ${p + 1} pesca ${n} carta${n > 1 ? 'e' : ''}.`, p);
  void db;
}

export function dealDamage(state: GameState, p: PlayerId, n: number): void {
  if (n <= 0) return;
  state.players[p].lp = Math.max(0, state.players[p].lp - n);
  log(state, `Giocatore ${p + 1} subisce ${n} danni (LP: ${state.players[p].lp}).`, p);
  if (state.players[p].lp <= 0 && state.winner === null) {
    state.winner = other(p);
    state.winReason = `I Life Points del giocatore ${p + 1} sono arrivati a 0.`;
  }
}

export function firstFreeSlot(arr: (CardInstance | null)[]): number {
  return arr.findIndex((c) => c === null);
}

/** Mette un mostro sul terreno del controllore indicato. Ritorna false se non c'è spazio. */
export function placeMonster(state: GameState, db: CardDb, uid: number, controller: PlayerId, position: MonsterPosition, how: 'normal' | 'flip' | 'special' | 'none'): boolean {
  const ps = state.players[controller];
  const slot = firstFreeSlot(ps.monsterZone);
  if (slot < 0) return false;
  const card = removeFromZone(state, db, uid);
  if (!card) return false;
  card.controller = controller;
  card.position = position;
  card.placedTurn = state.turn;
  card.hasAttackedThisTurn = false;
  card.attacksThisTurn = 0;
  card.summonedHow = how === 'none' ? 'set' : how;
  if (how === 'special' || how === 'normal') card.properlySummoned = true;
  ps.monsterZone[slot] = card;
  return true;
}

/** Vero se una carta scoperta sul terreno blocca le evocazioni speciali. */
export function specialSummonsBlocked(state: GameState, db: CardDb): boolean {
  for (const p of [0, 1] as PlayerId[]) {
    for (const m of monstersOf(state.players[p])) if (m.position !== 'facedown' && scriptFor(db[m.cardId])?.blocksSpecialSummons) return true;
    for (const s of spellTrapsOf(state.players[p])) if (!s.faceDown && scriptFor(db[s.cardId])?.blocksSpecialSummons) return true;
  }
  return false;
}

export function specialSummon(state: GameState, db: CardDb, uid: number, controller: PlayerId, position: MonsterPosition): boolean {
  const loc = findCard(state, uid);
  if (!loc) return false;
  const data = db[loc.card.cardId];
  if (!isMonster(data)) return false;
  if (loc.zone === 'monsterZone') return false;
  if (specialSummonsBlocked(state, db)) return false;
  if (!placeMonster(state, db, uid, controller, position, 'special')) return false;
  log(state, `${data.name} viene evocato specialmente (${position === 'atk' ? 'attacco' : 'difesa'}).`, controller);
  const card = findCard(state, uid)!.card;
  fireTriggers(state, db, card, 'specialSummon', controller, null);
  fireTriggers(state, db, card, 'summon', controller, null);
  // Finestra di risposta all'evocazione (Buco Trappola Senza Fondo, Tributo Torrenziale...).
  if (!state.pending) state.pending = { kind: 'summon', cardUid: uid, how: 'special', responder: other(controller) };
  return true;
}

export function flipFaceUp(state: GameState, db: CardDb, uid: number, event: PendingEvent | null): void {
  const loc = findCard(state, uid);
  if (!loc || loc.zone !== 'monsterZone' || loc.card.position !== 'facedown') return;
  loc.card.position = 'def';
  log(state, `${cardName(db, loc.card)} viene scoperto.`);
  if (!loc.card.flipped) {
    loc.card.flipped = true;
    fireTriggers(state, db, loc.card, 'flip', loc.card.controller, event);
  }
}

export function takeControl(state: GameState, db: CardDb, uid: number, p: PlayerId, untilEndOfTurn: boolean): boolean {
  const loc = findCard(state, uid);
  if (!loc || loc.zone !== 'monsterZone' || loc.card.controller === p) return false;
  const ps = state.players[p];
  const slot = firstFreeSlot(ps.monsterZone);
  if (slot < 0) return false;
  const card = loc.card;
  state.players[loc.player].monsterZone[loc.index] = null;
  card.controller = p;
  card.controlUntilEndOfTurn = untilEndOfTurn;
  card.hasAttackedThisTurn = false;
  ps.monsterZone[slot] = card;
  log(state, `Giocatore ${p + 1} prende il controllo di ${cardName(db, card)}.`, p);
  return true;
}

// ---------------------------------------------------------------------------
// Trigger e contesto per gli script.
// ---------------------------------------------------------------------------

export function makeContext(state: GameState, db: CardDb, player: PlayerId, card: CardInstance, targets: number[], event: PendingEvent | null): EffectContext {
  const ctx: EffectContext = {
    state,
    db,
    player,
    opponent: other(player),
    card,
    targets,
    event,
    data: (uid) => {
      const loc = findCard(state, uid);
      return db[loc ? loc.card.cardId : -1];
    },
    get: (uid) => findCard(state, uid)?.card ?? null,
    myMonsters: () => monstersOf(state.players[player]),
    oppMonsters: () => monstersOf(state.players[other(player)]),
    mySpellTraps: () => spellTrapsOf(state.players[player]),
    oppSpellTraps: () => spellTrapsOf(state.players[other(player)]),
    atk: (c) => effectiveAtk(state, db, c),
    def: (c) => effectiveDef(state, db, c),
    hasFreeMonsterSlot: (p) => firstFreeSlot(state.players[p].monsterZone) >= 0,
    draw: (p, n) => drawCards(state, db, p, n),
    destroy: (targetUids) => destroyCards(state, db, targetUids),
    banish: (uid) => banishCard(state, db, uid),
    toGraveyard: (uid) => sendToGraveyard(state, db, uid),
    discard: (uid) => {
      const loc = findCard(state, uid);
      if (loc) log(state, `Giocatore ${loc.player + 1} scarta ${cardName(db, loc.card)}.`, loc.player);
      sendToGraveyard(state, db, uid, { fromField: false });
    },
    addToHand: (uid) => {
      const c = removeFromZone(state, db, uid);
      if (c) {
        state.players[c.owner].hand.push(c);
        log(state, `${cardName(db, c)} viene aggiunta alla mano.`, c.owner);
      }
    },
    returnToHand: (uid) => {
      const loc = findCard(state, uid);
      if (!loc) return;
      const d = db[loc.card.cardId];
      const c = removeFromZone(state, db, uid);
      if (!c) return;
      if (isExtraDeckMonster(d)) state.players[c.owner].extraDeck.push(c);
      else state.players[c.owner].hand.push(c);
      log(state, `${d.name} torna ${isExtraDeckMonster(d) ? "nell'Extra Deck" : 'in mano'}.`);
    },
    specialSummon: (uid, p, position) => specialSummon(state, db, uid, p, position),
    damage: (p, n) => dealDamage(state, p, n),
    gainLp: (p, n) => {
      state.players[p].lp += n;
      log(state, `Giocatore ${p + 1} guadagna ${n} LP.`, p);
    },
    takeControl: (uid, p, untilEnd) => takeControl(state, db, uid, p, untilEnd),
    flipFaceDown: (uid) => {
      const loc = findCard(state, uid);
      if (!loc || loc.zone !== 'monsterZone') return;
      loc.card.position = 'facedown';
      loc.card.flipped = false;
      loc.card.positionChangedTurn = state.turn;
      // Gli equipaggiamenti cadono.
      onMonsterLeavesFieldForEquips(state, db, loc.card.uid);
      if (state.pending?.kind === 'attack' && state.pending.attackerUid === uid) state.attackNegatedForUids.push(uid);
      log(state, `${cardName(db, loc.card)} viene messo coperto in difesa.`);
    },
    flipFaceUp: (uid) => flipFaceUp(state, db, uid, event),
    negateAttack: () => {
      if (state.pending?.kind === 'attack') {
        state.attackNegatedForUids.push(state.pending.attackerUid);
        log(state, "L'attacco viene negato.");
      }
    },
    endBattlePhase: () => {
      if (state.phase === 'battle') state.phase = 'main2';
    },
    shuffleDeck: (p) => shuffleInPlace(state, state.players[p].deck),
    mill: (p, n) => {
      for (let i = 0; i < n; i++) {
        const c = state.players[p].deck.shift();
        if (!c) break;
        state.players[p].graveyard.push(c);
      }
      log(state, `Giocatore ${p + 1} manda ${n} carte dalla cima del deck al cimitero.`, p);
    },
    changeToDefense: (uid) => {
      const loc = findCard(state, uid);
      if (loc?.zone === 'monsterZone' && loc.card.position === 'atk') {
        loc.card.position = 'def';
        loc.card.positionChangedTurn = state.turn;
      }
    },
    toDeck: (uid) => {
      const c = removeFromZone(state, db, uid);
      if (!c) return;
      const d = db[c.cardId];
      if (isExtraDeckMonster(d)) state.players[c.owner].extraDeck.push(c);
      else {
        state.players[c.owner].deck.push(c);
        shuffleInPlace(state, state.players[c.owner].deck);
      }
      log(state, `${cardName(db, c)} torna nel deck.`);
    },
    tempBoost: (uid, atk, def = 0) => {
      const loc = findCard(state, uid);
      if (!loc || loc.zone !== 'monsterZone') return;
      loc.card.tempAtkMod = (loc.card.tempAtkMod ?? 0) + atk;
      loc.card.tempDefMod = (loc.card.tempDefMod ?? 0) + def;
      if (atk) log(state, `${cardName(db, loc.card)} ${atk > 0 ? 'guadagna' : 'perde'} ${Math.abs(atk)} ATK fino alla End Phase.`);
    },
    summonToken: (p, tokenId, position) => {
      if (!db[tokenId]) return false;
      const slot = firstFreeSlot(state.players[p].monsterZone);
      if (slot < 0) return false;
      const token: CardInstance = { uid: state.nextUid++, cardId: tokenId, owner: p, controller: p, position, placedTurn: state.turn, hasAttackedThisTurn: false, attacksThisTurn: 0, summonedHow: 'special', properlySummoned: true };
      state.players[p].monsterZone[slot] = token;
      log(state, `${db[tokenId].name} evocato per il giocatore ${p + 1}.`, p);
      return true;
    },
    random: () => nextRandom(state),
    placeInSpellZone: (uid, p) => placeInSpellZone(state, db, uid, p),
    spellZoneCards: (p) => spellTrapsOf(state.players[p]),
    toTopOfDeck: (uid) => {
      const c = removeFromZone(state, db, uid);
      if (!c) return;
      state.players[c.owner].deck.unshift(c);
      log(state, `${cardName(db, c)} torna in cima al deck.`);
    },
    payLp: (p, n) => {
      state.players[p].lp = Math.max(0, state.players[p].lp - n);
      log(state, `Giocatore ${p + 1} paga ${n} LP.`, p);
    },
    ask: (choice) => {
      const full: PendingChoice = { ...choice, player: choice.player ?? player };
      if (full.options.length === 0) return;
      state.pendingChoices.push(full);
    },
    log: (text) => log(state, text, player),
  };
  return ctx;
}

function onMonsterLeavesFieldForEquips(state: GameState, db: CardDb, uid: number): void {
  for (const p of [0, 1] as PlayerId[]) {
    for (const st of spellTrapsOf(state.players[p])) {
      if (st.equippedTo === uid && isSpell(db[st.cardId])) {
        removeFromZone(state, db, st.uid);
        state.players[st.owner].graveyard.push(st);
      }
    }
  }
}

/**
 * Attiva gli effetti trigger di una carta per un dato evento. Se il trigger
 * richiede una scelta di bersaglio, viene accodata una PendingChoice.
 */
export function fireTriggers(state: GameState, db: CardDb, card: CardInstance, on: TriggerKind, controller: PlayerId, event: PendingEvent | null): void {
  const script = scriptFor(db[card.cardId]);
  if (!script?.triggers) return;
  // Prosciuga Abilità: niente effetti per i mostri scoperti sul terreno (quelli dal cimitero/mano restano).
  const loc = findCard(state, card.uid);
  if (loc?.zone === 'monsterZone' && card.position !== 'facedown' && on !== 'flip' && monsterEffectsNegated(state, db)) return;
  script.triggers.forEach((trigger, index) => {
    if (trigger.on !== on) return;
    const ctx = makeContext(state, db, controller, card, [], event);
    if (trigger.targets) {
      const combos = trigger.targets(ctx);
      if (combos.length === 0) return;
      const singles = combos.filter((c) => c.length === 1).map((c) => c[0]);
      if (singles.length === 1) {
        log(state, `Effetto di ${cardName(db, card)}.`, controller);
        trigger.resolve(makeContext(state, db, controller, card, singles, event));
      } else {
        state.pendingChoices.push({
          player: controller,
          prompt: `${cardName(db, card)}: scegli il bersaglio`,
          options: singles,
          min: 1,
          max: 1,
          resolve: { kind: 'trigger', cardUid: card.uid, index },
        });
      }
    } else {
      log(state, `Effetto di ${cardName(db, card)}.`, controller);
      trigger.resolve(ctx);
    }
  });
}

/** Risolve un trigger dopo che il giocatore ha scelto il bersaglio. */
export function resolveTriggerChoice(state: GameState, db: CardDb, cardUid: number, index: number, picks: number[], player: PlayerId): void {
  const loc = findCard(state, cardUid);
  if (!loc) return;
  const script = scriptFor(db[loc.card.cardId]);
  const trigger = script?.triggers?.[index];
  if (!trigger) return;
  log(state, `Effetto di ${cardName(db, loc.card)}.`, player);
  trigger.resolve(makeContext(state, db, player, loc.card, picks, state.pending));
}

/** Vero se una carta scoperta nega gli effetti dei mostri sul terreno (Prosciuga Abilità). */
export function monsterEffectsNegated(state: GameState, db: CardDb): boolean {
  for (const p of [0, 1] as PlayerId[]) {
    for (const s of spellTrapsOf(state.players[p])) if (!s.faceDown && scriptFor(db[s.cardId])?.negatesMonsterEffects) return true;
  }
  return false;
}

/** Vero se sul terreno c'è un mostro scoperto che nega le trappole (Jinzo). */
export function trapsNegated(state: GameState, db: CardDb): boolean {
  for (const p of [0, 1] as PlayerId[]) {
    for (const m of monstersOf(state.players[p])) {
      if (m.position !== 'facedown' && scriptFor(db[m.cardId])?.negatesTraps && !monsterEffectsNegated(state, db)) return true;
    }
  }
  return false;
}
