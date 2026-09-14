import type { Action, CardDb, CardInstance, GameState, PlayerId } from './types';
import {
  contactFusionMode, findCard, freeMonsterSlots, freeSpellTrapSlots, fusionMaterials, isEquipSpell, isExtraDeckMonster, isFieldSpell, isFusion,
  isMonster, isQuickPlay, isRitualMonster, isRitualSpell, isSpell, isSynchro, isTrap, isTuner, monstersOf, other, ritualSpellTarget,
  spellTrapsOf, synchroNonTunerRequirement, tributesNeeded,
} from './cards';
import { makeContext, trapsNegated, specialSummonsBlocked, monsterEffectsNegated } from './context';
import { scriptFor } from './effects/library';

// ---------------------------------------------------------------------------
// Generazione delle azioni legali. È l'unico punto in cui le regole "cosa si
// può fare adesso" sono codificate: UI e IA consumano questa lista.
// ---------------------------------------------------------------------------

const MAX_COMBOS = 40;

export function getLegalActions(state: GameState, db: CardDb): Action[] {
  if (state.winner !== null) return [];
  if (state.pendingChoices.length > 0) return choiceActions(state);
  if (state.pending) return responseActions(state, db);
  return turnActions(state, db);
}

/** Chi deve agire adesso. */
export function whoActs(state: GameState): PlayerId {
  if (state.pendingChoices.length > 0) return state.pendingChoices[0].player;
  if (state.pending) return state.pending.responder;
  return state.turnPlayer;
}

// ------------------------------------------------------------------ scelte

function choiceActions(state: GameState): Action[] {
  const ch = state.pendingChoices[0];
  const out: Action[] = [];
  const opts = ch.options;
  const max = Math.min(ch.max, opts.length);
  const min = Math.min(ch.min, opts.length);
  for (let size = min; size <= max; size++) {
    for (const combo of combinations(opts, size)) {
      out.push({ type: 'choose', picks: combo });
      if (out.length >= MAX_COMBOS) return out;
    }
  }
  return out;
}

export function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) yield [arr[i], ...rest];
  }
}

// --------------------------------------------------------- finestra risposta

function responseActions(state: GameState, db: CardDb): Action[] {
  const ev = state.pending!;
  const p = ev.responder;
  const ps = state.players[p];
  const out: Action[] = [{ type: 'pass' }];
  const negated = trapsNegated(state, db);
  // Effetti dalla mano in risposta (Kuriboh, Honest).
  for (const c of ps.hand) {
    const d = db[c.cardId];
    if (!isMonster(d)) continue;
    const act = scriptFor(d)?.activation;
    if (!act?.fromHand || act.timing === 'main' || !act.respondsTo?.includes(ev.kind)) continue;
    const ctx = makeContext(state, db, p, c, [], ev);
    if (act.canActivate && !act.canActivate(ctx)) continue;
    const combos = act.targets ? act.targets(ctx) : [[]];
    for (const targets of combos.slice(0, MAX_COMBOS)) out.push({ type: 'activateMonsterEffect', cardUid: c.uid, targets });
  }
  // Effetti dal cimitero in risposta (bandendo la carta).
  for (const c of ps.graveyard) {
    const act = scriptFor(db[c.cardId])?.activation;
    if (!act?.fromGraveyard || act.timing === 'main' || !act.respondsTo?.includes(ev.kind)) continue;
    const ctx = makeContext(state, db, p, c, [], ev);
    if (act.canActivate && !act.canActivate(ctx)) continue;
    const combos = act.targets ? act.targets(ctx) : [[]];
    for (const targets of combos.slice(0, MAX_COMBOS)) out.push({ type: 'activateMonsterEffect', cardUid: c.uid, targets });
  }
  for (const st of spellTrapsOf(ps)) {
    if (!st.faceDown) continue;
    if (st.placedTurn === state.turn) continue; // posata questo turno
    const data = db[st.cardId];
    const script = scriptFor(data);
    const act = script?.activation;
    if (!act || act.timing === 'main') continue;
    if (!act.respondsTo?.includes(ev.kind)) continue;
    if (isTrap(data) && negated) continue;
    if (!isTrap(data) && !isQuickPlay(data)) continue;
    const ctx = makeContext(state, db, p, st, [], ev);
    if (act.canActivate && !act.canActivate(ctx)) continue;
    const combos = act.targets ? act.targets(ctx) : [[]];
    for (const targets of combos.slice(0, MAX_COMBOS)) {
      out.push(isTrap(data) ? { type: 'activateTrap', cardUid: st.uid, targets } : { type: 'activateSpell', cardUid: st.uid, targets });
    }
  }
  return out;
}

