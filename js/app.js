import { CONFIG } from './config.js';
import {
  getApiErrorMessage,
  getGenres,
  getPopularMovies,
  getTopRatedMovies,
  getTrendingMovies,
  getUpcomingMovies,
  isConfigured,
} from './api.js';
import {
  STORAGE_EVENTS,
  clearHistory,
  clearWatchlist,
  getHistory,
  getWatchlist,
  isStorageAvailable,
  toggleWatchlist,
} from './storage.js';
import {
  attachImageFallback,
  backdropUrl,
  confirmDialog,
  createMovieCard,
  formatRelativeTime,
  formatRating,
  formatVoteCount,
  getGenreIcon,
  getYear,
  icon,
  initCarousel,
  posterUrl,
  qs,
  qsa,
  refreshWatchlistButtons,
  renderMovieCards,
  renderSkeletonCards,
  renderState,
  showToast,
} from './ui.js';

const HOME_SECTION_IDS = {
  popular: getPopularMovies,
  top_rated: getTopRatedMovies,
  upcoming: getUpcomingMovies,
};

const homeState = {
  trending: [],
  heroIndex: 0,
};

function onReady(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback, { once: true });
  } else {
    callback();
  }
}

onReady(initApp);

function initApp() {
  markCurrentYear();
  showGlobalNotices();
  initMenu();
  initGlobalSearch();
  initWatchlistToggles();
  initClearActions();
  initGlobalEvents();
  updateAllCounts();
  refreshWatchlistButtons();
  initHome();
}

function markCurrentYear() {
  qsa('[data-current-year]').forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });
}

function showGlobalNotices() {
  const container = qs('#app-notice');
  if (!container) return;
  const notices = [];

  if (!isConfigured()) {
    notices.push({
      type: 'config',
      title: 'TMDB API belum dikonfigurasi',
      text: 'Buat js/config.local.js dari js/config.local.example.js dan isi API key TMDB v3 Anda, lalu muat ulang halaman. Lihat README.md untuk panduan lengkap.',
    });
  }

  if (!isStorageAvailable()) {
    notices.push({
      type: 'warning',
      title: 'Penyimpanan browser tidak tersedia',
      text: 'Watchlist dan riwayat hanya akan bertahan selama halaman ini terbuka. Izinkan penyimpanan situs di pengaturan browser untuk menyimpannya secara permanen.',
    });
  }

  if (!notices.length) {
    container.hidden = true;
    return;
  }

  container.replaceChildren(
    ...notices.map((notice) => {
      const item = document.createElement('div');
      item.className = `app-notice__item app-notice__item--${notice.type}`;
      item.append(icon(notice.type === 'config' ? 'alert' : 'info'));
      const text = document.createElement('div');
      const heading = document.createElement('strong');
      heading.textContent = notice.title;
      const description = document.createElement('span');
      description.textContent = ` ${notice.text}`;
      text.append(heading, description);
      item.append(text);
      return item;
    }),
  );
  container.hidden = false;
}

function initMenu() {
  const header = qs('[data-site-header]');
  const toggle = qs('[data-menu-toggle]');
  const nav = qs('[data-site-nav]');
  if (!header || !toggle || !nav) return;

  const setOpen = (open, returnFocus = false) => {
    header.classList.toggle('is-nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
    if (open) nav.querySelector('a')?.focus();
    if (!open && returnFocus) toggle.focus();
  };

  toggle.addEventListener('click', () => {
    setOpen(!header.classList.contains('is-nav-open'));
  });

  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });

  document.addEventListener('click', (event) => {
    if (!header.classList.contains('is-nav-open')) return;
    if (!header.contains(event.target)) setOpen(false);
  });

  document.addEventListener('focusin', (event) => {
    if (!header.classList.contains('is-nav-open')) return;
    if (!header.contains(event.target)) setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && header.classList.contains('is-nav-open')) {
      setOpen(false, true);
    }
  });

  const desktop = window.matchMedia('(min-width: 1101px)');
  desktop.addEventListener('change', (event) => {
    if (event.matches) setOpen(false);
  });
}

function initGlobalSearch() {
  const form = qs('[data-global-search]');
  if (!form) return;
  const input = form.querySelector('input[name="q"]');
  if (!input) return;

  input.addEventListener('input', () => input.setCustomValidity(''));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) {
      input.setCustomValidity('Masukkan judul film yang ingin dicari.');
      input.reportValidity();
      input.focus();
      return;
    }
    input.setCustomValidity('');
    window.location.assign(`explore.html?q=${encodeURIComponent(query)}`);
  });
}

