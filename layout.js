// Tata letak PDF sebelum dikirim ke printer (jalur Windows/SumatraPDF).
// Setiap halaman ditaruh di lembar berukuran kertas yang dipilih, dengan orientasi, putaran, skala,
// dan margin yang SAMA dengan preview di browser. Hasilnya dicetak 1:1 (noscale), sehingga
// hasil cetak tidak bergantung pada perilaku "fit"/"landscape" milik SumatraPDF atau driver.
const fs = require("fs");
const { PDFDocument, degrees } = require("pdf-lib");

const PAPER_MM = {
  A4: [210, 297],
  A3: [297, 420],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};
const MM = 72 / 25.4; // titik PDF per milimeter
const MARGIN_MM = 6; // margin "Default": di atas batas area cetak printer rumahan/kantor umum

// Rencana tata letak satu halaman. srcW/srcH = ukuran halaman sumber (pt) sebagaimana ditampilkan.
// Fungsi yang sama dipakai preview di index.html (salinan logikanya harus tetap identik).
function plan(srcW, srcH, o = {}) {
  const [pw, ph] = PAPER_MM[o.paper] || PAPER_MM.A4;
  const ori = o.orientation || "auto";
  const srcLand = srcW > srcH;
  const land = ori === "auto" ? srcLand : ori === "landscape";
  const sheetW = (land ? ph : pw) * MM,
    sheetH = (land ? pw : ph) * MM;
  const rot = ori !== "auto" && o.rotate !== false && srcLand !== land && srcW !== srcH;
  const cw = rot ? srcH : srcW,
    ch = rot ? srcW : srcH;
  const m = (o.margin === "none" ? 0 : MARGIN_MM) * MM;
  const availW = Math.max(1, sheetW - 2 * m),
    availH = Math.max(1, sheetH - 2 * m);
  const scale =
    o.scaling === "actual"
      ? 1
      : o.scaling === "custom"
        ? (+o.scale || 100) / 100
        : Math.min(availW / cw, availH / ch);
  return { sheetW, sheetH, land, rot, scale, drawW: cw * scale, drawH: ch * scale };
}

async function layoutPdf(inFile, outFile, o = {}) {
  const src = await PDFDocument.load(fs.readFileSync(inFile), {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  if (src.isEncrypted) throw new Error("PDF terenkripsi");
  const pages = src.getPages();
  if (!pages.length) throw new Error("PDF tidak berisi halaman");
  const out = await PDFDocument.create();
  let nLand = 0,
    nPort = 0;
  for (const sp of pages) {
    const crop = sp.getCropBox(); // yang ditampilkan viewer (bisa lebih kecil dari MediaBox)
    const ang = ((sp.getRotation().angle % 360) + 360) % 360;
    const swap = ang === 90 || ang === 270;
    const p = plan(swap ? crop.height : crop.width, swap ? crop.width : crop.height, o);
    // Halaman tanpa /Contents (mis. halaman kosong dari Word) tidak bisa di-embed (pdf-lib gagal saat save):
    // cukup keluarkan lembar kosong.
    const emb = sp.node.Contents()
      ? await out.embedPage(sp, {
          left: crop.x,
          bottom: crop.y,
          right: crop.x + crop.width,
          top: crop.y + crop.height,
        })
      : null;
    const k = (ang / 90 + (p.rot ? 1 : 0)) % 4; // total putaran searah jarum jam (x90 derajat)
    const W = crop.width * p.scale, // ukuran gambar sebelum diputar
      H = crop.height * p.scale;
    const bw = k % 2 ? H : W,
      bh = k % 2 ? W : H;
    const bx = (p.sheetW - bw) / 2,
      by = (p.sheetH - bh) / 2;
    // drawPage memutar berlawanan arah jarum jam terhadap (x,y); titik (x,y) disesuaikan agar
    // hasil putaran tepat berada di dalam kotak [bx,by,bw,bh].
    const [x, y, deg] = [
      [bx, by, 0],
      [bx, by + W, -90],
      [bx + W, by + H, 180],
      [bx + H, by, 90],
    ][k];
    const page = out.addPage([p.sheetW, p.sheetH]);
    if (emb) page.drawPage(emb, { x, y, width: W, height: H, rotate: degrees(deg) });
    p.land ? nLand++ : nPort++;
  }
  fs.writeFileSync(outFile, await out.save());
  return {
    file: outFile,
    pages: pages.length,
    orientation: nLand && nPort ? "mixed" : nLand ? "landscape" : "portrait",
  };
}

module.exports = { layoutPdf, plan, PAPER_MM, MARGIN_MM };
