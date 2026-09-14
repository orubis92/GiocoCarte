import { useEffect, useState, type CSSProperties } from 'react';
import type { Difficulty, PlayerId } from '../engine/types';
import { DECK_SECTIONS, type DeckSection, type SavedDeck } from '../data/decks';

export interface DeckOption {
  id: string;
  name: string;
  description?: string;
  deck: SavedDeck;
  /** Nomi di carte del deck che non è stato possibile caricare. */
  missing?: string[];
  /** Illustrazione della carta simbolo del deck. */
  cover?: string;
  /** Colore d'accento della tessera. */
  accent?: string;
  section: DeckSection | 'mine';
  /** Quante carte del main deck hanno l'effetto attivo (o sono mostri normali). */
  playable?: number;
}

export interface StartConfig {
  mode: 'ai' | 'hotseat';
  difficulty: Difficulty;
  deckP1: string;
  deckP2: string;
  firstPlayer: PlayerId | 'random';
}

interface Props {
  decks: DeckOption[];
  onStart: (cfg: StartConfig) => void;
  onDeckBuilder: () => void;
  loading: string | null;
  error: string | null;
  /** Numero di carte nel database locale (per la striscia informativa). */
  cardCount: number;
}

const DIFFICULTIES: { key: Difficulty; label: string; desc: string }[] = [
  { key: 'facile', label: 'Facile', desc: 'Gioca a caso, evita solo gli attacchi suicidi.' },
  { key: 'medio', label: 'Medio', desc: 'Valuta ogni mossa e sceglie la migliore.' },
  { key: 'difficile', label: 'Difficile', desc: 'Pianifica sequenze di mosse e prevede la tua risposta.' },
];

/** Carte decorative fluttuanti sullo sfondo della home. */
const FLOATERS = Array.from({ length: 12 }, (_, i) => ({
  left: (i * 83) % 100,
  delay: (i * 1.7) % 9,
  duration: 16 + (i % 5) * 3,
  scale: 0.6 + (i % 4) * 0.2,
  rotate: -20 + (i * 37) % 40,
}));

