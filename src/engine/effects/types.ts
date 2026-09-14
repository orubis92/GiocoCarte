import type { CardDb, CardInstance, GameState, MonsterPosition, PendingChoice, PendingEvent, PlayerId } from '../types';

/**
 * Contesto passato agli script delle carte. Espone lo stato e le primitive di
 * gioco (pescare, distruggere, evocare...) così che gli script non tocchino
 * direttamente le strutture dati.
 */
export interface EffectContext {
  state: GameState;
  db: CardDb;
  /** Giocatore che controlla la carta il cui effetto si sta risolvendo. */
  player: PlayerId;
  opponent: PlayerId;
  card: CardInstance;
  /** Bersagli scelti (uid), nell'ordine restituito da `targets`. */
  targets: number[];
  /** Evento a cui si sta rispondendo (per trappole e magie rapide). */
  event: PendingEvent | null;

  data(uid: number): import('../types').CardData;
  get(uid: number): CardInstance | null;
  myMonsters(): CardInstance[];
  oppMonsters(): CardInstance[];
  mySpellTraps(): CardInstance[];
  oppSpellTraps(): CardInstance[];
  atk(card: CardInstance): number;
  def(card: CardInstance): number;
  hasFreeMonsterSlot(p: PlayerId): boolean;

  draw(p: PlayerId, n: number): void;
  destroy(uids: number[]): void;
  banish(uid: number): void;
  toGraveyard(uid: number): void;
  discard(uid: number): void;
  addToHand(uid: number): void;
  returnToHand(uid: number): void;
  specialSummon(uid: number, p: PlayerId, position: MonsterPosition): boolean;
  damage(p: PlayerId, n: number): void;
  gainLp(p: PlayerId, n: number): void;
  takeControl(uid: number, p: PlayerId, untilEndOfTurn: boolean): boolean;
  flipFaceDown(uid: number): void;
  flipFaceUp(uid: number): void;
  negateAttack(): void;
  endBattlePhase(): void;
  shuffleDeck(p: PlayerId): void;
  /** Manda al cimitero le prime n carte del deck. */
  mill(p: PlayerId, n: number): void;
  changeToDefense(uid: number): void;
  payLp(p: PlayerId, n: number): void;
  /** Rimette la carta nel deck del proprietario e lo mischia. */
  toDeck(uid: number): void;
  /** Mette la carta in cima al deck del proprietario. */
  toTopOfDeck(uid: number): void;
  /** Bonus ATK/DEF fino alla End Phase. */
  tempBoost(uid: number, atk: number, def?: number): void;
  /** Evoca un segnalino (dati in tokens.ts) per il giocatore indicato. */
  summonToken(p: PlayerId, tokenId: number, position: MonsterPosition): boolean;
  /** Numero casuale in [0,1) dal generatore della partita. */
  random(): number;
  /** Mette una carta (di solito un mostro) scoperta nella Zona Magie/Trappole del giocatore come magia continua. */
  placeInSpellZone(uid: number, p: PlayerId): boolean;
  /** Mostri (o carte) presenti nella Zona Magie/Trappole di un giocatore. */
  spellZoneCards(p: PlayerId): CardInstance[];
  ask(choice: Omit<PendingChoice, 'player'> & { player?: PlayerId }): void;
  log(text: string): void;
}

export type TriggerKind =
  | 'flip' // scoperto (flip summon o attaccato)
  | 'normalSummon'
  | 'flipSummon'
  | 'specialSummon'
  | 'summon' // qualsiasi evocazione (normale, flip, speciale)
  | 'inflictsBattleDamage' // ha inflitto danno da battaglia all'avversario
  | 'tributeSummon' // evocato normalmente con tributi
  | 'tributed' // offerto come tributo per un'evocazione
  | 'standby' // Standby Phase del proprio controllore (carte scoperte sul terreno)
  | 'standbyAny' // Standby Phase di qualsiasi turno
  | 'endPhase' // End Phase del proprio controllore (carte scoperte sul terreno)
  | 'endPhaseAny' // End Phase di qualsiasi turno
  | 'toGrave' // mandato al cimitero dal terreno
  | 'discarded' // mandato al cimitero dalla mano
  | 'destroyedByBattle'
  | 'destroysByBattle' // ha distrutto un mostro in battaglia
  | 'afterAttack'
  | 'attackedFaceDown'; // attaccato mentre coperto (Marshmallon)

export interface Trigger {
  on: TriggerKind;
  /** Elenco delle combinazioni di bersagli. Se ritorna [] l'effetto non si attiva. Ogni combinazione: uid[]. */
  targets?: (ctx: EffectContext) => number[][];
  /** Se i bersagli vanno scelti dal giocatore (via pendingChoice), qui la scelta è passata come ctx.targets. */
  resolve: (ctx: EffectContext) => void;
}

