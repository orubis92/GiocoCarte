// ---------------------------------------------------------------------------
// Tipi fondamentali del motore di gioco. Nessuna dipendenza da React o browser:
// il motore deve poter girare identico nel client, nei test e in un futuro
// server per il multiplayer online.
// ---------------------------------------------------------------------------

/** Dati statici di una carta (come restituiti da YGOPRODeck, normalizzati). */
export interface CardData {
  id: number;
  name: string;
  /** Es. "Normal Monster", "Effect Monster", "Synchro Monster", "Spell Card", "Trap Card" */
  type: string;
  /** normal | effect | fusion | synchro | ritual | spell | trap | ... */
  frameType: string;
  desc: string;
  /** Per i mostri: razza (Dragon, Warrior...). Per magie/trappole: sottotipo (Normal, Quick-Play, Continuous, Equip, Field, Ritual, Counter). */
  race: string;
  attribute?: string;
  level?: number;
  atk?: number;
  def?: number;
  imageSmall?: string;
  image?: string;
}

export type CardDb = Record<number, CardData>;

export type PlayerId = 0 | 1;

export type MonsterPosition = 'atk' | 'def' | 'facedown';

export interface CardInstance {
  /** Identificativo univoco dell'istanza nella partita. */
  uid: number;
  cardId: number;
  owner: PlayerId;
  controller: PlayerId;
  /** Solo per mostri sul terreno. */
  position?: MonsterPosition;
  /** Per magie/trappole sul terreno: true = coperta. */
  faceDown?: boolean;
  /** Turno in cui è stata messa sul terreno (per posizione, trappole, flip summon). */
  placedTurn?: number;
  /** Turno in cui è stata cambiata di posizione l'ultima volta. */
  positionChangedTurn?: number;
  hasAttackedThisTurn?: boolean;
  /** Attacchi dichiarati in questo turno. */
  attacksThisTurn?: number;
  /** Come è arrivato sul terreno. */
  summonedHow?: 'normal' | 'flip' | 'special' | 'set';
  /** Tributi usati per l'evocazione normale. */
  summonTributes?: number;
  /** Se è una carta equipaggiamento: uid del mostro equipaggiato. */
  equippedTo?: number;
  /** Modificatori permanenti di ATK/DEF (equipaggiamenti, effetti). */
  atkMod?: number;
  defMod?: number;
  /** Modificatori "fino alla End Phase" (azzerati a fine turno). */
  tempAtkMod?: number;
  tempDefMod?: number;
  /** Il mostro è stato scoperto (già usato l'effetto flip). */
  flipped?: boolean;
  /** Controllo temporaneo (Change of Heart): torna al proprietario a fine turno. */
  controlUntilEndOfTurn?: boolean;
  /** Evocato specialmente in modo corretto (per Rinascita del Mostro serve). */
  properlySummoned?: boolean;
  /** Uso di un effetto "una volta per turno". */
  effectUsedTurn?: number;
  counters?: number;
  /** Turno oltre il quale la carta viene mandata al cimitero (Spade della Luce Rivelatrice). */
  expiresTurn?: number;
}

export interface PlayerState {
  lp: number;
  hand: CardInstance[];
  /** Indice 0 = cima del deck. */
  deck: CardInstance[];
  extraDeck: CardInstance[];
  graveyard: CardInstance[];
  banished: CardInstance[];
  monsterZone: (CardInstance | null)[];
  spellTrapZone: (CardInstance | null)[];
  fieldZone: CardInstance | null;
  normalSummonedThisTurn: boolean;
  /** Turni (dell'avversario) durante i quali non può attaccare: Spade della Luce Rivelatrice. */
  cannotAttackUntilTurn?: number;
  /** Waboku attivo: nessun danno da battaglia e mostri non distrutti in battaglia questo turno. */
  wabokuTurn?: number;
  /** Turno in cui questo giocatore non può dichiarare attacchi (Ruggito Minaccioso). */
  noAttackTurn?: number;
  /** Turno in cui questo giocatore non subisce danni da battaglia (Kuriboh, Kuriboh Alato). */
  noBattleDamageTurn?: number;
  /** Turni in cui la Draw Phase va saltata (Avidità Sconsiderata). */
  skipDraws?: number;
}

