// 10-dados.js: catalog (ingredients, synonyms, units, conversions, recipes) read from the embedded
// payload (a JSON script element with id "ch-dados", DLV-05), and indexes for fast lookup.
CH.dados = (() => {
  const D = { ingredientes: [], categorias: [], unidades: [], conversoes: [], receitas: [], exemplo: null };
  const idx = { ing: new Map(), cat: new Map(), uni: {}, conv: {}, sin: [], rec: new Map() };

  function carregar(payload) {
    Object.assign(D, payload);
    for (const c of D.categorias) idx.cat.set(c.id, c);
    for (const u of D.unidades) idx.uni[u.codigo] = { ...u, tipo: u.tipo, fator: u.fator_base == null ? null : +u.fator_base };
    for (const c of D.conversoes) idx.conv[`${c.ingrediente_id}|${c.unidade}`] = +c.qtd_base;
    for (const g of D.ingredientes) {
      g.validade_padrao_dias = +g.validade_padrao_dias;
      g.aberto_dias = g.aberto_dias === "" || g.aberto_dias == null ? null : +g.aberto_dias;
      g.basico = +g.basico === 1;
      idx.ing.set(g.id, g);
      const termos = [g.nome, ...(g.sinonimos ? String(g.sinonimos).split(";") : [])].map((t) => CH.core.normalizarTermo(t)).filter(Boolean);
      for (const t of new Set(termos)) idx.sin.push({ termo: t, id: g.id });
    }
    for (const r of D.receitas) {
      r.ingredientes = r.ingredientes.map((l) => {
        const g = idx.ing.get(l.ingrediente_id);
        let base = 0;
        try { base = CH.core.converterParaBase(+l.quantidade, l.unidade, { id: l.ingrediente_id, unidade_base: g.unidade_base }, idx.uni, idx.conv); }
        catch (e) { console.warn(e.message); }
        return { ...l, quantidade: +l.quantidade, base, opcional: +l.opcional === 1 };
      });
      idx.rec.set(r.id, r);
    }
  }
  const ing = (id) => idx.ing.get(id) || { id, nome: id, unidade_base: "un", categoria_id: "basicos", validade_padrao_dias: 7, aberto_dias: null };
  const nomeIng = (id) => ing(id).nome;
  const categoria = (id) => idx.cat.get(id) || { nome: id, secao_mercado: "Outros", ordem: 99 };
  const receita = (id) => idx.rec.get(id);
  const buscar = (texto, n = 8) => {
    const t = CH.core.normalizarTermo(texto);
    if (!t) return [];
    const vistos = new Map();
    for (const s of idx.sin) {
      const p = s.termo.startsWith(t) ? 3 : s.termo.split(" ").some((w) => w.startsWith(t)) ? 2 : s.termo.includes(t) ? 1 : 0;
      if (p && (!vistos.has(s.id) || vistos.get(s.id) < p)) vistos.set(s.id, p);
    }
    return [...vistos.entries()].sort((a, b) => b[1] - a[1] || ing(a[0]).nome.localeCompare(ing(b[0]).nome, "pt-BR"))
      .slice(0, n).map(([id]) => ing(id));
  };
  const casar = (texto) => CH.core.casarIngrediente(texto, idx.sin);
  const paraBase = (qtd, unidade, ingId) =>
    CH.core.converterParaBase(qtd, unidade, { id: ingId, unidade_base: ing(ingId).unidade_base }, idx.uni, idx.conv);
  const unidadesPara = (ingId) => {   // units that make sense for this ingredient (base type + its conversions)
    const base = ing(ingId).unidade_base, tipo = idx.uni[base] && idx.uni[base].tipo;
    return D.unidades.filter((u) => u.tipo === tipo || `${ingId}|${u.codigo}` in idx.conv).map((u) => u.codigo);
  };
  return { carregar, D, idx, ing, nomeIng, categoria, receita, buscar, casar, paraBase, unidadesPara };
})();
