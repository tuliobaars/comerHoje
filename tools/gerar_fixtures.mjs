// Generates the parity fixtures from the JS reference implementation (srcjs/):
//   tests/fixtures/golden_operacoes.json   sequence of operations + the final state expected by CH.loja.aplicarOp
//   tests/fixtures/golden_sync.json        FNV-1a vectors + the 12 cases of the three-way merge
// R (R/operacoes.R, R/core_sync.R) must reproduce both (tests/testthat/test-paridade.R).
import fs from "fs";
import path from "path";
import vm from "vm";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const core = require(path.join(RAIZ, "srcjs/core/comerhoje-core.js"));

// loads 20-loja.js in a minimal context (no DOM)
const ctx = { globalThis: {}, console, Date, Math, JSON };
ctx.globalThis = ctx; ctx.CH = { core, fuso: "America/Sao_Paulo", bus: { emit() {} }, dados: { ing: () => ({}) } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, "srcjs/app/20-loja.js"), "utf8"), ctx);
const loja = ctx.CH.loja;

const t = (h) => `2026-11-${String(10 + Math.floor(h / 24)).padStart(2, "0")}T${String(h % 24).padStart(2, "0")}:15:00.000Z`;
const ops = [
  { id: "op01", op: "lote.salvar", t: t(12), args: { lote: { id: "L1", ingrediente_id: "panceta", descricao: "Panceta El Corte", quantidade: 482, local: "geladeira", validade: "2027-01-19", validade_origem: "rotulo", preco_total: 14.89, gtin: "2065840014899", origem: "scan_balanca", data_compra: "2026-11-10" } } },
  { id: "op02", op: "lote.salvar", t: t(12), args: { lote: { id: "L2", ingrediente_id: "molho_tomate", quantidade: 240, validade: "2027-03-31", validade_origem: "rotulo", preco_total: 4.49, origem: "scan_rotulo" } } },
  { id: "op03", op: "lote.abrir", t: t(13), args: { id: "L2", data: "2026-11-10" } },
  { id: "op04", op: "lote.baixar", t: t(25), args: { id: "L2", quantidade: 120, tipo: "consumo", validade_efetiva: "2026-11-13" } },
  { id: "op05", op: "lote.baixar", t: t(26), args: { id: "L1", quantidade: 200, tipo: "consumo", validade_efetiva: "2027-01-19", refeicao_id: "2026-11-11:jantar" } },
  { id: "op06", op: "lote.salvar", t: t(27), args: { lote: { id: "L3", ingrediente_id: "alface", quantidade: 300, local: "geladeira", validade: null, validade_origem: "estimada", preco_total: 3.5, data_compra: "2026-11-05" } } },
  { id: "op07", op: "lote.baixar", t: t(28), args: { id: "L3", quantidade: 300, tipo: "descarte", motivo: "estragou" } },
  { id: "op08", op: "lote.mover", t: t(29), args: { id: "L1", local: "freezer", validade: "2027-02-08" } },
  { id: "op09", op: "lote.salvar", t: t(30), args: { lote: { id: "L1", descricao: "Panceta (congelada)", quantidade: 282 } } },
  { id: "op10", op: "compras.salvar", t: t(30), args: { item: { id: "C1", ingrediente_id: "queijo_parmesao", descricao: "Queijo parmesão", quantidade: 30, unidade: "g", origem: "plano" } } },
  { id: "op11", op: "compras.marcar", t: t(31), args: { id: "C1", comprado: true } },
  { id: "op12", op: "compras.salvar", t: t(31), args: { item: { id: "C2", descricao: "Papel-toalha", origem: "manual" } } },
  { id: "op13", op: "compras.excluir", t: t(32), args: { id: "C2" } },
  { id: "op14", op: "plano.salvar", t: t(33), args: { plano: { id: "P1", inicio: "2026-11-11", fim: "2026-11-12", metodo: "guloso", pessoas: 2,
      refeicoes: [{ id: "2026-11-11:jantar", data: "2026-11-11", refeicao: "jantar", receita_id: "nhoque_ao_sugo", status: "planejado", usa: ["L2"] },
                  { id: "2026-11-12:almoco", data: "2026-11-12", refeicao: "almoco", receita_id: "panceta_assada", status: "planejado", usa: ["L1"] }] } } },
  { id: "op15", op: "refeicao.marcar", t: t(34), args: { id: "2026-11-11:jantar", status: "feito" } },
  { id: "op16", op: "sobra.salvar", t: t(34), args: { sobra: { id: "S1", receita_id: "nhoque_ao_sugo", descricao: "Nhoque ao sugo", porcoes: 2, feita_em: "2026-11-11", validade: "2026-11-14" } } },
  { id: "op17", op: "sobra.baixar", t: t(35), args: { id: "S1", porcoes: 2, tipo: "consumo" } },
  { id: "op18", op: "config.salvar", t: t(35), args: { chave: "pessoas", valor: 3 } },
  { id: "op19", op: "produto.salvar", t: t(36), args: { gtin: "7896102503814", ingrediente_id: "molho_tomate", descricao: "Molho Heinz", qtd_embalagem: 240 } },
  { id: "op20", op: "sinonimo.aprender", t: t(36), args: { termo: "elcorte", ingrediente_id: "panceta" } },
  { id: "op21", op: "lote.excluir", t: t(37), args: { id: "L3" } },
  { id: "op22", op: "lote.baixar", t: t(47), args: { id: "L2", quantidade: 999, tipo: "consumo", validade_efetiva: "2026-11-13" } },
];
const E = loja.vazio();
for (const o of ops) loja.aplicarOp(E, o);
let erro = null;
try { loja.aplicarOp(loja.vazio(), { id: "x", op: "lote.baixar", t: t(1), args: { id: "nao-existe", quantidade: 1, tipo: "consumo" } }); } catch (e) { erro = e.message; }
let erroMotivo = null;
try { const E2 = loja.vazio(); loja.aplicarOp(E2, ops[0]); loja.aplicarOp(E2, { id: "y", op: "lote.baixar", t: t(2), args: { id: "L1", quantidade: 1, tipo: "descarte" } }); } catch (e) { erroMotivo = e.message; }
const { versao, ...esperado } = E;
fs.writeFileSync(path.join(RAIZ, "tests/fixtures/golden_operacoes.json"), JSON.stringify({
  nota: "Gerado por tools/gerar_fixtures.mjs a partir de srcjs/app/20-loja.js (referência). R/operacoes.R deve chegar ao mesmo estado.",
  fuso: "America/Sao_Paulo", ops, esperado, erros: { lote_inexistente: erro, descarte_sem_motivo: erroMotivo } }, null, 1));

