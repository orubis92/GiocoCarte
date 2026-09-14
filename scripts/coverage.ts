// Misura la copertura dell'interprete automatico sul corpus di carte in data/cards-gx.json.
// Uso: npx tsx scripts/coverage.ts [--list] [--unparsed N]
import { readFileSync } from 'node:fs';
import type { CardData } from '../src/engine/types';
import { LIBRARY, scriptFor, isEffectImplemented } from '../src/engine/effects/library';
import * as auto from '../src/engine/effects/auto';

const cards = JSON.parse(readFileSync(new URL('../data/cards-gx.json', import.meta.url), 'utf8')) as CardData[];
const args = process.argv.slice(2);
const list = args.includes('--list');
const nUnparsed = Number(args[args.indexOf('--unparsed') + 1] || 40);

const stats: Record<string, { total: number; manual: number; auto: number; partial: number; none: number }> = {};
const failures = new Map<string, number>();
const failureExamples = new Map<string, string>();
const bump = (k: string, f: keyof (typeof stats)[string]) => {
  stats[k] ??= { total: 0, manual: 0, auto: 0, partial: 0, none: 0 };
  stats[k][f]++;
};

for (const c of cards) {
  const group = c.type.includes('Monster') ? (c.type === 'Normal Monster' || c.type === 'Normal Tuner Monster' ? 'Mostri normali' : 'Mostri effetto') : c.type === 'Spell Card' ? `Magie ${c.race}` : c.type === 'Trap Card' ? `Trappole ${c.race}` : 'Altro';
  bump(group, 'total');
  if (group === 'Mostri normali') { bump(group, 'auto'); continue; }
  if (LIBRARY[c.name]) { bump(group, 'manual'); continue; }
  auto.lastFailure;
  const s = scriptFor(c);
  if (s && !s.unparsed && isEffectImplemented(c)) bump(group, 'auto');
  else if (s?.unparsed) {
    bump(group, 'partial');
    const key = s.unparsed[0].split(' ').slice(0, 5).join(' ');
    failures.set(key, (failures.get(key) ?? 0) + 1);
    failureExamples.set(key, `${c.name}: ${s.unparsed[0]}`);
  } else {
    bump(group, 'none');
    const key = (auto.lastFailure || c.desc).split(' ').slice(0, 6).join(' ');
    failures.set(key, (failures.get(key) ?? 0) + 1);
    failureExamples.set(key, `${c.name}: ${auto.lastFailure || c.desc.slice(0, 100)}`);
    if (list) console.log(`NONE  ${c.type.padEnd(20)} ${c.name}: ${(auto.lastFailure || c.desc).slice(0, 120)}`);
  }
}

let T = 0, M = 0, A = 0, P = 0, N = 0;
console.log('\nGruppo                      totale  manuali  auto  parziali  nessuno   copertura');
for (const [k, v] of Object.entries(stats).sort()) {
  T += v.total; M += v.manual; A += v.auto; P += v.partial; N += v.none;
  console.log(`${k.padEnd(28)}${String(v.total).padStart(6)}${String(v.manual).padStart(9)}${String(v.auto).padStart(6)}${String(v.partial).padStart(10)}${String(v.none).padStart(9)}   ${(((v.manual + v.auto) / v.total) * 100).toFixed(0)}%`);
}
console.log(`${'TOTALE'.padEnd(28)}${String(T).padStart(6)}${String(M).padStart(9)}${String(A).padStart(6)}${String(P).padStart(10)}${String(N).padStart(9)}   ${(((M + A) / T) * 100).toFixed(0)}%`);
console.log(`\nFrammenti non capiti più frequenti:`);
for (const [k, n] of [...failures.entries()].sort((a, b) => b[1] - a[1]).slice(0, nUnparsed)) console.log(`${String(n).padStart(4)}  ${k}   —  ${failureExamples.get(k)?.slice(0, 110)}`);
