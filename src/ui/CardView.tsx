import type { CSSProperties } from 'react';
import type { CardData, CardInstance, GameState } from '../engine/types';
import { isMonster } from '../engine/cards';
import { effectiveAtk, effectiveDef } from '../engine/stats';
import { isEffectImplemented, scriptFor } from '../engine/effects/library';

interface Props {
  card: CardInstance | null;
  data?: CardData;
  /** Mostra il retro (carta coperta dell'avversario o carta in mano avversaria). */
  hidden?: boolean;
  selected?: boolean;
  highlight?: boolean;
  /** Stati di battaglia per le animazioni. */
  attacking?: boolean;
  targeted?: boolean;
  /** Etichetta dello slot vuoto (M, S/T, F). */
  slotLabel?: string;
  onClick?: () => void;
  onHover?: (data: CardData | null) => void;
  size?: 'zone' | 'hand' | 'mini';
  db?: Record<number, CardData>;
  state?: GameState;
}

/** Colore della cornice in base al tipo di carta (richiama i colori delle carte reali). */
export function frameColor(data?: CardData): string {
  switch (data?.frameType) {
    case 'normal': return '#d9b74a';
    case 'effect': return '#e08a3c';
    case 'fusion': return '#9b6ad6';
    case 'synchro': return '#e8e6f2';
    case 'ritual': return '#4f8fd6';
    case 'spell': return '#2fa38a';
    case 'trap': return '#c94f8f';
    case 'token': return '#8a8a8a';
    default: return '#6c5aa0';
  }
}

export function CardView({ card, data, hidden, selected, highlight, attacking, targeted, slotLabel, onClick, onHover, size = 'zone', db, state }: Props) {
  const cls = ['card', `card-${size}`];
  if (!card) cls.push('card-empty');
  if (selected) cls.push('card-selected');
  if (highlight) cls.push('card-highlight');
  if (attacking) cls.push('card-attacking');
  if (targeted) cls.push('card-targeted');
  if (card?.position === 'def' || card?.position === 'facedown') cls.push('card-def');
  if (card && (card.position === 'facedown' || card.faceDown)) cls.push('card-facedown');

  if (!card) {
    return (
      <div className={cls.join(' ')}>
        {slotLabel && <span className="slot-label">{slotLabel}</span>}
      </div>
    );
  }
  const showBack = hidden || card.position === 'facedown' || card.faceDown;
  const img = data?.imageSmall;
  const bonus = card.atkMod || card.defMod || card.tempAtkMod || card.tempDefMod;
  const atk = data && isMonster(data) && db && state ? effectiveAtk(state, db, card) : null;
  const def = data && isMonster(data) && db && state ? effectiveDef(state, db, card) : null;
  const modified = atk !== null && data && (atk !== (data.atk ?? 0) || def !== (data.def ?? 0) || !!bonus);

  return (
    <div
      className={cls.join(' ')}
      style={{ '--frame': frameColor(showBack ? undefined : data) } as CSSProperties}
      onClick={onClick}
      onMouseEnter={() => !hidden && data && onHover?.(data)}
      onMouseLeave={() => onHover?.(null)}
      title={!hidden && data ? data.name : undefined}
    >
      {showBack ? (
        <div className="card-back">
          <div className="card-back-emblem" />
          {!hidden && data ? <span className="card-back-name">{data.name}</span> : null}
        </div>
      ) : img ? (
        <img src={img} alt={data?.name} loading="lazy" draggable={false} />
      ) : (
        <div className="card-placeholder">{data?.name ?? '?'}</div>
      )}
      {!showBack && atk !== null && (
        <div className={`card-stats${modified ? ' card-stats-mod' : ''}`}>
          <span>{atk}</span><span className="card-stats-sep">/</span><span>{def}</span>
        </div>
      )}
      {!showBack && card.position === 'def' && <div className="card-pos">DEF</div>}
      {card.equippedTo !== undefined && <div className="card-tag" title="Collegata a un mostro">⛓</div>}
      {(card.counters ?? 0) > 0 && <div className="card-tag card-tag-counter">{card.counters}</div>}
      {data && !showBack && (data.type === 'Spell Card' || data.type === 'Trap Card') && !isEffectImplemented(data) && (
        <div className="card-tag card-tag-warn" title="Effetto non implementato">!</div>
      )}
    </div>
  );
}

/** Pannello di dettaglio della carta (immagine grande + testo). */
export function CardDetail({ data }: { data: CardData | null }) {
  if (!data) {
    return (
      <div className="card-detail card-detail-empty">
        <div className="card-detail-ghost" />
        <p>Passa il mouse su una carta per leggerne il testo.</p>
      </div>
    );
  }
  const mon = isMonster(data);
  const implemented = isEffectImplemented(data);
  const script = scriptFor(data);
  const isVanilla = data.type === 'Normal Monster';
  return (
    <div className="card-detail" style={{ '--frame': frameColor(data) } as CSSProperties}>
      {data.image && <img src={data.image} alt={data.name} />}
      <h3>{data.name}</h3>
      <div className="card-detail-meta">
        <span className="pill" style={{ background: frameColor(data) }}>{data.type.replace(' Monster', '').replace(' Card', '')}</span>
        {mon && <span>{data.attribute} · {data.race} · {'★'.repeat(Math.min(data.level ?? 0, 12))}</span>}
        {!mon && <span>{data.race}</span>}
      </div>
      {mon && (
        <div className="card-detail-stats">
          <span>ATK <b>{data.atk}</b></span>
          <span>DEF <b>{data.def}</b></span>
        </div>
      )}
      <p className="card-detail-desc">{data.desc}</p>
      {!isVanilla && !implemented && (
        <div className="card-detail-warn">
          {mon ? (script?.cannotNormalSummon ? 'Metodo di evocazione non supportato: la carta non è evocabile.' : 'Effetto non ancora implementato: il mostro gioca come un mostro normale.') : 'Effetto non ancora implementato: la carta può solo essere posizionata.'}
        </div>
      )}
      {implemented && script?.approx && <div className="card-detail-warn">Semplificazione: {script.approx}</div>}
      {implemented && script?.auto && !script.approx && <div className="card-detail-note">Effetto interpretato automaticamente dal testo della carta.</div>}
    </div>
  );
}
