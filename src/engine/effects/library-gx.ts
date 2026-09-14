import type { CardScript, EffectContext } from './types';
import type { CardInstance } from '../types';
import { fusionMaterials, isFusion, isMonster, isSpell, isNormalMonster } from '../cards';
import { single, faceUp, uids, allMonstersOnField, allSpellTrapsOnField, otherSpellTraps, attackerOf, summonedOf } from './helpers';
import { OJAMA_TOKEN_ID, SHEEP_TOKEN_ID } from '../tokens';

// ---------------------------------------------------------------------------
// Carte chiave dell'era GX (2004–2008) scritte a mano: quelle il cui testo va
// oltre le formule riconosciute dall'interprete automatico.
// ---------------------------------------------------------------------------

const lastMonsterInGY = (ctx: EffectContext, p: 0 | 1): CardInstance | null => {
  const gy = ctx.state.players[p].graveyard;
  for (let i = gy.length - 1; i >= 0; i--) if (isMonster(ctx.data(gy[i].uid))) return gy[i];
  return null;
};

const myGY = (ctx: EffectContext) => ctx.state.players[ctx.player].graveyard;
const myHand = (ctx: EffectContext) => ctx.state.players[ctx.player].hand.filter((c) => c.uid !== ctx.card.uid);
const oppHand = (ctx: EffectContext) => ctx.state.players[ctx.opponent].hand;

/** Materiali di fusione presi da un pool (terreno/cimitero): combinazioni [fusioneUid, ...materiali]. */
function fusionCombosFrom(ctx: EffectContext, pool: CardInstance[], restrict: (fusionName: string, d: import('../types').CardData) => boolean): number[][] {
  const out: number[][] = [];
  if (!ctx.hasFreeMonsterSlot(ctx.player) && !pool.some((c) => c.position !== undefined)) return out;
  for (const f of ctx.state.players[ctx.player].extraDeck) {
    const fd = ctx.data(f.uid);
    if (!isFusion(fd) || !restrict(fd.name, fd)) continue;
    const mats = fusionMaterials(fd);
    if (!mats) continue;
    const used = new Set<number>();
    const acc: number[] = [];
    const rec = (i: number): boolean => {
      if (i === mats.length) return true;
      for (const c of pool) {
        if (used.has(c.uid) || ctx.data(c.uid).name !== mats[i]) continue;
        used.add(c.uid);
        acc.push(c.uid);
        if (rec(i + 1)) return true;
        acc.pop();
        used.delete(c.uid);
      }
      return false;
    };
    if (rec(0)) out.push([f.uid, ...acc]);
  }
  return out;
}

function banishFusion(ctx: EffectContext): void {
  const [fusionUid, ...mats] = ctx.targets;
  for (const m of mats) ctx.banish(m);
  ctx.specialSummon(fusionUid, ctx.player, 'atk');
  const f = ctx.get(fusionUid);
  if (f) f.properlySummoned = true;
}

