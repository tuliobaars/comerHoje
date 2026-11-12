// tools/build.mjs: ONE front end (srcjs/) -> the three targets of the Taiga delivery model (DLV-01).
//   node tools/build.mjs              Shiny (inst/app/www), Quarto (inst/quarto), HTML (inst/standalone/comerhoje.html)
//   node tools/build.mjs --html-ocr   also dist/comerhoje-com-leitor.html (reader embedded, ~40 MB; NOT in the R package:
//                                     R builds the same file with export_html(leitor = TRUE))
// The targets are never edited by hand. Generated files: see .gitignore (OCR models are not committed).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { comLeitor } from "./lib/com-leitor.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NM = path.join(RAIZ, "node_modules");
const ler = (p, enc = "utf8") => fs.readFileSync(path.join(RAIZ, p), enc);
const gravar = (p, conteudo) => { fs.mkdirSync(path.dirname(path.join(RAIZ, p)), { recursive: true }); fs.writeFileSync(path.join(RAIZ, p), conteudo); };
const copiar = (de, para) => { fs.mkdirSync(path.dirname(path.join(RAIZ, para)), { recursive: true }); fs.copyFileSync(de, path.join(RAIZ, para)); };
const b64 = (p) => fs.readFileSync(p).toString("base64");
const versao = JSON.parse(ler("package.json")).version || "0.0.0";
const DESCRICAO = ler("DESCRIPTION").match(/^Version:\s*(.+)$/m);
const VERSAO = DESCRICAO ? DESCRICAO[1].trim() : versao;

// ---------- helpers: ASCII-only assets (DLV-06) and safe JSON payloads (DLV-05) ----------
const asciiJs = (s) => s.replace(/[^\x00-\x7f]/g, (c) => { const u = c.charCodeAt(0).toString(16).padStart(4, "0"); return "\\u" + u; });
const asciiCss = (s) => s.replace(/[^\x00-\x7f]/g, (c) => "\\" + c.codePointAt(0).toString(16) + " ");
const jsonSeguro = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c").replace(/[^\x00-\x7f]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
function conferir(nome, texto) {
  const proibido = ["<script", "</script", "</body", "<!--"].filter((t) => texto.toLowerCase().includes(t));
  if (proibido.length) throw new Error(`${nome}: contém ${proibido.join(", ")} (DLV-06)`);
  if (/[^\x00-\x7f]/.test(texto)) throw new Error(`${nome}: não é ASCII (DLV-06)`);
}

// ---------- icons (lucide-static, ISC): only those used in srcjs ----------
const fontesJs = ["srcjs/core/comerhoje-core.js", "srcjs/ocr/motor-ocr.js", "srcjs/ocr/leitor-rotulo.js",
  ...fs.readdirSync(path.join(RAIZ, "srcjs/app")).filter((f) => f.endsWith(".js")).sort().map((f) => "srcjs/app/" + f)];