// --------------------------------------------------------------- turno

function turnActions(state: GameState, db: CardDb): Action[] {
  const p = state.turnPlayer;
  const ps = state.players[p];
  const out: Action[] = [];
  const phase = state.phase;

  if (phase === 'main1' || phase === 'main2') {
    // Evocazione normale / posizionamento.
    if (!ps.normalSummonedThisTurn) {
      const fieldMonsters = monstersOf(ps).filter((m) => !scriptFor(db[m.cardId])?.cannotBeTributed);
      for (const c of ps.hand) {
        const d = db[c.cardId];
        if (!isMonster(d) || isExtraDeckMonster(d)) continue;
        if (isRitualMonster(d)) continue;
        if (scriptFor(d)?.cannotNormalSummon) continue;
        const n = tributesNeeded(d);
        if (n === 0) {
          if (freeMonsterSlots(ps) > 0) {
            out.push({ type: 'normalSummon', cardUid: c.uid, position: 'atk', tributeUids: [] });
            out.push({ type: 'normalSummon', cardUid: c.uid, position: 'facedown', tributeUids: [] });
          }
        } else if (fieldMonsters.length >= n) {
          for (const combo of combinations(fieldMonsters.map((m) => m.uid), n)) {
            out.push({ type: 'normalSummon', cardUid: c.uid, position: 'atk', tributeUids: combo });
            out.push({ type: 'normalSummon', cardUid: c.uid, position: 'facedown', tributeUids: combo });
          }
          if (scriptFor(d)?.tributeThreeOption && fieldMonsters.length >= 3) {
            for (const combo of combinations(fieldMonsters.map((m) => m.uid), 3)) out.push({ type: 'normalSummon', cardUid: c.uid, position: 'atk', tributeUids: combo });
          }
        }
      }
    }
    // Flip summon e cambio posizione.
    for (const m of monstersOf(ps)) {
      if (m.placedTurn === state.turn) continue;
      if (m.positionChangedTurn !== undefined && m.positionChangedTurn >= state.turn) continue;
      if (m.hasAttackedThisTurn) continue;
      if (m.position === 'facedown') out.push({ type: 'flipSummon', cardUid: m.uid });
      else if (m.position === 'def' && forcedDefense(state, db, m)) continue;
      else out.push({ type: 'changePosition', cardUid: m.uid });
    }
    // Magie e trappole dalla mano.
    for (const c of ps.hand) {
      const d = db[c.cardId];
      if (isSpell(d) || isTrap(d)) {
        if (isFieldSpell(d)) {
          pushSpellActivations(state, db, p, c, out); // le magie terreno si attivano direttamente
          continue;
        }
        if (freeSpellTrapSlots(ps) > 0) out.push({ type: 'setSpellTrap', cardUid: c.uid });
        if (isSpell(d) && freeSpellTrapSlots(ps) > 0) pushSpellActivations(state, db, p, c, out);
      } else if (isMonster(d)) {
        // Effetti attivabili dalla mano (scartando la carta).
        const act = scriptFor(d)?.activation;
        if (act?.fromHand) {
          const ctx = makeContext(state, db, p, c, [], null);
          if (!act.canActivate || act.canActivate(ctx)) {
            const combos = act.targets ? act.targets(ctx) : [[]];
            for (const targets of combos.slice(0, MAX_COMBOS)) out.push({ type: 'activateMonsterEffect', cardUid: c.uid, targets });
          }
        }
      }
    }
    // Magie/trappole posate.
    for (const st of spellTrapsOf(ps)) {
      if (!st.faceDown) continue;
      const d = db[st.cardId];
      if (isSpell(d)) {
        if (isQuickPlay(d) && st.placedTurn === state.turn) continue;
        pushSpellActivations(state, db, p, st, out);
      } else if (isTrap(d) && st.placedTurn !== state.turn && !trapsNegated(state, db)) {
        const act = scriptFor(d)?.activation;
        if (act && (act.timing === 'main' || act.timing === 'both')) {
          const ctx = makeContext(state, db, p, st, [], null);
          if (!act.canActivate || act.canActivate(ctx)) {
            const combos = act.targets ? act.targets(ctx) : [[]];
            for (const targets of combos.slice(0, MAX_COMBOS)) out.push({ type: 'activateTrap', cardUid: st.uid, targets });
          }
        }
      }
    }
    // Effetti attivabili dal cimitero (bandendo la carta).
    for (const c of ps.graveyard) {
      const act = scriptFor(db[c.cardId])?.activation;
      if (!act?.fromGraveyard) continue;
      const ctx = makeContext(state, db, p, c, [], null);
      if (act.canActivate && !act.canActivate(ctx)) continue;
      const combos = act.targets ? act.targets(ctx) : [[]];
      for (const targets of combos.slice(0, MAX_COMBOS)) out.push({ type: 'activateMonsterEffect', cardUid: c.uid, targets });
    }
    // Effetti a ignizione dei mostri (Forza Esiliata).
    const negated = monsterEffectsNegated(state, db);
    for (const m of monstersOf(ps)) {
      if (m.position === 'facedown' || negated) continue;
      const act = scriptFor(db[m.cardId])?.activation;
      if (!act || act.timing === 'response' || act.fromGraveyard) continue;
      if (act.oncePerTurn && m.effectUsedTurn === state.turn) continue;
      const ctx = makeContext(state, db, p, m, [], null);
      if (act.canActivate && !act.canActivate(ctx)) continue;
      const combos = act.targets ? act.targets(ctx) : [[]];
      for (const targets of combos.slice(0, MAX_COMBOS)) out.push({ type: 'activateMonsterEffect', cardUid: m.uid, targets });
    }
    // Evocazioni speciali dall'Extra Deck.
    if (!specialSummonsBlocked(state, db)) {
      pushFusionSummons(state, db, p, out);
      pushSynchroSummons(state, db, p, out);
      pushRitualSummons(state, db, p, out);
    }
    out.push({ type: 'nextPhase' });
  } else if (phase === 'battle') {
    const canAttack = !(state.turn === 1) && !swordsActive(state, db, p) && ps.noAttackTurn !== state.turn;
    if (canAttack) {
      const opp = state.players[other(p)];
      const oppMonsters = monstersOf(opp);
      for (const m of monstersOf(ps)) {
        if (m.position !== 'atk') continue;
        const script = scriptFor(db[m.cardId]);
        if ((m.attacksThisTurn ?? (m.hasAttackedThisTurn ? 1 : 0)) >= (script?.extraAttack ? 2 : 1)) continue;
        if (script?.cannotAttack) continue;
        if (script?.noAttackOnSpecialSummonTurn && m.summonedHow === 'special' && m.placedTurn === state.turn) continue;
        if (attackRestricted(state, db, p, m)) continue;
        if (oppMonsters.length === 0 || script?.canAttackDirectly) out.push({ type: 'attack', attackerUid: m.uid, targetUid: null });
        for (const t of oppMonsters) out.push({ type: 'attack', attackerUid: m.uid, targetUid: t.uid });
      }
    }
    out.push({ type: 'nextPhase' });
  } else {
    out.push({ type: 'nextPhase' });
  }
  return out;
}

