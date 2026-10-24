import {
  getApiErrorMessage,
  getMovieDetails,
  getMovieVideos,
  isConfigured,
} from './api.js';
import { recordHistory } from './storage.js';
import { openTrailerForMovie, selectBestVideo } from './player.js';
import {
  backdropUrl,
  createMovieCard,
  createWatchlistButton,
  escapeHtml,
  formatCountry,
  formatDate,
  formatLanguage,
  formatRating,
  formatRuntime,
  formatVoteCount,
  getYear,
  icon,
  initCarousel,
  posterUrl,
  profileUrl,
  qs,
  renderState,
  showToast,
} from './ui.js';

const root = qs('[data-movie-detail]');
let selectedVideo = null;
let requestController = null;

if (root) init();

function init() {
  if (!isConfigured()) {
    renderPageError({
      title: 'API TMDB belum dikonfigurasi',
      message: 'Tambahkan API key TMDB Anda di js/config.local.js lalu muat ulang halaman untuk melihat detail film.',
      iconName: 'alert',
      href: 'index.html',
      actionLabel: 'Kembali ke Beranda',
    });
    return;
  }

  const id = getMovieId();
  if (!id) {
    renderPageError({
      title: 'ID film tidak valid',
      message: 'Alamat halaman tidak memuat ID film yang benar. Pilih film dari Beranda atau halaman Jelajahi.',
      iconName: 'film',
      href: 'explore.html',
      actionLabel: 'Jelajahi Film',
    });
    return;
  }

  loadMovie(id);
}

