import type { CardData, CardDb } from './types';

/** Segnalini generati dagli effetti. Gli id negativi non collidono con quelli di YGOPRODeck. */
export const SHEEP_TOKEN_ID = -1001;
export const OJAMA_TOKEN_ID = -1002;

export const TOKEN_CARDS: CardData[] = [
  { id: SHEEP_TOKEN_ID, name: 'Sheep Token', type: 'Token', frameType: 'token', desc: 'Segnalino Pecora (Capro Espiatorio). Non può essere offerto come tributo per un\'Evocazione tramite Tributo.', race: 'Beast', attribute: 'EARTH', level: 1, atk: 0, def: 0 },
  { id: OJAMA_TOKEN_ID, name: 'Ojama Token', type: 'Token', frameType: 'token', desc: 'Segnalino Ojama. Non può essere offerto come tributo. Quando viene distrutto, il suo controllore subisce 300 danni.', race: 'Beast', attribute: 'LIGHT', level: 2, atk: 0, def: 1000 },
];

/** Aggiunge i segnalini a un database carte (non modifica l'originale). */
export function withTokens(db: CardDb): CardDb {
  const out: CardDb = { ...db };
  for (const t of TOKEN_CARDS) out[t.id] = t;
  return out;
}
