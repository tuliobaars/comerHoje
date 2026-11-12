// 40-foto.js: photo intake, all on the device:
//   1. decodes the file with its EXIF orientation applied (upright pixels);
//   2. reports which sensitive metadata the original carried (GPS, device, date) so the UI can say
//      what was removed;
//   3. any copy that leaves the device (server, cloud) is RE-ENCODED from pixels on a canvas, so it
//      carries no metadata at all (no Exif, GPS, XMP, maker notes), reduced to <= 2048 px;
//   4. barcodes (ZXing WASM) and date OCR (PaddleOCR ONNX) run locally, loaded on demand.
CH.foto = (() => {
  const rec = () => CH.recursos || {};

  async function abrir(arquivo) {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const meta = metadadosJpeg(bytes);
    let img;
    try { img = await createImageBitmap(arquivo, { imageOrientation: "from-image" }); }
    catch (e) {                                   // old Safari: <img> also applies the orientation
      const url = URL.createObjectURL(arquivo);
      img = new Image(); img.src = url; await img.decode(); URL.revokeObjectURL(url);
    }
    return { img, largura: img.width, altura: img.height, bytes: bytes.length, meta, nome: arquivo.name || "foto.jpg" };
  }

  // Minimal Exif reader: only reports what exists (never sends or stores it).
  function metadadosJpeg(b) {
    const out = { exif: false, gps: false, aparelho: false, data: false };
    if (b[0] !== 0xff || b[1] !== 0xd8) return out;
    let i = 2;
    while (i + 4 < b.length && b[i] === 0xff) {
      const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (m === 0xda) break;
      if (m === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
        out.exif = true;
        const t = i + 10, le = b[t] === 0x49;
        const u16 = (p) => (le ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]);
        const u32 = (p) => (le ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16)) + b[p + 3] * 16777216 : b[p] * 16777216 + ((b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]));
        const ifd = t + u32(t + 4), n = u16(ifd);
        for (let k = 0; k < n; k++) {
          const tag = u16(ifd + 2 + k * 12);
          if (tag === 0x8825) out.gps = true;
          if (tag === 0x010f || tag === 0x0110) out.aparelho = true;
          if (tag === 0x0132) out.data = true;
        }
      }
      i += 2 + len;
    }
    return out;
  }

  // Re-encoded copy (no metadata) for the server / cloud. Returns a Blob and its base64.
  async function copiaLimpa(img, ladoMax = 2048, qualidade = 0.85) {
    const s = Math.min(1, ladoMax / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", qualidade));
    const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(blob); });
    return { blob, base64: b64, largura: c.width, altura: c.height, bytes: blob.size };
  }

  // ---------- barcodes ----------
  let zxPronto = null;
  function prepararZxing() {
    if (zxPronto) return zxPronto;
    const Z = globalThis.ZXingWASM;
    if (!Z) return (zxPronto = Promise.reject(new Error("leitor de código de barras indisponível")));
    const r = rec();
    const overrides = r.zxingWasmB64 ? { wasmBinary: Uint8Array.from(atob(r.zxingWasmB64), (ch) => ch.charCodeAt(0)).buffer }
                                     : { locateFile: (p) => (r.zxing || "zxing/") + p };
    zxPronto = Z.prepareZXingModule({ overrides, fireImmediately: true });
    return zxPronto;
  }
  async function codigos(img, ladoMax = 2048) {
    await prepararZxing();
    const s = Math.min(1, ladoMax / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, c.width, c.height);
    const res = await globalThis.ZXingWASM.readBarcodes(g.getImageData(0, 0, c.width, c.height),
      { tryHarder: true, tryRotate: true, maxNumberOfSymbols: 4, formats: ["EAN13", "EAN8", "UPCA", "QRCode"] });
    return res.filter((r) => r.isValid && r.text).map((r) => ({ formato: r.format, texto: r.text }));
  }

  // ---------- date OCR (lazy: ~30 MB once, then browser cache) ----------
  let ocrPronto = null;
  const carregarScript = (src) => new Promise((ok, falha) => {
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => falha(new Error("falhou: " + src));
    document.head.appendChild(s);
  });
  function ocrDisponivel() { const r = rec(); return !!(r.ocr || r.ocrEmbutido); }
  function carregarOCR(progresso = () => {}) {
    if (ocrPronto) return ocrPronto;
    const r = rec();
    ocrPronto = (async () => {
      if (r.ocrEmbutido) {                        // standalone HTML with embedded OCR: base64 -> Blob URLs
        const blob = (k, tipo) => URL.createObjectURL(new Blob([Uint8Array.from(atob(r.ocrEmbutido[k]), (ch) => ch.charCodeAt(0))], { type: tipo }));
        if (!globalThis.ort) await carregarScript(blob("ortjs", "text/javascript"));
        progresso("Preparando a leitura…");
        await CH.ocr.carregar("", { fontes: { mjs: blob("ortmjs", "text/javascript"), wasm: blob("ortwasm", "application/wasm"),
          det: blob("det", "application/octet-stream"), rec: blob("rec", "application/octet-stream"),
          cls: blob("cls", "application/octet-stream"), chaves: atob(r.ocrEmbutido.chaves) } });
        return true;
      }
      if (!globalThis.ort) await carregarScript(r.ocr + "ort/ort.wasm.min.js");
      progresso("Baixando o leitor de validade (só na primeira vez)…");
      await CH.ocr.carregar(r.ocr);
      return true;
    })();
    ocrPronto.catch(() => { ocrPronto = null; });
    return ocrPronto;
  }

  return { abrir, metadadosJpeg, copiaLimpa, codigos, ocrDisponivel, carregarOCR };
})();
CH.ocr = globalThis.ComerHojeOCR;
