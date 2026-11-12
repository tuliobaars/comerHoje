// leitor-rotulo.js: finds the expiry date on a label photo without manual cropping.
//   A. overview (1600 px): reads the whole label; often done here (panceta, nhoque).
//   B. zoom on every "VAL / VALIDADE / VENC…" anchor at full resolution, with dot-matrix
//      filter variants (leite: the date sits on the line below "VAL/LOTE").
//   C. if there is still no good date: dot-matrix filter on the whole photo (molho: ink-jet on foil).
//   D. user crop (optional): same variants on the region the user marked.
// The readings of every variant are combined by ComerHojeCore.votarDatas (agreement = confidence).
"use strict";
(function (raiz) {
  const ANCORA = /\b(VAL|VALIDADE|VALID|V[BRE8]L|VAI|VENC|VENCIMENTO|CONSUMIR|EXP|BEST)\b|\bVAL\s*[JIL1|/\\]?\s*LOTE/;
  const agora = () => (raiz.performance ? performance.now() : Date.now());

  // Limits the source so iOS canvases (max ~16.7 Mpx) never overflow: 24 Mpx photos are reduced.
  function fonteSegura(img, ladoMax = 3200) {
    const s = Math.min(1, ladoMax / Math.max(img.width, img.height));
    return raiz.ComerHojeOCR.redimensionar(img, img.width * s, img.height * s);
  }

  async function lerRotulo(imagem, { hoje, progresso = () => {}, roi = null, cedo = 0.85,
                                     ladoVisao = 1600, ladoDet = 1280, ladoPontilhado = 1600, ks = [7, 5],
                                     temProduto = null, extras = 15 } = {}) {
    const OCR = raiz.ComerHojeOCR, C = raiz.ComerHojeCore;
    let linhasVisao = [];
    const t0 = agora(), passos = [], leituras = [], textos = [];
    const fonte = fonteSegura(imagem);
    const anotar = (passo, texto, peso, extra = {}) => {
      const r = { ...C.extrairDatas(texto, hoje), peso };
      leituras.push(r); textos.push({ passo, texto }); passos.push({ passo, validade: r.validade, conf: r.confianca, ms: Math.round(agora() - t0), ...extra });
      return r;
    };
    // enough: a confident reading with separators, or two full-resolution readings that agree
    const bom = () => { const v = C.votarDatas(leituras);
      return v.validade && !v.conflito && (v.confianca >= cedo || v.fieis >= 2) ? v : null; };
    const temData = () => leituras.some((l) => l.validade && l.confianca >= 0.5);
    // early stop inside one OCR pass: this pass alone already has an anchored, confident date
    // after the date, up to `extras` more boxes (the largest first) when the product name is still missing
    let alem = null;
    const parar = (linhas) => {
      const txt = OCR.comoTexto(linhas);
      if (alem === null) { const r = C.extrairDatas(txt, hoje); if (!(r.validade && r.confianca >= 0.8)) return false; alem = 0; }
      if (!temProduto || temProduto(txt)) return true;
      return ++alem > extras;
    };

    if (roi) {                                                     // D (when the user already marked it)
      progresso("Lendo a área marcada…");
      const W = fonte.width, H = fonte.height;
      const reg = OCR.recortar(fonte, roi.x * W, roi.y * H, (roi.x + roi.w) * W, (roi.y + roi.h) * H);
      for (const v of variantes(reg, reg.height / 3)) {
        if (v.filtro && temData()) break;
        anotar("recorte:" + v.nome, OCR.comoTexto(await OCR.lerTexto(v.canvas, { parar })), v.peso);
        if (bom()) break;
      }
      return concluir();
    }

    progresso("Procurando a validade…");                           // A
    const sv = Math.min(1, ladoVisao / Math.max(fonte.width, fonte.height));
    const visao = OCR.redimensionar(fonte, fonte.width * sv, fonte.height * sv);
    alem = null;
    const linhasA = await OCR.lerTexto(visao, { ladoDet, parar });
    anotar("visao", OCR.comoTexto(linhasA), 0.7, { linhas: linhasA.length });
    linhasVisao = linhasA.map((l) => ({ texto: l.texto, altura: l.caixa.y1 - l.caixa.y0 }));
    if (bom()) return concluir();

    const esc = fonte.width / visao.width;                         // B
    const ancoras = linhasA.filter((l) => ANCORA.test(C.normalizarOcr(l.texto)) && !/\bVALOR\b/.test(C.normalizarOcr(l.texto)));
    for (const a of ancoras.slice(0, 3)) {
      progresso("Ampliando perto de “" + a.texto.slice(0, 12) + "”…");
      const h = (a.caixa.y1 - a.caixa.y0) * esc;
      const x0 = a.caixa.x0 * esc - 1.5 * h, x1 = Math.max(a.caixa.x1 * esc, a.caixa.x0 * esc + 14 * h);
      const y0 = a.caixa.y0 * esc - 1.2 * h, y1 = a.caixa.y1 * esc + 3.5 * h;
      const reg = OCR.recortar(fonte, Math.max(0, x0), Math.max(0, y0), Math.min(fonte.width, x1), Math.min(fonte.height, y1));
      const antes = leituras.length;
      for (const v of variantes(reg, h)) {
        if (v.filtro && leituras.slice(antes).some((l) => l.validade)) break;   // filters only if unfiltered failed
        anotar("ancora:" + v.nome, OCR.comoTexto(await OCR.lerTexto(v.canvas, { parar })), v.peso);
        if (bom()) return concluir();
      }
    }

    if (temData()) return concluir();                              // C only when nothing was read
    progresso("Tentando impressão pontilhada…");
    const sp = Math.min(1, ladoPontilhado / Math.max(fonte.width, fonte.height));
    const grande = OCR.redimensionar(fonte, fonte.width * sp, fonte.height * sp);
    for (const k of ks) {
      anotar("pontilhado:k" + k, OCR.comoTexto(await OCR.lerTexto(OCR.filtroMatricial(grande, k), { ladoDet: ladoPontilhado, parar })), 0.6);
      if (bom()) return concluir();
    }
    return concluir();

    function concluir() {
      const v = C.votarDatas(leituras);
      return { ...v, passos, textos, linhas: linhasVisao, ms: Math.round(agora() - t0) };
    }
  }

  // Image variants for a region whose text height is ~h px: original plus dot-matrix filters sized to the print.
  function variantes(reg, h) {
    const OCR = raiz.ComerHojeOCR;
    const k1 = Math.max(3, (Math.round(h * 0.10) | 1)), k2 = Math.max(5, (Math.round(h * 0.18) | 1));
    const amp = OCR.redimensionar(reg, reg.width * 1.5, reg.height * 1.5);
    return [{ nome: "original", canvas: reg, peso: 1 },
            { nome: "ampliado", canvas: amp, peso: 1 },
            { nome: "pontilhado" + k1, canvas: OCR.filtroMatricial(reg, k1), peso: 0.6, filtro: true },
            { nome: "pontilhado" + k2, canvas: OCR.filtroMatricial(reg, k2), peso: 0.6, filtro: true }];
  }

  raiz.ComerHojeLeitor = { lerRotulo };
})(typeof globalThis !== "undefined" ? globalThis : this);