export const GX_LIBRARY: Record<string, CardScript> = {
  // ------------------------------------------------------------ segnalini
  'Sheep Token': { cannotBeTributed: true },
  'Ojama Token': { cannotBeTributed: true },

  // ------------------------------------------------------------ Elemental HERO
  'Elemental HERO Flame Wingman': {
    cannotSpecialSummon: true,
    triggers: [
      {
        on: 'destroysByBattle',
        resolve: (ctx) => {
          const m = lastMonsterInGY(ctx, ctx.opponent);
          if (m) ctx.damage(ctx.opponent, ctx.data(m.uid).atk ?? 0);
        },
      },
    ],
  },
  'Elemental HERO Shining Flare Wingman': {
    cannotSpecialSummon: true,
    aura: (ctx, m) => (m.uid === ctx.card.uid ? { atk: 300 * myGY(ctx).filter((c) => ctx.data(c.uid).name.includes('Elemental HERO')).length } : null),
    triggers: [
      {
        on: 'destroysByBattle',
        resolve: (ctx) => {
          const m = lastMonsterInGY(ctx, ctx.opponent);
          if (m) ctx.damage(ctx.opponent, ctx.data(m.uid).atk ?? 0);
        },
      },
    ],
  },
  'Elemental HERO Thunder Giant': {
    cannotSpecialSummon: true,
    activation: {
      timing: 'main',
      oncePerTurn: true,
      targets: (ctx) => {
        const out: number[][] = [];
        for (const h of myHand(ctx)) for (const m of allMonstersOnField(ctx).filter((c) => faceUp(c) && c.uid !== ctx.card.uid && (ctx.data(c.uid).atk ?? 0) < ctx.atk(ctx.card))) out.push([h.uid, m.uid]);
        return out;
      },
      resolve: (ctx) => {
        ctx.discard(ctx.targets[0]);
        ctx.destroy([ctx.targets[1]]);
      },
    },
  },
  'Elemental HERO Wildedge': {
    cannotSpecialSummon: true,
    extraAttack: true,
    approx: 'Può attaccare ogni mostro avversario: implementato come due attacchi per turno.',
  },
  'Elemental HERO Stratos': {
    triggers: [
      {
        on: 'summon',
        targets: (ctx) => {
          const heroes = ctx.myMonsters().filter((c) => c.uid !== ctx.card.uid && faceUp(c) && ctx.data(c.uid).name.includes('HERO')).length;
          const out: number[][] = [];
          const searchable = ctx.state.players[ctx.player].deck.some((c) => isMonster(ctx.data(c.uid)) && ctx.data(c.uid).name.includes('HERO'));
          if (searchable) out.push([]);
          const sts = otherSpellTraps(ctx);
          for (let n = 1; n <= Math.min(heroes, sts.length, 2); n++) {
            for (let i = 0; i < sts.length; i++) {
              if (n === 1) out.push([sts[i].uid]);
              else for (let j = i + 1; j < sts.length; j++) out.push([sts[i].uid, sts[j].uid]);
            }
          }
          return out;
        },
        resolve: (ctx) => {
          if (ctx.targets.length === 0) {
            const opts = ctx.state.players[ctx.player].deck.filter((c) => isMonster(ctx.data(c.uid)) && ctx.data(c.uid).name.includes('HERO')).map((c) => c.uid);
            ctx.ask({ prompt: 'Stratos: aggiungi un mostro "HERO" alla mano', options: opts, min: 1, max: 1, resolve: { kind: 'addToHand', shuffleDeck: true } });
          } else ctx.destroy(ctx.targets);
        },
      },
    ],
  },
  'Elemental HERO Prisma': {
    activation: {
      timing: 'main',
      oncePerTurn: true,
      targets: (ctx) => {
        // Manda al cimitero dal deck un materiale elencato su una fusione dell'Extra Deck.
        const names = new Set<string>();
        for (const f of ctx.state.players[ctx.player].extraDeck) for (const n of fusionMaterials(ctx.data(f.uid)) ?? []) names.add(n);
        return single(uids(ctx.state.players[ctx.player].deck.filter((c) => names.has(ctx.data(c.uid).name))));
      },
      resolve: (ctx) => {
        ctx.toGraveyard(ctx.targets[0]);
        ctx.shuffleDeck(ctx.player);
      },
    },
    approx: 'Il nome non cambia: manda solo il materiale al cimitero.',
  },
  'Miracle Fusion': {
    activation: {
      timing: 'main',
      targets: (ctx) => fusionCombosFrom(ctx, [...ctx.myMonsters(), ...myGY(ctx).filter((c) => isMonster(ctx.data(c.uid)))], (n) => n.includes('Elemental HERO')),
      resolve: banishFusion,
    },
  },
  'Overload Fusion': {
    activation: {
      timing: 'main',
      targets: (ctx) => fusionCombosFrom(ctx, [...ctx.myMonsters(), ...myGY(ctx).filter((c) => isMonster(ctx.data(c.uid)))], (_n, d) => d.attribute === 'DARK' && d.race === 'Machine'),
      resolve: banishFusion,
    },
  },
  'Metamorphosis': {
    activation: {
      timing: 'main',
      targets: (ctx) => {
        const out: number[][] = [];
        for (const m of ctx.myMonsters()) {
          const lvl = ctx.data(m.uid).level ?? 0;
          for (const f of ctx.state.players[ctx.player].extraDeck) if (isFusion(ctx.data(f.uid)) && (ctx.data(f.uid).level ?? 0) === lvl) out.push([m.uid, f.uid]);
        }
        return out;
      },
      resolve: (ctx) => {
        ctx.toGraveyard(ctx.targets[0]);
        ctx.specialSummon(ctx.targets[1], ctx.player, 'atk');
      },
    },
  },

  // ------------------------------------------------------------ Monarchi
  'Thestalos the Firestorm Monarch': {
    triggers: [
      {
        on: 'tributeSummon',
        resolve: (ctx) => {
          const hand = oppHand(ctx);
          if (hand.length === 0) return;
          const c = hand[Math.floor(ctx.random() * hand.length)];
          const d = ctx.data(c.uid);
          ctx.discard(c.uid);
          if (isMonster(d)) ctx.damage(ctx.opponent, (d.level ?? 0) * 100);
        },
      },
    ],
  },
  'Caius the Shadow Monarch': {
    triggers: [
      {
        on: 'tributeSummon',
        targets: (ctx) => single(uids([...allMonstersOnField(ctx).filter((c) => c.uid !== ctx.card.uid), ...allSpellTrapsOnField(ctx)])),
        resolve: (ctx) => {
          const d = ctx.data(ctx.targets[0]);
          const dark = isMonster(d) && d.attribute === 'DARK';
          ctx.banish(ctx.targets[0]);
          if (dark) ctx.damage(ctx.opponent, 1000);
        },
      },
    ],
  },
  'Kuraz the Light Monarch': {
    triggers: [
      {
        on: 'summon',
        targets: (ctx) => single(uids([...allMonstersOnField(ctx).filter((c) => c.uid !== ctx.card.uid), ...allSpellTrapsOnField(ctx)])),
        resolve: (ctx) => {
          const owner = ctx.get(ctx.targets[0])?.controller;
          ctx.destroy([ctx.targets[0]]);
          if (owner !== undefined) ctx.draw(owner, 1);
          ctx.card.attacksThisTurn = 99;
        },
      },
    ],
    approx: 'Distrugge 1 carta (non fino a 2).',
  },

  // ------------------------------------------------------------ Mostri vari
  'Breaker the Magical Warrior': {
    aura: (ctx, m) => (m.uid === ctx.card.uid && (ctx.card.counters ?? 0) > 0 ? { atk: 300 * (ctx.card.counters ?? 0) } : null),
    triggers: [{ on: 'normalSummon', resolve: (ctx) => { ctx.card.counters = 1; ctx.log('Breaker riceve un Segnalino Magia.'); } }],
    activation: {
      timing: 'main',
      canActivate: (ctx) => (ctx.card.counters ?? 0) > 0,
      targets: (ctx) => single(uids(otherSpellTraps(ctx))),
      resolve: (ctx) => {
        ctx.card.counters = (ctx.card.counters ?? 1) - 1;
        ctx.destroy([ctx.targets[0]]);
      },
    },
  },
  'Chaos Sorcerer': {
    cannotNormalSummon: true,
    cannotSpecialSummonFromGY: true,
    activation: chaosSummonOrBanish(),
  },
  'Black Luster Soldier - Envoy of the Beginning': {
    cannotNormalSummon: true,
    cannotSpecialSummonFromGY: true,
    activation: chaosSummonOrBanish(),
    triggers: [{ on: 'destroysByBattle', resolve: (ctx) => { if ((ctx.card.attacksThisTurn ?? 0) === 1) { ctx.card.attacksThisTurn = 0; ctx.log('Il Soldato può attaccare di nuovo.'); } } }],
  },
  'Dark Magician of Chaos': {
    banishInsteadOfGY: true,
    triggers: [
      {
        on: 'endPhase',
        resolve: (ctx) => {
          if (ctx.card.placedTurn !== ctx.state.turn) return;
          const opts = myGY(ctx).filter((c) => isSpell(ctx.data(c.uid))).map((c) => c.uid);
          if (opts.length) ctx.ask({ prompt: 'Mago Nero del Caos: aggiungi una magia dal cimitero', options: opts, min: 0, max: 1, resolve: { kind: 'addToHand' } });
        },
      },
      { on: 'destroysByBattle', resolve: (ctx) => { const m = lastMonsterInGY(ctx, ctx.opponent); if (m) ctx.banish(m.uid); } },
    ],
  },
  'Dark Armed Dragon': {
    cannotNormalSummon: true,
    cannotSpecialSummonFromGY: true,
    activation: {
      timing: 'main',
      fromHand: true,
      selfSummon: true,
      canActivate: (ctx) => {
        const loc = ctx.get(ctx.card.uid);
        if (!loc || loc.position !== undefined) return false;
        return myGY(ctx).filter((c) => isMonster(ctx.data(c.uid)) && ctx.data(c.uid).attribute === 'DARK').length === 3 && ctx.hasFreeMonsterSlot(ctx.player);
      },
      resolve: (ctx) => { ctx.specialSummon(ctx.card.uid, ctx.player, 'atk'); },
    },
    triggers: [],
  },
  'Judgment Dragon': {
    cannotNormalSummon: true,
    cannotSpecialSummonFromGY: true,
    activation: {
      timing: 'main',
      fromHand: true,
      selfSummon: true,
      canActivate: (ctx) => {
        const loc = ctx.get(ctx.card.uid);
        if (!loc || loc.position !== undefined) return false;
        const names = new Set(myGY(ctx).filter((c) => isMonster(ctx.data(c.uid)) && ctx.data(c.uid).name.includes('Lightsworn')).map((c) => ctx.data(c.uid).name));
        return names.size >= 4 && ctx.hasFreeMonsterSlot(ctx.player);
      },
      resolve: (ctx) => { ctx.specialSummon(ctx.card.uid, ctx.player, 'atk'); },
    },
    triggers: [{ on: 'endPhase', resolve: (ctx) => ctx.mill(ctx.player, 4) }],
    approx: "L'effetto \"paga 1000 LP: distruggi tutte le altre carte\" non è attivabile (una sola attivazione per carta).",
  },
  'Card Trooper': {
    activation: {
      timing: 'main',
      oncePerTurn: true,
      canActivate: (ctx) => ctx.state.players[ctx.player].deck.length >= 3,
      resolve: (ctx) => {
        ctx.mill(ctx.player, 3);
        ctx.tempBoost(ctx.card.uid, 1500);
      },
    },
    triggers: [{ on: 'toGrave', resolve: (ctx) => ctx.draw(ctx.player, 1) }],
    approx: 'Manda sempre 3 carte (non 1-3); pesca anche se non distrutto.',
  },
  'Morphing Jar': {
    triggers: [
      {
        on: 'flip',
        resolve: (ctx) => {
          for (const p of [0, 1] as const) {
            for (const c of [...ctx.state.players[p].hand]) ctx.discard(c.uid);
            ctx.draw(p, 5);
          }
        },
      },
    ],
  },
  'Cyber Jar': {
    triggers: [
      {
        on: 'flip',
        resolve: (ctx) => {
          ctx.destroy(uids(allMonstersOnField(ctx)));
          for (const p of [0, 1] as const) {
            const top = ctx.state.players[p].deck.slice(0, 5);
            for (const c of top) {
              const d = ctx.data(c.uid);
              if (isMonster(d) && (d.level ?? 0) <= 4 && ctx.hasFreeMonsterSlot(p)) ctx.specialSummon(c.uid, p, 'atk');
              else ctx.addToHand(c.uid);
            }
          }
        },
      },
    ],
    approx: 'I mostri rivelati vengono evocati in attacco (non si può scegliere coperto).',
  },
  'Ryko, Lightsworn Hunter': {
    triggers: [
      {
        on: 'flip',
        resolve: (ctx) => {
          const opts = [...allMonstersOnField(ctx).filter((c) => c.uid !== ctx.card.uid), ...allSpellTrapsOnField(ctx)].map((c) => c.uid);
          if (opts.length) ctx.ask({ prompt: 'Ryko: distruggi 1 carta (facoltativo)', options: opts, min: 0, max: 1, resolve: { kind: 'destroy' } });
          ctx.mill(ctx.player, 3);
        },
      },
    ],
  },
  'Necro Gardna': {
    activation: {
      timing: 'response',
      respondsTo: ['attack'],
      fromGraveyard: true,
      resolve: (ctx) => ctx.negateAttack(),
    },
  },
  'Kuriboh': {
    activation: {
      timing: 'response',
      respondsTo: ['attack'],
      fromHand: true,
      resolve: (ctx) => {
        ctx.state.players[ctx.player].noBattleDamageTurn = ctx.state.turn;
        ctx.log('Kuriboh: nessun danno da battaglia in questo turno.');
      },
    },
    approx: 'Annulla i danni da battaglia per tutto il turno, non solo per quella battaglia.',
  },
  'Winged Kuriboh': {
    triggers: [{ on: 'toGrave', resolve: (ctx) => { ctx.state.players[ctx.player].noBattleDamageTurn = ctx.state.turn; ctx.log('Kuriboh Alato: nessun danno da battaglia per il resto del turno.'); } }],
  },
  'Honest': {
    activation: {
      timing: 'response',
      respondsTo: ['attack'],
      fromHand: true,
      canActivate: (ctx) => {
        if (ctx.event?.kind !== 'attack' || ctx.event.targetUid === null) return false;
        const t = ctx.get(ctx.event.targetUid);
        return !!t && t.controller === ctx.player && faceUp(t) && ctx.data(t.uid).attribute === 'LIGHT';
      },
      resolve: (ctx) => {
        if (ctx.event?.kind !== 'attack' || ctx.event.targetUid === null) return;
        const a = attackerOf(ctx);
        if (a) ctx.tempBoost(ctx.event.targetUid, ctx.atk(a));
      },
    },
    approx: 'Usabile solo quando un tuo mostro LUCE viene attaccato.',
  },
  'Krebons': {
    activation: {
      timing: 'response',
      respondsTo: ['attack'],
      canActivate: (ctx) => ctx.event?.kind === 'attack' && ctx.event.targetUid === ctx.card.uid && ctx.state.players[ctx.player].lp > 800,
      resolve: (ctx) => {
        ctx.payLp(ctx.player, 800);
        ctx.negateAttack();
      },
    },
  },
  'Destiny HERO - Disk Commander': {
    cannotSpecialSummonFromGY: false,
    triggers: [{ on: 'specialSummon', resolve: (ctx) => { if (ctx.card.owner === ctx.player) ctx.draw(ctx.player, 2); } }],
    approx: 'Pesca 2 a ogni evocazione speciale (non solo dal cimitero, senza limite di una per duello).',
  },
  'Spirit Reaper': {
    cannotBeDestroyedByBattle: true,
    triggers: [
      {
        on: 'inflictsBattleDamage',
        resolve: (ctx) => {
          if (ctx.event?.kind !== 'attack' || ctx.event.targetUid !== null) return;
          const hand = oppHand(ctx);
          if (hand.length) ctx.discard(hand[Math.floor(ctx.random() * hand.length)].uid);
        },
      },
    ],
  },
  'Marshmallon': {
    cannotBeDestroyedByBattle: true,
    triggers: [{ on: 'attackedFaceDown', resolve: (ctx) => { const a = attackerOf(ctx); if (a) ctx.damage(a.controller, 1000); } }],
  },
  'Colossal Fighter': {
    aura: (ctx, m) => (m.uid === ctx.card.uid ? { atk: 100 * [...ctx.state.players[0].graveyard, ...ctx.state.players[1].graveyard].filter((c) => ctx.data(c.uid).race === 'Warrior').length } : null),
    triggers: [
      {
        on: 'destroyedByBattle',
        targets: (ctx) => (ctx.hasFreeMonsterSlot(ctx.player) ? single(uids([...ctx.state.players[0].graveyard, ...ctx.state.players[1].graveyard].filter((c) => c.uid !== ctx.card.uid && isMonster(ctx.data(c.uid)) && ctx.data(c.uid).race === 'Warrior'))) : []),
        resolve: (ctx) => { ctx.specialSummon(ctx.targets[0], ctx.player, 'atk'); },
      },
    ],
  },
  'Thought Ruler Archfiend': {
    triggers: [{ on: 'destroysByBattle', resolve: (ctx) => { const m = lastMonsterInGY(ctx, ctx.opponent); if (m) ctx.gainLp(ctx.player, ctx.data(m.uid).atk ?? 0); } }],
  },
  'Red Dragon Archfiend': {
    triggers: [
      {
        on: 'afterAttack',
        resolve: (ctx) => {
          // Semplificazione: dopo l'attacco a un mostro in difesa, distrugge tutti i mostri in difesa avversari.
          if (ctx.event?.kind === 'attack') return;
          const defs = ctx.oppMonsters().filter((c) => c.position === 'def');
          if (defs.length) ctx.destroy(uids(defs));
        },
      },
    ],
    approx: 'Distrugge i mostri in difesa avversari dopo ogni attacco; non distrugge i propri mostri che non hanno attaccato.',
  },
  'Goblin Zombie': {
    triggers: [
      { on: 'inflictsBattleDamage', resolve: (ctx) => ctx.mill(ctx.opponent, 1) },
      {
        on: 'toGrave',
        resolve: (ctx) => {
          const opts = ctx.state.players[ctx.player].deck.filter((c) => ctx.data(c.uid).race === 'Zombie' && (ctx.data(c.uid).def ?? 0) <= 1200).map((c) => c.uid);
          if (opts.length) ctx.ask({ prompt: 'Goblin Zombie: aggiungi uno Zombie con DEF ≤ 1200', options: opts, min: 1, max: 1, resolve: { kind: 'addToHand', shuffleDeck: true } });
        },
      },
    ],
  },
  'Zombie Master': {
    activation: {
      timing: 'main',
      oncePerTurn: true,
      canActivate: (ctx) => ctx.hasFreeMonsterSlot(ctx.player),
      targets: (ctx) => {
        const out: number[][] = [];
        const zombies = [...ctx.state.players[0].graveyard, ...ctx.state.players[1].graveyard].filter((c) => isMonster(ctx.data(c.uid)) && ctx.data(c.uid).race === 'Zombie' && (ctx.data(c.uid).level ?? 0) <= 4);
        for (const h of myHand(ctx).filter((c) => isMonster(ctx.data(c.uid)))) for (const z of zombies) out.push([h.uid, z.uid]);
        return out;
      },
      resolve: (ctx) => {
        ctx.discard(ctx.targets[0]);
        ctx.specialSummon(ctx.targets[1], ctx.player, 'atk');
      },
    },
  },
  'Prometheus, King of the Shadows': {
    triggers: [
      {
        on: 'normalSummon',
        resolve: (ctx) => {
          const darks = myGY(ctx).filter((c) => isMonster(ctx.data(c.uid)) && ctx.data(c.uid).attribute === 'DARK');
          for (const d of darks) ctx.banish(d.uid);
          if (darks.length) ctx.tempBoost(ctx.card.uid, 400 * darks.length);
        },
      },
    ],
    approx: 'Bandisce tutti i mostri OSCURITÀ del cimitero (non una quantità a scelta).',
  },
  'Exiled Force': {
    activation: {
      timing: 'main',
      tributeSelf: true,
      targets: (ctx) => single(uids(allMonstersOnField(ctx).filter((c) => c.uid !== ctx.card.uid))),
      resolve: (ctx) => ctx.destroy([ctx.targets[0]]),
    },
  },
  'Golden Flying Fish': {
    activation: {
      timing: 'main',
      targets: (ctx) => {
        const out: number[][] = [];
        for (const f of ctx.myMonsters().filter((c) => c.uid !== ctx.card.uid && ctx.data(c.uid).race === 'Fish')) {
          for (const t of [...allMonstersOnField(ctx), ...allSpellTrapsOnField(ctx)].filter((c) => c.uid !== f.uid && c.uid !== ctx.card.uid)) out.push([f.uid, t.uid]);
        }
        return out;
      },
      resolve: (ctx) => {
        ctx.toGraveyard(ctx.targets[0]);
        ctx.destroy([ctx.targets[1]]);
      },
    },
  },
  'Injection Fairy Lily': {
    activation: {
      timing: 'response',
      respondsTo: ['attack'],
      canActivate: (ctx) => ctx.event?.kind === 'attack' && ctx.event.targetUid === ctx.card.uid && ctx.state.players[ctx.player].lp > 2000,
      resolve: (ctx) => {
        ctx.payLp(ctx.player, 2000);
        ctx.tempBoost(ctx.card.uid, 3000);
      },
    },
    approx: 'Usabile solo in difesa (quando viene attaccata); il bonus dura fino alla End Phase.',
  },
  'Giant Orc': {
    triggers: [{ on: 'afterAttack', resolve: (ctx) => { if (ctx.card.position === 'atk') { ctx.card.position = 'def'; ctx.card.positionChangedTurn = ctx.state.turn + 2; } } }],
  },
  'Ancient Gear Golem': { cannotSpecialSummon: true, piercing: true },
  'Cyber Twin Dragon': { cannotSpecialSummon: true, extraAttack: true },
  'Cyber End Dragon': { cannotSpecialSummon: true, piercing: true },
  'Proto-Cyber Dragon': { approx: 'Il nome non diventa "Cyber Dragon" (non è materiale di fusione).' },

  // ------------------------------------------------------------ Magie
  'Premature Burial': {
    linkedMonster: true,
    activation: {
      timing: 'main',
      staysOnField: true,
      canActivate: (ctx) => ctx.state.players[ctx.player].lp > 800 && ctx.hasFreeMonsterSlot(ctx.player),
      targets: (ctx) => single(uids(myGY(ctx).filter((c) => isMonster(ctx.data(c.uid)) && !(isFusion(ctx.data(c.uid)) && !c.properlySummoned)))),
      resolve: (ctx) => {
        ctx.payLp(ctx.player, 800);
        if (ctx.specialSummon(ctx.targets[0], ctx.player, 'atk')) ctx.card.equippedTo = ctx.targets[0];
      },
    },
  },
  'Snatch Steal': {
    equip: {},
    activation: {
      timing: 'main',
      staysOnField: true,
      canActivate: (ctx) => ctx.hasFreeMonsterSlot(ctx.player),
      targets: (ctx) => single(uids(ctx.oppMonsters().filter(faceUp))),
      resolve: (ctx) => {
        if (ctx.takeControl(ctx.targets[0], ctx.player, false)) ctx.card.equippedTo = ctx.targets[0];
      },
    },
    triggers: [{ on: 'standbyAny', resolve: (ctx) => { if (ctx.state.turnPlayer !== ctx.player) ctx.gainLp(ctx.opponent, 1000); } }],
    approx: 'Se la carta lascia il terreno, il mostro resta sotto il tuo controllo.',
  },
  'Enemy Controller': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      targets: (ctx) => {
        const out: number[][] = [];
        const opp = ctx.oppMonsters().filter(faceUp);
        for (const o of opp) out.push([o.uid]);
        if (ctx.hasFreeMonsterSlot(ctx.player) || ctx.myMonsters().length > 0) for (const m of ctx.myMonsters()) for (const o of opp) out.push([m.uid, o.uid]);
        return out;
      },
      resolve: (ctx) => {
        if (ctx.targets.length === 1) {
          const t = ctx.get(ctx.targets[0]);
          if (!t) return;
          if (t.position === 'atk') ctx.changeToDefense(t.uid);
          else if (t.position === 'def') { t.position = 'atk'; t.positionChangedTurn = ctx.state.turn; }
        } else {
          ctx.toGraveyard(ctx.targets[0]);
          ctx.takeControl(ctx.targets[1], ctx.player, true);
        }
      },
    },
  },
  'Allure of Darkness': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => ctx.state.players[ctx.player].deck.length >= 2,
      resolve: (ctx) => {
        ctx.draw(ctx.player, 2);
        const darks = myHand(ctx).filter((c) => isMonster(ctx.data(c.uid)) && ctx.data(c.uid).attribute === 'DARK');
        if (darks.length) ctx.ask({ prompt: 'Fascino delle Tenebre: bandisci 1 mostro OSCURITÀ dalla mano', options: uids(darks), min: 1, max: 1, resolve: { kind: 'banish' } });
        else for (const c of myHand(ctx)) ctx.discard(c.uid);
      },
    },
  },
  'Reload': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      resolve: (ctx) => {
        const hand = myHand(ctx);
        for (const c of hand) ctx.toDeck(c.uid);
        ctx.draw(ctx.player, hand.length);
      },
    },
  },
  'Hand Destruction': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      canActivate: (ctx) => myHand(ctx).length >= 2 && oppHand(ctx).length >= 2,
      resolve: (ctx) => {
        for (const p of [0, 1] as const) {
          const hand = ctx.state.players[p].hand.filter((c) => c.uid !== ctx.card.uid).map((c) => c.uid);
          ctx.ask({ player: p, prompt: 'Distruzione della Mano: manda 2 carte al cimitero', options: hand, min: 2, max: 2, resolve: { kind: 'discard' } });
          ctx.draw(p, 2);
        }
      },
    },
    approx: 'Le pescate avvengono prima dello scarto.',
  },
  'Scapegoat': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      canActivate: (ctx) => ctx.hasFreeMonsterSlot(ctx.player),
      resolve: (ctx) => {
        for (let i = 0; i < 4; i++) ctx.summonToken(ctx.player, SHEEP_TOKEN_ID, 'def');
      },
    },
    approx: 'Non impedisce di evocare altri mostri nel turno.',
  },
  'Ojama Trio': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      canActivate: (ctx) => ctx.hasFreeMonsterSlot(ctx.opponent),
      resolve: (ctx) => {
        for (let i = 0; i < 3; i++) ctx.summonToken(ctx.opponent, OJAMA_TOKEN_ID, 'def');
      },
    },
  },
  'Level Limit - Area B': {
    forceDefense: (ctx, m) => m.position !== 'facedown' && (ctx.data(m.uid).level ?? 0) >= 4,
    activation: { timing: 'main', staysOnField: true, resolve: () => {} },
  },
  'Messenger of Peace': {
    attackRestriction: (ctx, m) => ctx.atk(m) >= 1500,
    activation: { timing: 'main', staysOnField: true, resolve: () => {} },
    triggers: [{ on: 'standby', resolve: (ctx) => { if (ctx.state.players[ctx.player].lp > 100) ctx.payLp(ctx.player, 100); else ctx.destroy([ctx.card.uid]); } }],
    approx: 'Il mantenimento di 100 LP viene pagato automaticamente.',
  },
  'Skill Drain': {
    negatesMonsterEffects: true,
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      staysOnField: true,
      canActivate: (ctx) => ctx.state.players[ctx.player].lp > 1000,
      resolve: (ctx) => ctx.payLp(ctx.player, 1000),
    },
  },
  'Limiter Removal': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      canActivate: (ctx) => ctx.myMonsters().some((m) => faceUp(m) && ctx.data(m.uid).race === 'Machine'),
      resolve: (ctx) => {
        for (const m of ctx.myMonsters().filter((c) => faceUp(c) && ctx.data(c.uid).race === 'Machine')) {
          ctx.tempBoost(m.uid, ctx.atk(m));
        }
      },
    },
    approx: 'I mostri potenziati non vengono distrutti a fine turno.',
  },
  'Widespread Ruin': {
    activation: {
      timing: 'response',
      respondsTo: ['attack'],
      resolve: (ctx) => {
        const m = ctx.oppMonsters().filter((c) => c.position === 'atk').sort((a, b) => ctx.atk(b) - ctx.atk(a))[0];
        if (m) ctx.destroy([m.uid]);
      },
    },
  },
  'Ring of Destruction': {
    activation: {
      timing: 'response',
      respondsTo: ['attack', 'summon', 'battleStart'],
      targets: (ctx) => single(uids(ctx.oppMonsters().filter((c) => faceUp(c) && ctx.atk(c) <= ctx.state.players[ctx.opponent].lp))),
      resolve: (ctx) => {
        const t = ctx.get(ctx.targets[0]);
        if (!t) return;
        const atk = ctx.data(t.uid).atk ?? 0;
        ctx.destroy([t.uid]);
        ctx.damage(ctx.player, atk);
        ctx.damage(ctx.opponent, atk);
      },
    },
  },
  'Secret Barrel': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      resolve: (ctx) => {
        const op = ctx.state.players[ctx.opponent];
        const n = op.hand.length + ctx.oppMonsters().length + ctx.oppSpellTraps().length + (op.fieldZone ? 1 : 0);
        ctx.damage(ctx.opponent, 200 * n);
      },
    },
  },
  'Ceasefire': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      canActivate: (ctx) => allMonstersOnField(ctx).some((c) => c.position === 'facedown' || (!isNormalMonster(ctx.data(c.uid)) && faceUp(c))),
      resolve: (ctx) => {
        for (const m of allMonstersOnField(ctx)) if (m.position === 'facedown') { m.position = 'def'; m.flipped = true; }
        const n = allMonstersOnField(ctx).filter((c) => !isNormalMonster(ctx.data(c.uid))).length;
        ctx.damage(ctx.opponent, 500 * n);
      },
    },
  },
  'Dust Tornado': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      targets: (ctx) => single(uids(otherSpellTraps(ctx).filter((c) => c.controller !== ctx.player))),
      resolve: (ctx) => ctx.destroy([ctx.targets[0]]),
    },
    approx: 'Non permette di posizionare una magia/trappola dopo.',
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
  'Trap Dustshoot': {
    activation: {
      timing: 'both',
      respondsTo: ['attack', 'summon', 'battleStart'],
      canActivate: (ctx) => oppHand(ctx).length >= 4 && oppHand(ctx).some((c) => isMonster(ctx.data(c.uid))),
      resolve: (ctx) => {
        const opts = uids(oppHand(ctx).filter((c) => isMonster(ctx.data(c.uid))));
        ctx.ask({ prompt: 'Trap Dustshoot: rimetti nel deck un mostro della mano avversaria', options: opts, min: 1, max: 1, resolve: { kind: 'toDeck' } });
      },
    },
  },
  'Pot of Avarice': {
    activation: {
      timing: 'main',
      canActivate: (ctx) => myGY(ctx).filter((c) => isMonster(ctx.data(c.uid))).length >= 5 && ctx.state.players[ctx.player].deck.length >= 2,
      resolve: (ctx) => {
        const mons = myGY(ctx).filter((c) => isMonster(ctx.data(c.uid))).slice(0, 5);
        for (const m of mons) ctx.toDeck(m.uid);
        ctx.draw(ctx.player, 2);
      },
    },
    approx: 'Rimette nel deck i primi 5 mostri del cimitero (non a scelta).',
  },
};