function getMovieId() {
  const raw = new URLSearchParams(window.location.search).get('id');
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function loadMovie(id) {
  renderSkeleton();
  requestController?.abort();
  const controller = new AbortController();
  requestController = controller;
  document.title = 'Memuat film — CineScope';

  try {
    const videoRequest = getMovieVideos(id, { signal: controller.signal }).catch((error) => {
      if (controller.signal.aborted) throw error;
      return { results: [] };
    });
    const [movie, videoData] = await Promise.all([
      getMovieDetails(id, { signal: controller.signal }),
      videoRequest,
    ]);
    if (controller.signal.aborted) return;
    if (!movie?.id) throw new Error('Data film tidak lengkap.');
    selectedVideo = selectBestVideo(videoData?.results || movie.videos?.results || []);
    renderMovie(movie);
    recordHistory(movie);
    document.title = `${movie.title || 'Detail Film'}${getYear(movie.release_date) ? ` (${getYear(movie.release_date)})` : ''} — CineScope`;
  } catch (error) {
    if (error?.kind === 'aborted' || controller.signal.aborted) return;
    const notFound = error?.kind === 'not_found' || error?.status === 404;
    renderPageError({
      title: notFound ? 'Film tidak ditemukan' : 'Gagal memuat detail film',
      message: notFound
        ? 'Film dengan ID tersebut tidak tersedia di TMDB. Film mungkin telah dihapus atau ID-nya salah.'
        : getApiErrorMessage(error),
      iconName: notFound ? 'search' : 'alert',
      actionLabel: notFound ? 'Kembali ke Jelajahi' : 'Coba lagi',
      ...(notFound ? { href: 'explore.html' } : { onAction: () => loadMovie(id) }),
    });
    document.title = 'Detail film — CineScope';
  }
}

function renderSkeleton() {
  if (!root) return;
  root.innerHTML = `
    <div class="detail-skeleton" aria-hidden="true">
      <div class="skeleton detail-skeleton__hero"></div>
      <div class="detail-skeleton__body">
        <div class="detail-skeleton__poster skeleton"></div>
        <div class="detail-skeleton__lines">
          <div class="skeleton detail-skeleton__title"></div>
          <div class="skeleton detail-skeleton__line"></div>
          <div class="skeleton detail-skeleton__line"></div>
          <div class="skeleton detail-skeleton__line detail-skeleton__line--short"></div>
        </div>
      </div>
    </div>
  `;
  root.setAttribute('aria-busy', 'true');
}

function renderPageError(options) {
  if (!root) return;
  root.setAttribute('aria-busy', 'false');
  const wrap = document.createElement('div');
  wrap.className = 'detail-page-state';
  renderState(wrap, {
    title: options.title,
    message: options.message,
    type: 'error',
    iconName: options.iconName || 'alert',
    actionLabel: options.actionLabel,
    ...(options.href ? { href: options.href } : { onAction: options.onAction }),
  });
  root.replaceChildren(wrap);
}

function renderMovie(movie) {
  if (!root) return;
  root.removeAttribute('aria-busy');

  const title = movie.title || movie.original_title || 'Film tanpa judul';
  const originalTitle = movie.original_title && movie.original_title.trim().toLowerCase() !== title.trim().toLowerCase()
    ? movie.original_title
    : '';
  const releaseYear = getYear(movie.release_date);
  const runtime = formatRuntime(movie.runtime);
  const language = formatLanguage(movie.original_language);
  const rating = formatRating(movie.vote_average);
  const votes = formatVoteCount(movie.vote_count);
  const overview = movie.overview?.trim() || 'Sinopsis belum tersedia untuk film ini.';
  const genres = Array.isArray(movie.genres) ? movie.genres.filter((genre) => genre?.id && genre?.name) : [];
  const cast = Array.isArray(movie.credits?.cast) ? movie.credits.cast.filter((person) => person?.name).slice(0, 14) : [];
  const crew = Array.isArray(movie.credits?.crew) ? movie.credits.crew : [];
  const directors = [...new Set(crew.filter((person) => person.job === 'Director').map((person) => person.name))];
  const writers = [...new Set(crew.filter((person) => ['Screenplay', 'Writer', 'Story'].includes(person.job)).map((person) => person.name))].slice(0, 3);
  const countries = Array.isArray(movie.production_countries)
    ? movie.production_countries.map((country) => formatCountry(country.iso_3166_1, country.name)).filter(Boolean)
    : [];
  const similar = getSimilarMovies(movie);

  root.innerHTML = `
    <article class="detail-article">
      <section class="detail-hero" aria-labelledby="detail-title">
        <div class="detail-hero__media">
          <img data-detail-backdrop src="${escapeHtml(backdropUrl(movie.backdrop_path))}" alt="" width="1280" height="720">
        </div>
        <div class="detail-hero__shade"></div>
        <div class="detail-hero__inner">
          <div class="detail-poster">
            <img data-detail-poster src="${escapeHtml(posterUrl(movie.poster_path))}" alt="Poster ${escapeHtml(title)}" width="500" height="750">
          </div>
          <div class="detail-info">
            <p class="eyebrow">Detail film</p>
            <h1 class="detail-title" id="detail-title">${escapeHtml(title)}</h1>
            ${originalTitle ? `<p class="detail-original-title">Judul asli: ${escapeHtml(originalTitle)}</p>` : ''}
            ${movie.tagline ? `<p class="detail-tagline">“${escapeHtml(movie.tagline)}”</p>` : ''}
            <div class="detail-meta">
              ${rating !== '—' ? `<span class="detail-rating">${iconMarkup('star', 'icon rating__icon')} <strong>${escapeHtml(rating)}</strong> <span class="rating__source">TMDB</span>${votes ? ` <span>${escapeHtml(votes)}</span>` : ''}</span>` : '<span class="detail-rating detail-rating--empty">Belum ada rating</span>'}
              ${releaseYear ? `<span>${iconMarkup('calendar')} ${escapeHtml(String(releaseYear))}</span>` : ''}
              ${runtime ? `<span>${iconMarkup('clock')} ${escapeHtml(runtime)}</span>` : ''}
              <span>${iconMarkup('globe')} ${escapeHtml(language)}</span>
            </div>
            ${genres.length ? `<div class="genre-list" role="group" aria-label="Genre film">${genres.map((genre) => `<a class="genre-chip" href="explore.html?genre=${genre.id}">${escapeHtml(genre.name)}</a>`).join('')}</div>` : ''}
            <p class="detail-overview">${escapeHtml(overview)}</p>
            <div class="detail-actions">
              ${selectedVideo ? `<button type="button" class="button button--primary" data-detail-trailer>${iconMarkup('play')} Tonton Trailer</button>` : `<p class="trailer-availability">${iconMarkup('alert')} Trailer belum tersedia untuk film ini.</p>`}
              <span data-detail-watchlist></span>
            </div>
          </div>
        </div>
      </section>

      <div class="detail-body">
        <div class="detail-main">
          ${cast.length ? `
            <section class="carousel-section cast-section" data-cast-section aria-labelledby="cast-heading">
              <div class="section-head">
                <h2 id="cast-heading">Pemeran</h2>
                <div class="carousel-controls">
                  <button class="carousel-button" type="button" data-carousel-prev aria-label="Pemeran sebelumnya">${iconMarkup('chevron-left')}</button>
                  <button class="carousel-button" type="button" data-carousel-next aria-label="Pemeran berikutnya">${iconMarkup('chevron-right')}</button>
                </div>
              </div>
              <div class="cast-row" data-track tabindex="0" role="group" aria-labelledby="cast-heading">${cast.map(renderCastCard).join('')}</div>
            </section>
          ` : `
            <section class="info-block" aria-labelledby="cast-empty-heading">
              <h2 id="cast-empty-heading">Pemeran</h2>
              <p class="muted">Data pemeran belum tersedia untuk film ini.</p>
            </section>
          `}

          ${similar.items.length ? `
            <section class="carousel-section similar-section" data-similar-section aria-labelledby="similar-heading">
              <div class="section-head">
                <h2 id="similar-heading">${similar.label}</h2>
                <div class="carousel-controls">
                  <button class="carousel-button" type="button" data-carousel-prev aria-label="${similar.label} sebelumnya">${iconMarkup('chevron-left')}</button>
                  <button class="carousel-button" type="button" data-carousel-next aria-label="${similar.label} berikutnya">${iconMarkup('chevron-right')}</button>
                </div>
              </div>
              <div class="movie-row" data-track data-similar-track></div>
            </section>
          ` : ''}
        </div>

        <aside class="detail-aside" aria-labelledby="facts-heading">
          <section class="facts-card">
            <h2 id="facts-heading">Informasi</h2>
            <dl class="facts-list">
              <div><dt>Status</dt><dd>${escapeHtml(translateStatus(movie.status))}</dd></div>
              <div><dt>Tanggal rilis</dt><dd>${escapeHtml(formatDate(movie.release_date))}</dd></div>
              <div><dt>Bahasa</dt><dd>${escapeHtml(language)}</dd></div>
              ${countries.length ? `<div><dt>Negara</dt><dd>${escapeHtml(countries.join(', '))}</dd></div>` : ''}
              ${directors.length ? `<div><dt>Sutradara</dt><dd>${escapeHtml(directors.join(', '))}</dd></div>` : ''}
              ${writers.length ? `<div><dt>Penulis</dt><dd>${escapeHtml(writers.join(', '))}</dd></div>` : ''}
              ${Number(movie.vote_count) ? `<div><dt>Total suara</dt><dd>${escapeHtml(formatVoteCount(movie.vote_count))}</dd></div>` : ''}
            </dl>
            <a class="tmdb-link" href="https://www.themoviedb.org/movie/${movie.id}" target="_blank" rel="noopener noreferrer">
              ${iconMarkup('external')} Lihat data di TMDB
            </a>
          </section>
        </aside>
      </div>
    </article>
  `;

  qs('[data-detail-fallback-title]')?.remove();

  qs('[data-detail-backdrop]', root)?.addEventListener('error', (event) => {
    event.currentTarget.src = 'assets/images/backdrop-placeholder.svg';
  });
  qs('[data-detail-poster]', root)?.addEventListener('error', (event) => {
    event.currentTarget.src = 'assets/images/poster-placeholder.svg';
  });

  const watchlistMount = qs('[data-detail-watchlist]', root);
  if (watchlistMount) watchlistMount.append(createWatchlistButton(movie, { variant: 'button' }));

  const trailerButton = qs('[data-detail-trailer]', root);
  trailerButton?.addEventListener('click', () => {
    if (!selectedVideo) {
      showToast('Trailer belum tersedia untuk film ini.', { type: 'error' });
      return;
    }
    openTrailerForMovie({
      movieId: movie.id,
      title: movie.title,
      video: selectedVideo,
      posterPath: movie.poster_path,
    }).catch((error) => showToast(getApiErrorMessage(error), { type: 'error' }));
  });

  const castSection = qs('[data-cast-section]', root);
  if (castSection) {
    initCarousel(castSection);
    qsaLocal('[data-cast-avatar] img', castSection).forEach((img) => {
      img.addEventListener('error', () => img.remove(), { once: true });
    });
  }

  const similarSection = qs('[data-similar-section]', root);
  if (similarSection) {
    const track = qs('[data-similar-track]', similarSection);
    if (track) {
      similar.items.forEach((item) => {
        const card = createMovieCard(item);
        if (card) track.append(card);
      });
    }
    initCarousel(similarSection);
  }
}

function getSimilarMovies(movie) {
  const recommendations = Array.isArray(movie.recommendations?.results)
    ? movie.recommendations.results.filter((item) => item?.id && item.id !== movie.id)
    : [];
  const similar = Array.isArray(movie.similar?.results)
    ? movie.similar.results.filter((item) => item?.id && item.id !== movie.id)
    : [];
  if (recommendations.length) return { items: recommendations.slice(0, 16), label: 'Rekomendasi film' };
  return { items: similar.slice(0, 16), label: 'Film serupa' };
}

function renderCastCard(person) {
  const photo = profileUrl(person.profile_path);
  const initials = getInitials(person.name);
  return `
    <article class="cast-card">
      <div class="cast-card__avatar" data-cast-avatar>
        <span aria-hidden="true">${escapeHtml(initials)}</span>
        ${photo ? `<img src="${escapeHtml(photo)}" alt="" loading="lazy" width="185" height="278">` : ''}
      </div>
      <h3 class="cast-card__name">${escapeHtml(person.name)}</h3>
      <p class="cast-card__role">${escapeHtml(person.character || 'Peran tidak diketahui')}</p>
    </article>
  `;
}

function getInitials(name = '') {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function translateStatus(status = '') {
  const map = {
    Released: 'Sudah rilis',
    Rumored: 'Rumor',
    Planned: 'Direncanakan',
    'In Production': 'Dalam produksi',
    PostProduction: 'Pascaproduksi',
    'Post Production': 'Pascaproduksi',
    Canceled: 'Dibatalkan',
  };
  return map[status] || status || 'Tidak diketahui';
}

function iconMarkup(name, className = 'icon') {
  return `<svg class="${className}" aria-hidden="true" focusable="false"><use href="assets/icons/sprite.svg#icon-${name}"></use></svg>`;
}

function qsaLocal(selector, scope) {
  return [...scope.querySelectorAll(selector)];
}
