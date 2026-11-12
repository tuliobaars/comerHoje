// 62-plano.js: weekly plan (greedy FEFO in the browser; MILP on the server when available),
// cooking (FEFO consumption) and leftovers.
(() => {
  const I = (n, c) => CH.icone(n, c);
  const NOMES_REF = { cafe: "Café", almoco: "Almoço", lanche: "Lanche", jantar: "Jantar" };

  function slotsSemana(dias = 7) {
    const cfg = CH.loja.get().config, refs = cfg.refeicoes || ["almoco", "jantar"], hoje = CH.hoje(), hora = new Date().getHours();
    const S = [];
    for (let d = 0; d < dias; d++) {
      const data = CH.core.somarDias(hoje, d);
      for (const r of refs) {
        if (d === 0 && ((r === "almoco" && hora >= 14) || (r === "cafe" && hora >= 10))) continue;
        S.push({ id: `${data}:${r}`, data, refeicao: r });
      }
    }
    return S;
  }
  function receitasPara(pessoas) {
    return CH.dados.D.receitas.filter((r) => ["prato_unico", "mistura"].includes(r.tipo)).map((r) => ({
      id: r.id, ingredientes: r.ingredientes.filter((l) => !l.opcional && !CH.dados.ing(l.ingrediente_id).basico && l.base > 0)
        .map((l) => ({ id: l.ingrediente_id, qtd: (l.base * pessoas) / r.porcoes })) })).filter((r) => r.ingredientes.length);
  }

  async function gerar() {
    const pessoas = +(CH.loja.get().config.pessoas || 2);
    const lotes = CH.loja.lotesAtivos().filter((l) => l.faixa !== "vencido" && !l.ing.basico);
    const slots = slotsSemana();
    let res, metodo = "guloso";
    if (CH.tr.capacidades.milp) {
      try { res = await CH.tr.consulta("plano.milp", { pessoas, slots }, 30000); metodo = res.metodo || "milp"; }
      catch (e) { CH.ui.aviso("Otimizador do servidor indisponível; usando o método do aparelho.", "info"); }
    }
    if (!res) res = CH.core.planejarGuloso(lotes.map((l) => ({ id: l.id, ingrediente: l.ingrediente_id, qtd: l.quantidade, validade_efetiva: l.validade_efetiva })),
      receitasPara(pessoas), slots);
    const plano = { id: CH.uuid(), inicio: slots[0].data, fim: slots[slots.length - 1].data, metodo, pessoas,
      refeicoes: slots.map((s, i) => ({ id: s.id, data: s.data, refeicao: s.refeicao, receita_id: res.plano[i].receita || null, status: "planejado",
        usa: (res.plano[i].uso || []).map((u) => u.lote) })),
      compras: Object.entries(res.compras || {}).map(([id, q]) => ({ id, q: Math.round(q) })) };
    CH.tr.op("plano.salvar", { plano });
    CH.ui.aviso(`Plano da semana gerado (${metodo === "milp" ? "otimizador do servidor" : "no aparelho"}).`, "ok");
  }

  // FEFO consumption for a recipe, with explicit operations (the server receives the same ones)
  CH.cozinhar = (receitaId, refeicaoId = null) => {
    const r = CH.dados.receita(receitaId); if (!r) return;
    const pessoas = +(CH.loja.get().config.pessoas || 2);
    const lotes = CH.loja.lotesAtivos().filter((l) => l.faixa !== "vencido");
    const usos = [];
    for (const ing of r.ingredientes) {
      if (ing.opcional || CH.dados.ing(ing.ingrediente_id).basico || !ing.base) continue;
      let falta = (ing.base * pessoas) / r.porcoes;
      for (const l of lotes.filter((x) => x.ingrediente_id === ing.ingrediente_id)) {   // already sorted by expiry
        if (falta <= 1e-9) break;
        const q = Math.min(falta, l.quantidade); falta -= q; l.quantidade -= q;
        usos.push({ l, q });
      }
    }
    CH.ui.folha(`Cozinhar: ${CH.esc(r.nome)}`, `
      <p class="ch-suave">Isto sai do estoque (${pessoas} porções, primeiro o que vence antes):</p>
      <ul class="ch-lista ch-lista--simples">${usos.length ? usos.map(({ l, q }) => `<li><span>${CH.esc(l.ing.nome)}</span><span class="ch-num">${CH.fmt.qtd(q, l.ing.unidade_base, l.ingrediente_id)}</span></li>`).join("")
        : `<li class="ch-suave">Nada do estoque (só básicos).</li>`}</ul>
      <label class="ch-campo"><span class="ch-rotulo">Sobrou alguma porção para depois?</span>
        <span class="ch-linha"><input class="ch-entrada" id="ch-sobras" inputmode="numeric" placeholder="0"> <span class="ch-suave">porções (vale 3 dias na geladeira)</span></span></label>
      <button class="ch-botao ch-botao--primario ch-botao--bloco" data-acao="confirmar-cozinhar" type="button">Feito</button>`);
    CH.ui.registrar("confirmar-cozinhar", () => {
      for (const { l, q } of usos) CH.tr.op("lote.baixar", { id: l.id, quantidade: q, tipo: "consumo", validade_efetiva: l.validade_efetiva, refeicao_id: refeicaoId });
      const s = parseInt(CH.$("#ch-sobras").value || "0", 10);
      if (s > 0) CH.tr.op("sobra.salvar", { sobra: { id: CH.uuid(), receita_id: r.id, descricao: r.nome, porcoes: s, feita_em: CH.hoje(), validade: CH.core.somarDias(CH.hoje(), 3), local: "geladeira" } });
      if (refeicaoId) CH.tr.op("refeicao.marcar", { id: refeicaoId, status: "feito" });
      CH.ui.fecharFolha();
      CH.ui.aviso(`Bom apetite! ${usos.length} ${usos.length === 1 ? "item baixado" : "itens baixados"} do estoque.`, "ok");
    });
  };

  CH.telas.plano = {
    titulo: "Plano",
    render() {
      const P = CH.loja.get().plano, hoje = CH.hoje();
      const topo = `<header class="ch-tela-topo"><div><p class="ch-sobrancelha">${P ? `${CH.fmt.data(P.inicio, true)} a ${CH.fmt.data(P.fim, true)} · ${P.pessoas || 2} pessoas` : "7 dias"}</p><h1 class="ch-titulo">Plano da semana</h1></div>
        <button class="ch-botao ch-botao--primario" data-acao="gerar-plano" type="button">${I("sparkles")} ${P ? "Refazer" : "Gerar plano"}</button></header>`;
      if (!P) return topo + CH.ui.vazio("calendar-days", "Nenhum plano ainda", "O plano usa primeiro o que vence antes e lista só o que falta comprar.",
        `<button class="ch-botao ch-botao--primario" data-acao="gerar-plano" type="button">Gerar plano da semana</button>`);
      const L = CH.loja.lotesAtivos(), porDia = {};
      for (const r of P.refeicoes) (porDia[r.data] = porDia[r.data] || []).push(r);
      const dias = Object.keys(porDia).sort();
      const faixa = `<div class="ch-semana" role="list">${dias.map((d) => `<a role="listitem" class="ch-dia${d === hoje ? " ch-dia--hoje" : ""}" href="#/plano/${d}">
          <span>${CH.fmt.diaSemana(d)}</span><b class="ch-num">${+d.slice(8)}</b></a>`).join("")}</div>`;
      const cartoes = dias.map((d) => `<section class="ch-dia-bloco" id="dia-${d}"><h2 class="ch-sobrancelha">${CH.fmt.diaSemana(d, true)}, ${CH.fmt.data(d, true)}</h2>
        <div class="ch-grade ch-grade--refeicoes">${porDia[d].map((r) => {
          const rec = r.receita_id && CH.dados.receita(r.receita_id);
          const salva = (r.usa || []).map((id) => L.find((l) => l.id === id)).filter((l) => l && l.dias != null && l.dias <= 3);
          return `<article class="ch-cartao ch-refeicao ch-refeicao--${r.status}">
            <header class="ch-cartao-topo"><span class="ch-sobrancelha">${NOMES_REF[r.refeicao] || r.refeicao}</span>
              ${r.status === "feito" ? CH.ui.chip("ok", "feito") : salva.length ? CH.ui.chip("urgente", "salva " + salva.map((l) => l.ing.nome.toLowerCase()).join(", ")) : ""}</header>
            <h3 class="ch-receita-nome">${rec ? CH.esc(rec.nome) : `<span class="ch-suave">Sobras ou livre</span>`}</h3>
            ${rec && r.status === "planejado" ? `<div class="ch-botoes"><button class="ch-botao ch-botao--pequeno" data-acao="feito" data-id="${r.id}" data-receita="${rec.id}" type="button">${I("check")} Feito</button>
              <button class="ch-botao ch-botao--pequeno ch-botao--fantasma" data-acao="pular" data-id="${r.id}" type="button">Pular</button></div>` : ""}
          </article>`; }).join("")}</div></section>`).join("");
      const falta = (P.compras || []).filter((c) => c.q > 0);
      const compras = falta.length ? `<article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Falta comprar para este plano</h2>
          <button class="ch-botao ch-botao--pequeno" data-acao="plano-para-compras" type="button">${I("shopping-cart")} Pôr na lista</button></header>
          <ul class="ch-lista ch-lista--simples">${falta.map((c) => `<li><span>${CH.esc(CH.dados.nomeIng(c.id))}</span><span class="ch-num">${CH.fmt.qtd(c.q, CH.dados.ing(c.id).unidade_base, c.id)}</span></li>`).join("")}</ul></article>` : "";
      const nota = `<p class="ch-suave ch-legenda">${P.metodo === "milp" ? "Otimizado no servidor (programação inteira)." : "Calculado no aparelho: primeiro o que vence antes."} Básicos (sal, óleo, açúcar…) não entram na conta.</p>`;
      return topo + faixa + cartoes + compras + nota;
    },
  };
  CH.ui.registrar("gerar-plano", gerar);
  CH.ui.registrar("feito", (el) => CH.cozinhar(el.dataset.receita, el.dataset.id));
  CH.ui.registrar("pular", (el) => CH.tr.op("refeicao.marcar", { id: el.dataset.id, status: "pulado" }));
  CH.ui.registrar("plano-para-compras", () => {
    const P = CH.loja.get().plano, atuais = CH.loja.get().compras.filter((c) => !c.excluido);
    let n = 0;
    for (const c of P.compras || []) {
      if (c.q <= 0 || atuais.some((a) => a.ingrediente_id === c.id && !a.comprado)) continue;
      CH.tr.op("compras.salvar", { item: { id: CH.uuid(), ingrediente_id: c.id, descricao: CH.dados.nomeIng(c.id), quantidade: c.q, unidade: CH.dados.ing(c.id).unidade_base, origem: "plano" } });
      n++;
    }
    CH.ui.aviso(n ? `${n} ${n === 1 ? "item adicionado" : "itens adicionados"} à lista de compras.` : "Tudo já estava na lista.", "ok");
  });
})();
