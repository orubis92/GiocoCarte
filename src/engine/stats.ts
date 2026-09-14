import type { CardDb, CardInstance, GameState, PlayerId } from './types';
import { currentAtk, currentDef, monstersOf, spellTrapsOf } from './cards';
import { scriptFor } from './effects/library';
import { makeContext, monsterEffectsNegated } from './context';

// ---------------------------------------------------------------------------
// ATK/DEF effettivi: valore base + modificatori diretti (equipaggiamenti,
// effetti) + "aure" continue di carte scoperte sul terreno (magie terreno,
// magie/trappole continue, mostri che potenziano gli altri).
// ---------------------------------------------------------------------------

function auraBonus(state: GameState, db: CardDb, monster: CardInstance): { atk: number; def: number } {
  let atk = 0;
  let def = 0;
  for (const p of [0, 1] as PlayerId[]) {
    const ps = state.players[p];
    const sources: CardInstance[] = [...monstersOf(ps).filter((m) => m.position !== 'facedown'), ...spellTrapsOf(ps).filter((s) => !s.faceDown)];
    if (ps.fieldZone && !ps.fieldZone.faceDown) sources.push(ps.fieldZone);
    const negated = monsterEffectsNegated(state, db);
    for (const src of sources) {
      const aura = scriptFor(db[src.cardId])?.aura;
      if (!aura) continue;
      if (negated && src.position !== undefined) continue; // aura di un mostro negata da Prosciuga Abilità
      const b = aura(makeContext(state, db, p, src, [], null), monster);
      if (b) {
        atk += b.atk ?? 0;
        def += b.def ?? 0;
      }
    }
  }
  return { atk, def };
}

export function effectiveAtk(state: GameState, db: CardDb, card: CardInstance): number {
  if (card.position === undefined) return currentAtk(db, card);
  return Math.max(0, currentAtk(db, card) + auraBonus(state, db, card).atk);
}

export function effectiveDef(state: GameState, db: CardDb, card: CardInstance): number {
  if (card.position === undefined) return currentDef(db, card);
  return Math.max(0, currentDef(db, card) + auraBonus(state, db, card).def);
}
