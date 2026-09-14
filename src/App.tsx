import { useEffect, useState } from 'react';
import type { CardData, CardDb, PlayerId } from './engine/types';
import { fetchCardsByIds, fetchCardsByNames, loadBundledCards } from './data/api';
import { withTokens } from './engine/tokens';
import { isEffectImplemented } from './engine/effects/library';
import { STARTER_DECKS, loadSavedDecks, saveDecks, type SavedDeck } from './data/decks';
import { Menu, type DeckOption, type StartConfig } from './ui/Menu';
import { DeckBuilder } from './ui/DeckBuilder';
import { Duel } from './ui/Duel';
import type { DuelConfig } from './ui/useDuel';

type Screen = { kind: 'menu' } | { kind: 'builder' } | { kind: 'duel'; config: DuelConfig; key: number };

export default function App() {
  const [db, setDb] = useState<CardDb>({});
  const [starters, setStarters] = useState<DeckOption[]>([]);
  const [saved, setSaved] = useState<SavedDeck[]>(() => loadSavedDecks());
  const [loading, setLoading] = useState<string | null>('Caricamento delle carte…');
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: 'menu' });

  // Carica i deck predefiniti (per nome) e quelli salvati (per id).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1. Dataset incluso nell'app (era GX): niente rete.
        const bundled = await loadBundledCards();
        const bundledByName = new Map(bundled.map((c) => [c.name, c]));
        // 2. Le carte dei deck predefiniti che non sono nel dataset (es. Synchro) arrivano dall'API.
        const names = [...new Set(STARTER_DECKS.flatMap((d) => [...d.main, ...d.extra, d.cover]))].filter((n) => !bundledByName.has(n));
        const { cards: fetched, missing } = names.length
          ? await fetchCardsByNames(names, (done, total) => {
              if (!cancelled) setLoading(`Caricamento delle carte… ${done}/${total}`);
            })
          : { cards: [], missing: [] };
        const cards = [...bundled, ...fetched];
        const savedIds = loadSavedDecks().flatMap((d) => [...d.main, ...d.extra]).filter((id) => !bundled.some((c) => c.id === id));
        const savedCards = savedIds.length ? await fetchCardsByIds(savedIds) : [];
        if (cancelled) return;
        const base: CardDb = {};
        for (const c of [...cards, ...savedCards]) base[c.id] = c;
        const next = withTokens(base);
        const byName = new Map(cards.map((c) => [c.name, c.id]));
        const opts: DeckOption[] = STARTER_DECKS.map((d) => ({
          id: d.id,
          name: d.name,
          description: d.description,
          cover: cards.find((c) => c.name === d.cover)?.image,
          accent: d.accent,
          section: d.section,
          playable: d.main.filter((n) => { const c = bundledByName.get(n) ?? cards.find((x) => x.name === n); return !!c && (c.type === 'Normal Monster' || isEffectImplemented(c)); }).length,
          missing: [...new Set([...d.main, ...d.extra].filter((n) => !byName.has(n)))],
          deck: {
            id: d.id,
            name: d.name,
            main: d.main.map((n) => byName.get(n)).filter((x): x is number => x !== undefined),
            extra: d.extra.map((n) => byName.get(n)).filter((x): x is number => x !== undefined),
          },
        }));
        setDb(next);
        setStarters(opts);
        setLoading(null);
        if (missing.length) setError(`Alcune carte non sono state trovate: ${missing.join(', ')}`);
        if (cards.length === 0) setError('Impossibile caricare le carte: dataset locale mancante e API non raggiungibile.');
      } catch (e) {
        if (!cancelled) {
          setLoading(null);
          setError(`Errore nel caricamento delle carte: ${(e as Error).message}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const deckOptions: DeckOption[] = [
    ...starters,
    ...saved.map((d) => ({ id: d.id, name: d.name, description: 'Deck personalizzato', deck: d, cover: db[d.extra[0] ?? d.main[0]]?.image, accent: '#d4a72c', section: 'mine' as const, playable: d.main.filter((id) => db[id] && (db[id].type === 'Normal Monster' || isEffectImplemented(db[id]))).length })),
  ];
  const cardCount = Object.keys(db).length;

  const start = (cfg: StartConfig) => {
    const d1 = deckOptions.find((d) => d.id === cfg.deckP1)!.deck;
    const d2 = deckOptions.find((d) => d.id === cfg.deckP2)!.deck;
    const firstPlayer: PlayerId = cfg.firstPlayer === 'random' ? (Math.random() < 0.5 ? 0 : 1) : cfg.firstPlayer;
    setScreen({
      kind: 'duel',
      key: Date.now(),
      config: {
        db,
        decks: [
          { main: d1.main, extra: d1.extra },
          { main: d2.main, extra: d2.extra },
        ],
        difficulty: cfg.difficulty,
        aiPlayer: cfg.mode === 'ai' ? 1 : null,
        firstPlayer,
      },
    });
  };

  const onSaveDeck = (deck: SavedDeck, cards: CardData[]) => {
    const next = saved.some((d) => d.id === deck.id) ? saved.map((d) => (d.id === deck.id ? deck : d)) : [...saved, deck];
    setSaved(next);
    saveDecks(next);
    setDb((prev) => {
      const n = { ...prev };
      for (const c of cards) n[c.id] = c;
      return n;
    });
    setScreen({ kind: 'menu' });
  };

  const onDeleteDeck = (id: string) => {
    const next = saved.filter((d) => d.id !== id);
    setSaved(next);
    saveDecks(next);
    setScreen({ kind: 'menu' });
  };

  if (screen.kind === 'duel') return <Duel key={screen.key} config={screen.config} onExit={() => setScreen({ kind: 'menu' })} />;
  if (screen.kind === 'builder') return <DeckBuilder db={db} decks={saved} onSave={onSaveDeck} onDelete={onDeleteDeck} onBack={() => setScreen({ kind: 'menu' })} />;
  return <Menu decks={deckOptions} onStart={start} onDeckBuilder={() => setScreen({ kind: 'builder' })} loading={loading} error={error} cardCount={cardCount} />;
}