// ---------- sync ----------
const C = ["item", "quantidade", "unidade", "local", "validade", "aberto_em", "preco_total", "excluido"];
const L = (id, q, extra = {}) => ({ id, item: "Molho de tomate", quantidade: q, unidade: "g", local: "geladeira", validade: "2027-03-31", aberto_em: "", preco_total: 4.49, excluido: 0, ...extra });
const H = (r) => ({ id: r.id, hash: core.fnv1a(C.map((c) => (r[c] == null ? "" : String(r[c]))).join("\u001f")) });
const casos = [
  { nome: "novo no app", local: [L("a", 240)], remoto: [], base: [], esperado: { push: ["a"] } },
  { nome: "novo na planilha", local: [], remoto: [L("a", 240)], base: [], esperado: { pull: ["a"] } },
  { nome: "mesmo id nos dois, iguais", local: [L("a", 240)], remoto: [L("a", 240)], base: [], esperado: { nada: ["a"] } },
  { nome: "mesmo id nos dois, diferentes", local: [L("a", 240)], remoto: [L("a", 120)], base: [], esperado: { conflito_remoto: ["a"] } },
  { nome: "ninguém mudou", local: [L("a", 240)], remoto: [L("a", 240)], base: [H(L("a", 240))], esperado: { nada: ["a"] } },
  { nome: "só o app mudou", local: [L("a", 120)], remoto: [L("a", 240)], base: [H(L("a", 240))], esperado: { push: ["a"] } },
  { nome: "só a planilha mudou (edição manual)", local: [L("a", 240)], remoto: [L("a", 1, { quantidade: "1" })], base: [H(L("a", 240))], esperado: { pull: ["a"] } },
  { nome: "os dois mudaram igual", local: [L("a", 120)], remoto: [L("a", 120)], base: [H(L("a", 240))], esperado: { nada: ["a"] } },
  { nome: "os dois mudaram diferente", local: [L("a", 120)], remoto: [L("a", 60)], base: [H(L("a", 240))], esperado: { conflito_remoto: ["a"] } },
  { nome: "apagado na planilha, app igual à base", local: [L("a", 240)], remoto: [], base: [H(L("a", 240))], esperado: { excluir_local: ["a"] } },
  { nome: "apagado na planilha, app mudou", local: [L("a", 120)], remoto: [], base: [H(L("a", 240))], esperado: { push: ["a"] } },
  { nome: "sumiu do app (compactação)", local: [], remoto: [L("a", 240)], base: [H(L("a", 240))], esperado: { pull: ["a"] } },
  { nome: "sumiu dos dois", local: [], remoto: [], base: [H(L("a", 240))], esperado: { esquecer: ["a"] } },
];
for (const c of casos) {
  const r = core.mesclar3vias(c.local, c.remoto, c.base, C);
  for (const [k, v] of Object.entries(c.esperado)) if (JSON.stringify(r[k]) !== JSON.stringify(v)) throw new Error(`JS falhou no caso "${c.nome}": ${JSON.stringify(r)}`);
}
const vetores = ["", "a", "comerHoje", "Feijão, açaí e pinhão", "molho\u001f240\u001fg", "Molho de tomate\u001f240\u001fg\u001fgeladeira\u001f2027-03-31\u001f\u001f4.49\u001f0"].map((s) => ({ texto: s, fnv1a: core.fnv1a(s) }));
fs.writeFileSync(path.join(RAIZ, "tests/fixtures/golden_sync.json"), JSON.stringify({ campos: C, vetores, casos }, null, 1));
console.log(`golden_operacoes.json: ${ops.length} operações · golden_sync.json: ${casos.length} casos, ${vetores.length} vetores FNV-1a`);