function initWatchlistToggles() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-watchlist-toggle]');
    if (!button || button.disabled) return;
    event.preventDefault();

    const id = Number(button.dataset.movieId);
    if (!Number.isInteger(id) || id <= 0) return;

    const movie = {
      id,
      title: button.dataset.title || 'Film tanpa judul',
      poster_path: button.dataset.posterPath || null,
      backdrop_path: button.dataset.backdropPath || null,
      release_date: button.dataset.releaseDate || '',
      vote_average: Number(button.dataset.rating) || 0,
      vote_count: Number(button.dataset.votes) || 0,
      original_language: button.dataset.originalLanguage || '',
    };

    const result = toggleWatchlist(movie);
    refreshWatchlistButtons();
    showToast(
      result.added ? `${movie.title} ditambahkan ke Watchlist.` : `${movie.title} dihapus dari Watchlist.`,
      { type: result.added ? 'success' : 'info' },
    );
  });
}

async function initClearActions() {
  document.addEventListener('click', async (event) => {
    const watchlistButton = event.target.closest('[data-clear-watchlist]');
    const historyButton = event.target.closest('[data-clear-history]');
    const button = watchlistButton || historyButton;
    if (!button || button.disabled) return;

    const isWatchlist = Boolean(watchlistButton);
    const confirmed = await confirmDialog({
      title: isWatchlist ? 'Hapus seluruh Watchlist?' : 'Hapus seluruh riwayat?',
      message: isWatchlist
        ? 'Semua film dalam Watchlist akan dihapus dari browser ini. Tindakan ini tidak dapat dibatalkan.'
        : 'Semua film yang pernah Anda buka akan dihapus dari riwayat browser ini. Tindakan ini tidak dapat dibatalkan.',
      confirmLabel: 'Ya, hapus semua',
    });

    if (!confirmed) return;
    if (isWatchlist) {
      clearWatchlist();
      showToast('Watchlist berhasil dikosongkan.', { type: 'success' });
    } else {
      clearHistory();
      showToast('Riwayat tontonan berhasil dikosongkan.', { type: 'success' });
    }
  });
}

function initGlobalEvents() {
  window.addEventListener(STORAGE_EVENTS.WATCHLIST, () => {
    updateAllCounts();
    refreshWatchlistButtons();
  });
  window.addEventListener(STORAGE_EVENTS.HISTORY, updateAllCounts);
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    const detail = { watchlist: getWatchlist(), history: getHistory() };
    window.dispatchEvent(new CustomEvent(STORAGE_EVENTS.WATCHLIST, { detail }));
    window.dispatchEvent(new CustomEvent(STORAGE_EVENTS.HISTORY, { detail }));
  });
}

function updateAllCounts() {
  const watchlistCount = getWatchlist().length;
  const historyCount = getHistory().length;
  qsa('[data-watchlist-count]').forEach((element) => {
    element.textContent = String(watchlistCount);
    if (element.hasAttribute('data-hide-zero')) element.hidden = watchlistCount === 0;
    const link = element.closest('a.header-icon');
    if (link) {
      link.setAttribute(
        'aria-label',
        watchlistCount ? `Buka Watchlist, ${watchlistCount} film tersimpan` : 'Buka Watchlist',
      );
    }
  });
  qsa('[data-history-count]').forEach((element) => {
    element.textContent = String(historyCount);
    if (element.hasAttribute('data-hide-zero')) element.hidden = historyCount === 0;
  });
  qsa('[data-clear-watchlist]').forEach((button) => {
    button.disabled = watchlistCount === 0;
  });
  qsa('[data-clear-history]').forEach((button) => {
    button.disabled = historyCount === 0;
  });
}

function initHome() {
  const home = qs('[data-home]');
  if (!home) return;

  renderWatchlistRail();
  window.addEventListener(STORAGE_EVENTS.WATCHLIST, renderWatchlistRail);

  initHomeCarousels();
  renderRecentlyViewed();
  window.addEventListener(STORAGE_EVENTS.HISTORY, renderRecentlyViewed);

  if (!isConfigured()) {
    const hero = qs('[data-hero]');
    renderState(hero, {
      title: 'API TMDB belum dikonfigurasi',
      message: 'Buat js/config.local.js dari js/config.local.example.js dan isi API key TMDB v3 milik Anda. Setelah itu muat ulang halaman untuk melihat film.',
      type: 'error',
      iconName: 'alert',
      compact: true,
    });
    hero?.removeAttribute('aria-busy');
    qsa('[data-home-section], [data-genre-section]').forEach((section) => {
      section.hidden = true;
    });
    return;
  }

  loadTrending();
  loadStandardSection('popular');
  loadStandardSection('top_rated');
  loadStandardSection('upcoming');
  loadHomeGenres();
}

