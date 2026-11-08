# SIM-SPA — Google Apps Script + Google Sheets

Repo frontend tetap di GitHub Pages. Backend berada di Google Apps Script; database bersama berada di Google Sheets.

## Yang sudah ada di repository
- `apps-script/Code.gs`: starter Web App API (health, bootstrap, setup admin pertama, login, list, save, remove).
- `apps-script/appsscript.json`: konfigurasi Apps Script.
- Sheet database: Users, Assets, Rooms, StockItems, StockTransactions, Loans, Repairs, AssetMutations, AssetDisposals, CleaningRecords, ActivityLogs.

## Penting: status integrasi
Ini adalah **backend starter**, belum otomatis terhubung ke frontend `index.html`. Saat ini frontend masih menggunakan penyimpanan browser dan login pemilihan role. Jangan menganggap login lintas perangkat sudah aktif sampai URL Web App dipasang pada frontend dan semua proses baca/tulis diuji.

## Tahap 1 — Buat spreadsheet database
1. Buka https://sheets.new lalu buat spreadsheet bernama **SIM-SPA Database**.
2. Salin ID dari URL: `https://docs.google.com/spreadsheets/d/ID_SPREADSHEET/edit`.
3. Simpan spreadsheet hanya untuk pengelola tepercaya. Jangan membagikannya sebagai editor ke semua pengguna aplikasi.

## Tahap 2 — Buat project Apps Script dari GitHub
1. Buka https://script.google.com dan klik **New project**.
2. Di menu Project Settings aktifkan **Show "appsscript.json" manifest file in editor**.
3. Buat file script `Code.gs`, lalu salin isi `apps-script/Code.gs` dari repository ini.
4. Salin `apps-script/appsscript.json` ke manifest editor.
5. Pada baris `SPREADSHEET_ID` di bagian CONFIG, ganti `PASTE_SPREADSHEET_ID_HERE` dengan ID spreadsheet dari Tahap 1.
6. Save project.

## Tahap 3 — Siapkan sheet
1. Dari editor Apps Script, pilih fungsi `bootstrap` lalu klik Run.
2. Berikan otorisasi Google Sheets saat diminta.
3. Pastikan semua tab dibuat otomatis.

## Tahap 4 — Buat admin pertama
1. Untuk sementara, dari editor jalankan fungsi satu kali yang memanggil `setupAdmin_` dengan data admin. Cara paling mudah: tambahkan fungsi sementara berikut di Code.gs, jalankan satu kali, lalu hapus fungsi tersebut:
```javascript
function createInitialAdminOnce() {
  return setupAdmin_({
    name: 'Administrator SIM-SPA',
    email: 'admin@kampus.ac.id',
    password: 'GANTI_DENGAN_PASSWORD_UNIK_MINIMAL_12_KARAKTER'
  });
}
```
2. Ganti email dan password contoh sebelum menjalankan.
3. Hapus fungsi sementara setelah admin berhasil dibuat.
4. Jangan pernah menaruh password admin ke repository publik. Fungsi di atas hanya boleh digunakan sementara di editor pribadi.

## Tahap 5 — Deploy Web App
1. Klik **Deploy → New deployment**.
2. Pilih type **Web app**.
3. Execute as: **Me** (pemilik script).
4. Who has access: pilih akses yang sesuai dengan kebijakan akun Google Workspace/kampus. Jangan gunakan akses publik tanpa evaluasi keamanan.
5. Klik Deploy, selesaikan otorisasi, lalu salin URL berakhiran `/exec`.
6. Buka URL tersebut. Respons yang diharapkan: JSON dengan `ok:true` dan `API aktif`.

## Tahap 6 — Hubungkan frontend GitHub Pages
URL Web App perlu dipasang ke frontend dan semua modul perlu dialihkan dari localStorage ke API. Hal ini belum dilakukan pada starter ini, karena perlu disesuaikan terhadap fungsi dan struktur data pada index.html saat ini.
- Gunakan endpoint `POST` dengan payload JSON.
- Action tersedia: `login`, `list`, `save`, `remove`, `logout`.
- Health check: buka URL /exec (GET).
- Setelah login, simpan token sesi sementara dan kirim token tersebut pada permintaan berikutnya.
- Untuk API lintas domain, uji pemanggilan dari GitHub Pages di browser. Apps Script ContentService dapat melakukan redirect; konfigurasi CORS/fetch harus diuji pada browser dan akun tujuan.

## Keamanan dan batasan
- Jangan membuat spreadsheet database dapat diakses publik.
- Jangan simpan token atau password di GitHub.
- Akun pengguna tambahan sebaiknya dibuat oleh pengelola tepercaya di tab Users dengan password hash+salt; jangan memasukkan password polos.
- Starter ini memakai CacheService untuk token sesi. Token dapat kedaluwarsa/terhapus lebih cepat, sehingga pengguna mungkin perlu login ulang.
- Password hashing SHA-256 di starter ini bukan pengganti password hashing adaptif modern; sebelum produksi, tingkatkan mekanisme autentikasi atau gunakan Google Identity/Workspace login yang tervalidasi.
- Periksa aturan akses dan validasi data sesuai kebijakan kampus sebelum digunakan untuk data penting.
- Apps Script mempunyai kuota dan batas eksekusi; cek kuota resmi Google sebelum operasional skala besar.
- Backup spreadsheet secara berkala.
