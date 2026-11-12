// 50-ui.js: shell, router, sheets, toasts and shared components. Both frameworks (Lumen, Neue) use the
// same markup; the CSS (and a few data-framework conditionals) gives each its voice.
CH.ui = (() => {
  const I = (n, c) => CH.icone(n, c);
  const TELAS = [
    { id: "inicio", rotulo: "Início", icone: "house", tecla: "1" },
    { id: "estoque", rotulo: "Estoque", icone: "package", tecla: "2" },
    { id: "escanear", rotulo: "Escanear", icone: "scan-line", tecla: "3", destaque: true },
    { id: "plano", rotulo: "Plano", icone: "calendar-days", tecla: "4" },
    { id: "compras", rotulo: "Compras", icone: "shopping-cart", tecla: "5" },
  ];
  let raiz, principal, camada, telaAtual = null;

  function montar(el) {
    raiz = el;
    raiz.innerHTML = `
      <div class="ch-ambiente" aria-hidden="true"><i></i><i></i><i></i></div>
      <a class="ch-pular" href="#ch-principal">Pular para o conteúdo</a>
      <header class="ch-topo">
        <a class="ch-marca" href="#/inicio" aria-label="comerHoje, início">
          <span class="ch-logo">${I("leaf")}</span>
          <span class="ch-marca-texto"><span class="ch-marca-nome">comer<b>Hoje</b></span><span class="ch-marca-sub">cozinha sem desperdício</span></span>
        </a>
        <nav class="ch-nav" aria-label="Navegação principal">${TELAS.map((t) => `<a class="ch-aba" data-tela="${t.id}" href="#/${t.id}">${I(t.icone)}<span>${t.rotulo}</span></a>`).join("")}</nav>
        <div class="ch-acoes">
          <button class="ch-cmd-campo" data-acao="cmd" type="button">${I("search")}<span>Buscar ou agir…</span><kbd>Ctrl K</kbd></button>
          <span class="ch-status" id="ch-status" role="status"></span>
          <span class="ch-modo" title="Formato desta entrega">${({ shiny: "Shiny", quarto: "Quarto", html: "HTML" })[CH.modo] || "HTML"}</span>
          <button class="ch-botao ch-botao--icone" data-acao="tema" type="button" aria-label="Alternar claro/escuro">${I("sun-moon")}</button>
          <a class="ch-botao ch-botao--icone" href="#/ajustes" aria-label="Ajustes">${I("settings")}</a>
        </div>
      </header>
      <main class="ch-principal" id="ch-principal" tabindex="-1"></main>
      <nav class="ch-abas-baixo" aria-label="Navegação principal (celular)">${TELAS.map((t) => `<a class="ch-aba${t.destaque ? " ch-aba--destaque" : ""}" data-tela="${t.id}" href="#/${t.id}"><span class="ch-aba-icone">${I(t.icone)}</span><span>${t.rotulo}</span></a>`).join("")}</nav>
      <div class="ch-camada" id="ch-camada"></div>`;
    principal = CH.$("#ch-principal", raiz);
    camada = CH.$("#ch-camada", raiz);
    raiz.addEventListener("click", aoClicar);
    raiz.addEventListener("change", (e) => CH.bus.emit("change", e));
    raiz.addEventListener("input", (e) => CH.bus.emit("input", e));
    raiz.addEventListener("submit", (e) => { e.preventDefault(); CH.bus.emit("submit", e); });
    window.addEventListener("hashchange", () => rota());
    CH.bus.on("estado", CH.debounce(() => { if (!CH.ui.congelado) render(); }, 30));
    CH.bus.on("pendentes", status); CH.bus.on("conexao", status); CH.bus.on("sync", status);
    rota();
  }

  function rota() {
    const [tela, ...resto] = (location.hash.replace(/^#\/?/, "") || "inicio").split("/");
    telaAtual = CH.telas[tela] ? tela : "inicio";
    CH.ui.params = resto;
    CH.$$(".ch-aba", raiz).forEach((a) => { if (a.dataset.tela === telaAtual) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    raiz.dataset.tela = telaAtual;
    render(true);
  }
  function render(nova = false) {
    const t = CH.telas[telaAtual];
    const rolagem = window.scrollY;
    principal.innerHTML = `<div class="ch-tela ch-tela--${telaAtual}${nova ? " ch-entra" : ""}">${t.render()}</div>`;
    if (t.depois) t.depois(principal);
    if (nova) { window.scrollTo(0, 0); document.title = `${t.titulo || "comerHoje"} · comerHoje`; }
    else window.scrollTo(0, rolagem);
    status();
  }
  function status() {
    const el = CH.$("#ch-status", raiz); if (!el || !CH.tr) return;
    const s = CH.tr.status(), n = CH.loja.lotesAtivos().length;
    const sync = CH.loja.get().config.ultima_sync;
    el.className = "ch-status" + (s.online ? "" : " ch-status--off") + (s.pendentes ? " ch-status--pend" : "");
    el.innerHTML = `<span class="ch-status-ponto"></span><span class="ch-mono">${CH.esc(s.fonte)}</span><span class="ch-status-fig">${n} ${n === 1 ? "item" : "itens"}</span>` +
      (s.pendentes ? `<span>${s.pendentes} a enviar</span>` : sync ? `<span>planilha ${CH.fmt.hora(sync)}</span>` : "");
  }

  // ---------- clicks: every [data-acao] is handled by the registered handlers ----------
  const acoes = {};
  const registrar = (nome, fn) => { acoes[nome] = fn; };
  function aoClicar(e) {
    const el = e.target.closest("[data-acao]");
    if (!el || !raiz.contains(el)) return;
    const fn = acoes[el.dataset.acao];
    if (fn) { e.preventDefault(); fn(el, e); }
  }

  // ---------- sheet (bottom on phones, dialog on desktop) ----------
  let folhaAberta = null;
  function folha(titulo, corpo, { largura = "media", aoFechar } = {}) {
    fecharFolha();
    const f = document.createElement("div");
    f.className = "ch-veu";
    f.innerHTML = `<section class="ch-folha ch-folha--${largura}" role="dialog" aria-modal="true" aria-labelledby="ch-folha-titulo">
        <div class="ch-folha-alca" aria-hidden="true"></div>
        <header class="ch-folha-topo"><h2 id="ch-folha-titulo">${titulo}</h2>
          <button class="ch-botao ch-botao--icone" data-acao="fechar-folha" type="button" aria-label="Fechar">${I("x")}</button></header>
        <div class="ch-folha-corpo">${corpo}</div></section>`;
    f.addEventListener("click", (e) => { if (e.target === f) fecharFolha(); });
    camada.appendChild(f);
    folhaAberta = { el: f, aoFechar, voltarPara: document.activeElement };
    requestAnimationFrame(() => { f.classList.add("ch-aberta"); const alvo = CH.$("[autofocus]", f) || CH.$(".ch-folha", f); alvo && alvo.focus && alvo.focus(); });
    return CH.$(".ch-folha", f);
  }
  function fecharFolha() {
    if (!folhaAberta) return;
    const { el, aoFechar, voltarPara } = folhaAberta; folhaAberta = null;
    el.remove(); if (aoFechar) aoFechar(); if (voltarPara && voltarPara.focus) voltarPara.focus();
  }
  registrar("fechar-folha", fecharFolha);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && folhaAberta) fecharFolha(); });

  function aviso(msg, tipo = "info", ms = 3600) {
    const a = document.createElement("div");
    a.className = `ch-aviso ch-aviso--${tipo}`; a.setAttribute("role", tipo === "erro" ? "alert" : "status");
    a.innerHTML = `${I(tipo === "erro" ? "triangle-alert" : tipo === "ok" ? "circle-check" : "info")}<span>${msg}</span>`;
    camada.appendChild(a);
    requestAnimationFrame(() => a.classList.add("ch-aberta"));
    setTimeout(() => { a.classList.remove("ch-aberta"); setTimeout(() => a.remove(), 400); }, ms);
  }

  // ---------- components ----------
  const chip = (faixa, texto) => `<span class="ch-chip ch-chip--${faixa}">${CH.esc(texto)}</span>`;
  function chipValidade(l) {
    const txt = l.dias == null ? "sem data" : l.dias > 7 ? CH.fmt.data(l.validade_efetiva, true) : CH.fmt.validade(l.dias);
    return chip(l.faixa, txt);
  }
  const ICONE_LOCAL = { geladeira: "refrigerator", freezer: "snowflake", despensa: "archive", fruteira: "apple" };
  function itemLote(l) {
    const meta = [CH.fmt.qtd(l.quantidade, l.ing.unidade_base, l.ingrediente_id), l.local,
      l.aberto_em ? `aberto ${CH.fmt.data(l.aberto_em, true)}` : null,
      l.validade_origem === "estimada" || !l.validade ? "data estimada" : null].filter(Boolean).join(" · ");
    return `<li><button class="ch-item" type="button" data-acao="lote" data-id="${l.id}">
      <span class="ch-item-icone ch-local--${l.local}">${I(ICONE_LOCAL[l.local] || "package")}</span>
      <span class="ch-item-corpo"><span class="ch-item-nome">${CH.esc(l.descricao && l.descricao !== l.ing.nome ? l.ing.nome : l.ing.nome)}</span>
        <span class="ch-item-meta">${CH.esc(meta)}</span></span>
      <span class="ch-item-fim">${chipValidade(l)}</span></button></li>`;
  }
  const vazio = (icone, titulo, texto, botoes = "") =>
    `<div class="ch-vazio">${I(icone, "ch-vazio-icone")}<h3>${titulo}</h3><p>${texto}</p>${botoes ? `<div class="ch-vazio-botoes">${botoes}</div>` : ""}</div>`;
  const seg = (nome, opcoes, valor, rotulo) => `<div class="ch-seg" role="radiogroup" aria-label="${CH.esc(rotulo || nome)}">${opcoes.map(([v, t]) =>
    `<button type="button" role="radio" aria-checked="${v === valor}" data-acao="seg" data-nome="${nome}" data-valor="${v}">${t}</button>`).join("")}</div>`;
  registrar("seg", (el) => CH.bus.emit("seg", { nome: el.dataset.nome, valor: el.dataset.valor, el }));

  return { montar, render, rota, folha, fecharFolha, aviso, registrar, chip, chipValidade, itemLote, vazio, seg, status, TELAS,
           get tela() { return telaAtual; } };
})();
CH.telas = {};
