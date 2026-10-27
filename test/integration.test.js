// Butuh: npm install. Jalankan: npm run test:int  (memakai MockPrinter, hanya untuk pengujian)
const fs = require("fs"),
  os = require("os"),
  path = require("path");
process.env.MOCK_PRINTER = "1";
process.env.PIN = "";
process.env.ADMIN_PIN = "";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lp-int-"));
const test = require("node:test"),
  assert = require("node:assert");
const { app, mockLog } = require("../server");
let srv, base;
test.before(
  () =>
    new Promise((r) => {
      srv = app.listen(0, "127.0.0.1", () => {
        base = "http://127.0.0.1:" + srv.address().port;
        r();
      });
    }),
);
test.after(() => srv.close());
const MIN =
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF";
async function upload(name, body) {
  const fd = new FormData();
  fd.append("file", new Blob([body]), name);
  return fetch(base + "/api/upload", { method: "POST", body: fd });
}
const J = (b) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

test("file tidak didukung ditolak", async () => assert.equal((await upload("x.exe", "MZ")).status, 400));
test("nama file UTF-8 tidak rusak", async () => {
  const f = await (await upload("Dokumen — Tes é.pdf", MIN)).json();
  assert.equal(f.name, "Dokumen — Tes é.pdf");
});
test("upload PDF lalu print memakai opsi yang dipilih", async () => {
  const u = await upload("a.pdf", MIN);
  assert.equal(u.status, 200);
  const f = await u.json();
  const r = await fetch(
    base + "/api/print",
    J({ fileId: f.id, name: "a.pdf", printer: "MockPrinter", copies: 3, paper: "A4", orientation: "landscape", color: "gray", sides: "long", nup: 2, pages: f.pages }),
  );
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "submitted");
  const m = mockLog.at(-1);
  assert.equal(m.o.copies, 3);
  assert.equal(m.o.orientation, "landscape");
  assert.equal(m.o.sides, "long");
});
test("beberapa file dicetak berurutan, tiap file satu job", async () => {
  const before = mockLog.length;
  for (const n of ["m1.pdf", "m2.pdf", "m3.pdf"]) {
    const f = await (await upload(n, MIN)).json();
    const r = await fetch(base + "/api/print", J({ fileId: f.id, name: n, printer: "MockPrinter", copies: 1, pages: f.pages }));
    assert.equal(r.status, 200);
  }
  assert.equal(mockLog.length - before, 3);
  const jobs = (await (await fetch(base + "/api/admin/jobs?limit=200")).json()).items;
  for (const n of ["m1.pdf", "m2.pdf", "m3.pdf"]) assert.ok(jobs.some((j) => j.doc === n));
});
test("riwayat tidak tersedia untuk pengguna biasa (hanya admin)", async () => {
  assert.equal((await fetch(base + "/api/jobs")).status, 404);
  const r = await (await fetch(base + "/api/admin/jobs?q=m2.pdf&limit=5")).json();
  assert.equal(r.items.length, 1);
  assert.ok(r.total >= 1 && r.all >= r.total);
  const csv = await (await fetch(base + "/api/admin/jobs/export")).text();
  assert.match(csv, /waktu,dokumen,printer/);
});
test("orientasi otomatis diterima; nilai asing ditolak", async () => {
  const f = await (await upload("o.pdf", MIN)).json();
  const post = (b) => fetch(base + "/api/print", J({ fileId: f.id, name: "o", printer: "MockPrinter", copies: 1, ...b }));
  assert.equal((await post({ orientation: "auto" })).status, 200);
  assert.equal((await post({ orientation: "miring" })).status, 400);
});
test("tata letak landscape dipakai saat mencetak (FORCE_LAYOUT)", async () => {
  const { PDFDocument } = require("pdf-lib");
  const d = await PDFDocument.create();
  d.addPage([595, 842]);
  process.env.FORCE_LAYOUT = "1";
  try {
    const f = await (await upload("lay.pdf", Buffer.from(await d.save()))).json();
    const r = await fetch(base + "/api/print", J({ fileId: f.id, name: "lay.pdf", printer: "MockPrinter", copies: 1, paper: "A4", orientation: "landscape", scaling: "fit", pages: 1 }));
    assert.equal(r.status, 200);
    const m = mockLog.at(-1);
    assert.equal(m.lay.orientation, "landscape");
    assert.equal(m.lay.pages, 1);
  } finally {
    delete process.env.FORCE_LAYOUT;
  }
});
test("printer tak dikenal & opsi driver ilegal ditolak", async () => {
  const f = await (await upload("b.pdf", MIN)).json();
  const post = (b) => fetch(base + "/api/print", J({ fileId: f.id, name: "b", copies: 1, ...b }));
  assert.equal((await post({ printer: "Nope" })).status, 400);
  assert.equal((await post({ printer: "MockPrinter", driverOpts: { InputSlot: "Tray9" } })).status, 500);
});
test("link Google tidak valid ditolak", async () => {
  const r = await fetch(base + "/api/upload-url", J({ url: "https://evil.example/document/d/1AbCdEfGhIjKlMnOpQrSt" }));
  assert.equal(r.status, 422);
  assert.match((await r.json()).error, /tidak dikenali/);
});
test("admin: lokasi program bisa diatur, nama file lain ditolak", async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "lp-bin-")),
    good = path.join(d, "soffice"),
    evil = path.join(d, "evil.exe");
  fs.writeFileSync(good, "x");
  fs.writeFileSync(evil, "x");
  const put = (b) => fetch(base + "/api/admin/tools", { ...J(b), method: "PUT" });
  assert.equal((await put({ sofficePath: evil })).status, 400);
  assert.equal((await put({ sofficePath: path.join(d, "hilang") })).status, 400);
  const ok = await put({ sofficePath: good });
  assert.equal(ok.status, 200);
  const list = await (await fetch(base + "/api/admin/tools")).json();
  const so = list.find((t) => t.id === "SOFFICE");
  assert.equal(so.path, good);
  assert.equal(so.source, "settings");
  assert.equal((await put({ sofficePath: "" })).status, 200);
  assert.equal((await (await fetch(base + "/api/admin/tools")).json()).find((t) => t.id === "SOFFICE").configured, "");
});
test("admin: pengaturan umum tersimpan", async () => {
  const r = await fetch(base + "/api/admin/settings", { ...J({ appName: "Cetak Kantor", maxCopies: 7 }), method: "PUT" });
  assert.equal(r.status, 200);
  const s = await (await fetch(base + "/api/admin/settings")).json();
  assert.equal(s.appName, "Cetak Kantor");
  assert.equal(s.maxCopies, 7);
  assert.equal(s.pin, undefined);
});
test("halaman statis & pdf.js tersedia", async () => {
  for (const p of ["/", "/admin.html", "/vendor/pdfjs/pdf.min.js", "/vendor/pdfjs/pdf.worker.min.js"])
    assert.equal((await fetch(base + p)).status, 200, p);
});
