// Dipanggil installer: tampilkan alamat akses dan cek apakah server sudah menjawab.
// exit code 0 = server menjawab.
const os = require("os");
const port = process.argv[2] || "80";
const v4 = (i) => i.family === "IPv4" || i.family === 4;
const ips = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => v4(i) && !i.internal)
  .map((i) => i.address);
const suffix = port === "80" ? "" : ":" + port;
(async () => {
  let ok = false;
  for (let i = 0; i < 12 && !ok; i++) {
    try {
      ok = (
        await fetch("http://127.0.0.1:" + port + "/api/info", {
          signal: AbortSignal.timeout(2000),
        })
      ).ok;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.log(ok ? "Server berjalan." : "Server belum menjawab. Lihat run.log di folder aplikasi.");
  console.log("Buka di komputer ini  : http://localhost" + suffix);
  for (const ip of ips) console.log("Dari komputer lain    : http://" + ip + suffix);
  process.exit(ok ? 0 : 1);
})();