export function Menu({ decks, onStart, onDeckBuilder, loading, error, cardCount }: Props) {
  const [screen, setScreen] = useState<'home' | 'setup'>('home');
  const [mode, setMode] = useState<'ai' | 'hotseat'>('ai');
  const [difficulty, setDifficulty] = useState<Difficulty>('medio');
  const [deckP1, setDeckP1] = useState(decks[0]?.id ?? '');
  const [deckP2, setDeckP2] = useState(decks[1]?.id ?? decks[0]?.id ?? '');
  const [firstPlayer, setFirstPlayer] = useState<PlayerId | 'random'>('random');
  const [choosing, setChoosing] = useState<1 | 2>(1);

  // Se i deck arrivano dopo il primo render, seleziona i default.
  useEffect(() => {
    if (decks.length && !decks.some((d) => d.id === deckP1)) setDeckP1(decks[0].id);
    if (decks.length && !decks.some((d) => d.id === deckP2)) setDeckP2(decks[1]?.id ?? decks[0].id);
  }, [decks, deckP1, deckP2]);

  const valid = (id: string) => decks.find((d) => d.id === id);
  const canStart = !loading && !!valid(deckP1) && !!valid(deckP2);
  const current = choosing === 1 ? deckP1 : deckP2;
  const setCurrent = choosing === 1 ? setDeckP1 : setDeckP2;

  const quickDuel = () => {
    if (decks.length === 0) return;
    const a = decks[Math.floor(Math.random() * decks.length)];
    let b = decks[Math.floor(Math.random() * decks.length)];
    if (decks.length > 1) while (b.id === a.id) b = decks[Math.floor(Math.random() * decks.length)];
    onStart({ mode: 'ai', difficulty: 'medio', deckP1: a.id, deckP2: b.id, firstPlayer: 'random' });
  };

  const pickDeck = (id: string) => {
    setDeckP1(id);
    setScreen('setup');
    setChoosing(2);
  };

  return (
    <div className="home">
      <div className="home-bg" aria-hidden>
        {FLOATERS.map((f, i) => (
          <span key={i} className="home-float" style={{ left: `${f.left}%`, animationDelay: `-${f.delay}s`, animationDuration: `${f.duration}s`, '--s': f.scale, '--r': `${f.rotate}deg` } as CSSProperties} />
        ))}
      </div>

      <div className="home-content">
        <header className="home-hero">
          <div className="home-emblem"><span /></div>
          <h1>Duello di carte</h1>
          <p className="home-tag">Il gioco di carte, con un avversario che pensa.</p>
          <div className="home-stats">
            <span><b>{cardCount.toLocaleString('it-IT')}</b> carte fino all'era GX</span>
            <span><b>3</b> livelli di IA</span>
            <span><b>{decks.length}</b> deck pronti</span>
          </div>
          <div className="home-cta">
            <button className="btn btn-primary btn-big btn-start" disabled={!!loading || decks.length === 0} onClick={quickDuel}>Duello rapido</button>
            <button className="btn btn-big btn-outline" disabled={!!loading} onClick={() => setScreen(screen === 'setup' ? 'home' : 'setup')}>{screen === 'setup' ? 'Chiudi configurazione' : 'Configura il duello'}</button>
            <button className="btn btn-big btn-ghost" onClick={onDeckBuilder}>Deck builder</button>
          </div>
          {loading && <div className="notice"><span className="spinner" /> {loading}</div>}
          {error && <div className="notice notice-error">{error}</div>}
        </header>

        {screen === 'setup' && (
          <section className="menu-card setup-panel">
            <div className="setup-grid">
              <div>
                <h2>Modalità</h2>
                <div className="seg">
                  <button className={mode === 'ai' ? 'active' : ''} onClick={() => setMode('ai')}>
                    <strong>Contro il computer</strong>
                    <span>Un avversario automatico</span>
                  </button>
                  <button className={mode === 'hotseat' ? 'active' : ''} onClick={() => setMode('hotseat')}>
                    <strong>Due giocatori</strong>
                    <span>Stesso dispositivo, a turni</span>
                  </button>
                </div>
              </div>
              {mode === 'ai' && (
                <div>
                  <h2>Difficoltà</h2>
                  <div className="seg seg-3">
                    {DIFFICULTIES.map((d) => (
                      <button key={d.key} className={difficulty === d.key ? 'active' : ''} onClick={() => setDifficulty(d.key)}>
                        <strong>{d.label}</strong>
                        <span>{d.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h2>Chi inizia</h2>
                <div className="seg seg-3">
                  {(['random', 0, 1] as const).map((v) => (
                    <button key={String(v)} className={firstPlayer === v ? 'active' : ''} onClick={() => setFirstPlayer(v)}>
                      <strong>{v === 'random' ? 'A caso' : v === 0 ? (mode === 'ai' ? 'Io' : 'Giocatore 1') : mode === 'ai' ? 'Il computer' : 'Giocatore 2'}</strong>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="menu-card-head">
              <h2>Deck</h2>
              <div className="seg seg-inline">
                <button className={choosing === 1 ? 'active' : ''} onClick={() => setChoosing(1)}>{mode === 'ai' ? 'Il tuo deck' : 'Giocatore 1'}: {valid(deckP1)?.name ?? '—'}</button>
                <button className={choosing === 2 ? 'active' : ''} onClick={() => setChoosing(2)}>{mode === 'ai' ? 'Il computer' : 'Giocatore 2'}: {valid(deckP2)?.name ?? '—'}</button>
              </div>
            </div>
            <DeckGrid decks={decks} current={current} p1={deckP1} p2={deckP2} mode={mode} onPick={(id) => setCurrent(id)} />
            <button className="btn btn-primary btn-big btn-start" disabled={!canStart} onClick={() => onStart({ mode, difficulty, deckP1, deckP2, firstPlayer })}>
              Inizia il duello
            </button>
          </section>
        )}

        {screen === 'home' && decks.length > 0 && (
          <section className="home-decks">
            <h2>Scegli un deck e gioca</h2>
            <p className="muted">Tocca un deck per usarlo come tuo; poi scegli l'avversario.</p>
            <DeckGrid decks={decks} current={null} p1={null} p2={null} mode={mode} onPick={pickDeck} big />
          </section>
        )}

        <p className="muted small credits">
          Dati e immagini delle carte da YGOPRODeck. Yu-Gi-Oh! è un marchio di Konami; questo è un progetto amatoriale non ufficiale.
        </p>
      </div>
    </div>
  );
}

function DeckGrid({ decks, current, p1, p2, mode, onPick, big }: { decks: DeckOption[]; current: string | null; p1: string | null; p2: string | null; mode: 'ai' | 'hotseat'; onPick: (id: string) => void; big?: boolean }) {
  const sections: { key: string; title: string; subtitle: string }[] = [...DECK_SECTIONS, { key: 'mine', title: 'I miei deck', subtitle: 'Creati con il deck builder' }];
  return (
    <div className="deck-sections">
      {sections.map((s) => {
        const list = decks.filter((d) => d.section === s.key);
        if (list.length === 0) return null;
        return (
          <div key={s.key} className="deck-section">
            <div className="deck-section-head">
              <h3>{s.title}</h3>
              <span className="muted small">{s.subtitle} · {list.length} deck</span>
            </div>
            <DeckTiles decks={list} current={current} p1={p1} p2={p2} mode={mode} onPick={onPick} big={big} />
          </div>
        );
      })}
    </div>
  );
}

function DeckTiles({ decks, current, p1, p2, mode, onPick, big }: { decks: DeckOption[]; current: string | null; p1: string | null; p2: string | null; mode: 'ai' | 'hotseat'; onPick: (id: string) => void; big?: boolean }) {
  return (
    <div className={`deck-grid ${big ? 'deck-grid-big' : ''}`}>
      {decks.map((d) => (
        <button key={d.id} className={`deck-tile ${current === d.id ? 'active' : ''}`} style={{ '--accent': d.accent ?? '#7f5fd6' } as CSSProperties} onClick={() => onPick(d.id)}>
          <div className="deck-tile-art">{d.cover ? <img src={d.cover} alt="" loading="lazy" /> : <div className="deck-tile-art-empty" />}</div>
          <div className="deck-tile-body">
            <div className="deck-tile-name">{d.name}</div>
            <div className="deck-tile-desc">{d.description ?? 'Deck personalizzato'}</div>
            <div className="deck-tile-meta">
              {d.deck.main.length} carte · Extra {d.deck.extra.length}
              {d.playable !== undefined && <span className="deck-playable" title="Carte del main deck con effetto attivo o mostri normali"> · effetti attivi {d.playable}/{d.deck.main.length}</span>}
              {d.missing && d.missing.length > 0 ? ` · ${d.missing.length} non caricate` : ''}
            </div>
          </div>
          {p1 === d.id && <span className="deck-badge">{mode === 'ai' ? 'Tu' : 'G1'}</span>}
          {p2 === d.id && <span className={`deck-badge deck-badge-2 ${p1 === d.id ? 'deck-badge-stack' : ''}`}>{mode === 'ai' ? 'CPU' : 'G2'}</span>}
        </button>
      ))}
    </div>
  );
}