/** Il mostro è tenuto in difesa da una carta continua (Limite di Livello - Area B). */
function forcedDefense(state: GameState, db: CardDb, m: CardInstance): boolean {
  for (const q of [0, 1] as PlayerId[]) {
    for (const st of spellTrapsOf(state.players[q])) {
      if (st.faceDown) continue;
      const fd = scriptFor(db[st.cardId])?.forceDefense;
      if (fd && fd(makeContext(state, db, q, st, [], null), m)) return true;
    }
  }
  return false;
}

/** Restrizioni continue d'attacco date da carte scoperte sul terreno (Vincolo di Gravità...). */
function attackRestricted(state: GameState, db: CardDb, p: PlayerId, m: CardInstance): boolean {
  for (const q of [0, 1] as PlayerId[]) {
    for (const st of spellTrapsOf(state.players[q])) {
      if (st.faceDown) continue;
      const script = scriptFor(db[st.cardId]);
      if (script?.attackRestriction && script.attackRestriction(makeContext(state, db, q, st, [], null), m)) return true;
    }
  }
  void p;
  return false;
}

/** Spade della Luce Rivelatrice attive contro il giocatore p. */
export function swordsActive(state: GameState, db: CardDb, p: PlayerId): boolean {
  return spellTrapsOf(state.players[other(p)]).some((st) => !st.faceDown && db[st.cardId].name === 'Swords of Revealing Light' && (st.expiresTurn ?? 0) >= state.turn);
}

