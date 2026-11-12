// Embeds the on-device expiry-date reader (ONNX Runtime + PaddleOCR models) into the standalone HTML:
// inserts "ocrEmbutido": {...base64...} at the start of "recursos" in the JSON payload.
// The SAME algorithm as R/exportar.R (.html_com_leitor, used by export_html(leitor = TRUE));
// both are checked against tests/fixtures/leitor_mini/esperado.html.
import fs from "fs";
import path from "path";

export const OCR_CHAVES = [["ortjs", "ort/ort.wasm.min.js"], ["ortmjs", "ort/ort-wasm-simd-threaded.mjs"],
  ["ortwasm", "ort/ort-wasm-simd-threaded.wasm"], ["det", "det.onnx"], ["rec", "rec.onnx"], ["cls", "cls.onnx"], ["chaves", "chaves.txt"]];

export function comLeitor(base, pastaOcr) {
  const emb = OCR_CHAVES.map(([k, f]) => `"${k}":"${fs.readFileSync(path.join(pastaOcr, f)).toString("base64")}"`).join(",");
  const marca = '"recursos":{';
  if (base.split(marca).length !== 2) throw new Error('payload sem um único "recursos"');
  return base.replace(marca, () => `${marca}"ocrEmbutido":{${emb}},`);
}