/** Chaos Sorcerer / Black Luster Soldier: evocazione dalla mano bandendo 1 LUCE e 1 OSCURITÀ dal cimitero; sul terreno, bandisce un mostro. */
function chaosSummonOrBanish(): CardScript['activation'] {
  return {
    timing: 'main',
    fromHand: true,
    selfSummon: true,
    oncePerTurn: true,
    canActivate: (ctx) => {
      const loc = ctx.get(ctx.card.uid);
      if (!loc) return false;
      if (loc.position === undefined) return ctx.hasFreeMonsterSlot(ctx.player);
      return loc.position !== 'facedown';
    },
    targets: (ctx) => {
      const loc = ctx.get(ctx.card.uid);
      if (!loc) return [];
      if (loc.position === undefined) {
        const lights = myGY(ctx).filter((c) => isMonster(ctx.data(c.uid)) && ctx.data(c.uid).attribute === 'LIGHT');
        const darks = myGY(ctx).filter((c) => isMonster(ctx.data(c.uid)) && ctx.data(c.uid).attribute === 'DARK');
        const out: number[][] = [];
        for (const l of lights) for (const d of darks) out.push([l.uid, d.uid]);
        return out.slice(0, 12);
      }
      return single(uids(allMonstersOnField(ctx).filter((c) => c.uid !== ctx.card.uid && faceUp(c))));
    },
    resolve: (ctx) => {
      const loc = ctx.get(ctx.card.uid);
      if (!loc) return;
      if (loc.position === undefined) {
        ctx.banish(ctx.targets[0]);
        ctx.banish(ctx.targets[1]);
        ctx.specialSummon(ctx.card.uid, ctx.player, 'atk');
      } else {
        ctx.banish(ctx.targets[0]);
        ctx.card.attacksThisTurn = 99;
      }
    },
  };
}

