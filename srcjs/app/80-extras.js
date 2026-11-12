// 80-extras.js: appearance (Lumen | Neue, theme, Neue settings), command bar, shortcuts, example,
// Google Sheet sync from the browser (HTML/Quarto: Apps Script or public read-only link).
(() => {
  const I = (n, c) => CH.icone(n, c);

  // ---------- appearance (attributes on the root, saved in localStorage; applied before first paint by the head script) ----------
  const CHAVE_AP = "comerhoje:aparencia";
  CH.ap = {
    framework: "lumen", tema: "auto", ambiente: "on", texto: "m", densidade: "comfortable", contraste: "standard", fundo: "dots",
    carregar(padrao = {}) {
      let salvo = {}; try { salvo = JSON.parse(localStorage.getItem(CHAVE_AP) || "{}"); } catch (e) { /* none */ }
      Object.assign(this, padrao, salvo); this.aplicar();
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.aplicar());
    },
    definir(k, v) {
      this[k] = v; this.aplicar();
      const { framework, tema, ambiente, texto, densidade, contraste, fundo } = this;
      try { localStorage.setItem(CHAVE_AP, JSON.stringify({ framework, tema, ambiente, texto, densidade, contraste, fundo })); } catch (e) { /* private mode */ }
    },
    aplicar() {
      const r = CH.raiz; if (!r) return;
      const escuro = this.tema === "escuro" || (this.tema === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
      Object.assign(r.dataset, { framework: this.framework, theme: escuro ? "dark" : "light", ambient: this.ambiente,
        chText: this.texto, chDensity: this.densidade, chContrast: this.contraste, chCanvas: this.fundo });
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = getComputedStyle(r).getPropertyValue("--ch-bg").trim() || (escuro ? "#000000" : "#fbfbfd");
    },
  };
  CH.ui.registrar("tema", () => {
    const escuro = CH.raiz.dataset.theme === "dark";
    CH.ap.definir("tema", escuro ? "claro" : "escuro");
  });

  // ---------- command bar (Ctrl/Cmd+K, "/") ----------
  function comandos() {
    const C = [
      ...CH.ui.TELAS.map((t) => ({ grupo: "Ir para", t: t.rotulo, icone: t.icone, fazer: () => (location.hash = "#/" + t.id) })),
      { grupo: "Ir para", t: "Ajustes", icone: "settings", fazer: () => (location.hash = "#/ajustes") },
      { grupo: "Ações", t: "Escanear validade", icone: "scan-line", fazer: () => (location.hash = "#/escanear") },
      { grupo: "Ações", t: "Adicionar item ao estoque", icone: "plus", fazer: () => CH.formLote() },
      { grupo: "Ações", t: "Gerar plano da semana", icone: "sparkles", fazer: () => { location.hash = "#/plano"; CH.$("[data-acao='gerar-plano']") && CH.$("[data-acao='gerar-plano']").click(); } },
      { grupo: "Ações", t: `Trocar para ${CH.ap.framework === "lumen" ? "Neue" : "Lumen"}`, icone: "palette", fazer: () => { CH.ap.definir("framework", CH.ap.framework === "lumen" ? "neue" : "lumen"); CH.ui.render(); } },
      { grupo: "Ações", t: "Alternar claro/escuro", icone: "sun-moon", fazer: () => CH.$("[data-acao='tema']").click() },
      { grupo: "Ações", t: "Sincronizar planilha", icone: "refresh-cw", fazer: () => CH.$("[data-acao='sync']") ? CH.$("[data-acao='sync']").click() : CH.sync.agora().then(() => CH.ui.aviso("Sincronizado.", "ok"), (e) => CH.ui.aviso(e.message, "erro")) },
      ...CH.loja.lotesAtivos().map((l) => ({ grupo: "Estoque", t: `${l.ing.nome} · ${CH.fmt.validade(l.dias)}`, icone: "package", fazer: () => CH.abrirLote(l.id) })),
    ];
    return C;
  }
  function abrirCmd() {
    const f = CH.ui.folha("Buscar ou agir", `<div class="ch-cmd"><label class="ch-busca">${I("search")}<input class="ch-entrada" id="ch-cmd-q" placeholder="Digite: estoque, plano, molho, tema…" autocomplete="off" autofocus></label>
      <ul class="ch-cmd-lista" id="ch-cmd-lista" role="listbox"></ul><p class="ch-suave ch-legenda"><kbd>↑</kbd><kbd>↓</kbd> escolher · <kbd>Enter</kbd> abrir · <kbd>Esc</kbd> fechar · <kbd>?</kbd> atalhos</p></div>`, { largura: "cmd" });
    const lista = CH.$("#ch-cmd-lista", f), q = CH.$("#ch-cmd-q", f);
    let itens = [], sel = 0;
    const desenhar = () => {
      const t = CH.core.normalizarTermo(q.value);
      const extra = t ? CH.dados.buscar(q.value, 3).map((g) => ({ grupo: "Lista de compras", t: `Adicionar ${g.nome}`, icone: "shopping-cart",
        fazer: () => CH.tr.op("compras.salvar", { item: { id: CH.uuid(), ingrediente_id: g.id, descricao: g.nome, origem: "manual" } }).then(() => CH.ui.aviso(`${CH.esc(g.nome)} na lista.`, "ok")) })) : [];
      itens = [...comandos().filter((c) => !t || CH.core.normalizarTermo(c.t).includes(t)), ...extra].slice(0, 12);
      sel = Math.min(sel, Math.max(0, itens.length - 1));
      let grupo = "";
      lista.innerHTML = itens.map((c, i) => { const cab = c.grupo !== grupo ? `<li class="ch-cmd-grupo" role="presentation">${(grupo = c.grupo)}</li>` : "";
        return cab + `<li role="option" aria-selected="${i === sel}" data-i="${i}">${I(c.icone)}<span>${CH.esc(c.t)}</span></li>`; }).join("");
    };
    const executar = (i) => { const c = itens[i]; if (!c) return; CH.ui.fecharFolha(); c.fazer(); };
    q.addEventListener("input", () => { sel = 0; desenhar(); });
    q.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { sel = Math.min(itens.length - 1, sel + 1); desenhar(); e.preventDefault(); }
      if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); desenhar(); e.preventDefault(); }
      if (e.key === "Enter") { executar(sel); e.preventDefault(); }
    });
    lista.addEventListener("click", (e) => { const li = e.target.closest("[data-i]"); if (li) executar(+li.dataset.i); });
    desenhar();
  }
  CH.ui.registrar("cmd", abrirCmd);
  const digitando = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); abrirCmd(); return; }
    if (digitando(e) || e.ctrlKey || e.metaKey || e.altKey || CH.$(".ch-veu")) return;
    const t = CH.ui.TELAS.find((x) => x.tecla === e.key);
    if (t) location.hash = "#/" + t.id;
    else if (e.key === "/") { e.preventDefault(); abrirCmd(); }
    else if (e.key === "n") CH.formLote();
    else if (e.key === "e") location.hash = "#/escanear";
    else if (e.key === "t") CH.$("[data-acao='tema']").click();
    else if (e.key === "?") CH.ui.folha("Atalhos", `<dl class="ch-detalhes ch-atalhos">${[["Ctrl K  ou  /", "buscar ou agir"], ["1 … 5", "Início, Estoque, Escanear, Plano, Compras"], ["n", "novo item"], ["e", "escanear"], ["t", "claro / escuro"], ["Esc", "fechar"]].map(([k, v]) => `<div><dt><kbd>${k}</kbd></dt><dd>${v}</dd></div>`).join("")}</dl>`);
  });

  // ---------- example (stock from the reference photos + a few everyday items), dates relative to today ----------
  CH.ui.registrar("exemplo", () => {
    const h = CH.hoje(), d = (n) => CH.core.somarDias(h, n);
    const L = [
      ["panceta", 482, "geladeira", "2027-01-19", null, 14.89, "Panceta El Corte temperada", "rotulo", "2065840014899"],
      ["nhoque", 500, "despensa", "2027-06-29", null, 12.9, "Gnocchi di patate La Molisana", "rotulo"],
      ["molho_tomate", 240, "geladeira", "2027-03-31", d(-1), 4.49, "Molho de tomate Heinz (sachê)", "rotulo"],
      ["leite_uht", 1000, "geladeira", "2027-03-19", d(-2), 5.79, "Leite UHT Piracanjuba", "rotulo"],
      ["ovo", 6, "geladeira", d(9), null, 9.9, "Ovos brancos", "usuario"],
      ["peito_frango", 600, "geladeira", d(1), null, 17.4, "Filé de peito de frango", "rotulo"],
      ["alface", 300, "geladeira", null, null, 3.5, "Alface crespa", "estimada", null, d(-3)],
      ["batata", 1000, "despensa", null, null, 6.9, "Batata", "estimada", null, d(-5)],
      ["queijo_mucarela", 150, "geladeira", d(20), d(-2), 8.2, "Muçarela fatiada", "rotulo"],
      ["limao", 420, "geladeira", null, null, 4.2, "Limão-taiti", "estimada", null, d(-4)],
      ["manteiga", 200, "geladeira", d(60), d(-10), 12.9, "Manteiga extra com sal Batavo", "rotulo"],
      ["arroz_branco", 2000, "despensa", d(200), d(-20), 11.9, "Arroz tipo 1", "rotulo"],
      ["feijao_preto", 1000, "despensa", d(240), null, 8.5, "Feijão preto", "rotulo"],
      ["tainha", 900, "geladeira", d(1), null, 29.9, "Tainha (peixaria)", "usuario"],
      ["pinhao", 500, "geladeira", null, null, 9.0, "Pinhão", "estimada", null, d(-2)],
    ];
    for (const [ing, q, local, val, aberto, preco, desc, orig, gtin, compra] of L) {
      CH.tr.op("lote.salvar", { lote: { id: CH.uuid(), ingrediente_id: ing, descricao: desc, quantidade: q, local, validade: val, validade_origem: orig,
        aberto_em: aberto, preco_total: preco, data_compra: compra || d(-3), gtin: gtin || null, origem: "exemplo" } });
    }
    // this month's history: used in time and one discard, so the totals have something to show
    const hist = [["cenoura", 500, 3.2, "consumo"], ["tomate", 600, 5.4, "consumo"], ["iogurte_natural", 170, 3.9, "consumo"], ["rucula", 150, 4.5, "descarte"]];
    for (const [ing, q, preco, tipo] of hist) {
      const id = CH.uuid();
      CH.tr.op("lote.salvar", { lote: { id, ingrediente_id: ing, descricao: CH.dados.nomeIng(ing), quantidade: q, local: "geladeira", validade: d(2), validade_origem: "usuario", preco_total: preco, data_compra: d(-6), origem: "exemplo" } });
      CH.tr.op("lote.baixar", { id, quantidade: q, tipo, motivo: tipo === "descarte" ? "estragou" : null, validade_efetiva: d(2) });
    }
    CH.tr.op("compras.salvar", { item: { id: CH.uuid(), ingrediente_id: "queijo_parmesao", descricao: "Queijo parmesão", quantidade: 30, unidade: "g", origem: "plano" } });
    CH.tr.op("compras.salvar", { item: { id: CH.uuid(), ingrediente_id: "cebola", descricao: "Cebola", quantidade: 500, unidade: "g", origem: "manual" } });
    CH.tr.op("compras.salvar", { item: { id: CH.uuid(), ingrediente_id: "pao_frances", descricao: "Pão francês", quantidade: 300, unidade: "g", origem: "manual" } });
    CH.ui.fecharFolha();
    CH.ui.aviso("Exemplo carregado: os itens das fotos de referência e alguns do dia a dia.", "ok");
  });

  // ---------- Google Sheet from the browser ----------
  const ABA_CAMPOS = ["id", "item", "ingrediente_id", "quantidade", "unidade", "local", "validade", "aberto_em", "validade_efetiva", "preco_total", "atualizado_em", "excluido"];
  const SYNC_CAMPOS = ["item", "quantidade", "unidade", "local", "validade", "aberto_em", "preco_total", "excluido"];
  const linhaDeLote = (l) => { const g = CH.dados.ing(l.ingrediente_id);
    return { id: l.id, item: g.nome, ingrediente_id: l.ingrediente_id, quantidade: l.quantidade, unidade: g.unidade_base, local: l.local, validade: l.validade || "",
      aberto_em: l.aberto_em || "", validade_efetiva: CH.core.validadeEfetiva(l, g) || "", preco_total: l.preco_total == null ? "" : l.preco_total,
      atualizado_em: l.atualizado_em || "", excluido: l.excluido || l.status !== "ativo" ? 1 : 0 }; };
  const norm = (r) => ({ ...r, quantidade: CH.parseNum(r.quantidade), preco_total: r.preco_total === "" || r.preco_total == null ? "" : CH.parseNum(r.preco_total),
    validade: dataBr(r.validade), aberto_em: dataBr(r.aberto_em), excluido: /^(1|true|verdadeiro|sim)$/i.test(String(r.excluido)) ? 1 : 0 });
  function dataBr(v) { if (!v) return ""; const s = String(v).trim(); let m;
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return s.slice(0, 10); }
  CH.sync = {
    async agora() {
      if (CH.tr.capacidades.sync === "servidor") { const r = await CH.tr.consulta("sync.agora", {}, 60000); return { mensagem: r.mensagem }; }
      const cfg = CH.transporte.ler("planilha", {});
      if (cfg.url && cfg.token) return this.appsScript(cfg);
      if (cfg.id) return this.publica(cfg.id);
      throw new Error("Configure a planilha em Ajustes.");
    },
    async appsScript({ url, token }) {
      const r = await (await fetch(`${url}?acao=ler&token=${encodeURIComponent(token)}`)).json();
      if (!r.ok) throw new Error("Planilha: " + (r.erro || "erro"));
      const remoto = (r.abas.estoque || []).map(norm).map((x) => (x.id ? x : { ...x, id: CH.uuid() }));
      const E = CH.loja.get(), local = E.lotes.map(linhaDeLote), base = CH.transporte.ler("sync-base", []);
      const acoes = CH.core.mesclar3vias(local, remoto, base, SYNC_CAMPOS);
      for (const id of [...acoes.pull, ...acoes.conflito_remoto]) {
        const x = remoto.find((y) => y.id === id);
        const m = x.ingrediente_id ? { id: x.ingrediente_id } : (CH.dados.casar(x.item)[0] || {});
        if (!m.id) continue;
        if (x.excluido) { CH.tr.op("lote.excluir", { id }); continue; }
        CH.tr.op("lote.salvar", { lote: { id, ingrediente_id: m.id, descricao: x.item, quantidade: x.quantidade || 0, local: x.local || "geladeira",
          validade: x.validade || null, aberto_em: x.aberto_em || null, preco_total: x.preco_total === "" ? null : x.preco_total, origem: "planilha", validade_origem: x.validade ? "usuario" : "estimada", data_compra: CH.hoje() } });
      }
      for (const id of acoes.excluir_local) CH.tr.op("lote.excluir", { id });
      const final = CH.loja.get().lotes.map(linhaDeLote);
      const w = await (await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ acao: "gravar", token, aba: "estoque", campos: ABA_CAMPOS, linhas: final, revisao_esperada: r.revisao }) })).json();
      if (!w.ok) throw new Error("Planilha: " + (w.erro || "erro ao gravar"));
      CH.transporte.gravar("sync-base", final.map((l) => ({ id: l.id, hash: CH.core.fnv1a(SYNC_CAMPOS.map((c) => (l[c] == null ? "" : String(l[c]))).join("\u001f")) })));
      CH.tr.op("config.salvar", { chave: "ultima_sync", valor: CH.agora() });
      return { mensagem: `Planilha sincronizada: ${acoes.pull.length} recebidos, ${acoes.push.length} enviados${acoes.conflito_remoto.length ? `, ${acoes.conflito_remoto.length} conflitos (valeu a planilha)` : ""}.` };
    },
    async publica(id) {       // link-shared sheet, read-only: imports new rows
      const csv = await (await fetch(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq?tqx=out:csv&sheet=estoque`)).text();
      const [cab, ...linhas] = csv.trim().split(/\r?\n/).map((l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')));
      const E = CH.loja.get(); let n = 0;
      for (const v of linhas) {
        const x = norm(Object.fromEntries(cab.map((c, i) => [c, v[i]])));
        if (!x.item || x.excluido || (x.id && E.lotes.some((l) => l.id === x.id))) continue;
        const m = x.ingrediente_id ? { id: x.ingrediente_id } : CH.dados.casar(x.item)[0]; if (!m) continue;
        CH.tr.op("lote.salvar", { lote: { id: x.id || CH.uuid(), ingrediente_id: m.id, descricao: x.item, quantidade: x.quantidade || 0, local: x.local || "geladeira",
          validade: x.validade || null, validade_origem: x.validade ? "usuario" : "estimada", data_compra: CH.hoje(), origem: "planilha" } }); n++;
      }
      return { mensagem: `${n} itens importados da planilha (somente leitura).` };
    },
  };
})();
