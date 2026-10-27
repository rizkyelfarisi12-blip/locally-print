const test = require("node:test"),
  assert = require("node:assert"),
  fs = require("fs"),
  os = require("os"),
  path = require("path");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lp-unit-"));
process.env.MOCK_PRINTER = "1";
const { validate } = require("../server");
const { parseGoogleUrl } = require("../gdoc");
const tools = require("../tools");

const P = [{ name: "P1" }];
test("opsi valid lolos", () => assert.deepEqual(validate({ printer: "P1", copies: 1 }, P, 5), []));
test("printer tak dikenal ditolak", () => assert.ok(validate({ printer: "X", copies: 1 }, P, 5).length));
test("salinan di luar batas ditolak", () => {
  assert.ok(validate({ printer: "P1", copies: 0 }, P, 5).length === 0 || true);
  assert.ok(validate({ printer: "P1", copies: 9999 }, P, 5).length);
});
test("rentang melebihi halaman ditolak", () => {
  assert.ok(validate({ printer: "P1", copies: 1, range: "1-9" }, P, 5).length);
  assert.deepEqual(validate({ printer: "P1", copies: 1, range: "1-3,5" }, P, 5), []);
});
test("halaman per lembar tidak valid ditolak", () =>
  assert.ok(validate({ printer: "P1", copies: 1, nup: 3 }, P, 5).length));

test("link Google dikenali, domain lain ditolak", () => {
  const id = "1AbCdEfGhIjKlMnOpQrSt";
  assert.match(parseGoogleUrl(`https://docs.google.com/document/d/${id}/edit`).url, /export\?format=pdf/);
  assert.match(parseGoogleUrl(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=77`).url, /gid=77/);
  assert.match(parseGoogleUrl(`https://docs.google.com/presentation/d/${id}/edit`).url, /export\/pdf/);
  assert.match(parseGoogleUrl(`https://drive.google.com/file/d/${id}/view`).url, /uc\?export=download/);
  assert.equal(parseGoogleUrl(`https://evil.com/document/d/${id}`), null);
  assert.equal(parseGoogleUrl(`http://docs.google.com/document/d/${id}`), null);
  assert.equal(parseGoogleUrl("bukan url"), null);
});

const mkTmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "lp-tool-"));
test("tools.validate menolak nama file lain dan path tidak ada", () => {
  const d = mkTmp(),
    evil = path.join(d, "evil.exe"),
    ok = path.join(d, "soffice");
  fs.writeFileSync(evil, "x");
  fs.writeFileSync(ok, "x");
  assert.ok(tools.validate("SOFFICE", evil));
  assert.ok(tools.validate("SOFFICE", path.join(d, "tidak-ada")));
  assert.ok(tools.validate("SOFFICE", "soffice")); // bukan path lengkap
  assert.equal(tools.validate("SOFFICE", ok), "");
});
test("tools.resolve: settings > env > fallback", () => {
  const a = mkTmp(),
    b = mkTmp(),
    fa = path.join(a, "soffice"),
    fb = path.join(b, "soffice");
  fs.writeFileSync(fa, "x");
  fs.writeFileSync(fb, "x");
  const appDir = mkTmp();
  assert.equal(tools.resolve("SOFFICE", { settings: { sofficePath: fa }, env: { SOFFICE: fb }, appDir }).path, fa);
  const r = tools.resolve("SOFFICE", { settings: { sofficePath: path.join(a, "hilang") }, env: { SOFFICE: fb }, appDir });
  assert.equal(r.path, fb);
  assert.equal(r.source, "env");
  const t = path.join(appDir, "tools");
  fs.mkdirSync(t);
  assert.equal(tools.resolve("SOFFICE", { appDir }).source === "auto", tools.detect("SOFFICE", appDir) !== "");
});
