# Duello di carte

Gioco di carte ispirato a Yu-Gi-Oh!, giocabile nel browser (PWA), con avversario automatico a tre livelli di difficoltà e modalità a due giocatori sullo stesso dispositivo. I dati e le immagini delle carte arrivano da [YGOPRODeck](https://ygoprodeck.com/api-guide/).

Progetto amatoriale non ufficiale. Yu-Gi-Oh! è un marchio di Konami.


## Avvio

```bash
npm install
npm run dev        # sviluppo, apre http://localhost:5173
npm test           # test del motore di gioco (non serve la rete)
npm run build      # build di produzione in dist/ (PWA installabile)
```

Le carte fino all'era GX sono incluse nell'app; per i deck con carte più recenti (es. Synchro) e per le immagini serve la rete al primo utilizzo (poi restano in cache: IndexedDB per i dati, service worker per le immagini).

## Pubblicazione su GitHub Pages

Il repository contiene un workflow (`.github/workflows/deploy.yml`) che a ogni push sul ramo principale esegue i test, costruisce l'app e la pubblica su GitHub Pages. Configurazione, da fare una volta sola:

1. Crea il repository su GitHub (deve essere **pubblico**: Pages sui repository privati richiede un piano a pagamento) e fai il push del progetto.
2. Su GitHub apri **Settings → Pages** e in **Build and deployment → Source** scegli **GitHub Actions**.
3. Nella scheda **Actions** attendi che il workflow "Pubblica su GitHub Pages" finisca (1–2 minuti).

Da quel momento l'app è raggiungibile a `https://<utente>.github.io/<repo>/` (l'indirizzo esatto compare in Settings → Pages e nel riepilogo del workflow), senza PC acceso. Ogni push successivo aggiorna il sito da solo; l'app installata sui telefoni si aggiorna alla prima apertura con rete.

Il percorso base viene ricavato dal nome del repository (`BASE_PATH=/<repo>/` nel workflow), quindi rinominare il repository non richiede modifiche al codice. In locale (`npm run dev`, `Avvia.cmd`) il base resta `/`.

## Su smartphone e tablet

L'app è una PWA con layout touch (mano scorrevole, azioni in un foglio dal basso, schede Carta/Log). Per installarla sul telefono:

1. Apri nel browser l'indirizzo GitHub Pages qui sopra (oppure, senza pubblicazione, l'indirizzo di rete locale stampato da `Avvia.cmd`, es. `http://192.168.1.10:4173`, con il telefono sulla stessa Wi-Fi).
2. Dal menu del browser scegli **Aggiungi a schermata Home** (Android/Chrome) o **Condividi → Aggiungi alla schermata Home** (iPhone/Safari): da lì l'app si apre a schermo intero con la sua icona e funziona anche senza rete, purché sia stata aperta almeno una volta.

La partita gira interamente sul telefono: la rete serve solo per il primo caricamento, per gli aggiornamenti e per le immagini delle carte non ancora in cache. Per un'app da store (APK / App Store) il passo successivo è impacchettare la stessa build con Capacitor.

## Struttura

```
src/
  engine/            Motore di gioco in TypeScript puro (nessuna dipendenza da React)
    types.ts         Tipi: carte, stato, azioni
    cards.ts         Classificazione carte, parsing materiali fusione/synchro/rituale, RNG
    rules.ts         Generazione delle azioni legali (l'unico punto in cui vivono le regole "cosa posso fare")
    reducer.ts       applyAction(stato, azione) → nuovo stato; fasi, evocazioni, battaglia, setup partita
    context.ts       Primitive di gioco (pescare, distruggere, evocare...) e dispatch dei trigger
    stats.ts         ATK/DEF effettivi (modificatori + aure continue)
    tokens.ts        Segnalini
    effects/
      types.ts       Interfaccia degli script delle carte
      library.ts     Effetti scritti a mano (era classica), indicizzati per nome inglese
      library-gx.ts  Effetti scritti a mano (era GX)
      auto.ts        Interprete automatico del testo delle carte
    ai.ts            Avversario automatico (facile / medio / difficile)
  scripts/           Strumenti: copertura dell'interprete, dump delle frasi non capite
  data/cards-gx.json Corpus delle carte fino all'era GX (copiato anche in public/data)
  data/
    api.ts           Client YGOPRODeck + cache IndexedDB
    decks.ts         Deck predefiniti (per nome) e deck salvati (localStorage)
  ui/                Interfaccia React: menu, deck builder, tavolo di gioco
tests/               Test del motore (node:test via tsx): fixture fittizie + carte reali del corpus GX
```

Il motore è un reducer puro: `getLegalActions(state, db)` elenca tutto ciò che il giocatore di turno può fare e `applyAction(state, db, action)` restituisce il nuovo stato. UI e IA consumano la stessa lista, quindi non possono fare mosse illegali. Questa separazione è pensata per il multiplayer online: basterà eseguire il reducer su un server (o in modo autoritativo su un client) e sincronizzare le azioni.

## Regole implementate