function initHomeCarousels() {
  qsa('[data-home-section], [data-recent-section]').forEach((section) => initCarousel(section));
}

async function loadTrending() {
  const trendingSection = qs('[data-home-section="trending"]');
  const hero = qs('[data-hero]');
  const track = trendingSection ? qs('[data-track]', trendingSection) : null;

  renderHeroSkeleton(hero);
  renderSkeletonCards(track, 7);
  trendingSection?.setAttribute('aria-busy', 'true');

  try {
    const data = await getTrendingMovies(1);
    homeState.trending = Array.isArray(data?.results) ? data.results.filter((movie) => movie?.id) : [];
    homeState.heroIndex = 0;

    if (!homeState.trending.length) {
      if (hero) {
        hero.className = 'hero';
        hero.removeAttribute('aria-busy');
      }
      renderState(hero, {
        title: 'Belum ada film yang sedang tren',
        message: 'TMDB belum mengembalikan film untuk periode ini. Coba muat ulang sebentar lagi.',
        type: 'empty',
        compact: true,
      });
      renderState(track, {
        title: 'Belum ada film yang sedang tren',
        message: 'Coba periksa lagi nanti.',
        type: 'empty',
        compact: true,
      });
      return;
    }

    renderHero(homeState.trending);
    renderMovieCards(track, homeState.trending.slice(0, 16));
    initCarousel(trendingSection);
  } catch (error) {
    renderTrendingError(error);
  } finally {
    trendingSection?.removeAttribute('aria-busy');
  }
}

function renderTrendingError(error) {
  const hero = qs('[data-hero]');
  const trendingSection = qs('[data-home-section="trending"]');
  const track = trendingSection ? qs('[data-track]', trendingSection) : null;
  const message = getApiErrorMessage(error);

  if (hero) hero.className = 'hero';
  hero?.removeAttribute('aria-busy');
  renderState(hero, {
    title: 'Gagal memuat film yang sedang tren',
    message,
    type: 'error',
    iconName: 'alert',
    actionLabel: 'Coba lagi',
    onAction: loadTrending,
    compact: true,
  });
  renderState(track, {
    title: 'Tidak dapat memuat bagian ini',
    message,
    type: 'error',
    iconName: 'alert',
    actionLabel: 'Coba lagi',
    onAction: loadTrending,
    compact: true,
  });
}

function renderHeroSkeleton(hero) {
  if (!hero) return;
  hero.className = 'hero hero--loading';
  hero.setAttribute('aria-busy', 'true');
  hero.innerHTML = `
    <div class="hero__skeleton-media skeleton"></div>
    <div class="hero__content">
      <div class="skeleton hero__skeleton-kicker"></div>
      <div class="skeleton hero__skeleton-title"></div>
      <div class="skeleton hero__skeleton-meta"></div>
      <div class="skeleton hero__skeleton-text"></div>
      <div class="skeleton hero__skeleton-text hero__skeleton-text--short"></div>
      <div class="skeleton hero__skeleton-button"></div>
    </div>
  `;
}

