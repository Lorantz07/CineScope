/**
 * CineScope configuration.
 *
 * The tracked configuration intentionally keeps only the API-key placeholder.
 * For local development, copy js/config.local.example.js to js/config.local.js
 * and place your TMDB API v3 key there. config.local.js is ignored by Git.
 */
export const CONFIG = Object.freeze({
  APP_NAME: 'CineScope',

  // TMDB API v3 key (not the v4 Read Access Token).
  TMDB_API_KEY: 'YOUR_TMDB_API_KEY',
  TMDB_BASE_URL: 'https://api.themoviedb.org/3',
  TMDB_IMAGE_BASE_URL: 'https://image.tmdb.org/t/p',

  // Metadata language and watch-provider region.
  DEFAULT_LANGUAGE: 'id-ID',
  DEFAULT_REGION: 'ID',

  REQUEST_TIMEOUT_MS: 15000,
  HISTORY_LIMIT: 20,
  WATCHLIST_LIMIT: 200,

  POSTER_SIZE: 'w500',
  POSTER_SMALL_SIZE: 'w342',
  BACKDROP_SIZE: 'w1280',
  PROFILE_SIZE: 'w185',
});

let localApiKey = '';

try {
  const localConfig = await import('./config.local.js');
  localApiKey = String(localConfig.TMDB_API_KEY || '').trim();
} catch {
  // config.local.js is optional and is not part of the repository.
}

export function getTmdbApiKey() {
  return localApiKey || String(CONFIG.TMDB_API_KEY || '').trim();
}
