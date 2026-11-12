// comerhoje-core.js: pure logic shared by the three targets (Shiny, Quarto, HTML).
// No DOM and no network. R parity: R/core_*.R passes the same tests/fixtures/*.json (DLV-31).
"use strict";
(function (raiz) {
  const DIA_MS = 86400000;
  const iso = (d) => d.toISOString().slice(0, 10);
  const dataUTC = (a, m, d) => {
    const x = new Date(Date.UTC(a, m - 1, d));
    return (x.getUTCFullYear() === a && x.getUTCMonth() === m - 1 && x.getUTCDate() === d) ? x : null;
  };
  const ultimoDiaMes = (a, m) => (m >= 1 && m <= 12 ? new Date(Date.UTC(a, m, 0)) : null);
  const diasEntre = (de, ate) => Math.round((ate - de) / DIA_MS);
  const parseISO = (s) => { const [a, m, d] = String(s).slice(0, 10).split("-").map(Number); return dataUTC(a, m, d); };
  const somarDias = (s, n) => iso(new Date(parseISO(s).getTime() + n * DIA_MS));

  // ---------- 1. text ----------
  const semAcentos = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const normalizarTermo = (s) => semAcentos(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  // for matching: without Portuguese particles (receipts write "MOLHO TOMATE" for "molho de tomate")
  const semParticulas = (s) => (" " + s + " ").replace(/ (de|da|do|das|dos|d|com|em|e|a|o|para) /g, " ").replace(/ (de|da|do|das|dos|d|com|em|e|a|o|para) /g, " ").replace(/ +/g, " ").trim();

  function normalizarOcr(txt) {
    let s = semAcentos(String(txt).replace(/[\uff0c]/g, ",").replace(/[\uff0e]/g, ".").replace(/[\uff1a]/g, ":").replace(/[\uff0f]/g, "/")).toUpperCase();
    s = s.replace(/\bVAL\s*[JIL1|/\\]?\s*LOTE/g, "VAL/LOTE");            // "VALJLOTE" (PaddleOCR, leite)
    s = s.replace(/(\d)\s*['´`\\|]\s*(?=\d)/g, "$1/");                 // 19/01'2027 (Tesseract, panceta)
    s = s.replace(/(?<=\d)O(?=\d)/g, "0").replace(/(?<=\d)[IL](?=\d)/g, "1");
    return s;
  }

  // ---------- 2. dates on labels ----------
  const ANCORAS = [
    ["validade",   /\b(VALIDADE|VALID|VAL|V[BRE8]L|VAI|VENCIMENTO|VENC|V(?=\s*[:.]\s*\d)|CONSUMIR\s+(PREFERENCIALMENTE\s+)?(ATE|ANTES)|BEST\s+BEFORE|EXP(IRY|IRA)?|SCAD(ENZA)?|DA\s+CONSUMARSI)\b/g],
    ["fabricacao", /\b(FABRICACAO|FABRICADO|FABR|FAB|PRODUCAO|PROD|EMBALADO(\s+EM)?|EMB|F(?=\s*:))\b/g],
    ["pesagem",    /\bPESAG\w*/g],
    ["lote",       /\b(LOTE|LOT|L(?=\s*:))\b/g],
  ];
  const MESES = { JAN: 1, FEV: 2, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAI: 5, MAY: 5, JUN: 6, JUL: 7,
                  AGO: 8, AUG: 8, SET: 9, SEP: 9, OUT: 10, OCT: 10, NOV: 11, DEZ: 12, DEC: 12 };
  const MES_RE = Object.keys(MESES).join("|");
  const ano4 = (a) => (a.length === 2 ? 2000 + +a : +a);
  const PADROES = [ // order = priority when matches overlap
    { formato: "AAAA-MM-DD", re: /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g, f: (m) => dataUTC(+m[1], +m[2], +m[3]) },
    { formato: "DD/MM/AAAA", re: /(?<!\d)(\d{1,2})[\/.\- ]{1,2}(\d{1,2})[\/.\- ]{1,2}(\d{4})(?!\d)/g,
      f: (m) => dataUTC(+m[3], +m[2], +m[1]) },
    { formato: "DD/MM/AA", re: /(?<!\d)(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2})(?!\d)/g,
      f: (m) => dataUTC(2000 + +m[3], +m[2], +m[1]) },
    { formato: "DD MMM AAAA", re: new RegExp(`(?<![A-Z\\d])(\\d{1,2})[\\/.\\- ]{0,2}(${MES_RE})[A-Z]*\\.?[\\/.\\- ]{0,2}(\\d{4}|\\d{2})(?!\\d)`, "g"),
      f: (m) => dataUTC(ano4(m[3]), MESES[m[2]], +m[1]) },
    { formato: "MMM/AAAA", re: new RegExp(`(?<![A-Z\\d])(${MES_RE})[A-Z]*\\.?[\\/.\\- ]{0,2}(\\d{4}|\\d{2})(?!\\d)`, "g"),
      f: (m) => ultimoDiaMes(ano4(m[2]), MESES[m[1]]), fimDoMes: true },
    { formato: "MM/AAAA", re: /(?<![\d\/.\-])(\d{1,2})[\/.\-](\d{4})(?![\d\/.\-])/g,
      f: (m) => ultimoDiaMes(+m[2], +m[1]), fimDoMes: true },
    { formato: "DDMMAAAA", re: /(?<![\d\/.\-])(?<!\d:)(\d{2})(\d{2})(20\d{2})(?![\d\/.\-:])/g,       // "29062027"
      f: (m) => dataUTC(+m[3], +m[2], +m[1]), compacto: true },
    { formato: "DDMMAA", re: /(?<![\d\/.\-])(?<!\d:)(\d{2})(\d{2})(\d{2})(?=\d{2}:\d{2})/g,           // "19032701:05"
      f: (m) => dataUTC(2000 + +m[3], +m[2], +m[1]), compacto: true },
    { formato: "DDMMAA", re: /(?<![\d\/.\-])(?<!\d:)(\d{2})(\d{2})(\d{2})(?![\d\/.\-:])/g,
      f: (m) => dataUTC(2000 + +m[3], +m[2], +m[1]), compacto: true },
    { formato: "MMAAAA", re: /(?<![\d\/.\-])(?<!\d:)(0[1-9]|1[0-2])(20\d{2})(?![\d\/.\-:])/g,         // "032027", anchored only
      f: (m) => ultimoDiaMes(+m[2], +m[1]), fimDoMes: true, compacto: true, soAncorado: true },
  ];

  function ancoraPara(linhas, i, col) {
    let melhor = null;
    for (const [tipo, re] of ANCORAS) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(linhas[i])) !== null) {
        const fim = m.index + m[0].length;
        if (fim <= col && col - fim <= 25 && (!melhor || fim > melhor.fim)) melhor = { tipo, fim };
      }
    }
    if (melhor) return melhor.tipo;
    if (i > 0) {   // previous line acting as a header (e.g. "VAL./LOTE:")
      let primeira = null;
      for (const [tipo, re] of ANCORAS) {
        re.lastIndex = 0; const m = re.exec(linhas[i - 1]);
        if (m && (!primeira || m.index < primeira.idx)) primeira = { tipo, idx: m.index };
      }
      if (primeira) return primeira.tipo;
    }
    return null;
  }

  function extrairDatas(texto, hojeISO) {
    const hoje = parseISO(hojeISO);
    const linhas = normalizarOcr(texto).split(/\r?\n|\s\|\s/);
    const cand = [];
    linhas.forEach((linha, i) => {
      const ocupado = [];
      for (const p of PADROES) {
        p.re.lastIndex = 0; let m;
        while ((m = p.re.exec(linha)) !== null) {
          const ini = m.index, fim = ini + m[0].length;
          if (ocupado.some(([a, b]) => ini < b && fim > a)) continue;
          const d = p.f(m);
          if (!d) continue;
          const ancora = ancoraPara(linhas, i, ini);
          if (p.soAncorado && ancora !== "validade") continue;
          ocupado.push([ini, fim]);
          if (ancora === "lote") continue;
          cand.push({ data: iso(d), formato: p.formato, trecho: m[0].trim(), linha: i,
                      tipo: ancora || "desconhecido", compacto: !!p.compacto, fimDoMes: !!p.fimDoMes,
                      dias: diasEntre(hoje, d) });
        }
      }
    });
    const ok = cand.filter((c) => (c.tipo === "validade" || c.tipo === "desconhecido")
      ? c.dias >= -365 && c.dias <= 5 * 365 : c.dias <= 1 && c.dias >= -5 * 365);
    const semAncora = ok.filter((c) => c.tipo === "desconhecido");
    if (semAncora.length >= 2 && !ok.some((c) => c.tipo === "validade")) {
      semAncora.sort((a, b) => a.dias - b.dias);
      Object.assign(semAncora[semAncora.length - 1], { tipo: "validade", semAncora: true });
      if (semAncora[0].dias <= 1) semAncora[0].tipo = "fabricacao";
    } else if (semAncora.length === 1 && !ok.some((c) => c.tipo === "validade") && semAncora[0].dias >= 0) {
      Object.assign(semAncora[0], { tipo: "validade", semAncora: true });
    }
    for (const c of ok) {
      let conf = 0.5;
      if (c.tipo === "validade" && !c.semAncora) conf += 0.3;
      if (c.semAncora) conf -= 0.1;
      if (/AAAA/.test(c.formato)) conf += 0.1;
      if (c.compacto) conf -= 0.15;
      if (c.fimDoMes) conf -= 0.05;
      c.confianca = Math.round(Math.max(0, Math.min(1, conf)) * 100) / 100;
    }
    const vals = ok.filter((c) => c.tipo === "validade").sort((a, b) => b.confianca - a.confianca);
    const pega = (t) => (ok.find((c) => c.tipo === t) || {}).data || null;
    return { validade: vals.length ? vals[0].data : null, confianca: vals.length ? vals[0].confianca : 0,
             trecho: vals.length ? vals[0].trecho : null,
             fabricacao: pega("fabricacao"), pesagem: pega("pesagem"), candidatos: ok };
  }

  // Combines the readings of several OCR variants. Each reading may carry `peso` (fidelity:
  // 1 = full-resolution crop without filters, .7 = reduced overview, .6 = dot-matrix filter).
  // The winner has the largest sum of conf x peso. Agreement raises confidence. A strong rival
  // (weighted max >= 80 % of the winner's) caps it at .6, so the UI asks the user to confirm and
  // offers the rival dates as chips.
  function votarDatas(leituras) {
    const votos = new Map();
    for (const l of leituras) {
      if (!l || !l.validade) continue;
      const p = l.peso == null ? 1 : l.peso;
      const v = votos.get(l.validade) || { data: l.validade, n: 0, nFiel: 0, soma: 0, maxP: 0, max: 0, trecho: l.trecho };
      v.n += 1; if (p >= 1) v.nFiel += 1;
      v.soma += l.confianca * p; v.maxP = Math.max(v.maxP, l.confianca * p); v.max = Math.max(v.max, l.confianca);
      votos.set(l.validade, v);
    }
    const lista = [...votos.values()].sort((a, b) => b.soma - a.soma || b.maxP - a.maxP);
    const pega = (k) => { for (const l of leituras) if (l && l[k]) return l[k]; return null; };
    if (!lista.length) return { validade: null, confianca: 0, votos: 0, fieis: 0, alternativas: [],
                                fabricacao: pega("fabricacao"), pesagem: pega("pesagem") };
    const a = lista[0];
    let conf = Math.min(1, a.max + 0.05 * (a.n - 1));
    const rival = lista.slice(1).find((x) => x.maxP >= 0.8 * a.maxP);
    if (rival) conf = Math.min(conf, 0.6);
    return { validade: a.data, confianca: Math.round(conf * 100) / 100, votos: a.n, fieis: a.nFiel, trecho: a.trecho,
             alternativas: lista.slice(1, 3).map((x) => x.data), conflito: !!rival,
             fabricacao: pega("fabricacao"), pesagem: pega("pesagem") };
  }

  // ---------- 3. barcodes, scale labels, NFC-e ----------
  function eanValido(codigo) {
    const s = String(codigo).replace(/\D/g, "");
    if (![8, 12, 13, 14].includes(s.length)) return false;
    const d = s.split("").map(Number), dv = d.pop();
    const soma = d.reverse().reduce((acc, x, i) => acc + x * (i % 2 === 0 ? 3 : 1), 0);
    return (10 - (soma % 10)) % 10 === dv;
  }
  // Scale EAN-13 (prefix 2): 2 | PLU(5) | value(6) | DV, configurable per store.
  function parseEtiquetaBalanca(codigo, layout = { plu: [1, 6], valor: [6, 12], valorTipo: "preco" }) {
    const s = String(codigo).replace(/\D/g, "");
    if (s.length !== 13 || s[0] !== "2" || !eanValido(s)) return null;
    const v = parseInt(s.slice(layout.valor[0], layout.valor[1]), 10);
    return { plu: s.slice(layout.plu[0], layout.plu[1]),
             precoTotal: layout.valorTipo === "preco" ? v / 100 : null,
             pesoKg: layout.valorTipo === "peso" ? v / 1000 : null };
  }
  // NFC-e access key: cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) DV(1); DV = mod 11.
  const UF_IBGE = { 42: "SC", 41: "PR", 43: "RS", 35: "SP", 33: "RJ", 31: "MG", 53: "DF" };
  function chaveNfce(entrada) {
    const m = String(entrada).match(/(?<!\d)(\d{44})(?!\d)/) || String(entrada).replace(/\D/g, "").match(/^(\d{44})$/);
    if (!m) return null;
    const c = m[1];
    let soma = 0, peso = 2;
    for (let i = 42; i >= 0; i--) { soma += +c[i] * peso; peso = peso === 9 ? 2 : peso + 1; }
    const resto = soma % 11, dv = resto < 2 ? 0 : 11 - resto;
    return { chave: c, valida: dv === +c[43], uf: UF_IBGE[+c.slice(0, 2)] || c.slice(0, 2),
             aamm: c.slice(2, 6), cnpj: c.slice(6, 20), modelo: c.slice(20, 22), serie: c.slice(22, 25),
             numero: String(+c.slice(25, 34)), nfce: c.slice(20, 22) === "65" };
  }

  // Supermarket scale label read by OCR: net weight, price per kg, total, with a consistency check.
  function lerBalancaTexto(texto) {
    const linhas = normalizarOcr(texto).split(/\r?\n/);
    const num = (x) => (x == null ? null : parseFloat(String(x).replace(/\./g, "").replace(",", ".")));
    let pesoKg = null, precoKg = null, total = null;
    linhas.forEach((l, i) => {
      if (!/TARA/.test(l)) { const m = l.match(/(\d{1,3}[,.]\d{3})\s*K/); if (m && pesoKg == null) pesoKg = num(m[1]); }
      const pk = l.match(/R\S?\s*\/\s*KG\W{0,3}(\d{1,4}[,.]\d{2})(?!\d)/); if (pk) precoKg = num(pk[1]);
      if (/TOTAL/.test(l)) {
        const t = (l + " " + (linhas[i + 1] || "")).match(/TOTAL[^\d]*(\d{1,5}[,.]\d{2})(?!\d)/);
        if (t) total = parseFloat(t[1].replace(",", "."));
      }
    });
    const consistente = pesoKg && precoKg && total ? Math.abs(pesoKg * precoKg - total) / total < 0.01 : null;
    return { pesoKg, precoKg, total, consistente };
  }
  // EAN/GTIN digits read by OCR (with spaces), accepted only with a valid check digit
  function gtinsDoTexto(texto) {
    const out = new Set();
    for (const m of String(texto).matchAll(/(?<!\d)(\d[\d ]{6,17}\d)(?!\d)/g)) {
      const d = m[1].replace(/ /g, "");
      if ([8, 12, 13, 14].includes(d.length) && eanValido(d)) out.add(d);
    }
    return [...out];
  }

  // ---------- 4. units ----------
  function converterParaBase(qtd, unidade, ingrediente, unidades, conversoes) {
    const chave = `${ingrediente.id}|${unidade}`;
    if (chave in conversoes) return qtd * conversoes[chave];
    const u = unidades[unidade], base = unidades[ingrediente.unidade_base];
    if (!u) throw new Error(`unidade desconhecida: ${unidade}`);
    if (u.tipo === "qualitativa") return 0;
    if (u.tipo === base.tipo) return (qtd * u.fator) / base.fator;
    throw new Error(`sem conversão de ${unidade} para ${ingrediente.unidade_base} (${ingrediente.id})`);
  }

  // ---------- 5. effective expiry and urgency ----------
  function validadeEfetiva(lote, ingrediente) {
    ingrediente = ingrediente || {};
    let v = lote.validade ? parseISO(lote.validade) : null;
    if (!v && lote.data_compra && ingrediente.validade_padrao_dias != null)
      v = parseISO(somarDias(lote.data_compra, ingrediente.validade_padrao_dias));
    if (lote.aberto_em && ingrediente.aberto_dias != null) {
      const a = new Date(parseISO(lote.aberto_em).getTime() + ingrediente.aberto_dias * DIA_MS);
      if (!v || a < v) v = a;
    }
    return v ? iso(v) : null;
  }
  const urgencia = (dias) => (dias < 0 ? 0 : 1 / (1 + dias));
  const faixaValidade = (dias) => (dias == null ? "sem" : dias < 0 ? "vencido" : dias <= 3 ? "urgente" : dias <= 7 ? "atencao" : "ok");

  // ---------- 6. greedy FEFO planner ----------
  function planejarGuloso(lotes, receitas, slots, opts = {}) {
    const W = opts.pesoUrgencia ?? 5, coberturaMin = opts.coberturaMin ?? 0.5, janela = opts.semRepetir ?? 2;
    const estoque = lotes.map((l) => ({ ...l }));
    const plano = [], compras = {};
    slots.forEach((slot, si) => {
      const dSlot = parseISO(slot.data);
      let melhor = null;
      for (const r of receitas) {
        if (plano.slice(Math.max(0, si - janela)).some((p) => p.receita === r.id)) continue;
        let cobertura = 0, urg = 0; const uso = [];
        for (const ing of r.ingredientes) {
          let falta = ing.qtd;
          const disp = estoque.filter((l) => l.ingrediente === ing.id && l.qtd > 0 &&
                                         l.validade_efetiva && parseISO(l.validade_efetiva) >= dSlot)
                              .sort((a, b) => a.validade_efetiva.localeCompare(b.validade_efetiva));
          for (const l of disp) {
            if (falta <= 0) break;
            const q = Math.min(falta, l.qtd); falta -= q;
            uso.push({ lote: l.id, q });
            urg += (q / ing.qtd) * urgencia(diasEntre(dSlot, parseISO(l.validade_efetiva)));
          }
          cobertura += (ing.qtd - falta) / ing.qtd;
        }
        cobertura /= r.ingredientes.length;
        const score = cobertura + W * urg;
        if (cobertura >= coberturaMin && (!melhor || score > melhor.score + 1e-9)) melhor = { r, score, uso, cobertura };
      }
      if (!melhor) { plano.push({ slot: slot.id, receita: null }); return; }
      for (const u of melhor.uso) estoque.find((l) => l.id === u.lote).qtd -= u.q;
      for (const ing of melhor.r.ingredientes) {
        const usado = melhor.uso.filter((u) => estoque.find((l) => l.id === u.lote).ingrediente === ing.id)
                                .reduce((a, u) => a + u.q, 0);
        if (ing.qtd - usado > 1e-9) compras[ing.id] = (compras[ing.id] || 0) + (ing.qtd - usado);
      }
      plano.push({ slot: slot.id, receita: melhor.r.id, score: Math.round(melhor.score * 1000) / 1000,
                   cobertura: Math.round(melhor.cobertura * 100) / 100, uso: melhor.uso });
    });
    return { plano, compras, sobras: estoque.filter((l) => l.qtd > 0) };
  }

  // ---------- 7. three-way sync ----------
  // FNV-1a 32-bit over UTF-8 (identical in R: core_sync.R::fnv1a). Not cryptographic: it only
  // detects "this row changed since the last sync".
  function fnv1a(str) {
    const bytes = new TextEncoder().encode(str);
    let h = 0x811c9dc5;
    for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, "0");
  }
  const canonico = (linha, campos) => campos.map((c) => (linha[c] == null ? "" : String(linha[c]))).join("\u001f");
  function mesclar3vias(local, remoto, base, campos) {
    const hl = new Map(local.map((l) => [l.id, fnv1a(canonico(l, campos))]));
    const hr = new Map(remoto.map((l) => [l.id, fnv1a(canonico(l, campos))]));
    const hb = new Map((base || []).map((b) => [b.id, b.hash]));
    const ids = [...new Set([...hb.keys(), ...hl.keys(), ...hr.keys()])];
    const acoes = { nada: [], push: [], pull: [], conflito_remoto: [], excluir_local: [], esquecer: [] };
    for (const id of ids) {
      const b = hb.get(id), l = hl.get(id), r = hr.get(id);
      let a;
      if (b === undefined) a = l !== undefined && r === undefined ? "push" : l === undefined && r !== undefined ? "pull" : l === r ? "nada" : "conflito_remoto";
      else if (l !== undefined && r !== undefined) a = l === b && r === b ? "nada" : l !== b && r === b ? "push" : l === b && r !== b ? "pull" : l === r ? "nada" : "conflito_remoto";
      else if (l !== undefined) a = l === b ? "excluir_local" : "push";
      else if (r !== undefined) a = "pull";
      else a = "esquecer";
      acoes[a].push(id);
    }
    return acoes;
  }

  // ---------- 8. catalog matching ----------
  function distancia(a, b, max = 2) {          // Levenshtein with a cutoff (short OCR words)
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let ant = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let minLinha = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < minLinha) minLinha = cur[j];
      }
      if (minLinha > max) return max + 1;
      ant = cur;
    }
    return ant[b.length];
  }
  function casarIngrediente(texto, sinonimos) {   // sinonimos: [{termo (normalized), id}]
    const t = " " + semParticulas(normalizarTermo(texto)) + " ";
    if (!t.trim()) return [];
    const res = new Map();
    const add = (id, escore, via) => { if (!res.has(id) || res.get(id).escore < escore) res.set(id, { id, escore, via }); };
    const palavras = t.trim().split(" "), junto = t.replace(/ /g, "");
    for (const s0 of sinonimos) {
      const s = { id: s0.id, termo: s0.semP || (s0.semP = semParticulas(s0.termo)) };
      if (!s.termo) continue;
      if (t.trim() === s.termo) add(s.id, 0.95, "sinonimo");
      else if (t.includes(" " + s.termo + " ")) add(s.id, 0.9 * Math.pow(s.termo.length / t.trim().length, 0.25), "contem");
      else if (s.termo.length >= 7 && junto.includes(s.termo.replace(/ /g, ""))) add(s.id, 0.8, "sem-espacos");   // "GNOCCHIDI PATATE"
      else if (!s.termo.includes(" ") && s.termo.length >= 5) {       // one wrong letter (OCR: "FANCETA")
        if (palavras.some((w) => w.length >= 5 && distancia(w, s.termo, 1) <= 1)) add(s.id, 0.75, "aproximado");
      }
    }
    return [...res.values()].sort((a, b) => b.escore - a.escore).slice(0, 5);
  }

  const API = { normalizarOcr, extrairDatas, votarDatas, eanValido, parseEtiquetaBalanca, chaveNfce, lerBalancaTexto, gtinsDoTexto, distancia,
    converterParaBase, validadeEfetiva, urgencia, faixaValidade, planejarGuloso, fnv1a, mesclar3vias,
    casarIngrediente, normalizarTermo, semParticulas, semAcentos, parseISO, somarDias, diasEntre, iso };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else raiz.ComerHojeCore = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