function renderHero(movies) {
  const hero = qs('[data-hero]');
  if (!hero) return;
  const items = movies.filter((movie) => movie?.id).slice(0, 5);
  if (!items.length) return;

  const movie = items[homeState.heroIndex % items.length];
  hero.className = 'hero';
  hero.removeAttribute('aria-busy');
  hero.replaceChildren();

  const media = document.createElement('div');
  media.className = 'hero__media';
  const image = document.createElement('img');
  image.src = backdropUrl(movie.backdrop_path);
  image.alt = '';
  image.loading = homeState.heroIndex === 0 ? 'eager' : 'lazy';
  image.fetchPriority = homeState.heroIndex === 0 ? 'high' : 'auto';
  attachImageFallback(image, 'assets/images/backdrop-placeholder.svg');
  media.append(image);

  const shade = document.createElement('div');
  shade.className = 'hero__shade';

  const content = document.createElement('div');
  content.className = 'hero__content';
  content.setAttribute('aria-live', 'polite');

  const kicker = document.createElement('p');
  kicker.className = 'eyebrow hero__kicker';
  const kickerDot = document.createElement('span');
  kickerDot.className = 'live-dot';
  kicker.append(kickerDot, document.createTextNode(' Sedang tren minggu ini'));

  const title = document.createElement('h2');
  title.className = 'hero__title';
  const titleLink = document.createElement('a');
  titleLink.href = `movie.html?id=${movie.id}`;
  titleLink.textContent = movie.title || movie.original_title || 'Film tanpa judul';
  title.append(titleLink);

  const meta = document.createElement('div');
  meta.className = 'hero__meta';
  if (Number(movie.vote_average) > 0 && Number(movie.vote_count) > 0) {
    meta.append(createRatingBlock(movie));
  }
  const year = getYear(movie.release_date);
  if (year) meta.append(createMetaText(year, 'calendar'));
  if (movie.original_language) meta.append(createMetaText(movie.original_language.toUpperCase()));

  const overview = document.createElement('p');
  overview.className = 'hero__overview';
  overview.textContent = movie.overview?.trim() || 'Sinopsis belum tersedia untuk film ini.';

  const actions = document.createElement('div');
  actions.className = 'hero__actions';

  const trailerButton = document.createElement('button');
  trailerButton.type = 'button';
  trailerButton.className = 'button button--primary';
  trailerButton.append(icon('play'), document.createTextNode('Tonton Trailer'));
  trailerButton.addEventListener('click', () => openHeroTrailer(movie, trailerButton));
  actions.append(trailerButton);

  const detailsLink = document.createElement('a');
  detailsLink.className = 'button button--secondary';
  detailsLink.href = `movie.html?id=${movie.id}`;
  detailsLink.append(document.createTextNode('Detail Film'), icon('arrow-right'));
  actions.append(detailsLink);

  content.append(kicker, title, meta, overview, actions);

  const dots = document.createElement('div');
  dots.className = 'hero__dots';
  dots.setAttribute('role', 'group');
  dots.setAttribute('aria-label', 'Pilih film unggulan');
  items.forEach((item, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'hero__dot';
    dot.setAttribute('aria-label', `Tampilkan ${item.title || 'film'} sebagai unggulan`);
    dot.setAttribute('aria-pressed', String(index === homeState.heroIndex));
    if (index === homeState.heroIndex) dot.classList.add('is-active');
    dot.addEventListener('click', () => {
      homeState.heroIndex = index;
      renderHero(items);
      qsa('.hero__dot', hero)[index]?.focus();
    });
    dots.append(dot);
  });

  hero.append(media, shade, content, dots);
}

function createRatingBlock(movie) {
  const rating = document.createElement('span');
  rating.className = 'rating rating--large';
  rating.append(icon('star', 'icon rating__icon'));
  const value = document.createElement('strong');
  value.textContent = formatRating(movie.vote_average);
  rating.append(value);
  const source = document.createElement('span');
  source.className = 'rating__source';
  source.textContent = 'TMDB';
  rating.append(source);
  const votes = document.createElement('span');
  votes.className = 'rating__votes';
  votes.textContent = formatVoteCount(movie.vote_count);
  rating.append(votes);
  return rating;
}

function createMetaText(text, iconName = '') {
  const span = document.createElement('span');
  span.className = 'meta-text';
  if (iconName) span.append(icon(iconName));
  span.append(document.createTextNode(text));
  return span;
}

async function openHeroTrailer(movie, button) {
  button.disabled = true;
  try {
    const { openTrailerForMovie } = await import('./player.js');
    await openTrailerForMovie({
      movieId: movie.id,
      title: movie.title || 'Film',
      posterPath: movie.poster_path,
    });
  } catch (error) {
    showToast(getApiErrorMessage(error), { type: 'error' });
  } finally {
    button.disabled = false;
  }
}

async function loadStandardSection(key) {
  const fetcher = HOME_SECTION_IDS[key];
  const section = qs(`[data-home-section="${key}"]`);
  if (!fetcher || !section) return;
  const track = qs('[data-track]', section);

  renderSkeletonCards(track, 7);
  section.setAttribute('aria-busy', 'true');
  initCarousel(section);

  try {
    const data = await fetcher(1);
    const movies = Array.isArray(data?.results) ? data.results.filter((movie) => movie?.id) : [];
    if (!movies.length) {
      renderState(track, {
        title: 'Belum ada film',
        message: 'Tidak ada film yang dapat ditampilkan untuk kategori ini.',
        type: 'empty',
        compact: true,
      });
    } else {
      renderMovieCards(track, movies.slice(0, 16));
      initCarousel(section);
    }
  } catch (error) {
    renderState(track, {
      title: 'Gagal memuat kategori',
      message: getApiErrorMessage(error),
      type: 'error',
      iconName: 'alert',
      actionLabel: 'Coba lagi',
      onAction: () => loadStandardSection(key),
      compact: true,
    });
  } finally {
    section.removeAttribute('aria-busy');
  }
}

