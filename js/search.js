import {
  discoverMovies,
  getApiErrorMessage,
  getGenres,
  isConfigured,
  searchMovies,
} from './api.js';
import {
  formatNumber,
  getGenreIcon,
  icon,
  qs,
  qsa,
  renderMovieCards,
  renderSkeletonCards,
  renderState,
} from './ui.js';

const SORTS = new Set(['popularity.desc', 'vote_average.desc', 'primary_release_date.desc']);
const DEFAULT_SORT = 'popularity.desc';
const MAX_PAGE = 500;

const state = {
  query: '',
  genre: null,
  year: null,
  sort: DEFAULT_SORT,
  page: 1,
  genres: [],
};

let elements = {};
let abortController = null;
let debounceTimer = 0;
let requestId = 0;
let initialized = false;
let lastTotalPages = 0;

function init() {
  const page = qs('[data-explore-page]');
  if (!page || initialized) return;
  initialized = true;

  elements = {
    page,
    form: qs('[data-explore-search]'),
    input: qs('[data-explore-query]'),
    clearInput: qs('[data-search-clear]'),
    spinner: qs('[data-search-spinner]'),
    genreList: qs('[data-genre-list]'),
    genreStatus: qs('[data-genre-status]'),
    year: qs('[data-year-filter]'),
    sort: qs('[data-sort-filter]'),
    reset: qs('[data-reset-filters]'),
    modeNote: qs('[data-search-mode-note]'),
    summary: qs('[data-results-summary]'),
    results: qs('[data-results-section]'),
    grid: qs('[data-results-grid]'),
    stateArea: qs('[data-results-state]'),
    pagination: qs('[data-pagination]'),
    paginationPages: qs('[data-pagination-pages]'),
    paginationMobile: qs('[data-pagination-mobile]'),
    headerSearch: qs('[data-global-search] input[name="q"]'),
  };

  populateYearOptions();
  readStateFromUrl();
  applyControls();
  bindEvents();
  loadGenres();
  loadResults();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

function bindEvents() {
  elements.form?.addEventListener('submit', (event) => {
    event.preventDefault();
    window.clearTimeout(debounceTimer);
    const value = elements.input.value.trim();
    if (!value) {
      elements.input.setCustomValidity('Masukkan judul film yang ingin dicari.');
      elements.input.reportValidity();
      return;
    }
    elements.input.setCustomValidity('');
    state.query = value;
    state.page = 1;
    readInputIntoHeader();
    syncUrl(false);
    updateSearchMode();
    loadResults({ focusSummary: false });
  });

  elements.input?.addEventListener('input', () => {
    elements.input.setCustomValidity('');
    state.query = elements.input.value.trim();
    state.page = 1;
    updateClearButton();
    readInputIntoHeader();
    syncUrl(true);
    updateSearchMode();
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => loadResults(), 500);
  });

  elements.input?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && elements.input.value) {
      event.preventDefault();
      clearQuery();
    }
  });

  elements.clearInput?.addEventListener('click', clearQuery);

  elements.genreList?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-genre-id]');
    if (!button || button.disabled) return;
    const id = Number(button.dataset.genreId);
    state.genre = Number.isInteger(id) && id > 0 ? id : null;
    state.page = 1;
    syncUrl(false);
    applyGenreSelection();
    updateSearchMode();
    loadResults({ focusSummary: true });
  });

  elements.year?.addEventListener('change', () => {
    const year = Number(elements.year.value);
    state.year = Number.isInteger(year) && year > 0 ? year : null;
    state.page = 1;
    syncUrl(false);
    updateSearchMode();
    loadResults({ focusSummary: true });
  });

  elements.sort?.addEventListener('change', () => {
    if (state.query) return;
    state.sort = SORTS.has(elements.sort.value) ? elements.sort.value : DEFAULT_SORT;
    state.page = 1;
    syncUrl(false);
    updateSearchMode();
    loadResults({ focusSummary: true });
  });

  elements.reset?.addEventListener('click', resetFilters);

  qs('[data-page-prev]')?.addEventListener('click', () => goToPage(state.page - 1));
  qs('[data-page-next]')?.addEventListener('click', () => goToPage(state.page + 1));

  elements.paginationPages?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-page-number]');
    if (!button) return;
    goToPage(Number(button.dataset.pageNumber));
  });

  window.addEventListener('popstate', () => {
    abortController?.abort();
    readStateFromUrl();
    applyControls();
    updateSearchMode();
    loadResults({ focusSummary: true });
  });
}

