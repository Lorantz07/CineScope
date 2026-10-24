import { CONFIG } from './config.js';

const WATCHLIST_KEY = 'cinescope.watchlist.v1';
const HISTORY_KEY = 'cinescope.history.v1';
const WATCHLIST_EVENT = 'cinescope:watchlistchange';
const HISTORY_EVENT = 'cinescope:historychange';

const memory = {
  [WATCHLIST_KEY]: null,
  [HISTORY_KEY]: null,
};

let storageAvailable = canUseStorage();

function canUseStorage() {
  try {
    const key = '__cinescope_test__';
    window.localStorage.setItem(key, key);
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function readRaw(key) {
  if (!storageAvailable) return memory[key];
  try {
    return window.localStorage.getItem(key);
  } catch {
    storageAvailable = false;
    return memory[key];
  }
}

function writeRaw(key, value) {
  if (!storageAvailable) {
    memory[key] = value;
    return false;
  }
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    storageAvailable = false;
    memory[key] = value;
    return false;
  }
}

function removeRaw(key) {
  memory[key] = null;
  if (!storageAvailable) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    storageAvailable = false;
  }
}

function parseArray(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isStorageAvailable() {
  return storageAvailable;
}

export function createMovieSnapshot(movie = {}) {
  const id = Number(movie.id);
  if (!Number.isFinite(id) || id <= 0) return null;

  const title = String(movie.title || movie.name || 'Film tanpa judul').trim();
  return {
    id,
    title: title || 'Film tanpa judul',
    original_title: movie.original_title ? String(movie.original_title) : '',
    poster_path: movie.poster_path || null,
    backdrop_path: movie.backdrop_path || null,
    release_date: movie.release_date || '',
    vote_average: Number(movie.vote_average) || 0,
    vote_count: Number(movie.vote_count) || 0,
    original_language: movie.original_language || '',
  };
}

function normalizeEntries(entries, timestampField) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  const normalized = [];
  for (const entry of entries) {
    const movie = createMovieSnapshot(entry);
    if (!movie || seen.has(movie.id)) continue;
    seen.add(movie.id);
    normalized.push({
      ...movie,
      [timestampField]: entry[timestampField] || entry.addedAt || entry.viewedAt || new Date().toISOString(),
    });
  }
  return normalized;
}

export function getWatchlist() {
  let raw = readRaw(WATCHLIST_KEY);
  if (raw === null && memory[WATCHLIST_KEY]) raw = memory[WATCHLIST_KEY];
  return normalizeEntries(parseArray(raw), 'addedAt').slice(0, CONFIG.WATCHLIST_LIMIT);
}

export function isInWatchlist(id) {
  return getWatchlist().some((movie) => movie.id === Number(id));
}

export function toggleWatchlist(movie) {
  const snapshot = createMovieSnapshot(movie);
  if (!snapshot) return { added: false, watchlist: getWatchlist() };

  const current = getWatchlist();
  const exists = current.some((item) => item.id === snapshot.id);
  const watchlist = exists
    ? current.filter((item) => item.id !== snapshot.id)
    : [{ ...snapshot, addedAt: new Date().toISOString() }, ...current].slice(0, CONFIG.WATCHLIST_LIMIT);

  persistWatchlist(watchlist);
  return { added: !exists, watchlist };
}

export function removeFromWatchlist(id) {
  const watchlist = getWatchlist().filter((movie) => movie.id !== Number(id));
  persistWatchlist(watchlist);
  return watchlist;
}

export function clearWatchlist() {
  removeRaw(WATCHLIST_KEY);
  dispatchChange(WATCHLIST_EVENT, { watchlist: [] });
}

function persistWatchlist(watchlist) {
  writeRaw(WATCHLIST_KEY, JSON.stringify(watchlist));
  dispatchChange(WATCHLIST_EVENT, { watchlist });
}

export function getHistory() {
  let raw = readRaw(HISTORY_KEY);
  if (raw === null && memory[HISTORY_KEY]) raw = memory[HISTORY_KEY];
  return normalizeEntries(parseArray(raw), 'viewedAt').slice(0, CONFIG.HISTORY_LIMIT);
}

export function recordHistory(movie) {
  const snapshot = createMovieSnapshot(movie);
  if (!snapshot) return getHistory();

  const history = [
    { ...snapshot, viewedAt: new Date().toISOString() },
    ...getHistory().filter((item) => item.id !== snapshot.id),
  ].slice(0, CONFIG.HISTORY_LIMIT);

  writeRaw(HISTORY_KEY, JSON.stringify(history));
  dispatchChange(HISTORY_EVENT, { history });
  return history;
}

export function removeHistoryItem(id) {
  const history = getHistory().filter((movie) => movie.id !== Number(id));
  writeRaw(HISTORY_KEY, JSON.stringify(history));
  dispatchChange(HISTORY_EVENT, { history });
  return history;
}

export function clearHistory() {
  removeRaw(HISTORY_KEY);
  dispatchChange(HISTORY_EVENT, { history: [] });
}

function dispatchChange(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (!event.key) return;
    if (event.key === WATCHLIST_KEY) {
      dispatchChange(WATCHLIST_EVENT, { watchlist: getWatchlist() });
    }
    if (event.key === HISTORY_KEY) {
      dispatchChange(HISTORY_EVENT, { history: getHistory() });
    }
  });
}

export const STORAGE_EVENTS = Object.freeze({
  WATCHLIST: WATCHLIST_EVENT,
  HISTORY: HISTORY_EVENT,
});
