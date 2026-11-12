// 63-compras.js: shopping list grouped by market section (walking order).
(() => {
  const I = (n, c) => CH.icone(n, c);
  CH.telas.compras = {
    titulo: "Compras",
    render() {
      const itens = CH.loja.get().compras.filter((c) => !c.excluido);
      const topo = `<header class="ch-tela-topo"><div><p class="ch-sobrancelha">${itens.filter((c) => !c.comprado).length} a comprar</p><h1 class="ch-titulo">Compras</h1></div>
        ${itens.some((c) => c.comprado) ? `<button class="ch-botao ch-botao--primario" data-acao="comprados-estoque" type="button">${I("package")} Comprados → estoque</button>` : ""}</header>
        <form class="ch-form ch-form--linha" data-form="compra">
          <label class="ch-campo ch-autocompletar ch-cresce"><span class="ch-rotulo ch-so-leitor">Adicionar item</span>
            <input class="ch-entrada" name="item" placeholder="Adicionar: tomate, nata, pão de trigo…" autocomplete="off"><input type="hidden" name="ingrediente_id">
            <div class="ch-sugestoes" role="listbox" hidden></div></label>
          <input class="ch-entrada ch-entrada--curta" name="quantidade" inputmode="decimal" placeholder="qtd" aria-label="Quantidade">
          <button class="ch-botao ch-botao--icone ch-botao--primario" aria-label="Adicionar">${I("plus")}</button></form>`;
      if (!itens.length) return topo + CH.ui.vazio("shopping-cart", "Lista vazia", "Gere o plano da semana para listar o que falta, ou adicione itens acima.");
      const secoes = {};
      for (const c of itens) {
        const cat = c.ingrediente_id ? CH.dados.categoria(CH.dados.ing(c.ingrediente_id).categoria_id) : { secao_mercado: "Outros", ordem: 99 };
        (secoes[cat.secao_mercado] = secoes[cat.secao_mercado] || { ordem: cat.ordem, itens: [] }).itens.push(c);
      }
      return topo + Object.entries(secoes).sort((a, b) => a[1].ordem - b[1].ordem).map(([s, g]) => `<section class="ch-grupo"><h2 class="ch-sobrancelha">${CH.esc(s)}</h2>
        <ul class="ch-lista">${g.itens.sort((a, b) => a.comprado - b.comprado).map((c) => `<li class="ch-compra${c.comprado ? " ch-compra--ok" : ""}">
          <label class="ch-check"><input type="checkbox" data-compra="${c.id}" ${c.comprado ? "checked" : ""}><span>${CH.esc(c.descricao)}</span></label>
          <span class="ch-num ch-suave">${c.quantidade ? (c.ingrediente_id ? CH.fmt.qtd(c.quantidade, CH.dados.ing(c.ingrediente_id).unidade_base, c.ingrediente_id) : CH.fmt.enxuto(c.quantidade)) : ""}</span>
          <button class="ch-botao ch-botao--icone ch-botao--fantasma" data-acao="compra-excluir" data-id="${c.id}" type="button" aria-label="Remover ${CH.esc(c.descricao)}">${I("x")}</button></li>`).join("")}</ul></section>`).join("");
    },
  };
  CH.bus.on("change", (e) => { const id = e.target.dataset && e.target.dataset.compra; if (id) CH.tr.op("compras.marcar", { id, comprado: e.target.checked }); });
  CH.ui.registrar("compra-excluir", (el) => CH.tr.op("compras.excluir", { id: el.dataset.id }));
  CH.bus.on("submit", (e) => {
    const f = e.target; if (f.dataset.form !== "compra" || !f.item.value.trim()) return;
    let id = f.ingrediente_id.value;
    if (!id) { const m = CH.dados.casar(f.item.value); if (m.length && m[0].escore >= 0.8) id = m[0].id; }
    const q = CH.parseNum(f.quantidade.value);
    CH.tr.op("compras.salvar", { item: { id: CH.uuid(), ingrediente_id: id || null, descricao: id ? CH.dados.nomeIng(id) : f.item.value.trim(),
      quantidade: q && id ? CH.dados.paraBase(q, CH.dados.ing(id).unidade_base, id) : q, unidade: id ? CH.dados.ing(id).unidade_base : null, origem: "manual" } });
    f.reset(); f.ingrediente_id.value = ""; f.item.focus();
  });
  CH.ui.registrar("comprados-estoque", () => {
    const itens = CH.loja.get().compras.filter((c) => !c.excluido && c.comprado);
    let n = 0;
    for (const c of itens) {
      if (c.ingrediente_id) {
        const g = CH.dados.ing(c.ingrediente_id);
        CH.tr.op("lote.salvar", { lote: { id: CH.uuid(), ingrediente_id: g.id, descricao: g.nome, quantidade: c.quantidade || (g.unidade_base === "un" ? 1 : 500),
          local: g.armazenamento, validade: null, validade_origem: "estimada", data_compra: CH.hoje(), origem: "manual" } });
        n++;
      }
      CH.tr.op("compras.excluir", { id: c.id });
    }
    CH.ui.aviso(`${n} ${n === 1 ? "item foi" : "itens foram"} para o estoque com validade estimada. Escaneie os rótulos para ficar exato.`, "ok", 5200);
  });
})();
