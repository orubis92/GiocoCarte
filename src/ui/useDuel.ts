import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, CardDb, Difficulty, GameState, PlayerId } from '../engine/types';
import { applyAction, createGame, type DeckList } from '../engine/reducer';
import { getLegalActions, whoActs } from '../engine/rules';
import { chooseAction } from '../engine/ai';

export interface DuelConfig {
  db: CardDb;
  decks: [DeckList, DeckList];
  difficulty: Difficulty;
  /** Giocatore controllato dall'IA (null = due umani sullo stesso dispositivo). */
  aiPlayer: PlayerId | null;
  firstPlayer: PlayerId;
  seed?: number;
}

const AI_DELAY_MS = 700;

/** Controller del duello: stato, azioni legali, turno dell'IA e cronologia per l'annulla. */
export function useDuel(config: DuelConfig) {
  const [state, setState] = useState<GameState>(() => createGame(config.db, config.decks, { firstPlayer: config.firstPlayer, seed: config.seed }));
  const [busy, setBusy] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const legal = getLegalActions(state, config.db);
  const actor = whoActs(state);
  const isAiTurn = config.aiPlayer !== null && actor === config.aiPlayer && state.winner === null;

  const dispatch = useCallback(
    (a: Action) => {
      setState((s) => {
        try {
          return applyAction(s, config.db, a);
        } catch (e) {
          console.error(e);
          return s;
        }
      });
    },
    [config.db],
  );

  // Turno dell'IA: una mossa alla volta, con una breve pausa per leggibilità.
  useEffect(() => {
    if (!isAiTurn) return;
    setBusy(true);
    const t = setTimeout(() => {
      const s = stateRef.current;
      if (s.winner !== null || whoActs(s) !== config.aiPlayer) {
        setBusy(false);
        return;
      }
      try {
        const a = chooseAction(s, config.db, config.difficulty);
        setState(applyAction(s, config.db, a));
      } catch (e) {
        console.error(e);
      }
      setBusy(false);
    }, AI_DELAY_MS);
    return () => clearTimeout(t);
  }, [isAiTurn, state, config]);

  return { state, legal, actor, isAiTurn, busy, dispatch };
}
