// node tests/js/run_golden.js: the JS core against the golden fixtures (the same ones R uses).
const fs = require("fs"), path = require("path"), assert = require("assert");
const core = require(path.resolve(__dirname, "../../srcjs/core/comerhoje-core.js"));
const fx = (f) => JSON.parse(fs.readFileSync(path.resolve(__dirname, "../fixtures", f), "utf8"));
let ok = 0, falhas = 0;
const caso = (nome, fn) => { try { fn(); ok++; } catch (e) { falhas++; console.error("FALHOU", nome, "-", e.message); } };

const D = fx("golden_datas.json");
for (const c of D.casos) caso(`datas/${c.id}`, () => {
  const r = core.extrairDatas(c.texto, D.hoje);
  assert.strictEqual(r.validade, c.validade, "validade");
  assert.strictEqual(r.fabricacao, c.fabricacao, "fabricacao");
  assert.strictEqual(r.pesagem, c.pesagem, "pesagem");
  if (c.conf_min != null) assert.ok(r.confianca >= c.conf_min && r.confianca <= c.conf_max, `confiança ${r.confianca}`);
});
for (const v of D.votacao) caso(`votacao/${v.id}`, () => {
  const r = core.votarDatas(v.leituras);
  assert.strictEqual(r.validade, v.validade);
  assert.ok(r.confianca >= v.conf_min && r.confianca <= v.conf_max, `confiança ${r.confianca}`);
  assert.strictEqual(!!r.conflito, v.conflito);
});

const C = fx("golden_codigos.json");
for (const e of C.ean) caso(`ean/${e.codigo}`, () => assert.strictEqual(core.eanValido(e.codigo), e.valido));
for (const b of C.balanca) caso(`balanca/${b.codigo}`, () => {
  const r = core.parseEtiquetaBalanca(b.codigo);
  assert.strictEqual(r ? r.plu : null, b.plu); assert.strictEqual(r ? r.precoTotal : null, b.precoTotal);
});
for (const n of C.nfce) caso(`nfce/${n.chave.slice(-12)}`, () => {
  const r = core.chaveNfce(n.chave);
  assert.strictEqual(r.valida, n.valida);
  if (n.uf) assert.strictEqual(r.uf, n.uf);
  if (n.modelo) assert.strictEqual(r.modelo, n.modelo);
  if (n.numero) assert.strictEqual(r.numero, n.numero);
});
for (const b of C.balanca_texto) caso("balanca_texto", () => {
  const r = core.lerBalancaTexto(b.texto);
  assert.strictEqual(r.pesoKg, b.peso_kg); assert.strictEqual(r.precoKg, b.preco_kg); assert.strictEqual(r.total, b.total);
  assert.strictEqual(r.consistente, b.consistente); assert.deepStrictEqual(core.gtinsDoTexto(b.texto), b.gtins);
});

const P = fx("golden_planner.json");
const lotes = P.lotes.map((l) => ({ ...l, validade_efetiva: core.validadeEfetiva(l, P.ingredientes[l.ingrediente]) }));
for (const [id, v] of Object.entries(P.esperado.validade_efetiva))
  caso(`validade_efetiva/${id}`, () => assert.strictEqual(lotes.find((l) => l.id === id).validade_efetiva, v));
caso("planner/guloso", () => {
  const r = core.planejarGuloso(lotes, P.receitas, P.slots);
  assert.deepStrictEqual(r.plano.map((p) => p.receita), P.esperado.plano);
  assert.deepStrictEqual(r.compras, P.esperado.compras);
});

const S = fx("golden_sync.json");
for (const v of S.vetores) caso(`fnv1a/${JSON.stringify(v.texto).slice(0, 20)}`, () => assert.strictEqual(core.fnv1a(v.texto), v.fnv1a));
for (const c of S.casos) caso(`sync/${c.nome}`, () => {
  const r = core.mesclar3vias(c.local, c.remoto, c.base, S.campos);
  for (const [k, ids] of Object.entries(c.esperado)) assert.deepStrictEqual(r[k], ids, k);
});

console.log(`${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
