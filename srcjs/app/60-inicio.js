// 60-inicio.js: home. Lumen: headline promise + big numbers explained + one dot per item.
// Neue: "kitchen at a glance" KPI tiles with mono figures, ruled use-first table.
(() => {
  const I = (n, c) => CH.icone(n, c);

  // Dinner (or lunch) suggestion for today: the greedy planner over the current stock.
  CH.sugestaoHoje = () => {
    const lotes = CH.loja.lotesAtivos().filter((l) => l.faixa !== "vencido" && !l.ing.basico);
    if (!lotes.length) return null;
    const pessoas = +(CH.loja.get().config.pessoas || 2);
    const receitas = CH.dados.D.receitas.filter((r) => ["prato_unico", "mistura"].includes(r.tipo)).map((r) => ({
      id: r.id, ingredientes: r.ingredientes.filter((l) => !l.opcional && !CH.dados.ing(l.ingrediente_id).basico && l.base > 0)
        .map((l) => ({ id: l.ingrediente_id, qtd: (l.base * pessoas) / r.porcoes })) })).filter((r) => r.ingredientes.length);
    const P = CH.core.planejarGuloso(lotes.map((l) => ({ id: l.id, ingrediente: l.ingrediente_id, qtd: l.quantidade, validade_efetiva: l.validade_efetiva })),
      receitas, [{ id: "hoje", data: CH.hoje() }], { semRepetir: 0 });
    const p = P.plano[0];
    if (!p.receita) return null;
    const r = CH.dados.receita(p.receita);
    const usados = [...new Set(p.uso.map((u) => lotes.find((l) => l.id === u.lote)).filter(Boolean))];
    const salva = usados.filter((l) => l.dias != null && l.dias <= 3);
    return { receita: r, usados, salva, falta: Object.entries(P.compras).map(([id, q]) => ({ id, q })), cobertura: p.cobertura };
  };

  function pontos(lotes) {   // LUM-C-08: one dot per item, columns by urgency band
    const colunas = [["vencido", "Vencidos"], ["urgente", "Até 3 dias"], ["atencao", "Esta semana"], ["ok", "Depois"]];
    return `<div class="ch-pontos" role="img" aria-label="${lotes.length} itens: ${colunas.map(([f, t]) => `${lotes.filter((l) => l.faixa === f).length} ${t.toLowerCase()}`).join(", ")}">
      ${colunas.map(([f, t]) => { const L = lotes.filter((l) => l.faixa === f || (f === "ok" && l.faixa === "sem"));
        return `<div class="ch-pontos-col"><div class="ch-pontos-grade">${L.map((l) => `<i class="ch-ponto ch-ponto--${l.faixa}" title="${CH.esc(l.ing.nome)} · ${CH.esc(CH.fmt.validade(l.dias))}"></i>`).join("")}</div>
          <div class="ch-pontos-rotulo"><b class="ch-num">${L.length}</b><span>${t}</span></div></div>`; }).join("")}
    </div>`;
  }

  function cartaoSugestao(s) {
    if (!s) return `<article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Sugestão para hoje</h2></header>
      <p class="ch-suave">Sem receita que use bem o que você tem agora. Que tal escanear o que chegou do mercado?</p></article>`;
    const pessoas = +(CH.loja.get().config.pessoas || 2);
    return `<article class="ch-cartao ch-cartao--sugestao">
      <header class="ch-cartao-topo"><h2 class="ch-sobrancelha">${new Date().getHours() < 15 ? "Sugestão para o almoço" : "Sugestão para o jantar"}</h2>
        ${s.salva.length ? CH.ui.chip("urgente", "salva " + s.salva.length + (s.salva.length > 1 ? " itens" : " item")) : ""}</header>
      <h3 class="ch-receita-nome">${CH.esc(s.receita.nome)}</h3>
      <p class="ch-receita-linha">${I("check")}<span>usa: ${s.usados.map((l) => `${CH.esc(l.ing.nome.toLowerCase())}${l.dias != null && l.dias <= 3 ? ` <span class="ch-suave">(${CH.fmt.validade(l.dias)})</span>` : ""}`).join(", ")}</span></p>
      ${s.falta.length ? `<p class="ch-receita-linha ch-suave">${I("shopping-cart")}<span>falta: ${s.falta.map((f) => `${CH.esc(CH.dados.nomeIng(f.id).toLowerCase())} ${CH.fmt.qtd(f.q, CH.dados.ing(f.id).unidade_base, f.id)}`).join(", ")}</span></p>` : ""}
      <div class="ch-botoes"><button class="ch-botao ch-botao--primario" data-acao="cozinhar" data-receita="${s.receita.id}" type="button">Vou fazer · ${pessoas} porções</button>
        <a class="ch-botao ch-botao--fantasma" href="#/plano">Ver a semana</a></div></article>`;
  }

  CH.telas.inicio = {
    titulo: "Início",
    render() {
      const lumen = CH.ap.framework === "lumen";
      const L = CH.loja.lotesAtivos(), urg = L.filter((l) => l.faixa === "urgente" || l.faixa === "vencido");
      const res = CH.loja.resumoMes(), s = CH.sugestaoHoje(), hoje = CH.hoje();
      if (!L.length) {
        return `${lumen ? `<section class="ch-hero"><p class="ch-sobrancelha">${CH.fmt.extenso(hoje)}</p>
            <h1 class="ch-display">Comer hoje,<br><span class="ch-grad">sem desperdício.</span></h1>
            <p class="ch-lede">Fotografe a validade do que chegou do mercado. O comerHoje lembra o que vence antes e sugere o que cozinhar.</p></section>`
          : `<header class="ch-tela-topo"><div><p class="ch-sobrancelha">${CH.fmt.extenso(hoje)}</p><h1 class="ch-titulo">Início</h1></div></header>`}
          ${CH.ui.vazio("scan-line", "Sua cozinha ainda está vazia aqui", "Escaneie a validade de um item, adicione à mão ou carregue o exemplo feito com as fotos de referência.",
            `<a class="ch-botao ch-botao--primario ch-botao--grande" href="#/escanear">${I("scan-line")} Escanear validade</a>
             <button class="ch-botao ch-botao--fantasma" data-acao="exemplo" type="button">Carregar exemplo</button>`)}`;
      }
      const lista = (L.filter((l) => l.faixa !== "ok" && l.faixa !== "sem").length ? L.filter((l) => l.faixa !== "ok" && l.faixa !== "sem") : L).slice(0, 5);
      const usePrimeiro = `<article class="ch-cartao ch-cartao--use">
        <header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Use primeiro</h2><a class="ch-link" href="#/estoque">Estoque ${I("chevron-right")}</a></header>
        <ul class="ch-lista">${lista.map(CH.ui.itemLote).join("")}</ul></article>`;
      const tiles = [
        { v: CH.fmt.brl(res.evitado), t: "evitados", d: `Valor do que foi usado antes de vencer em ${CH.fmt.mes(hoje)}, pelos preços registrados.` },
        { v: CH.fmt.brl(res.descartado), t: "descartados", d: res.kgDesc ? `${CH.fmt.enxuto(res.kgDesc)} kg foram para o lixo este mês.` : "O que foi jogado fora este mês, pelo preço pago." },
        { v: res.aproveitamento == null ? "—" : CH.fmt.num(res.aproveitamento * 100) + " %", t: "aproveitamento", d: "Dos itens que saíram do estoque, quantos foram usados a tempo." },
      ];
      if (lumen) {
        const frase = urg.length ? `${urg.length} ${urg.length === 1 ? "item vence" : "itens vencem"} nos próximos 3 dias.${s && s.salva.length ? ` ${CH.esc(s.receita.nome)} resolve ${s.salva.length === 1 ? "um deles" : "parte deles"}.` : ""}`
          : `Nada vence nos próximos 3 dias. ${L.length} itens no estoque.`;
        return `<section class="ch-hero"><p class="ch-sobrancelha">${CH.fmt.extenso(hoje)}</p>
            <h1 class="ch-display">Comer hoje,<br><span class="ch-grad">sem desperdício.</span></h1>
            <p class="ch-lede">${frase}</p>
            <div class="ch-botoes"><a class="ch-botao ch-botao--primario ch-botao--grande" href="#/escanear">${I("scan-line")} Escanear validade</a>
              <a class="ch-botao ch-botao--fantasma ch-botao--grande" href="#/estoque">Ver estoque</a></div></section>
          <div class="ch-grade ch-grade--inicio">${usePrimeiro}${cartaoSugestao(s)}
            <article class="ch-cartao ch-cartao--historia"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Sua cozinha, item por item</h2></header>
              ${pontos(L)}<p class="ch-suave ch-legenda">Cada ponto é uma embalagem. A cor diz quando vence, e a legenda diz quantos.</p></article>
            ${tiles.map((x) => `<article class="ch-cartao ch-tile"><p class="ch-tile-num ch-num">${x.v}</p><p class="ch-tile-rot">${x.t}</p><p class="ch-tile-exp">${x.d}</p></article>`).join("")}
          </div>`;
      }
      const kpis = [
        { v: L.length, t: "itens ativos", href: "#/estoque" },
        { v: urg.length, t: "vencem em ≤ 3 dias", href: "#/estoque", cls: urg.length ? "ch-kpi--alerta" : "" },
        { v: CH.fmt.brl(res.evitado), t: `evitados em ${CH.fmt.mes(hoje)}`, href: "#/estoque" },
        { v: CH.fmt.brl(res.descartado), t: "descartados", href: "#/estoque" },
      ];
      return `<header class="ch-tela-topo"><div><p class="ch-sobrancelha">${CH.fmt.extenso(hoje)}</p><h1 class="ch-titulo">Resumo da cozinha</h1></div>
          <a class="ch-botao ch-botao--primario" href="#/escanear">${I("scan-line")} Escanear</a></header>
        <section class="ch-kpis" aria-label="Resumo">${kpis.map((k) => `<a class="ch-kpi ${k.cls || ""}" href="${k.href}"><span class="ch-kpi-num ch-num">${k.v}</span><span class="ch-kpi-rot">${k.t}</span></a>`).join("")}</section>
        <div class="ch-grade ch-grade--inicio">${usePrimeiro}${cartaoSugestao(s)}
          <article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Por validade</h2></header>${pontos(L)}</article></div>`;
    },
  };

  CH.ui.registrar("cozinhar", (el) => CH.cozinhar(el.dataset.receita));
})();
