import { CONFIG } from './config.js';
import { getImageUrl } from './api.js';
import {
  createMovieSnapshot,
  isInWatchlist,
} from './storage.js';

const PLACEHOLDER_POSTER = 'assets/images/poster-placeholder.svg';
const PLACEHOLDER_BACKDROP = 'assets/images/backdrop-placeholder.svg';
const initializedCarousels = new WeakSet();
const numberFormatter = new Intl.NumberFormat('id-ID');
const compactNumberFormatter = new Intl.NumberFormat('id-ID', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const relativeTimeFormatter = new Intl.RelativeTimeFormat('id-ID', { numeric: 'auto' });
const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
let languageNames = null;
let regionNames = null;

export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function icon(name, className = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `assets/icons/sprite.svg#icon-${name}`);
  svg.append(use);
  return svg;
}

export function setIcon(svg, name) {
  const use = svg?.querySelector?.('use');
  if (use) use.setAttribute('href', `assets/icons/sprite.svg#icon-${name}`);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function posterUrl(path, size = CONFIG.POSTER_SIZE) {
  return getImageUrl(path, size) || PLACEHOLDER_POSTER;
}

export function backdropUrl(path, size = CONFIG.BACKDROP_SIZE) {
  return getImageUrl(path, size) || PLACEHOLDER_BACKDROP;
}

export function profileUrl(path) {
  return getImageUrl(path, CONFIG.PROFILE_SIZE);
}

export function posterPlaceholder() {
  return PLACEHOLDER_POSTER;
}

export function backdropPlaceholder() {
  return PLACEHOLDER_BACKDROP;
}

export function attachImageFallback(img, fallback = PLACEHOLDER_POSTER) {
  img.addEventListener(
    'error',
    () => {
      if (img.src.includes(fallback)) return;
      img.src = fallback;
    },
    { once: true },
  );
}

export function getYear(releaseDate) {
  if (!releaseDate || typeof releaseDate !== 'string') return '';
  const year = releaseDate.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : '';
}

export function formatDate(releaseDate) {
  if (!releaseDate) return 'Tanggal rilis belum tersedia';
  const date = new Date(`${releaseDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Tanggal rilis belum tersedia';
  return dateFormatter.format(date);
}

export function formatRating(rating) {
  const value = Number(rating);
  return Number.isFinite(value) && value > 0 ? value.toFixed(1) : '—';
}

export function formatVoteCount(count) {
  const value = Number(count);
  if (!Number.isFinite(value) || value <= 0) return '';
  return `${compactNumberFormatter.format(value)} suara`;
}

export function formatRuntime(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return '';
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (!hours) return `${mins} menit`;
  return mins ? `${hours} jam ${mins} menit` : `${hours} jam`;
}

export function formatLanguage(code) {
  if (!code) return 'Tidak diketahui';
  try {
    languageNames ||= new Intl.DisplayNames(['id'], { type: 'language' });
    return languageNames.of(code) || String(code).toUpperCase();
  } catch {
    return String(code).toUpperCase();
  }
}

export function formatCountry(code, fallback = '') {
  if (!code) return fallback;
  try {
    regionNames ||= new Intl.DisplayNames(['id'], { type: 'region' });
    return regionNames.of(code) || fallback || String(code).toUpperCase();
  } catch {
    return fallback || String(code).toUpperCase();
  }
}

export function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0);
}

export function formatRelativeTime(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 60) return 'Baru saja';
  if (abs < 3600) return relativeTimeFormatter.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86400) return relativeTimeFormatter.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 86400 * 30) return relativeTimeFormatter.format(Math.round(diffSeconds / 86400), 'day');
  return dateFormatter.format(date);
}

const genreIcons = {
  28: 'bolt',
  12: 'compass',
  16: 'sparkles',
  35: 'smile',
  80: 'shield',
  99: 'film',
  18: 'masks',
  10751: 'users',
  14: 'sparkles',
  36: 'hourglass',
  27: 'eye',
  10402: 'music',
  9648: 'search',
  10749: 'heart',
  878: 'rocket',
  53: 'eye',
  10752: 'shield',
  37: 'sun',
  10770: 'tv',
};

export function getGenreIcon(genreId) {
  return genreIcons[Number(genreId)] || 'tag';
}

export function movieToButtonData(movie) {
  const snapshot = createMovieSnapshot(movie);
  if (!snapshot) return null;
  return {
    movieId: String(snapshot.id),
    title: snapshot.title,
    posterPath: snapshot.poster_path || '',
    backdropPath: snapshot.backdrop_path || '',
    releaseDate: snapshot.release_date || '',
    rating: String(snapshot.vote_average || 0),
    votes: String(snapshot.vote_count || 0),
    originalLanguage: snapshot.original_language || '',
  };
}

export function applyButtonData(button, movie) {
  const data = movieToButtonData(movie);
  if (!data) return false;
  Object.assign(button.dataset, data);
  return true;
}

export function readMovieFromButton(button) {
  const id = Number(button?.dataset.movieId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return {
    id,
    title: button.dataset.title || 'Film tanpa judul',
    poster_path: button.dataset.posterPath || null,
    backdrop_path: button.dataset.backdropPath || null,
    release_date: button.dataset.releaseDate || '',
    vote_average: Number(button.dataset.rating) || 0,
    vote_count: Number(button.dataset.votes) || 0,
    original_language: button.dataset.originalLanguage || '',
  };
}

export function createWatchlistButton(movie, { variant = 'icon' } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.watchlistToggle = '';
  button.dataset.variant = variant;
  applyButtonData(button, movie);

  if (variant === 'button') {
    button.className = 'button button--secondary watchlist-button';
  } else {
    button.className = 'movie-card__watchlist';
  }

  button.append(icon('plus'));
  const label = document.createElement('span');
  label.dataset.watchlistLabel = '';
  if (variant === 'button') label.textContent = 'Tambah ke Watchlist';
  else label.className = 'sr-only';
  button.append(label);
  applyWatchlistButtonState(button);
  return button;
}

export function applyWatchlistButtonState(button) {
  const movieId = Number(button?.dataset.movieId);
  const saved = Number.isInteger(movieId) && isInWatchlist(movieId);
  const title = button?.dataset.title || 'film ini';
  const variant = button?.dataset.variant || 'icon';

  button.classList.toggle('is-saved', saved);
  button.classList.toggle('is-active', saved);
  button.setAttribute('aria-pressed', String(saved));
  const actionLabel = saved ? `Hapus ${title} dari Watchlist` : `Tambah ${title} ke Watchlist`;
  button.title = actionLabel;

  const svg = button.querySelector('svg');
  setIcon(svg, saved ? 'check' : 'plus');
  const label = button.querySelector('[data-watchlist-label]');
  if (label && variant === 'button') {
    label.textContent = saved ? 'Tersimpan di Watchlist' : 'Tambah ke Watchlist';
    button.removeAttribute('aria-label');
  } else {
    button.setAttribute('aria-label', actionLabel);
  }
}

export function refreshWatchlistButtons(root = document) {
  qsa('[data-watchlist-toggle]', root).forEach(applyWatchlistButtonState);
}

export function createMovieCard(movie, { note = '' } = {}) {
  const snapshot = createMovieSnapshot(movie);
  if (!snapshot) return null;

  const article = document.createElement('article');
  article.className = 'movie-card';
  article.dataset.movieId = String(snapshot.id);

  const media = document.createElement('div');
  media.className = 'movie-card__media';

  const posterLink = document.createElement('a');
  posterLink.className = 'movie-card__poster-link';
  posterLink.href = `movie.html?id=${snapshot.id}`;
  posterLink.setAttribute('aria-label', `Lihat detail ${snapshot.title}`);

  const img = document.createElement('img');
  img.className = 'movie-card__poster';
  img.src = posterUrl(snapshot.poster_path, CONFIG.POSTER_SMALL_SIZE);
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.width = 342;
  img.height = 513;
  attachImageFallback(img);
  posterLink.append(img);

  media.append(posterLink, createWatchlistButton(snapshot));

  const body = document.createElement('div');
  body.className = 'movie-card__body';

  const title = document.createElement('h3');
  title.className = 'movie-card__title';
  const titleLink = document.createElement('a');
  titleLink.href = posterLink.href;
  titleLink.textContent = snapshot.title;
  title.append(titleLink);

  const meta = document.createElement('div');
  meta.className = 'movie-card__meta';
  appendRating(meta, snapshot);
  const year = getYear(snapshot.release_date);
  if (year) {
    const yearSpan = document.createElement('span');
    yearSpan.className = 'movie-card__year';
    yearSpan.textContent = year;
    meta.append(yearSpan);
  }

  body.append(title, meta);

  if (note) {
    const noteElement = document.createElement('p');
    noteElement.className = 'movie-card__note';
    noteElement.textContent = note;
    body.append(noteElement);
  }

  article.append(media, body);
  return article;
}

function appendRating(container, movie) {
  if (!Number(movie.vote_count) || !Number(movie.vote_average)) return;
  const rating = document.createElement('span');
  rating.className = 'rating';
  rating.setAttribute('aria-label', `Rating TMDB ${formatRating(movie.vote_average)}`);
  rating.title = 'Rating TMDB';
  const star = icon('star', 'icon rating__icon');
  const value = document.createElement('span');
  value.textContent = formatRating(movie.vote_average);
  rating.append(star, value);
  container.append(rating);

  const votes = formatVoteCount(movie.vote_count);
  if (votes) {
    const voteSpan = document.createElement('span');
    voteSpan.className = 'movie-card__votes';
    voteSpan.textContent = votes;
    container.append(voteSpan);
  }
}

export function createSkeletonCard() {
  const card = document.createElement('div');
  card.className = 'movie-card movie-card--skeleton';
  card.setAttribute('aria-hidden', 'true');
  card.innerHTML = `
    <div class="skeleton movie-card__media-skeleton"></div>
    <div class="skeleton movie-card__line movie-card__line--wide"></div>
    <div class="skeleton movie-card__line"></div>
  `;
  return card;
}

export function renderMovieCards(container, movies, options = {}) {
  if (!container) return 0;
  const fragment = document.createDocumentFragment();
  let count = 0;
  for (const movie of movies || []) {
    const card = createMovieCard(movie, options);
    if (card) {
      fragment.append(card);
      count += 1;
    }
  }
  container.replaceChildren(fragment);
  return count;
}

export function renderSkeletonCards(container, count = 6) {
  if (!container) return;
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < count; index += 1) fragment.append(createSkeletonCard());
  container.replaceChildren(fragment);
}

export function renderState(container, {
  title = 'Tidak ada data',
  message = '',
  type = 'empty',
  iconName = 'film',
  actionLabel = '',
  onAction = null,
  href = '',
  compact = false,
} = {}) {
  if (!container) return;
  const state = document.createElement('div');
  state.className = `state-card state-card--${type}${compact ? ' state-card--compact' : ''}`;

  const iconWrap = document.createElement('span');
  iconWrap.className = 'state-card__icon';
  iconWrap.append(icon(iconName));

  const heading = document.createElement('h3');
  heading.className = 'state-card__title';
  heading.textContent = title;

  const text = document.createElement('p');
  text.className = 'state-card__text';
  text.textContent = message;

  state.append(iconWrap, heading, text);

  if (actionLabel && onAction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--secondary state-card__action';
    button.append(icon('refresh'), document.createTextNode(actionLabel));
    button.addEventListener('click', onAction);
    state.append(button);
  } else if (actionLabel && href) {
    const link = document.createElement('a');
    link.className = 'button button--secondary state-card__action';
    link.href = href;
    link.append(document.createTextNode(actionLabel), icon('arrow-right'));
    state.append(link);
  }

  container.replaceChildren(state);
}

export function initCarousel(root) {
  if (!root) return;
  const track = qs('[data-track]', root);
  const prev = qs('[data-carousel-prev]', root);
  const next = qs('[data-carousel-next]', root);
  if (!track) return;

  const update = () => {
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    if (prev) prev.disabled = track.scrollLeft <= 2 || maxScroll === 0;
    if (next) next.disabled = track.scrollLeft >= maxScroll - 2 || maxScroll === 0;
  };

  if (!initializedCarousels.has(root)) {
    initializedCarousels.add(root);
    if (prev) {
      prev.addEventListener('click', () => {
        track.scrollBy({
          left: -Math.max(280, track.clientWidth * 0.8),
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
      });
    }
    if (next) {
      next.addEventListener('click', () => {
        track.scrollBy({
          left: Math.max(280, track.clientWidth * 0.8),
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
      });
    }
    track.addEventListener('scroll', update, { passive: true });
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(update);
      observer.observe(track);
    } else {
      window.addEventListener('resize', update);
    }
  }

  window.requestAnimationFrame(update);
}

let toastRegion = null;
let confirmDialogSequence = 0;

export function showToast(message, { type = 'info', duration = 3400 } = {}) {
  if (!toastRegion) {
    toastRegion = document.createElement('div');
    toastRegion.className = 'toast-region';
    toastRegion.setAttribute('aria-live', 'polite');
    toastRegion.setAttribute('aria-atomic', 'false');
    document.body.append(toastRegion);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  const iconName = type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info';
  toast.append(icon(iconName));
  const text = document.createElement('p');
  text.textContent = message;
  toast.append(text);
  toastRegion.append(toast);

  while (toastRegion.children.length > 3) toastRegion.firstElementChild?.remove();

  window.setTimeout(() => {
    toast.classList.add('is-leaving');
    window.setTimeout(() => toast.remove(), 220);
  }, duration);
}

export function confirmDialog({
  title = 'Konfirmasi tindakan',
  message = '',
  confirmLabel = 'Hapus',
  cancelLabel = 'Batal',
  danger = true,
} = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    const titleId = `confirm-dialog-title-${++confirmDialogSequence}`;
    const textId = `confirm-dialog-text-${confirmDialogSequence}`;
    dialog.className = 'confirm-dialog';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-labelledby', titleId);
    dialog.setAttribute('aria-describedby', textId);
    dialog.innerHTML = `
      <div class="confirm-dialog__icon">${danger ? '<svg class="icon" aria-hidden="true"><use href="assets/icons/sprite.svg#icon-trash"></use></svg>' : ''}</div>
      <h2 class="confirm-dialog__title" id="${titleId}">${escapeHtml(title)}</h2>
      <p class="confirm-dialog__text" id="${textId}">${escapeHtml(message)}</p>
      <div class="confirm-dialog__actions">
        <button type="button" class="button button--secondary" data-confirm-cancel>${escapeHtml(cancelLabel)}</button>
        <button type="button" class="button ${danger ? 'button--danger' : 'button--primary'}" data-confirm-ok>${escapeHtml(confirmLabel)}</button>
      </div>
    `;
    document.body.append(dialog);

    const close = (confirmed) => {
      if (!dialog.open) return;
      dialog.returnValue = confirmed ? 'confirm' : 'cancel';
      dialog.close(confirmed ? 'confirm' : 'cancel');
    };

    dialog.querySelector('[data-confirm-cancel]')?.addEventListener('click', () => close(false));
    dialog.querySelector('[data-confirm-ok]')?.addEventListener('click', () => close(true));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close(false);
    });
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'confirm';
      dialog.remove();
      resolve(confirmed);
    }, { once: true });

    dialog.showModal();
    dialog.querySelector('[data-confirm-cancel]')?.focus();
  });
}