function pushSpellActivations(state: GameState, db: CardDb, p: PlayerId, c: CardInstance, out: Action[]): void {
  const d = db[c.cardId];
  const act = scriptFor(d)?.activation;
  if (!act) return;
  if (act.timing === 'response') return;
  if (isEquipSpell(d) && freeSpellTrapSlots(state.players[p]) === 0 && !c.faceDown) return;
  const ctx = makeContext(state, db, p, c, [], null);
  if (act.canActivate && !act.canActivate(ctx)) return;
  const combos = act.targets ? act.targets(ctx) : [[]];
  for (const targets of combos.slice(0, MAX_COMBOS)) out.push({ type: 'activateSpell', cardUid: c.uid, targets });
}

// ------------------------------------------------------------- Fusione

function pushFusionSummons(state: GameState, db: CardDb, p: PlayerId, out: Action[]): void {
  const ps = state.players[p];
  if (freeMonsterSlots(ps) === 0 && monstersOf(ps).length === 0) return;
  const polys = [...ps.hand, ...spellTrapsOf(ps).filter((s) => s.faceDown)].filter((c) => db[c.cardId].name === 'Polymerization');
  // Fusioni a contatto (XYZ, Neos...): materiali sul terreno, senza Polymerization.
  for (const f of ps.extraDeck) {
    const fd = db[f.cardId];
    const mode = contactFusionMode(fd);
    if (!mode) continue;
    const mats = fusionMaterials(fd);
    if (!mats) continue;
    const fieldPool = monstersOf(ps).filter((m) => m.position !== 'facedown');
    for (const a of assignMaterials(mats, fieldPool, (c) => db[c.cardId].name).slice(0, 3)) {
      out.push({ type: 'fusionSummon', fusionUid: f.uid, materialUids: a, polymerizationUid: mode === 'banish' ? -1 : -2 });
    }
  }
  if (polys.length === 0) return;
  const poly = polys[0];
  const pool: CardInstance[] = [...ps.hand.filter((c) => c.uid !== poly.uid && isMonster(db[c.cardId])), ...monstersOf(ps)];
  for (const f of ps.extraDeck) {
    const fd = db[f.cardId];
    if (!isFusion(fd) || contactFusionMode(fd)) continue;
    const mats = fusionMaterials(fd);
    if (!mats) continue;
    const assignments = assignMaterials(mats, pool, (c) => db[c.cardId].name);
    for (const a of assignments.slice(0, 6)) {
      // Serve uno slot libero dopo aver rimosso i materiali dal terreno.
      const fieldUsed = a.filter((uid) => monstersOf(ps).some((m) => m.uid === uid)).length;
      if (freeMonsterSlots(ps) + fieldUsed === 0) continue;
      out.push({ type: 'fusionSummon', fusionUid: f.uid, materialUids: a, polymerizationUid: poly.uid });
    }
  }
}

/** Assegna i nomi richiesti alle carte disponibili (con duplicati). Ritorna le combinazioni di uid. */
function assignMaterials(names: string[], pool: CardInstance[], nameOf: (c: CardInstance) => string): number[][] {
  const results: number[][] = [];
  const used = new Set<number>();
  const rec = (i: number, acc: number[]) => {
    if (results.length >= 6) return;
    if (i === names.length) {
      results.push([...acc]);
      return;
    }
    const seen = new Set<string>();
    for (const c of pool) {
      if (used.has(c.uid) || nameOf(c) !== names[i]) continue;
      const key = `${nameOf(c)}:${c.position ?? 'hand'}`;
      if (seen.has(key)) continue; // evita permutazioni identiche
      seen.add(key);
      used.add(c.uid);
      acc.push(c.uid);
      rec(i + 1, acc);
      acc.pop();
      used.delete(c.uid);
    }
  };
  rec(0, []);
  return results;
}

// ------------------------------------------------------------- Synchro

function pushSynchroSummons(state: GameState, db: CardDb, p: PlayerId, out: Action[]): void {
  const ps = state.players[p];
  const field = monstersOf(ps).filter((m) => m.position !== 'facedown');
  const tuners = field.filter((m) => isTuner(db[m.cardId]));
  if (tuners.length === 0) return;
  const synchros = ps.extraDeck.filter((c) => isSynchro(db[c.cardId]));
  if (synchros.length === 0) return;
  const nonTuners = field.filter((m) => !isTuner(db[m.cardId]));
  for (const s of synchros) {
    const sd = db[s.cardId];
    const lvl = sd.level ?? 0;
    const req = synchroNonTunerRequirement(sd);
    const eligible = nonTuners.filter((m) => {
      const d = db[m.cardId];
      if (req?.race && d.race !== req.race) return false;
      if (req?.attribute && d.attribute !== req.attribute) return false;
      return true;
    });
    let count = 0;
    for (const t of tuners) {
      const tl = db[t.cardId].level ?? 0;
      for (let k = 1; k <= eligible.length; k++) {
        for (const combo of combinations(eligible, k)) {
          const sum = tl + combo.reduce((acc, m) => acc + (db[m.cardId].level ?? 0), 0);
          if (sum !== lvl) continue;
          out.push({ type: 'synchroSummon', synchroUid: s.uid, materialUids: [t.uid, ...combo.map((m) => m.uid)] });
          if (++count >= 6) break;
        }
        if (count >= 6) break;
      }
    }
  }
}

