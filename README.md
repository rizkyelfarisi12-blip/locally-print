# LocalPrint v1.1.0

Aplikasi web untuk mencetak lewat jaringan lokal (LAN) ke printer yang tersambung di satu komputer server.
Komputer lain cukup membuka alamat di browser, memilih file (atau menempel link Google), lalu Print.

## Pasang di Windows (disarankan)

1. Ekstrak zip ini ke folder tetap, misalnya `C:\LocalPrint` (jangan di Downloads atau folder yang akan dihapus).
2. Klik kanan **install.bat** > **Run as administrator**.
3. Ikuti pertanyaannya. Installer akan:
   - memasang Node.js, SumatraPDF, dan (jika Anda setuju) LibreOffice dan Ghostscript lewat `winget`, melewati yang sudah ada;
   - mengunduh komponen aplikasi lewat npm (perlu internet saat pemasangan);
   - membuat file `.env` (menanyakan port; default 80);
   - membuka firewall untuk jaringan Private/Domain;
   - mendaftarkan **auto-start**: LocalPrint jalan sendiri tanpa jendela setiap kali Windows login, dan menyala lagi bila berhenti;
   - membuat shortcut `LocalPrint` di Desktop.
4. Di akhir, installer menampilkan alamat, mis. `http://192.168.1.20`. Alamat itu yang dibuka dari komputer lain.

Tidak perlu `npm start` lagi. Untuk uji coba manual (melihat pesan galat) pakai **start.bat**.

| File | Fungsi |
| --- | --- |
| `install.bat` | Pasang semuanya (jalankan sebagai Administrator; aman diulang) |
| `restart.bat` | Mulai ulang, dipakai setelah mengubah `.env` |
| `uninstall.bat` | Hapus auto-start dan aturan firewall (file aplikasi tidak dihapus) |
| `start.bat` | Jalankan di jendela biasa untuk uji coba |

Syarat: Windows 10/11 dengan `winget` (bawaan Windows 11 dan Windows 10 yang sudah di-update). Tanpa winget, pasang manual Node.js 18+, SumatraPDF, dan LibreOffice, lalu jalankan `install.bat`.
Auto-start berjalan saat pengguna **login** (printer Windows bersifat per pengguna). Jika komputer server harus siap sebelum ada yang login, aktifkan login otomatis Windows.

## Mengatur lokasi LibreOffice, SumatraPDF, dan Ghostscript

Kalau program terpasang di tempat tidak biasa (atau installer tidak menemukannya), atur manual dengan salah satu cara berikut. Urutan prioritas: **halaman Admin > file `.env` > folder `tools\` dan lokasi umum > PATH**.

**Cara 1: halaman Admin (disarankan).** Buka `http://localhost/admin.html` di komputer server, bagian **Lokasi program pendukung**. Tiap program menampilkan status Ditemukan / Tidak ditemukan, path yang sedang dipakai, dan tombol **Isi dengan hasil deteksi**. Isi path lengkap ke file .exe lalu **Simpan**. Berlaku langsung tanpa restart. Tips: di File Explorer, klik kanan file > *Copy as path*.

Nama file dibatasi (`SumatraPDF*.exe`, `soffice(.exe)`, `gswin64c.exe` / `gswin32c.exe` / `gs`) supaya halaman Admin tidak bisa dipakai menjalankan program sembarang.

**Cara 2: file `.env`** (restart setelah diubah):
```
SUMATRA=C:\Program Files\SumatraPDF\SumatraPDF.exe
SOFFICE=C:\Program Files\LibreOffice\program\soffice.exe
GS=C:\Program Files\gs\gs10.08.0\bin\gswin64c.exe
```
**Cara 3: versi portable.** Taruh `SumatraPDF.exe` di folder `tools\`; otomatis terdeteksi.

Fungsi tiap program: SumatraPDF = kirim PDF ke printer (wajib di Windows); LibreOffice = ubah DOC/DOCX/gambar/TXT jadi PDF (PDF murni tidak butuh); Ghostscript = grayscale/hitam-putih paksa.
Saat server mulai, `server.log` mencatat program mana yang ditemukan.

## Halaman Admin

`http://localhost/admin.html`: **riwayat cetak**, lokasi program, nama aplikasi, printer bawaan, batas ukuran file/salinan/job per jam, lama dan jumlah riwayat (default 5000 entri / 30 hari), PIN, dan log galat.
- **Tanpa PIN admin**, halaman ini hanya bisa dibuka dari komputer server sendiri.
- Untuk membukanya dari komputer lain, isi PIN admin (di halaman Admin bagian Keamanan, atau `ADMIN_PIN` di `.env`).
- Setelah menyimpan dari halaman Admin, nilai tersimpan di `settings.json` dan mengalahkan `.env` untuk pengaturan yang sama.
- Port dan `ALLOW_PREFIX` tetap di `.env`.

