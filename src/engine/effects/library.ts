import type { CardScript } from './types';
import { isMonster, isExtraDeckMonster } from '../cards';
import type { CardData } from '../types';
import { autoScript } from './auto';
import { single, faceUp, uids, allMonstersOnField, allSpellTrapsOnField, otherSpellTraps, graveyardMonstersRevivable, attackerOf, summonedOf } from './helpers';
import { GX_LIBRARY } from './library-gx';
import { ANIME_LIBRARY } from './library-anime';

// ---------------------------------------------------------------------------
// Libreria degli effetti implementati, indicizzata per nome inglese della carta
// (il nome è stabile tra le varie ristampe/illustrazioni, l'id no).
// Le carte non presenti qui sono trattate come "vaniglia": i mostri si evocano
// e combattono normalmente, magie e trappole non sono attivabili.
// ---------------------------------------------------------------------------

export const LIBRARY: Record<string, CardScript> = {
  ...ANIME_LIBRARY,
  ...GX_LIBRARY,
  // ------------------------------------------------------------------ MAGIE
  'Pot of Greed': {
    activation: { timing: 'main', resolve: (ctx) => ctx.draw(ctx.player, 2) },
  },
  'Graceful Charity': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => ctx.state.players[ctx.player].deck.length >= 3,
      resolve: (ctx) => {
        ctx.draw(ctx.player, 3);
        const hand = ctx.state.players[ctx.player].hand.map((c) => c.uid);
        ctx.ask({ prompt: 'Scarta 2 carte dalla mano', options: hand, min: 2, max: 2, resolve: { kind: 'discard' } });
      },
    },
  },
  'Jar of Greed': {
    activation: { timing: 'both', respondsTo: ['attack', 'summon', 'battleStart'], resolve: (ctx) => ctx.draw(ctx.player, 1) },
  },
  'Dark Hole': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => allMonstersOnField(ctx).length > 0,
      resolve: (ctx) => ctx.destroy(uids(allMonstersOnField(ctx))),
    },
  },
  'Raigeki': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => ctx.oppMonsters().length > 0,
      resolve: (ctx) => ctx.destroy(uids(ctx.oppMonsters())),
    },
  },
  'Heavy Storm': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => otherSpellTraps(ctx).length > 0,
      resolve: (ctx) => ctx.destroy(uids(otherSpellTraps(ctx))),
    },
  },
  'Mystical Space Typhoon': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      targets: (ctx) => single(uids(otherSpellTraps(ctx))),
      resolve: (ctx) => ctx.destroy([ctx.targets[0]]),
    },
  },
  'Dust Tornado': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      targets: (ctx) => single(uids(otherSpellTraps(ctx).filter((c) => c.controller !== ctx.player))),
      resolve: (ctx) => ctx.destroy([ctx.targets[0]]),
    },
  },
  'Monster Reborn': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => ctx.hasFreeMonsterSlot(ctx.player),
      targets: (ctx) => single(uids(graveyardMonstersRevivable(ctx))),
      resolve: (ctx) => {
        ctx.specialSummon(ctx.targets[0], ctx.player, 'atk');
      },
    },
  },
  'Fissure': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => ctx.oppMonsters().some(faceUp),
      resolve: (ctx) => {
        const m = ctx.oppMonsters().filter(faceUp).sort((a, b) => ctx.atk(a) - ctx.atk(b))[0];
        if (m) ctx.destroy([m.uid]);
      },
    },
  },
  'Hammer Shot': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => allMonstersOnField(ctx).some((c) => c.position === 'atk'),
      resolve: (ctx) => {
        const m = allMonstersOnField(ctx).filter((c) => c.position === 'atk').sort((a, b) => ctx.atk(b) - ctx.atk(a))[0];
        if (m) ctx.destroy([m.uid]);
      },
    },
  },
  'Smashing Ground': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => ctx.oppMonsters().some(faceUp),
      resolve: (ctx) => {
        const m = ctx.oppMonsters().filter(faceUp).sort((a, b) => ctx.def(b) - ctx.def(a))[0];
        if (m) ctx.destroy([m.uid]);
      },
    },
  },
  'Nobleman of Crossout': {
    activation: {
      timing: 'main',
      targets: (ctx) => single(uids(allMonstersOnField(ctx).filter((c) => c.position === 'facedown'))),
      resolve: (ctx) => ctx.banish(ctx.targets[0]),
    },
  },
  'Tribute to the Doomed': {
    activation: {
      timing: 'main',
      targets: (ctx) => {
        const hand = ctx.state.players[ctx.player].hand.filter((c) => c.uid !== ctx.card.uid);
        const out: number[][] = [];
        for (const h of hand) for (const m of allMonstersOnField(ctx)) out.push([h.uid, m.uid]);
        return out;
      },
      resolve: (ctx) => {
        ctx.discard(ctx.targets[0]);
        ctx.destroy([ctx.targets[1]]);
      },
    },
  },
  'Card Destruction': {
    activation: {
      timing: 'main',
      resolve: (ctx) => {
        for (const p of [0, 1] as const) {
          const hand = ctx.state.players[p].hand.filter((c) => c.uid !== ctx.card.uid);
          for (const c of hand) ctx.discard(c.uid);
          ctx.draw(p, hand.length);
        }
      },
    },
  },
  'Change of Heart': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => ctx.hasFreeMonsterSlot(ctx.player),
      targets: (ctx) => single(uids(ctx.oppMonsters())),
      resolve: (ctx) => {
        ctx.takeControl(ctx.targets[0], ctx.player, true);
      },
    },
  },
  'Book of Moon': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      targets: (ctx) => single(uids(allMonstersOnField(ctx).filter(faceUp))),
      resolve: (ctx) => ctx.flipFaceDown(ctx.targets[0]),
    },
  },
  'Swords of Revealing Light': {
    activation: {
      timing: 'main',
      staysOnField: true,
      resolve: (ctx) => {
        for (const m of ctx.oppMonsters()) if (m.position === 'facedown') ctx.flipFaceUp(m.uid);
        ctx.card.expiresTurn = ctx.state.turn + 5;
        ctx.log('I mostri avversari non possono attaccare per 3 turni.');
      },
    },
  },
  'Axe of Despair': { equip: { atk: 1000 }, activation: equipActivation() },
  'Malevolent Nuzzler': { equip: { atk: 700 }, activation: equipActivation() },
  'Black Pendant': { equip: { atk: 500 }, activation: equipActivation() },
  'Mage Power': { equip: { atk: 500 }, activation: equipActivation() },
  'United We Stand': { equip: { atk: 800 }, activation: equipActivation() },
  'Horn of the Unicorn': { equip: { atk: 700, def: 700 }, activation: equipActivation() },
  'Sword of Dark Destruction': { equip: { atk: 400, def: -200 }, activation: equipActivation() },
  'Book of Secret Arts': { equip: { atk: 300, def: 300 }, activation: equipActivation() },
  'Polymerization': {
    // La fusione è gestita dal motore tramite l'azione fusionSummon; lo script segnala solo che è una carta valida.
    activation: { timing: 'main', canActivate: () => false, resolve: () => {} },
  },

  // ---------------------------------------------------------------- TRAPPOLE
  'Mirror Force': {
    activation: {
      timing: 'response',
      respondsTo: ['attack'],
      canActivate: (ctx) => ctx.oppMonsters().some((c) => c.position === 'atk'),
      resolve: (ctx) => ctx.destroy(uids(ctx.oppMonsters().filter((c) => c.position === 'atk'))),
    },
  },
  'Sakuretsu Armor': {
    activation: {
      timing: 'response',
      respondsTo: ['attack'],
      resolve: (ctx) => {
        const a = attackerOf(ctx);
        if (a) ctx.destroy([a.uid]);
      },
    },
  },
  'Dimensional Prison': {
    activation: {
      timing: 'response',
      respondsTo: ['attack'],
      resolve: (ctx) => {
        const a = attackerOf(ctx);
        if (a) ctx.banish(a.uid);
      },
    },
  },
  'Magic Cylinder': {
    activation: {
      timing: 'response',
      respondsTo: ['attack'],
      resolve: (ctx) => {
        const a = attackerOf(ctx);
        ctx.negateAttack();
        if (a) ctx.damage(a.controller, ctx.atk(a));
      },
    },
  },
  'Negate Attack': {
    activation: {
      timing: 'response',
      respondsTo: ['attack'],
      resolve: (ctx) => {
        ctx.negateAttack();
        ctx.endBattlePhase();
      },
    },
  },
  'Waboku': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      resolve: (ctx) => {
        ctx.state.players[ctx.player].wabokuTurn = ctx.state.turn;
        ctx.log('Waboku: nessun danno da battaglia questo turno.');
      },
    },
  },
  'Trap Hole': {
    activation: {
      timing: 'response',
      respondsTo: ['summon'],
      canActivate: (ctx) => {
        const s = summonedOf(ctx);
        return !!s && ctx.event?.kind === 'summon' && ctx.event.how === 'normal' && s.position !== 'facedown' && ctx.atk(s) >= 1000;
      },
      resolve: (ctx) => {
        const s = summonedOf(ctx);
        if (s) ctx.destroy([s.uid]);
      },
    },
  },
  'Bottomless Trap Hole': {
    activation: {
      timing: 'response',
      respondsTo: ['summon'],
      canActivate: (ctx) => {
        const s = summonedOf(ctx);
        return !!s && s.position !== 'facedown' && ctx.atk(s) >= 1500;
      },
      resolve: (ctx) => {
        const s = summonedOf(ctx);
        if (s) ctx.banish(s.uid);
      },
    },
  },
  'Torrential Tribute': {
    activation: {
      timing: 'response',
      respondsTo: ['summon'],
      resolve: (ctx) => ctx.destroy(uids(allMonstersOnField(ctx))),
    },
  },
  'Call of the Haunted': {
    activation: {
      timing: 'main',
      staysOnField: true,
      canActivate: (ctx) => ctx.hasFreeMonsterSlot(ctx.player),
      targets: (ctx) => single(uids(graveyardMonstersRevivable(ctx).filter((c) => c.owner === ctx.player))),
      resolve: (ctx) => {
        if (ctx.specialSummon(ctx.targets[0], ctx.player, 'atk')) ctx.card.equippedTo = ctx.targets[0];
      },
    },
  },

  // ------------------------------------------------------------------ MOSTRI
  'Man-Eater Bug': {
    triggers: [
      {
        on: 'flip',
        targets: (ctx) => single(uids(allMonstersOnField(ctx).filter((c) => c.uid !== ctx.card.uid))),
        resolve: (ctx) => ctx.destroy([ctx.targets[0]]),
      },
    ],
  },
  'Hane-Hane': {
    triggers: [
      {
        on: 'flip',
        targets: (ctx) => single(uids(allMonstersOnField(ctx))),
        resolve: (ctx) => ctx.returnToHand(ctx.targets[0]),
      },
    ],
  },
  'Penguin Soldier': {
    triggers: [
      {
        on: 'flip',
        targets: (ctx) => single(uids(allMonstersOnField(ctx))),
        resolve: (ctx) => ctx.returnToHand(ctx.targets[0]),
      },
    ],
  },
  'Old Vindictive Magician': {
    triggers: [
      {
        on: 'flip',
        targets: (ctx) => single(uids(ctx.oppMonsters())),
        resolve: (ctx) => ctx.destroy([ctx.targets[0]]),
      },
    ],
  },
  'Marshmallon': {
    cannotBeDestroyedByBattle: true,
    triggers: [
      {
        on: 'attackedFaceDown',
        resolve: (ctx) => {
          const a = attackerOf(ctx);
          if (a) ctx.damage(a.controller, 1000);
        },
      },
    ],
  },
  'Spirit Reaper': { cannotBeDestroyedByBattle: true },
  'Jinzo': { negatesTraps: true },
  'Sangan': {
    triggers: [
      {
        on: 'toGrave',
        resolve: (ctx) => {
          const opts = ctx.state.players[ctx.player].deck.filter((c) => isMonster(ctx.data(c.uid)) && (ctx.data(c.uid).atk ?? 0) <= 1500).map((c) => c.uid);
          if (opts.length) ctx.ask({ prompt: 'Sangan: aggiungi alla mano un mostro con ATK ≤ 1500', options: opts, min: 1, max: 1, resolve: { kind: 'addToHand', shuffleDeck: true } });
        },
      },
    ],
  },
  'Witch of the Black Forest': {
    triggers: [
      {
        on: 'toGrave',
        resolve: (ctx) => {
          const opts = ctx.state.players[ctx.player].deck.filter((c) => isMonster(ctx.data(c.uid)) && (ctx.data(c.uid).def ?? 0) <= 1500).map((c) => c.uid);
          if (opts.length) ctx.ask({ prompt: 'Strega della Foresta Nera: aggiungi alla mano un mostro con DEF ≤ 1500', options: opts, min: 1, max: 1, resolve: { kind: 'addToHand', shuffleDeck: true } });
        },
      },
    ],
  },
  'Mystic Tomato': { triggers: [recruiter('DARK')] },
  'Giant Rat': { triggers: [recruiter('EARTH')] },
  'Shining Angel': { triggers: [recruiter('LIGHT')] },
  'UFO Turtle': { triggers: [recruiter('FIRE')] },
  'Mother Grizzly': { triggers: [recruiter('WATER')] },
  'Flying Kamakiri #1': { triggers: [recruiter('WIND')] },
  'Marauding Captain': {
    triggers: [
      {
        on: 'normalSummon',
        resolve: (ctx) => {
          if (!ctx.hasFreeMonsterSlot(ctx.player)) return;
          const opts = ctx.state.players[ctx.player].hand.filter((c) => isMonster(ctx.data(c.uid)) && (ctx.data(c.uid).level ?? 0) <= 4 && !isExtraDeckMonster(ctx.data(c.uid))).map((c) => c.uid);
          if (opts.length) ctx.ask({ prompt: 'Capitano Predone: evoca specialmente un mostro di livello ≤ 4 dalla mano', options: opts, min: 0, max: 1, resolve: { kind: 'specialSummon', position: 'atk' } });
        },
      },
    ],
  },
  'Exiled Force': {
    activation: {
      timing: 'main',
      tributeSelf: true,
      targets: (ctx) => single(uids(allMonstersOnField(ctx).filter((c) => c.uid !== ctx.card.uid))),
      resolve: (ctx) => ctx.destroy([ctx.targets[0]]),
    },
  },
  'Goblin Attack Force': {
    triggers: [
      {
        on: 'afterAttack',
        resolve: (ctx) => {
          if (ctx.card.position === 'atk') {
            ctx.card.position = 'def';
            ctx.card.positionChangedTurn = ctx.state.turn + 2;
          }
        },
      },
    ],
  },
  'Junk Synchron': {
    triggers: [
      {
        on: 'normalSummon',
        resolve: (ctx) => {
          if (!ctx.hasFreeMonsterSlot(ctx.player)) return;
          const opts = ctx.state.players[ctx.player].graveyard.filter((c) => isMonster(ctx.data(c.uid)) && (ctx.data(c.uid).level ?? 0) <= 2 && !isExtraDeckMonster(ctx.data(c.uid))).map((c) => c.uid);
          if (opts.length) ctx.ask({ prompt: 'Junk Synchron: evoca specialmente un mostro di livello ≤ 2 dal cimitero', options: opts, min: 0, max: 1, resolve: { kind: 'specialSummon', position: 'def' } });
        },
      },
    ],
  },
  'Junk Warrior': {
    triggers: [
      {
        on: 'summon',
        resolve: (ctx) => {
          const bonus = ctx.myMonsters().filter((c) => c.uid !== ctx.card.uid && faceUp(c) && (ctx.data(c.uid).level ?? 0) <= 2).reduce((s, c) => s + ctx.atk(c), 0);
          if (bonus > 0) {
            ctx.card.atkMod = (ctx.card.atkMod ?? 0) + bonus;
            ctx.log(`Junk Warrior guadagna ${bonus} ATK.`);
          }
        },
      },
    ],
  },
  'Goyo Guardian': {
    triggers: [
      {
        on: 'destroysByBattle',
        targets: (ctx) => {
          // Il mostro appena distrutto è l'ultimo entrato nel cimitero avversario.
          const gy = ctx.state.players[ctx.opponent].graveyard;
          const last = gy[gy.length - 1];
          return last && ctx.hasFreeMonsterSlot(ctx.player) && isMonster(ctx.data(last.uid)) ? [[last.uid]] : [];
        },
        resolve: (ctx) => {
          ctx.specialSummon(ctx.targets[0], ctx.player, 'def');
        },
      },
    ],
  },
  'Black Rose Dragon': {
    triggers: [
      {
        on: 'summon',
        resolve: (ctx) => {
          const all = [...allMonstersOnField(ctx), ...allSpellTrapsOnField(ctx)].map((c) => c.uid);
          ctx.destroy(all);
        },
      },
    ],
  },
};

