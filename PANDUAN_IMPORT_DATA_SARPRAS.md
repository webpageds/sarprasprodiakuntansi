# Panduan Import Data Sarpras SIM-SPA

## Isi paket

Impor paket `SIMSPA_Paket_Import_Data.xlsx` ke spreadsheet SIM-SPA. Paket memuat:
- 35 ruangan/fasilitas
- 176 kelompok inventaris sarana-prasarana
- 37 item persediaan ATK
- 5 catatan pemeliharaan historis
- 46 pengajuan ATK semester Genap 2025/2026

Pengajuan ATK sengaja dipisahkan dari stok tersedia. Data pengajuan bukan bukti barang sudah diterima.

## Cara memasukkan paket ke Google Sheets

1. Unduh `SIMSPA_Paket_Import_Data.xlsx` dari percakapan.
2. Buka spreadsheet SIM-SPA yang terhubung ke Apps Script.
3. Pilih **File → Import → Upload** dan unggah workbook.
4. Pada pilihan lokasi impor, pilih **Insert new sheet(s)** / **Sisipkan sheet baru**. Jangan pilih replace spreadsheet.
5. Pastikan tab `SIMSPA_ImportData` terlihat. Tab lain yang diawali `SIMSPA_` adalah tampilan audit / pemeriksaan data sumber.

## Impor ke AppData

1. Perbarui `Code.gs` dengan versi terbaru dari repository.
2. Klik Save.
3. Dari dropdown fungsi Apps Script, pilih `importSarprasStagingData`.
4. Klik Run dan cek Execution Log. Fungsi ini melakukan upsert berdasarkan pasangan module + id, sehingga aman dijalankan ulang tanpa menggandakan baris dengan ID yang sama.
5. Deploy → Manage deployments → Edit → New version → Deploy.

Modul yang diimpor: `rooms`, `assets`, `stock`, `repairs`, dan `proc`.

## Dashboard Admin

Setelah deployment:
- Dashboard Admin menampilkan ringkasan inventaris, ruangan, stok, riwayat pemeliharaan, pengajuan ATK, dan aset yang sudah ditautkan ke akun dosen.
- Menu **Pengajuan ATK** menampilkan 46 baris pengajuan dari file semester Genap 2025/2026.
- Menu **Aset Tetap** menampilkan kelompok inventaris dan jumlah unitnya.

## Menautkan aset ke akun dosen

Dokumen sumber menyebut penanggung jawab umum seperti **Dosen Bidang Sarpras** atau **Tendik Prodi**, bukan nama dan NUPTK dosen tertentu. Karena itu, aset tidak ditautkan otomatis ke sembarang akun.

1. Login sebagai Admin Prodi.
2. Buka menu **Pemetaan Aset Dosen**.
3. Klik **Muat akun dosen**.
4. Pilih dosen yang memang bertanggung jawab atas suatu aset, kemudian klik **Simpan tautan**.
5. Setelah dosen login ulang, dashboard pribadinya menampilkan aset yang ditautkan kepadanya.

Peminjaman baru sudah tercatat atas userId pengaju. Dosen hanya melihat peminjaman miliknya sendiri; Admin/Pimpinan melihat rekap seluruh pengguna.

## Catatan sumber dan kualitas data

- File inventaris ringkas `Inventaris Prodi Akuntansi S1 Kampus Serang.xlsx` dan versi `...Serang1.xlsx` tidak diimpor sebagai data tambahan karena akan menggandakan kelompok inventaris.
- Terdapat perbedaan yang perlu dicocokkan secara fisik: ringkasan menyebut Meja Dosen Sekat 5, sedangkan daftar Ruang Dosen semester Ganjil 2025/2026 menyebut 20; ringkasan menyebut Infokus/Proyektor 11, sedangkan daftar Ruang Dosen menyebut Infokus 12.
- Untuk ruang kelas dengan kondisi **Butuh Perbaikan**, sumber hanya menyatakan kondisi ruang; kondisi tiap barang tidak dirinci. Data per barang diberi status **Perlu Pemeriksaan** dan diberi catatan, bukan dianggap kerusakan barang yang sudah terkonfirmasi.
- Data pemeliharaan 5 baris adalah riwayat dalam dokumen, bukan tiket perbaikan terbuka.
- Nilai perolehan, tahun pembelian, nomor seri, dan penanggung jawab perorangan tidak tersedia untuk banyak kelompok inventaris. Field tersebut dibiarkan kosong atau nol, tidak dibuat-buat.
