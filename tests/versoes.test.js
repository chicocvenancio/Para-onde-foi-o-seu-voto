// Garante que o index.html aponta para a versão atual de cada arquivo (?v=<hash>).
// Se falhar, rode: python3 scripts/versionar.py
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");

for (const nome of ["app.js", "engine.js", "style.css"]) {
  test(`index.html usa a versão atual de ${nome}`, () => {
    const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(RAIZ, nome))).digest("hex").slice(0, 10);
    assert.ok(html.includes(`"${nome}?v=${hash}"`), `rode python3 scripts/versionar.py (esperado ${nome}?v=${hash})`);
  });
}
