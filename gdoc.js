// Impor dokumen dari link Google Docs / Sheets / Slides / Drive menjadi file lokal (PDF).
// Hanya bekerja untuk dokumen berbagi "Siapa saja yang memiliki link".
const fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");

const INPUT_HOST = /^(docs|drive)\.google\.com$/;
const HOP_HOST = /(^|\.)(google\.com|googleusercontent\.com)$/;

// Kode ukuran kertas untuk ekspor Google Sheets (parameter "size").
const SHEET_SIZE = { Letter: 0, Legal: 2, A3: 6, A4: 7, A5: 8 };

// opt.paper / opt.landscape hanya berlaku untuk Google Sheets (Docs & Slides mengikuti pengaturan dokumennya).
function parseGoogleUrl(raw, opt = {}) {
  let u;
  try {
    u = new URL(String(raw || "").trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !INPUT_HOST.test(u.hostname)) return null;
  const id =
    (u.pathname.match(/\/d\/([\w-]{10,})/) || [])[1] ||
    u.searchParams.get("id");
  if (!id || !/^[\w-]{10,}$/.test(id)) return null;
  const p = u.pathname;
  const gid = (u.hash + u.search).match(/gid=(\d+)/)?.[1];
  if (u.hostname === "docs.google.com") {
    if (p.startsWith("/document/"))
      return {
        kind: "Google Docs",
        ext: ".pdf",
        url: `https://docs.google.com/document/d/${id}/export?format=pdf`,
      };
    if (p.startsWith("/spreadsheets/"))
      return {
        kind: "Google Sheets",
        ext: ".pdf",
        // size=7 -> A4, fitw -> muat lebar halaman. Tanpa gid = seluruh tab.
        url:
          `https://docs.google.com/spreadsheets/d/${id}/export?format=pdf&size=${SHEET_SIZE[opt.paper] ?? 7}` +
          `&portrait=${opt.landscape ? "false" : "true"}&fitw=true&gridlines=false` +
          (gid ? `&gid=${gid}` : ""),
      };
    if (p.startsWith("/presentation/"))
      return {
        kind: "Google Slides",
        ext: ".pdf",
        url: `https://docs.google.com/presentation/d/${id}/export/pdf`,
      };
    return null;
  }
  // drive.google.com: file biasa (PDF/DOCX/gambar yang diunggah)
  return {
    kind: "Google Drive",
    ext: null,
    url: `https://drive.google.com/uc?export=download&id=${id}`,
  };
}

const ALLOWED_EXT = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".txt"];

function nameFromHeader(h) {
  if (!h) return "";
  const m =
    h.match(/filename\*=UTF-8''([^;]+)/i) || h.match(/filename="?([^";]+)"?/i);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

async function fetchFollow(url, hops = 0) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !HOP_HOST.test(u.hostname))
    throw new Error("Pengalihan ke alamat yang tidak diizinkan");
  if (u.hostname === "accounts.google.com")
    throw new Error(
      'Dokumen tidak publik. Di Google, klik Bagikan lalu ubah akses menjadi "Siapa saja yang memiliki link" (Viewer).',
    );
  const r = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(60000),
    headers: { "user-agent": "Mozilla/5.0 LocalPrint" },
  });
  if ([301, 302, 303, 307, 308].includes(r.status)) {
    if (hops >= 5) throw new Error("Terlalu banyak pengalihan");
    return fetchFollow(new URL(r.headers.get("location"), url).href, hops + 1);
  }
  if (r.status === 404) throw new Error("Dokumen tidak ditemukan");
  if (r.status === 401 || r.status === 403)
    throw new Error(
      'Akses ditolak. Ubah akses dokumen menjadi "Siapa saja yang memiliki link".',
    );
  if (!r.ok) throw new Error("Google menjawab HTTP " + r.status);
  return r;
}

async function importGoogle(rawUrl, tmpDir, maxBytes, opt = {}) {
  const g = parseGoogleUrl(rawUrl, opt);
  if (!g)
    throw new Error(
      "Link tidak dikenali. Gunakan link Google Docs, Sheets, Slides, atau file Drive.",
    );
  const r = await fetchFollow(g.url);
  const reader = r.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("File melebihi batas ukuran");
    }
    chunks.push(value);
  }
  const buf = Buffer.concat(chunks);
  const isPdf = buf.subarray(0, 5).toString("latin1") === "%PDF-";
  let ext = g.ext;
  let name = nameFromHeader(r.headers.get("content-disposition"));
  if (isPdf) ext = ".pdf";
  else if (!ext) ext = path.extname(name).toLowerCase();
  if (!isPdf && /text\/html/i.test(r.headers.get("content-type") || ""))
    throw new Error(
      'Google mengembalikan halaman web, bukan dokumen. Pastikan akses "Siapa saja yang memiliki link".',
    );
  if (!ALLOWED_EXT.includes(ext))
    throw new Error("Tipe file dari link tidak didukung");
  if (!name) name = g.kind + ext;
  const file = path.join(tmpDir, crypto.randomUUID() + ext);
  fs.writeFileSync(file, buf);
  return { file, name: name.slice(0, 120), kind: g.kind };
}

module.exports = { parseGoogleUrl, importGoogle };