export type Phase = 'draw' | 'standby' | 'main1' | 'battle' | 'main2' | 'end';

/** Evento a cui l'avversario può rispondere (finestra di risposta semplificata: catena di lunghezza 1). */
export type PendingEvent =
  | { kind: 'attack'; attackerUid: number; targetUid: number | null; responder: PlayerId }
  | { kind: 'summon'; cardUid: number; how: 'normal' | 'flip' | 'special'; responder: PlayerId }
  /** Inizio della Battle Phase: l'avversario può attivare carte prima degli attacchi. */
  | { kind: 'battleStart'; responder: PlayerId };

/** Scelta in sospeso da parte di un giocatore (es. scartare 2 carte dopo Carità Graziosa). */
export interface PendingChoice {
  player: PlayerId;
  prompt: string;
  /** uid delle carte tra cui scegliere. */
  options: number[];
  min: number;
  max: number;
  /** Cosa fare con le carte scelte. */
  resolve: ChoiceResolution;
}

export type ChoiceResolution =
  | { kind: 'discard' }
  | { kind: 'destroy' }
  | { kind: 'addToHand'; shuffleDeck?: boolean }
  | { kind: 'specialSummon'; position: MonsterPosition; shuffleDeck?: boolean }
  | { kind: 'returnToHand' }
  | { kind: 'sendToGraveyard'; shuffleDeck?: boolean }
  | { kind: 'banish' }
  | { kind: 'toDeck' }
  | { kind: 'placeInSpellZone'; shuffleDeck?: boolean }
  | { kind: 'endPhaseDiscard' }
  /** Scelta del bersaglio di un effetto trigger: al termine viene chiamato il resolve del trigger. */
  | { kind: 'trigger'; cardUid: number; index: number };

export interface LogEntry {
  turn: number;
  player?: PlayerId;
  text: string;
}

export interface GameState {
  players: [PlayerState, PlayerState];
  turn: number;
  turnPlayer: PlayerId;
  phase: Phase;
  /** Chi deve agire adesso (durante una finestra di risposta può essere l'avversario del turno). */
  priority: PlayerId;
  pending: PendingEvent | null;
  /** Coda di scelte in sospeso: la prima è quella attiva. */
  pendingChoices: PendingChoice[];
  /** Mostri già dichiarati in attacco in questo turno, gestione battaglia. */
  attackNegatedForUids: number[];
  winner: PlayerId | null;
  winReason?: string;
  log: LogEntry[];
  nextUid: number;
  /** Seed per la casualità deterministica (test e replay). */
  rngSeed: number;
  /** Il primo giocatore non pesca né attacca al turno 1. */
  firstPlayer: PlayerId;
}

// ---------------------------------------------------------------------------
// Azioni: tutto ciò che un giocatore (umano o IA) può fare. Il motore genera la
// lista delle azioni legali e ne applica una alla volta.
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'nextPhase' }
  | { type: 'normalSummon'; cardUid: number; position: 'atk' | 'facedown'; tributeUids: number[] }
  | { type: 'flipSummon'; cardUid: number }
  | { type: 'changePosition'; cardUid: number }
  | { type: 'setSpellTrap'; cardUid: number }
  | { type: 'activateSpell'; cardUid: number; targets: number[] }
  | { type: 'activateTrap'; cardUid: number; targets: number[] }
  | { type: 'activateMonsterEffect'; cardUid: number; targets: number[] }
  | { type: 'fusionSummon'; fusionUid: number; materialUids: number[]; polymerizationUid: number }
  | { type: 'synchroSummon'; synchroUid: number; materialUids: number[] }
  | { type: 'ritualSummon'; ritualSpellUid: number; ritualMonsterUid: number; tributeUids: number[] }
  | { type: 'attack'; attackerUid: number; targetUid: number | null }
  | { type: 'pass' }
  | { type: 'choose'; picks: number[] }
  | { type: 'surrender' };

export type Difficulty = 'facile' | 'medio' | 'difficile';