function populateYearOptions() {
  if (!elements.year) return;
  const currentYear = new Date().getFullYear();
  const fragment = document.createDocumentFragment();
  const anyOption = document.createElement('option');
  anyOption.value = '';
  anyOption.textContent = 'Semua tahun';
  fragment.append(anyOption);
  for (let year = currentYear + 1; year >= 1900; year -= 1) {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    fragment.append(option);
  }
  elements.year.replaceChildren(fragment);
}

function readStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  state.query = (params.get('q') || '').trim().slice(0, 120);
  const genre = Number(params.get('genre'));
  state.genre = Number.isInteger(genre) && genre > 0 ? genre : null;
  const year = Number(params.get('year'));
  state.year = Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear() + 1 ? year : null;
  const sort = params.get('sort');
  state.sort = SORTS.has(sort) ? sort : DEFAULT_SORT;
  const page = Number(params.get('page'));
  state.page = Number.isInteger(page) && page > 0 ? Math.min(page, MAX_PAGE) : 1;
}

function applyControls() {
  if (elements.input) elements.input.value = state.query;
  if (elements.headerSearch) elements.headerSearch.value = state.query;
  if (elements.year) elements.year.value = state.year ? String(state.year) : '';
  if (elements.sort) elements.sort.value = state.sort;
  updateClearButton();
  updateSearchMode();
  applyGenreSelection();
  if (elements.reset) {
    elements.reset.disabled = !state.query && !state.genre && !state.year && state.sort === DEFAULT_SORT;
  }
}

