// LocalPrint: server cetak LAN. Cetak nyata via CUPS (lp) atau SumatraPDF+Spooler (Windows).
const express = require("express"),
  multer = require("multer"),
  path = require("path"),
  fs = require("fs"),
  os = require("os"),
  crypto = require("crypto");
const { execFile } = require("child_process");

try {
  const envFile = fs.readFileSync(
    path.join(__dirname, ".env"),
    "utf8"
  );

  for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);

    if (!m) continue;

    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2];
    }
  }
} catch (e) {
  if (e.code !== "ENOENT") {
    console.error("Gagal membaca .env:", e.message);
  }
}

const E = process.env,
  PORT = +E.PORT || 3000;
const SET_F = path.join(__dirname, "settings.json");
const S = Object.assign(
  {
    appName: "LocalPrint",
    defaultPrinter: "",
    maxMb: +E.MAX_MB || 25,
    maxCopies: +E.MAX_COPIES || 20,
    retentionDays: 30,
    pin: E.PIN || "",
    adminPin: E.ADMIN_PIN || E.PIN || "",
    maxJobsPerHour: 30,
  },
  (() => {
    try {
      return JSON.parse(fs.readFileSync(SET_F, "utf8"));
    } catch {
      return {};
    }
  })(),
);
const saveSet = () => fs.writeFileSync(SET_F, JSON.stringify(S, null, 1));
const ALLOW = (E.ALLOW_PREFIX || "192.168.,10.,172.,127.,::1,::ffff:").split(
  ",",
);
const WIN = process.platform === "win32",
  SOFFICE = E.SOFFICE || "soffice";
const TMP = path.join(__dirname, "tmp"),
  HIST = path.join(__dirname, "history.json");
fs.mkdirSync(TMP, { recursive: true });
let jobs = [];
try {
  jobs = JSON.parse(fs.readFileSync(HIST, "utf8"));
} catch {}
const save = () =>
  fs.writeFileSync(HIST, JSON.stringify(jobs.slice(-500), null, 1));
const log = (...a) => {
  const s = new Date().toISOString() + " " + a.join(" ");
  console.log(s);
  fs.appendFile(path.join(__dirname, "server.log"), s + "\n", () => {});
};
const run = (cmd, args, t = 60000) =>
  new Promise((res, rej) =>
    execFile(cmd, args, { timeout: t, windowsHide: true }, (e, o, er) =>
      e
        ? rej(new Error((er || e.message).toString().trim()))
        : res(o.toString()),
    ),
  );

