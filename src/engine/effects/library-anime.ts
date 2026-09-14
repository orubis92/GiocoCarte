import type { CardScript, EffectContext, Trigger } from './types';
import type { CardInstance, PlayerId } from '../types';
import { fusionMaterials, isFusion, isMonster, isSpell } from '../cards';
import { single, faceUp, uids, allMonstersOnField, allSpellTrapsOnField, attackerOf } from './helpers';

// ---------------------------------------------------------------------------
// Archetipi dei personaggi dell'anime (Duel Monsters e GX) scritti a mano:
// Bestie Cristallo, Toon, Vehicroid, Volcanic, Ojama, Draghi Armati LV, XYZ,
// dadi di Joey e Duke, Arpie, Relinquished, Exodia e compagnia.
// ---------------------------------------------------------------------------

const myGY = (ctx: EffectContext) => ctx.state.players[ctx.player].graveyard;
const myHand = (ctx: EffectContext) => ctx.state.players[ctx.player].hand.filter((c) => c.uid !== ctx.card.uid);
const myDeck = (ctx: EffectContext) => ctx.state.players[ctx.player].deck;
const nameOf = (ctx: EffectContext, c: CardInstance) => ctx.data(c.uid).name;
const isCB = (ctx: EffectContext, c: CardInstance) => nameOf(ctx, c).startsWith('Crystal Beast');
/** Bestie Cristallo nella Zona Magie/Trappole del giocatore. */
const cbInSpellZone = (ctx: EffectContext) => ctx.spellZoneCards(ctx.player).filter((c) => isCB(ctx, c));
const roll = (ctx: EffectContext) => 1 + Math.floor(ctx.random() * 6);
const coin = (ctx: EffectContext) => ctx.random() < 0.5;
const noAttacksThisTurn = (ctx: EffectContext) => { ctx.state.players[ctx.player].noAttackTurn = ctx.state.turn; };

/** Bestia Cristallo: se distrutta in una Zona Mostri va nella Zona Magie/Trappole. */
function crystalBeast(extra: Partial<CardScript> = {}): CardScript {
  return { toSpellZoneWhenDestroyed: true, ...extra };
}

/** Mostro Toon: evocazione speciale dalla mano con tributi mentre controlli Mondo Toon; attacca direttamente. */
function toon(tributes: number, extra: Partial<CardScript> = {}): CardScript {
  return {
    cannotNormalSummon: true,
    cannotSpecialSummonFromGY: true,
    canAttackDirectly: true,
    noAttackOnSpecialSummonTurn: true,
    approx: 'Attacca sempre direttamente (senza il vincolo dei Toon avversari) e senza pagare 500 LP.',
    activation: {
      timing: 'main',
      fromHand: true,
      selfSummon: true,
      canActivate: (ctx) => {
        const loc = ctx.get(ctx.card.uid);
        if (!loc || loc.position !== undefined) return false;
        if (!ctx.mySpellTraps().some((s) => !s.faceDown && nameOf(ctx, s) === 'Toon World')) return false;
        return tributes === 0 ? ctx.hasFreeMonsterSlot(ctx.player) : ctx.myMonsters().length >= tributes;
      },
      targets: (ctx) => {
        if (tributes === 0) return [[]];
        const mons = ctx.myMonsters();
        if (tributes === 1) return single(uids(mons));
        const out: number[][] = [];
        for (let i = 0; i < mons.length; i++) for (let j = i + 1; j < mons.length; j++) out.push([mons[i].uid, mons[j].uid]);
        return out;
      },
      resolve: (ctx) => {
        for (const t of ctx.targets) ctx.toGraveyard(t);
        ctx.specialSummon(ctx.card.uid, ctx.player, 'atk');
      },
    },
    ...extra,
  };
}

/** Toon di seconda generazione: evocabili normalmente, attaccano direttamente con Mondo Toon. */
function toonLite(extra: Partial<CardScript> = {}): CardScript {
  return {
    canAttackDirectly: true,
    noAttackOnSpecialSummonTurn: true,
    approx: 'Attacca direttamente anche senza Mondo Toon e nel turno in cui è evocato normalmente.',
    ...extra,
  };
}

/** Evocazione speciale del prossimo LV dalla mano o dal deck (Drago Armato). */
function levelUpTrigger(on: Trigger['on'], nextName: string): Trigger {
  return {
    on,
    resolve: (ctx) => {
      const next = [...myHand(ctx), ...myDeck(ctx)].find((c) => nameOf(ctx, c) === nextName);
      if (!next || !ctx.get(ctx.card.uid)) return;
      const fromDeck = myDeck(ctx).includes(next);
      ctx.toGraveyard(ctx.card.uid);
      ctx.specialSummon(next.uid, ctx.player, 'atk');
      if (fromDeck) ctx.shuffleDeck(ctx.player);
    },
  };
}

function fusionCombosPool(ctx: EffectContext, pool: CardInstance[], restrict: (d: import('../types').CardData) => boolean): number[][] {
  const out: number[][] = [];
  for (const f of ctx.state.players[ctx.player].extraDeck) {
    const fd = ctx.data(f.uid);
    if (!isFusion(fd) || !restrict(fd)) continue;
    const mats = fusionMaterials(fd);
    if (!mats) continue;
    const used = new Set<number>();
    const acc: number[] = [];
    const rec = (i: number): boolean => {
      if (i === mats.length) return true;
      for (const c of pool) {
        if (used.has(c.uid) || nameOf(ctx, c) !== mats[i]) continue;
        used.add(c.uid); acc.push(c.uid);
        if (rec(i + 1)) return true;
        acc.pop(); used.delete(c.uid);
      }
      return false;
    };
    if (rec(0)) out.push([f.uid, ...acc]);
  }
  return out;
}

