import { CONFIG } from './config.js';
import { getApiErrorMessage, getMovieVideos } from './api.js';
import { escapeHtml, icon } from './ui.js';

let dialog = null;
let player = null;
let youTubePromise = null;
let sessionId = 0;
let currentVideo = null;
let currentMovie = null;

export function selectBestVideo(videos = []) {
  if (!Array.isArray(videos)) return null;
  const preferredLanguage = String(CONFIG.DEFAULT_LANGUAGE).split('-')[0].toLowerCase();
  const candidates = videos.filter((video) => {
    if (!video || video.site !== 'YouTube' || !video.key) return false;
    return video.type === 'Trailer' || video.type === 'Teaser';
  });

  const scored = candidates.map((video) => {
    let score = 0;
    if (video.type === 'Trailer') score += 60;
    if (video.official === true) score += 50;
    const language = String(video.iso_639_1 || '').toLowerCase();
    if (language === preferredLanguage) score += 6;
    else if (language === 'en') score += 3;
    if (video.published_at) {
      const published = new Date(video.published_at).getTime();
      if (Number.isFinite(published)) score += Math.min(5, Math.max(0, (published - Date.UTC(2000, 0, 1)) / Date.UTC(2050, 0, 1)) * 5);
    }
    return { video, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.video || null;
}

export async function openTrailerForMovie({ movieId, title, video = null, posterPath = '' }) {
  const id = Number(movieId);
  if (!Number.isInteger(id) || id <= 0) return;

  ensureDialog();
  sessionId += 1;
  const token = sessionId;
  currentMovie = { id, title: title || 'Film', posterPath };
  currentVideo = video;

  destroyPlayer();
  setModalMeta();
  renderLoading();
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('[data-trailer-close]')?.focus({ preventScroll: true });

  if (video) {
    mountPlayer(video, token);
    return;
  }

  try {
    const data = await getMovieVideos(id);
    if (token !== sessionId) return;
    const selected = selectBestVideo(data?.results || []);
    if (!selected) {
      renderNoTrailer();
      return;
    }
    currentVideo = selected;
    setModalMeta();
    mountPlayer(selected, token);
  } catch (error) {
    if (token !== sessionId) return;
    renderFetchError(getApiErrorMessage(error));
  }
}

function ensureDialog() {
  if (dialog) return;
  dialog = document.createElement('dialog');
  dialog.className = 'trailer-dialog';
  dialog.setAttribute('aria-labelledby', 'trailer-dialog-title');
  dialog.setAttribute('aria-describedby', 'trailer-dialog-note');
  dialog.innerHTML = `
    <div class="trailer-dialog__head">
      <div>
        <p class="eyebrow">Trailer film</p>
        <h2 class="trailer-dialog__title" id="trailer-dialog-title">Trailer</h2>
      </div>
      <button class="icon-button trailer-dialog__close" type="button" aria-label="Tutup trailer" data-trailer-close>
        ${iconMarkup('close')}
      </button>
    </div>
    <div class="trailer-dialog__media" data-trailer-media></div>
    <div class="trailer-dialog__foot">
      <p class="trailer-dialog__note" data-trailer-note id="trailer-dialog-note">Video diputar langsung dari YouTube.</p>
      <a class="button button--secondary button--small" data-trailer-detail-link href="movie.html">
        ${iconMarkup('arrow-right')} Buka detail film
      </a>
    </div>
  `;
  document.body.append(dialog);

  dialog.querySelector('[data-trailer-close]')?.addEventListener('click', closeDialog);
  dialog.addEventListener('close', () => {
    sessionId += 1;
    destroyPlayer();
    currentVideo = null;
    currentMovie = null;
    const media = dialog?.querySelector('[data-trailer-media]');
    if (media) media.replaceChildren();
  });
}

function setModalMeta() {
  if (!dialog || !currentMovie) return;
  const title = dialog.querySelector('#trailer-dialog-title');
  if (title) title.textContent = currentMovie.title;
  const link = dialog.querySelector('[data-trailer-detail-link]');
  if (link) link.href = `movie.html?id=${currentMovie.id}`;
  const note = dialog.querySelector('[data-trailer-note]');
  if (note) {
    if (currentVideo) {
      const type = currentVideo.type === 'Teaser' ? 'Teaser' : 'Trailer';
      note.textContent = `${type}${currentVideo.official ? ' resmi' : ''} dari YouTube${currentVideo.name ? ` · ${currentVideo.name}` : ''}`;
    } else {
      note.textContent = 'Video diputar langsung dari YouTube.';
    }
  }
}

function getMedia() {
  return dialog?.querySelector('[data-trailer-media]');
}

function renderLoading() {
  const media = getMedia();
  if (!media) return;
  media.replaceChildren();
  const state = document.createElement('div');
  state.className = 'trailer-state';
  state.innerHTML = `
    <span class="spinner spinner--large" aria-hidden="true"></span>
    <p>Memuat trailer…</p>
  `;
  media.append(state);
}

function renderNoTrailer() {
  const media = getMedia();
  if (!media) return;
  destroyPlayer();
  const state = document.createElement('div');
  state.className = 'trailer-state trailer-state--empty';
  state.insertAdjacentHTML('beforeend', `${iconMarkup('film', 'trailer-state__icon')}<h3>Trailer belum tersedia</h3><p>TMDB belum memiliki trailer atau teaser YouTube yang dapat diputar untuk film ini.</p>`);
  media.replaceChildren(state);
}

function renderFetchError(message) {
  const media = getMedia();
  if (!media) return;
  destroyPlayer();
  const state = document.createElement('div');
  state.className = 'trailer-state trailer-state--error';
  state.insertAdjacentHTML(
    'beforeend',
    `${iconMarkup('alert', 'trailer-state__icon')}<h3>Trailer gagal dimuat</h3><p>${escapeHtml(message)}</p>`,
  );
  const actions = document.createElement('div');
  actions.className = 'trailer-state__actions';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'button button--secondary button--small';
  retry.append(icon('refresh'), document.createTextNode('Coba lagi'));
  retry.addEventListener('click', () => {
    if (!currentMovie) return;
    openTrailerForMovie({
      movieId: currentMovie.id,
      title: currentMovie.title,
      posterPath: currentMovie.posterPath,
      video: null,
    });
  });
  actions.append(retry);
  state.append(actions);
  media.replaceChildren(state);
}

async function mountPlayer(video, token) {
  const media = getMedia();
  if (!media || !currentMovie || token !== sessionId) return;
  currentVideo = video;
  setModalMeta();
  media.replaceChildren();

  const frame = document.createElement('div');
  frame.className = 'trailer-frame';
  const mount = document.createElement('div');
  mount.className = 'trailer-frame__mount';
  mount.id = 'youtube-player-mount';
  frame.append(mount);
  media.append(frame);

  try {
    const YT = await loadYouTubeApi();
    if (token !== sessionId || !dialog?.open) return;

    const origin = /^https?:$/.test(window.location.protocol) ? window.location.origin : undefined;
    player = new YT.Player(mount, {
      videoId: video.key,
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        autoplay: 1,
        rel: 0,
        playsinline: 1,
        ...(origin ? { origin } : {}),
      },
      events: {
        onReady: (event) => {
          if (token !== sessionId) return;
          try {
            const iframe = event.target.getIframe?.();
            iframe?.setAttribute('title', `Trailer ${currentMovie?.title || ''}`);
            iframe?.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
            iframe?.setAttribute('allowfullscreen', '');
            event.target.playVideo?.();
          } catch {
            // Autoplay can still be blocked by the browser; YouTube shows its own play control.
          }
        },
        onError: (event) => {
          if (token !== sessionId) return;
          renderPlayerError(event.data);
        },
      },
    });
  } catch {
    if (token !== sessionId) return;
    renderPlayerLoadError();
  }
}

function renderPlayerError(code) {
  const media = getMedia();
  if (!media) return;
  const key = currentVideo?.key;
  destroyPlayer();

  const messages = {
    2: 'ID video YouTube tidak valid.',
    5: 'Video ini tidak dapat diputar oleh pemutar HTML5.',
    100: 'Video tidak tersedia, bersifat privat, atau telah dihapus.',
    101: 'Pemilik video tidak mengizinkan pemutaran tersemat.',
    150: 'Pemilik video tidak mengizinkan pemutaran tersemat.',
  };
  const message = messages[code] || 'Terjadi kesalahan saat memutar video.';

  const state = document.createElement('div');
  state.className = 'trailer-state trailer-state--error';
  state.insertAdjacentHTML(
    'beforeend',
    `${iconMarkup('alert', 'trailer-state__icon')}<h3>Video tidak dapat diputar</h3><p>${escapeHtml(message)}</p><p class="trailer-state__hint">CineScope tidak mencoba melewati pembatasan dari pemilik video.</p>`,
  );
  if (key) {
    const link = document.createElement('a');
    link.className = 'button button--secondary button--small';
    link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(key)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.append(document.createTextNode('Buka di YouTube'), icon('external'));
    state.append(link);
  }
  media.replaceChildren(state);
}

function renderPlayerLoadError() {
  const media = getMedia();
  if (!media) return;
  const key = currentVideo?.key;
  destroyPlayer();
  const state = document.createElement('div');
  state.className = 'trailer-state trailer-state--error';
  state.insertAdjacentHTML(
    'beforeend',
    `${iconMarkup('alert', 'trailer-state__icon')}<h3>Pemutar YouTube gagal dimuat</h3><p>Periksa koneksi internet Anda, lalu coba buka video langsung di YouTube.</p>`,
  );
  if (key) {
    const link = document.createElement('a');
    link.className = 'button button--secondary button--small';
    link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(key)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.append(document.createTextNode('Buka di YouTube'), icon('external'));
    state.append(link);
  }
  media.replaceChildren(state);
}

function closeDialog() {
  if (dialog?.open) dialog.close();
}

function destroyPlayer() {
  if (!player) return;
  try {
    player.destroy?.();
  } catch {
    // The iframe may already have been removed by a player error.
  }
  player = null;
}

function loadYouTubeApi() {
  if (youTubePromise) return youTubePromise;
  if (window.YT?.Player) return Promise.resolve(window.YT);

  youTubePromise = new Promise((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => {
      youTubePromise = null;
      reject(new Error('YouTube API timeout'));
    }, 15000);

    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      try {
        previousCallback?.();
      } catch {
        // Ignore a callback owned by another integration.
      }
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube API unavailable'));
    };

    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (existing) return;

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.addEventListener('error', () => {
      window.clearTimeout(timeout);
      youTubePromise = null;
      reject(new Error('YouTube API failed to load'));
    });
    document.head.append(script);
  });

  return youTubePromise;
}

function iconMarkup(name, className = 'icon') {
  return `<svg class="${className}" aria-hidden="true" focusable="false"><use href="assets/icons/sprite.svg#icon-${name}"></use></svg>`;
}
