import { useEffect, useMemo, useState } from 'react';
import type { CardData, CardDb } from '../engine/types';
import { isExtraDeckMonster, isMonster, isSupportedCard, fusionMaterials, isFusion } from '../engine/cards';
import { isEffectImplemented, scriptFor } from '../engine/effects/library';
import { searchCards } from '../data/api';
import type { SavedDeck } from '../data/decks';
import { CardDetail } from './CardView';

interface Props {
  db: CardDb;
  decks: SavedDeck[];
  onSave: (deck: SavedDeck, cards: CardData[]) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}

const MAIN_MIN = 40;
const MAIN_MAX = 60;
const EXTRA_MAX = 15;

/** Stato di supporto di una carta nel motore, per il badge nel deck builder. */
export function supportLabel(c: CardData): { label: string; level: 'ok' | 'partial' | 'no' } {
  if (!isSupportedCard(c)) return { label: 'Tipo non supportato', level: 'no' };
  if (isFusion(c) && !fusionMaterials(c)) return { label: 'Materiali generici: non evocabile', level: 'no' };
  if (c.type === 'Normal Monster' || c.type === 'Normal Tuner Monster') return { label: 'Mostro normale', level: 'ok' };
  if (isEffectImplemented(c)) {
    const s = scriptFor(c);
    if (s?.approx) return { label: `Implementata con semplificazioni: ${s.approx}`, level: 'partial' };
    return { label: s?.auto ? 'Effetto interpretato dal testo' : 'Effetto implementato', level: 'ok' };
  }
  if (isMonster(c)) return { label: 'Effetto non implementato (gioca come normale)', level: 'partial' };
  return { label: 'Effetto non implementato (non attivabile)', level: 'no' };
}

export function DeckBuilder({ db, decks, onSave, onDelete, onBack }: Props) {
  const [query, setQuery] = useState('');
  const [online, setOnline] = useState(false);
  const [results, setResults] = useState<CardData[]>([]);
  const [searching, setSearching] = useState(false);
  const [hover, setHover] = useState<CardData | null>(null);
  const [current, setCurrent] = useState<SavedDeck>(() => decks[0] ?? newDeck());
  const [known, setKnown] = useState<Record<number, CardData>>({ ...db });

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = query.trim().toLowerCase();
      if (q.length < 2) return setResults([]);
      // Ricerca nel database locale (era GX), poi eventualmente online su tutte le ere.
      const local = Object.values(db).filter((c) => isSupportedCard(c) && c.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 60);
      setResults(local);
      if (!online) return;
      setSearching(true);
      const r = await searchCards(query);
      const seen = new Set(local.map((c) => c.id));
      const extra = r.filter((c) => !seen.has(c.id) && !local.some((l) => l.name === c.name));
      setKnown((k) => {
        const n = { ...k };
        for (const c of extra) n[c.id] = c;
        return n;
      });
      setResults([...local, ...extra]);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, online, db]);

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const id of [...current.main, ...current.extra]) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [current]);

  const add = (c: CardData) => {
    if (!isSupportedCard(c)) return;
    if ((counts.get(c.id) ?? 0) >= 3) return;
    if (isExtraDeckMonster(c)) {
      if (current.extra.length >= EXTRA_MAX) return;
      setCurrent({ ...current, extra: [...current.extra, c.id] });
    } else {
      if (current.main.length >= MAIN_MAX) return;
      setCurrent({ ...current, main: [...current.main, c.id] });
    }
  };
  const remove = (id: number, zone: 'main' | 'extra') => {
    const arr = [...current[zone]];
    const i = arr.lastIndexOf(id);
    if (i >= 0) arr.splice(i, 1);
    setCurrent({ ...current, [zone]: arr });
  };

  const grouped = (ids: number[]) => {
    const m = new Map<number, number>();
    for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
    return [...m.entries()].map(([id, n]) => ({ card: known[id], n, id })).sort((a, b) => (a.card?.name ?? '').localeCompare(b.card?.name ?? ''));
  };

  const valid = current.main.length >= MAIN_MIN && current.main.length <= MAIN_MAX && current.name.trim().length > 0;

  return (
    <div className="builder">
      <header className="duel-top">
        <button className="btn btn-ghost" onClick={onBack}>← Menu</button>
        <input className="deck-name" value={current.name} onChange={(e) => setCurrent({ ...current, name: e.target.value })} placeholder="Nome del deck" />
        <select value={current.id} onChange={(e) => setCurrent(decks.find((d) => d.id === e.target.value) ?? newDeck())}>
          {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          {!decks.some((d) => d.id === current.id) && <option value={current.id}>{current.name || 'Nuovo deck'}</option>}
          <option value="__new">Nuovo deck…</option>
        </select>
        <button className="btn btn-primary" disabled={!valid} onClick={() => onSave(current, Object.values(known))}>Salva</button>
        {decks.some((d) => d.id === current.id) && <button className="btn btn-ghost" onClick={() => { if (confirm('Eliminare questo deck?')) onDelete(current.id); }}>Elimina</button>}
      </header>

      <div className="builder-main">
        <section className="builder-col">
          <h3>Cerca carte</h3>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome (in inglese), es. Blue-Eyes" autoFocus />
          <label className="check"><input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} /> Cerca anche online (carte di tutte le ere)</label>
          {searching && <div className="muted small">Ricerca online…</div>}
          <ul className="card-list">
            {results.map((c) => {
              const s = supportLabel(c);
              return (
                <li key={c.id} className={`card-list-item support-${s.level}`} onMouseEnter={() => setHover(c)} onClick={() => add(c)}>
                  {c.imageSmall && <img src={c.imageSmall} alt="" />}
                  <div>
                    <div className="card-list-name">{c.name}</div>
                    <div className="muted small">{c.type}{isMonster(c) ? ` · ${c.atk}/${c.def} · Lv ${c.level}` : ` · ${c.race}`}</div>
                    <div className={`support support-${s.level}`}>{s.label}</div>
                  </div>
                  <span className="count">{counts.get(c.id) ? `×${counts.get(c.id)}` : '+'}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="builder-col">
          <h3>Main Deck ({current.main.length}/{MAIN_MIN}–{MAIN_MAX})</h3>
          <ul className="card-list compact">
            {grouped(current.main).map(({ card, n, id }) => (
              <li key={id} className="card-list-item" onMouseEnter={() => card && setHover(card)} onClick={() => remove(id, 'main')}>
                <div className="card-list-name">{card?.name ?? `#${id}`}</div>
                <span className="count">×{n}</span>
              </li>
            ))}
          </ul>
          <h3>Extra Deck ({current.extra.length}/{EXTRA_MAX})</h3>
          <ul className="card-list compact">
            {grouped(current.extra).map(({ card, n, id }) => (
              <li key={id} className="card-list-item" onMouseEnter={() => card && setHover(card)} onClick={() => remove(id, 'extra')}>
                <div className="card-list-name">{card?.name ?? `#${id}`}</div>
                <span className="count">×{n}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">Clic su una carta della lista per rimuoverla. Massimo 3 copie per carta.</p>
        </section>

        <aside className="sidebar">
          <CardDetail data={hover} />
        </aside>
      </div>
    </div>
  );
}

function newDeck(): SavedDeck {
  return { id: `deck-${Date.now()}`, name: 'Nuovo deck', main: [], extra: [] };
}