const todoJs = fontesJs.map((f) => ler(f)).join("\n");
const usados = new Set(["leaf", "circle", "loader", "circle-check", "circle-x", "circle-minus", "circle-alert", "triangle-alert", "info", "chevron-right"]);
for (const m of todoJs.matchAll(/(?:\bI|CH\.icone)\("([a-z0-9-]+)"/g)) usados.add(m[1]);
for (const m of todoJs.matchAll(/icone: "([a-z0-9-]+)"/g)) usados.add(m[1]);
for (const m of todoJs.matchAll(/\{ (?:ok|falhou|pulado|aviso|andando): "([a-z0-9-]+)"/g)) usados.add(m[1]);
for (const m of todoJs.matchAll(/ICONE_LOCAL = \{([^}]+)\}/g)) for (const n of m[1].matchAll(/"([a-z0-9-]+)"/g)) usados.add(n[1]);
const icones = {};
for (const n of [...usados].sort()) {
  const f = path.join(NM, "lucide-static/icons", n + ".svg");
  if (!fs.existsSync(f)) { console.warn("ícone inexistente:", n); continue; }
  icones[n] = fs.readFileSync(f, "utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>[\s\S]*$/, "").replace(/\s+/g, " ").trim();
}

// ---------- JS and CSS bundles ----------
const cabecalho = `/* comerHoje ${VERSAO} (built by tools/build.mjs; do not edit). Icons: Lucide (ISC). */\n`;
let js = "";
for (const f of fontesJs) {
  js += `\n/* ---- ${f} ---- */\n` + ler(f);
  if (f.endsWith("00-base.js")) js += `\nCH.ICONES = ${JSON.stringify(icones)};\n`;
}
js = cabecalho + asciiJs(js);
conferir("comerhoje.js", js);

const fontes = {
  "inter-400": "@fontsource/inter/files/inter-latin-400-normal.woff2", "inter-600": "@fontsource/inter/files/inter-latin-600-normal.woff2",
  "inter-700": "@fontsource/inter/files/inter-latin-700-normal.woff2",
  "jbmono-400": "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2", "jbmono-600": "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2" };
const cssFonte = fs.readdirSync(path.join(RAIZ, "srcjs/css")).filter((f) => f.endsWith(".css")).sort().map((f) => ler("srcjs/css/" + f)).join("\n");
const css = (modo) => {
  let c = cssFonte.replace(/__FONTE_([a-z0-9-]+)__/g, (_, k) => modo === "inline" ? `data:font/woff2;base64,${b64(path.join(NM, fontes[k]))}` : `fonts/${k}.woff2`);
  c = cabecalho + asciiCss(c);
  conferir("comerhoje.css", c);
  return c;
};

// ---------- catalog: inst/extdata/*.csv -> catalogo.json (the SAME file feeds R and the HTML) ----------
function csv(nome) {
  const linhas = ler("inst/extdata/" + nome).replace(/\r/g, "").trim().split("\n");
  const campos = (l) => { const out = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) { const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; }
    out.push(cur); return out; };
  const cab = campos(linhas[0]);
  return linhas.slice(1).map((l) => Object.fromEntries(campos(l).map((v, i) => [cab[i], v])));
}
const receitas = csv("receitas.csv"), ri = csv("receita_ingredientes.csv");
const catalogo = { categorias: csv("categorias.csv"), unidades: csv("unidades.csv").map((u) => ({ ...u, fator_base: u.fator_base === "" ? null : +u.fator_base })),
  ingredientes: csv("ingredientes.csv"), conversoes: csv("conversoes.csv"),
  receitas: receitas.map((r) => ({ ...r, porcoes: +r.porcoes, ingredientes: ri.filter((x) => x.receita_id === r.id) })) };
gravar("inst/extdata/catalogo.json", JSON.stringify(catalogo));

// ---------- theme before first paint (DLV-07): the same snippet for the three hosts ----------
const temaInicial = asciiJs(`(function(){var r=document.currentScript&&document.currentScript.previousElementSibling;if(!r||!r.classList.contains("ch"))r=document.querySelector(".ch[data-mode]");if(!r)return;var a={};try{a=JSON.parse(localStorage.getItem("comerhoje:aparencia")||"{}")}catch(e){}var f=a.framework||r.getAttribute("data-framework")||"lumen",t=a.tema||"auto",d=t==="escuro"||(t==="auto"&&window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches);r.setAttribute("data-framework",f);r.setAttribute("data-theme",d?"dark":"light");if(a.ambiente)r.setAttribute("data-ambient",a.ambiente);if(a.texto)r.setAttribute("data-ch-text",a.texto);if(a.densidade)r.setAttribute("data-ch-density",a.densidade);if(a.contraste)r.setAttribute("data-ch-contrast",a.contraste);if(a.fundo)r.setAttribute("data-ch-canvas",a.fundo);})();`);
gravar("inst/app/tema-inicial.js", temaInicial);
const raizHtml = (modo, framework = "lumen") =>
  `<div class="ch" data-mode="${modo}" data-framework="${framework}" data-theme="light" data-payload="ch-dados" data-instancia="${modo}"></div>`;
const SCRIPT = "scr" + "ipt";   // never the literal tag in assets (DLV-06)

// ---------- 1. Shiny: inst/app/www ----------
gravar("inst/app/www/comerhoje.js", js);
gravar("inst/app/www/comerhoje.css", css("arquivo"));
for (const [k, f] of Object.entries(fontes)) copiar(path.join(NM, f), `inst/app/www/fonts/${k}.woff2`);
copiar(path.join(NM, "zxing-wasm/dist/iife/reader/index.js"), "inst/app/www/zxing/zxing-reader.js");
copiar(path.join(NM, "zxing-wasm/dist/reader/zxing_reader.wasm"), "inst/app/www/zxing/zxing_reader.wasm");
const ocrArqs = { "ort/ort.wasm.min.js": "onnxruntime-web/dist/ort.wasm.min.js", "ort/ort-wasm-simd-threaded.mjs": "onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
  "ort/ort-wasm-simd-threaded.wasm": "onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "det.onnx": "@gutenye/ocr-models/assets/ch_PP-OCRv4_det_infer.onnx",
  "rec.onnx": "@gutenye/ocr-models/assets/ch_PP-OCRv4_rec_infer.onnx", "cls.onnx": "@gutenye/ocr-models/assets/ch_ppocr_mobile_v2.0_cls_infer.onnx",
  "chaves.txt": "@gutenye/ocr-models/assets/ppocr_keys_v1.txt" };
for (const [d, o] of Object.entries(ocrArqs)) copiar(path.join(NM, o), "inst/app/www/ocr/" + d);

// ---------- 2. standalone HTML (one file, no network) ----------
function html() {
  const zx = fs.readFileSync(path.join(NM, "zxing-wasm/dist/iife/reader/index.js"), "utf8");
  const recursos = { zxingWasmB64: b64(path.join(NM, "zxing-wasm/dist/reader/zxing_reader.wasm")) };
  const payload = jsonSeguro({ catalogo, recursos, aparencia: { framework: "lumen" } });
  const zxAscii = asciiJs(zx).replace(/<\/(scr)(ipt)/gi, "<\\/$1$2");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#fbfbfd">
<meta name="format-detection" content="telephone=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>comerHoje: cozinha sem desperdício</title>
<style>${css("inline")}</style>
</head>
<body>
${raizHtml("html")}
<${SCRIPT}>${temaInicial}</${SCRIPT}>
<${SCRIPT} type="application/json" id="ch-dados">${payload}</${SCRIPT}>
<${SCRIPT}>${zxAscii}</${SCRIPT}>
<${SCRIPT}>${js}</${SCRIPT}>
</body>
</html>
`;
}
const htmlBase = html();
gravar("inst/standalone/comerhoje.html", htmlBase);
// Reader embedded (tools/lib/com-leitor.mjs; same algorithm as export_html(leitor = TRUE) in R).
if (process.argv.includes("--html-ocr")) gravar("dist/comerhoje-com-leitor.html", comLeitor(htmlBase, path.join(RAIZ, "inst/app/www/ocr")));

// ---------- 3. Quarto: include files + document ----------
const payloadQuarto = jsonSeguro({ catalogo, recursos: { zxingWasmB64: b64(path.join(NM, "zxing-wasm/dist/reader/zxing_reader.wasm")) }, aparencia: { framework: "lumen" } });
gravar("inst/quarto/_comerhoje-head.html", `<meta name="format-detection" content="telephone=no">\n<style>${css("inline")}</style>\n`);
gravar("inst/quarto/_comerhoje-body.html", `${raizHtml("quarto")}\n<${SCRIPT}>${temaInicial}</${SCRIPT}>\n<${SCRIPT} type="application/json" id="ch-dados">${payloadQuarto}</${SCRIPT}>\n<${SCRIPT}>${asciiJs(fs.readFileSync(path.join(NM, "zxing-wasm/dist/iife/reader/index.js"), "utf8"))}</${SCRIPT}>\n<${SCRIPT}>${js}</${SCRIPT}>\n`);

const tamanho = (p) => (fs.statSync(path.join(RAIZ, p)).size / 1024).toFixed(0) + " KB";
console.log(`comerHoje ${VERSAO}: ${Object.keys(icones).length} ícones · JS ${tamanho("inst/app/www/comerhoje.js")} · CSS ${tamanho("inst/app/www/comerhoje.css")}`);
console.log(`  HTML: inst/standalone/comerhoje.html ${tamanho("inst/standalone/comerhoje.html")}${process.argv.includes("--html-ocr") ? ` · com leitor: dist/comerhoje-com-leitor.html ${tamanho("dist/comerhoje-com-leitor.html")}` : ""}`);
console.log(`  Quarto: inst/quarto/_comerhoje-{head,body}.html · catálogo ${catalogo.ingredientes.length} ingredientes, ${catalogo.receitas.length} receitas`);
