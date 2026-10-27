const test = require("node:test"),
  assert = require("node:assert"),
  fs = require("fs"),
  os = require("os"),
  path = require("path");
const { PDFDocument, degrees } = require("pdf-lib");
const { plan, layoutPdf, PAPER_MM, MARGIN_MM } = require("../layout");
const MM = 72 / 25.4;
const near = (a, b, eps = 0.5) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lp-lay-"));

async function mk(name, w, h, { rotate = 0, crop } = {}) {
  const d = await PDFDocument.create();
  const p = d.addPage([w, h]);
  if (rotate) p.setRotation(degrees(rotate));
  if (crop) p.setCropBox(...crop);
  const f = path.join(tmp, name);
  fs.writeFileSync(f, await d.save());
  return f;
}
async function run(src, o) {
  const out = src.replace(/\.pdf$/, "-out.pdf");
  const r = await layoutPdf(src, out, o);
  const d = await PDFDocument.load(fs.readFileSync(out));
  return { r, pages: d.getPages().map((p) => p.getSize()) };
}

test("plan: auto mengikuti orientasi dokumen, tanpa ruang kosong di sisi", () => {
  const p = plan(842, 595, { paper: "A4", orientation: "auto" });
  assert.equal(p.land, true);
  near(p.sheetW / MM, 297, 0.1);
  assert.equal(p.rot, false);
  // fit: lebar atau tinggi mengisi area (kertas dikurangi margin)
  const [pw, ph] = PAPER_MM.A4;
  const fillsW = Math.abs(p.drawW / MM - (ph - 2 * MARGIN_MM)) < 0.5,
    fillsH = Math.abs(p.drawH / MM - (pw - 2 * MARGIN_MM)) < 0.5;
  assert.ok(fillsW || fillsH);
});
test("plan: landscape paksa + putar -> isi memenuhi kertas; tanpa putar -> ruang kosong", () => {
  const rot = plan(595, 842, { paper: "A4", orientation: "landscape", rotate: true });
  const flat = plan(595, 842, { paper: "A4", orientation: "landscape", rotate: false });
  assert.equal(rot.rot, true);
  assert.equal(flat.rot, false);
  assert.ok(rot.drawW * rot.drawH > flat.drawW * flat.drawH * 1.5);
});
test("plan: ukuran asli, kustom, tanpa margin", () => {
  near(plan(595, 842, { scaling: "actual" }).scale, 1, 1e-9);
  near(plan(595, 842, { scaling: "custom", scale: 50 }).scale, 0.5, 1e-9);
  const a = plan(595, 842, { margin: "none" }),
    b = plan(595, 842, { margin: "default" });
  assert.ok(a.scale > b.scale);
});
test("plan: halaman persegi tidak diputar", () => assert.equal(plan(500, 500, { orientation: "landscape" }).rot, false));

test("layoutPdf: ukuran lembar mengikuti kertas dan orientasi", async () => {
  const por = await mk("por.pdf", 595, 842),
    lan = await mk("lan.pdf", 842, 595);
  let x = await run(por, { paper: "A4", orientation: "auto" });
  assert.equal(x.r.orientation, "portrait");
  near(x.pages[0].width / MM, 210, 0.1);
  near(x.pages[0].height / MM, 297, 0.1);
  x = await run(lan, { paper: "A4", orientation: "auto" });
  assert.equal(x.r.orientation, "landscape");
  near(x.pages[0].width / MM, 297, 0.1);
  x = await run(por, { paper: "A3", orientation: "landscape", rotate: true });
  near(x.pages[0].width / MM, 420, 0.1);
  near(x.pages[0].height / MM, 297, 0.1);
  x = await run(por, { paper: "Letter", orientation: "portrait" });
  near(x.pages[0].width / MM, 215.9, 0.1);
});
test("layoutPdf: halaman dengan /Rotate dan CropBox dihormati", async () => {
  const rot = await mk("rot.pdf", 595, 842, { rotate: 90 });
  let x = await run(rot, { paper: "A4", orientation: "auto" });
  assert.equal(x.r.orientation, "landscape"); // tampil landscape karena /Rotate 90
  const crop = await mk("crop.pdf", 595, 842, { crop: [0, 742, 300, 100] }); // 300x100 -> landscape
  x = await run(crop, { paper: "A4", orientation: "auto" });
  assert.equal(x.r.orientation, "landscape");
});
test("layoutPdf: dokumen campuran portrait + landscape dilaporkan 'mixed'", async () => {
  const d = await PDFDocument.create();
  d.addPage([595, 842]);
  d.addPage([842, 595]);
  const f = path.join(tmp, "mix.pdf");
  fs.writeFileSync(f, await d.save());
  const x = await run(f, { paper: "A4", orientation: "auto" });
  assert.equal(x.r.orientation, "mixed");
  assert.equal(x.pages.length, 2);
  assert.ok(x.pages[0].width < x.pages[0].height && x.pages[1].width > x.pages[1].height);
});
test("layoutPdf: berkas rusak dilempar agar server memakai cara lama", async () => {
  const f = path.join(tmp, "rusak.pdf");
  fs.writeFileSync(f, "bukan pdf");
  await assert.rejects(() => layoutPdf(f, f + ".out.pdf", {}));
});
