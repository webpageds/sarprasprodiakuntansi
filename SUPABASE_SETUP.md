# SIM-SPA — Setup Supabase

Panduan ini menyiapkan fondasi akun dan database bersama untuk SIM-SPA Prodi Akuntansi.

## Status
- index.html masih merupakan aplikasi frontend lama berbasis penyimpanan browser.
- supabase/migrations/001_simspa_core.sql menyiapkan tabel bersama, profil, role, dan kebijakan Row Level Security.
- Login lintas perangkat belum aktif hanya dengan menambahkan SQL ini. Frontend harus dikonfigurasi dengan Project URL dan publishable key, kemudian fungsi CRUD di index.html harus dipindahkan dari localStorage ke Supabase.

## 1. Buat proyek Supabase
1. Buka https://supabase.com/dashboard dan buat proyek baru.
2. Simpan Project URL dan publishable key dari Project Settings → API.
3. Jangan pernah menaruh service_role key atau secret key dalam index.html, GitHub, atau chat.

## 2. Buat tabel
1. Buka SQL Editor pada proyek Supabase.
2. Salin seluruh isi supabase/migrations/001_simspa_core.sql.
3. Jalankan query.
4. Pastikan tabel profiles, rooms, assets, stock_items, stock_transactions, loans, repairs, asset_mutations, asset_disposals, cleaning_records, dan activity_logs berhasil dibuat.

## 3. Buat akun awal
1. Buka Authentication → Users.
2. Tambahkan akun dengan email dan password sementara yang kuat.
3. Trigger akan membuat profil baru dengan role awal dosen.
4. Ubah role akun Admin pertama melalui SQL Editor, menggunakan UUID akun dari Authentication → Users:

    update public.profiles
    set role = 'admin', is_active = true
    where id = 'UUID-AKUN-ADMIN';

5. Setelah Admin masuk, role pengguna lain dapat dikelola melalui kebijakan backend yang akan dihubungkan pada tahap integrasi frontend.

## 4. Hak akses
- admin dan pimpinan dapat mengelola seluruh data operasional.
- dosen dapat membaca data aset/ruangan, membuat dan membaca pengajuan miliknya sendiri, serta melaporkan kerusakan/keluhan.
- petugas dapat melihat laporan perbaikan dan mengelola checklist kebersihan.

Hak akses di database menggunakan RLS. Menyembunyikan menu frontend saja bukan pengamanan data.

## 5. Tahap integrasi berikutnya
Diperlukan Project URL dan publishable key agar frontend dapat dihubungkan. Setelah tersedia, frontend perlu:
- memakai Supabase Auth untuk sign-in dan sign-out;
- mengambil role dari profiles, bukan dari pilihan role yang diketik pengguna;
- membaca/menulis setiap modul ke tabel terkait;
- memakai Realtime untuk pembaruan antarpengguna;
- mengunggah foto aset/bukti ke Supabase Storage jika diperlukan;
- menonaktifkan fallback localStorage saat mode database aktif.

Referensi resmi:
- Auth: https://supabase.com/docs/guides/auth
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Realtime: https://supabase.com/docs/guides/realtime
