import { readFileSync, writeFileSync } from 'node:fs';
import type { CardData } from '../src/engine/types';
import { LIBRARY, scriptFor, isEffectImplemented } from '../src/engine/effects/library';
import * as auto from '../src/engine/effects/auto';
const cards = JSON.parse(readFileSync(new URL('../data/cards-gx.json', import.meta.url), 'utf8')) as CardData[];
const lines: string[] = [];
for (const c of cards) {
  if (c.type === 'Normal Monster' || c.type === 'Normal Tuner Monster' || c.type === 'Token' || LIBRARY[c.name]) continue;
  const s = scriptFor(c);
  if (s && !s.unparsed && isEffectImplemented(c)) continue;
  if (s?.unparsed) for (const u of s.unparsed) lines.push(`M|${c.type}|${c.name}|${u}`);
  else lines.push(`S|${c.type} ${c.race}|${c.name}|${auto.lastFailure}|${auto.normalizeText(c.desc).replace(/\n/g, ' \\n ')}`);
}
writeFileSync('data/unparsed.txt', lines.join('\n'));
console.log(lines.length);
