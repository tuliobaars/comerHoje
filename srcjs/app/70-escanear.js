// 70-escanear.js: scanning. Label (expiry date), scale label (weight/price), NFC-e SC receipt
// (QR -> SEFAZ-SC on the server), fridge (cloud vision or quick check).
// Everything is read on the device. The cloud only receives a re-encoded copy without metadata, only
// when the device is unsure (or always/never, per Ajustes) and only in the Shiny app.
(() => {
  const I = (n, c) => CH.icone(n, c);
  const MODOS = [["rotulo", "Rótulo"], ["balanca", "Balança"], ["nota", "Nota SC"], ["geladeira", "Geladeira"]];
  let S = CH.transporte.ler("rascunho", null) || novo("rotulo");
  S.foto = null;                                   // the image never goes into localStorage
  function novo(modo) { return { modo, fase: "inicio", passos: [], leitura: null, produto: {}, balanca: null, nota: null, candidatos: [], textoOcr: "" }; }
  const salvarRascunho = () => { const { foto, ...r } = S; CH.transporte.gravar("rascunho", r.fase === "confirmar" ? r : null); };
  const redesenhar = () => { if (CH.ui.tela === "escanear") CH.ui.render(); salvarRascunho(); };
  const passo = (id, texto, estado = "andando") => {
    const p = S.passos.find((x) => x.id === id);
    if (p) Object.assign(p, { texto, estado }); else S.passos.push({ id, texto, estado });
    redesenhar();
  };

  // ---------- flow ----------
  async function aoEscolher(arquivo) {
    S = { ...novo(S.modo), fase: "lendo" };
    try {
      const f = await CH.foto.abrir(arquivo);
      S.foto = { ...f, url: URL.createObjectURL(arquivo) };
      const removidos = [f.meta.gps && "localização (GPS)", f.meta.aparelho && "modelo do celular", f.meta.data && "data e hora"].filter(Boolean);
      passo("foto", removidos.length ? `Foto aberta no aparelho: ${removidos.join(", ")} não saem daqui` : "Foto aberta no aparelho", "ok");
      if (S.modo === "nota") return lerNota(f);
      if (S.modo === "geladeira") return lerGeladeira(f);
      await lerCodigos(f);
      await lerValidade(f);
      adivinharProduto();
      S.fase = "confirmar";
      redesenhar();
    } catch (e) {
      console.error(e); S.fase = "confirmar"; passo("erro", "Algo falhou: " + e.message + ". Preencha à mão.", "falhou");
    }
  }

  async function lerCodigos(f) {
    passo("codigo", "Procurando código de barras…");
    let cods = [];
    try { cods = await CH.foto.codigos(f.img); } catch (e) { passo("codigo", "Leitor de código de barras indisponível", "pulado"); return; }
    const ean = cods.find((c) => /^EAN|UPC/.test(c.formato));
    if (!ean) { passo("codigo", "Nenhum código de barras legível (tudo bem: pelo texto também dá)", "pulado"); return; }
    aplicarGtin(ean.texto);
  }
  function aplicarGtin(gtin) {
    const bal = CH.core.parseEtiquetaBalanca(gtin);
    if (bal) {
      S.balanca = { ...(S.balanca || {}), total: bal.precoTotal, plu: bal.plu };
      S.produto.preco_total = bal.precoTotal;
      passo("codigo", `Etiqueta de balança ${gtin}: total ${CH.fmt.brl(bal.precoTotal)}`, "ok");
      return;
    }
    S.produto.gtin = gtin;
    const conhecido = (CH.loja.get().produtos || {})[gtin];
    if (conhecido) { Object.assign(S.produto, { ingrediente_id: conhecido.ingrediente_id, descricao: conhecido.descricao, via: "código (já visto)" });
      if (conhecido.qtd_embalagem) S.produto.quantidade = conhecido.qtd_embalagem; }
    passo("codigo", `Código ${gtin}${conhecido ? `: ${CH.esc(CH.dados.nomeIng(conhecido.ingrediente_id))}` : ""}`, "ok");
    if (!conhecido && CH.tr.capacidades.servidor) {
      CH.tr.consulta("produto.gtin", { gtin }, 8000).then((r) => {
        if (r && r.ingrediente_id && !S.produto.ingrediente_id) { Object.assign(S.produto, { ingrediente_id: r.ingrediente_id, descricao: r.descricao, via: r.fonte }); redesenhar(); }
      }).catch(() => {});
    }
  }

  async function lerValidade(f, roi = null) {
    const cfg = CH.loja.get().config, caps = CH.tr.capacidades;
    let r = null;
    if (CH.foto.ocrDisponivel() && cfg.visao !== "sempre") {
      passo("validade", "Preparando a leitura no aparelho…");
      try {
        await CH.foto.carregarOCR((m) => passo("validade", m));
        const temProduto = (txt) => !!S.produto.ingrediente_id || txt.split("\n").some((l) => { const m = CH.dados.casar(l)[0]; return m && m.escore >= 0.7; });
        r = await globalThis.ComerHojeLeitor.lerRotulo(f.img, { hoje: CH.hoje(), roi, temProduto, progresso: (m) => passo("validade", m) });
        S.textoOcr = (r.textos || []).map((t) => t.texto).join("\n");
        S.linhas = r.linhas || [];
      } catch (e) { console.error(e); passo("validade", "Leitura no aparelho falhou: " + e.message, "falhou"); }
    }
    const duvida = !r || !r.validade || r.confianca < 0.8;
    if (caps.visao && cfg.visao !== "nunca" && (cfg.visao === "sempre" || duvida)) {
      passo("nuvem", "Perguntando à IA na nuvem (cópia sem metadados)…");
      try {
        const copia = await CH.foto.copiaLimpa(f.img, 1600);
        const v = await CH.tr.consulta("visao.ler", { modo: S.modo, imagem: copia.base64, hoje: CH.hoje() }, 60000);
        const leituraNuvem = { validade: v.validade || null, confianca: v.validade ? Math.min(0.9, v.confianca || 0.8) : 0, trecho: v.trecho || "IA", peso: 1, fabricacao: v.fabricacao || null };
        r = CH.core.votarDatas([...(r ? [{ ...r, peso: 1 }] : []), leituraNuvem]);
        if (v.produto && !S.produto.ingrediente_id) { const m = CH.dados.casar(v.produto); if (m[0] && m[0].escore >= 0.6) Object.assign(S.produto, { ingrediente_id: m[0].id, via: "IA" }); }
        if (v.quantidade && !S.produto.quantidade) Object.assign(S.produto, { quantidade: v.quantidade, unidade: v.unidade });
        passo("nuvem", v.validade ? `IA: validade ${CH.fmt.data(v.validade)}` : "IA também não achou a data", v.validade ? "ok" : "pulado");
      } catch (e) { passo("nuvem", "IA indisponível: " + e.message, "pulado"); }
    }
    S.leitura = r;
    if (S.modo === "balanca") {
      const b = CH.core.lerBalancaTexto(S.textoOcr);
      S.balanca = { ...(S.balanca || {}), ...Object.fromEntries(Object.entries(b).filter(([, v]) => v != null)) };
      if (!S.balanca.total && b.total) S.produto.preco_total = b.total;
      for (const g of CH.core.gtinsDoTexto(S.textoOcr)) if (!S.produto.preco_total || !S.produto.gtin) aplicarGtin(g);
      if (S.balanca.pesoKg) S.produto.quantidade = S.balanca.pesoKg * 1000;
      else if (S.balanca.total && S.balanca.precoKg) S.produto.quantidade = Math.round((S.balanca.total / S.balanca.precoKg) * 1000);
      S.produto.preco_total = S.produto.preco_total || S.balanca.total || null;
      passo("validade", r && r.pesagem ? `Pesado em ${CH.fmt.data(r.pesagem)}${S.balanca.pesoKg ? ` · ${CH.fmt.enxuto(S.balanca.pesoKg)} kg` : ""}${S.balanca.consistente ? " · preço confere" : ""}` : "Etiqueta lida", "ok");
      return;
    }
    if (r && r.validade) passo("validade", `Validade ${CH.fmt.data(r.validade)}${r.confianca >= 0.8 ? "" : " (confira)"}`, r.confianca >= 0.8 ? "ok" : "aviso");
    else if (!r && !CH.foto.ocrDisponivel() && !caps.visao) passo("validade", "Leitura automática não incluída neste formato: digite a validade", "pulado");
    else passo("validade", "Não achei a validade com segurança: digite ou marque na foto", "aviso");
  }

  // Product from the label text: the LARGEST lines first (names and brands are big type; ingredient
  // lists, full of "cebola, sal, açúcar", are small). Then synonyms learned from earlier confirmations.
  const maiores = () => [...(S.linhas || [])].sort((a, b) => b.altura - a.altura).slice(0, 10).map((l) => l.texto);
  const ehMarca = (t) => { const n = CH.core.normalizarTermo(t); return n.replace(/[^a-z]/g, "").length >= 5 && !/\b(val|validade|lote|fab|peso|total|kcal)\b/.test(n) ? n : null; };
  function adivinharProduto() {
    if (S.produto.ingrediente_id) return;
    const aprendidos = CH.loja.get().aprendidos || {};
    for (const t of maiores()) {
      const m = CH.dados.casar(t)[0];
      if (m && m.escore >= 0.7) { Object.assign(S.produto, { ingrediente_id: m.id, descricao: t.slice(0, 60), via: "texto do rótulo" }); break; }
      const n = ehMarca(t);
      if (n && aprendidos[n]) { Object.assign(S.produto, { ingrediente_id: aprendidos[n], descricao: t.slice(0, 60), via: "rótulo já visto" }); break; }
    }
    if (!S.produto.quantidade) {
      const q = S.textoOcr.match(/(?<![\d,.])(\d{2,4}(?:[,.]\d+)?)\s*(kg|g|ml|l)\b/i) || S.textoOcr.match(/(?<![\d,.])(\d{2,4})\s*g[e℮]/i);
      if (q) { const v = CH.parseNum(q[1]), u = (q[2] || "g").toLowerCase(); S.produto.quantidade = u === "kg" || u === "l" ? v * 1000 : v; }
    }
  }

  // ---------- NFC-e (Santa Catarina) ----------
  async function lerNota(f) {
    passo("qr", "Lendo o QR code da nota…");
    let cods = [];
    try { cods = await CH.foto.codigos(f.img); } catch (e) { /* no reader */ }
    const qr = cods.find((c) => c.formato === "QRCode");
    const info = CH.core.chaveNfce(qr ? qr.texto : "");
    if (!info) { S.fase = "nota"; passo("qr", "QR code não encontrado. Fotografe só o QR, bem de perto.", "falhou"); return; }
    S.nota = { url: qr.texto, ...info, itens: null };
    passo("qr", `NFC-e ${info.uf === "SC" ? "de Santa Catarina" : "de " + info.uf} · nº ${info.numero} · ${info.aamm.slice(2)}/20${info.aamm.slice(0, 2)}${info.valida ? "" : " · chave com dígito inválido"}`, info.valida ? "ok" : "aviso");
    S.fase = "nota";
    if (CH.tr.capacidades.nfce) {
      passo("sefaz", "Buscando os itens na SEFAZ-SC…");
      try {
        const r = await CH.tr.consulta("nfce.consultar", { url: qr.texto }, 30000);
        S.nota.itens = (r.itens || []).map((it) => { const m = CH.dados.casar(it.descricao)[0];
          return { ...it, ingrediente_id: m && m.escore >= 0.6 ? m.id : null, incluir: !!(m && m.escore >= 0.6) }; });
        passo("sefaz", `${S.nota.itens.length} itens encontrados${r.emitente ? " · " + CH.esc(r.emitente) : ""}`, "ok");
      } catch (e) { passo("sefaz", "SEFAZ-SC não respondeu: " + e.message, "falhou"); }
    }
    redesenhar();
  }

  // ---------- fridge ----------
  async function lerGeladeira(f) {
    S.fase = "geladeira";
    if (CH.tr.capacidades.visao && CH.loja.get().config.visao !== "nunca") {
      passo("nuvem", "Identificando itens com a IA (cópia sem metadados)…");
      try {
        const copia = await CH.foto.copiaLimpa(f.img, 1280);
        const v = await CH.tr.consulta("visao.ler", { modo: "geladeira", imagem: copia.base64, hoje: CH.hoje() }, 90000);
        S.candidatos = (v.itens || []).map((it) => { const m = CH.dados.casar(it.nome)[0];
          return { ...it, ingrediente_id: m && m.escore >= 0.6 ? m.id : null, incluir: it.tipo === "alimento" && !!(m && m.escore >= 0.6) }; });
        passo("nuvem", `${S.candidatos.length} itens vistos na foto`, "ok");
      } catch (e) { passo("nuvem", "IA indisponível: " + e.message, "pulado"); }
    } else passo("conf", "Conferência rápida: confirme o que ainda está na geladeira", "ok");
    redesenhar();
  }

  // ---------- rendering ----------
  function etapas() {
    return `<ol class="ch-passos" aria-live="polite">${S.passos.map((p) => `<li class="ch-passo ch-passo--${p.estado}">${I(
      { ok: "circle-check", falhou: "circle-x", pulado: "circle-minus", aviso: "circle-alert", andando: "loader" }[p.estado] || "circle", p.estado === "andando" ? "ch-gira" : "")}<span>${p.texto}</span></li>`).join("")}</ol>`;
  }
  function confirmar() {
    const p = S.produto, r = S.leitura || {}, g = p.ingrediente_id ? CH.dados.ing(p.ingrediente_id) : null;
    const conf = r.confianca || 0, faixa = !r.validade ? "sem" : conf >= 0.8 ? "ok" : "atencao";
    const alternativas = (r.alternativas || []).filter(Boolean);
    const unidade = p.unidade && g && CH.dados.unidadesPara(g.id).includes(p.unidade) ? p.unidade : g ? g.unidade_base : "g";
    return `<form class="ch-form ch-confirmar" data-form="scan">
      ${S.foto ? `<figure class="ch-foto"><img src="${S.foto.url}" alt="Foto escaneada"><button class="ch-botao ch-botao--pequeno" data-acao="marcar-data" type="button">${I("crop")} Marcar a data na foto</button></figure>` : ""}
      <div class="ch-confirmar-campos">
        <label class="ch-campo ch-autocompletar"><span class="ch-rotulo">Produto ${p.via ? `<small class="ch-suave">· pelo ${CH.esc(p.via)}</small>` : ""}</span>
          <input class="ch-entrada" name="item" value="${CH.esc(g ? g.nome : "")}" placeholder="ex.: molho de tomate" autocomplete="off" ${g ? "" : "autofocus"}>
          <input type="hidden" name="ingrediente_id" value="${CH.esc(p.ingrediente_id || "")}"><div class="ch-sugestoes" role="listbox" hidden></div></label>
        <div class="ch-linha">
          <label class="ch-campo"><span class="ch-rotulo">Quantidade</span><input class="ch-entrada" name="quantidade" inputmode="decimal" value="${p.quantidade != null ? CH.esc(CH.fmt.enxuto(p.quantidade)) : ""}"></label>
          <label class="ch-campo"><span class="ch-rotulo">Unidade</span><select class="ch-entrada" name="unidade">${(g ? CH.dados.unidadesPara(g.id) : ["g", "kg", "ml", "l", "un"]).map((u) => `<option ${u === unidade ? "selected" : ""}>${u}</option>`).join("")}</select></label>
        </div>
        <label class="ch-campo"><span class="ch-rotulo">Validade ${r.validade ? CH.ui.chip(faixa, conf >= 0.8 ? "lida no rótulo" : "confira") : ""}</span>
          <input class="ch-entrada ch-entrada--data" name="validade" type="date" value="${r.validade || ""}" ${r.validade ? "" : "autofocus"}>
          ${r.trecho ? `<span class="ch-ajuda">lido: <span class="ch-mono">${CH.esc(r.trecho)}</span>${r.votos > 1 ? ` · ${r.votos} leituras concordam` : ""}</span>` : ""}
          ${alternativas.length ? `<span class="ch-ajuda">Ou seria: ${alternativas.map((d) => `<button class="ch-chip ch-chip--acento" type="button" data-acao="usar-data" data-data="${d}">${CH.fmt.data(d)}</button>`).join(" ")}</span>` : ""}
          ${r.fabricacao ? `<span class="ch-ajuda">fabricação ${CH.fmt.data(r.fabricacao)}</span>` : ""}${r.pesagem ? `<span class="ch-ajuda">pesado em ${CH.fmt.data(r.pesagem)}: a validade vem da embalagem ou do catálogo</span>` : ""}</label>
        <div class="ch-campo"><span class="ch-rotulo">Local</span>${CH.ui.seg("scan-local", [["geladeira", "Geladeira"], ["freezer", "Freezer"], ["despensa", "Despensa"], ["fruteira", "Fruteira"]], p.local || (g && g.armazenamento) || "geladeira", "Local")}
          <input type="hidden" name="local" value="${p.local || (g && g.armazenamento) || "geladeira"}"></div>
        <div class="ch-linha">
          <label class="ch-campo"><span class="ch-rotulo">Preço (R$)</span><input class="ch-entrada" name="preco" inputmode="decimal" value="${p.preco_total != null ? CH.fmt.num(p.preco_total, 2) : ""}"></label>
          <label class="ch-check ch-check--campo"><input type="checkbox" name="aberto"><span>Já está aberto</span></label>
        </div>
        <div class="ch-botoes"><button class="ch-botao ch-botao--primario ch-botao--grande">${I("check")} Salvar no estoque</button>
          <button class="ch-botao ch-botao--fantasma" data-acao="scan-cancelar" type="button">Descartar leitura</button></div>
      </div></form>`;
  }
  function nota() {
    const n = S.nota;
    if (!n) return `<div class="ch-botoes"><button class="ch-botao" data-acao="scan-cancelar" type="button">Tentar de novo</button></div>`;
    const itens = n.itens || [];
    return `${itens.length ? `<ul class="ch-lista">${itens.map((it, i) => `<li class="ch-compra"><label class="ch-check"><input type="checkbox" data-nota-item="${i}" ${it.incluir ? "checked" : ""}>
        <span>${CH.esc(it.descricao)} <small class="ch-suave">${it.ingrediente_id ? "→ " + CH.esc(CH.dados.nomeIng(it.ingrediente_id)) : "sem correspondência"}</small></span></label>
        <span class="ch-num ch-suave">${CH.fmt.enxuto(it.quantidade)} ${CH.esc(it.unidade || "")} · ${CH.fmt.brl(it.valor)}</span></li>`).join("")}</ul>
        <button class="ch-botao ch-botao--primario" data-acao="nota-salvar" type="button">Adicionar ${itens.filter((x) => x.incluir).length} itens ao estoque</button>`
      : `<p class="ch-suave">${CH.tr.capacidades.nfce ? "Sem itens." : "A consulta à SEFAZ-SC é feita pelo app no servidor (Shiny). Aqui você pode abrir a nota e adicionar os itens à mão."}</p>
         <div class="ch-botoes"><a class="ch-botao" href="${CH.esc(n.url.startsWith("http") ? n.url : "https://sat.sef.sc.gov.br/nfce/consulta?p=" + n.chave)}" target="_blank" rel="noopener noreferrer">${I("external-link")} Abrir a nota (SEFAZ-SC)</a>
         <button class="ch-botao ch-botao--fantasma" data-acao="novo-lote" type="button">${I("plus")} Adicionar item</button></div>`}
      <p class="ch-suave ch-legenda">Chave <span class="ch-mono">${n.chave.replace(/(\d{4})/g, "$1 ").trim()}</span></p>`;
  }
  function geladeira() {
    const noFrio = CH.loja.lotesAtivos().filter((l) => l.local === "geladeira");
    const cand = S.candidatos.length ? `<h3 class="ch-sobrancelha">Vistos na foto</h3><ul class="ch-lista">${S.candidatos.map((c, i) => `<li class="ch-compra"><label class="ch-check">
        <input type="checkbox" data-cand="${i}" ${c.incluir ? "checked" : ""}><span>${CH.esc(c.nome)} ${c.tipo === "recipiente_com_comida_provavel" ? `<small class="ch-suave">(sobra?)</small>` : ""}</span></label>
        <span class="ch-suave">${c.ingrediente_id ? CH.esc(CH.dados.nomeIng(c.ingrediente_id)) : ""}</span></li>`).join("")}</ul>
        <button class="ch-botao ch-botao--primario" data-acao="cand-salvar" type="button">Adicionar os marcados</button>` : "";
    return `${cand}<h3 class="ch-sobrancelha">No estoque como “geladeira”</h3>
      ${noFrio.length ? `<ul class="ch-lista">${noFrio.map((l) => `<li class="ch-compra"><span>${CH.esc(l.ing.nome)} <small class="ch-suave">${CH.fmt.qtd(l.quantidade, l.ing.unidade_base, l.ingrediente_id)}</small></span>
        <span class="ch-botoes-mini"><button class="ch-botao ch-botao--pequeno" data-acao="conf-tem" data-id="${l.id}" type="button" aria-label="Ainda tem">${I("check")}</button>
        <button class="ch-botao ch-botao--pequeno ch-botao--fantasma" data-acao="conf-acabou" data-id="${l.id}" type="button" aria-label="Acabou">${I("x")} acabou</button></span></li>`).join("")}</ul>`
        : `<p class="ch-suave">Nada registrado na geladeira.</p>`}`;
  }

  CH.telas.escanear = {
    titulo: "Escanear",
    render() {
      const lumen = CH.ap.framework === "lumen";
      const ajuda = { rotulo: "Fotografe a embalagem com a validade visível. Não precisa recortar.", balanca: "Fotografe a etiqueta do açougue, padaria ou hortifrúti.",
        nota: "Fotografe o QR code da nota fiscal (NFC-e) de Santa Catarina.", geladeira: "Fotografe a geladeira aberta para conferir o que ainda tem." }[S.modo];
      const captura = `<div class="ch-captura${S.fase !== "inicio" ? " ch-captura--compacta" : ""}">
          <label class="ch-botao ch-botao--primario ch-botao--grande">${I("camera")} ${S.fase === "inicio" ? "Tirar foto" : "Outra foto"}<input type="file" accept="image/*" capture="environment" data-foto hidden></label>
          <label class="ch-botao ch-botao--fantasma ch-botao--grande">${I("image")} Galeria<input type="file" accept="image/*" data-foto hidden></label></div>`;
      const corpo = S.fase === "inicio" ? `<p class="ch-lede ch-lede--pequena">${ajuda}</p>${captura}
          <p class="ch-nota">${I("shield-check")} A foto é lida neste aparelho. GPS, modelo do celular e data da foto não são enviados nem guardados.</p>`
        : `${etapas()}${S.fase === "lendo" ? "" : S.fase === "confirmar" ? confirmar() : S.fase === "nota" ? nota() : geladeira()}${S.fase === "lendo" ? "" : captura}`;
      return `${lumen && S.fase === "inicio" ? `<section class="ch-hero ch-hero--pequeno"><h1 class="ch-display ch-display--m">Escaneie, <span class="ch-grad">confira, pronto.</span></h1></section>`
          : `<header class="ch-tela-topo"><div><p class="ch-sobrancelha">Escanear</p><h1 class="ch-titulo">${({ rotulo: "Validade do rótulo", balanca: "Etiqueta de balança", nota: "Nota fiscal (NFC-e SC)", geladeira: "Geladeira" })[S.modo]}</h1></div></header>`}
        ${CH.ui.seg("scan-modo", MODOS, S.modo, "Tipo de foto")}
        <div class="ch-cartao ch-cartao--scan">${corpo}</div>`;
    },
  };

  // ---------- events ----------
  CH.bus.on("change", (e) => {
    if (e.target.hasAttribute && e.target.hasAttribute("data-foto") && e.target.files[0]) aoEscolher(e.target.files[0]);
    if (e.target.dataset && e.target.dataset.notaItem != null) S.nota.itens[+e.target.dataset.notaItem].incluir = e.target.checked;
    if (e.target.dataset && e.target.dataset.cand != null) S.candidatos[+e.target.dataset.cand].incluir = e.target.checked;
  });
  CH.bus.on("seg", ({ nome, valor, el }) => {
    if (nome === "scan-modo") { S = novo(valor); redesenhar(); }
    if (nome === "scan-local") { const f = el.closest("form"); f.local.value = valor; CH.$$("[data-nome='scan-local']", f).forEach((b) => b.setAttribute("aria-checked", b.dataset.valor === valor)); S.produto.local = valor; }
  });
  CH.ui.registrar("scan-cancelar", () => { S = novo(S.modo); redesenhar(); });
  CH.ui.registrar("usar-data", (el) => { const f = el.closest("form"); f.validade.value = el.dataset.data; });
  CH.ui.registrar("conf-tem", (el) => { el.closest("li").classList.add("ch-compra--ok"); });
  CH.ui.registrar("conf-acabou", (el) => {
    const l = CH.loja.lotesAtivos().find((x) => x.id === el.dataset.id);
    if (l) CH.tr.op("lote.baixar", { id: l.id, quantidade: l.quantidade, tipo: "consumo", validade_efetiva: l.validade_efetiva });
  });
  CH.bus.on("submit", (e) => {
    const f = e.target; if (f.dataset.form !== "scan") return;
    let ingId = f.ingrediente_id.value;
    if (!ingId) { const m = CH.dados.casar(f.item.value); if (m[0] && m[0].escore >= 0.6) ingId = m[0].id; }
    if (!ingId) return CH.ui.aviso("Escolha o produto na lista.", "erro");
    const q = CH.parseNum(f.quantidade.value) || 1;
    let base; try { base = CH.dados.paraBase(q, f.unidade.value, ingId); } catch (err) { return CH.ui.aviso(err.message, "erro"); }
    const lote = { id: CH.uuid(), ingrediente_id: ingId, descricao: S.produto.descricao || CH.dados.nomeIng(ingId), quantidade: base, local: f.local.value,
      validade: f.validade.value || null, validade_origem: f.validade.value ? (S.leitura && S.leitura.validade === f.validade.value ? "rotulo" : "usuario") : "estimada",
      data_compra: CH.hoje(), aberto_em: f.aberto.checked ? CH.hoje() : null, preco_total: CH.parseNum(f.preco.value),
      gtin: S.produto.gtin || null, origem: S.modo === "balanca" ? "scan_balanca" : "scan_rotulo" };
    CH.tr.op("lote.salvar", { lote });
    if (S.produto.gtin) CH.tr.op("produto.salvar", { gtin: S.produto.gtin, ingrediente_id: ingId, descricao: lote.descricao, qtd_embalagem: base });
    const marca = maiores().map(ehMarca).find(Boolean);          // learn: next time this label is recognised
    if (marca && (CH.loja.get().aprendidos || {})[marca] !== ingId && !(CH.dados.casar(marca)[0] || {}).id) CH.tr.op("sinonimo.aprender", { termo: marca, ingrediente_id: ingId });
    CH.ui.aviso(`${CH.esc(CH.dados.nomeIng(ingId))} salvo${lote.validade ? `: vale até ${CH.fmt.data(lote.validade)}` : ""}.`, "ok");
    S = novo(S.modo); redesenhar();
  });
  CH.ui.registrar("nota-salvar", () => {
    let n = 0;
    for (const it of S.nota.itens.filter((x) => x.incluir && x.ingrediente_id)) {
      const g = CH.dados.ing(it.ingrediente_id);
      let base = it.quantidade;
      try { base = CH.dados.paraBase(it.quantidade, (it.unidade || "").toLowerCase() === "kg" ? "kg" : g.unidade_base === "un" ? "un" : g.unidade_base, g.id); } catch (e) { /* keep */ }
      if ((it.unidade || "").toUpperCase() === "UN" && g.unidade_base !== "un") base = it.quantidade * (CH.dados.idx.conv[`${g.id}|un`] || 1);
      CH.tr.op("lote.salvar", { lote: { id: CH.uuid(), ingrediente_id: g.id, descricao: it.descricao, quantidade: base, local: g.armazenamento, validade: null,
        validade_origem: "estimada", data_compra: CH.hoje(), preco_total: it.valor, origem: "nfce" } });
      n++;
    }
    CH.ui.aviso(`${n} itens da nota no estoque (validade estimada). Escaneie os rótulos dos que importam.`, "ok", 5200);
    S = novo("nota"); redesenhar();
  });
  CH.ui.registrar("cand-salvar", () => {
    for (const c of S.candidatos.filter((x) => x.incluir && x.ingrediente_id)) {
      const g = CH.dados.ing(c.ingrediente_id);
      CH.tr.op("lote.salvar", { lote: { id: CH.uuid(), ingrediente_id: g.id, descricao: c.nome, quantidade: c.quantidade_estimada || (g.unidade_base === "un" ? 1 : 500),
        local: "geladeira", validade: null, validade_origem: "estimada", data_compra: CH.hoje(), origem: "visao" } });
    }
    CH.ui.aviso("Itens adicionados com validade estimada.", "ok"); S = novo("geladeira"); redesenhar();
  });

  // ---------- manual crop (ROI) ----------
  CH.ui.registrar("marcar-data", () => {
    if (!S.foto) return;
    const folha = CH.ui.folha("Marque onde está a validade", `<div class="ch-recorte"><img src="${S.foto.url}" alt="" draggable="false"><div class="ch-recorte-caixa" tabindex="0"></div></div>
      <p class="ch-suave">Arraste sobre a data (ex.: “Val.: 29 06 2027”).</p>
      <button class="ch-botao ch-botao--primario ch-botao--bloco" data-acao="ler-recorte" type="button">Ler esta área</button>`, { largura: "larga" });
    const area = CH.$(".ch-recorte", folha), caixa = CH.$(".ch-recorte-caixa", folha);
    let ini = null, roi = { x: 0.2, y: 0.4, w: 0.6, h: 0.15 };
    const pos = () => Object.assign(caixa.style, { left: roi.x * 100 + "%", top: roi.y * 100 + "%", width: roi.w * 100 + "%", height: roi.h * 100 + "%" });
    pos();
    area.addEventListener("pointerdown", (e) => { const r = area.getBoundingClientRect(); ini = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; area.setPointerCapture(e.pointerId); });
    area.addEventListener("pointermove", (e) => { if (!ini) return; const r = area.getBoundingClientRect(); const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      roi = { x: Math.min(ini.x, x), y: Math.min(ini.y, y), w: Math.max(0.02, Math.abs(x - ini.x)), h: Math.max(0.02, Math.abs(y - ini.y)) }; pos(); });
    area.addEventListener("pointerup", () => { ini = null; });
    CH.ui.registrar("ler-recorte", async () => {
      CH.ui.fecharFolha(); S.fase = "lendo"; redesenhar();
      await lerValidade(S.foto, roi); S.fase = "confirmar"; redesenhar();
    });
  });
})();
