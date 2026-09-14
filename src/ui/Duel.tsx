import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Action, CardData, CardInstance, GameState, PlayerId, PlayerState } from '../engine/types';
import { other } from '../engine/cards';
import { describeAction } from '../engine/rules';
import { CardDetail, CardView } from './CardView';
import { useDuel, type DuelConfig } from './useDuel';

interface Props {
  config: DuelConfig;
  onExit: () => void;
}

const PHASES: { key: GameState['phase']; label: string; short: string }[] = [
  { key: 'draw', label: 'Draw Phase', short: 'DP' },
  { key: 'main1', label: 'Main Phase 1', short: 'M1' },
  { key: 'battle', label: 'Battle Phase', short: 'BP' },
  { key: 'main2', label: 'Main Phase 2', short: 'M2' },
  { key: 'end', label: 'End Phase', short: 'EP' },
];
const PHASE_LABEL = Object.fromEntries(PHASES.map((p) => [p.key, p.label])) as Record<GameState['phase'], string>;
PHASE_LABEL.standby = 'Standby Phase';

/** La carta "principale" a cui si riferisce un'azione (per il menu contestuale). */
function primaryUid(a: Action): number | null {
  switch (a.type) {
    case 'normalSummon':
    case 'flipSummon':
    case 'changePosition':
    case 'setSpellTrap':
    case 'activateSpell':
    case 'activateTrap':
    case 'activateMonsterEffect':
      return a.cardUid;
    case 'attack':
      return a.attackerUid;
    case 'fusionSummon':
      return a.fusionUid;
    case 'synchroSummon':
      return a.synchroUid;
    case 'ritualSummon':
      return a.ritualMonsterUid;
    default:
      return null;
  }
}

/** Vero sotto la larghezza indicata (layout touch per telefoni e tablet in verticale). */
function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setMatch(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return match;
}

interface Floater {
  id: number;
  player: PlayerId;
  delta: number;
}