export interface Activation {
  /** main = fase principale del proprio turno; response = finestra di risposta; both. */
  timing: 'main' | 'response' | 'both';
  /** Eventi a cui può rispondere (solo per timing response/both). */
  respondsTo?: PendingEvent['kind'][];
  /** Vincolo aggiuntivo, es. "il mostro evocato ha ATK >= 1000". */
  canActivate?: (ctx: EffectContext) => boolean;
  /** Combinazioni di bersagli validi. undefined = nessun bersaglio richiesto. [] = non attivabile. */
  targets?: (ctx: EffectContext) => number[][];
  resolve: (ctx: EffectContext) => void;
  /** Per gli effetti a ignizione dei mostri: costo "offri come tributo questa carta". */
  tributeSelf?: boolean;
  /** Una volta per turno. */
  oncePerTurn?: boolean;
  /** La carta resta sul terreno dopo la risoluzione (continue, equipaggiamento, terreno). Altrimenti va al cimitero. */
  staysOnField?: boolean;
  /** Effetto di un mostro attivabile dalla mano scartando la carta stessa come costo. */
  fromHand?: boolean;
  /** L'effetto dalla mano evoca la carta stessa (non va scartata come costo). */
  selfSummon?: boolean;
  /** Effetto attivabile dal cimitero bandendo la carta stessa come costo. */
  fromGraveyard?: boolean;
}

export interface CardScript {
  /** Effetto attivabile (magie, trappole, effetti a ignizione dei mostri). */
  activation?: Activation;
  /** Effetti automatici dei mostri. */
  triggers?: Trigger[];
  /** Bonus dato dalla carta equipaggiamento al mostro. */
  equip?: { atk?: number; def?: number; cannotBeDestroyedByBattle?: boolean; piercing?: boolean; onlyIf?: (data: import('../types').CardData) => boolean };
  /** Il mostro non può essere distrutto in battaglia. */
  cannotBeDestroyedByBattle?: boolean;
  /** Danno perforante quando attacca un mostro in difesa. */
  piercing?: boolean;
  /** Finché è scoperto, nessuna trappola può essere attivata (Jinzo). */
  negatesTraps?: boolean;
  /** Il mostro non può attaccare. */
  cannotAttack?: boolean;
  /** Può attaccare direttamente anche se l'avversario controlla mostri. */
  canAttackDirectly?: boolean;
  /** Può attaccare due volte per Battle Phase. */
  extraAttack?: boolean;
  /** Non può attaccare nel turno in cui è stato evocato specialmente. */
  noAttackOnSpecialSummonTurn?: boolean;
  /** Finché è scoperto, nessuno può evocare specialmente. */
  blocksSpecialSummons?: boolean;
  /** Magia/trappola legata a un mostro (Sepoltura Prematura): se lascia il terreno, il mostro è distrutto. */
  linkedMonster?: boolean;
  /** Se lascerebbe il terreno per andare al cimitero, viene bandito. */
  banishInsteadOfGY?: boolean;
  /** Finché è scoperto, gli effetti dei mostri scoperti sul terreno sono negati (Prosciuga Abilità). */
  negatesMonsterEffects?: boolean;
  /** Restrizione continua: il mostro indicato viene tenuto in posizione di difesa (Limite di Livello - Area B). */
  forceDefense?: (ctx: EffectContext, monster: import('../types').CardInstance) => boolean;
  /** Il mostro non può essere offerto come tributo (segnalini). */
  cannotBeTributed?: boolean;
  /** Se distrutto in una Zona Mostri, va nella Zona Magie/Trappole come magia continua (Bestie Cristallo). */
  toSpellZoneWhenDestroyed?: boolean;
  /** Può essere evocato normalmente anche con 3 tributi (Gilford il Fulmine). */
  tributeThreeOption?: boolean;
  /** Non può essere evocato normalmente né posizionato. */
  cannotNormalSummon?: boolean;
  /** Non può essere evocato specialmente (da cimitero, mano, deck tramite effetti generici). */
  cannotSpecialSummon?: boolean;
  /** Non può essere evocato specialmente dal cimitero. */
  cannotSpecialSummonFromGY?: boolean;
  /** Mostro Spirit: torna in mano nella End Phase del turno in cui è stato evocato normalmente o scoperto. */
  spiritReturn?: boolean;
  /** Bonus continuo ad ATK/DEF dato ad altri mostri finché la carta è scoperta (magie terreno, aure). */
  aura?: (ctx: EffectContext, monster: import('../types').CardInstance) => { atk?: number; def?: number } | null;
  /** Restrizione continua (carta scoperta sul terreno): ritorna true se il mostro indicato non può attaccare. */
  attackRestriction?: (ctx: EffectContext, monster: import('../types').CardInstance) => boolean;
  /** Script generato automaticamente dal testo della carta (interprete a pattern). */
  auto?: boolean;
  /** Interpretazione approssimata: alcune condizioni del testo originale sono state semplificate. */
  approx?: string;
  /** Frasi del testo che l'interprete non ha capito (lo script contiene solo le restrizioni). */
  unparsed?: string[];
}
