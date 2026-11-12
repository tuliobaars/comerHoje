// 64-ajustes.js: settings (appearance: Lumen | Neue, theme, density; date reading; Google Sheet;
// household; data; privacy; delivery format).
(() => {
  const I = (n, c) => CH.icone(n, c);
  CH.telas.ajustes = {
    titulo: "Ajustes",
    render() {
      const ap = CH.ap, cfg = CH.loja.get().config, caps = CH.tr.capacidades, local = CH.transporte.ler("planilha", {});
      const ocr = CH.foto.ocrDisponivel();
      return `<header class="ch-tela-topo"><div><p class="ch-sobrancelha">comerHoje</p><h1 class="ch-titulo">Ajustes</h1></div></header>
      <div class="ch-grade ch-grade--ajustes">
        <article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Aparência</h2></header>
          <div class="ch-campo"><span class="ch-rotulo">Estilo (Taiga design system): experimente os dois</span>
            ${CH.ui.seg("framework", [["lumen", "Lumen"], ["neue", "Neue"]], ap.framework, "Estilo")}
            <span class="ch-ajuda">${ap.framework === "lumen" ? "Lumen: cinematográfico, vidro e luz ambiente. Feito para o celular." : "Neue: denso e calmo, números em fonte mono, atalhos de teclado. Feito para trabalhar."}</span></div>
          <div class="ch-campo"><span class="ch-rotulo">Tema</span>${CH.ui.seg("tema", [["claro", "Claro"], ["escuro", "Escuro"], ["auto", "Automático"]], ap.tema, "Tema")}</div>
          ${ap.framework === "lumen" ? `<div class="ch-campo"><span class="ch-rotulo">Luz ambiente</span>${CH.ui.seg("ambiente", [["on", "Ligada"], ["off", "Desligada"]], ap.ambiente, "Luz ambiente")}</div>` : `
          <div class="ch-campo"><span class="ch-rotulo">Tamanho do texto</span>${CH.ui.seg("texto", [["s", "P"], ["m", "M"], ["l", "G"], ["xl", "GG"]], ap.texto, "Tamanho do texto")}</div>
          <div class="ch-campo"><span class="ch-rotulo">Densidade</span>${CH.ui.seg("densidade", [["compact", "Compacta"], ["comfortable", "Confortável"], ["roomy", "Ampla"]], ap.densidade, "Densidade")}</div>
          <div class="ch-campo"><span class="ch-rotulo">Contraste</span>${CH.ui.seg("contraste", [["standard", "Padrão"], ["high", "Alto"]], ap.contraste, "Contraste")}</div>
          <div class="ch-campo"><span class="ch-rotulo">Fundo</span>${CH.ui.seg("fundo", [["dots", "Pontos"], ["plain", "Liso"]], ap.fundo, "Fundo")}</div>`}
        </article>

        <article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Leitura da validade</h2></header>
          <ul class="ch-lista ch-lista--simples">
            <li><span>${I("smartphone")} No aparelho (grátis, a foto não sai do celular)</span><span>${ocr ? CH.ui.chip("ok", "disponível") : CH.ui.chip("sem", "não incluída")}</span></li>
            <li><span>${I("sparkles")} IA na nuvem (quando o aparelho não tiver certeza)</span><span>${caps.visao ? CH.ui.chip("ok", "configurada") : CH.ui.chip("sem", caps.servidor ? "sem chave no servidor" : "só no app Shiny")}</span></li>
            <li><span>${I("scan-barcode")} Código de barras e etiqueta de balança</span><span>${CH.ui.chip("ok", "no aparelho")}</span></li>
            <li><span>${I("receipt")} Nota fiscal (NFC-e) de Santa Catarina</span><span>${caps.nfce ? CH.ui.chip("ok", "SEFAZ-SC") : CH.ui.chip("sem", "só no app Shiny")}</span></li>
          </ul>
          <div class="ch-campo"><span class="ch-rotulo">Quando usar a IA na nuvem</span>${CH.ui.seg("visao", [["duvida", "Só na dúvida"], ["sempre", "Sempre"], ["nunca", "Nunca"]], cfg.visao || "duvida", "Quando usar a IA")}</div>
        </article>

        <article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Planilha Google</h2>
            ${cfg.ultima_sync ? CH.ui.chip("ok", "sincronizada " + CH.fmt.hora(cfg.ultima_sync)) : ""}</header>
          ${caps.sync === "servidor" ? `<p class="ch-suave">Configurada no servidor (${caps.planilha ? `<span class="ch-mono">${CH.esc(caps.planilha)}</span>` : "sem planilha definida"}). Alterações são enviadas sozinhas.</p>
              <button class="ch-botao" data-acao="sync" type="button" ${caps.planilha ? "" : "disabled"}>${I("refresh-cw")} Sincronizar agora</button>`
          : `<form class="ch-form" data-form="planilha">
              <label class="ch-campo"><span class="ch-rotulo">Endereço do Apps Script (leitura e gravação)</span><input class="ch-entrada" name="url" type="url" value="${CH.esc(local.url || "")}" placeholder="https://script.google.com/macros/s/…/exec"></label>
              <label class="ch-campo"><span class="ch-rotulo">Senha do script</span><input class="ch-entrada" name="token" type="password" value="${CH.esc(local.token || "")}" autocomplete="off"><span class="ch-ajuda">Fica só neste aparelho. Não vai para dentro do arquivo.</span></label>
              <label class="ch-campo"><span class="ch-rotulo">Ou: ID da planilha pública (somente leitura)</span><input class="ch-entrada" name="id" value="${CH.esc(local.id || "")}" placeholder="1AbC…"></label>
              <div class="ch-botoes"><button class="ch-botao">Salvar</button><button class="ch-botao ch-botao--fantasma" data-acao="sync" type="button">${I("refresh-cw")} Sincronizar</button></div></form>`}
        </article>

        <article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Casa</h2></header>
          <div class="ch-campo"><span class="ch-rotulo">Pessoas por refeição</span>${CH.ui.seg("pessoas", [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5+"]], String(cfg.pessoas || 2), "Pessoas")}</div>
          <div class="ch-campo"><span class="ch-rotulo">Planejar</span>${CH.ui.seg("refeicoes", [["almoco,jantar", "Almoço + jantar"], ["jantar", "Só jantar"], ["cafe,almoco,jantar", "As três"]], (cfg.refeicoes || ["almoco", "jantar"]).join(","), "Refeições")}</div>
        </article>

        <article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Privacidade</h2></header>
          <p>${I("shield-check")} Localização (GPS), modelo do celular e data da foto <b>nunca saem do aparelho</b>: a leitura é feita aqui, e qualquer cópia enviada é refeita a partir dos pixels, sem metadados. No servidor, as fotos não são guardadas.</p></article>

        <article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Dados</h2></header>
          <div class="ch-grade-botoes">
            <button class="ch-botao" data-acao="exemplo" type="button">${I("sparkles")} Carregar exemplo</button>
            <button class="ch-botao" data-acao="exportar" type="button">${I("download")} Exportar (JSON)</button>
            <label class="ch-botao">${I("upload")} Importar<input type="file" accept="application/json" data-importar hidden></label>
            <button class="ch-botao ch-botao--perigo" data-acao="apagar" type="button">${I("trash-2")} Apagar tudo</button></div></article>

        <article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Este formato</h2>${CH.ui.chip("acento", ({ shiny: "Shiny", quarto: "Quarto", html: "HTML" })[CH.modo])}</header>
          <table class="ch-tabela"><thead><tr><th></th><th>Shiny</th><th>Quarto</th><th>HTML</th></tr></thead><tbody>
            <tr><th>Funciona sem servidor</th><td>–</td><td>✓</td><td>✓</td></tr>
            <tr><th>Dados entre aparelhos</th><td>✓ SQLite</td><td>via planilha</td><td>via planilha</td></tr>
            <tr><th>Validade lida no aparelho</th><td>✓</td><td>se incluída</td><td>se incluída</td></tr>
            <tr><th>IA na nuvem, NFC-e SC</th><td>✓</td><td>–</td><td>–</td></tr></tbody></table></article>
      </div>`;
    },
  };
  CH.bus.on("seg", ({ nome, valor }) => {
    if (["framework", "tema", "ambiente", "texto", "densidade", "contraste", "fundo"].includes(nome)) { CH.ap.definir(nome, valor); CH.ui.render(); return; }
    if (nome === "pessoas") CH.tr.op("config.salvar", { chave: "pessoas", valor: +valor });
    if (nome === "refeicoes") CH.tr.op("config.salvar", { chave: "refeicoes", valor: valor.split(",") });
    if (nome === "visao") CH.tr.op("config.salvar", { chave: "visao", valor });
  });
  CH.bus.on("submit", (e) => {
    const f = e.target; if (f.dataset.form !== "planilha") return;
    CH.transporte.gravar("planilha", { url: f.url.value.trim(), token: f.token.value, id: f.id.value.trim() });
    CH.ui.aviso("Planilha salva neste aparelho.", "ok");
  });
  CH.ui.registrar("sync", async () => {
    try { const r = await CH.sync.agora(); CH.ui.aviso(r.mensagem || "Planilha sincronizada.", "ok"); }
    catch (err) { CH.ui.aviso(err.message, "erro", 6000); }
  });
  CH.ui.registrar("exportar", () => {
    const blob = new Blob([JSON.stringify(CH.loja.get(), null, 1)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `comerhoje-${CH.hoje()}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  CH.bus.on("change", async (e) => {
    if (!e.target.hasAttribute || !e.target.hasAttribute("data-importar") || !e.target.files[0]) return;
    try {
      const E = JSON.parse(await e.target.files[0].text());
      for (const l of E.lotes || []) CH.tr.op("lote.salvar", { lote: l });
      for (const c of E.compras || []) CH.tr.op("compras.salvar", { item: c });
      CH.ui.aviso(`${(E.lotes || []).length} itens importados.`, "ok");
    } catch (err) { CH.ui.aviso("Arquivo inválido: " + err.message, "erro"); }
  });
  CH.ui.registrar("apagar", () => {
    CH.ui.folha("Apagar tudo?", `<p>Isto apaga estoque, compras, plano e histórico ${CH.modo === "shiny" ? "no servidor (para todos da casa)" : "deste navegador"}. Os ajustes ficam.</p>
      <button class="ch-botao ch-botao--perigo ch-botao--bloco" data-acao="apagar-sim" type="button">Apagar tudo</button>`);
  });
  CH.ui.registrar("apagar-sim", () => { CH.tr.op("tudo.apagar", {}); CH.ui.fecharFolha(); CH.ui.aviso("Tudo apagado.", "ok"); });
})();
