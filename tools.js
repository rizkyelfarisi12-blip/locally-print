// Pencarian, validasi, dan penyimpanan lokasi program pendukung
// (SumatraPDF, LibreOffice, Ghostscript).
// Urutan prioritas: halaman Admin (settings.json) > .env > folder ./tools & lokasi umum > PATH.
const fs = require("fs"),
  path = require("path");
const WIN = process.platform === "win32";

const SPEC = {
  SUMATRA: {
    label: "SumatraPDF",
    skey: "sumatraPath",
    names: /^SumatraPDF(-[\w.-]+)?\.exe$/i,
    win: true,
    note: "Wajib di Windows untuk mengirim PDF ke printer.",
    example: "C:\\Program Files\\SumatraPDF\\SumatraPDF.exe",
    url: "https://www.sumatrapdfreader.org/download-free-pdf-viewer",
  },
  SOFFICE: {
    label: "LibreOffice",
    skey: "sofficePath",
    names: /^soffice(\.exe)?$/i,
    bare: "soffice",
    note: "Untuk mengubah DOC/DOCX, gambar, dan TXT menjadi PDF.",
    example: "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    url: "https://www.libreoffice.org/download/download-libreoffice/",
  },
  GS: {
    label: "Ghostscript",
    skey: "gsPath",
    names: /^(gswin64c|gswin32c|gs)(\.exe)?$/i,
    bare: WIN ? "gswin64c" : "gs",
    note: "Untuk memaksa hasil grayscale / hitam-putih.",
    example: "C:\\Program Files\\gs\\gs10.08.0\\bin\\gswin64c.exe",
    url: "https://ghostscript.com/releases/gsdnld.html",
  },
};
const applicable = () => Object.keys(SPEC).filter((id) => !SPEC[id].win || WIN);

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};
const isAbs = (p) => (WIN ? path.win32.isAbsolute(p) : path.isAbsolute(p));
function inPath(cmd) {
  if (!cmd) return "";
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const exts = WIN ? ["", ...(process.env.PATHEXT || ".EXE").split(";")] : [""];
  for (const d of dirs)
    for (const e of exts) {
      const f = path.join(d, cmd + e);
      if (isFile(f)) return f;
    }
  return "";
}
const exists = (p) => !!p && (isAbs(p) ? isFile(p) : !!inPath(p));
const clean = (v) => String(v || "").trim().replace(/^"(.*)"$/, "$1");
const scan = (dir, re) => {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => re.test(f))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
};

function detect(id, appDir = __dirname) {
  const sp = SPEC[id];
  if (!sp) return "";
  const c = scan(path.join(appDir, "tools"), sp.names);
  if (WIN) {
    const pf = [
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
      "C:\\Program Files",
      "C:\\Program Files (x86)",
    ].filter(Boolean);
    const la = process.env.LOCALAPPDATA;
    if (id === "SUMATRA") {
      if (la) c.push(path.win32.join(la, "SumatraPDF", "SumatraPDF.exe"));
      for (const p of pf)
        c.push(path.win32.join(p, "SumatraPDF", "SumatraPDF.exe"));
      // winget memasang per-user: cek semua profil pengguna (installer bisa dijalankan akun admin lain)
      const users = (process.env.SystemDrive || "C:") + "\\Users";
      try {
        for (const u of fs.readdirSync(users))
          c.push(
            path.win32.join(users, u, "AppData", "Local", "SumatraPDF", "SumatraPDF.exe"),
          );
      } catch {}
    }
    if (id === "SOFFICE")
      for (const p of pf)
        c.push(path.win32.join(p, "LibreOffice", "program", "soffice.exe"));
    if (id === "GS")
      for (const p of pf) {
        const root = path.win32.join(p, "gs");
        try {
          const ds = fs
            .readdirSync(root)
            .filter((d) => /^gs\d/.test(d))
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
          for (const d of ds)
            c.push(
              path.win32.join(root, d, "bin", "gswin64c.exe"),
              path.win32.join(root, d, "bin", "gswin32c.exe"),
            );
        } catch {}
      }
  } else if (id === "SOFFICE")
    c.push(
      "/usr/bin/soffice",
      "/usr/local/bin/soffice",
      "/opt/libreoffice/program/soffice",
      "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    );
  return c.find(isFile) || inPath(sp.bare) || (id === "SUMATRA" ? inPath("SumatraPDF") : "");
}

// Pesan galat bila path tidak boleh disimpan; "" bila valid.
// Nama file dibatasi agar halaman Admin tidak bisa dipakai menjalankan program sembarang.
function validate(id, p) {
  const sp = SPEC[id];
  if (!sp) return "Program tidak dikenal";
  if (typeof p !== "string" || p.length > 500 || /[\0\r\n]/.test(p))
    return "Path tidak valid";
  if (!isAbs(p)) return "Path harus lengkap, contoh: " + sp.example;
  if (!isFile(p)) return "File tidak ditemukan: " + p;
  const base = (WIN ? path.win32 : path).basename(p);
  if (!sp.names.test(base))
    return "Nama file harus program " + sp.label + " (bukan " + base + ")";
  return "";
}

function resolve(id, { settings = {}, env = {}, appDir = __dirname } = {}) {
  const sp = SPEC[id];
  const cands = [
    ["settings", clean(settings[sp.skey])],
    ["env", clean(env[id])],
  ].filter(([, p]) => p);
  for (const [source, p] of cands)
    if (exists(p)) return { path: p, source, exists: true };
  const d = detect(id, appDir);
  if (d) return { path: d, source: "auto", exists: true };
  if (cands.length)
    return { path: cands[0][1], source: cands[0][0], exists: false };
  return { path: sp.bare || "", source: "default", exists: exists(sp.bare) };
}

function status(ctx = {}) {
  const settings = ctx.settings || {},
    env = ctx.env || {};
  return applicable().map((id) => {
    const sp = SPEC[id],
      r = resolve(id, ctx),
      cfg = clean(settings[sp.skey]);
    return {
      id,
      key: sp.skey,
      label: sp.label,
      note: sp.note,
      example: sp.example,
      url: sp.url,
      configured: cfg,
      configuredOk: !cfg || exists(cfg),
      fromEnv: clean(env[id]),
      path: r.path,
      source: r.source,
      exists: r.exists,
      detected: detect(id, ctx.appDir || __dirname),
    };
  });
}

// ---- CLI (dipakai installer): node tools.js has SUMATRA  -> exit 0 bila ditemukan ----
function cliCtx(appDir) {
  const env = { ...process.env };
  try {
    for (const l of fs.readFileSync(path.join(appDir, ".env"), "utf8").split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2];
    }
  } catch {}
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(path.join(appDir, "settings.json"), "utf8"));
  } catch {}
  return { settings, env, appDir };
}
if (require.main === module) {
  const [cmd, id] = process.argv.slice(2),
    ctx = cliCtx(__dirname);
  if (cmd === "has") process.exit(SPEC[id] && resolve(id, ctx).exists ? 0 : 1);
  console.log(JSON.stringify(status(ctx), null, 2));
}

module.exports = { SPEC, applicable, detect, validate, resolve, status, exists };
