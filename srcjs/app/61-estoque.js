// 61-estoque.js: stock (lists by urgency, lot sheet with actions, add form).
(() => {
  const I = (n, c) => CH.icone(n, c);
  const filtro = { local: "todos", busca: "" };
  const GRUPOS = [["vencido", "Vencidos: confira antes de usar"], ["urgente", "Vence em até 3 dias"], ["atencao", "Esta semana"], ["ok", "Mais tarde"], ["sem", "Sem data"]];
  const LOCAIS = [["geladeira", "Geladeira"], ["freezer", "Freezer"], ["despensa", "Despensa"], ["fruteira", "Fruteira"]];

  function filtrados() {
    const t = CH.core.normalizarTermo(filtro.busca);
    return CH.loja.lotesAtivos().filter((l) => (filtro.local === "todos" || l.local === filtro.local) &&
      (!t || CH.core.normalizarTermo(l.ing.nome + " " + (l.descricao || "") + " " + (l.ing.sinonimos || "")).includes(t)));
  }
  function grupos() {
    const L = filtrados();
    if (!L.length) return CH.ui.vazio("package", filtro.busca ? "Nada encontrado" : "Nada aqui ainda",
      filtro.busca ? `Nenhum item com “${CH.esc(filtro.busca)}”.` : "Escaneie a validade ou adicione um item.",
      `<button class="ch-botao ch-botao--primario" data-acao="novo-lote" type="button">${I("plus")} Adicionar item</button>`);
    return GRUPOS.map(([f, t]) => { const G = L.filter((l) => l.faixa === f); return G.length
      ? `<section class="ch-grupo ch-grupo--${f}"><h2 class="ch-sobrancelha">${t} <span class="ch-num">${G.length}</span></h2><ul class="ch-lista">${G.map(CH.ui.itemLote).join("")}</ul></section>` : ""; }).join("");
  }

  CH.telas.estoque = {
    titulo: "Estoque",
    render() {
      const L = CH.loja.lotesAtivos(), n = (loc) => L.filter((l) => loc === "todos" || l.local === loc).length;
      return `<header class="ch-tela-topo"><div><p class="ch-sobrancelha">${L.length} ${L.length === 1 ? "item" : "itens"}</p><h1 class="ch-titulo">Estoque</h1></div>
          <button class="ch-botao ch-botao--primario" data-acao="novo-lote" type="button">${I("plus")} Adicionar</button></header>
        <div class="ch-filtros">
          <label class="ch-busca">${I("search")}<input class="ch-entrada" id="ch-busca-estoque" type="search" placeholder="Buscar no estoque" value="${CH.esc(filtro.busca)}" autocomplete="off" enterkeyhint="search"></label>
          <div class="ch-chips-filtro" role="radiogroup" aria-label="Local">${[["todos", "Todos"], ...LOCAIS].map(([v, t]) =>
            `<button type="button" role="radio" aria-checked="${filtro.local === v}" data-acao="filtro-local" data-valor="${v}">${t} <span class="ch-num">${n(v)}</span></button>`).join("")}</div>
        </div>
        <div id="ch-grupos">${grupos()}</div>`;
    },
  };
  CH.bus.on("input", (e) => {
    if (e.target.id !== "ch-busca-estoque") return;
    filtro.busca = e.target.value;
    const g = CH.$("#ch-grupos"); if (g) g.innerHTML = grupos();          // partial update: keeps the focus
  });
  CH.ui.registrar("filtro-local", (el) => { filtro.local = el.dataset.valor; CH.ui.render(); });

  // ---------- lot sheet ----------
  CH.abrirLote = (id) => {
    const l = CH.loja.lotesAtivos().find((x) => x.id === id) || CH.loja.get().lotes.find((x) => x.id === id);
    if (!l) return;
    const g = CH.dados.ing(l.ingrediente_id), ve = l.validade_efetiva || CH.core.validadeEfetiva(l, g);
    const linhas = [
      ["Quantidade", CH.fmt.qtd(l.quantidade, g.unidade_base, l.ingrediente_id)],
      ["Local", l.local],
      ["Validade do rótulo", l.validade ? CH.fmt.data(l.validade) : "—"],
      l.aberto_em ? ["Aberto em", `${CH.fmt.data(l.aberto_em)}${g.aberto_dias != null ? ` · ${g.aberto_dias} dias após aberto` : ""}`] : null,
      ["Vale até", `<b>${CH.fmt.data(ve)}</b> · ${CH.fmt.validade(CH.dias(ve))}${!l.validade ? " (estimada pelo catálogo)" : ""}`],
      l.preco_total != null ? ["Preço pago", CH.fmt.brl(l.preco_total)] : null,
      l.descricao && l.descricao !== g.nome ? ["Descrição", CH.esc(l.descricao)] : null,
      l.gtin ? ["Código", `<span class="ch-mono">${CH.esc(l.gtin)}</span>`] : null,
    ].filter(Boolean);
    CH.ui.folha(CH.esc(g.nome), `
      <dl class="ch-detalhes">${linhas.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join("")}</dl>
      <div class="ch-grade-botoes">
        <button class="ch-botao ch-botao--primario" data-acao="usei" data-id="${l.id}" data-tudo="1" type="button">${I("check")} Usei tudo</button>
        <button class="ch-botao" data-acao="usei" data-id="${l.id}" type="button">${I("utensils")} Usei parte</button>
        ${l.aberto_em ? "" : `<button class="ch-botao" data-acao="abri" data-id="${l.id}" type="button">${I("package-open")} Abri hoje</button>`}
        <button class="ch-botao" data-acao="mover" data-id="${l.id}" type="button">${I(l.local === "freezer" ? "refrigerator" : "snowflake")} ${l.local === "freezer" ? "Tirar do freezer" : "Congelar"}</button>
        <button class="ch-botao ch-botao--perigo" data-acao="descartar" data-id="${l.id}" type="button">${I("trash-2")} Descartar</button>
        <button class="ch-botao ch-botao--fantasma" data-acao="editar-lote" data-id="${l.id}" type="button">${I("pencil")} Editar</button>
      </div>`);
  };
  CH.ui.registrar("lote", (el) => CH.abrirLote(el.dataset.id));

  const lote = (id) => CH.loja.lotesAtivos().find((x) => x.id === id);
  CH.ui.registrar("usei", (el) => {
    const l = lote(el.dataset.id); if (!l) return;
    if (el.dataset.tudo) { baixar(l, l.quantidade, "consumo"); return; }
    CH.ui.folha(`Usei parte: ${CH.esc(l.ing.nome)}`, `<form class="ch-form" data-form="usei" data-id="${l.id}">
      <label class="ch-campo"><span class="ch-rotulo">Quanto usou?</span>
        <span class="ch-linha"><input class="ch-entrada" name="q" inputmode="decimal" autocomplete="off" autofocus placeholder="ex.: 200">
        <select class="ch-entrada" name="u">${CH.dados.unidadesPara(l.ingrediente_id).map((u) => `<option ${u === l.ing.unidade_base ? "selected" : ""}>${u}</option>`).join("")}</select></span>
        <span class="ch-ajuda">Tem ${CH.fmt.qtd(l.quantidade, l.ing.unidade_base, l.ingrediente_id)}.</span></label>
      <button class="ch-botao ch-botao--primario ch-botao--bloco">Registrar</button></form>`);
  });
  function baixar(l, q, tipo, motivo) {
    CH.tr.op("lote.baixar", { id: l.id, quantidade: q, tipo, motivo: motivo || null, validade_efetiva: l.validade_efetiva });
    CH.ui.fecharFolha();
    CH.ui.aviso(tipo === "descarte" ? `${CH.esc(l.ing.nome)} descartado. Obrigado por registrar: isso mede o desperdício.`
      : `${CH.esc(l.ing.nome)}: ${CH.fmt.qtd(q, l.ing.unidade_base, l.ingrediente_id)} usados${l.dias != null && l.dias >= 0 ? " a tempo" : ""}.`, "ok");
  }
  CH.ui.registrar("abri", (el) => {
    const l = lote(el.dataset.id); if (!l) return;
    CH.tr.op("lote.abrir", { id: l.id, data: CH.hoje() });
    const ve = CH.core.validadeEfetiva({ ...l, aberto_em: CH.hoje() }, l.ing);
    CH.ui.fecharFolha();
    CH.ui.aviso(l.ing.aberto_dias != null ? `${CH.esc(l.ing.nome)} aberto: use até ${CH.fmt.data(ve, true)} (${l.ing.aberto_dias} dias após aberto).` : `${CH.esc(l.ing.nome)} marcado como aberto.`, "info", 5000);
  });
  CH.ui.registrar("mover", (el) => {
    const l = lote(el.dataset.id); if (!l) return;
    if (l.local === "freezer") CH.tr.op("lote.mover", { id: l.id, local: "geladeira", validade: CH.core.somarDias(CH.hoje(), 2), validade_origem: "estimada" });
    else CH.tr.op("lote.mover", { id: l.id, local: "freezer", validade: CH.core.somarDias(CH.hoje(), l.ing.categoria_id === "carnes" || l.ing.categoria_id === "peixes" ? 90 : 60), validade_origem: "estimada" });
    CH.ui.fecharFolha();
    CH.ui.aviso(l.local === "freezer" ? "Descongelado: use em até 2 dias." : "Congelado: validade estendida (estimativa).", "ok");
  });
  CH.ui.registrar("descartar", (el) => {
    const l = lote(el.dataset.id); if (!l) return;
    const motivos = [["venceu", "Venceu"], ["estragou", "Estragou antes"], ["sobra_esquecida", "Esqueci"], ["nao_gostou", "Não gostamos"], ["outro", "Outro"]];
    CH.ui.folha(`Descartar ${CH.esc(l.ing.nome)}`, `<p class="ch-suave">Por quê? Isso ajuda a medir e reduzir o desperdício.</p>
      <div class="ch-grade-botoes">${motivos.map(([m, t]) => `<button class="ch-botao" data-acao="descartar-motivo" data-id="${l.id}" data-motivo="${m}" type="button">${t}</button>`).join("")}</div>`);
  });
  CH.ui.registrar("descartar-motivo", (el) => { const l = lote(el.dataset.id); if (l) baixar(l, l.quantidade, "descarte", el.dataset.motivo); });

  // ---------- add / edit ----------
  CH.formLote = (pre = {}) => {
    const g = pre.ingrediente_id ? CH.dados.ing(pre.ingrediente_id) : null;
    const uni = g ? CH.dados.unidadesPara(g.id) : ["un", "g", "kg", "ml", "l"];
    CH.ui.folha(pre.id ? "Editar item" : "Adicionar item", `<form class="ch-form" data-form="lote">
      <input type="hidden" name="id" value="${CH.esc(pre.id || "")}">
      <input type="hidden" name="ingrediente_id" value="${CH.esc(pre.ingrediente_id || "")}">
      <label class="ch-campo ch-autocompletar"><span class="ch-rotulo">Item</span>
        <input class="ch-entrada" name="item" autocomplete="off" ${g ? "" : "autofocus"} placeholder="ex.: feijão, aipim, nata…" value="${CH.esc(g ? g.nome : "")}">
        <div class="ch-sugestoes" role="listbox" hidden></div></label>
      <div class="ch-linha">
        <label class="ch-campo"><span class="ch-rotulo">Quantidade</span><input class="ch-entrada" name="quantidade" inputmode="decimal" autocomplete="off"
          value="${pre.quantidade != null ? CH.esc(String(pre.quantidade).replace(".", ",")) : ""}" placeholder="ex.: 500"></label>
        <label class="ch-campo"><span class="ch-rotulo">Unidade</span><select class="ch-entrada" name="unidade">${uni.map((u) => `<option ${u === (pre.unidade || (g && g.unidade_base)) ? "selected" : ""}>${u}</option>`).join("")}</select></label>
      </div>
      <div class="ch-campo"><span class="ch-rotulo">Local</span>${CH.ui.seg("form-local", LOCAIS, pre.local || (g && g.armazenamento) || "geladeira", "Local")}<input type="hidden" name="local" value="${pre.local || (g && g.armazenamento) || "geladeira"}"></div>
      <div class="ch-linha">
        <label class="ch-campo"><span class="ch-rotulo">Validade</span><input class="ch-entrada" name="validade" type="date" value="${pre.validade || ""}">
          <span class="ch-ajuda" id="ch-ajuda-validade">${g && !pre.validade ? `Sem data? Estimamos ${g.validade_padrao_dias} dias (${g.armazenamento}).` : ""}</span></label>
        <label class="ch-campo"><span class="ch-rotulo">Preço pago (R$)</span><input class="ch-entrada" name="preco" inputmode="decimal" autocomplete="off" value="${pre.preco_total != null ? CH.fmt.num(pre.preco_total, 2) : ""}"></label>
      </div>
      <label class="ch-check"><input type="checkbox" name="aberto" ${pre.aberto_em ? "checked" : ""}><span>Já está aberto</span></label>
      <button class="ch-botao ch-botao--primario ch-botao--bloco">${pre.id ? "Salvar" : "Adicionar ao estoque"}</button>
    </form>`);
  };
  CH.ui.registrar("novo-lote", () => CH.formLote());
  CH.ui.registrar("editar-lote", (el) => { const l = CH.loja.get().lotes.find((x) => x.id === el.dataset.id); if (l) CH.formLote({ ...l, unidade: CH.dados.ing(l.ingrediente_id).unidade_base }); });

  // autocomplete (catalog + regional synonyms)
  CH.bus.on("input", (e) => {
    if (e.target.name !== "item" || !e.target.closest("[data-form]")) return;
    const caixa = e.target.parentElement.querySelector(".ch-sugestoes");
    const r = CH.dados.buscar(e.target.value, 6);
    caixa.hidden = !r.length;
    caixa.innerHTML = r.map((g) => `<button type="button" role="option" data-acao="escolher-ing" data-id="${g.id}">${CH.esc(g.nome)} <small>${CH.esc(CH.dados.categoria(g.categoria_id).nome)}</small></button>`).join("");
  });
  CH.ui.registrar("escolher-ing", (el) => {
    const f = el.closest("form"), g = CH.dados.ing(el.dataset.id);
    f.item.value = g.nome; f.ingrediente_id.value = g.id;
    f.unidade.innerHTML = CH.dados.unidadesPara(g.id).map((u) => `<option ${u === g.unidade_base ? "selected" : ""}>${u}</option>`).join("");
    f.local.value = g.armazenamento;
    CH.$$(".ch-seg [data-nome='form-local']", f).forEach((b) => b.setAttribute("aria-checked", b.dataset.valor === g.armazenamento));
    const aj = CH.$("#ch-ajuda-validade"); if (aj) aj.textContent = `Sem data? Estimamos ${g.validade_padrao_dias} dias (${g.armazenamento}).`;
    el.parentElement.hidden = true;
    f.quantidade.focus();
  });
  CH.bus.on("seg", ({ nome, valor, el }) => {
    if (nome !== "form-local") return;
    const f = el.closest("form"); f.local.value = valor;
    CH.$$("[data-nome='form-local']", f).forEach((b) => b.setAttribute("aria-checked", b.dataset.valor === valor));
  });

  CH.bus.on("submit", (e) => {
    const f = e.target, tipo = f.dataset.form;
    if (tipo === "usei") {
      const l = lote(f.dataset.id), q = CH.parseNum(f.q.value);
      if (!l || !q) return CH.ui.aviso("Informe a quantidade.", "erro");
      let base; try { base = CH.dados.paraBase(q, f.u.value, l.ingrediente_id); } catch (err) { return CH.ui.aviso(err.message, "erro"); }
      return baixar(l, Math.min(base, l.quantidade), "consumo");
    }
    if (tipo !== "lote") return;
    let ingId = f.ingrediente_id.value;
    if (!ingId) { const m = CH.dados.casar(f.item.value); if (m.length && m[0].escore >= 0.6) ingId = m[0].id; }
    if (!ingId) return CH.ui.aviso("Escolha um item da lista (o catálogo tem nomes regionais: aipim, bergamota, nata…).", "erro", 5000);
    const q = CH.parseNum(f.quantidade.value);
    if (!q) return CH.ui.aviso("Informe a quantidade.", "erro");
    let base; try { base = CH.dados.paraBase(q, f.unidade.value, ingId); } catch (err) { return CH.ui.aviso(err.message, "erro"); }
    const preco = CH.parseNum(f.preco.value);
    const lote = { id: f.id.value || CH.uuid(), ingrediente_id: ingId, descricao: CH.dados.nomeIng(ingId), quantidade: base, local: f.local.value,
      validade: f.validade.value || null, validade_origem: f.validade.value ? "usuario" : "estimada",
      data_compra: f.id.value ? undefined : CH.hoje(), aberto_em: f.aberto.checked ? CH.hoje() : null, preco_total: preco, origem: "manual" };
    if (lote.data_compra === undefined) delete lote.data_compra;
    CH.tr.op("lote.salvar", { lote });
    CH.ui.fecharFolha();
    CH.ui.aviso(`${CH.esc(CH.dados.nomeIng(ingId))} ${f.id.value ? "atualizado" : "no estoque"}.`, "ok");
  });
})();