export function Duel({ config, onExit }: Props) {
  const { state, legal, actor, isAiTurn, dispatch } = useDuel(config);
  const db = config.db;
  const [hover, setHover] = useState<CardData | null>(null);
  // Su touch la carta da leggere è quella toccata per ultima: non viene mai
  // azzerata dal mouseleave (che sul telefono scatta al tocco successivo).
  const [inspect, setInspect] = useState<CardData | null>(null);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [picks, setPicks] = useState<number[]>([]);
  const [showExtra, setShowExtra] = useState(false);
  const [showGy, setShowGy] = useState<PlayerId | null>(null);
  const [handoff, setHandoff] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'none' | 'card' | 'log'>('none');
  const isMobile = useMediaQuery('(max-width: 900px)');
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const prevLp = useRef<[number, number]>([state.players[0].lp, state.players[1].lp]);
  const prevTurn = useRef(state.turn);
  const floaterId = useRef(1);

  // Prospettiva: l'umano in basso. Con due umani, chi deve agire.
  const me: PlayerId = config.aiPlayer === null ? actor : other(config.aiPlayer);
  const opp = other(me);
  const humanTurn = !isAiTurn && state.winner === null;

  // Hot-seat: schermata di passaggio quando cambia il giocatore che agisce.
  useEffect(() => {
    if (config.aiPlayer === null) setHandoff(true);
  }, [actor, config.aiPlayer]);

  useEffect(() => {
    setSelectedUid(null);
    setPicks([]);
  }, [state]);

  // Danni/cure fluttuanti quando cambiano i LP.
  useEffect(() => {
    const next: Floater[] = [];
    for (const p of [0, 1] as PlayerId[]) {
      const d = state.players[p].lp - prevLp.current[p];
      if (d !== 0) next.push({ id: floaterId.current++, player: p, delta: d });
    }
    prevLp.current = [state.players[0].lp, state.players[1].lp];
    if (next.length) {
      setFloaters((f) => [...f, ...next]);
      const ids = next.map((n) => n.id);
      setTimeout(() => setFloaters((f) => f.filter((x) => !ids.includes(x.id))), 1400);
    }
  }, [state.players[0].lp, state.players[1].lp]); // eslint-disable-line react-hooks/exhaustive-deps

  // Banner di cambio turno.
  useEffect(() => {
    if (state.turn === prevTurn.current) return;
    prevTurn.current = state.turn;
    if (config.aiPlayer === null) return; // in hot-seat c'è già la schermata di passaggio
    setBanner(state.turnPlayer === me ? 'Il tuo turno' : "Turno dell'avversario");
    const t = setTimeout(() => setBanner(null), 1300);
    return () => clearTimeout(t);
  }, [state.turn, state.turnPlayer, me, config.aiPlayer]);

  const dataOf = (c: CardInstance) => db[c.cardId];
  const uidActions = useMemo(() => {
    const m = new Map<number, Action[]>();
    for (const a of legal) {
      const uid = primaryUid(a);
      if (uid === null) continue;
      if (!m.has(uid)) m.set(uid, []);
      m.get(uid)!.push(a);
    }
    return m;
  }, [legal]);

  const choice = state.pendingChoices[0] ?? null;
  const responding = !!state.pending && humanTurn && !choice;
  const nextPhaseAction = legal.find((a) => a.type === 'nextPhase');
  const attack = state.pending?.kind === 'attack' ? state.pending : null;

  const ps = state.players[me];
  const os = state.players[opp];

  const clickCard = (c: CardInstance) => {
    const d = db[c.cardId];
    const hiddenToMe = c.controller !== me && (c.position === 'facedown' || c.faceDown) && c.owner !== me;
    if (isMobile && d && !hiddenToMe) {
      setInspect(d);
      // Fuori dal proprio turno il tocco non ha altre azioni: apre subito il testo.
      if (!humanTurn) setMobileTab('card');
    }
    if (!humanTurn) return;
    if (choice) {
      if (!choice.options.includes(c.uid)) return;
      setPicks((p) => (p.includes(c.uid) ? p.filter((u) => u !== c.uid) : p.length < choice.max ? [...p, c.uid] : p));
      return;
    }
    setSelectedUid((s) => (s === c.uid ? null : c.uid));
  };

  const selectedActions = selectedUid !== null ? uidActions.get(selectedUid) ?? [] : [];
  const choiceOk = choice ? picks.length >= Math.min(choice.min, choice.options.length) && picks.length <= choice.max : false;

  const statusText = (() => {
    if (state.winner !== null) return state.winner === me ? 'Vittoria!' : config.aiPlayer === null ? `Vince il giocatore ${state.winner + 1}` : 'Sconfitta';
    if (isAiTurn) return "L'avversario sta pensando…";
    if (choice) return choice.prompt;
    if (responding) {
      if (state.pending?.kind === 'attack') return "L'avversario dichiara un attacco: vuoi rispondere?";
      if (state.pending?.kind === 'summon') return "L'avversario evoca un mostro: vuoi rispondere?";
      return "Inizia la Battle Phase avversaria: vuoi attivare qualcosa?";
    }
    if (selectedUid !== null && selectedActions.length === 0) return 'Nessuna azione possibile per questa carta adesso.';
    if (selectedUid !== null) return 'Scegli un\'azione.';
    return state.phase === 'battle' ? 'Battle Phase: seleziona un mostro per attaccare.' : `${PHASE_LABEL[state.phase]}: seleziona una carta per giocarla.`;
  })();

  const renderZone = (cards: (CardInstance | null)[], owner: PlayerId, kind: 'monster' | 'st') => (
    <div className={`zone-row zone-${kind}`}>
      {cards.map((c, i) => (
        <CardView
          key={c?.uid ?? `e${i}`}
          card={c}
          data={c ? dataOf(c) : undefined}
          slotLabel={kind === 'monster' ? 'M' : 'S/T'}
          hidden={!!c && owner !== me && (c.position === 'facedown' || !!c.faceDown)}
          selected={!!c && selectedUid === c.uid}
          highlight={!!c && (choice ? choice.options.includes(c.uid) && !picks.includes(c.uid) : uidActions.has(c.uid) && humanTurn)}
          attacking={!!c && attack?.attackerUid === c.uid}
          targeted={!!c && attack?.targetUid === c.uid}
          onClick={c ? () => clickCard(c) : undefined}
          onHover={setHover}
          db={db}
          state={state}
        />
      ))}
    </div>
  );

  const nextPhaseLabel = state.phase === 'main1' ? 'Battle Phase →' : state.phase === 'battle' ? 'Main Phase 2 →' : 'Fine turno';
  const selectedCard = selectedUid !== null ? findUid(state, selectedUid) : null;
  const showSheet = isMobile && humanTurn && !choice && (responding || selectedCard !== null);

  return (
    <div className={`duel ${state.turnPlayer === me ? 'my-turn' : 'opp-turn'}`}>
      <header className="duel-top">
        <button className="btn btn-ghost" onClick={onExit}>← Menu</button>
        <div className="phase-strip">
          <span className="turn-badge">Turno {state.turn}</span>
          {PHASES.map((p) => (
            <span key={p.key} className={`phase-pill ${state.phase === p.key || (p.key === 'draw' && state.phase === 'standby') ? 'active' : ''}`} title={p.label}>
              {p.short}
            </span>
          ))}
          <span className="turn-owner">{state.turnPlayer === me ? 'tuo turno' : 'turno avversario'}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm('Vuoi arrenderti?')) dispatch({ type: 'surrender' }); }}>Arrenditi</button>
      </header>

      <div className="duel-main">
        <div className="board">
          <PlayerPanel side="opp" name={config.aiPlayer === null ? `Giocatore ${opp + 1}` : 'Avversario'} ps={os} active={state.turnPlayer === opp} floaters={floaters.filter((f) => f.player === opp)} onGy={() => setShowGy(opp)} />

          {/* --- Avversario --- */}
          <div className="side side-opp">
            <div className="hand hand-opp">
              {os.hand.map((c) => <CardView key={c.uid} card={c} hidden size="hand" />)}
            </div>
            {renderZone(os.spellTrapZone, opp, 'st')}
            <div className="zone-with-field">
              {renderZone(os.monsterZone, opp, 'monster')}
              <CardView card={os.fieldZone} data={os.fieldZone ? dataOf(os.fieldZone) : undefined} slotLabel="F" onHover={setHover} onClick={os.fieldZone ? () => clickCard(os.fieldZone!) : undefined} db={db} state={state} />
            </div>
          </div>

          <div className={`status ${state.winner !== null ? 'status-end' : responding ? 'status-alert' : ''}`}>
            <span className="status-text">{statusText}</span>
          </div>

          {/* --- Giocatore --- */}
          <div className="side side-me">
            <div className="zone-with-field">
              <CardView card={ps.fieldZone} data={ps.fieldZone ? dataOf(ps.fieldZone) : undefined} slotLabel="F" onHover={setHover} onClick={ps.fieldZone ? () => clickCard(ps.fieldZone!) : undefined} db={db} state={state} />
              {renderZone(ps.monsterZone, me, 'monster')}
            </div>
            {renderZone(ps.spellTrapZone, me, 'st')}
            <div className="hand hand-me">
              {ps.hand.map((c) => (
                <CardView
                  key={c.uid}
                  card={c}
                  data={dataOf(c)}
                  size="hand"
                  selected={selectedUid === c.uid}
                  highlight={choice ? choice.options.includes(c.uid) && !picks.includes(c.uid) : uidActions.has(c.uid) && humanTurn}
                  onClick={() => clickCard(c)}
                  onHover={setHover}
                  db={db}
                  state={state}
                />
              ))}
              {ps.hand.length === 0 && <span className="hand-empty">Mano vuota</span>}
            </div>
          </div>

          <PlayerPanel side="me" name={config.aiPlayer === null ? `Giocatore ${me + 1}` : 'Tu'} ps={ps} active={state.turnPlayer === me} floaters={floaters.filter((f) => f.player === me)} onGy={() => setShowGy(me)} onExtra={() => setShowExtra(true)} extraActive={ps.extraDeck.some((c) => uidActions.has(c.uid))} />

          {/* --- Comandi --- */}
          <div className={`controls ${isMobile ? 'controls-mobile' : ''}`}>
            {state.winner !== null ? (
              <button className="btn btn-primary" onClick={onExit}>Torna al menu</button>
            ) : choice ? (
              <>
                <span className="muted">{picks.length}/{choice.max} selezionate{choice.min === 0 ? ' (facoltativo)' : ''}</span>
                <button className="btn btn-primary" disabled={!choiceOk || !humanTurn} onClick={() => dispatch({ type: 'choose', picks })}>Conferma</button>
              </>
            ) : responding ? (
              <>
                {legal.filter((a) => a.type !== 'pass').map((a, i) => (
                  <button key={i} className="btn btn-primary" onClick={() => dispatch(a)}>{describeAction(state, db, a)}</button>
                ))}
                <button className="btn" onClick={() => dispatch({ type: 'pass' })}>Non rispondere</button>
              </>
            ) : (
              <>
                {selectedActions.length > 0 && (
                  <div className="action-menu">
                    {selectedActions.map((a, i) => (
                      <button key={i} className={`btn ${a.type === 'attack' ? 'btn-danger' : 'btn-primary'}`} onClick={() => dispatch(a)}>{describeAction(state, db, a)}</button>
                    ))}
                  </div>
                )}
                {nextPhaseAction && humanTurn && (
                  <button className={`btn ${selectedActions.length === 0 ? 'btn-next' : ''}`} onClick={() => dispatch(nextPhaseAction)}>{nextPhaseLabel}</button>
                )}
              </>
            )}
          </div>
        </div>

        {!isMobile && (
          <aside className="sidebar">
            <CardDetail data={hover} />
            <div className="log">
              {state.log.slice(-40).reverse().map((l, i) => (
                <div key={i} className={`log-line ${l.player === me ? 'log-me' : l.player === opp ? 'log-opp' : 'log-sys'}`}>{l.text}</div>
              ))}
            </div>
          </aside>
        )}
      </div>

      {isMobile && (
        <nav className="mobile-tabs">
          <button className={mobileTab === 'card' ? 'active' : ''} onClick={() => setMobileTab(mobileTab === 'card' ? 'none' : 'card')}>Carta</button>
          <button className={mobileTab === 'log' ? 'active' : ''} onClick={() => setMobileTab(mobileTab === 'log' ? 'none' : 'log')}>Log</button>
          {nextPhaseAction && humanTurn && !choice && !responding && (
            <button className="tab-next" onClick={() => dispatch(nextPhaseAction)}>{nextPhaseLabel}</button>
          )}
        </nav>
      )}

      {isMobile && mobileTab !== 'none' && (
        <div className="mobile-sheet" onClick={() => setMobileTab('none')}>
          <div className="mobile-sheet-body" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            {mobileTab === 'card' ? (
              <CardDetail data={inspect ?? hover} touch />
            ) : (
              <div className="log">
                {state.log.slice(-60).reverse().map((l, i) => (
                  <div key={i} className={`log-line ${l.player === me ? 'log-me' : l.player === opp ? 'log-opp' : 'log-sys'}`}>{l.text}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showSheet && (
        <div className="action-sheet">
          {selectedCard && !responding && (
            <div className="action-sheet-card">
              <CardView card={selectedCard} data={dataOf(selectedCard)} size="hand" db={db} state={state} />
              <div className="action-sheet-info">
                <div className="action-sheet-name">{dataOf(selectedCard)?.name}</div>
                <button className="btn btn-ghost btn-sm" onClick={() => setMobileTab('card')}>Leggi il testo</button>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedUid(null)}>✕</button>
            </div>
          )}
          <div className="action-sheet-actions">
            {responding ? (
              <>
                <div className="action-sheet-name">{statusText}</div>
                {legal.filter((a) => a.type !== 'pass').map((a, i) => (
                  <button key={i} className="btn btn-primary" onClick={() => dispatch(a)}>{describeAction(state, db, a)}</button>
                ))}
                <button className="btn" onClick={() => dispatch({ type: 'pass' })}>Non rispondere</button>
              </>
            ) : selectedActions.length > 0 ? (
              selectedActions.map((a, i) => (
                <button key={i} className={`btn ${a.type === 'attack' ? 'btn-danger' : 'btn-primary'}`} onClick={() => dispatch(a)}>{describeAction(state, db, a)}</button>
              ))
            ) : (
              <span className="muted">Nessuna azione possibile per questa carta adesso.</span>
            )}
          </div>
        </div>
      )}

      {showExtra && (
        <Modal title="Extra Deck" onClose={() => setShowExtra(false)}>
          <div className="card-grid">
            {ps.extraDeck.map((c) => (
              <div key={c.uid} className="card-grid-item">
                <CardView card={c} data={dataOf(c)} size="hand" onHover={setHover} db={db} state={state} highlight={uidActions.has(c.uid)} />
                <div className="card-grid-actions">
                  {(uidActions.get(c.uid) ?? []).map((a, i) => (
                    <button key={i} className="btn btn-primary btn-sm" onClick={() => { dispatch(a); setShowExtra(false); }}>{describeAction(state, db, a)}</button>
                  ))}
                </div>
              </div>
            ))}
            {ps.extraDeck.length === 0 && <span className="muted">Extra Deck vuoto.</span>}
          </div>
        </Modal>
      )}

      {showGy !== null && (
        <Modal title={`Cimitero ${showGy === me ? 'tuo' : 'avversario'}`} onClose={() => setShowGy(null)}>
          <div className="card-grid">
            {state.players[showGy].graveyard.map((c) => (
              <CardView key={c.uid} card={c} data={dataOf(c)} size="hand" onHover={setHover} db={db} state={state} highlight={choice?.options.includes(c.uid)} onClick={() => clickCard(c)} selected={picks.includes(c.uid)} />
            ))}
            {state.players[showGy].graveyard.length === 0 && <span className="muted">Vuoto.</span>}
          </div>
        </Modal>
      )}

      {choice && humanTurn && (
        <div className="choice-panel">
          <div className="choice-title">{choice.prompt}</div>
          <div className="card-grid">
            {choice.options.map((uid) => {
              const c = findUid(state, uid);
              if (!c) return null;
              return <CardView key={uid} card={c} data={dataOf(c)} size="hand" db={db} state={state} onHover={setHover} selected={picks.includes(uid)} highlight={!picks.includes(uid)} onClick={() => clickCard(c)} />;
            })}
          </div>
          <button className="btn btn-primary" disabled={!choiceOk} onClick={() => dispatch({ type: 'choose', picks })}>Conferma ({picks.length})</button>
        </div>
      )}

      {banner && <div className="turn-banner"><span>{banner}</span></div>}

      {state.winner !== null && (
        <div className={`end-overlay ${state.winner === me ? 'end-win' : 'end-lose'}`}>
          <div className="end-card">
            <h2>{state.winner === me ? 'Vittoria!' : config.aiPlayer === null ? `Vince il giocatore ${state.winner + 1}` : 'Sconfitta'}</h2>
            <p>{state.winReason}</p>
            <p className="muted small">Turno {state.turn} · LP finali {ps.lp} – {os.lp}</p>
            <button className="btn btn-primary btn-big" onClick={onExit}>Torna al menu</button>
          </div>
        </div>
      )}

      {handoff && config.aiPlayer === null && state.winner === null && (
        <div className="handoff" onClick={() => setHandoff(false)}>
          <div>
            <h2>Passa il dispositivo al giocatore {actor + 1}</h2>
            <p>Tocca per continuare.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Pannello del giocatore: nome, LP con barra, pile (deck, cimitero, extra, banditi). */
function PlayerPanel({ side, name, ps, active, floaters, onGy, onExtra, extraActive }: { side: 'me' | 'opp'; name: string; ps: PlayerState; active: boolean; floaters: Floater[]; onGy: () => void; onExtra?: () => void; extraActive?: boolean }) {
  const pct = Math.max(0, Math.min(100, (ps.lp / 8000) * 100));
  const tone = pct > 50 ? 'ok' : pct > 25 ? 'warn' : 'danger';
  return (
    <div className={`player-panel panel-${side} ${active ? 'panel-active' : ''}`}>
      <div className="avatar">{name[0]}</div>
      <div className="player-info">
        <div className="player-name">{name} {active && <span className="turn-dot" title="Turno in corso" />}</div>
        <div className="lp-row">
          <span className={`lp-value lp-${tone}`}>{ps.lp}</span>
          <div className="lp-track"><div className={`lp-fill lp-${tone}`} style={{ width: `${pct}%` }} /></div>
          {floaters.map((f) => (
            <span key={f.id} className={`floater ${f.delta < 0 ? 'floater-dmg' : 'floater-heal'}`}>{f.delta > 0 ? '+' : ''}{f.delta}</span>
          ))}
        </div>
      </div>
      <div className="piles">
        <div className="pile pile-deck" title="Deck"><span className="pile-n">{ps.deck.length}</span><span className="pile-l">Deck</span></div>
        <button className="pile pile-gy" onClick={onGy} title="Cimitero"><span className="pile-n">{ps.graveyard.length}</span><span className="pile-l">Cimitero</span></button>
        {onExtra ? (
          <button className={`pile pile-extra ${extraActive ? 'pile-active' : ''}`} onClick={onExtra} title="Extra Deck"><span className="pile-n">{ps.extraDeck.length}</span><span className="pile-l">Extra</span></button>
        ) : (
          <div className="pile pile-extra" title="Extra Deck"><span className="pile-n">{ps.extraDeck.length}</span><span className="pile-l">Extra</span></div>
        )}
        {ps.banished.length > 0 && <div className="pile pile-ban" title="Carte bandite"><span className="pile-n">{ps.banished.length}</span><span className="pile-l">Banditi</span></div>}
      </div>
    </div>
  );
}

function findUid(state: GameState, uid: number): CardInstance | null {
  for (const p of state.players) {
    for (const arr of [p.hand, p.deck, p.extraDeck, p.graveyard, p.banished, p.monsterZone, p.spellTrapZone]) {
      const c = arr.find((x) => x?.uid === uid);
      if (c) return c;
    }
  }
  return null;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