// ------------------------------------------------------------- Rituale

function pushRitualSummons(state: GameState, db: CardDb, p: PlayerId, out: Action[]): void {
  const ps = state.players[p];
  const spells = [...ps.hand, ...spellTrapsOf(ps).filter((s) => s.faceDown)].filter((c) => isRitualSpell(db[c.cardId]));
  if (spells.length === 0) return;
  const rituals = ps.hand.filter((c) => isRitualMonster(db[c.cardId]));
  if (rituals.length === 0) return;
  for (const sp of spells) {
    const targetName = ritualSpellTarget(db[sp.cardId]);
    for (const r of rituals) {
      const rd = db[r.cardId];
      if (targetName && rd.name !== targetName) continue;
      const lvl = rd.level ?? 0;
      const pool = [...ps.hand.filter((c) => c.uid !== r.uid && c.uid !== sp.uid && isMonster(db[c.cardId])), ...monstersOf(ps)];
      let count = 0;
      for (let k = 1; k <= Math.min(pool.length, 3); k++) {
        for (const combo of combinations(pool, k)) {
          const sum = combo.reduce((acc, m) => acc + (db[m.cardId].level ?? 0), 0);
          if (sum < lvl) continue;
          // Minimale: togliendo un qualsiasi tributo non si raggiunge più il livello.
          const minimal = combo.every((m) => sum - (db[m.cardId].level ?? 0) < lvl);
          if (!minimal) continue;
          const fieldUsed = combo.filter((m) => m.position !== undefined).length;
          if (freeMonsterSlots(ps) + fieldUsed === 0) continue;
          out.push({ type: 'ritualSummon', ritualSpellUid: sp.uid, ritualMonsterUid: r.uid, tributeUids: combo.map((m) => m.uid) });
          if (++count >= 6) break;
        }
        if (count >= 6) break;
      }
    }
  }
}

/** Utility per la UI: descrizione leggibile di un'azione. */
export function describeAction(state: GameState, db: CardDb, a: Action): string {
  const name = (uid: number) => {
    const loc = findCard(state, uid);
    return loc ? db[loc.card.cardId].name : '?';
  };
  switch (a.type) {
    case 'nextPhase': return 'Fase successiva';
    case 'normalSummon': return `${a.position === 'atk' ? 'Evoca' : 'Posiziona coperto'} ${name(a.cardUid)}${a.tributeUids.length ? ` (tributi: ${a.tributeUids.map(name).join(', ')})` : ''}`;
    case 'flipSummon': return `Evocazione flip di ${name(a.cardUid)}`;
    case 'changePosition': return `Cambia posizione a ${name(a.cardUid)}`;
    case 'setSpellTrap': return `Posiziona ${name(a.cardUid)}`;
    case 'activateSpell': return `Attiva ${name(a.cardUid)}${a.targets.length ? ` → ${a.targets.map(name).join(', ')}` : ''}`;
    case 'activateTrap': return `Attiva ${name(a.cardUid)}${a.targets.length ? ` → ${a.targets.map(name).join(', ')}` : ''}`;
    case 'activateMonsterEffect': return `Effetto di ${name(a.cardUid)}${a.targets.length ? ` → ${a.targets.map(name).join(', ')}` : ''}`;
    case 'fusionSummon': return `Evocazione Fusione: ${name(a.fusionUid)} (${a.materialUids.map(name).join(' + ')})`;
    case 'synchroSummon': return `Evocazione Synchro: ${name(a.synchroUid)} (${a.materialUids.map(name).join(' + ')})`;
    case 'ritualSummon': return `Evocazione Rituale: ${name(a.ritualMonsterUid)} (tributi: ${a.tributeUids.map(name).join(', ')})`;
    case 'attack': return `${name(a.attackerUid)} attacca ${a.targetUid === null ? 'direttamente' : name(a.targetUid)}`;
    case 'pass': return 'Non rispondere';
    case 'choose': return `Scegli: ${a.picks.map(name).join(', ') || 'nessuna'}`;
    case 'surrender': return 'Arrenditi';
  }
}