function equipActivation(): CardScript['activation'] {
  return {
    timing: 'main',
    staysOnField: true,
    targets: (ctx) => single(uids([...ctx.myMonsters(), ...ctx.oppMonsters()].filter(faceUp))),
    resolve: (ctx) => {
      const target = ctx.get(ctx.targets[0]);
      const script = scriptFor(ctx.data(ctx.card.uid));
      if (!target || !script?.equip) return;
      ctx.card.equippedTo = target.uid;
      target.atkMod = (target.atkMod ?? 0) + (script.equip.atk ?? 0);
      target.defMod = (target.defMod ?? 0) + (script.equip.def ?? 0);
      ctx.log(`${ctx.data(ctx.card.uid).name} equipaggiata a ${ctx.data(target.uid).name}.`);
    },
  };
}

/** Mostro "reclutatore": se distrutto in battaglia, evoca dal deck un mostro dell'attributo dato con ATK ≤ 1500. */
function recruiter(attribute: string): NonNullable<CardScript['triggers']>[number] {
  return {
    on: 'destroyedByBattle',
    resolve: (ctx) => {
      if (!ctx.hasFreeMonsterSlot(ctx.player)) return;
      const opts = ctx.state.players[ctx.player].deck.filter((c) => {
        const d = ctx.data(c.uid);
        return isMonster(d) && d.attribute === attribute && (d.atk ?? 0) <= 1500;
      }).map((c) => c.uid);
      if (opts.length) ctx.ask({ prompt: `${ctx.data(ctx.card.uid).name}: evoca specialmente dal deck un mostro ${attribute} con ATK ≤ 1500`, options: opts, min: 0, max: 1, resolve: { kind: 'specialSummon', position: 'atk', shuffleDeck: true } });
    },
  };
}

const autoCache = new Map<number, CardScript | null>();

/**
 * Script di una carta: prima la libreria scritta a mano, poi l'interprete
 * automatico del testo. Le carte senza script giocano come "vaniglia".
 */
export function scriptFor(data: CardData | undefined): CardScript | undefined {
  if (!data) return undefined;
  const manual = LIBRARY[data.name];
  if (manual) return manual;
  if (!autoCache.has(data.id)) autoCache.set(data.id, autoScript(data));
  return autoCache.get(data.id) ?? undefined;
}

export function clearAutoCache(): void {
  autoCache.clear();
}

/** Una carta magia/trappola è "giocabile" solo se il suo effetto è implementato. */
export function isEffectImplemented(data: CardData): boolean {
  const s = scriptFor(data);
  if (!s) return false;
  if (s.unparsed && s.unparsed.length > 0) return false;
  if (data.type === 'Spell Card' && data.race === 'Ritual') return true;
  if (data.type === 'Spell Card' || data.type === 'Trap Card') return !!s.activation;
  return true;
}