- Turno con Draw / Main 1 / Battle / Main 2 / End, 8000 LP, 5 carte iniziali, chi inizia non pesca né attacca al turno 1, limite di 6 carte in mano.
- Evocazione normale e posizionamento coperto (1 per turno), tributi (1 per livello 5–6, 2 per 7+), flip summon, cambio di posizione (1 per turno, non nel turno in cui il mostro è arrivato o ha attaccato).
- Battaglia con posizioni ATK/DEF, danni, attacchi diretti, mostri coperti scoperti quando attaccati, effetti flip.
- Evocazione Fusione (Polimerizzazione con materiali a nome esatto), Synchro (Tuner + non-Tuner con somma livelli esatta, requisiti su razza/attributo dei non-Tuner), Rituale (magia rituale dedicata, tributi con livelli sufficienti).
- Finestre di risposta semplificate (catena di lunghezza 1): l'avversario può attivare trappole o magie rapide quando dichiari un attacco o evochi un mostro.
- Magie continue/equipaggiamento e magie terreno sul terreno (aure ATK/DEF), Spade della Luce Rivelatrice, Jinzo, Prosciuga Abilità, mostri indistruttibili in battaglia, danno perforante, doppio attacco, segnalini (Capro Espiatorio, Ojama Trio), controllo temporaneo, effetti dalla mano e dal cimitero, trigger di Standby/End Phase, finestra di risposta all'inizio della Battle Phase.

Non implementati (per scelta, prima versione): XYZ, Link, Pendulum, catene lunghe e trappole contro, effetti "una volta per duello", contatori generici, lanci di moneta.

## Carte ed effetti

L'app include il database delle 2.964 carte uscite fino alla fine dell'era GX (`public/data/cards-gx.json`, TCG fino ad agosto 2008): si gioca e si costruiscono deck senza rete. Il deck builder può cercare anche online (tutte le ere) tramite l'API.

Gli effetti arrivano da tre fonti, in quest'ordine:

1. **Libreria scritta a mano** (`effects/library.ts`, `effects/library-gx.ts`, `effects/library-anime.ts`): carte chiave dell'era classica e GX (Monarchi, Elemental HERO, Cyber Dragon, Chaos Sorcerer, Skill Drain, Scapegoat...) e gli archetipi dei personaggi dell'anime (Bestie Cristallo, Toon, Vehicroid, Volcanic, Ojama e Draghi Armati LV, fusioni a contatto XYZ, dadi e monete, Arpie, Relinquished, Exodia). Dove il testo è stato semplificato, la carta riporta una nota "Semplificazione".
2. **Interprete automatico del testo** (`effects/auto.ts`): riconosce le formule ricorrenti del testo inglese ("Draw 2 cards.", "Target 1 monster on the field; destroy it.", "FLIP: ...", "When an opponent's monster declares an attack: ...", "All WATER monsters gain 200 ATK/DEF", "Equip only to a Warrior monster. It gains 300 ATK.", "If only your opponent controls a monster, you can Special Summon this card.") e le traduce in script. È conservativo: se una sola frase non viene capita, magie e trappole non diventano attivabili e i mostri ricevono solo le restrizioni (mai un effetto parziale che li avvantaggi).
3. **Vaniglia**: tutto il resto. I mostri combattono normalmente; magie e trappole si possono solo posizionare.

`npm run coverage` stampa la copertura per categoria sul corpus GX; `npm run unparsed` scrive in `data/unparsed.txt` le frasi non capite, utile per estendere l'interprete. Stato attuale: circa il 30% delle carte GX è pienamente giocabile (100% dei mostri normali, ~19% dei mostri con effetto, ~30% delle magie normali), con la copertura concentrata sulle carte più usate.

Aggiungere un effetto significa aggiungere una voce a `LIBRARY`, ad esempio:

```ts
'Pot of Greed': {
  activation: { timing: 'main', resolve: (ctx) => ctx.draw(ctx.player, 2) },
},
```

Per i trigger dei mostri (`triggers: [{ on: 'flip', targets, resolve }]`) e per le trappole in risposta (`timing: 'response', respondsTo: ['attack']`) vedere gli esempi già presenti. Il contesto `ctx` espone le primitive (`draw`, `destroy`, `specialSummon`, `ask` per far scegliere al giocatore...).

## Deck predefiniti

`src/data/decks.ts` contiene 33 deck da 40 carte, divisi in sezioni nella selezione: 15 duellanti di *Duel Monsters* (Yugi, Kaiba, Joey, Pegasus, Mai, Bakura, Marik, Rex, Weevil, Mako, Keith, Ishizu, Odion, Duke, Yugi con Exodia), 14 di *GX* (Jaden, Zane, Chazz, Alexis, Bastion, Syrus, Aster, Jesse, Axel, Hassleberry, Crowler, Camula, Adrian, Sartorius) e 4 deck di base. Sono composti solo da carte reali del database (niente carte "anime only"); ogni tessera mostra quante carte del deck hanno l'effetto attivo, così si sa in anticipo quanto fedele sarà la partita.

## Intelligenza artificiale

- **Facile**: sceglie a caso tra le azioni legali, evitando solo gli attacchi suicidi.
- **Medio**: simula ogni azione possibile e valuta lo stato risultante (LP, terreno, mano, minaccia avversaria).
- **Difficile**: cerca sequenze di mosse nel proprio turno (profondità 4, ampiezza 4) valutando anche la minaccia del turno successivo.

L'IA non bara: prima di simulare, mano e carte coperte dell'avversario vengono sostituite con carte "ignote" e i deck rimescolati.

## Prossimi passi

- Multiplayer online (stanze, sincronizzazione delle azioni) riusando lo stesso motore.
- Estendere l'interprete (contatori, lanci di moneta, effetti "fino alla End Phase" più generali) e la libreria manuale.
- Scelta della posizione per le evocazioni speciali, catene, trappole contro.