## Orientasi, fit to page, dan hasil cetak

Di Windows, server menyusun ulang tiap halaman PDF ke lembar kertas yang dipilih **sebelum** dikirim ke SumatraPDF, dengan aturan yang sama persis dengan preview. Jadi yang terlihat di preview = yang tercetak.
- **Orientasi**: *Otomatis* (default) mengikuti tiap halaman dokumen (halaman landscape dicetak di kertas landscape, tanpa ruang kosong). *Portrait*/*Landscape* memaksa orientasi kertas.
- **Putar isi halaman agar memenuhi kertas** (muncul saat orientasi dipaksa): bila arah halaman berbeda dengan kertas, isinya diputar 90 derajat agar memenuhi kertas. Matikan jika Anda lebih suka isi tetap tegak dengan ruang kosong di sisi.
- **Skala**: *Sesuaikan ke kertas* (membesar/mengecil sampai muat), *Ukuran asli (100%)*, atau *Kustom (%)*. Preview menampilkan "Skala cetak N%".
- **Margin**: Default 6 mm (aman untuk batas cetak printer); "Tanpa margin" bisa memotong tepi sesuai printer.
- **Google Sheets**: diekspor ulang otomatis mengikuti Kertas dan Orientasi (tabel lebar: pilih Landscape).
- Bila penyusunan gagal (mis. PDF terenkripsi), server kembali ke cara lama (SumatraPDF yang mengatur) dan mencatat `LAYOUT` di `server.log`.
- Di Linux/CUPS opsi tetap diteruskan ke CUPS apa adanya.

## Fitur

- **Cetak dari link Google**: tempel link Docs, Sheets, Slides, atau file Drive. Dokumen harus dibagikan sebagai "Siapa saja yang memiliki link". Sheets: link dengan `gid=` mencetak tab itu saja, tanpa `gid` seluruh tab (A4, muat lebar, tanpa garis grid).
- **Banyak file sekaligus**: pilih/seret beberapa file atau tempel beberapa link. Satu job per file dengan pengaturan cetak yang sama. "Halaman ini" dan "Rentang" dinonaktifkan bila file lebih dari satu.
- Preview PDF.js, thumbnail, zoom; grayscale/hitam-putih; duplex; salinan; skala; orientasi.
- **Riwayat cetak hanya ada di halaman Admin** (pengguna biasa tidak melihatnya): cari, filter status, halaman 50 baris, batalkan job, unduh CSV.
- File sementara di server dihapus setelah 1 jam; riwayat disimpan sesuai pengaturan (default 30 hari).

## Linux / macOS

`npm install --omit=dev --omit=optional`, salin `.env.example` ke `.env`, lalu `node server.js` (butuh CUPS dan LibreOffice). Auto-start di sini lewat systemd/launchd; skrip bawaan hanya untuk Windows.

## Pemecahan masalah

- **Tidak bisa dibuka dari komputer lain**: pastikan jaringan di komputer server berprofil *Private* (atau jalankan `netsh advfirewall firewall set rule name="LocalPrint" new profile=any` sebagai Administrator) dan IP yang dibuka benar. Akses hanya diterima dari IP 192.168.x, 10.x, 172.x.
- **"Port sudah dipakai"** (lihat `run.log`): ganti `PORT` di `.env` (mis. 8080), jalankan `restart.bat`, dan ulangi `install.bat` agar firewall ikut berubah.
- **Server tidak jalan setelah restart**: lihat `run.log` dan `server.log` di folder aplikasi.
- **Konversi DOCX gagal**: cek status LibreOffice di halaman Admin.
- **Status "Keluar dari antrean"**: di Windows artinya job hilang dari antrean spooler, bukan bukti kertas keluar.
- **Upgrade dari v1.0**: timpa semua file kecuali `.env`, `settings.json`, `history.json`, lalu jalankan `install.bat` lagi (mengunduh komponen baru `pdf-lib`).
- **Pindah komputer**: salin folder baru, lalu salin `.env`, `settings.json`, dan `history.json` dari folder lama.

## Pengembangan

`npm test` (unit + integrasi dengan MockPrinter). Data (riwayat, pengaturan, tmp) bisa dipindah dengan `DATA_DIR` di `.env`.

## Batasan

Di Windows, opsi *Halaman per lembar*, *Urutan terbalik*, dan *Collate* belum diterapkan (SumatraPDF tidak mendukungnya); hanya CUPS yang menjalankannya. Riwayat disimpan di JSON (bukan SQLite); UI HTML biasa (bukan React/Tailwind); tray/kualitas/finishing printer hanya terdeteksi di CUPS, tidak di Windows; status selesai tidak bisa memastikan kertas keluar.
