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


## Integrasi frontend bersama (pembaruan)
- Frontend GitHub Pages sudah dikonfigurasi dengan URL Web App yang diberikan pemilik project.
- Frontend meminta daftar modul dari action `list` setelah login dan mengirim perubahan melalui action `sync`.
- Data aplikasi disimpan sebagai JSON pada tab `AppData` agar struktur data lama di frontend tetap terjaga.
- **Wajib:** salin ulang versi terbaru `apps-script/Code.gs` dari GitHub ke editor Apps Script, simpan, jalankan `initializeDatabase` sekali untuk membuat tab `AppData`, lalu Deploy > Manage deployments > Edit > New version > Deploy.
- Jika hanya frontend yang diperbarui tetapi backend deployment lama masih aktif, login mungkin berhasil tetapi sinkronisasi modul akan gagal karena action `sync` belum tersedia di versi deployment tersebut.
- Pada login pertama, frontend mengambil data yang sudah ada di AppData; ia tidak lagi menginisialisasi data contoh lokal.
- Uji koneksi browser diperlukan karena browser dapat membatasi request lintas domain ke Apps Script. Jika Console menampilkan CORS/network error, integrasi perlu disesuaikan dengan mekanisme proxy/host yang didukung.


## Integrasi dan konfigurasi roster dosen (branch pembaruan)

Branch `feature/admin-dosen-dashboard-integration` menambahkan:
- Filter record pada API untuk pengguna non-admin berdasarkan pemilik record/ID akun.
- Validasi agar pengguna tidak dapat mengubah atau menghapus record pengguna lain melalui endpoint AppData.
- Helper `importRosterFromStaffSpreadsheet()` yang membaca tab spreadsheet sumber dengan gid `390669889`, mengenali kolom Nama dan NUPTK, lalu menyalin roster ke `LecturerRoster`.
- Frontend membatasi daftar aset dosen pada aset yang ditautkan dan memakai daftar peminjaman dari API yang sudah difilter.
- Dashboard dosen memfilter daftar perbaikan/kebersihan berdasarkan field kepemilikan; dashboard admin mempertahankan rekap sistem.
- Proses penyimpanan frontend menunggu sinkronisasi selesai dan menampilkan status gagal bila backend menolak.

### Tahap A — Perbarui Apps Script
1. Buka Apps Script project yang sudah dimiliki pengelola.
2. Ganti seluruh isi `Code.gs` dengan versi file `apps-script/Code.gs` dari branch pembaruan.
3. Pastikan nilai `SPREADSHEET_ID` tetap mengarah pada spreadsheet database yang benar.
4. Simpan, lalu jalankan `initializeDatabase` dan pastikan otorisasi berhasil.
5. Jalankan `importRosterFromStaffSpreadsheet` satu kali. Fungsi ini membaca tab dengan gid 390669889 dari spreadsheet roster, dan menyalin kolom Nama/NUPTK ke tab `LecturerRoster`.
6. Tinjau tab `LecturerRoster`: setiap NUPTK harus tetap sebagai teks 16 digit dan role dosen.

**Perhatian:** helper import mengosongkan isi tab `LecturerRoster` sebelum menulis roster baru. Jangan gunakan tab itu untuk catatan lain. Data Users yang sudah dibuat tidak dihapus atau diganti oleh helper tersebut.

### Tahap B — Buat akun dosen
1. Jalankan `importLecturersFromRosterSheet` satu kali.
2. Buka Execution log untuk melihat pemberitahuan hasil; password sementara tidak boleh dibagikan lewat grup umum.
3. Bagikan username NUPTK dan password sementara kepada dosen masing-masing melalui kanal privat.
4. Dosen login dan membuat password baru minimal 12 karakter.
5. Jangan meneruskan Execution log yang memuat kredensial. Hapus/bersihkan log yang tersimpan sesuai kebijakan pengelola.

### Tahap C — Deploy Apps Script
1. Pilih Deploy → Manage deployments.
2. Edit deployment Web App yang URL-nya dipakai frontend.
3. Pilih New version, lalu Deploy.
4. Pastikan URL /exec yang dipasang pada index.html adalah deployment aktif yang sama.
5. Login admin, dosen uji, dan verifikasi akses masing-masing menggunakan dua akun uji yang berbeda.

### Tahap D — Verifikasi akses sebelum penggunaan
- Admin dapat membaca rekap seluruh modul yang diizinkan.
- Dosen hanya dapat membaca record yang memiliki ID pemilik akun atau aset yang ditautkan.
- Coba panggil API dari akun dosen dengan ID record milik dosen lain; operasi harus ditolak.
- Buat satu pengajuan uji, lalu pastikan record muncul di Google Sheets dan hanya terlihat oleh pemilik serta admin/pimpinan.
- Uji peminjaman, kerusakan, kebersihan, export laporan, serta session timeout.
- Backup spreadsheet sebelum sinkronisasi admin pertama.

### Batasan yang masih perlu diuji
Integrasi lintas domain melalui iframe/postMessage harus diuji pada browser dan deployment yang sebenarnya. Filter record menggunakan field kepemilikan record; data lama yang tidak memiliki owner ID atau belum dipetakan tidak otomatis dianggap sebagai milik dosen. Aset lama perlu ditautkan oleh Admin melalui menu Pemetaan Aset Dosen.

Hash SHA-256 pada starter ini adalah mekanisme hash sederhana, bukan password hashing adaptif modern. Untuk penggunaan produksi, evaluasi Google Identity/Workspace atau mekanisme autentikasi yang lebih kuat, pengelolaan sesi tahan lama, pembatasan akses deployment, audit, dan kebijakan perlindungan data pribadi.
