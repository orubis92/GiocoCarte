import type { CardData } from '../engine/types';

// ---------------------------------------------------------------------------
// Accesso al database carte di YGOPRODeck (https://ygoprodeck.com/api-guide/)
// con cache persistente in IndexedDB: dopo il primo caricamento le carte dei
// deck sono disponibili anche offline.
// ---------------------------------------------------------------------------

const API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';

interface ApiCard {
  id: number;
  name: string;
  type: string;
  frameType: string;
  desc: string;
  race: string;
  attribute?: string;
  level?: number;
  atk?: number;
  def?: number;
  card_images?: { id: number; image_url: string; image_url_small: string; image_url_cropped?: string }[];
}

export function normalizeCard(c: ApiCard): CardData {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    frameType: c.frameType,
    desc: c.desc,
    race: c.race,
    attribute: c.attribute,
    level: c.level,
    atk: c.atk,
    def: c.def,
    imageSmall: c.card_images?.[0]?.image_url_small,
    image: c.card_images?.[0]?.image_url,
  };
}

// ------------------------------------------------------------ IndexedDB

const DB_NAME = 'yugioh-cards';
const STORE = 'cards';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('name', 'name', { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function cacheGetByNames(names: string[]): Promise<Map<string, CardData>> {
  const out = new Map<string, CardData>();
  const db = await openDb();
  if (!db) return out;
  await Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve) => {
          const req = db.transaction(STORE).objectStore(STORE).index('name').get(name);
          req.onsuccess = () => {
            if (req.result) out.set(name, req.result as CardData);
            resolve();
          };
          req.onerror = () => resolve();
        }),
    ),
  );
  return out;
}

async function cacheGetByIds(ids: number[]): Promise<Map<number, CardData>> {
  const out = new Map<number, CardData>();
  const db = await openDb();
  if (!db) return out;
  await Promise.all(
    ids.map(
      (id) =>
        new Promise<void>((resolve) => {
          const req = db.transaction(STORE).objectStore(STORE).get(id);
          req.onsuccess = () => {
            if (req.result) out.set(id, req.result as CardData);
            resolve();
          };
          req.onerror = () => resolve();
        }),
    ),
  );
  return out;
}

async function cachePut(cards: CardData[]): Promise<void> {
  const db = await openDb();
  if (!db || cards.length === 0) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const c of cards) store.put(c);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ------------------------------------------------------- dataset locale

/**
 * Carte fino all'era GX incluse nell'app (public/data/cards-gx.json): permettono
 * di giocare e costruire deck senza rete. Le altre ere passano dall'API.
 */
export async function loadBundledCards(): Promise<CardData[]> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/cards-gx.json`);
    if (!res.ok) return [];
    return (await res.json()) as CardData[];
  } catch {
    return [];
  }
}

// ------------------------------------------------------------- fetch

async function apiFetch(params: Record<string, string>): Promise<ApiCard[]> {
  const url = `${API}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const json = await res.json();
  return (json.data ?? []) as ApiCard[];
}

export interface FetchResult {
  cards: CardData[];
  missing: string[];
}

/**
 * Carica le carte per nome esatto (inglese). Prima dalla cache, poi dall'API
 * in blocco; se il blocco fallisce (basta un nome errato), una per una.
 */
export async function fetchCardsByNames(names: string[], onProgress?: (done: number, total: number) => void): Promise<FetchResult> {
  const unique = [...new Set(names)];
  const cached = await cacheGetByNames(unique);
  const cards: CardData[] = [...cached.values()];
  const toFetch = unique.filter((n) => !cached.has(n));
  const missing: string[] = [];
  onProgress?.(cards.length, unique.length);
  if (toFetch.length === 0) return { cards, missing };

  const fetched: CardData[] = [];
  const chunks: string[][] = [];
  for (let i = 0; i < toFetch.length; i += 30) chunks.push(toFetch.slice(i, i + 30));
  for (const chunk of chunks) {
    try {
      const data = await apiFetch({ name: chunk.join('|') });
      fetched.push(...data.map(normalizeCard));
    } catch {
      // Un nome sbagliato fa fallire tutta la richiesta: riprova uno alla volta.
      for (const name of chunk) {
        try {
          const data = await apiFetch({ name });
          if (data.length) fetched.push(normalizeCard(data[0]));
          else missing.push(name);
        } catch {
          missing.push(name);
        }
      }
    }
    onProgress?.(cards.length + fetched.length, unique.length);
  }
  // Alcune carte hanno più illustrazioni con id diversi: teniamo la prima per nome.
  const byName = new Map<string, CardData>();
  for (const c of fetched) if (!byName.has(c.name)) byName.set(c.name, c);
  const finalFetched = [...byName.values()];
  for (const n of toFetch) if (!byName.has(n) && !missing.includes(n)) missing.push(n);
  await cachePut(finalFetched);
  return { cards: [...cards, ...finalFetched], missing };
}

export async function fetchCardsByIds(ids: number[]): Promise<CardData[]> {
  const unique = [...new Set(ids)];
  const cached = await cacheGetByIds(unique);
  const cards: CardData[] = [...cached.values()];
  const toFetch = unique.filter((id) => !cached.has(id));
  for (let i = 0; i < toFetch.length; i += 50) {
    const chunk = toFetch.slice(i, i + 50);
    try {
      const data = await apiFetch({ id: chunk.join(',') });
      const norm = data.map(normalizeCard);
      cards.push(...norm);
      await cachePut(norm);
    } catch (e) {
      console.warn('Impossibile caricare alcune carte', e);
    }
  }
  return cards;
}

/** Ricerca per nome parziale (deck builder). */
export async function searchCards(query: string, limit = 40): Promise<CardData[]> {
  if (query.trim().length < 2) return [];
  try {
    const data = await apiFetch({ fname: query.trim(), num: String(limit), offset: '0' });
    const cards = data.map(normalizeCard);
    await cachePut(cards);
    return cards;
  } catch {
    return [];
  }
}