export const ANIME_LIBRARY: Record<string, CardScript> = {
  // ================================================================ Bestie Cristallo (Jesse)
  'Crystal Beast Ruby Carbuncle': crystalBeast({
    triggers: [
      {
        on: 'specialSummon',
        resolve: (ctx) => {
          for (const c of cbInSpellZone(ctx)) if (ctx.hasFreeMonsterSlot(ctx.player)) ctx.specialSummon(c.uid, ctx.player, 'atk');
        },
      },
    ],
  }),
  'Crystal Beast Sapphire Pegasus': crystalBeast({
    triggers: [
      {
        on: 'summon',
        resolve: (ctx) => {
          const opts = [...myHand(ctx), ...myDeck(ctx), ...myGY(ctx)].filter((c) => isCB(ctx, c)).map((c) => c.uid);
          if (opts.length && ctx.spellZoneCards(ctx.player).length < 5) ctx.ask({ prompt: 'Pegaso Zaffiro: metti una Bestia Cristallo nella Zona Magie/Trappole', options: opts, min: 0, max: 1, resolve: { kind: 'placeInSpellZone', shuffleDeck: true } });
        },
      },
    ],
  }),
  'Crystal Beast Topaz Tiger': crystalBeast({ approx: 'Il bonus di 400 ATK in attacco non è applicato.' }),
  'Crystal Beast Amethyst Cat': crystalBeast({ canAttackDirectly: true, approx: 'Il danno da attacco diretto non viene dimezzato.' }),
  'Crystal Beast Emerald Tortoise': crystalBeast({
    activation: {
      timing: 'main',
      oncePerTurn: true,
      targets: (ctx) => single(uids(ctx.myMonsters().filter((m) => m.position === 'atk' && (m.attacksThisTurn ?? 0) > 0))),
      resolve: (ctx) => ctx.changeToDefense(ctx.targets[0]),
    },
  }),
  'Crystal Beast Cobalt Eagle': crystalBeast({
    activation: {
      timing: 'main',
      oncePerTurn: true,
      targets: (ctx) => single(uids([...ctx.myMonsters().filter(faceUp), ...cbInSpellZone(ctx)].filter((c) => isCB(ctx, c)))),
      resolve: (ctx) => ctx.toTopOfDeck(ctx.targets[0]),
    },
  }),
  'Crystal Beast Amber Mammoth': crystalBeast({ approx: 'Non redirige gli attacchi verso di sé.' }),
  'Rainbow Dragon': {
    cannotNormalSummon: true,
    cannotSpecialSummonFromGY: true,
    activation: {
      timing: 'main',
      fromHand: true,
      selfSummon: true,
      canActivate: (ctx) => {
        const loc = ctx.get(ctx.card.uid);
        if (!loc || loc.position !== undefined) return false;
        const names = new Set([...ctx.myMonsters(), ...cbInSpellZone(ctx), ...myGY(ctx)].filter((c) => isCB(ctx, c)).map((c) => nameOf(ctx, c)));
        return names.size >= 7 && ctx.hasFreeMonsterSlot(ctx.player);
      },
      resolve: (ctx) => { ctx.specialSummon(ctx.card.uid, ctx.player, 'atk'); },
    },
    approx: "L'effetto \"manda le Bestie Cristallo al cimitero: +1000 ATK\" non è attivabile.",
  },
  'Crystal Beacon': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => cbInSpellZone(ctx).length >= 2 && ctx.hasFreeMonsterSlot(ctx.player) && myDeck(ctx).some((c) => isCB(ctx, c)),
      resolve: (ctx) => {
        const opts = myDeck(ctx).filter((c) => isCB(ctx, c)).map((c) => c.uid);
        ctx.ask({ prompt: 'Faro di Cristallo: evoca una Bestia Cristallo dal deck', options: opts, min: 1, max: 1, resolve: { kind: 'specialSummon', position: 'atk', shuffleDeck: true } });
      },
    },
  },
  'Crystal Blessing': {
    activation: {
      timing: 'main',
      targets: (ctx) => {
        const cbs = myGY(ctx).filter((c) => isCB(ctx, c));
        const out: number[][] = [];
        for (let i = 0; i < cbs.length; i++) { out.push([cbs[i].uid]); for (let j = i + 1; j < cbs.length; j++) out.push([cbs[i].uid, cbs[j].uid]); }
        return out.slice(0, 12);
      },
      resolve: (ctx) => { for (const t of ctx.targets) ctx.placeInSpellZone(t, ctx.player); },
    },
  },
  'Crystal Promise': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => ctx.hasFreeMonsterSlot(ctx.player),
      targets: (ctx) => single(uids(cbInSpellZone(ctx))),
      resolve: (ctx) => { ctx.specialSummon(ctx.targets[0], ctx.player, 'atk'); },
    },
  },
  'Crystal Release': {
    equip: { atk: 800, onlyIf: (d) => d.name.startsWith('Crystal Beast') },
    activation: {
      timing: 'main',
      staysOnField: true,
      targets: (ctx) => single(uids(ctx.myMonsters().filter((c) => faceUp(c) && isCB(ctx, c)))),
      resolve: (ctx) => {
        const t = ctx.get(ctx.targets[0]);
        if (!t) return;
        ctx.card.equippedTo = t.uid;
        t.atkMod = (t.atkMod ?? 0) + 800;
      },
    },
    approx: 'Quando lascia il terreno non mette una Bestia Cristallo nella Zona Magie/Trappole.',
  },
  'Rare Value': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => cbInSpellZone(ctx).length >= 2 && myDeck(ctx).length >= 2,
      resolve: (ctx) => {
        const cbs = cbInSpellZone(ctx).sort((a, b) => (ctx.data(a.uid).atk ?? 0) - (ctx.data(b.uid).atk ?? 0));
        ctx.toGraveyard(cbs[0].uid);
        ctx.draw(ctx.player, 2);
      },
    },
    approx: "L'avversario non sceglie: viene mandata al cimitero la Bestia Cristallo con ATK più basso.",
  },
  'Crystal Raigeki': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      targets: (ctx) => {
        const out: number[][] = [];
        const oppCards = [...ctx.oppMonsters(), ...ctx.oppSpellTraps()];
        for (const cb of cbInSpellZone(ctx)) for (const t of oppCards) out.push([cb.uid, t.uid]);
        return out.slice(0, 20);
      },
      resolve: (ctx) => { ctx.toGraveyard(ctx.targets[0]); ctx.destroy([ctx.targets[1]]); },
    },
  },
  'Rainbow Path': {
    activation: {
      timing: 'response',
      respondsTo: ['attack'],
      targets: (ctx) => single(uids(cbInSpellZone(ctx))),
      resolve: (ctx) => {
        ctx.toGraveyard(ctx.targets[0]);
        ctx.negateAttack();
        const rd = myDeck(ctx).find((c) => nameOf(ctx, c) === 'Rainbow Dragon');
        if (rd) { ctx.addToHand(rd.uid); ctx.shuffleDeck(ctx.player); }
      },
    },
  },
  'Rainbow Gravity': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      canActivate: (ctx) => {
        const names = new Set([...ctx.myMonsters(), ...cbInSpellZone(ctx), ...myGY(ctx)].filter((c) => isCB(ctx, c)).map((c) => nameOf(ctx, c)));
        return names.size >= 7 && ctx.hasFreeMonsterSlot(ctx.player) && [...myDeck(ctx), ...myGY(ctx)].some((c) => nameOf(ctx, c) === 'Rainbow Dragon');
      },
      resolve: (ctx) => {
        const rd = [...myGY(ctx), ...myDeck(ctx)].find((c) => nameOf(ctx, c) === 'Rainbow Dragon');
        if (rd) { ctx.specialSummon(rd.uid, ctx.player, 'atk'); ctx.shuffleDeck(ctx.player); }
      },
    },
  },
  'Gem Flash Energy': {
    activation: { timing: 'both', respondsTo: ['attack', 'summon', 'battleStart'], staysOnField: true, resolve: () => {} },
    triggers: [
      {
        on: 'standby',
        resolve: (ctx) => {
          const n = [0, 1].flatMap((p) => ctx.spellZoneCards(p as PlayerId)).filter((c) => !c.faceDown && (isCB(ctx, c) || (isSpell(ctx.data(c.uid)) && ctx.data(c.uid).race === 'Continuous'))).length;
          if (n) ctx.damage(ctx.opponent, 300 * n);
        },
      },
    ],
  },
  'Crystal Pair': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      canActivate: (ctx) => myDeck(ctx).some((c) => isCB(ctx, c)) && ctx.spellZoneCards(ctx.player).length < 5,
      resolve: (ctx) => {
        const opts = myDeck(ctx).filter((c) => isCB(ctx, c)).map((c) => c.uid);
        ctx.ask({ prompt: 'Coppia di Cristallo: metti una Bestia Cristallo nella Zona Magie/Trappole', options: opts, min: 1, max: 1, resolve: { kind: 'placeInSpellZone', shuffleDeck: true } });
        ctx.state.players[ctx.player].noBattleDamageTurn = ctx.state.turn;
      },
    },
    approx: 'Attivabile in qualsiasi finestra di risposta, non solo dopo la distruzione di una Bestia Cristallo.',
  },
  'Ancient City - Rainbow Ruins': {
    activation: { timing: 'main', staysOnField: true, resolve: () => {} },
    approx: 'Gli effetti graduali non sono implementati.',
  },

  // ================================================================ Toon (Pegasus)
  'Toon World': {
    activation: {
      timing: 'main',
      staysOnField: true,
      canActivate: (ctx) => ctx.state.players[ctx.player].lp > 1000,
      resolve: (ctx) => ctx.payLp(ctx.player, 1000),
    },
  },
  'Blue-Eyes Toon Dragon': toon(2),
  'Toon Summoned Skull': toon(1),
  'Toon Mermaid': toon(0),
  'Toon Dark Magician Girl': toon(1, { aura: (ctx, m) => (m.uid === ctx.card.uid ? { atk: 300 * [...ctx.state.players[0].graveyard, ...ctx.state.players[1].graveyard].filter((c) => /^Dark Magician/.test(nameOf(ctx, c)) && nameOf(ctx, c) !== 'Dark Magician Girl').length } : null) }),
  'Manga Ryu-Ran': toon(2),
  'Toon Gemini Elf': toonLite({ triggers: [{ on: 'inflictsBattleDamage', resolve: (ctx) => { const h = ctx.state.players[ctx.opponent].hand; if (h.length) ctx.discard(h[Math.floor(ctx.random() * h.length)].uid); } }] }),
  'Toon Goblin Attack Force': toonLite({ triggers: [{ on: 'afterAttack', resolve: (ctx) => { if (ctx.card.position === 'atk') { ctx.card.position = 'def'; ctx.card.positionChangedTurn = ctx.state.turn + 2; } } }] }),
  'Toon Masked Sorcerer': toonLite({ triggers: [{ on: 'inflictsBattleDamage', resolve: (ctx) => ctx.draw(ctx.player, 1) }] }),
  'Toon Cannon Soldier': toonLite({
    activation: {
      timing: 'main',
      targets: (ctx) => single(uids(ctx.myMonsters().filter((m) => m.uid !== ctx.card.uid))),
      resolve: (ctx) => { ctx.toGraveyard(ctx.targets[0]); ctx.damage(ctx.opponent, 500); },
    },
  }),
  'Toon Table of Contents': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => myDeck(ctx).some((c) => nameOf(ctx, c).includes('Toon')),
      resolve: (ctx) => {
        const opts = myDeck(ctx).filter((c) => nameOf(ctx, c).includes('Toon')).map((c) => c.uid);
        ctx.ask({ prompt: 'Indice Toon: aggiungi una carta "Toon" alla mano', options: opts, min: 1, max: 1, resolve: { kind: 'addToHand', shuffleDeck: true } });
      },
    },
  },
  'Relinquished': relinquishedScript(),
  'Thousand-Eyes Restrict': relinquishedScript({ attackRestriction: (ctx, m) => m.uid !== ctx.card.uid }),

  // ================================================================ Vehicroid (Syrus)
  'Steamroid': { approx: 'I ±500 ATK in attacco/difesa non sono applicati.' },
  'Gyroid': { cannotBeDestroyedByBattle: true, approx: 'Indistruttibile in battaglia sempre, non solo una volta per turno.' },
  'Submarineroid': { canAttackDirectly: true, approx: 'Il danno da attacco diretto non è ridotto all\'ATK originale.', triggers: [{ on: 'afterAttack', resolve: (ctx) => ctx.changeToDefense(ctx.card.uid) }] },
  'Truckroid': {
    triggers: [
      {
        on: 'destroysByBattle',
        resolve: (ctx) => {
          const gy = ctx.state.players[ctx.opponent].graveyard;
          const last = [...gy].reverse().find((c) => isMonster(ctx.data(c.uid)));
          if (!last || ctx.spellZoneCards(ctx.player).length >= 5) return;
          const atk = ctx.data(last.uid).atk ?? 0;
          if (ctx.placeInSpellZone(last.uid, ctx.player)) {
            const eq = ctx.get(last.uid);
            if (eq) eq.equippedTo = ctx.card.uid;
            ctx.card.atkMod = (ctx.card.atkMod ?? 0) + atk;
          }
        },
      },
    ],
  },
  'Vehicroid Connection Zone': {
    activation: {
      timing: 'main',
      targets: (ctx) => fusionCombosPool(ctx, [...myHand(ctx).filter((c) => isMonster(ctx.data(c.uid))), ...ctx.myMonsters()], (d) => d.name.includes('roid')),
      resolve: (ctx) => {
        const [fusionUid, ...mats] = ctx.targets;
        for (const m of mats) ctx.toGraveyard(m);
        ctx.specialSummon(fusionUid, ctx.player, 'atk');
        const f = ctx.get(fusionUid);
        if (f) f.properlySummoned = true;
      },
    },
  },
  'Supercharge': {
    activation: {
      timing: 'response',
      respondsTo: ['attack'],
      canActivate: (ctx) => ctx.myMonsters().length > 0 && ctx.myMonsters().every((m) => nameOf(ctx, m).includes('roid') && ctx.data(m.uid).race === 'Machine'),
      resolve: (ctx) => ctx.draw(ctx.player, 2),
    },
  },
  'Super Vehicroid Jumbo Drill': { cannotSpecialSummon: true, piercing: true },
  'Super Vehicroid - Stealth Union': { cannotSpecialSummon: true, extraAttack: true, piercing: true, approx: 'Attacca due volte; ATK non dimezzato.' },

  // ================================================================ Volcanic (Axel)
  'Blaze Accelerator': {
    activation: {
      timing: 'main',
      staysOnField: true,
      resolve: () => {},
    },
    // L'effetto viene esposto come "attivazione" della carta già sul terreno: vedi rules (magie continue scoperte non sono attivabili) →
    // usiamo un trigger di ignizione tramite il mostro? No: lo modelliamo come trappola-like con timing both dalla zona scoperta.
    approx: "Per usare l'effetto: seleziona un Pyro con ATK ≤ 500 in mano (attivabile dalla mano) mentre l'Acceleratore è sul terreno.",
  },
  'Tri-Blaze Accelerator': {
    activation: {
      timing: 'main',
      staysOnField: true,
      canActivate: (ctx) => ctx.mySpellTraps().some((s) => !s.faceDown && nameOf(ctx, s) === 'Blaze Accelerator'),
      resolve: (ctx) => {
        const ba = ctx.mySpellTraps().find((s) => !s.faceDown && nameOf(ctx, s) === 'Blaze Accelerator');
        if (ba) ctx.toGraveyard(ba.uid);
      },
    },
  },
  'Volcanic Shell': {
    activation: {
      timing: 'main',
      fromGraveyard: true,
      canActivate: (ctx) => ctx.state.players[ctx.player].lp > 500 && myDeck(ctx).some((c) => nameOf(ctx, c) === 'Volcanic Shell'),
      resolve: (ctx) => {
        ctx.payLp(ctx.player, 500);
        const s = myDeck(ctx).find((c) => nameOf(ctx, c) === 'Volcanic Shell');
        if (s) { ctx.addToHand(s.uid); ctx.shuffleDeck(ctx.player); }
      },
    },
    approx: 'La carta viene bandita dal cimitero come costo (nel gioco originale resta nel cimitero).',
  },
  'Volcanic Scattershot': {
    triggers: [
      { on: 'toGrave', resolve: (ctx) => ctx.damage(ctx.opponent, 500) },
      { on: 'discarded', resolve: (ctx) => ctx.damage(ctx.opponent, 500) },
    ],
    activation: blazeShot(500),
  },
  'Volcanic Slicer': {
    activation: { timing: 'main', oncePerTurn: true, resolve: (ctx) => { ctx.damage(ctx.opponent, 500); ctx.card.attacksThisTurn = 99; } },
  },
  'Volcanic Hammerer': {
    activation: {
      timing: 'main',
      oncePerTurn: true,
      resolve: (ctx) => {
        const n = myGY(ctx).filter((c) => nameOf(ctx, c).startsWith('Volcanic')).length;
        if (n) ctx.damage(ctx.opponent, 200 * n);
        ctx.card.attacksThisTurn = 99;
      },
    },
  },
  'Volcanic Doomfire': {
    cannotNormalSummon: true,
    cannotSpecialSummonFromGY: true,
    activation: {
      timing: 'main',
      fromHand: true,
      selfSummon: true,
      canActivate: (ctx) => {
        const loc = ctx.get(ctx.card.uid);
        return !!loc && loc.position === undefined && ctx.hasFreeMonsterSlot(ctx.player) && ctx.mySpellTraps().some((s) => !s.faceDown && nameOf(ctx, s) === 'Tri-Blaze Accelerator');
      },
      resolve: (ctx) => {
        const tb = ctx.mySpellTraps().find((s) => !s.faceDown && nameOf(ctx, s) === 'Tri-Blaze Accelerator');
        if (tb) ctx.toGraveyard(tb.uid);
        ctx.specialSummon(ctx.card.uid, ctx.player, 'atk');
      },
    },
    triggers: [{ on: 'destroysByBattle', resolve: (ctx) => { const m = ctx.oppMonsters(); if (m.length) { ctx.destroy(uids(m)); ctx.damage(ctx.opponent, 500 * m.length); } } }],
    approx: "L'avversario non è obbligato ad attaccarlo.",
  },
  'Volcanic Recharge': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      canActivate: (ctx) => myGY(ctx).some((c) => nameOf(ctx, c).startsWith('Volcanic')),
      resolve: (ctx) => { for (const c of myGY(ctx).filter((c) => nameOf(ctx, c).startsWith('Volcanic')).slice(0, 3)) ctx.toDeck(c.uid); },
    },
  },
  'Backfire': {
    activation: { timing: 'both', respondsTo: ['attack', 'summon', 'battleStart'], staysOnField: true, resolve: () => {} },
    approx: 'Effetto continuo non implementato (serve un trigger sulla distruzione dei mostri FUOCO).',
  },

  // ================================================================ Ojama e Draghi Armati (Chazz)
  'Ojamagic': {
    activation: { timing: 'main', canActivate: () => false, resolve: () => {} },
    triggers: [
      { on: 'discarded', resolve: ojamagicSearch },
      { on: 'toGrave', resolve: ojamagicSearch },
    ],
    approx: 'Si attiva scartandola: usa una carta che la scarti (es. Carità Graziosa).',
  },
  'Ojama Delta Hurricane!!': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => ['Ojama Green', 'Ojama Yellow', 'Ojama Black'].every((n) => ctx.myMonsters().some((m) => faceUp(m) && nameOf(ctx, m) === n)),
      resolve: (ctx) => ctx.destroy(uids([...ctx.oppMonsters(), ...ctx.oppSpellTraps()])),
    },
  },
  'Ojama King': { cannotSpecialSummon: true, approx: 'Non blocca le zone mostri avversarie.' },
  'Armed Dragon LV3': { triggers: [levelUpTrigger('standby', 'Armed Dragon LV5')] },
  'Armed Dragon LV5': {
    activation: {
      timing: 'main',
      targets: (ctx) => {
        const out: number[][] = [];
        for (const h of myHand(ctx).filter((c) => isMonster(ctx.data(c.uid)))) for (const t of ctx.oppMonsters().filter((m) => faceUp(m) && ctx.atk(m) <= (ctx.data(h.uid).atk ?? 0))) out.push([h.uid, t.uid]);
        return out;
      },
      resolve: (ctx) => { ctx.discard(ctx.targets[0]); ctx.destroy([ctx.targets[1]]); },
    },
    triggers: [{ on: 'endPhase', resolve: (ctx) => { if ((ctx.card.attacksThisTurn ?? 0) > 0) levelUpTrigger('endPhase', 'Armed Dragon LV7').resolve(ctx); } }],
    approx: 'Sale a LV7 nella End Phase se ha attaccato (non solo se ha distrutto un mostro).',
  },
  'Armed Dragon LV7': {
    cannotNormalSummon: true,
    activation: {
      timing: 'main',
      targets: (ctx) => single(uids(myHand(ctx).filter((c) => isMonster(ctx.data(c.uid))))),
      resolve: (ctx) => {
        const atk = ctx.data(ctx.targets[0]).atk ?? 0;
        ctx.discard(ctx.targets[0]);
        ctx.destroy(uids(ctx.oppMonsters().filter((m) => faceUp(m) && ctx.atk(m) <= atk)));
      },
    },
  },
  'Armed Dragon LV10': {
    cannotNormalSummon: true,
    cannotSpecialSummonFromGY: true,
    activation: {
      timing: 'main',
      fromHand: true,
      selfSummon: true,
      canActivate: (ctx) => { const loc = ctx.get(ctx.card.uid); return !!loc && loc.position === undefined && ctx.myMonsters().some((m) => nameOf(ctx, m) === 'Armed Dragon LV7'); },
      targets: (ctx) => { const loc = ctx.get(ctx.card.uid); return loc && loc.position === undefined ? single(uids(ctx.myMonsters().filter((m) => nameOf(ctx, m) === 'Armed Dragon LV7'))) : single(uids(myHand(ctx))); },
      resolve: (ctx) => {
        const loc = ctx.get(ctx.card.uid);
        if (loc && loc.position === undefined) { ctx.toGraveyard(ctx.targets[0]); ctx.specialSummon(ctx.card.uid, ctx.player, 'atk'); }
        else { ctx.discard(ctx.targets[0]); ctx.destroy(uids(ctx.oppMonsters().filter(faceUp))); }
      },
    },
  },
  'Level Up!': {
    activation: {
      timing: 'main',
      targets: (ctx) => single(uids(ctx.myMonsters().filter((m) => faceUp(m) && /LV\d+$/.test(nameOf(ctx, m)) && nextLv(ctx, m) !== null))),
      resolve: (ctx) => {
        const m = ctx.get(ctx.targets[0]);
        if (!m) return;
        const next = nextLv(ctx, m);
        ctx.toGraveyard(m.uid);
        if (next) { const fromDeck = myDeck(ctx).includes(next); ctx.specialSummon(next.uid, ctx.player, 'atk'); if (fromDeck) ctx.shuffleDeck(ctx.player); }
      },
    },
  },
  'XYZ-Dragon Cannon': xyzCannon((ctx) => [...ctx.oppMonsters(), ...ctx.oppSpellTraps()]),
  'XY-Dragon Cannon': xyzCannon((ctx) => ctx.oppSpellTraps().filter((s) => !s.faceDown)),
  'XZ-Tank Cannon': xyzCannon((ctx) => ctx.oppSpellTraps().filter((s) => s.faceDown)),
  'YZ-Tank Dragon': xyzCannon((ctx) => ctx.oppMonsters().filter((m) => m.position === 'facedown')),
  'VW-Tiger Catapult': {
    cannotSpecialSummonFromGY: true,
    activation: {
      timing: 'main',
      targets: (ctx) => { const out: number[][] = []; for (const h of myHand(ctx)) for (const t of ctx.oppMonsters().filter(faceUp)) out.push([h.uid, t.uid]); return out; },
      resolve: (ctx) => { ctx.discard(ctx.targets[0]); const t = ctx.get(ctx.targets[1]); if (t) { if (t.position === 'atk') ctx.changeToDefense(t.uid); else { t.position = 'atk'; } } },
    },
  },
  'VWXYZ-Dragon Catapult Cannon': {
    cannotSpecialSummonFromGY: true,
    activation: { timing: 'main', oncePerTurn: true, targets: (ctx) => single(uids([...ctx.oppMonsters(), ...ctx.oppSpellTraps()])), resolve: (ctx) => ctx.banish(ctx.targets[0]) },
  },
  'Frontline Base': {
    activation: { timing: 'main', staysOnField: true, resolve: () => {} },
    approx: 'Effetto (evocazione speciale di un mostro Union) non implementato.',
  },
  'Chthonian Blast': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      canActivate: (ctx) => allMonstersOnField(ctx).some(faceUp),
      resolve: (ctx) => {
        const m = allMonstersOnField(ctx).filter(faceUp).sort((a, b) => ctx.atk(a) - ctx.atk(b))[0];
        if (!m) return;
        const half = Math.floor(ctx.atk(m) / 2);
        ctx.destroy([m.uid]);
        ctx.damage(0, half); ctx.damage(1, half);
      },
    },
    approx: 'Attivabile in qualsiasi finestra di risposta.',
  },

  // ================================================================ Dadi e monete (Joey, Duke)
  'Skull Dice': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      resolve: (ctx) => { const r = roll(ctx); ctx.log(`Dado Teschio: ${r}`); for (const m of ctx.oppMonsters().filter(faceUp)) ctx.tempBoost(m.uid, -100 * r, -100 * r); },
    },
  },
  'Graceful Dice': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      resolve: (ctx) => { const r = roll(ctx); ctx.log(`Dado Grazioso: ${r}`); for (const m of ctx.myMonsters().filter(faceUp)) ctx.tempBoost(m.uid, 100 * r, 100 * r); },
    },
  },
  'Dice Jar': {
    triggers: [
      {
        on: 'flip',
        resolve: (ctx) => {
          let a = roll(ctx); let b = roll(ctx);
          while (a === b) { a = roll(ctx); b = roll(ctx); }
          ctx.log(`Vaso dei Dadi: ${a} contro ${b}`);
          const loser = a < b ? ctx.player : ctx.opponent;
          const win = Math.max(a, b);
          ctx.damage(loser, win === 6 ? 6000 : win * 500);
        },
      },
    ],
  },
  'Blind Destruction': {
    activation: { timing: 'both', respondsTo: ['attack', 'summon', 'battleStart'], staysOnField: true, resolve: () => {} },
    triggers: [
      {
        on: 'standby',
        resolve: (ctx) => {
          const r = roll(ctx);
          ctx.log(`Distruzione Cieca: ${r}`);
          ctx.destroy(uids(allMonstersOnField(ctx).filter((m) => { const l = ctx.data(m.uid).level ?? 0; return r === 6 ? l >= 6 : l === r; })));
        },
      },
    ],
  },
  'Time Wizard': {
    activation: {
      timing: 'main',
      oncePerTurn: true,
      resolve: (ctx) => {
        if (coin(ctx)) { ctx.log('Mago del Tempo: testa! I mostri avversari vengono distrutti.'); ctx.destroy(uids(ctx.oppMonsters())); }
        else {
          const mine = ctx.myMonsters().filter(faceUp);
          const dmg = Math.floor(mine.reduce((s, m) => s + ctx.atk(m), 0) / 2);
          ctx.log('Mago del Tempo: croce! I tuoi mostri vengono distrutti.');
          ctx.destroy(uids(ctx.myMonsters()));
          ctx.damage(ctx.player, dmg);
        }
      },
    },
  },
  'Gilford the Lightning': {
    tributeThreeOption: true,
    triggers: [{ on: 'tributeSummon', resolve: (ctx) => { if ((ctx.card.summonTributes ?? 0) >= 3) ctx.destroy(uids(ctx.oppMonsters())); } }],
  },
  'Metalmorph': {
    equip: { atk: 300, def: 300 },
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      staysOnField: true,
      targets: (ctx) => single(uids(allMonstersOnField(ctx).filter(faceUp))),
      resolve: (ctx) => { const t = ctx.get(ctx.targets[0]); if (!t) return; ctx.card.equippedTo = t.uid; t.atkMod = (t.atkMod ?? 0) + 300; t.defMod = (t.defMod ?? 0) + 300; },
    },
    approx: 'Il bonus in attacco pari a metà ATK del bersaglio non è applicato.',
  },

  // ================================================================ Arpie (Mai)
  'Elegant Egotist': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => allMonstersOnField(ctx).some((m) => faceUp(m) && nameOf(ctx, m).includes('Harpie Lady')) && ctx.hasFreeMonsterSlot(ctx.player),
      resolve: (ctx) => {
        const opts = [...myHand(ctx), ...myDeck(ctx)].filter((c) => ['Harpie Lady', 'Harpie Lady Sisters', 'Cyber Harpie Lady', 'Harpie Lady 1', 'Harpie Lady 2', 'Harpie Lady 3'].includes(nameOf(ctx, c))).map((c) => c.uid);
        if (opts.length) ctx.ask({ prompt: 'Egoista Elegante: evoca una Signora Arpia o le Sorelle', options: opts, min: 1, max: 1, resolve: { kind: 'specialSummon', position: 'atk', shuffleDeck: true } });
      },
    },
  },
  'Harpie Lady Sisters': { cannotNormalSummon: true },
  "Harpie's Pet Dragon": { aura: (ctx, m) => (m.uid === ctx.card.uid ? { atk: 300 * allMonstersOnField(ctx).filter((c) => faceUp(c) && nameOf(ctx, c).includes('Harpie Lady')).length, def: 300 * allMonstersOnField(ctx).filter((c) => faceUp(c) && nameOf(ctx, c).includes('Harpie Lady')).length } : null) },
  "Harpies' Hunting Ground": {
    activation: { timing: 'main', staysOnField: true, resolve: () => {} },
    aura: (ctx, m) => (ctx.data(m.uid).race === 'Winged Beast' ? { atk: 200, def: 200 } : null),
    approx: "Il secondo effetto (distruzione di una magia/trappola all'evocazione di un'Arpia) non è implementato.",
  },
  'Harpie Queen': {
    activation: {
      timing: 'main',
      fromHand: true,
      canActivate: (ctx) => myDeck(ctx).some((c) => nameOf(ctx, c) === "Harpies' Hunting Ground"),
      resolve: (ctx) => { const g = myDeck(ctx).find((c) => nameOf(ctx, c) === "Harpies' Hunting Ground"); if (g) { ctx.addToHand(g.uid); ctx.shuffleDeck(ctx.player); } },
    },
  },

  // ================================================================ Varie Duel Monsters
  'Insect Queen': {
    aura: (ctx, m) => (m.uid === ctx.card.uid ? { atk: 200 * allMonstersOnField(ctx).filter((c) => faceUp(c) && ctx.data(c.uid).race === 'Insect').length } : null),
    approx: 'Attacca senza dover offrire un tributo; non genera segnalini.',
  },
  'Buster Blader': { aura: (ctx, m) => (m.uid === ctx.card.uid ? { atk: 500 * [...ctx.oppMonsters().filter(faceUp), ...ctx.state.players[ctx.opponent].graveyard].filter((c) => ctx.data(c.uid).race === 'Dragon').length } : null) },
  'Dark Paladin': { cannotSpecialSummon: true, aura: (ctx, m) => (m.uid === ctx.card.uid ? { atk: 500 * [...allMonstersOnField(ctx).filter(faceUp), ...ctx.state.players[0].graveyard, ...ctx.state.players[1].graveyard].filter((c) => ctx.data(c.uid).race === 'Dragon').length } : null), approx: 'La negazione delle magie non è implementata.' },
  'Zolga': { triggers: [{ on: 'tributed', resolve: (ctx) => ctx.gainLp(ctx.card.owner, 2000) }] },
  'Bonding - H2O': {
    activation: {
      timing: 'main',
      targets: (ctx) => {
        const hy = ctx.myMonsters().filter((m) => nameOf(ctx, m) === 'Hydrogeddon');
        const ox = ctx.myMonsters().filter((m) => nameOf(ctx, m) === 'Oxygeddon');
        const wd = [...myHand(ctx), ...myDeck(ctx), ...myGY(ctx)].find((c) => nameOf(ctx, c) === 'Water Dragon');
        if (hy.length < 2 || ox.length < 1 || !wd) return [];
        return [[hy[0].uid, hy[1].uid, ox[0].uid, wd.uid]];
      },
      resolve: (ctx) => {
        const [h1, h2, o, wd] = ctx.targets;
        for (const t of [h1, h2, o]) ctx.toGraveyard(t);
        ctx.specialSummon(wd, ctx.player, 'atk');
        ctx.shuffleDeck(ctx.player);
      },
    },
  },
  'Water Dragon': {
    cannotNormalSummon: true,
    cannotSpecialSummonFromGY: true,
    aura: (ctx, m) => (m.uid !== ctx.card.uid && (ctx.data(m.uid).attribute === 'FIRE' || ctx.data(m.uid).race === 'Pyro') ? { atk: -(ctx.data(m.uid).atk ?? 0) - (m.atkMod ?? 0) - (m.tempAtkMod ?? 0) } : null),
    triggers: [
      {
        on: 'toGrave',
        resolve: (ctx) => {
          const hy = myGY(ctx).filter((c) => nameOf(ctx, c) === 'Hydrogeddon').slice(0, 2);
          const ox = myGY(ctx).filter((c) => nameOf(ctx, c) === 'Oxygeddon').slice(0, 1);
          if (hy.length === 2 && ox.length === 1) for (const c of [...hy, ...ox]) ctx.specialSummon(c.uid, ctx.player, 'atk');
        },
      },
    ],
  },
  'Destiny End Dragoon': {
    cannotSpecialSummon: true,
    activation: {
      timing: 'main',
      oncePerTurn: true,
      targets: (ctx) => single(uids(ctx.oppMonsters())),
      resolve: (ctx) => { const t = ctx.get(ctx.targets[0]); if (!t) return; const up = faceUp(t); const atk = ctx.atk(t); ctx.destroy([t.uid]); if (up) ctx.damage(ctx.opponent, atk); },
    },
  },
  'Elemental HERO Necroid Shaman': {
    cannotSpecialSummon: true,
    triggers: [
      {
        on: 'specialSummon',
        targets: (ctx) => single(uids(ctx.oppMonsters())),
        resolve: (ctx) => {
          ctx.destroy([ctx.targets[0]]);
          const gy = ctx.state.players[ctx.opponent].graveyard.filter((c) => isMonster(ctx.data(c.uid)));
          if (gy.length && ctx.hasFreeMonsterSlot(ctx.opponent)) ctx.specialSummon(gy[gy.length - 2 >= 0 ? gy.length - 2 : 0].uid, ctx.opponent, 'atk');
        },
      },
    ],
    approx: "Il mostro rievocato per l'avversario viene scelto automaticamente.",
  },
  'Elemental HERO Mariner': { cannotSpecialSummon: true, canAttackDirectly: true, approx: 'Attacca direttamente sempre, non solo con carte coperte.' },
  'Elemental HERO Tempest': { cannotSpecialSummon: true, approx: 'Effetto di protezione non implementato.' },
  'Elemental HERO Electrum': { cannotSpecialSummon: true, approx: 'Effetti non implementati.' },
  'Cyber Blader': {
    cannotSpecialSummon: true,
    aura: (ctx, m) => (m.uid === ctx.card.uid && ctx.oppMonsters().length === 2 ? { atk: ctx.data(m.uid).atk ?? 0 } : null),
    approx: 'Solo il raddoppio ATK con 2 mostri avversari.',
  },
  'Cyber Ogre 2': { cannotSpecialSummon: true, approx: 'Bonus in attacco non applicato.' },
  'Kaibaman': {
    activation: {
      timing: 'main',
      tributeSelf: true,
      canActivate: (ctx) => myHand(ctx).some((c) => nameOf(ctx, c) === 'Blue-Eyes White Dragon'),
      resolve: (ctx) => { const be = myHand(ctx).find((c) => nameOf(ctx, c) === 'Blue-Eyes White Dragon'); if (be) ctx.specialSummon(be.uid, ctx.player, 'atk'); },
    },
  },
  'The Flute of Summoning Dragon': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => ctx.myMonsters().some((m) => faceUp(m) && nameOf(ctx, m) === 'Lord of D.') && myHand(ctx).some((c) => ctx.data(c.uid).race === 'Dragon') && ctx.hasFreeMonsterSlot(ctx.player),
      resolve: (ctx) => {
        const opts = myHand(ctx).filter((c) => ctx.data(c.uid).race === 'Dragon' && isMonster(ctx.data(c.uid))).map((c) => c.uid);
        ctx.ask({ prompt: 'Flauto di Evocazione del Drago: evoca fino a 2 Draghi dalla mano', options: opts, min: 1, max: 2, resolve: { kind: 'specialSummon', position: 'atk' } });
      },
    },
  },
  'Burst Stream of Destruction': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => ctx.myMonsters().some((m) => faceUp(m) && nameOf(ctx, m) === 'Blue-Eyes White Dragon') && ctx.oppMonsters().length > 0,
      resolve: (ctx) => { ctx.destroy(uids(ctx.oppMonsters())); for (const m of ctx.myMonsters().filter((c) => nameOf(ctx, c) === 'Blue-Eyes White Dragon')) m.attacksThisTurn = 99; },
    },
  },
  'Dark Magic Attack': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => ctx.myMonsters().some((m) => faceUp(m) && nameOf(ctx, m) === 'Dark Magician') && ctx.oppSpellTraps().length > 0,
      resolve: (ctx) => ctx.destroy(uids(ctx.oppSpellTraps())),
    },
  },
  'Thousand Knives': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => ctx.myMonsters().some((m) => faceUp(m) && nameOf(ctx, m) === 'Dark Magician'),
      targets: (ctx) => single(uids(ctx.oppMonsters())),
      resolve: (ctx) => ctx.destroy([ctx.targets[0]]),
    },
  },
  'Magical Dimension': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      canActivate: (ctx) => ctx.myMonsters().some((m) => faceUp(m) && ctx.data(m.uid).race === 'Spellcaster'),
      targets: (ctx) => {
        const out: number[][] = [];
        for (const t of ctx.myMonsters()) for (const h of myHand(ctx).filter((c) => isMonster(ctx.data(c.uid)) && ctx.data(c.uid).race === 'Spellcaster')) out.push([t.uid, h.uid]);
        return out;
      },
      resolve: (ctx) => {
        ctx.toGraveyard(ctx.targets[0]);
        ctx.specialSummon(ctx.targets[1], ctx.player, 'atk');
        const opts = uids(ctx.oppMonsters());
        if (opts.length) ctx.ask({ prompt: 'Dimensione Magica: distruggi 1 mostro (facoltativo)', options: opts, min: 0, max: 1, resolve: { kind: 'destroy' } });
      },
    },
  },
  "Sage's Stone": {
    activation: {
      timing: 'main',
      canActivate: (ctx) => ctx.myMonsters().some((m) => faceUp(m) && nameOf(ctx, m) === 'Dark Magician Girl') && [...myHand(ctx), ...myDeck(ctx)].some((c) => nameOf(ctx, c) === 'Dark Magician') && ctx.hasFreeMonsterSlot(ctx.player),
      resolve: (ctx) => { const dm = [...myHand(ctx), ...myDeck(ctx)].find((c) => nameOf(ctx, c) === 'Dark Magician'); if (dm) { ctx.specialSummon(dm.uid, ctx.player, 'atk'); ctx.shuffleDeck(ctx.player); } },
    },
  },
  'Dark Magician Girl': { aura: (ctx, m) => (m.uid === ctx.card.uid ? { atk: 300 * [...ctx.state.players[0].graveyard, ...ctx.state.players[1].graveyard].filter((c) => ['Dark Magician', 'Magician of Black Chaos'].includes(nameOf(ctx, c))).length } : null) },
  'Skilled Dark Magician': {
    approx: 'I Segnalini Magia non vengono accumulati: offri come tributo la carta per evocare Mago Nero dalla mano/deck/cimitero.',
    activation: {
      timing: 'main',
      tributeSelf: true,
      canActivate: (ctx) => [...myHand(ctx), ...myDeck(ctx), ...myGY(ctx)].some((c) => nameOf(ctx, c) === 'Dark Magician'),
      resolve: (ctx) => { const dm = [...myHand(ctx), ...myGY(ctx), ...myDeck(ctx)].find((c) => nameOf(ctx, c) === 'Dark Magician'); if (dm) { ctx.specialSummon(dm.uid, ctx.player, 'atk'); ctx.shuffleDeck(ctx.player); } },
    },
  },
  'Magical Hats': {
    activation: {
      timing: 'response',
      respondsTo: ['attack'],
      canActivate: (ctx) => ctx.event?.kind === 'attack' && ctx.event.targetUid !== null && !!ctx.get(ctx.event.targetUid) && ctx.get(ctx.event.targetUid)!.controller === ctx.player,
      resolve: (ctx) => { if (ctx.event?.kind === 'attack' && ctx.event.targetUid !== null) { ctx.flipFaceDown(ctx.event.targetUid); ctx.negateAttack(); } },
    },
    approx: "Il mostro viene coperto e l'attacco annullato, senza i cappelli finti.",
  },
  'Spellbinding Circle': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      staysOnField: true,
      targets: (ctx) => single(uids(ctx.oppMonsters().filter(faceUp))),
      resolve: (ctx) => { const t = ctx.get(ctx.targets[0]); if (t) { ctx.card.equippedTo = t.uid; if (ctx.state.pending?.kind === 'attack' && ctx.state.pending.attackerUid === t.uid) ctx.negateAttack(); } },
    },
    attackRestriction: (ctx, m) => m.uid === ctx.card.equippedTo,
  },
  'Shadow Spell': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      staysOnField: true,
      targets: (ctx) => single(uids(ctx.oppMonsters().filter(faceUp))),
      resolve: (ctx) => { const t = ctx.get(ctx.targets[0]); if (t) { ctx.card.equippedTo = t.uid; t.atkMod = (t.atkMod ?? 0) - 700; if (ctx.state.pending?.kind === 'attack' && ctx.state.pending.attackerUid === t.uid) ctx.negateAttack(); } },
    },
    attackRestriction: (ctx, m) => m.uid === ctx.card.equippedTo,
  },
  'Crush Card Virus': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      targets: (ctx) => single(uids(ctx.myMonsters().filter((m) => faceUp(m) && ctx.data(m.uid).attribute === 'DARK' && (ctx.data(m.uid).atk ?? 0) <= 1000))),
      resolve: (ctx) => {
        ctx.toGraveyard(ctx.targets[0]);
        const op = ctx.state.players[ctx.opponent];
        const victims = [...ctx.oppMonsters().filter((m) => (ctx.data(m.uid).atk ?? 0) >= 1500), ...op.hand.filter((c) => isMonster(ctx.data(c.uid)) && (ctx.data(c.uid).atk ?? 0) >= 1500)];
        ctx.destroy(uids(victims));
      },
    },
    approx: 'Non controlla le pescate dei turni successivi.',
  },
  'Shrink': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      targets: (ctx) => single(uids(allMonstersOnField(ctx).filter(faceUp))),
      resolve: (ctx) => { const t = ctx.get(ctx.targets[0]); if (t) ctx.tempBoost(t.uid, -Math.floor((ctx.data(t.uid).atk ?? 0) / 2)); },
    },
  },
  'Cost Down': {
    activation: { timing: 'main', canActivate: (ctx) => myHand(ctx).length > 0, resolve: (ctx) => { const h = myHand(ctx); ctx.discard(h[0].uid); ctx.log('Riduzione di Costo: livelli in mano ridotti di 2 (approssimato).'); } },
    approx: 'Scarta la prima carta in mano; la riduzione di livello non è applicata.',
  },
  'Interdimensional Matter Transporter': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      targets: (ctx) => single(uids(ctx.myMonsters().filter(faceUp))),
      resolve: (ctx) => { const t = ctx.get(ctx.targets[0]); if (t) { t.tempAtkMod = 0; ctx.log(`${nameOf(ctx, t)} viene protetto (approssimazione: resta sul terreno).`); if (ctx.state.pending?.kind === 'attack' && ctx.state.pending.targetUid === t.uid) ctx.negateAttack(); } },
    },
    approx: "Il mostro non viene bandito: l'attacco che lo prende di mira viene annullato.",
  },
  'Cloning': {
    activation: {
      timing: 'response',
      respondsTo: ['summon'],
      canActivate: (ctx) => ctx.hasFreeMonsterSlot(ctx.player),
      resolve: (ctx) => { if (ctx.event?.kind === 'summon') { const s = ctx.get(ctx.event.cardUid); if (s) ctx.log(`Clonazione: copia di ${nameOf(ctx, s)} (non implementata: nessun segnalino).`); } },
    },
    approx: 'Segnalino clone non implementato.',
  },
  'Fusion Sage': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => myDeck(ctx).some((c) => nameOf(ctx, c) === 'Polymerization'),
      resolve: (ctx) => { const p = myDeck(ctx).find((c) => nameOf(ctx, c) === 'Polymerization'); if (p) { ctx.addToHand(p.uid); ctx.shuffleDeck(ctx.player); } },
    },
  },
  'Fusion Recovery': {
    activation: {
      timing: 'main',
      targets: (ctx) => {
        const polys = myGY(ctx).filter((c) => nameOf(ctx, c) === 'Polymerization');
        const mats = myGY(ctx).filter((c) => isMonster(ctx.data(c.uid)));
        const out: number[][] = [];
        for (const p of polys.slice(0, 1)) for (const m of mats) out.push([p.uid, m.uid]);
        return out;
      },
      resolve: (ctx) => { ctx.addToHand(ctx.targets[0]); ctx.addToHand(ctx.targets[1]); },
    },
    approx: 'Qualsiasi mostro del cimitero è considerato un materiale di fusione.',
  },
  'Hero Signal': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      canActivate: (ctx) => ctx.hasFreeMonsterSlot(ctx.player) && [...myHand(ctx), ...myDeck(ctx)].some((c) => isMonster(ctx.data(c.uid)) && (ctx.data(c.uid).level ?? 0) <= 4 && nameOf(ctx, c).includes('Elemental HERO')),
      resolve: (ctx) => {
        const opts = [...myHand(ctx), ...myDeck(ctx)].filter((c) => isMonster(ctx.data(c.uid)) && (ctx.data(c.uid).level ?? 0) <= 4 && nameOf(ctx, c).includes('Elemental HERO')).map((c) => c.uid);
        ctx.ask({ prompt: 'Segnale HERO: evoca un Elemental HERO di livello ≤ 4', options: opts, min: 1, max: 1, resolve: { kind: 'specialSummon', position: 'atk', shuffleDeck: true } });
      },
    },
    approx: 'Attivabile in qualsiasi finestra di risposta.',
  },
  'A Hero Emerges': {
    activation: {
      timing: 'response',
      respondsTo: ['attack'],
      canActivate: (ctx) => myHand(ctx).length > 0 && ctx.hasFreeMonsterSlot(ctx.player),
      resolve: (ctx) => {
        const h = myHand(ctx);
        const c = h[Math.floor(ctx.random() * h.length)];
        const d = ctx.data(c.uid);
        if (isMonster(d) && (d.level ?? 0) <= 4) ctx.specialSummon(c.uid, ctx.player, 'atk');
        else ctx.toGraveyard(c.uid);
      },
    },
    approx: 'Evoca solo mostri di livello ≤ 4; gli altri vanno al cimitero.',
  },
  'Draining Shield': {
    activation: {
      timing: 'response',
      respondsTo: ['attack'],
      resolve: (ctx) => { const a = attackerOf(ctx); ctx.negateAttack(); if (a) ctx.gainLp(ctx.player, ctx.atk(a)); },
    },
  },
  'Hero Barrier': {
    activation: {
      timing: 'response',
      respondsTo: ['attack'],
      canActivate: (ctx) => ctx.myMonsters().some((m) => faceUp(m) && nameOf(ctx, m).includes('Elemental HERO')),
      resolve: (ctx) => ctx.negateAttack(),
    },
  },
  'O - Oversoul': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => ctx.hasFreeMonsterSlot(ctx.player),
      targets: (ctx) => single(uids(myGY(ctx).filter((c) => nameOf(ctx, c).includes('Elemental HERO') && ctx.data(c.uid).type === 'Normal Monster'))),
      resolve: (ctx) => { ctx.specialSummon(ctx.targets[0], ctx.player, 'atk'); },
    },
  },
  'R - Righteous Justice': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => ctx.myMonsters().some((m) => faceUp(m) && nameOf(ctx, m).includes('Elemental HERO')) && allSpellTrapsOnField(ctx).some((s) => s.uid !== ctx.card.uid),
      resolve: (ctx) => {
        const n = ctx.myMonsters().filter((m) => faceUp(m) && nameOf(ctx, m).includes('Elemental HERO')).length;
        const opts = allSpellTrapsOnField(ctx).filter((s) => s.uid !== ctx.card.uid).map((s) => s.uid);
        ctx.ask({ prompt: `R - Giustizia: distruggi fino a ${n} magie/trappole`, options: opts, min: 1, max: n, resolve: { kind: 'destroy' } });
      },
    },
  },
  'H - Heated Heart': {
    activation: {
      timing: 'main',
      targets: (ctx) => single(uids(ctx.myMonsters().filter(faceUp))),
      resolve: (ctx) => ctx.tempBoost(ctx.targets[0], 500),
    },
    approx: 'Il danno perforante temporaneo non è applicato.',
  },
  'Transcendent Wings': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      canActivate: (ctx) => ctx.myMonsters().some((m) => faceUp(m) && nameOf(ctx, m) === 'Winged Kuriboh') && myHand(ctx).length >= 2 && [...myHand(ctx), ...myDeck(ctx)].some((c) => nameOf(ctx, c) === 'Winged Kuriboh LV10'),
      resolve: (ctx) => {
        const wk = ctx.myMonsters().find((m) => nameOf(ctx, m) === 'Winged Kuriboh');
        const lv10 = [...myHand(ctx), ...myDeck(ctx)].find((c) => nameOf(ctx, c) === 'Winged Kuriboh LV10');
        const h = myHand(ctx).filter((c) => c.uid !== lv10?.uid).slice(0, 2);
        for (const c of h) ctx.discard(c.uid);
        if (wk) ctx.toGraveyard(wk.uid);
        if (lv10) { ctx.specialSummon(lv10.uid, ctx.player, 'atk'); ctx.shuffleDeck(ctx.player); }
      },
    },
    approx: 'Scarta le prime due carte della mano.',
  },
  'Winged Kuriboh LV10': {
    cannotNormalSummon: true,
    cannotSpecialSummonFromGY: true,
    activation: {
      timing: 'response',
      respondsTo: ['attack', 'battleStart'],
      tributeSelf: true,
      canActivate: (ctx) => ctx.state.turnPlayer !== ctx.player && ctx.oppMonsters().some((m) => m.position === 'atk'),
      resolve: (ctx) => {
        const atkMons = ctx.oppMonsters().filter((m) => m.position === 'atk');
        const total = atkMons.reduce((s, m) => s + ctx.atk(m), 0);
        ctx.destroy(uids(atkMons));
        ctx.damage(ctx.opponent, total);
      },
    },
  },
  'Wroughtweiler': {
    triggers: [
      {
        on: 'destroyedByBattle',
        resolve: (ctx) => {
          const hero = myGY(ctx).find((c) => nameOf(ctx, c).includes('Elemental HERO') && c.uid !== ctx.card.uid);
          const poly = myGY(ctx).find((c) => nameOf(ctx, c) === 'Polymerization');
          if (hero) ctx.addToHand(hero.uid);
          if (poly) ctx.addToHand(poly.uid);
        },
      },
    ],
  },
  'Hero Kid': {
    triggers: [
      {
        on: 'specialSummon',
        resolve: (ctx) => {
          const opts = myDeck(ctx).filter((c) => nameOf(ctx, c) === 'Hero Kid').map((c) => c.uid);
          if (opts.length && ctx.hasFreeMonsterSlot(ctx.player)) ctx.ask({ prompt: 'Hero Kid: evoca altri Hero Kid dal deck', options: opts, min: 0, max: Math.min(2, opts.length), resolve: { kind: 'specialSummon', position: 'atk', shuffleDeck: true } });
        },
      },
    ],
  },
  'Elemental HERO Necroshade': {
    approx: "L'evocazione senza tributo di un HERO di livello ≥ 5 non è implementata.",
  },
};

