import type { CardInstance } from '../types';
import type { EffectContext } from './types';
import { isMonster, isExtraDeckMonster } from '../cards';
import { scriptFor } from './library';

// Funzioni di supporto condivise dagli script scritti a mano.

export const single = (uids: number[]): number[][] => uids.map((u) => [u]);
export const faceUp = (c: CardInstance) => c.position !== 'facedown';
export const uids = (cs: CardInstance[]) => cs.map((c) => c.uid);

export function allMonstersOnField(ctx: EffectContext) {
  return [...ctx.myMonsters(), ...ctx.oppMonsters()];
}

export function allSpellTrapsOnField(ctx: EffectContext) {
  const f0 = ctx.state.players[0].fieldZone;
  const f1 = ctx.state.players[1].fieldZone;
  return [...ctx.mySpellTraps(), ...ctx.oppSpellTraps(), ...(f0 ? [f0] : []), ...(f1 ? [f1] : [])];
}

/** Bersagli: tutte le magie/trappole tranne la carta stessa. */
export function otherSpellTraps(ctx: EffectContext) {
  return allSpellTrapsOnField(ctx).filter((c) => c.uid !== ctx.card.uid);
}

export function graveyardMonstersRevivable(ctx: EffectContext) {
  const gy = [...ctx.state.players[0].graveyard, ...ctx.state.players[1].graveyard];
  return gy.filter((c) => {
    const d = ctx.data(c.uid);
    if (!isMonster(d)) return false;
    if (isExtraDeckMonster(d) && !c.properlySummoned) return false;
    const sc = scriptFor(d);
    if (sc?.cannotSpecialSummon || sc?.cannotSpecialSummonFromGY) return false;
    return true;
  });
}

export const attackerOf = (ctx: EffectContext): CardInstance | null =>
  ctx.event?.kind === 'attack' ? ctx.get(ctx.event.attackerUid) : null;

export const summonedOf = (ctx: EffectContext): CardInstance | null =>
  ctx.event?.kind === 'summon' ? ctx.get(ctx.event.cardUid) : null;