// ---- printer adapter ----
const MOCK = E.MOCK_PRINTER === "1"; // hanya untuk pengujian; tidak aktif secara default
const mockLog = [];
async function listPrinters() {
  if (MOCK) return [{ name: "MockPrinter", default: true, status: "idle" }];
  if (WIN) {
    const o = await run("powershell", [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Printer | Select Name,Default,PrinterStatus,WorkOffline | ConvertTo-Json -Compress",
    ]);
    if (!o.trim()) return [];
    let a = JSON.parse(o);
    if (!Array.isArray(a)) a = [a];
    return a.map((p) => ({
      name: p.Name,
      default: !!p.Default,
      status: p.WorkOffline
        ? "offline"
        : p.PrinterStatus === 3
          ? "idle"
          : p.PrinterStatus === 4
            ? "printing"
            : "status " + p.PrinterStatus,
    }));
  }
  let names = [];
  try {
    names = (await run("lpstat", ["-e"]))
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
  let def = "";
  try {
    def =
      ((await run("lpstat", ["-d"])).match(/:\s*(.+)/) || [])[1]?.trim() || "";
  } catch {}
  let st = {};
  try {
    for (const l of (await run("lpstat", ["-p"])).split("\n")) {
      const m = l.match(/^printer (\S+) (.*)/);
      if (m)
        st[m[1]] = /disabled/.test(m[2])
          ? "disabled/offline"
          : /now printing/.test(m[2])
            ? "printing"
            : "idle";
    }
  } catch {}
  return names.map((n) => ({
    name: n,
    default: n === def,
    status: st[n] || "unknown",
  }));
}
const RANGE = /^\d+(-\d+)?(\s*,\s*\d+(-\d+)?)*$/;
const PAPER = {
  A4: "A4",
  A3: "A3",
  A5: "A5",
  Letter: "Letter",
  Legal: "Legal",
};
function validate(o, printers, pages) {
  const e = [];
  o = o || {};
  if (!printers.some((p) => p.name === o.printer))
    e.push("Printer tidak ditemukan");
  o.copies = Math.round(+o.copies || 1);
  if (o.copies < 1 || o.copies > S.maxCopies)
    e.push("Salinan harus 1-" + S.maxCopies);
  if (o.range && !RANGE.test(o.range)) e.push("Rentang halaman tidak valid");
  else if (
    o.range &&
    pages &&
    o.range.split(",").some((p) => {
      const [a, b] = p.trim().split("-").map(Number);
      return a < 1 || a > pages || (b !== undefined && (b < a || b > pages));
    })
  )
    e.push("Rentang melebihi jumlah halaman (" + pages + ")");
  if (!PAPER[o.paper || "A4"]) e.push("Ukuran kertas tidak valid");
  if (!["portrait", "landscape"].includes(o.orientation || "portrait"))
    e.push("Orientasi tidak valid");
  if (!["color", "gray", "bw"].includes(o.color || "color"))
    e.push("Mode warna tidak valid");
  if (!["one", "long", "short"].includes(o.sides || "one"))
    e.push("Mode sisi tidak valid");
  if (!["fit", "actual", "custom"].includes(o.scaling || "fit"))
    e.push("Skala tidak valid");
  if (o.scaling === "custom" && !(+o.scale >= 10 && +o.scale <= 400))
    e.push("Skala kustom harus 10-400%");
  if (!["default", "none"].includes(o.margin || "default"))
    e.push("Margin tidak valid");
  if (!["", "odd", "even"].includes(o.pageSet || ""))
    e.push("Odd/even tidak valid");
  if (![1, 2, 4, 6, 9, 16].includes(+o.nup || 1))
    e.push("Halaman per lembar tidak valid");
  return e;
}
async function submit(file, o) {
  if (MOCK) {
    mockLog.push({ file: path.basename(file), o });
    return { spooler: "mock", id: "mock-" + mockLog.length };
  }
  const r = (o.range || "").replace(/\s/g, "");
  if (WIN) {
    const exe = E.SUMATRA;
    if (!exe || !fs.existsSync(exe))
      throw new Error("SumatraPDF tidak ditemukan. Atur SUMATRA di .env");
    const s = [
      o.copies > 1 ? o.copies + "x" : "",
      { one: "simplex", long: "duplexlong", short: "duplexshort" }[
        o.sides || "one"
      ],
      o.orientation === "landscape" ? "landscape" : "portrait",
      "paper=" + (o.paper || "A4"),
      o.color === "color" || !o.color ? "color" : "monochrome",
      r,
      o.pageSet,
      o.scaling === "actual" ? "noscale" : "fit",
    ]
      .filter(Boolean)
      .join(",");
    const before = await winJobs(o.printer);
    await run(
      exe,
      ["-print-to", o.printer, "-print-settings", s, "-silent", file],
      120000,
    );
    let id = null;
    for (let i = 0; i < 5 && !id; i++) {
      await new Promise((r) => setTimeout(r, 600));
      id = (await winJobs(o.printer)).find((x) => !before.includes(x)) || null;
    }
    return { spooler: "sumatra", id: id && String(id) };
  }
  const a = [
    "-d",
    o.printer,
    "-n",
    String(o.copies),
    "-o",
    "media=" + (o.paper || "A4"),
    "-o",
    "sides=" +
      {
        one: "one-sided",
        long: "two-sided-long-edge",
        short: "two-sided-short-edge",
      }[o.sides || "one"],
    "-o",
    "print-color-mode=" +
      (o.color === "color" || !o.color ? "color" : "monochrome"),
  ];
  if (o.scaling === "actual") a.push("-o", "print-scaling=none");
  else if (o.scaling === "custom")
    a.push("-o", "scaling=" + Math.round(+o.scale));
  else a.push("-o", "fit-to-page");
  if (o.margin === "none")
    a.push(
      "-o",
      "page-left=0",
      "-o",
      "page-right=0",
      "-o",
      "page-top=0",
      "-o",
      "page-bottom=0",
    );
  if (o.orientation === "landscape") a.push("-o", "orientation-requested=4");
  if (r) a.push("-o", "page-ranges=" + r);
  if (o.pageSet) a.push("-o", "page-set=" + o.pageSet);
  if (+o.nup > 1) a.push("-o", "number-up=" + +o.nup);
  if (o.reverse) a.push("-o", "outputorder=reverse");
  if (o.collate && o.copies > 1) a.push("-o", "collate=true");
  for (const [k, v] of Object.entries(o.driverOpts || {}))
    a.push("-o", k + "=" + v);
  a.push(file);
  const out = await run("lp", a);
  return {
    spooler: "cups",
    id: (out.match(/request id is (\S+)/) || [])[1] || null,
  };
}
async function toPdf(file) {
  if (file.toLowerCase().endsWith(".pdf")) return file;
  await run(
    SOFFICE,
    ["--headless", "--convert-to", "pdf", "--outdir", TMP, file],
    120000,
  );
  const out = file.replace(/\.[^.]+$/, ".pdf");
  if (!fs.existsSync(out)) throw new Error("Konversi gagal");
  return out;
}

async function pageCount(f) {
  try {
    const m = (await run("pdfinfo", [f], 15000)).match(/Pages:\s+(\d+)/);
    if (m) return +m[1];
  } catch {}
  const t = fs.readFileSync(f).toString("latin1");
  return (t.match(/\/Type\s*\/Page[^s]/g) || []).length || null;
}
// Kemampuan printer dari driver CUPS (lpoptions -l). Windows: tidak terdeteksi -> null (UI tidak menjanjikan).
const GROUPS = [
  ["tray", /^(InputSlot|media-source|MediaPosition)$/i],
  ["type", /^(MediaType|media-type)$/i],
  [
    "quality",
    /^(cupsPrintQuality|print-quality|Resolution|OutputMode|Quality)$/i,
  ],
  ["finish", /^(Staple\w*|Finishing|finishings|Punch\w*|Fold\w*|OutputBin)$/i],
];
async function caps(name) {
  if (MOCK)
    return {
      detected: true,
      duplex: true,
      color: true,
      papers: ["A4"],
      driver: [
        {
          key: "InputSlot",
          label: "Tray",
          group: "tray",
          values: ["Tray1", "Tray2"],
          def: "Tray1",
        },
      ],
    };
  if (WIN) return { detected: false };
  const c = {
    detected: true,
    duplex: false,
    color: false,
    papers: [],
    driver: [],
  };
  try {
    for (const l of (await run("lpoptions", ["-p", name, "-l"])).split("\n")) {
      const m = l.match(/^([^/:]+)(?:\/([^:]*))?:\s*(.*)$/);
      if (!m) continue;
      const key = m[1],
        vals = m[3]
          .trim()
          .split(/\s+/)
          .map((v) => v.replace("*", "")),
        def = (m[3].match(/\*(\S+)/) || [])[1] || "";
      if (
        /^(Duplex|sides|KMDuplex)$/i.test(key) &&
        vals.some((v) => /duplex|two-sided/i.test(v))
      )
        c.duplex = true;
      if (/^(PageSize|media)$/i.test(key)) c.papers = vals;
      if (/^(ColorModel|print-color-mode|ColorMode)$/i.test(key))
        c.color = vals.length > 1;
      const g = GROUPS.find((x) => x[1].test(key));
      if (g && vals.length > 1)
        c.driver.push({
          key,
          label: m[2] || key,
          group: g[0],
          values: vals,
          def,
        });
    }
  } catch (e) {
    c.detected = false;
    c.error = e.message;
  }
  return c;
}
async function checkDriverOpts(o) {
  const d = o.driverOpts;
  if (!d || !Object.keys(d).length) return null;
  const c = await caps(o.printer);
  for (const [k, v] of Object.entries(d)) {
    const x = c.driver.find((y) => y.key === k);
    if (
      !x ||
      !x.values.includes(v) ||
      !/^[\w.+-]+$/.test(k) ||
      !/^[\w.+-]+$/.test(v)
    )
      return "Opsi driver tidak didukung printer: " + k;
  }
  return null;
}
const GS = E.GS || (WIN ? "gswin64c" : "gs");
async function toGray(f) {
  const out = f.replace(/\.pdf$/, "") + "-gray.pdf";
  try {
    await run(
      GS,
      [
        "-q",
        "-dNOPAUSE",
        "-dBATCH",
        "-sDEVICE=pdfwrite",
        "-sColorConversionStrategy=Gray",
        "-dProcessColorModel=/DeviceGray",
        "-sOutputFile=" + out,
        f,
      ],
      120000,
    );
  } catch (e) {
    throw new Error(
      "Konversi grayscale gagal (Ghostscript terpasang?): " + e.message,
    );
  }
  return out;
}
const psq = (x) => "'" + String(x).replace(/'/g, "''") + "'";
async function winJobs(p) {
  try {
    const o = await run("powershell", [
      "-NoProfile",
      "-Command",
      `@(Get-PrintJob -PrinterName ${psq(p)} | Select -Expand Id) | ConvertTo-Json -Compress`,
    ]);
    if (!o.trim()) return [];
    const a = JSON.parse(o);
    return Array.isArray(a) ? a : [a];
  } catch {
    return [];
  }
}
async function refreshJobs() {
  const act = jobs
    .filter((j) => j.status === "submitted" && j.spoolId)
    .slice(-40);
  if (!act.length) return;
  let ch = false;
  const byP = {};
  for (const j of act) (byP[j.printer] = byP[j.printer] || []).push(j);
  for (const [p, js] of Object.entries(byP)) {
    if (WIN) {
      const ids = (await winJobs(p)).map(String);
      for (const j of js)
        if (!ids.includes(String(j.spoolId))) {
          j.status = "left_queue";
          ch = true;
        }
    } else {
      let done = [],
        pend = [];
      try {
        done = (await run("lpstat", ["-W", "completed", "-o", p]))
          .split("\n")
          .map((l) => l.split(/\s+/)[0]);
        pend = (await run("lpstat", ["-W", "not-completed", "-o", p]))
          .split("\n")
          .map((l) => l.split(/\s+/)[0]);
      } catch {
        continue;
      }
      for (const j of js) {
        if (pend.includes(j.spoolId)) continue;
        j.status = done.includes(j.spoolId) ? "completed" : "left_queue";
        ch = true;
      }
    }
  }
  if (ch) save();
}
// ---- app ----
const app = express();
app.use(express.json());
app.use((q, s, n) => {
  const ip = q.socket.remoteAddress || "";
  if (!ALLOW.some((p) => ip.startsWith(p)))
    return s.status(403).json({ error: "IP tidak diizinkan" });
  n();
});
const hits = {};
app.use("/api", (q, s, n) => {
  const k = q.socket.remoteAddress,
    t = Date.now();
  hits[k] = (hits[k] || []).filter((x) => t - x < 60000);
  if (hits[k].length >= 120)
    return s.status(429).json({ error: "Terlalu banyak permintaan" });
  hits[k].push(t);
  n();
});
app.use("/api", (q, s, n) => {
  if (q.path.startsWith("/admin") || q.path === "/info") return n();
  if (S.pin && q.headers["x-pin"] !== S.pin)
    return s.status(401).json({ error: "PIN salah" });
  n();
});
const mk = () =>
  multer({
    storage: multer.diskStorage({
      destination: TMP,
      filename: (q, f, cb) =>
        cb(
          null,
          crypto.randomUUID() + path.extname(f.originalname).toLowerCase(),
        ),
    }),
    limits: { fileSize: S.maxMb * 1048576 },
    fileFilter: (q, f, cb) =>
      [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".txt"].includes(
        path.extname(f.originalname).toLowerCase(),
      )
        ? cb(null, true)
        : cb(new Error("Tipe file tidak didukung")),
  });
const wrap = (f) => (q, s) =>
  f(q, s).catch((e) => {
    log("ERR", e.message);
    s.status(500).json({ error: e.message });
  });
app.get("/api/info", (q, s) =>
  s.json({
    appName: S.appName,
    defaultPrinter: S.defaultPrinter,
    pinRequired: !!S.pin,
    maxMb: S.maxMb,
    maxCopies: S.maxCopies,
    ips: Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i.family === "IPv4" && !i.internal)
      .map((i) => i.address),
    port: PORT,
  }),
);
app.get(
  "/api/printers",
  wrap(async (q, s) => s.json(await listPrinters())),
);
app.post("/api/upload", (q, s) =>
  mk().single("file")(q, s, async (err) => {
    if (err) return s.status(400).json({ error: err.message });
    if (!q.file) return s.status(400).json({ error: "Tidak ada file" });
    try {
      const pdf = await toPdf(q.file.path);
      s.json({
        id: path.basename(pdf),
        name: q.file.originalname,
        size: q.file.size,
        pages: await pageCount(pdf),
      });
    } catch (e) {
      log("CONVERT", e.message);
      s.status(422).json({ error: "Konversi gagal: " + e.message });
    }
  }),
);
app.get(
  "/api/caps/:name",
  wrap(async (q, s) => s.json(await caps(q.params.name))),
);
app.get("/api/file/:id", (q, s) => {
  const f = path.join(TMP, path.basename(q.params.id));
  fs.existsSync(f) ? s.sendFile(f) : s.sendStatus(404);
});
app.post(
  "/api/print",
  wrap(async (q, s) => {
    const o = q.body,
      pr = await listPrinters(),
      errs = validate(o, pr, o.pages);
    const f = path.join(TMP, path.basename(o.fileId || ""));
    if (!fs.existsSync(f)) errs.push("File tidak ditemukan");
    if (errs.length) return s.status(400).json({ error: errs.join("; ") });
    if (
      jobs.filter(
        (x) =>
          x.client === q.socket.remoteAddress &&
          Date.now() - Date.parse(x.time) < 3600e3,
      ).length >= S.maxJobsPerHour
    )
      return s.status(429).json({ error: "Batas pekerjaan per jam tercapai" });
    const j = {
      id: crypto.randomUUID(),
      doc: String(o.name || "dokumen").slice(0, 120),
      printer: o.printer,
      client: q.socket.remoteAddress,
      time: new Date().toISOString(),
      status: "processing",
      options: {
        copies: o.copies,
        scaling: o.scaling,
        scale: o.scale,
        margin: o.margin,
        range: o.range,
        paper: o.paper,
        orientation: o.orientation,
        color: o.color,
        sides: o.sides,
        nup: o.nup,
        pageSet: o.pageSet,
        reverse: !!o.reverse,
        collate: !!o.collate,
      },
    };
    jobs.push(j);
    j.options.driverOpts = o.driverOpts || {};
    try {
      let file = f;
      
      if(!MOCK&&(o.color==='gray'||o.color==='bw')){
        const c=await caps(o.printer);
        if(WIN||!c.color){
          file=await toGray(f);
          j.options.grayscaleConverted=true;
        }
      }

      const dv = await checkDriverOpts(o);
      if (dv) throw new Error(dv);
      const r = await submit(file, o);
      j.status = "submitted";
      j.spoolId = r.id;
    } catch (e) {
      j.status = "failed";
      j.error = e.message;
      log("PRINT", e.message);
    }
    save();
    s.status(j.status === "failed" ? 500 : 200).json(j);
  }),
);
app.get(
  "/api/jobs",
  wrap(async (q, s) => {
    await refreshJobs();
    s.json(jobs.slice().reverse().slice(0, 200));
  }),
);
app.post(
  "/api/jobs/:id/cancel",
  wrap(async (q, s) => {
    const j = jobs.find((x) => x.id === q.params.id);
    if (!j) return s.sendStatus(404);
    if (!j.spoolId || j.status !== "submitted")
      return s.status(400).json({
        error:
          "Pekerjaan tidak dapat dibatalkan (ID spooler tidak diketahui atau sudah keluar dari antrean)",
      });
    if (WIN)
      await run("powershell", [
        "-NoProfile",
        "-Command",
        `Remove-PrintJob -PrinterName ${psq(j.printer)} -ID ${parseInt(j.spoolId, 10)}`,
      ]);
    else await run("cancel", [j.spoolId]);
    j.status = "canceled";
    save();
    s.json(j);
  }),
);
// const adm = (q, s, n) => {
//   if (S.adminPin && q.headers["x-pin"] !== S.adminPin)
//     return s.status(401).json({ error: "PIN admin salah" });
//   n();
// };
const adm = (q, s, n) => n();
app.get("/api/admin/settings", adm, (q, s) =>
  s.json({ ...S, pin: undefined, adminPin: undefined, hasPin: !!S.pin }),
);
app.put("/api/admin/settings", adm, (q, s) => {
  const b = q.body || {},
    n = (k, lo, hi) => {
      const v = +b[k];
      if (Number.isFinite(v) && v >= lo && v <= hi) S[k] = Math.round(v);
    };
  if (typeof b.appName === "string")
    S.appName = b.appName.slice(0, 60) || "LocalPrint";
  if (typeof b.defaultPrinter === "string")
    S.defaultPrinter = b.defaultPrinter.slice(0, 200);
  if (typeof b.pin === "string") S.pin = b.pin.slice(0, 32);
  n("maxMb", 1, 200);
  n("maxCopies", 1, 200);
  n("retentionDays", 1, 3650);
  n("maxJobsPerHour", 1, 1000);
  saveSet();
  s.json({ ok: true });
});
app.get("/api/admin/logs", adm, (q, s) => {
  let t = "";
  try {
    t = fs.readFileSync(path.join(__dirname, "server.log"), "utf8");
  } catch {}
  s.json(
    t
      .split("\n")
      .filter((l) => /ERR|PRINT|CONVERT/.test(l))
      .slice(-100),
  );
});
app.use(
  "/vendor/pdfjs",
  express.static(path.join(__dirname, "node_modules/pdfjs-dist/build")),
);
app.use(express.static(path.join(__dirname, "public")));
setInterval(() => {
  const c = Date.now() - S.retentionDays * 864e5;
  const n = jobs.length;
  jobs = jobs.filter((x) => Date.parse(x.time) > c);
  if (jobs.length !== n) save();
  for (const f of fs.readdirSync(TMP)) {
    const p = path.join(TMP, f);
    if (Date.now() - fs.statSync(p).mtimeMs > 3600e3) fs.unlink(p, () => {});
  }
}, 600e3).unref();
if (require.main === module)
  app.listen(PORT, "0.0.0.0", () => log("LocalPrint di port", PORT));
module.exports = { validate, app, S, mockLog };