function ojamagicSearch(ctx: EffectContext): void {
  for (const n of ['Ojama Green', 'Ojama Yellow', 'Ojama Black']) {
    const c = myDeck(ctx).find((x) => nameOf(ctx, x) === n);
    if (c) ctx.addToHand(c.uid);
  }
  ctx.shuffleDeck(ctx.player);
}

/** Relinquished / Thousand-Eyes Restrict: equipaggia un mostro avversario e ne assume ATK/DEF. */
function relinquishedScript(extra: Partial<CardScript> = {}): CardScript {
  return {
    cannotSpecialSummon: false,
    activation: {
      timing: 'main',
      oncePerTurn: true,
      canActivate: (ctx) => !ctx.spellZoneCards(ctx.player).some((s) => s.equippedTo === ctx.card.uid) && ctx.spellZoneCards(ctx.player).length < 5,
      targets: (ctx) => single(uids(ctx.oppMonsters())),
      resolve: (ctx) => {
        const t = ctx.get(ctx.targets[0]);
        if (!t) return;
        const atk = ctx.data(t.uid).atk ?? 0;
        const def = ctx.data(t.uid).def ?? 0;
        if (ctx.placeInSpellZone(t.uid, ctx.player)) {
          const eq = ctx.get(t.uid);
          if (eq) eq.equippedTo = ctx.card.uid;
          ctx.card.atkMod = atk;
          ctx.card.defMod = def;
          ctx.log(`${nameOf(ctx, ctx.card)} assorbe ${nameOf(ctx, t)}: ATK ${atk} / DEF ${def}.`);
        }
      },
    },
    approx: 'Se distrutto in battaglia, non sacrifica il mostro assorbito al suo posto.',
    ...extra,
  };
}

