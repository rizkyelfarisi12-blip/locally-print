# LocalPrint (versi inti)
1. Install Node.js 18+ dan LibreOffice (untuk DOC/DOCX/TXT/gambar -> PDF).
2. Untuk grayscale paksa, pasang Ghostscript (`gs`; Windows: `gswin64c`, atau isi `GS` di `.env`). Poppler (`pdfinfo`) opsional.
3. Linux/macOS: pastikan printer terpasang di CUPS (`lpstat -p`). Windows: pasang printer + SumatraPDF, isi `SUMATRA` di `.env`.
3. `cp .env.example .env`, edit PIN, lalu `npm install && npm start`.
4. Buka `http://IP-SERVER:3000` dari komputer lain di LAN.
5. Firewall: Windows -> `netsh advfirewall firewall add rule name=LocalPrint dir=in action=allow protocol=TCP localport=3000 profile=private`; Linux -> `sudo ufw allow from 192.168.0.0/16 to any port 3000`.

## Tes
`npm test` (unit test validasi).

## Cara kerja fitur lanjutan
- Preview: PDF.js (dipasang lewat `npm install`, disajikan dari `/vendor/pdfjs`), thumbnail, zoom, fit page/width, lembar mengikuti kertas & orientasi.
- Grayscale: diteruskan ke driver bila printer punya kontrol warna; jika tidak (atau di Windows) PDF dikonversi dengan Ghostscript sebelum dicetak.
- Status: CUPS `completed` = CUPS melaporkan job selesai dikirim ke printer, bukan bukti kertas keluar. Di Windows, job yang hilang dari antrean ditandai "Keluar dari antrean (tidak terkonfirmasi)".
- Pembatalan: CUPS (`cancel`) dan Windows (`Remove-PrintJob`), hanya selama job masih di antrean dan ID spooler berhasil didapat.
- Tray/kualitas/finishing (stapling, dll.): hanya tampil jika driver CUPS melaporkannya lewat `lpoptions -l`, dan nilainya divalidasi ulang di server. Di Windows (SumatraPDF) opsi ini tidak tersedia.

## Batasan saat ini
Belum ada: React/TS/Tailwind, SQLite (riwayat di JSON), tes integrasi, deteksi kemampuan di Windows, deteksi job CUPS yang dibatalkan/aborted (bisa tampil sebagai 'completed').
