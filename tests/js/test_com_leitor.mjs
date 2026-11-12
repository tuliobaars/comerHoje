// node tests/js/test_com_leitor.mjs [--gravar]: the reader embedding of the standalone HTML (tools/lib/com-leitor.mjs)
// against tests/fixtures/leitor_mini/esperado.html. R (.html_com_leitor) is checked against the SAME file.
import fs from "fs";
import os from "os";
import path from "path";
import assert from "assert";
import { fileURLToPath } from "url";
import { comLeitor, OCR_CHAVES } from "../../tools/lib/com-leitor.mjs";

const F = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/leitor_mini");
const base = fs.readFileSync(path.join(F, "base.html"), "utf8");
// the 7 fake reader files are bytes in a JSON file (no binary files in the repository); written to a temp folder
const OCR = fs.mkdtempSync(path.join(os.tmpdir(), "leitor-mini-"));
for (const [f, bytes] of Object.entries(JSON.parse(fs.readFileSync(path.join(F, "ocr.json"), "utf8")).arquivos)) {
  fs.mkdirSync(path.dirname(path.join(OCR, f)), { recursive: true });
  fs.writeFileSync(path.join(OCR, f), Buffer.from(bytes));
}
process.on("exit", () => fs.rmSync(OCR, { recursive: true, force: true }));
const saida = comLeitor(base, OCR);
if (process.argv.includes("--gravar")) fs.writeFileSync(path.join(F, "esperado.html"), saida);
let ok = 0;
const caso = (nome, fn) => { fn(); ok++; console.log("ok  ", nome); };
try {
  caso("igual ao esperado (mesmo arquivo que o teste do R usa)", () => assert.strictEqual(saida, fs.readFileSync(path.join(F, "esperado.html"), "utf8")));
  const j = JSON.parse(saida.match(/id="ch-dados">(.*?)<\/script>/)[1]);
  caso("payload continua JSON válido", () => assert.ok(j.recursos && j.catalogo));
  caso("as 7 peças do leitor, na ordem", () => assert.deepStrictEqual(Object.keys(j.recursos.ocrEmbutido), OCR_CHAVES.map(([k]) => k)));
  caso("base64 decodifica para os bytes originais", () => {
    for (const [k, f] of OCR_CHAVES) assert.ok(Buffer.from(j.recursos.ocrEmbutido[k], "base64").equals(fs.readFileSync(path.join(OCR, f))), k);
  });
  caso("o resto do payload fica intacto", () => assert.strictEqual(j.recursos.zxingWasmB64, "AAEC"));
  caso("payload com dois \"recursos\" é recusado", () => assert.throws(() => comLeitor(base + base, OCR), /único/));
} catch (e) { console.log("FALHOU", e.message); process.exit(1); }
console.log(`\n${ok} ok`);