/** Effetto dalla mano: manda un Pyro con ATK ≤ N dalla mano per distruggere un mostro avversario, se l'Acceleratore di Fiamme è sul terreno. */
function blazeShot(maxAtk: number): CardScript['activation'] {
  return {
    timing: 'main',
    fromHand: true,
    canActivate: (ctx) => {
      const d = ctx.data(ctx.card.uid);
      const tri = ctx.mySpellTraps().some((s) => !s.faceDown && nameOf(ctx, s) === 'Tri-Blaze Accelerator');
      const ba = ctx.mySpellTraps().some((s) => !s.faceDown && nameOf(ctx, s) === 'Blaze Accelerator');
      return (tri || (ba && (d.atk ?? 0) <= maxAtk)) && ctx.oppMonsters().length > 0;
    },
    targets: (ctx) => single(uids(ctx.oppMonsters())),
    resolve: (ctx) => {
      const tri = ctx.mySpellTraps().some((s) => !s.faceDown && nameOf(ctx, s) === 'Tri-Blaze Accelerator');
      ctx.destroy([ctx.targets[0]]);
      if (tri) ctx.damage(ctx.opponent, 500);
      noAttacksThisTurn(ctx);
    },
  };
}

/** Prossimo mostro "LV" citato nel testo della carta (Level Up!). */
function nextLv(ctx: EffectContext, m: CardInstance): CardInstance | null {
  const d = ctx.data(m.uid);
  const own = d.name.match(/LV(\d+)$/);
  if (!own) return null;
  const names = [...d.desc.matchAll(/"([^"]+ LV\d+)"/g)].map((x) => x[1]).filter((n) => Number(n.match(/LV(\d+)$/)?.[1]) > Number(own[1]));
  for (const c of [...myHand(ctx), ...myDeck(ctx)]) if (names.includes(nameOf(ctx, c))) return c;
  return null;
}

/** XYZ: scarta 1 carta per distruggere un bersaglio tra quelli ammessi. */
function xyzCannon(candidates: (ctx: EffectContext) => CardInstance[]): CardScript {
  return {
    cannotSpecialSummonFromGY: true,
    activation: {
      timing: 'main',
      targets: (ctx) => { const out: number[][] = []; for (const h of myHand(ctx)) for (const t of candidates(ctx)) out.push([h.uid, t.uid]); return out.slice(0, 20); },
      resolve: (ctx) => { ctx.discard(ctx.targets[0]); ctx.destroy([ctx.targets[1]]); },
    },
  };
}

ANIME_LIBRARY['Volcanic Rocket'] = {
  activation: blazeShot(500),
  triggers: [
    {
      on: 'summon',
      resolve: (ctx) => {
        const opts = [...myDeck(ctx), ...myGY(ctx)].filter((c) => nameOf(ctx, c).includes('Blaze Accelerator')).map((c) => c.uid);
        if (opts.length) ctx.ask({ prompt: 'Razzo Vulcanico: aggiungi un Acceleratore di Fiamme alla mano', options: opts, min: 0, max: 1, resolve: { kind: 'addToHand', shuffleDeck: true } });
      },
    },
  ],
};
