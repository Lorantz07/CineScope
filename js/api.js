import { CONFIG, getTmdbApiKey } from './config.js';

const PLACEHOLDER_KEY = 'YOUR_TMDB_API_KEY';
let genreCache = null;
let genrePromise = null;

export class ApiError extends Error {
  constructor(message, { kind = 'http', status = 0, retryAfter = 0 } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function getUsableApiKey() {
  const key = String(getTmdbApiKey() || '').trim();
  if (!key || key === PLACEHOLDER_KEY || key.includes('YOUR_TMDB')) return '';
  return key;
}

export function isConfigured() {
  return Boolean(getUsableApiKey());
}

export function getImageUrl(path, size = CONFIG.POSTER_SIZE) {
  if (!path || typeof path !== 'string') return '';
  const cleanSize = String(size).replace(/[^a-zA-Z0-9]/g, '');
  return `${CONFIG.TMDB_IMAGE_BASE_URL}/${cleanSize}${path.startsWith('/') ? path : `/${path}`}`;
}

async function request(path, { params = {}, signal, language = CONFIG.DEFAULT_LANGUAGE } = {}) {
  const apiKey = getUsableApiKey();
  if (!apiKey) {
    throw new ApiError('TMDB API key belum dikonfigurasi.', { kind: 'missing_config' });
  }

  const url = new URL(`${CONFIG.TMDB_BASE_URL}${path}`);
  url.searchParams.set('api_key', apiKey);
  if (language) url.searchParams.set('language', language);
  url.searchParams.set('include_adult', 'false');

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CONFIG.REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', abortFromCaller, { once: true });
  }

  let response;
  try {
    response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (signal?.aborted) throw new ApiError('Permintaan dibatalkan.', { kind: 'aborted' });
    if (timedOut) throw new ApiError('Permintaan ke TMDB melebihi batas waktu.', { kind: 'timeout' });
    if (error?.name === 'AbortError') throw new ApiError('Permintaan dibatalkan.', { kind: 'aborted' });
    throw new ApiError('Tidak dapat terhubung ke TMDB. Periksa koneksi internet Anda.', { kind: 'network' });
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) throw createHttpError(response);
    throw new ApiError('Respons dari TMDB tidak dapat dibaca.', { kind: 'invalid_response', status: response.status });
  }

  if (!response.ok) throw createHttpError(response, payload);
  return payload;
}

function createHttpError(response, payload) {
  const status = response.status;
  if (status === 401 || status === 403) {
    return new ApiError('API key TMDB tidak valid. Periksa kembali nilai di js/config.local.js.', {
      kind: 'auth',
      status,
    });
  }
  if (status === 404) {
    return new ApiError('Data yang diminta tidak ditemukan di TMDB.', { kind: 'not_found', status });
  }
  if (status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After')) || 0;
    return new ApiError('Batas permintaan TMDB tercapai. Coba lagi beberapa saat lagi.', {
      kind: 'rate_limit',
      status,
      retryAfter,
    });
  }
  if (status >= 500) {
    return new ApiError('Server TMDB sedang bermasalah. Coba lagi nanti.', { kind: 'server', status });
  }
  return new ApiError(payload?.status_message || 'Permintaan ke TMDB gagal.', { kind: 'http', status });
}

export function getTrendingMovies(page = 1, { signal } = {}) {
  return request('/trending/movie/week', { params: { page }, signal });
}

export function getPopularMovies(page = 1, { signal } = {}) {
  return request('/movie/popular', { params: { page }, signal });
}

export function getTopRatedMovies(page = 1, { signal } = {}) {
  return request('/movie/top_rated', { params: { page }, signal });
}

export function getUpcomingMovies(page = 1, { signal } = {}) {
  return request('/movie/upcoming', {
    params: { page, region: CONFIG.DEFAULT_REGION },
    signal,
  });
}

export function getNowPlayingMovies(page = 1, { signal } = {}) {
  return request('/movie/now_playing', {
    params: { page, region: CONFIG.DEFAULT_REGION },
    signal,
  });
}

export function discoverMovies({ page = 1, genreId, year, sortBy = 'popularity.desc', signal } = {}) {
  const params = {
    page,
    sort_by: sortBy,
    with_genres: genreId || undefined,
    primary_release_year: year || undefined,
    'vote_count.gte': sortBy === 'vote_average.desc' ? 100 : undefined,
  };
  return request('/discover/movie', { params, signal });
}

export function searchMovies(query, { page = 1, year, signal } = {}) {
  return request('/search/movie', {
    params: {
      query: String(query || '').trim(),
      page,
      primary_release_year: year || undefined,
      region: CONFIG.DEFAULT_REGION,
    },
    signal,
  });
}

export function getMovieDetails(id, { signal } = {}) {
  const movieId = Number(id);
  if (!Number.isInteger(movieId) || movieId <= 0) {
    return Promise.reject(new ApiError('ID film tidak valid.', { kind: 'invalid_id', status: 400 }));
  }
  return request(`/movie/${movieId}`, {
    params: { append_to_response: 'credits,similar,recommendations' },
    signal,
  });
}

export function getMovieVideos(id, { signal } = {}) {
  // Videos should not inherit the UI language filter: most films only have
  // English trailers, while the surrounding metadata remains localized.
  return request(`/movie/${Number(id)}/videos`, { signal, language: null });
}

export function getSimilarMovies(id, { page = 1, signal } = {}) {
  return request(`/movie/${Number(id)}/similar`, { params: { page }, signal });
}

export function getGenres({ signal, force = false } = {}) {
  if (force) {
    genreCache = null;
    genrePromise = null;
  }
  if (genreCache) return Promise.resolve(genreCache);
  if (genrePromise) return genrePromise;

  genrePromise = request('/genre/movie/list', { signal })
    .then((data) => {
      genreCache = Array.isArray(data?.genres)
        ? [...data.genres].sort((a, b) => a.name.localeCompare(b.name, 'id'))
        : [];
      return genreCache;
    })
    .catch((error) => {
      genrePromise = null;
      throw error;
    })
    .finally(() => {
      genrePromise = null;
    });

  return genrePromise;
}

export function getApiErrorMessage(error) {
  if (error instanceof ApiError) return error.message;
  if (error?.message) return error.message;
  return 'Terjadi kesalahan yang tidak terduga.';
}