async function loadHomeGenres() {
  const section = qs('[data-genre-section]');
  const container = section ? qs('[data-home-genres]', section) : null;
  if (!section || !container) return;

  container.innerHTML = '<span class="skeleton pill-skeleton"></span><span class="skeleton pill-skeleton"></span><span class="skeleton pill-skeleton"></span><span class="skeleton pill-skeleton"></span>';
  section.setAttribute('aria-busy', 'true');

  const preferredIds = [28, 35, 18, 878, 14, 27, 53, 10749, 16, 99];
  try {
    const genres = await getGenres();
    const chosen = preferredIds
      .map((id) => genres.find((genre) => genre.id === id))
      .filter(Boolean);

    const fragment = document.createDocumentFragment();
    for (const genre of chosen) {
      const link = document.createElement('a');
      link.className = 'pill';
      link.href = `explore.html?genre=${genre.id}`;
      link.append(icon(getGenreIcon(genre.id)), document.createTextNode(genre.name));
      fragment.append(link);
    }
    const allLink = document.createElement('a');
    allLink.className = 'pill pill--muted';
    allLink.href = 'explore.html';
    allLink.append(icon('tag'), document.createTextNode('Semua genre'));
    fragment.append(allLink);
    container.replaceChildren(fragment);
  } catch (error) {
    container.replaceChildren();
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'text-button';
    retry.append(icon('refresh'), document.createTextNode('Gagal memuat genre. Coba lagi.'));
    retry.addEventListener('click', loadHomeGenres);
    container.append(retry);
    section.title = getApiErrorMessage(error);
  } finally {
    section.removeAttribute('aria-busy');
  }
}

function renderWatchlistRail() {
  const rail = qs('[data-watchlist-rail]');
  if (!rail) return;
  const list = qs('[data-rail-list]', rail);
  if (!list) return;
  const movies = getWatchlist().slice(0, 4);

  if (!movies.length) {
    const empty = document.createElement('div');
    empty.className = 'rail__empty';
    empty.innerHTML = `
      <span class="rail__empty-icon"><svg class="icon" aria-hidden="true"><use href="assets/icons/sprite.svg#icon-bookmark"></use></svg></span>
      <p class="rail__empty-title">Watchlist masih kosong</p>
      <p class="rail__empty-text">Simpan film yang ingin Anda tonton nanti.</p>
      <a class="button button--secondary button--small" href="explore.html">Jelajahi Film</a>
    `;
    list.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const movie of movies) {
    const link = document.createElement('a');
    link.className = 'rail-item';
    link.href = `movie.html?id=${movie.id}`;

    const thumb = document.createElement('div');
    thumb.className = 'rail-item__thumb';
    const img = document.createElement('img');
    const source = movie.backdrop_path
      ? backdropUrl(movie.backdrop_path, 'w780')
      : posterUrl(movie.poster_path, CONFIG.POSTER_SMALL_SIZE);
    img.src = source;
    img.alt = '';
    img.loading = 'lazy';
    attachImageFallback(img, 'assets/images/backdrop-placeholder.svg');
    thumb.append(img);

    const body = document.createElement('div');
    body.className = 'rail-item__body';
    const title = document.createElement('span');
    title.className = 'rail-item__title';
    title.textContent = movie.title;
    const meta = document.createElement('span');
    meta.className = 'rail-item__meta';
    const year = getYear(movie.release_date);
    if (year) meta.append(document.createTextNode(year));
    if (Number(movie.vote_average) > 0) {
      if (year) meta.append(document.createTextNode(' · '));
      meta.append(icon('star', 'icon rating__icon'));
      meta.append(document.createTextNode(formatRating(movie.vote_average)));
    }
    body.append(title, meta);
    link.append(thumb, body);
    fragment.append(link);
  }
  list.replaceChildren(fragment);
}

function renderRecentlyViewed() {
  const section = qs('[data-recent-section]');
  if (!section) return;
  const track = qs('[data-track]', section);
  const history = getHistory().slice(0, 12);

  if (!history.length) {
    section.hidden = true;
    track?.replaceChildren();
    return;
  }

  section.hidden = false;
  const fragment = document.createDocumentFragment();
  for (const movie of history) {
    const note = movie.viewedAt ? `Dilihat ${formatRelativeTime(movie.viewedAt)}` : '';
    const card = createMovieCard(movie, { note });
    if (card) fragment.append(card);
  }
  track.replaceChildren(fragment);
  initCarousel(section);
}
