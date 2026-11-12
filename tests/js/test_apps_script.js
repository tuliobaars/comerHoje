// node tests/js/test_apps_script.js: inst/apps-script/Code.gs against an in-memory mock of SpreadsheetApp.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
function planilha() {
  const abas = {};
  const aba = (nome) => {
    const dados = [];                                         // 2D array; "" = empty cell
    const sh = {
      getName: () => nome, _dados: dados,
      getLastRow: () => { let n = dados.length; while (n && dados[n - 1].every((c) => c === "")) n--; return n; },
      getLastColumn: () => Math.max(0, ...dados.map((l) => l.length)), getMaxRows: () => Math.max(dados.length, 1000),
      getDataRange: () => sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()),
      getRange: (a, b, c, d) => {
        if (typeof a === "string") { const m = a.match(/([A-Z])(\d+)(?::([A-Z])(\d+))?/); const col = m[1].charCodeAt(0) - 64, lin = +m[2];
          return sh.getRange(lin, col, m[4] ? +m[4] - lin + 1 : 1, m[3] ? m[3].charCodeAt(0) - 64 - col + 1 : 1); }
        return {
          getValues: () => Array.from({ length: c }, (_, i) => Array.from({ length: d }, (_, j) => ((dados[a - 1 + i] || [])[b - 1 + j] ?? ""))),
          getValue: () => (dados[a - 1] || [])[b - 1] ?? "",
          setValue: (v) => { while (dados.length < a) dados.push([]); dados[a - 1][b - 1] = v; },
          setValues: (vs) => vs.forEach((l, i) => l.forEach((v, j) => { while (dados.length < a + i) dados.push([]); dados[a - 1 + i][b - 1 + j] = v; })),
          clearContent: () => { for (let i = 0; i < c && a - 1 + i < dados.length; i++) for (let j = 0; j < d; j++) if (dados[a - 1 + i]) dados[a - 1 + i][b - 1 + j] = ""; },
          getSheet: () => sh, getRow: () => a };
      },
      setFrozenRows: () => {} };
    return sh;
  };
  return { getSheetByName: (n) => abas[n] || null, insertSheet: (n) => (abas[n] = aba(n)), getSpreadsheetTimeZone: () => "America/Sao_Paulo", _abas: abas };
}
const ss = planilha();
const props = { COMERHOJE_TOKEN: "senha-longa" };
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] }) },
  LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  ContentService: { MimeType: { JSON: "json" }, createTextOutput: (t) => ({ setMimeType: () => ({ conteudo: JSON.parse(t) }) }) },
  Utilities: { formatDate: (d, tz, f) => d.toISOString().slice(0, 10) }, JSON, Number, Date };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../../inst/apps-script/Code.gs"), "utf8"), ctx);
let ok = 0; const t = (nome, fn) => { fn(); ok++; console.log("ok  ", nome); };
const get = (p) => ctx.doGet({ parameter: p }).conteudo, post = (b) => ctx.doPost({ postData: { contents: JSON.stringify(b) } }).conteudo;
const campos = ["id", "item", "quantidade", "validade", "excluido"];

t("senha errada é recusada (GET e POST)", () => { assert.strictEqual(get({ acao: "ler", token: "x" }).ok, false); assert.strictEqual(post({ acao: "gravar", token: "x", aba: "estoque" }).ok, false); });
t("planilha vazia: revisão 0, abas vazias", () => { const r = get({ acao: "ler", token: "senha-longa" }); assert.strictEqual(r.revisao, 0); assert.deepStrictEqual(r.abas.estoque, []); });
t("gravar com a revisão certa: ok e revisão + 1", () => {
  const r = post({ acao: "gravar", token: "senha-longa", aba: "estoque", campos, revisao_esperada: 0,
    linhas: [{ id: "L1", item: "Panceta suína", quantidade: 482, validade: "2027-01-19", excluido: 0 }, { id: "L2", item: "Nhoque", quantidade: 500, validade: "2027-06-29", excluido: 0 }] });
  assert.deepStrictEqual([r.ok, r.revisao, r.linhas], [true, 1, 2]);
});
t("ler devolve as linhas como objetos pelo cabeçalho", () => { const r = get({ acao: "ler", token: "senha-longa" });
  assert.strictEqual(r.revisao, 1); assert.strictEqual(r.abas.estoque[1].item, "Nhoque"); assert.strictEqual(r.abas.estoque[0].quantidade, 482); });
t("gravar com revisão antiga é recusado (outro aparelho gravou antes)", () => {
  const r = post({ acao: "gravar", token: "senha-longa", aba: "estoque", campos, revisao_esperada: 0, linhas: [] });
  assert.deepStrictEqual([r.ok, r.erro, r.revisao], [false, "revisao", 1]); });
t("edição manual (onEdit) aumenta a revisão", () => {
  const sh = ss.getSheetByName("estoque");
  ctx.onEdit({ range: sh.getRange(2, 3, 1, 1), source: ss });
  assert.strictEqual(get({ acao: "ler", token: "senha-longa" }).revisao, 2); });
t("data digitada como data na planilha volta em ISO", () => {
  ss.getSheetByName("estoque").getRange(3, 4, 1, 1).setValue(new Date(Date.UTC(2027, 5, 29)));
  assert.strictEqual(get({ acao: "ler", token: "senha-longa" }).abas.estoque[1].validade, "2027-06-29"); });
t("regravar com menos linhas não deixa linhas velhas", () => {
  post({ acao: "gravar", token: "senha-longa", aba: "estoque", campos, revisao_esperada: 2, linhas: [{ id: "L1", item: "Panceta suína", quantidade: 282, validade: "2027-02-08", excluido: 0 }] });
  const r = get({ acao: "ler", token: "senha-longa" }); assert.strictEqual(r.abas.estoque.length, 1); assert.strictEqual(r.abas.estoque[0].quantidade, 282); });
t("aba fora da lista é recusada", () => assert.strictEqual(post({ acao: "gravar", token: "senha-longa", aba: "_meta", campos, linhas: [] }).ok, false));
console.log(`${ok} ok (Apps Script com SpreadsheetApp simulado)`);
