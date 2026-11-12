// 20-loja.js: application state and the OPERATIONS contract.
// Every change is an operation {id, op, args, t}. aplicarOp() is pure and deterministic, and R applies
// the same operations to SQLite (R/operacoes.R) with the same results. The parity test is
// tests/webr/test-operacoes.R over tests/fixtures/golden_operacoes.json. Ids are UUIDs made on the
// device, so an operation re-sent after a reconnect is recognised and applied only once.
CH.loja = (() => {
  const vazio = () => ({ lotes: [], movimentos: [], compras: [], plano: null, sobras: [], produtos: {}, aprendidos: {}, config: {}, versao: 0 });
  let estado = vazio();

  const achar = (lista, id) => lista.find((x) => x.id === id);
  const diaDe = (t) => new Date(t).toLocaleDateString("sv-SE", { timeZone: CH.fuso });

  function aplicarOp(E, { id, op, args = {}, t }) {
    switch (op) {
      case "lote.salvar": {
        const l = args.lote, atual = achar(E.lotes, l.id);
        if (atual) Object.assign(atual, l, { criado_em: atual.criado_em, quantidade_inicial: atual.quantidade_inicial, atualizado_em: t });
        else {
          E.lotes.push({ status: "ativo", excluido: 0, local: "geladeira", validade_origem: "usuario", origem: "manual",
                         ...l, quantidade_inicial: l.quantidade, criado_em: t, atualizado_em: t });
          E.movimentos.push({ id: id + ":e", lote_id: l.id, tipo: "entrada", quantidade: l.quantidade, motivo: null,
                              valor_estimado: l.preco_total == null ? null : l.preco_total, a_tempo: null, criado_em: t });
        }
        break;
      }
      case "lote.baixar": {
        const l = achar(E.lotes, args.id);
        if (!l) throw new Error("lote inexistente: " + args.id);
        if (args.tipo === "descarte" && !args.motivo) throw new Error("descarte precisa de motivo");
        const q = Math.min(+args.quantidade, l.quantidade);
        l.quantidade = Math.round((l.quantidade - q) * 1e6) / 1e6;
        if (l.quantidade <= 1e-9) { l.quantidade = 0; l.status = args.tipo === "descarte" ? "descartado" : "consumido"; }
        l.atualizado_em = t;
        const valor = l.preco_total == null || !l.quantidade_inicial ? null : Math.round((l.preco_total * q / l.quantidade_inicial) * 100) / 100;
        E.movimentos.push({ id: id + ":b", lote_id: l.id, tipo: args.tipo, quantidade: -q, motivo: args.motivo || null,
                            valor_estimado: valor, refeicao_id: args.refeicao_id || null,
                            a_tempo: args.tipo === "consumo" && args.validade_efetiva ? diaDe(t) <= args.validade_efetiva : null,
                            criado_em: t });
        break;
      }
      case "lote.abrir": { const l = achar(E.lotes, args.id); if (l) { l.aberto_em = args.data; l.atualizado_em = t; } break; }
      case "lote.mover": {
        const l = achar(E.lotes, args.id);
        if (l) { l.local = args.local; if (args.validade) { l.validade = args.validade; l.validade_origem = args.validade_origem || "estimada"; } l.atualizado_em = t; }
        break;
      }
      case "lote.excluir": { const l = achar(E.lotes, args.id); if (l) { l.excluido = 1; l.atualizado_em = t; } break; }
      case "compras.salvar": {
        const it = args.item, atual = achar(E.compras, it.id);
        if (atual) Object.assign(atual, it, { atualizado_em: t });
        else E.compras.push({ comprado: 0, excluido: 0, ...it, atualizado_em: t });
        break;
      }
      case "compras.marcar": { const it = achar(E.compras, args.id); if (it) { it.comprado = args.comprado ? 1 : 0; it.atualizado_em = t; } break; }
      case "compras.excluir": { const it = achar(E.compras, args.id); if (it) { it.excluido = 1; it.atualizado_em = t; } break; }
      case "plano.salvar": E.plano = { ...args.plano, criado_em: t }; break;
      case "refeicao.marcar": {
        const r = E.plano && E.plano.refeicoes.find((x) => x.id === args.id);
        if (r) r.status = args.status;
        break;
      }
      case "sobra.salvar": {
        const s = args.sobra, atual = achar(E.sobras, s.id);
        if (atual) Object.assign(atual, s, { atualizado_em: t });
        else E.sobras.push({ status: "ativa", excluido: 0, local: "geladeira", ...s, atualizado_em: t });
        break;
      }
      case "sobra.baixar": {
        const s = achar(E.sobras, args.id);
        if (s) { s.porcoes = Math.max(0, s.porcoes - args.porcoes); if (s.porcoes <= 0) s.status = args.tipo === "descarte" ? "descartada" : "consumida"; s.atualizado_em = t; }
        break;
      }
      case "config.salvar": E.config = { ...E.config, [args.chave]: args.valor }; break;
      case "produto.salvar": E.produtos = { ...(E.produtos || {}), [args.gtin]: { ingrediente_id: args.ingrediente_id, descricao: args.descricao || null, qtd_embalagem: args.qtd_embalagem == null ? null : args.qtd_embalagem } }; break;
      case "sinonimo.aprender": E.aprendidos = { ...(E.aprendidos || {}), [args.termo]: args.ingrediente_id }; break;
      case "tudo.apagar": { const c = E.config, p = E.produtos, a = E.aprendidos; Object.assign(E, vazio(), { config: c, produtos: p, aprendidos: a }); break; }
      default: throw new Error("operação desconhecida: " + op);
    }
    E.versao = (E.versao || 0) + 1;
    return E;
  }

  // ---------- derived values (client-side reading; no writes) ----------
  function lotesAtivos() {
    return estado.lotes.filter((l) => l.status === "ativo" && !l.excluido && l.quantidade > 0).map((l) => {
      const g = CH.dados.ing(l.ingrediente_id);
      const ve = CH.core.validadeEfetiva(l, g);
      const dias = CH.dias(ve);
      return { ...l, ing: g, validade_efetiva: ve, dias, faixa: CH.core.faixaValidade(dias),
               aberto_limita: !!(l.aberto_em && g.aberto_dias != null && (!l.validade || ve < l.validade)) };
    }).sort((a, b) => (a.validade_efetiva || "9999").localeCompare(b.validade_efetiva || "9999"));
  }
  function resumoMes(mesIso = CH.hoje().slice(0, 7)) {
    let evitado = 0, descartado = 0, kgDesc = 0, usadosATempo = 0, consumos = 0;
    for (const m of estado.movimentos) {
      if (!m.criado_em || diaDe(m.criado_em).slice(0, 7) !== mesIso) continue;
      if (m.tipo === "consumo") { consumos++; if (m.a_tempo) { usadosATempo++; evitado += m.valor_estimado || 0; } }
      if (m.tipo === "descarte") {
        descartado += m.valor_estimado || 0;
        const l = achar(estado.lotes, m.lote_id);
        if (l && CH.dados.ing(l.ingrediente_id).unidade_base === "g") kgDesc += -m.quantidade / 1000;
      }
    }
    const baixas = consumos + estado.movimentos.filter((m) => m.tipo === "descarte" && m.criado_em && diaDe(m.criado_em).slice(0, 7) === mesIso).length;
    return { evitado, descartado, kgDesc, aproveitamento: baixas ? usadosATempo / baixas : null, consumos };
  }

  return {
    get: () => estado,
    set: (novo) => { estado = { ...vazio(), ...novo }; CH.bus.emit("estado", estado); },
    aplicar: (op) => { aplicarOp(estado, op); CH.bus.emit("estado", estado); },
    aplicarOp, vazio, lotesAtivos, resumoMes,
  };
})();
