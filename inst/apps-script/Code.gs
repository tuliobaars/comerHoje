// comerHoje: Apps Script for the household's Google Sheet (reads and writes the stock, protected by a password).
//
// How to install (once, by the owner of the sheet):
//  1. In the sheet: Extensões -> Apps Script. Paste this file and save.
//  2. Configurações do projeto -> Propriedades do script -> add COMERHOJE_TOKEN = a long password.
//  3. Implantar -> Nova implantação -> App da Web. Executar como: Eu. Quem pode acessar: Qualquer pessoa.
//     Copy the URL that ends in /exec.
//  4. Give the URL and the password to the app (server: COMERHOJE_PLANILHA_SCRIPT / COMERHOJE_PLANILHA_TOKEN;
//     HTML/Quarto: Ajustes -> Planilha Google). The sheet does NOT need to be public for this.
// Protocol: GET ?acao=ler&token=... -> {ok, revisao, abas: {estoque: [...]}}
//           POST (text/plain JSON) {acao: "gravar", token, aba, campos, linhas, revisao_esperada} -> {ok, revisao}
// The revision (tab _meta, B1) goes up on every write through the script and on every manual edit
// (onEdit), so two phones cannot overwrite each other without noticing.

var ABAS = ["estoque", "compras", "sobras"];

function resposta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function autorizado_(token) {
  var certo = PropertiesService.getScriptProperties().getProperty("COMERHOJE_TOKEN");
  return !!certo && token === certo;
}
function meta_(ss) {
  var m = ss.getSheetByName("_meta");
  if (!m) { m = ss.insertSheet("_meta"); m.getRange("A1:B2").setValues([["revisao", 0], ["schema", 2]]); }
  return m;
}
function revisao_(ss) { return Number(meta_(ss).getRange("B1").getValue() || 0); }
function paraTexto_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, "yyyy-MM-dd");
  return v === null || v === undefined ? "" : v;
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!autorizado_(p.token)) return resposta_({ ok: false, erro: "senha inválida" });
  var ss = SpreadsheetApp.getActiveSpreadsheet(), tz = ss.getSpreadsheetTimeZone(), abas = {};
  ABAS.forEach(function (nome) {
    var sh = ss.getSheetByName(nome);
    if (!sh || sh.getLastRow() < 1) { abas[nome] = []; return; }
    var v = sh.getDataRange().getValues(), cab = v[0].map(String);
    abas[nome] = v.slice(1).filter(function (l) { return l.some(function (c) { return c !== "" && c !== null; }); })
      .map(function (l) { var o = {}; cab.forEach(function (c, i) { o[c] = paraTexto_(l[i], tz); }); return o; });
  });
  return resposta_({ ok: true, revisao: revisao_(ss), abas: abas });
}

function doPost(e) {
  var b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return resposta_({ ok: false, erro: "JSON inválido" }); }
  if (!autorizado_(b.token)) return resposta_({ ok: false, erro: "senha inválida" });
  if (b.acao !== "gravar" || ABAS.indexOf(b.aba) < 0) return resposta_({ ok: false, erro: "ação inválida" });
  var trava = LockService.getDocumentLock();
  if (!trava.tryLock(20000)) return resposta_({ ok: false, erro: "planilha ocupada, tente de novo" });
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), rev = revisao_(ss);
    if (b.revisao_esperada !== null && b.revisao_esperada !== undefined && Number(b.revisao_esperada) !== rev)
      return resposta_({ ok: false, erro: "revisao", revisao: rev });
    var sh = ss.getSheetByName(b.aba) || ss.insertSheet(b.aba);
    var campos = b.campos, linhas = b.linhas.map(function (l) { return campos.map(function (c) { return l[c] === null || l[c] === undefined ? "" : l[c]; }); });
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), 1), Math.max(sh.getLastColumn(), campos.length)).clearContent();   // keeps formatting and checkboxes
    sh.getRange(1, 1, linhas.length + 1, campos.length).setValues([campos].concat(linhas));
    sh.setFrozenRows(1);
    meta_(ss).getRange("B1").setValue(rev + 1);
    return resposta_({ ok: true, revisao: rev + 1, linhas: linhas.length });
  } finally { trava.releaseLock(); }
}

// Manual edits (never writes made through the API) bump the revision: the app notices them.
function onEdit(e) {
  var nome = e.range.getSheet().getName();
  if (ABAS.indexOf(nome) < 0 || e.range.getRow() === 1) return;
  var m = meta_(e.source); m.getRange("B1").setValue(Number(m.getRange("B1").getValue() || 0) + 1);
}
