// motor-ocr.js: on-device OCR (PaddleOCR PP-OCRv4 det + rec + angle cls in ONNX Runtime Web).
// Runs in the browser and in all three targets; the photo never leaves the device.
// Needs the global `ort` (onnxruntime-web, ort.wasm.min.js) and the assets in `base`:
//   det.onnx · rec.onnx · cls.onnx · chaves.txt · ort/ (ort-wasm-simd-threaded.{mjs,wasm})
// Conventions follow PaddleOCR / RapidOCR: BGR, det mean = std = 0.5 (limit_type min 736, max 2000,
// thresh .3, box_thresh .5, unclip 1.6, dilation), rec 3x48xW, cls 3x48x192 (180° if p > .9).
"use strict";
(function (raiz) {
  const estado = { sessoes: null, chaves: null, carregando: null, stats: { det: 0, cls: 0, rec: 0, nDet: 0, nCls: 0, nRec: 0 } };
  const relogio = () => (raiz.performance ? performance.now() : Date.now());

  async function carregar(base, { fontes } = {}) {
    if (estado.sessoes) return estado.sessoes;
    if (estado.carregando) return estado.carregando;
    const ort = raiz.ort;
    if (!ort) throw new Error("onnxruntime-web (ort) não carregado");
    ort.env.wasm.numThreads = raiz.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    // fontes (standalone HTML): { mjs, wasm, det, rec, cls, chaves } as URLs (blob:) or ArrayBuffers
    const f = fontes || { mjs: base + "ort/ort-wasm-simd-threaded.mjs", wasm: base + "ort/ort-wasm-simd-threaded.wasm",
                          det: base + "det.onnx", rec: base + "rec.onnx", cls: base + "cls.onnx", chaves: base + "chaves.txt" };
    const abs = (u) => (typeof u === "string" && raiz.document ? new URL(u, raiz.document.baseURI).href : u);
    ort.env.wasm.wasmPaths = { mjs: abs(f.mjs), wasm: abs(f.wasm) };
    const opc = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
    estado.carregando = (async () => {
      const [det, rec, cls, txt] = await Promise.all([
        ort.InferenceSession.create(f.det, opc), ort.InferenceSession.create(f.rec, opc),
        ort.InferenceSession.create(f.cls, opc),
        typeof f.chaves === "string" && !f.chaves.includes("\n") ? fetch(f.chaves).then((r) => r.text()) : f.chaves]);
      const linhas = txt.replace(/\r/g, "").split("\n");
      if (linhas[linhas.length - 1] === "") linhas.pop();
      estado.chaves = ["", ...linhas, " "];
      estado.sessoes = { det, rec, cls };
      return estado.sessoes;
    })();
    return estado.carregando;
  }

  // ---------- canvas and pixels ----------
  const novoCanvas = (w, h) => {
    const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    return c;
  };
  function redimensionar(fonte, w, h) {
    const c = novoCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    const g = c.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingQuality = "high";
    g.drawImage(fonte, 0, 0, c.width, c.height);
    return c;
  }
  function recortar(fonte, x0, y0, x1, y1) {
    const w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0));
    const c = novoCanvas(w, h);
    c.getContext("2d", { willReadFrequently: true }).drawImage(fonte, Math.round(x0), Math.round(y0), w, h, 0, 0, w, h);
    return c;
  }
  function girar180(fonte) {
    const c = novoCanvas(fonte.width, fonte.height), g = c.getContext("2d");
    g.translate(c.width, c.height); g.rotate(Math.PI); g.drawImage(fonte, 0, 0);
    return c;
  }
  const pixels = (c) => c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);

  // Dot-matrix filter: max channel (coloured backgrounds go white, ink stays dark) + minimum filter
  // (grey erosion) of size k, which joins the dots of ink-jet and dot-matrix print into strokes.
  function filtroMatricial(fonte, k) {
    const { width: w, height: h } = fonte, img = pixels(fonte), d = img.data;
    let g = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = Math.max(d[p], d[p + 1], d[p + 2]);
    const r = (k - 1) >> 1, t = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {      // horizontal min
      let m = 255; const o = y * w;
      for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx >= 0 && xx < w && g[o + xx] < m) m = g[o + xx]; }
      t[o + x] = m;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {      // vertical min
      let m = 255;
      for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy >= 0 && yy < h && t[yy * w + x] < m) m = t[yy * w + x]; }
      g[y * w + x] = m;
    }
    let lo = 255, hi = 0;                                            // contrast stretch
    for (const v of g) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const esc = hi > lo ? 255 / (hi - lo) : 1;
    for (let i = 0, p = 0; i < g.length; i++, p += 4) { const v = (g[i] - lo) * esc; d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255; }
    const c = novoCanvas(w, h); c.getContext("2d").putImageData(img, 0, 0);
    return c;
  }

  // CHW float32, BGR, (v/255 - mean)/std, optional right zero padding up to wPad
  function tensor(c, wPad) {
    const { width: w, height: h } = c, d = pixels(c).data, W = wPad || w;
    const out = new Float32Array(3 * h * W), plano = h * W;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4, i = y * W + x;
      out[i] = (d[p + 2] / 255 - 0.5) / 0.5;            // B
      out[plano + i] = (d[p + 1] / 255 - 0.5) / 0.5;    // G
      out[2 * plano + i] = (d[p] / 255 - 0.5) / 0.5;    // R
    }
    return new raiz.ort.Tensor("float32", out, [1, 3, h, W]);
  }

  // ---------- detection (DB) ----------
  async function detectar(fonte, ladoMax = 2000) {
    const { det } = estado.sessoes, w = fonte.width, h = fonte.height;
    let r = 1;
    if (Math.min(w, h) < 736) r = 736 / Math.min(w, h);
    if (Math.max(w, h) * r > ladoMax) r = ladoMax / Math.max(w, h);
    const rw = Math.max(32, Math.round((w * r) / 32) * 32), rh = Math.max(32, Math.round((h * r) / 32) * 32);
    const t0 = relogio();
    const saida = await det.run({ [det.inputNames[0]]: tensor(redimensionar(fonte, rw, rh)) });
    estado.stats.det += relogio() - t0; estado.stats.nDet++;
    const prob = saida[det.outputNames[0]].data;
    const bin = new Uint8Array(rw * rh);
    for (let i = 0; i < bin.length; i++) if (prob[i] > 0.3) {      // threshold + 2x2 dilation
      bin[i] = 1; if ((i + 1) % rw) bin[i + 1] = 1; if (i + rw < bin.length) { bin[i + rw] = 1; if ((i + 1) % rw) bin[i + rw + 1] = 1; }
    }
    const rotulo = new Int32Array(rw * rh), caixas = [], pilha = [];
    let n = 0;
    for (let i0 = 0; i0 < bin.length; i0++) {
      if (!bin[i0] || rotulo[i0]) continue;
      n++; let x0 = rw, y0 = rh, x1 = 0, y1 = 0, soma = 0, cont = 0;
      pilha.push(i0); rotulo[i0] = n;
      while (pilha.length) {
        const i = pilha.pop(), x = i % rw, y = (i / rw) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        soma += prob[i]; cont++;
        const viz = [x > 0 ? i - 1 : -1, x < rw - 1 ? i + 1 : -1, y > 0 ? i - rw : -1, y < rh - 1 ? i + rw : -1];
        for (const j of viz) if (j >= 0 && bin[j] && !rotulo[j]) { rotulo[j] = n; pilha.push(j); }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (Math.min(bw, bh) < 3 || soma / cont < 0.5) continue;
      const dist = (bw * bh * 1.6) / (2 * (bw + bh));             // unclip
      caixas.push({ x0: Math.max(0, (x0 - dist) * (w / rw)), y0: Math.max(0, (y0 - dist) * (h / rh)),
                    x1: Math.min(w, (x1 + 1 + dist) * (w / rw)), y1: Math.min(h, (y1 + 1 + dist) * (h / rh)),
                    escore: soma / cont });
    }
    return caixas.filter((c) => c.x1 - c.x0 >= 6 && c.y1 - c.y0 >= 6);
  }

  // ---------- angle (0/180) and recognition (CTC) ----------
  async function angulo180(recorte) {
    const { cls } = estado.sessoes;
    const w = Math.min(192, Math.ceil((48 * recorte.width) / recorte.height));
    const t0 = relogio();
    const s = await cls.run({ [cls.inputNames[0]]: tensor(redimensionar(recorte, w, 48), 192) });
    estado.stats.cls += relogio() - t0; estado.stats.nCls++;
    const p = s[cls.outputNames[0]].data;
    return p[1] > p[0] && p[1] > 0.9;
  }
  async function reconhecer(recorte, preencher = false) {
    const { rec } = estado.sessoes;
    const razao = recorte.width / recorte.height;
    const w = Math.max(32, Math.ceil(48 * razao));
    const wImg = preencher ? Math.max(320, w) : Math.ceil(w / 8) * 8;
    const t0 = relogio();
    const s = await rec.run({ [rec.inputNames[0]]: tensor(redimensionar(recorte, w, 48), wImg) });
    estado.stats.rec += relogio() - t0; estado.stats.nRec++;
    const t = s[rec.outputNames[0]], [, T, C] = t.dims, d = t.data;
    let txt = "", ant = 0, soma = 0, n = 0;
    for (let k = 0; k < T; k++) {
      let im = 0, vm = -1;
      for (let c = 0; c < C; c++) if (d[k * C + c] > vm) { vm = d[k * C + c]; im = c; }
      if (im !== 0 && im !== ant) { txt += estado.chaves[im] || ""; soma += vm; n++; }
      ant = im;
    }
    return { texto: txt, conf: n ? soma / n : 0 };
  }

  // Reads the text lines of an image (canvas) and returns [{texto, conf, caixa}] in reading order.
  // Boxes are recognised tallest first and `parar(linhas)` can stop early (a confident date found).
  // The page orientation (0/180) is decided once, by the angle classifier on the 5 widest boxes.
  async function lerTexto(fonte, { minConf = 0.5, ladoDet = 2000, parar = null, maxLinhas = 80, preencher = false } = {}) {
    let caixas = await detectar(fonte, ladoDet);
    caixas = caixas.filter((c) => c.y1 - c.y0 < 1.5 * (c.x1 - c.x0));        // vertical text is never a date
    let virar = false;
    const largas = [...caixas].sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0)).slice(0, 5);
    if (largas.length) {
      let votos = 0;
      for (const c of largas) if (await angulo180(recortar(fonte, c.x0, c.y0, c.x1, c.y1))) votos++;
      virar = votos > largas.length / 2;
    }
    const ordem = [...caixas].sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0)).slice(0, maxLinhas);
    const linhas = [];
    for (const c of ordem) {
      let r = recortar(fonte, c.x0, c.y0, c.x1, c.y1);
      if (virar) r = girar180(r);
      const { texto, conf } = await reconhecer(r, preencher);
      if (texto.trim() && conf >= minConf) {
        linhas.push({ texto: texto.trim(), conf, caixa: c });
        if (parar && parar(ordenar(linhas, virar))) break;
      }
    }
    return ordenar(linhas, virar);
  }
  function ordenar(linhas, virar) {           // rows (overlap in y), then x; reversed if the page is upside down
    const L = [...linhas].sort((a, b) => {
      const mesma = Math.min(a.caixa.y1, b.caixa.y1) - Math.max(a.caixa.y0, b.caixa.y0) > 0.5 * Math.min(a.caixa.y1 - a.caixa.y0, b.caixa.y1 - b.caixa.y0);
      return mesma ? a.caixa.x0 - b.caixa.x0 : a.caixa.y0 - b.caixa.y0;
    });
    return virar ? L.reverse() : L;
  }
  // Text for the date parser: one line per row, boxes on the same row joined by spaces
  function comoTexto(linhas) {
    const out = []; let atual = null;
    for (const l of linhas) {
      if (atual && Math.min(atual.y1, l.caixa.y1) - Math.max(atual.y0, l.caixa.y0) > 0.5 * (l.caixa.y1 - l.caixa.y0)) {
        atual.t += " " + l.texto; atual.y1 = Math.max(atual.y1, l.caixa.y1);
      } else { atual = { t: l.texto, y0: l.caixa.y0, y1: l.caixa.y1 }; out.push(atual); }
    }
    return out.map((x) => x.t).join("\n");
  }

  raiz.ComerHojeOCR = { stats: () => ({ ...estado.stats }), carregar, lerTexto, comoTexto, filtroMatricial, redimensionar, recortar, girar180,
                        pronto: () => !!estado.sessoes };
})(typeof globalThis !== "undefined" ? globalThis : this);
