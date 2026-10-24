import {
  STORAGE_EVENTS,
  getHistory,
  removeHistoryItem,
} from './storage.js';
import {
  createMovieCard,
  formatNumber,
  formatRelativeTime,
  icon,
  qs,
  renderState,
  showToast,
} from './ui.js';

const root = qs('[data-history-page]');

if (root) {
  const grid = qs('[data-history-grid]', root);
  const stateArea = qs('[data-history-state]', root);
  const summary = qs('[data-history-summary]', root);

  const render = () => {
    const history = getHistory();
    if (summary) {
      summary.textContent = history.length
        ? `${formatNumber(history.length)} film terakhir yang Anda buka.`
        : 'Belum ada film yang pernah Anda buka.';
    }

    if (!history.length) {
      grid.replaceChildren();
      grid.hidden = true;
      stateArea.hidden = false;
      renderState(stateArea, {
        title: 'Riwayat masih kosong',
        message: 'Film yang Anda buka akan muncul di sini agar mudah ditemukan kembali.',
        type: 'empty',
        iconName: 'history',
        actionLabel: 'Temukan Film',
        href: 'explore.html',
      });
      return;
    }

    grid.hidden = false;
    stateArea.hidden = true;
    const fragment = document.createDocumentFragment();

    for (const movie of history) {
      const card = createMovieCard(movie, {
        note: movie.viewedAt ? `Dilihat ${formatRelativeTime(movie.viewedAt)}` : '',
      });
      if (!card) continue;

      const body = card.querySelector('.movie-card__body');
      if (body) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'movie-card__text-action';
        remove.dataset.historyRemove = String(movie.id);
        remove.dataset.title = movie.title;
        remove.append(icon('close'), document.createTextNode('Hapus dari riwayat'));
        body.append(remove);
      }
      fragment.append(card);
    }
    grid.replaceChildren(fragment);
  };

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-history-remove]');
    if (!button) return;
    removeHistoryItem(Number(button.dataset.historyRemove));
    showToast('Film dihapus dari riwayat.', { type: 'info' });
  });

  render();
  window.addEventListener(STORAGE_EVENTS.HISTORY, render);
}
