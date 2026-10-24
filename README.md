# CineScope

CineScope adalah situs discovery film statis dengan tema gelap yang dibangun memakai HTML5, CSS3, dan JavaScript ES6+ tanpa framework, tanpa build step, dan tanpa backend. Katalog, detail, kredit, rekomendasi, dan trailer diambil langsung dari TMDB API v3. Trailer diputar melalui YouTube IFrame Player API.

## Fitur

- Beranda dengan carousel film unggulan, panel Watchlist, genre, serta daftar film yang sedang tren, populer, rating tertinggi, dan segera tayang.
- Pencarian judul dan penjelajahan katalog dengan filter genre, tahun rilis, urutan, dan paginasi.
- Halaman detail berisi sinopsis, rating TMDB, tahun, durasi, bahasa, genre, sutradara, penulis, pemeran, dan rekomendasi film.
- Pemutar trailer melalui YouTube dengan penanganan video yang tidak tersedia atau tidak mengizinkan penyematan.
- Watchlist dan riwayat tontonan yang tersimpan di `localStorage`.
- Empty state, loading skeleton, pesan error, tombol coba lagi, dan konfirmasi sebelum menghapus data.
- Responsif untuk desktop, tablet, dan ponsel, dengan dukungan keyboard dan `prefers-reduced-motion`.

CineScope **tidak** menyediakan film lengkap, tidak melakukan streaming ilegal, dan tidak mencoba melewati pembatasan dari pemilik video.

## Menjalankan proyek

1. Buka folder proyek.
2. Buat konfigurasi lokal dari contoh yang tersedia:

   Salin `js/config.local.example.js` menjadi `js/config.local.js`:

   ```powershell
   Copy-Item js/config.local.example.js js/config.local.js
   ```

   Buka `js/config.local.js`, lalu isi API key TMDB Anda:

   ```js
   export const TMDB_API_KEY = 'API_KEY_V3_ANDA';
   ```

   Gunakan **API Key (v3 auth)**, bukan Read Access Token v4. Buat key melalui pengaturan akun TMDB di <https://www.themoviedb.org/settings/api>. File `js/config.local.js` diabaikan oleh Git dan tidak boleh di-commit. Biarkan placeholder `YOUR_TMDB_API_KEY` di `js/config.js`.

3. Jalankan server statis lokal dari folder proyek:

   ```bash
   python -m http.server 8000
   ```

   Atau, jika Node.js tersedia:

   ```bash
   npx serve .
   ```

4. Buka <http://localhost:8000>.

Membuka `index.html` langsung melalui `file://` tidak disarankan karena JavaScript module dan sebagian API browser membutuhkan origin HTTP. Gunakan server lokal.

## Keamanan API key

CineScope adalah aplikasi frontend murni. Key yang dimuat di browser dapat diperiksa oleh pengunjung melalui DevTools, termasuk dari konfigurasi lokal. File `.gitignore` mencegah `js/config.local.js` ikut ter-commit, tetapi tidak menyembunyikan key dari pengunjung situs yang sedang berjalan.

Jangan memakai key rahasia atau key produksi pada deployment publik. Jangan menambahkan key langsung ke `js/config.js`, README, atau file lain yang dilacak Git. Untuk penggunaan serius atau demo publik, gunakan proxy server yang menyimpan key di sisi server dan membatasi permintaan.

Jika proyek di-push ke GitHub, `js/config.local.js` tidak akan ikut. Agar situs GitHub Pages tetap dapat memuat data, sediakan key melalui proxy server, bukan dengan menaruh key di file yang di-commit. Hindari mengunggah seluruh folder lewat fitur drag-and-drop GitHub karena `.gitignore` hanya berlaku saat file ditambahkan melalui Git.

## Struktur proyek

```text
.
├── .gitignore
├── index.html
├── explore.html
├── movie.html
├── watchlist.html
├── history.html
├── about.html
├── css/
│   ├── style.css
│   ├── components.css
│   └── responsive.css
├── js/
│   ├── config.js
│   ├── config.local.example.js
│   ├── api.js
│   ├── storage.js
│   ├── ui.js
│   ├── app.js
│   ├── search.js
│   ├── movie-details.js
│   ├── player.js
│   ├── watchlist.js
│   └── history.js
├── assets/
│   ├── icons/sprite.svg
│   └── images/
└── README.md
```

File `js/config.local.js` adalah konfigurasi rahasia lokal yang tidak disertakan dalam struktur repository dan diabaikan oleh Git.

## Catatan implementasi

- **Discover vs Search.** TMDB Search tidak mendukung penggabungan kata kunci judul dengan filter genre atau urutan. Karena itu, saat kata kunci aktif, filter genre dan urutan dinonaktifkan dan sebuah catatan ditampilkan. Filter tahun tetap dapat digunakan. Hapus kata kunci untuk kembali memakai filter penuh.
- **Rating.** Semua skor berasal dari TMDB dan ditampilkan sebagai rating TMDB.
- **Gambar.** Poster dan backdrop diambil dari TMDB Image API. Jika gambar tidak tersedia atau gagal dimuat, tempat kosong lokal akan ditampilkan agar layout tidak rusak.
- **Penyimpanan.** Hanya film yang dibuka atau disimpan yang dicatat. Watchlist dan riwayat tidak dikirim ke server mana pun. Data akan hilang jika penyimpanan situs dibersihkan.
- **Pemutar trailer.** CineScope memilih trailer atau teaser YouTube dari data TMDB dengan prioritas video resmi. Jika tidak ada video, pengguna melihat pesan yang jelas. Jika video ada tetapi tidak dapat disematkan, pengguna dapat membukanya langsung di YouTube. CineScope tidak memakai iframe palsu atau video pengganti.
- **Tema.** Antarmuka saat ini dirancang khusus gelap. Token CSS tersedia untuk pengembangan tema lanjutan, tetapi belum ada toggle tema setengah jadi.

## Atribusi

This product uses the TMDB API but is not endorsed or certified by TMDB.

Logo TMDB yang digunakan berasal dari aset merek resmi TMDB. CineScope tidak berafiliasi dengan TMDB, YouTube, atau layanan streaming mana pun. Trailer dan video adalah milik pemiliknya masing-masing.

## Pengujian manual yang disarankan

- Beranda: carousel hero, panah carousel, panel Watchlist, genre, dan semua state error.
- Jelajahi: pencarian judul, genre, tahun, urutan, paginasi, URL yang dapat dibagikan, serta catatan mode pencarian.
- Detail: ID valid/tidak valid, trailer yang tersedia/tidak tersedia, cast, rekomendasi, dan penambahan Watchlist.
- Watchlist/Riwayat: persistensi setelah reload, menghapus satu item, mengosongkan data dengan konfirmasi.
- Responsif: lebar 320 px, 375 px, 768 px, 1024 px, dan 1440 px; navigasi mobile; fokus keyboard; pengurangan animasi.
