import {
  STORAGE_EVENTS,
  getWatchlist,
} from './storage.js';
import {
  formatNumber,
  qs,
  renderMovieCards,
  renderState,
} from './ui.js';

const root = qs('[data-watchlist-page]');

if (root) {
  const grid = qs('[data-watchlist-grid]', root);
  const stateArea = qs('[data-watchlist-state]', root);
  const summary = qs('[data-watchlist-summary]', root);

  const render = () => {
    const watchlist = getWatchlist();
    if (summary) {
      summary.textContent = watchlist.length
        ? `${formatNumber(watchlist.length)} film tersimpan di browser ini.`
        : 'Belum ada film yang disimpan.';
    }

    if (!watchlist.length) {
      grid.replaceChildren();
      grid.hidden = true;
      stateArea.hidden = false;
      renderState(stateArea, {
        title: 'Watchlist Anda masih kosong',
        message: 'Simpan film dari Beranda, Jelajahi, atau halaman detail untuk menemukannya kembali di sini.',
        type: 'empty',
        iconName: 'bookmark',
        actionLabel: 'Jelajahi Film',
        href: 'explore.html',
      });
      return;
    }

    grid.hidden = false;
    stateArea.hidden = true;
    renderMovieCards(grid, watchlist);
  };

  render();
  window.addEventListener(STORAGE_EVENTS.WATCHLIST, render);
}