function applyGenreSelection() {
  qsa('[data-genre-id]', elements.genreList).forEach((button) => {
    const isActive = state.genre === null
      ? button.dataset.genreId === ''
      : Number(button.dataset.genreId) === state.genre;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function updateSearchMode() {
  const searching = Boolean(state.query);
  if (elements.modeNote) elements.modeNote.hidden = !searching;
  if (elements.sort) {
    elements.sort.disabled = searching;
    elements.sort.closest('.select-field')?.classList.toggle('is-disabled', searching);
  }
  qsa('[data-genre-id]', elements.genreList).forEach((button) => {
    button.disabled = searching;
  });
  qsa('[data-genre-id]', elements.genreList).forEach((button) => {
    button.title = searching ? 'Hapus kata kunci untuk menggunakan filter genre.' : '';
  });
  if (elements.reset) {
    elements.reset.disabled = !state.query && !state.genre && !state.year && state.sort === DEFAULT_SORT;
  }
  document.title = searching ? `Hasil “${state.query}” — CineScope` : 'Jelajahi Film — CineScope';
}

function updateClearButton() {
  if (!elements.clearInput) return;
  elements.clearInput.hidden = !elements.input?.value;
}

function readInputIntoHeader() {
  if (elements.headerSearch) elements.headerSearch.value = elements.input?.value || '';
}

function syncUrl(replace) {
  const url = new URL(window.location.href);
  url.search = '';
  if (state.query) url.searchParams.set('q', state.query);
  if (state.genre) url.searchParams.set('genre', String(state.genre));
  if (state.year) url.searchParams.set('year', String(state.year));
  if (state.sort !== DEFAULT_SORT) url.searchParams.set('sort', state.sort);
  if (state.page > 1) url.searchParams.set('page', String(state.page));
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method]({}, '', `${url.pathname}${url.search}`);
}

async function loadGenres() {
  if (!elements.genreList) return;
  elements.genreList.innerHTML = '<span class="skeleton pill-skeleton"></span><span class="skeleton pill-skeleton"></span><span class="skeleton pill-skeleton"></span>';
  if (elements.genreStatus) elements.genreStatus.hidden = true;
  if (!isConfigured()) {
    renderGenreError('Genre tidak dapat dimuat karena API key belum dikonfigurasi.');
    return;
  }

  try {
    const genres = await getGenres();
    state.genres = Array.isArray(genres) ? genres : [];
    if (state.genre && !state.genres.some((genre) => genre.id === state.genre)) {
      state.genre = null;
      syncUrl(true);
    }
    renderGenres();
  } catch (error) {
    renderGenreError(getApiErrorMessage(error));
  }
}

function renderGenres() {
  if (!elements.genreList) return;
  const fragment = document.createDocumentFragment();
  const allButton = createGenreButton('', 'Semua', 'tag');
  fragment.append(allButton);
  for (const genre of state.genres) {
    fragment.append(createGenreButton(String(genre.id), genre.name, getGenreIcon(genre.id)));
  }
  elements.genreList.replaceChildren(fragment);
  applyGenreSelection();
  updateSearchMode();
  if (elements.genreStatus) elements.genreStatus.hidden = true;
}

function createGenreButton(id, label, iconName) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pill';
  button.dataset.genreId = id;
  button.setAttribute('aria-pressed', 'false');
  button.append(icon(iconName), document.createTextNode(label));
  return button;
}

function renderGenreError(message) {
  if (!elements.genreList) return;
  elements.genreList.replaceChildren();
  if (!elements.genreStatus) return;
  elements.genreStatus.hidden = false;
  elements.genreStatus.replaceChildren();
  const text = document.createElement('span');
  text.textContent = message;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'text-button';
  retry.append(icon('refresh'), document.createTextNode('Coba lagi'));
  retry.addEventListener('click', loadGenres);
  elements.genreStatus.append(text, retry);
}

function clearQuery() {
  window.clearTimeout(debounceTimer);
  state.query = '';
  state.page = 1;
  if (elements.input) {
    elements.input.value = '';
    elements.input.setCustomValidity('');
  }
  if (elements.headerSearch) elements.headerSearch.value = '';
  updateClearButton();
  updateSearchMode();
  syncUrl(false);
  loadResults({ focusSummary: true });
  elements.input?.focus();
}

function resetFilters() {
  window.clearTimeout(debounceTimer);
  abortController?.abort();
  state.query = '';
  state.genre = null;
  state.year = null;
  state.sort = DEFAULT_SORT;
  state.page = 1;
  if (elements.input) {
    elements.input.value = '';
    elements.input.setCustomValidity('');
  }
  if (elements.headerSearch) elements.headerSearch.value = '';
  if (elements.year) elements.year.value = '';
  if (elements.sort) elements.sort.value = DEFAULT_SORT;
  updateClearButton();
  updateSearchMode();
  applyGenreSelection();
  syncUrl(false);
  loadResults({ focusSummary: true });
}

async function loadResults({ focusSummary = false } = {}) {
  if (!elements.results) return;
  window.clearTimeout(debounceTimer);
  abortController?.abort();
  abortController = new AbortController();
  const currentRequest = ++requestId;

  if (!isConfigured()) {
    lastTotalPages = 0;
    renderError('API TMDB belum dikonfigurasi. Tambahkan API key di js/config.local.js untuk mulai menjelajah.');
    elements.results.removeAttribute('aria-busy');
    setLoading(false);
    elements.pagination.hidden = true;
    if (elements.summary) elements.summary.textContent = 'Menunggu konfigurasi API';
    return;
  }

  setLoading(true);
  elements.results.setAttribute('aria-busy', 'true');
  elements.stateArea.hidden = true;
  elements.grid.hidden = false;
  renderSkeletonCards(elements.grid, 12);
  if (elements.summary) elements.summary.textContent = state.query ? 'Mencari film…' : 'Memuat film…';
  if (elements.pagination) elements.pagination.hidden = true;

  try {
    const data = state.query
      ? await searchMovies(state.query, {
          page: state.page,
          year: state.year,
          signal: abortController.signal,
        })
      : await discoverMovies({
          page: state.page,
          genreId: state.genre,
          year: state.year,
          sortBy: state.sort,
          signal: abortController.signal,
        });

    if (currentRequest !== requestId) return;
    const results = Array.isArray(data?.results) ? data.results.filter((movie) => movie?.id) : [];
    lastTotalPages = Math.min(MAX_PAGE, Math.max(0, Number(data?.total_pages) || 0));
    updateSummary(data, results.length);

    if (!results.length) {
      elements.grid.replaceChildren();
      elements.grid.hidden = true;
      elements.stateArea.hidden = false;
      renderNoResults();
      elements.pagination.hidden = true;
      return;
    }

    elements.grid.hidden = false;
    elements.stateArea.hidden = true;
    renderMovieCards(elements.grid, results);
    renderPagination();
    if (focusSummary) {
      elements.summary?.focus({ preventScroll: true });
      scrollToResults();
    }
  } catch (error) {
    if (error?.kind === 'aborted' || currentRequest !== requestId) return;
    renderError(getApiErrorMessage(error));
    if (elements.summary) elements.summary.textContent = 'Hasil gagal dimuat';
    elements.pagination.hidden = true;
  } finally {
    if (currentRequest === requestId) {
      setLoading(false);
      elements.results.removeAttribute('aria-busy');
    }
  }
}

function updateSummary(data, visibleCount) {
  if (!elements.summary) return;
  const total = Number(data?.total_results) || 0;
  const totalPages = Math.min(MAX_PAGE, Number(data?.total_pages) || 0);
  const page = Math.min(state.page, totalPages || state.page);
  if (state.query) {
    elements.summary.textContent = total
      ? `${formatNumber(total)} hasil untuk “${state.query}”`
      : `Tidak ada hasil untuk “${state.query}”`;
  } else if (total) {
    const start = (page - 1) * 20 + 1;
    const end = start + Math.max(visibleCount - 1, 0);
    elements.summary.textContent = `Menampilkan ${formatNumber(start)}–${formatNumber(end)} dari ${formatNumber(total)} film`;
  } else {
    elements.summary.textContent = 'Tidak ada film ditemukan';
  }
}

function renderNoResults() {
  if (state.query) {
    renderState(elements.stateArea, {
      title: 'Film tidak ditemukan',
      message: `Tidak ada film yang cocok dengan “${state.query}”. Coba kata kunci lain atau hapus filter tahun.`,
      type: 'empty',
      iconName: 'search',
      actionLabel: 'Hapus pencarian',
      onAction: clearQuery,
    });
  } else {
    renderState(elements.stateArea, {
      title: 'Tidak ada film dengan filter ini',
      message: 'Coba pilih genre atau tahun lain, ubah urutan, atau atur ulang semua filter.',
      type: 'empty',
      iconName: 'film',
      actionLabel: 'Atur ulang filter',
      onAction: resetFilters,
    });
  }
}

function renderError(message) {
  if (!elements.grid || !elements.stateArea) return;
  elements.grid.replaceChildren();
  elements.grid.hidden = true;
  elements.stateArea.hidden = false;
  renderState(elements.stateArea, {
    title: 'Gagal memuat film',
    message,
    type: 'error',
    iconName: 'alert',
    actionLabel: 'Coba lagi',
    onAction: () => loadResults({ focusSummary: true }),
  });
}

function setLoading(loading) {
  elements.spinner?.classList.toggle('is-active', loading);
  elements.form?.classList.toggle('is-loading', loading);
  qsa('[data-genre-id]', elements.genreList).forEach((button) => {
    if (state.query) button.disabled = true;
  });
}

function renderPagination() {
  if (!elements.pagination) return;
  const totalPages = lastTotalPages;
  if (totalPages <= 1) {
    elements.pagination.hidden = true;
    return;
  }

  elements.pagination.hidden = false;
  const prev = qs('[data-page-prev]');
  const next = qs('[data-page-next]');
  if (prev) prev.disabled = state.page <= 1;
  if (next) next.disabled = state.page >= totalPages;

  if (elements.paginationMobile) {
    elements.paginationMobile.textContent = `Halaman ${formatNumber(state.page)} dari ${formatNumber(totalPages)}`;
  }
  if (!elements.paginationPages) return;

  const fragment = document.createDocumentFragment();
  const pages = buildPageList(state.page, totalPages);
  for (const page of pages) {
    if (page === '…') {
      const span = document.createElement('span');
      span.className = 'pagination__ellipsis';
      span.textContent = '…';
      fragment.append(span);
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pagination__page';
    button.dataset.pageNumber = String(page);
    button.textContent = formatNumber(page);
    button.setAttribute('aria-label', `Halaman ${page}`);
    if (page === state.page) {
      button.classList.add('is-current');
      button.setAttribute('aria-current', 'page');
    }
    fragment.append(button);
  }
  elements.paginationPages.replaceChildren(fragment);
}

function buildPageList(current, total) {
  const pages = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((page) => pages.add(page));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((page) => pages.add(page));
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const output = [];
  for (const page of sorted) {
    if (output.length && page - output[output.length - 1] > 1) output.push('…');
    output.push(page);
  }
  return output;
}

function goToPage(page) {
  if (!Number.isInteger(page) || page < 1) return;
  const max = lastTotalPages || MAX_PAGE;
  if (page > max) return;
  state.page = page;
  syncUrl(false);
  loadResults({ focusSummary: true });
}

function scrollToResults() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  elements.summary?.closest('.results-head')?.scrollIntoView({
    behavior: reduce ? 'auto' : 'smooth',
    block: 'start',
  });
}
