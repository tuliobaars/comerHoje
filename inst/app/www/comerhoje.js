/* comerHoje 2.0.2 (built by tools/build.mjs; do not edit). Icons: Lucide (ISC). */

/* ---- srcjs/core/comerhoje-core.js ---- */
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
    s = s.replace(/(\d)\s*['\u00b4`\\|]\s*(?=\d)/g, "$1/");                 // 19/01'2027 (Tesseract, panceta)
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
    throw new Error(`sem convers\u00e3o de ${unidade} para ${ingrediente.unidade_base} (${ingrediente.id})`);
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

/* ---- srcjs/ocr/motor-ocr.js ---- */
// motor-ocr.js: on-device OCR (PaddleOCR PP-OCRv4 det + rec + angle cls in ONNX Runtime Web).
// Runs in the browser and in all three targets; the photo never leaves the device.
// Needs the global `ort` (onnxruntime-web, ort.wasm.min.js) and the assets in `base`:
//   det.onnx \u00b7 rec.onnx \u00b7 cls.onnx \u00b7 chaves.txt \u00b7 ort/ (ort-wasm-simd-threaded.{mjs,wasm})
// Conventions follow PaddleOCR / RapidOCR: BGR, det mean = std = 0.5 (limit_type min 736, max 2000,
// thresh .3, box_thresh .5, unclip 1.6, dilation), rec 3x48xW, cls 3x48x192 (180\u00b0 if p > .9).
"use strict";
(function (raiz) {
  const estado = { sessoes: null, chaves: null, carregando: null, stats: { det: 0, cls: 0, rec: 0, nDet: 0, nCls: 0, nRec: 0 } };
  const relogio = () => (raiz.performance ? performance.now() : Date.now());

  async function carregar(base, { fontes } = {}) {
    if (estado.sessoes) return estado.sessoes;
    if (estado.carregando) return estado.carregando;
    const ort = raiz.ort;
    if (!ort) throw new Error("onnxruntime-web (ort) n\u00e3o carregado");
    ort.env.wasm.numThreads = raiz.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    // fontes (standalone HTML): { mjs, wasm, det, rec, cls, chaves } as URLs (blob:) or ArrayBuffers
    const f = fontes || { mjs: base + "ort/ort-wasm-simd-threaded.mjs", wasm: base + "ort/ort-wasm-simd-threaded.wasm",
                          det: base + "det.onnx", rec: base + "rec.onnx", cls: base + "cls.onnx", chaves: base + "chaves.txt" };
    const abs = (u) => (typeof u === "string" && raiz.document ? new URL(u, raiz.document.baseURI).href : u);
    ort.env.wasm.wasmPaths = { mjs: abs(f.mjs), wasm: abs(f.wasm) };
    const opc = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
    estado.carregando = (async () => {
      const [det, rec, cls, txt] = await Promise.all([
        ort.InferenceSession.create(f.det, opc), ort.InferenceSession.create(f.rec, opc),
        ort.InferenceSession.create(f.cls, opc),
        typeof f.chaves === "string" && !f.chaves.includes("\n") ? fetch(f.chaves).then((r) => r.text()) : f.chaves]);
      const linhas = txt.replace(/\r/g, "").split("\n");
      if (linhas[linhas.length - 1] === "") linhas.pop();
      estado.chaves = ["", ...linhas, " "];
      estado.sessoes = { det, rec, cls };
      return estado.sessoes;
    })();
    return estado.carregando;
  }

  // ---------- canvas and pixels ----------
  const novoCanvas = (w, h) => {
    const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    return c;
  };
  function redimensionar(fonte, w, h) {
    const c = novoCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    const g = c.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingQuality = "high";
    g.drawImage(fonte, 0, 0, c.width, c.height);
    return c;
  }
  function recortar(fonte, x0, y0, x1, y1) {
    const w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0));
    const c = novoCanvas(w, h);
    c.getContext("2d", { willReadFrequently: true }).drawImage(fonte, Math.round(x0), Math.round(y0), w, h, 0, 0, w, h);
    return c;
  }
  function girar180(fonte) {
    const c = novoCanvas(fonte.width, fonte.height), g = c.getContext("2d");
    g.translate(c.width, c.height); g.rotate(Math.PI); g.drawImage(fonte, 0, 0);
    return c;
  }
  const pixels = (c) => c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);

  // Dot-matrix filter: max channel (coloured backgrounds go white, ink stays dark) + minimum filter
  // (grey erosion) of size k, which joins the dots of ink-jet and dot-matrix print into strokes.
  function filtroMatricial(fonte, k) {
    const { width: w, height: h } = fonte, img = pixels(fonte), d = img.data;
    let g = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = Math.max(d[p], d[p + 1], d[p + 2]);
    const r = (k - 1) >> 1, t = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {      // horizontal min
      let m = 255; const o = y * w;
      for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx >= 0 && xx < w && g[o + xx] < m) m = g[o + xx]; }
      t[o + x] = m;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {      // vertical min
      let m = 255;
      for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy >= 0 && yy < h && t[yy * w + x] < m) m = t[yy * w + x]; }
      g[y * w + x] = m;
    }
    let lo = 255, hi = 0;                                            // contrast stretch
    for (const v of g) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const esc = hi > lo ? 255 / (hi - lo) : 1;
    for (let i = 0, p = 0; i < g.length; i++, p += 4) { const v = (g[i] - lo) * esc; d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255; }
    const c = novoCanvas(w, h); c.getContext("2d").putImageData(img, 0, 0);
    return c;
  }

  // CHW float32, BGR, (v/255 - mean)/std, optional right zero padding up to wPad
  function tensor(c, wPad) {
    const { width: w, height: h } = c, d = pixels(c).data, W = wPad || w;
    const out = new Float32Array(3 * h * W), plano = h * W;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4, i = y * W + x;
      out[i] = (d[p + 2] / 255 - 0.5) / 0.5;            // B
      out[plano + i] = (d[p + 1] / 255 - 0.5) / 0.5;    // G
      out[2 * plano + i] = (d[p] / 255 - 0.5) / 0.5;    // R
    }
    return new raiz.ort.Tensor("float32", out, [1, 3, h, W]);
  }

  // ---------- detection (DB) ----------
  async function detectar(fonte, ladoMax = 2000) {
    const { det } = estado.sessoes, w = fonte.width, h = fonte.height;
    let r = 1;
    if (Math.min(w, h) < 736) r = 736 / Math.min(w, h);
    if (Math.max(w, h) * r > ladoMax) r = ladoMax / Math.max(w, h);
    const rw = Math.max(32, Math.round((w * r) / 32) * 32), rh = Math.max(32, Math.round((h * r) / 32) * 32);
    const t0 = relogio();
    const saida = await det.run({ [det.inputNames[0]]: tensor(redimensionar(fonte, rw, rh)) });
    estado.stats.det += relogio() - t0; estado.stats.nDet++;
    const prob = saida[det.outputNames[0]].data;
    const bin = new Uint8Array(rw * rh);
    for (let i = 0; i < bin.length; i++) if (prob[i] > 0.3) {      // threshold + 2x2 dilation
      bin[i] = 1; if ((i + 1) % rw) bin[i + 1] = 1; if (i + rw < bin.length) { bin[i + rw] = 1; if ((i + 1) % rw) bin[i + rw + 1] = 1; }
    }
    const rotulo = new Int32Array(rw * rh), caixas = [], pilha = [];
    let n = 0;
    for (let i0 = 0; i0 < bin.length; i0++) {
      if (!bin[i0] || rotulo[i0]) continue;
      n++; let x0 = rw, y0 = rh, x1 = 0, y1 = 0, soma = 0, cont = 0;
      pilha.push(i0); rotulo[i0] = n;
      while (pilha.length) {
        const i = pilha.pop(), x = i % rw, y = (i / rw) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        soma += prob[i]; cont++;
        const viz = [x > 0 ? i - 1 : -1, x < rw - 1 ? i + 1 : -1, y > 0 ? i - rw : -1, y < rh - 1 ? i + rw : -1];
        for (const j of viz) if (j >= 0 && bin[j] && !rotulo[j]) { rotulo[j] = n; pilha.push(j); }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (Math.min(bw, bh) < 3 || soma / cont < 0.5) continue;
      const dist = (bw * bh * 1.6) / (2 * (bw + bh));             // unclip
      caixas.push({ x0: Math.max(0, (x0 - dist) * (w / rw)), y0: Math.max(0, (y0 - dist) * (h / rh)),
                    x1: Math.min(w, (x1 + 1 + dist) * (w / rw)), y1: Math.min(h, (y1 + 1 + dist) * (h / rh)),
                    escore: soma / cont });
    }
    return caixas.filter((c) => c.x1 - c.x0 >= 6 && c.y1 - c.y0 >= 6);
  }

  // ---------- angle (0/180) and recognition (CTC) ----------
  async function angulo180(recorte) {
    const { cls } = estado.sessoes;
    const w = Math.min(192, Math.ceil((48 * recorte.width) / recorte.height));
    const t0 = relogio();
    const s = await cls.run({ [cls.inputNames[0]]: tensor(redimensionar(recorte, w, 48), 192) });
    estado.stats.cls += relogio() - t0; estado.stats.nCls++;
    const p = s[cls.outputNames[0]].data;
    return p[1] > p[0] && p[1] > 0.9;
  }
  async function reconhecer(recorte, preencher = false) {
    const { rec } = estado.sessoes;
    const razao = recorte.width / recorte.height;
    const w = Math.max(32, Math.ceil(48 * razao));
    const wImg = preencher ? Math.max(320, w) : Math.ceil(w / 8) * 8;
    const t0 = relogio();
    const s = await rec.run({ [rec.inputNames[0]]: tensor(redimensionar(recorte, w, 48), wImg) });
    estado.stats.rec += relogio() - t0; estado.stats.nRec++;
    const t = s[rec.outputNames[0]], [, T, C] = t.dims, d = t.data;
    let txt = "", ant = 0, soma = 0, n = 0;
    for (let k = 0; k < T; k++) {
      let im = 0, vm = -1;
      for (let c = 0; c < C; c++) if (d[k * C + c] > vm) { vm = d[k * C + c]; im = c; }
      if (im !== 0 && im !== ant) { txt += estado.chaves[im] || ""; soma += vm; n++; }
      ant = im;
    }
    return { texto: txt, conf: n ? soma / n : 0 };
  }

  // Reads the text lines of an image (canvas) and returns [{texto, conf, caixa}] in reading order.
  // Boxes are recognised tallest first and `parar(linhas)` can stop early (a confident date found).
  // The page orientation (0/180) is decided once, by the angle classifier on the 5 widest boxes.
  async function lerTexto(fonte, { minConf = 0.5, ladoDet = 2000, parar = null, maxLinhas = 80, preencher = false } = {}) {
    let caixas = await detectar(fonte, ladoDet);
    caixas = caixas.filter((c) => c.y1 - c.y0 < 1.5 * (c.x1 - c.x0));        // vertical text is never a date
    let virar = false;
    const largas = [...caixas].sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0)).slice(0, 5);
    if (largas.length) {
      let votos = 0;
      for (const c of largas) if (await angulo180(recortar(fonte, c.x0, c.y0, c.x1, c.y1))) votos++;
      virar = votos > largas.length / 2;
    }
    const ordem = [...caixas].sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0)).slice(0, maxLinhas);
    const linhas = [];
    for (const c of ordem) {
      let r = recortar(fonte, c.x0, c.y0, c.x1, c.y1);
      if (virar) r = girar180(r);
      const { texto, conf } = await reconhecer(r, preencher);
      if (texto.trim() && conf >= minConf) {
        linhas.push({ texto: texto.trim(), conf, caixa: c });
        if (parar && parar(ordenar(linhas, virar))) break;
      }
    }
    return ordenar(linhas, virar);
  }
  function ordenar(linhas, virar) {           // rows (overlap in y), then x; reversed if the page is upside down
    const L = [...linhas].sort((a, b) => {
      const mesma = Math.min(a.caixa.y1, b.caixa.y1) - Math.max(a.caixa.y0, b.caixa.y0) > 0.5 * Math.min(a.caixa.y1 - a.caixa.y0, b.caixa.y1 - b.caixa.y0);
      return mesma ? a.caixa.x0 - b.caixa.x0 : a.caixa.y0 - b.caixa.y0;
    });
    return virar ? L.reverse() : L;
  }
  // Text for the date parser: one line per row, boxes on the same row joined by spaces
  function comoTexto(linhas) {
    const out = []; let atual = null;
    for (const l of linhas) {
      if (atual && Math.min(atual.y1, l.caixa.y1) - Math.max(atual.y0, l.caixa.y0) > 0.5 * (l.caixa.y1 - l.caixa.y0)) {
        atual.t += " " + l.texto; atual.y1 = Math.max(atual.y1, l.caixa.y1);
      } else { atual = { t: l.texto, y0: l.caixa.y0, y1: l.caixa.y1 }; out.push(atual); }
    }
    return out.map((x) => x.t).join("\n");
  }

  raiz.ComerHojeOCR = { stats: () => ({ ...estado.stats }), carregar, lerTexto, comoTexto, filtroMatricial, redimensionar, recortar, girar180,
                        pronto: () => !!estado.sessoes };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ---- srcjs/ocr/leitor-rotulo.js ---- */
// leitor-rotulo.js: finds the expiry date on a label photo without manual cropping.
//   A. overview (1600 px): reads the whole label; often done here (panceta, nhoque).
//   B. zoom on every "VAL / VALIDADE / VENC\u2026" anchor at full resolution, with dot-matrix
//      filter variants (leite: the date sits on the line below "VAL/LOTE").
//   C. if there is still no good date: dot-matrix filter on the whole photo (molho: ink-jet on foil).
//   D. user crop (optional): same variants on the region the user marked.
// The readings of every variant are combined by ComerHojeCore.votarDatas (agreement = confidence).
"use strict";
(function (raiz) {
  const ANCORA = /\b(VAL|VALIDADE|VALID|V[BRE8]L|VAI|VENC|VENCIMENTO|CONSUMIR|EXP|BEST)\b|\bVAL\s*[JIL1|/\\]?\s*LOTE/;
  const agora = () => (raiz.performance ? performance.now() : Date.now());

  // Limits the source so iOS canvases (max ~16.7 Mpx) never overflow: 24 Mpx photos are reduced.
  function fonteSegura(img, ladoMax = 3200) {
    const s = Math.min(1, ladoMax / Math.max(img.width, img.height));
    return raiz.ComerHojeOCR.redimensionar(img, img.width * s, img.height * s);
  }

  async function lerRotulo(imagem, { hoje, progresso = () => {}, roi = null, cedo = 0.85,
                                     ladoVisao = 1600, ladoDet = 1280, ladoPontilhado = 1600, ks = [7, 5],
                                     temProduto = null, extras = 15 } = {}) {
    const OCR = raiz.ComerHojeOCR, C = raiz.ComerHojeCore;
    let linhasVisao = [];
    const t0 = agora(), passos = [], leituras = [], textos = [];
    const fonte = fonteSegura(imagem);
    const anotar = (passo, texto, peso, extra = {}) => {
      const r = { ...C.extrairDatas(texto, hoje), peso };
      leituras.push(r); textos.push({ passo, texto }); passos.push({ passo, validade: r.validade, conf: r.confianca, ms: Math.round(agora() - t0), ...extra });
      return r;
    };
    // enough: a confident reading with separators, or two full-resolution readings that agree
    const bom = () => { const v = C.votarDatas(leituras);
      return v.validade && !v.conflito && (v.confianca >= cedo || v.fieis >= 2) ? v : null; };
    const temData = () => leituras.some((l) => l.validade && l.confianca >= 0.5);
    // early stop inside one OCR pass: this pass alone already has an anchored, confident date
    // after the date, up to `extras` more boxes (the largest first) when the product name is still missing
    let alem = null;
    const parar = (linhas) => {
      const txt = OCR.comoTexto(linhas);
      if (alem === null) { const r = C.extrairDatas(txt, hoje); if (!(r.validade && r.confianca >= 0.8)) return false; alem = 0; }
      if (!temProduto || temProduto(txt)) return true;
      return ++alem > extras;
    };

    if (roi) {                                                     // D (when the user already marked it)
      progresso("Lendo a \u00e1rea marcada\u2026");
      const W = fonte.width, H = fonte.height;
      const reg = OCR.recortar(fonte, roi.x * W, roi.y * H, (roi.x + roi.w) * W, (roi.y + roi.h) * H);
      for (const v of variantes(reg, reg.height / 3)) {
        if (v.filtro && temData()) break;
        anotar("recorte:" + v.nome, OCR.comoTexto(await OCR.lerTexto(v.canvas, { parar })), v.peso);
        if (bom()) break;
      }
      return concluir();
    }

    progresso("Procurando a validade\u2026");                           // A
    const sv = Math.min(1, ladoVisao / Math.max(fonte.width, fonte.height));
    const visao = OCR.redimensionar(fonte, fonte.width * sv, fonte.height * sv);
    alem = null;
    const linhasA = await OCR.lerTexto(visao, { ladoDet, parar });
    anotar("visao", OCR.comoTexto(linhasA), 0.7, { linhas: linhasA.length });
    linhasVisao = linhasA.map((l) => ({ texto: l.texto, altura: l.caixa.y1 - l.caixa.y0 }));
    if (bom()) return concluir();

    const esc = fonte.width / visao.width;                         // B
    const ancoras = linhasA.filter((l) => ANCORA.test(C.normalizarOcr(l.texto)) && !/\bVALOR\b/.test(C.normalizarOcr(l.texto)));
    for (const a of ancoras.slice(0, 3)) {
      progresso("Ampliando perto de \u201c" + a.texto.slice(0, 12) + "\u201d\u2026");
      const h = (a.caixa.y1 - a.caixa.y0) * esc;
      const x0 = a.caixa.x0 * esc - 1.5 * h, x1 = Math.max(a.caixa.x1 * esc, a.caixa.x0 * esc + 14 * h);
      const y0 = a.caixa.y0 * esc - 1.2 * h, y1 = a.caixa.y1 * esc + 3.5 * h;
      const reg = OCR.recortar(fonte, Math.max(0, x0), Math.max(0, y0), Math.min(fonte.width, x1), Math.min(fonte.height, y1));
      const antes = leituras.length;
      for (const v of variantes(reg, h)) {
        if (v.filtro && leituras.slice(antes).some((l) => l.validade)) break;   // filters only if unfiltered failed
        anotar("ancora:" + v.nome, OCR.comoTexto(await OCR.lerTexto(v.canvas, { parar })), v.peso);
        if (bom()) return concluir();
      }
    }

    if (temData()) return concluir();                              // C only when nothing was read
    progresso("Tentando impress\u00e3o pontilhada\u2026");
    const sp = Math.min(1, ladoPontilhado / Math.max(fonte.width, fonte.height));
    const grande = OCR.redimensionar(fonte, fonte.width * sp, fonte.height * sp);
    for (const k of ks) {
      anotar("pontilhado:k" + k, OCR.comoTexto(await OCR.lerTexto(OCR.filtroMatricial(grande, k), { ladoDet: ladoPontilhado, parar })), 0.6);
      if (bom()) return concluir();
    }
    return concluir();

    function concluir() {
      const v = C.votarDatas(leituras);
      return { ...v, passos, textos, linhas: linhasVisao, ms: Math.round(agora() - t0) };
    }
  }

  // Image variants for a region whose text height is ~h px: original plus dot-matrix filters sized to the print.
  function variantes(reg, h) {
    const OCR = raiz.ComerHojeOCR;
    const k1 = Math.max(3, (Math.round(h * 0.10) | 1)), k2 = Math.max(5, (Math.round(h * 0.18) | 1));
    const amp = OCR.redimensionar(reg, reg.width * 1.5, reg.height * 1.5);
    return [{ nome: "original", canvas: reg, peso: 1 },
            { nome: "ampliado", canvas: amp, peso: 1 },
            { nome: "pontilhado" + k1, canvas: OCR.filtroMatricial(reg, k1), peso: 0.6, filtro: true },
            { nome: "pontilhado" + k2, canvas: OCR.filtroMatricial(reg, k2), peso: 0.6, filtro: true }];
  }

  raiz.ComerHojeLeitor = { lerRotulo };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ---- srcjs/app/00-base.js ---- */
// 00-base.js: namespace, utilities, pt-BR formatting, icons.
"use strict";
const CH = (globalThis.CH = globalThis.CH || {});
CH.core = globalThis.ComerHojeCore;

// ---------- DOM ----------
CH.$ = (sel, raiz = document) => raiz.querySelector(sel);
CH.$$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
CH.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
CH.uuid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID()
  : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }));
CH.agora = () => new Date().toISOString();
CH.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---------- time: "today" in Brazil, whatever the device or server time zone ----------
CH.fuso = "America/Sao_Paulo";
CH.hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: CH.fuso });   // AAAA-MM-DD
CH.dias = (iso) => (iso ? CH.core.diasEntre(CH.core.parseISO(CH.hoje()), CH.core.parseISO(iso)) : null);

// ---------- pt-BR formatting (explicit: never depends on the browser locale) ----------
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "s\u00e1b"];
const DIAS_LONGOS = ["domingo", "segunda-feira", "ter\u00e7a-feira", "quarta-feira", "quinta-feira", "sexta-feira", "s\u00e1bado"];
const MESES = ["janeiro", "fevereiro", "mar\u00e7o", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
CH.fmt = {
  num(x, dig = 0) {
    if (x == null || isNaN(x)) return "\u2014";
    const [i, d] = Math.abs(x).toFixed(dig).split(".");
    return (x < 0 ? "\u2212" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (d ? "," + d : "");
  },
  enxuto(x) {   // 480 -> "480" \u00b7 1.5 -> "1,5" \u00b7 0.25 -> "0,25" \u00b7 12.34 -> "12,3"
    const dig = Math.abs(x - Math.round(x)) < 1e-9 ? 0 : Math.abs(x) < 1 ? 3 : Math.abs(x) < 10 ? 2 : 1;
    let s = CH.fmt.num(x, dig);
    if (s.includes(",")) s = s.replace(/0+$/, "").replace(/,$/, "");
    return s;
  },
  brl(x) { return x == null ? "\u2014" : "R$ " + CH.fmt.num(x, 2); },
  data(iso, curta = false) { if (!iso) return "\u2014"; const [a, m, d] = iso.slice(0, 10).split("-"); return curta ? `${d}/${m}` : `${d}/${m}/${a}`; },
  diaSemana(iso, longo = false) { const d = CH.core.parseISO(iso); return (longo ? DIAS_LONGOS : DIAS_CURTOS)[d.getUTCDay()]; },
  extenso(iso) { const d = CH.core.parseISO(iso); return `${DIAS_CURTOS[d.getUTCDay()]}, ${d.getUTCDate()} ${MESES[d.getUTCMonth()].slice(0, 3)}`; },
  mes(iso) { return MESES[+iso.slice(5, 7) - 1]; },
  hora(isoDt) { return isoDt ? new Date(isoDt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: CH.fuso }) : "\u2014"; },
  qtd(q, base, ing) {
    if (q == null) return "\u2014";
    if (base === "g") return q >= 1000 ? CH.fmt.enxuto(q / 1000) + " kg" : CH.fmt.enxuto(q) + " g";
    if (base === "ml") return q >= 1000 ? CH.fmt.enxuto(q / 1000) + " L" : CH.fmt.enxuto(q) + " mL";
    if (ing === "ovo" && q >= 12 && q % 12 === 0) return CH.fmt.enxuto(q / 12) + (q === 12 ? " d\u00fazia" : " d\u00fazias");
    return CH.fmt.enxuto(q) + " un";
  },
  validade(dias) {
    if (dias == null) return "sem data";
    if (dias < -1) return `venceu h\u00e1 ${-dias} dias`;
    if (dias === -1) return "venceu ontem";
    if (dias === 0) return "vence hoje";
    if (dias === 1) return "vence amanh\u00e3";
    return `em ${dias} dias`;
  },
};
CH.parseNum = (s) => {   // "1,5" | "1.5" | "1.234,56" | "0,482 kg"
  if (typeof s === "number") return s;
  let t = String(s || "").trim().replace(/[^\d,.\-]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const v = parseFloat(t);
  return isNaN(v) ? null : v;
};

// ---------- icons (lucide-static, ISC, inlined by the build as CH.ICONES) ----------
CH.ICONES = CH.ICONES || {};
CH.icone = (nome, cls = "") => `<svg class="ch-icone ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CH.ICONES[nome] || ""}</svg>`;

// ---------- small event bus ----------
CH.bus = (() => {
  const ouvintes = {};
  return {
    on: (ev, fn) => ((ouvintes[ev] = ouvintes[ev] || []).push(fn), () => (ouvintes[ev] = ouvintes[ev].filter((f) => f !== fn))),
    emit: (ev, d) => (ouvintes[ev] || []).slice().forEach((f) => { try { f(d); } catch (e) { console.error(e); } }),
  };
})();

CH.ICONES = {"apple":"<path d=\"M12 6.528V3a1 1 0 0 1 1-1h0\" /> <path d=\"M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21\" />","archive":"<rect width=\"20\" height=\"5\" x=\"2\" y=\"3\" rx=\"1\" /> <path d=\"M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8\" /> <path d=\"M10 12h4\" />","calendar-days":"<path d=\"M8 2v3\" /> <path d=\"M16 2v3\" /> <rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" /> <path d=\"M3 9h18\" /> <path d=\"M8 13h.01\" /> <path d=\"M12 13h.01\" /> <path d=\"M16 13h.01\" /> <path d=\"M8 17h.01\" /> <path d=\"M12 17h.01\" /> <path d=\"M16 17h.01\" />","camera":"<path d=\"M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z\" /> <circle cx=\"12\" cy=\"13\" r=\"3\" />","check":"<path d=\"M20 6 9 17l-5-5\" />","chevron-right":"<path d=\"m9 18 6-6-6-6\" />","circle":"<circle cx=\"12\" cy=\"12\" r=\"10\" />","circle-alert":"<circle cx=\"12\" cy=\"12\" r=\"10\" /> <line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\" /> <line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\" />","circle-check":"<circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"m16 9-5.5 5.5L8 12\" />","circle-minus":"<circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"M8 12h8\" />","circle-x":"<circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"m15 9-6 6\" /> <path d=\"m9 9 6 6\" />","crop":"<path d=\"M6 2v14a2 2 0 0 0 2 2h14\" /> <path d=\"M18 22V8a2 2 0 0 0-2-2H2\" />","download":"<path d=\"M12 15V3\" /> <path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\" /> <path d=\"m7 10 5 5 5-5\" />","external-link":"<path d=\"M15 3h6v6\" /> <path d=\"M10 14 21 3\" /> <path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\" />","house":"<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\" /> <path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\" />","image":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\" /> <circle cx=\"9\" cy=\"9\" r=\"2\" /> <path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\" />","info":"<circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"M12 16v-4\" /> <path d=\"M12 8h.01\" />","leaf":"<path d=\"M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20\" /> <path d=\"M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13\" />","loader":"<path d=\"M12 2v4\" /> <path d=\"m16.2 7.8 2.9-2.9\" /> <path d=\"M18 12h4\" /> <path d=\"m16.2 16.2 2.9 2.9\" /> <path d=\"M12 18v4\" /> <path d=\"m4.9 19.1 2.9-2.9\" /> <path d=\"M2 12h4\" /> <path d=\"m4.9 4.9 2.9 2.9\" />","package":"<path d=\"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z\" /> <path d=\"M12 22V12\" /> <polyline points=\"3.29 7 12 12 20.71 7\" /> <path d=\"m7.5 4.27 9 5.15\" />","package-open":"<path d=\"M12 22v-9\" /> <path d=\"M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z\" /> <path d=\"M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13\" /> <path d=\"M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z\" />","palette":"<path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\" /> <circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\" /> <circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\" /> <circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\" /> <circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />","pencil":"<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\" /> <path d=\"m15 5 4 4\" />","plus":"<path d=\"M5 12h14\" /> <path d=\"M12 5v14\" />","receipt":"<path d=\"M12 17V7\" /> <path d=\"M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8\" /> <path d=\"M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z\" />","refresh-cw":"<path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\" /> <path d=\"M21 3v5h-5\" /> <path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\" /> <path d=\"M8 16H3v5\" />","refrigerator":"<path d=\"M5 6a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6Z\" /> <path d=\"M5 10h14\" /> <path d=\"M15 7v6\" />","scan-barcode":"<path d=\"M3 7V5a2 2 0 0 1 2-2h2\" /> <path d=\"M17 3h2a2 2 0 0 1 2 2v2\" /> <path d=\"M21 17v2a2 2 0 0 1-2 2h-2\" /> <path d=\"M7 21H5a2 2 0 0 1-2-2v-2\" /> <path d=\"M8 7v10\" /> <path d=\"M12 7v10\" /> <path d=\"M17 7v10\" />","scan-line":"<path d=\"M3 7V5a2 2 0 0 1 2-2h2\" /> <path d=\"M17 3h2a2 2 0 0 1 2 2v2\" /> <path d=\"M21 17v2a2 2 0 0 1-2 2h-2\" /> <path d=\"M7 21H5a2 2 0 0 1-2-2v-2\" /> <path d=\"M7 12h10\" />","search":"<path d=\"m21 21-4.34-4.34\" /> <circle cx=\"11\" cy=\"11\" r=\"8\" />","settings":"<path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\" /> <circle cx=\"12\" cy=\"12\" r=\"3\" />","shield-check":"<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" /> <path d=\"m9 12 2 2 4-4\" />","shopping-cart":"<path d=\"m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18\" /> <path d=\"M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25\" /> <circle cx=\"18\" cy=\"20\" r=\"2\" /> <circle cx=\"8\" cy=\"20\" r=\"2\" />","smartphone":"<rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\" /> <path d=\"M12 18h.01\" />","snowflake":"<path d=\"m10 20-1.25-2.5L6 18\" /> <path d=\"M10 4 8.75 6.5 6 6\" /> <path d=\"m14 20 1.25-2.5L18 18\" /> <path d=\"m14 4 1.25 2.5L18 6\" /> <path d=\"m17 21-3-6h-4\" /> <path d=\"m17 3-3 6 1.5 3\" /> <path d=\"M2 12h6.5L10 9\" /> <path d=\"m20 10-1.5 2 1.5 2\" /> <path d=\"M22 12h-6.5L14 15\" /> <path d=\"m4 10 1.5 2L4 14\" /> <path d=\"m7 21 3-6-1.5-3\" /> <path d=\"m7 3 3 6h4\" />","sparkles":"<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\" /> <path d=\"M20 2v4\" /> <path d=\"M22 4h-4\" /> <circle cx=\"4\" cy=\"20\" r=\"2\" />","sun-moon":"<path d=\"M12 2v2\" /> <path d=\"M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715\" /> <path d=\"M16 12a4 4 0 0 0-4-4\" /> <path d=\"m19 5-1.256 1.256\" /> <path d=\"M20 12h2\" />","trash-2":"<path d=\"M10 11v6\" /> <path d=\"M14 11v6\" /> <path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\" /> <path d=\"M3 6h18\" /> <path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\" />","triangle-alert":"<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\" /> <path d=\"M12 9v4\" /> <path d=\"M12 17h.01\" />","upload":"<path d=\"M12 3v12\" /> <path d=\"m17 8-5-5-5 5\" /> <path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\" />","utensils":"<path d=\"M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2\" /> <path d=\"M7 2v20\" /> <path d=\"M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7\" />","x":"<path d=\"M18 6 6 18\" /> <path d=\"m6 6 12 12\" />"};

/* ---- srcjs/app/10-dados.js ---- */
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

/* ---- srcjs/app/20-loja.js ---- */
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
      default: throw new Error("opera\u00e7\u00e3o desconhecida: " + op);
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

/* ---- srcjs/app/30-transporte.js ---- */
// 30-transporte.js: where the data lives (delivery model: LocalTransport | ShinyTransport).
//
//  LocalTransport (HTML, Quarto): state in localStorage; operations applied in the browser.
//  ShinyTransport (Shiny): SQLite on the server is the truth. The browser keeps a cache and an
//    OUTBOX of operations, both in localStorage. Each operation is applied locally at once
//    (instant UI), then sent over input$ch_msg. The server applies it in a transaction, records its id
//    in `ops_aplicadas` and answers on 'ch-msg'. If the connection drops (iPhone locked, tunnel,
//    Wi-Fi -> 4G), operations stay in the outbox and are re-sent on 'shiny:connected'. The server
//    ignores ids it already applied. Nothing typed is lost, and nothing is applied twice.
CH.transporte = (() => {
  const CHAVE = (sufixo) => `comerhoje:v2:${CH.instancia || "local"}:${sufixo}`;
  const ler = (k, padrao) => { try { const v = localStorage.getItem(CHAVE(k)); return v == null ? padrao : JSON.parse(v); } catch (e) { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem(CHAVE(k), JSON.stringify(v)); } catch (e) { console.warn("localStorage cheio?", e); } };

  function local() {
    return {
      nome: "navegador",
      capacidades: { servidor: false, visao: false, nfce: false, milp: false, sync: "navegador" },
      async iniciar() { CH.loja.set(ler("estado", CH.loja.vazio())); return CH.loja.get(); },
      async op(op, args) {
        const m = { id: CH.uuid(), op, args, t: CH.agora() };
        CH.loja.aplicar(m); gravar("estado", CH.loja.get());
        return m;
      },
      async consulta(nome) { throw new Error(`\u201c${nome}\u201d precisa do app no servidor (Shiny)`); },
      status: () => ({ online: navigator.onLine, pendentes: 0, fonte: "Navegador" }),
    };
  }

  function shiny() {
    const esperando = new Map();
    let conectado = false, caps = { servidor: true, visao: false, nfce: true, milp: false, sync: "servidor" };
    let fila = ler("fila", []);
    const enviar = (msg) => {
      if (!conectado || !globalThis.Shiny || !Shiny.setInputValue) return false;
      Shiny.setInputValue("ch_msg", JSON.stringify(msg), { priority: "event" });
      return true;
    };
    const chamar = (msg, ms = 60000) => new Promise((ok, falha) => {
      esperando.set(msg.id, { ok, falha, timer: setTimeout(() => { esperando.delete(msg.id); falha(new Error("sem resposta do servidor")); }, ms) });
      if (!enviar(msg)) { clearTimeout(esperando.get(msg.id).timer); esperando.delete(msg.id); falha(new Error("sem conex\u00e3o com o servidor")); }
    });
    const drenar = async () => {              // re-sends the outbox in order (the server is idempotent)
      for (const m of [...fila]) {
        try { await chamar({ ...m, tipo: "op" }, 20000); fila = fila.filter((x) => x.id !== m.id); gravar("fila", fila); }
        catch (e) { CH.bus.emit("sync", { erro: e.message }); return false; }
      }
      CH.bus.emit("pendentes", fila.length);
      return true;
    };
    const recarregar = async () => {
      const r = await chamar({ id: CH.uuid(), tipo: "consulta", op: "estado.carregar", args: {} });
      caps = { ...caps, ...(r.capacidades || {}) };
      const E = r.estado;
      for (const m of fila) { try { CH.loja.aplicarOp(E, m); } catch (e) { /* already applied there */ } }   // rebase
      CH.loja.set(E); gravar("estado", E);
    };
    return {
      nome: "servidor",
      get capacidades() { return caps; },
      async iniciar() {
        CH.loja.set(ler("estado", CH.loja.vazio()));          // instant cache, even offline
        Shiny.addCustomMessageHandler("ch-msg", (r) => {
          if (r.tipo === "estado") { CH.loja.set(r.estado); gravar("estado", r.estado); return; }   // server push (sync)
          if (r.tipo === "sync") { CH.bus.emit("sync", r); return; }
          const w = esperando.get(r.id); if (!w) return;
          clearTimeout(w.timer); esperando.delete(r.id);
          r.ok ? w.ok(r.resultado || r) : w.falha(new Error(r.erro || "erro no servidor"));
        });
        const aoConectar = async () => { conectado = true; CH.bus.emit("conexao", true); if (await drenar()) await recarregar().catch((e) => CH.bus.emit("sync", { erro: e.message })); };
        document.addEventListener("shiny:connected", aoConectar);
        document.addEventListener("shiny:disconnected", () => { conectado = false; CH.bus.emit("conexao", false); });
        if (Shiny.shinyapp && Shiny.shinyapp.isConnected && Shiny.shinyapp.isConnected()) await aoConectar();
        return CH.loja.get();
      },
      async op(op, args) {
        const m = { id: CH.uuid(), op, args, t: CH.agora() };
        CH.loja.aplicar(m); gravar("estado", CH.loja.get());
        fila.push(m); gravar("fila", fila); CH.bus.emit("pendentes", fila.length);
        drenar();
        return m;
      },
      consulta(op, args, ms) { return chamar({ id: CH.uuid(), tipo: "consulta", op, args }, ms); },
      status: () => ({ online: conectado, pendentes: fila.length, fonte: "SQLite no servidor" }),
    };
  }

  return { local, shiny, ler, gravar };
})();

/* ---- srcjs/app/40-foto.js ---- */
// 40-foto.js: photo intake, all on the device:
//   1. decodes the file with its EXIF orientation applied (upright pixels);
//   2. reports which sensitive metadata the original carried (GPS, device, date) so the UI can say
//      what was removed;
//   3. any copy that leaves the device (server, cloud) is RE-ENCODED from pixels on a canvas, so it
//      carries no metadata at all (no Exif, GPS, XMP, maker notes), reduced to <= 2048 px;
//   4. barcodes (ZXing WASM) and date OCR (PaddleOCR ONNX) run locally, loaded on demand.
CH.foto = (() => {
  const rec = () => CH.recursos || {};

  async function abrir(arquivo) {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const meta = metadadosJpeg(bytes);
    let img;
    try { img = await createImageBitmap(arquivo, { imageOrientation: "from-image" }); }
    catch (e) {                                   // old Safari: <img> also applies the orientation
      const url = URL.createObjectURL(arquivo);
      img = new Image(); img.src = url; await img.decode(); URL.revokeObjectURL(url);
    }
    return { img, largura: img.width, altura: img.height, bytes: bytes.length, meta, nome: arquivo.name || "foto.jpg" };
  }

  // Minimal Exif reader: only reports what exists (never sends or stores it).
  function metadadosJpeg(b) {
    const out = { exif: false, gps: false, aparelho: false, data: false };
    if (b[0] !== 0xff || b[1] !== 0xd8) return out;
    let i = 2;
    while (i + 4 < b.length && b[i] === 0xff) {
      const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (m === 0xda) break;
      if (m === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
        out.exif = true;
        const t = i + 10, le = b[t] === 0x49;
        const u16 = (p) => (le ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]);
        const u32 = (p) => (le ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16)) + b[p + 3] * 16777216 : b[p] * 16777216 + ((b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]));
        const ifd = t + u32(t + 4), n = u16(ifd);
        for (let k = 0; k < n; k++) {
          const tag = u16(ifd + 2 + k * 12);
          if (tag === 0x8825) out.gps = true;
          if (tag === 0x010f || tag === 0x0110) out.aparelho = true;
          if (tag === 0x0132) out.data = true;
        }
      }
      i += 2 + len;
    }
    return out;
  }

  // Re-encoded copy (no metadata) for the server / cloud. Returns a Blob and its base64.
  async function copiaLimpa(img, ladoMax = 2048, qualidade = 0.85) {
    const s = Math.min(1, ladoMax / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", qualidade));
    const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(blob); });
    return { blob, base64: b64, largura: c.width, altura: c.height, bytes: blob.size };
  }

  // ---------- barcodes ----------
  let zxPronto = null;
  function prepararZxing() {
    if (zxPronto) return zxPronto;
    const Z = globalThis.ZXingWASM;
    if (!Z) return (zxPronto = Promise.reject(new Error("leitor de c\u00f3digo de barras indispon\u00edvel")));
    const r = rec();
    const overrides = r.zxingWasmB64 ? { wasmBinary: Uint8Array.from(atob(r.zxingWasmB64), (ch) => ch.charCodeAt(0)).buffer }
                                     : { locateFile: (p) => (r.zxing || "zxing/") + p };
    zxPronto = Z.prepareZXingModule({ overrides, fireImmediately: true });
    return zxPronto;
  }
  async function codigos(img, ladoMax = 2048) {
    await prepararZxing();
    const s = Math.min(1, ladoMax / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, c.width, c.height);
    const res = await globalThis.ZXingWASM.readBarcodes(g.getImageData(0, 0, c.width, c.height),
      { tryHarder: true, tryRotate: true, maxNumberOfSymbols: 4, formats: ["EAN13", "EAN8", "UPCA", "QRCode"] });
    return res.filter((r) => r.isValid && r.text).map((r) => ({ formato: r.format, texto: r.text }));
  }

  // ---------- date OCR (lazy: ~30 MB once, then browser cache) ----------
  let ocrPronto = null;
  const carregarScript = (src) => new Promise((ok, falha) => {
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => falha(new Error("falhou: " + src));
    document.head.appendChild(s);
  });
  function ocrDisponivel() { const r = rec(); return !!(r.ocr || r.ocrEmbutido); }
  function carregarOCR(progresso = () => {}) {
    if (ocrPronto) return ocrPronto;
    const r = rec();
    ocrPronto = (async () => {
      if (r.ocrEmbutido) {                        // standalone HTML with embedded OCR: base64 -> Blob URLs
        const blob = (k, tipo) => URL.createObjectURL(new Blob([Uint8Array.from(atob(r.ocrEmbutido[k]), (ch) => ch.charCodeAt(0))], { type: tipo }));
        if (!globalThis.ort) await carregarScript(blob("ortjs", "text/javascript"));
        progresso("Preparando a leitura\u2026");
        await CH.ocr.carregar("", { fontes: { mjs: blob("ortmjs", "text/javascript"), wasm: blob("ortwasm", "application/wasm"),
          det: blob("det", "application/octet-stream"), rec: blob("rec", "application/octet-stream"),
          cls: blob("cls", "application/octet-stream"), chaves: atob(r.ocrEmbutido.chaves) } });
        return true;
      }
      if (!globalThis.ort) await carregarScript(r.ocr + "ort/ort.wasm.min.js");
      progresso("Baixando o leitor de validade (s\u00f3 na primeira vez)\u2026");
      await CH.ocr.carregar(r.ocr);
      return true;
    })();
    ocrPronto.catch(() => { ocrPronto = null; });
    return ocrPronto;
  }

  return { abrir, metadadosJpeg, copiaLimpa, codigos, ocrDisponivel, carregarOCR };
})();
CH.ocr = globalThis.ComerHojeOCR;

/* ---- srcjs/app/50-ui.js ---- */
// 50-ui.js: shell, router, sheets, toasts and shared components. Both frameworks (Lumen, Neue) use the
// same markup; the CSS (and a few data-framework conditionals) gives each its voice.
CH.ui = (() => {
  const I = (n, c) => CH.icone(n, c);
  const TELAS = [
    { id: "inicio", rotulo: "In\u00edcio", icone: "house", tecla: "1" },
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
      <a class="ch-pular" href="#ch-principal">Pular para o conte\u00fado</a>
      <header class="ch-topo">
        <a class="ch-marca" href="#/inicio" aria-label="comerHoje, in\u00edcio">
          <span class="ch-logo">${I("leaf")}</span>
          <span class="ch-marca-texto"><span class="ch-marca-nome">comer<b>Hoje</b></span><span class="ch-marca-sub">cozinha sem desperd\u00edcio</span></span>
        </a>
        <nav class="ch-nav" aria-label="Navega\u00e7\u00e3o principal">${TELAS.map((t) => `<a class="ch-aba" data-tela="${t.id}" href="#/${t.id}">${I(t.icone)}<span>${t.rotulo}</span></a>`).join("")}</nav>
        <div class="ch-acoes">
          <button class="ch-cmd-campo" data-acao="cmd" type="button">${I("search")}<span>Buscar ou agir\u2026</span><kbd>Ctrl K</kbd></button>
          <span class="ch-status" id="ch-status" role="status"></span>
          <span class="ch-modo" title="Formato desta entrega">${({ shiny: "Shiny", quarto: "Quarto", html: "HTML" })[CH.modo] || "HTML"}</span>
          <button class="ch-botao ch-botao--icone" data-acao="tema" type="button" aria-label="Alternar claro/escuro">${I("sun-moon")}</button>
          <a class="ch-botao ch-botao--icone" href="#/ajustes" aria-label="Ajustes">${I("settings")}</a>
        </div>
      </header>
      <main class="ch-principal" id="ch-principal" tabindex="-1"></main>
      <nav class="ch-abas-baixo" aria-label="Navega\u00e7\u00e3o principal (celular)">${TELAS.map((t) => `<a class="ch-aba${t.destaque ? " ch-aba--destaque" : ""}" data-tela="${t.id}" href="#/${t.id}"><span class="ch-aba-icone">${I(t.icone)}</span><span>${t.rotulo}</span></a>`).join("")}</nav>
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
    if (nova) { window.scrollTo(0, 0); document.title = `${t.titulo || "comerHoje"} \u00b7 comerHoje`; }
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
      l.validade_origem === "estimada" || !l.validade ? "data estimada" : null].filter(Boolean).join(" \u00b7 ");
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

/* ---- srcjs/app/60-inicio.js ---- */
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
    const colunas = [["vencido", "Vencidos"], ["urgente", "At\u00e9 3 dias"], ["atencao", "Esta semana"], ["ok", "Depois"]];
    return `<div class="ch-pontos" role="img" aria-label="${lotes.length} itens: ${colunas.map(([f, t]) => `${lotes.filter((l) => l.faixa === f).length} ${t.toLowerCase()}`).join(", ")}">
      ${colunas.map(([f, t]) => { const L = lotes.filter((l) => l.faixa === f || (f === "ok" && l.faixa === "sem"));
        return `<div class="ch-pontos-col"><div class="ch-pontos-grade">${L.map((l) => `<i class="ch-ponto ch-ponto--${l.faixa}" title="${CH.esc(l.ing.nome)} \u00b7 ${CH.esc(CH.fmt.validade(l.dias))}"></i>`).join("")}</div>
          <div class="ch-pontos-rotulo"><b class="ch-num">${L.length}</b><span>${t}</span></div></div>`; }).join("")}
    </div>`;
  }

  function cartaoSugestao(s) {
    if (!s) return `<article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Sugest\u00e3o para hoje</h2></header>
      <p class="ch-suave">Sem receita que use bem o que voc\u00ea tem agora. Que tal escanear o que chegou do mercado?</p></article>`;
    const pessoas = +(CH.loja.get().config.pessoas || 2);
    return `<article class="ch-cartao ch-cartao--sugestao">
      <header class="ch-cartao-topo"><h2 class="ch-sobrancelha">${new Date().getHours() < 15 ? "Sugest\u00e3o para o almo\u00e7o" : "Sugest\u00e3o para o jantar"}</h2>
        ${s.salva.length ? CH.ui.chip("urgente", "salva " + s.salva.length + (s.salva.length > 1 ? " itens" : " item")) : ""}</header>
      <h3 class="ch-receita-nome">${CH.esc(s.receita.nome)}</h3>
      <p class="ch-receita-linha">${I("check")}<span>usa: ${s.usados.map((l) => `${CH.esc(l.ing.nome.toLowerCase())}${l.dias != null && l.dias <= 3 ? ` <span class="ch-suave">(${CH.fmt.validade(l.dias)})</span>` : ""}`).join(", ")}</span></p>
      ${s.falta.length ? `<p class="ch-receita-linha ch-suave">${I("shopping-cart")}<span>falta: ${s.falta.map((f) => `${CH.esc(CH.dados.nomeIng(f.id).toLowerCase())} ${CH.fmt.qtd(f.q, CH.dados.ing(f.id).unidade_base, f.id)}`).join(", ")}</span></p>` : ""}
      <div class="ch-botoes"><button class="ch-botao ch-botao--primario" data-acao="cozinhar" data-receita="${s.receita.id}" type="button">Vou fazer \u00b7 ${pessoas} por\u00e7\u00f5es</button>
        <a class="ch-botao ch-botao--fantasma" href="#/plano">Ver a semana</a></div></article>`;
  }

  CH.telas.inicio = {
    titulo: "In\u00edcio",
    render() {
      const lumen = CH.ap.framework === "lumen";
      const L = CH.loja.lotesAtivos(), urg = L.filter((l) => l.faixa === "urgente" || l.faixa === "vencido");
      const res = CH.loja.resumoMes(), s = CH.sugestaoHoje(), hoje = CH.hoje();
      if (!L.length) {
        return `${lumen ? `<section class="ch-hero"><p class="ch-sobrancelha">${CH.fmt.extenso(hoje)}</p>
            <h1 class="ch-display">Comer hoje,<br><span class="ch-grad">sem desperd\u00edcio.</span></h1>
            <p class="ch-lede">Fotografe a validade do que chegou do mercado. O comerHoje lembra o que vence antes e sugere o que cozinhar.</p></section>`
          : `<header class="ch-tela-topo"><div><p class="ch-sobrancelha">${CH.fmt.extenso(hoje)}</p><h1 class="ch-titulo">In\u00edcio</h1></div></header>`}
          ${CH.ui.vazio("scan-line", "Sua cozinha ainda est\u00e1 vazia aqui", "Escaneie a validade de um item, adicione \u00e0 m\u00e3o ou carregue o exemplo feito com as fotos de refer\u00eancia.",
            `<a class="ch-botao ch-botao--primario ch-botao--grande" href="#/escanear">${I("scan-line")} Escanear validade</a>
             <button class="ch-botao ch-botao--fantasma" data-acao="exemplo" type="button">Carregar exemplo</button>`)}`;
      }
      const lista = (L.filter((l) => l.faixa !== "ok" && l.faixa !== "sem").length ? L.filter((l) => l.faixa !== "ok" && l.faixa !== "sem") : L).slice(0, 5);
      const usePrimeiro = `<article class="ch-cartao ch-cartao--use">
        <header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Use primeiro</h2><a class="ch-link" href="#/estoque">Estoque ${I("chevron-right")}</a></header>
        <ul class="ch-lista">${lista.map(CH.ui.itemLote).join("")}</ul></article>`;
      const tiles = [
        { v: CH.fmt.brl(res.evitado), t: "evitados", d: `Valor do que foi usado antes de vencer em ${CH.fmt.mes(hoje)}, pelos pre\u00e7os registrados.` },
        { v: CH.fmt.brl(res.descartado), t: "descartados", d: res.kgDesc ? `${CH.fmt.enxuto(res.kgDesc)} kg foram para o lixo este m\u00eas.` : "O que foi jogado fora este m\u00eas, pelo pre\u00e7o pago." },
        { v: res.aproveitamento == null ? "\u2014" : CH.fmt.num(res.aproveitamento * 100) + " %", t: "aproveitamento", d: "Dos itens que sa\u00edram do estoque, quantos foram usados a tempo." },
      ];
      if (lumen) {
        const frase = urg.length ? `${urg.length} ${urg.length === 1 ? "item vence" : "itens vencem"} nos pr\u00f3ximos 3 dias.${s && s.salva.length ? ` ${CH.esc(s.receita.nome)} resolve ${s.salva.length === 1 ? "um deles" : "parte deles"}.` : ""}`
          : `Nada vence nos pr\u00f3ximos 3 dias. ${L.length} itens no estoque.`;
        return `<section class="ch-hero"><p class="ch-sobrancelha">${CH.fmt.extenso(hoje)}</p>
            <h1 class="ch-display">Comer hoje,<br><span class="ch-grad">sem desperd\u00edcio.</span></h1>
            <p class="ch-lede">${frase}</p>
            <div class="ch-botoes"><a class="ch-botao ch-botao--primario ch-botao--grande" href="#/escanear">${I("scan-line")} Escanear validade</a>
              <a class="ch-botao ch-botao--fantasma ch-botao--grande" href="#/estoque">Ver estoque</a></div></section>
          <div class="ch-grade ch-grade--inicio">${usePrimeiro}${cartaoSugestao(s)}
            <article class="ch-cartao ch-cartao--historia"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Sua cozinha, item por item</h2></header>
              ${pontos(L)}<p class="ch-suave ch-legenda">Cada ponto \u00e9 uma embalagem. A cor diz quando vence, e a legenda diz quantos.</p></article>
            ${tiles.map((x) => `<article class="ch-cartao ch-tile"><p class="ch-tile-num ch-num">${x.v}</p><p class="ch-tile-rot">${x.t}</p><p class="ch-tile-exp">${x.d}</p></article>`).join("")}
          </div>`;
      }
      const kpis = [
        { v: L.length, t: "itens ativos", href: "#/estoque" },
        { v: urg.length, t: "vencem em \u2264 3 dias", href: "#/estoque", cls: urg.length ? "ch-kpi--alerta" : "" },
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

/* ---- srcjs/app/61-estoque.js ---- */
// 61-estoque.js: stock (lists by urgency, lot sheet with actions, add form).
(() => {
  const I = (n, c) => CH.icone(n, c);
  const filtro = { local: "todos", busca: "" };
  const GRUPOS = [["vencido", "Vencidos: confira antes de usar"], ["urgente", "Vence em at\u00e9 3 dias"], ["atencao", "Esta semana"], ["ok", "Mais tarde"], ["sem", "Sem data"]];
  const LOCAIS = [["geladeira", "Geladeira"], ["freezer", "Freezer"], ["despensa", "Despensa"], ["fruteira", "Fruteira"]];

  function filtrados() {
    const t = CH.core.normalizarTermo(filtro.busca);
    return CH.loja.lotesAtivos().filter((l) => (filtro.local === "todos" || l.local === filtro.local) &&
      (!t || CH.core.normalizarTermo(l.ing.nome + " " + (l.descricao || "") + " " + (l.ing.sinonimos || "")).includes(t)));
  }
  function grupos() {
    const L = filtrados();
    if (!L.length) return CH.ui.vazio("package", filtro.busca ? "Nada encontrado" : "Nada aqui ainda",
      filtro.busca ? `Nenhum item com \u201c${CH.esc(filtro.busca)}\u201d.` : "Escaneie a validade ou adicione um item.",
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
      ["Validade do r\u00f3tulo", l.validade ? CH.fmt.data(l.validade) : "\u2014"],
      l.aberto_em ? ["Aberto em", `${CH.fmt.data(l.aberto_em)}${g.aberto_dias != null ? ` \u00b7 ${g.aberto_dias} dias ap\u00f3s aberto` : ""}`] : null,
      ["Vale at\u00e9", `<b>${CH.fmt.data(ve)}</b> \u00b7 ${CH.fmt.validade(CH.dias(ve))}${!l.validade ? " (estimada pelo cat\u00e1logo)" : ""}`],
      l.preco_total != null ? ["Pre\u00e7o pago", CH.fmt.brl(l.preco_total)] : null,
      l.descricao && l.descricao !== g.nome ? ["Descri\u00e7\u00e3o", CH.esc(l.descricao)] : null,
      l.gtin ? ["C\u00f3digo", `<span class="ch-mono">${CH.esc(l.gtin)}</span>`] : null,
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
    CH.ui.aviso(tipo === "descarte" ? `${CH.esc(l.ing.nome)} descartado. Obrigado por registrar: isso mede o desperd\u00edcio.`
      : `${CH.esc(l.ing.nome)}: ${CH.fmt.qtd(q, l.ing.unidade_base, l.ingrediente_id)} usados${l.dias != null && l.dias >= 0 ? " a tempo" : ""}.`, "ok");
  }
  CH.ui.registrar("abri", (el) => {
    const l = lote(el.dataset.id); if (!l) return;
    CH.tr.op("lote.abrir", { id: l.id, data: CH.hoje() });
    const ve = CH.core.validadeEfetiva({ ...l, aberto_em: CH.hoje() }, l.ing);
    CH.ui.fecharFolha();
    CH.ui.aviso(l.ing.aberto_dias != null ? `${CH.esc(l.ing.nome)} aberto: use at\u00e9 ${CH.fmt.data(ve, true)} (${l.ing.aberto_dias} dias ap\u00f3s aberto).` : `${CH.esc(l.ing.nome)} marcado como aberto.`, "info", 5000);
  });
  CH.ui.registrar("mover", (el) => {
    const l = lote(el.dataset.id); if (!l) return;
    if (l.local === "freezer") CH.tr.op("lote.mover", { id: l.id, local: "geladeira", validade: CH.core.somarDias(CH.hoje(), 2), validade_origem: "estimada" });
    else CH.tr.op("lote.mover", { id: l.id, local: "freezer", validade: CH.core.somarDias(CH.hoje(), l.ing.categoria_id === "carnes" || l.ing.categoria_id === "peixes" ? 90 : 60), validade_origem: "estimada" });
    CH.ui.fecharFolha();
    CH.ui.aviso(l.local === "freezer" ? "Descongelado: use em at\u00e9 2 dias." : "Congelado: validade estendida (estimativa).", "ok");
  });
  CH.ui.registrar("descartar", (el) => {
    const l = lote(el.dataset.id); if (!l) return;
    const motivos = [["venceu", "Venceu"], ["estragou", "Estragou antes"], ["sobra_esquecida", "Esqueci"], ["nao_gostou", "N\u00e3o gostamos"], ["outro", "Outro"]];
    CH.ui.folha(`Descartar ${CH.esc(l.ing.nome)}`, `<p class="ch-suave">Por qu\u00ea? Isso ajuda a medir e reduzir o desperd\u00edcio.</p>
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
        <input class="ch-entrada" name="item" autocomplete="off" ${g ? "" : "autofocus"} placeholder="ex.: feij\u00e3o, aipim, nata\u2026" value="${CH.esc(g ? g.nome : "")}">
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
        <label class="ch-campo"><span class="ch-rotulo">Pre\u00e7o pago (R$)</span><input class="ch-entrada" name="preco" inputmode="decimal" autocomplete="off" value="${pre.preco_total != null ? CH.fmt.num(pre.preco_total, 2) : ""}"></label>
      </div>
      <label class="ch-check"><input type="checkbox" name="aberto" ${pre.aberto_em ? "checked" : ""}><span>J\u00e1 est\u00e1 aberto</span></label>
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
    if (!ingId) return CH.ui.aviso("Escolha um item da lista (o cat\u00e1logo tem nomes regionais: aipim, bergamota, nata\u2026).", "erro", 5000);
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

/* ---- srcjs/app/62-plano.js ---- */
// 62-plano.js: weekly plan (greedy FEFO in the browser; MILP on the server when available),
// cooking (FEFO consumption) and leftovers.
(() => {
  const I = (n, c) => CH.icone(n, c);
  const NOMES_REF = { cafe: "Caf\u00e9", almoco: "Almo\u00e7o", lanche: "Lanche", jantar: "Jantar" };

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
      catch (e) { CH.ui.aviso("Otimizador do servidor indispon\u00edvel; usando o m\u00e9todo do aparelho.", "info"); }
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
      <p class="ch-suave">Isto sai do estoque (${pessoas} por\u00e7\u00f5es, primeiro o que vence antes):</p>
      <ul class="ch-lista ch-lista--simples">${usos.length ? usos.map(({ l, q }) => `<li><span>${CH.esc(l.ing.nome)}</span><span class="ch-num">${CH.fmt.qtd(q, l.ing.unidade_base, l.ingrediente_id)}</span></li>`).join("")
        : `<li class="ch-suave">Nada do estoque (s\u00f3 b\u00e1sicos).</li>`}</ul>
      <label class="ch-campo"><span class="ch-rotulo">Sobrou alguma por\u00e7\u00e3o para depois?</span>
        <span class="ch-linha"><input class="ch-entrada" id="ch-sobras" inputmode="numeric" placeholder="0"> <span class="ch-suave">por\u00e7\u00f5es (vale 3 dias na geladeira)</span></span></label>
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
      const topo = `<header class="ch-tela-topo"><div><p class="ch-sobrancelha">${P ? `${CH.fmt.data(P.inicio, true)} a ${CH.fmt.data(P.fim, true)} \u00b7 ${P.pessoas || 2} pessoas` : "7 dias"}</p><h1 class="ch-titulo">Plano da semana</h1></div>
        <button class="ch-botao ch-botao--primario" data-acao="gerar-plano" type="button">${I("sparkles")} ${P ? "Refazer" : "Gerar plano"}</button></header>`;
      if (!P) return topo + CH.ui.vazio("calendar-days", "Nenhum plano ainda", "O plano usa primeiro o que vence antes e lista s\u00f3 o que falta comprar.",
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
          <button class="ch-botao ch-botao--pequeno" data-acao="plano-para-compras" type="button">${I("shopping-cart")} P\u00f4r na lista</button></header>
          <ul class="ch-lista ch-lista--simples">${falta.map((c) => `<li><span>${CH.esc(CH.dados.nomeIng(c.id))}</span><span class="ch-num">${CH.fmt.qtd(c.q, CH.dados.ing(c.id).unidade_base, c.id)}</span></li>`).join("")}</ul></article>` : "";
      const nota = `<p class="ch-suave ch-legenda">${P.metodo === "milp" ? "Otimizado no servidor (programa\u00e7\u00e3o inteira)." : "Calculado no aparelho: primeiro o que vence antes."} B\u00e1sicos (sal, \u00f3leo, a\u00e7\u00facar\u2026) n\u00e3o entram na conta.</p>`;
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
    CH.ui.aviso(n ? `${n} ${n === 1 ? "item adicionado" : "itens adicionados"} \u00e0 lista de compras.` : "Tudo j\u00e1 estava na lista.", "ok");
  });
})();

/* ---- srcjs/app/63-compras.js ---- */
// 63-compras.js: shopping list grouped by market section (walking order).
(() => {
  const I = (n, c) => CH.icone(n, c);
  CH.telas.compras = {
    titulo: "Compras",
    render() {
      const itens = CH.loja.get().compras.filter((c) => !c.excluido);
      const topo = `<header class="ch-tela-topo"><div><p class="ch-sobrancelha">${itens.filter((c) => !c.comprado).length} a comprar</p><h1 class="ch-titulo">Compras</h1></div>
        ${itens.some((c) => c.comprado) ? `<button class="ch-botao ch-botao--primario" data-acao="comprados-estoque" type="button">${I("package")} Comprados \u2192 estoque</button>` : ""}</header>
        <form class="ch-form ch-form--linha" data-form="compra">
          <label class="ch-campo ch-autocompletar ch-cresce"><span class="ch-rotulo ch-so-leitor">Adicionar item</span>
            <input class="ch-entrada" name="item" placeholder="Adicionar: tomate, nata, p\u00e3o de trigo\u2026" autocomplete="off"><input type="hidden" name="ingrediente_id">
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
    CH.ui.aviso(`${n} ${n === 1 ? "item foi" : "itens foram"} para o estoque com validade estimada. Escaneie os r\u00f3tulos para ficar exato.`, "ok", 5200);
  });
})();

/* ---- srcjs/app/64-ajustes.js ---- */
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
        <article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Apar\u00eancia</h2></header>
          <div class="ch-campo"><span class="ch-rotulo">Estilo (Taiga design system): experimente os dois</span>
            ${CH.ui.seg("framework", [["lumen", "Lumen"], ["neue", "Neue"]], ap.framework, "Estilo")}
            <span class="ch-ajuda">${ap.framework === "lumen" ? "Lumen: cinematogr\u00e1fico, vidro e luz ambiente. Feito para o celular." : "Neue: denso e calmo, n\u00fameros em fonte mono, atalhos de teclado. Feito para trabalhar."}</span></div>
          <div class="ch-campo"><span class="ch-rotulo">Tema</span>${CH.ui.seg("tema", [["claro", "Claro"], ["escuro", "Escuro"], ["auto", "Autom\u00e1tico"]], ap.tema, "Tema")}</div>
          ${ap.framework === "lumen" ? `<div class="ch-campo"><span class="ch-rotulo">Luz ambiente</span>${CH.ui.seg("ambiente", [["on", "Ligada"], ["off", "Desligada"]], ap.ambiente, "Luz ambiente")}</div>` : `
          <div class="ch-campo"><span class="ch-rotulo">Tamanho do texto</span>${CH.ui.seg("texto", [["s", "P"], ["m", "M"], ["l", "G"], ["xl", "GG"]], ap.texto, "Tamanho do texto")}</div>
          <div class="ch-campo"><span class="ch-rotulo">Densidade</span>${CH.ui.seg("densidade", [["compact", "Compacta"], ["comfortable", "Confort\u00e1vel"], ["roomy", "Ampla"]], ap.densidade, "Densidade")}</div>
          <div class="ch-campo"><span class="ch-rotulo">Contraste</span>${CH.ui.seg("contraste", [["standard", "Padr\u00e3o"], ["high", "Alto"]], ap.contraste, "Contraste")}</div>
          <div class="ch-campo"><span class="ch-rotulo">Fundo</span>${CH.ui.seg("fundo", [["dots", "Pontos"], ["plain", "Liso"]], ap.fundo, "Fundo")}</div>`}
        </article>

        <article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Leitura da validade</h2></header>
          <ul class="ch-lista ch-lista--simples">
            <li><span>${I("smartphone")} No aparelho (gr\u00e1tis, a foto n\u00e3o sai do celular)</span><span>${ocr ? CH.ui.chip("ok", "dispon\u00edvel") : CH.ui.chip("sem", "n\u00e3o inclu\u00edda")}</span></li>
            <li><span>${I("sparkles")} IA na nuvem (quando o aparelho n\u00e3o tiver certeza)</span><span>${caps.visao ? CH.ui.chip("ok", "configurada") : CH.ui.chip("sem", caps.servidor ? "sem chave no servidor" : "s\u00f3 no app Shiny")}</span></li>
            <li><span>${I("scan-barcode")} C\u00f3digo de barras e etiqueta de balan\u00e7a</span><span>${CH.ui.chip("ok", "no aparelho")}</span></li>
            <li><span>${I("receipt")} Nota fiscal (NFC-e) de Santa Catarina</span><span>${caps.nfce ? CH.ui.chip("ok", "SEFAZ-SC") : CH.ui.chip("sem", "s\u00f3 no app Shiny")}</span></li>
          </ul>
          <div class="ch-campo"><span class="ch-rotulo">Quando usar a IA na nuvem</span>${CH.ui.seg("visao", [["duvida", "S\u00f3 na d\u00favida"], ["sempre", "Sempre"], ["nunca", "Nunca"]], cfg.visao || "duvida", "Quando usar a IA")}</div>
        </article>

        <article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Planilha Google</h2>
            ${cfg.ultima_sync ? CH.ui.chip("ok", "sincronizada " + CH.fmt.hora(cfg.ultima_sync)) : ""}</header>
          ${caps.sync === "servidor" ? `<p class="ch-suave">Configurada no servidor (${caps.planilha ? `<span class="ch-mono">${CH.esc(caps.planilha)}</span>` : "sem planilha definida"}). Altera\u00e7\u00f5es s\u00e3o enviadas sozinhas.</p>
              <button class="ch-botao" data-acao="sync" type="button" ${caps.planilha ? "" : "disabled"}>${I("refresh-cw")} Sincronizar agora</button>`
          : `<form class="ch-form" data-form="planilha">
              <label class="ch-campo"><span class="ch-rotulo">Endere\u00e7o do Apps Script (leitura e grava\u00e7\u00e3o)</span><input class="ch-entrada" name="url" type="url" value="${CH.esc(local.url || "")}" placeholder="https://script.google.com/macros/s/\u2026/exec"></label>
              <label class="ch-campo"><span class="ch-rotulo">Senha do script</span><input class="ch-entrada" name="token" type="password" value="${CH.esc(local.token || "")}" autocomplete="off"><span class="ch-ajuda">Fica s\u00f3 neste aparelho. N\u00e3o vai para dentro do arquivo.</span></label>
              <label class="ch-campo"><span class="ch-rotulo">Ou: ID da planilha p\u00fablica (somente leitura)</span><input class="ch-entrada" name="id" value="${CH.esc(local.id || "")}" placeholder="1AbC\u2026"></label>
              <div class="ch-botoes"><button class="ch-botao">Salvar</button><button class="ch-botao ch-botao--fantasma" data-acao="sync" type="button">${I("refresh-cw")} Sincronizar</button></div></form>`}
        </article>

        <article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Casa</h2></header>
          <div class="ch-campo"><span class="ch-rotulo">Pessoas por refei\u00e7\u00e3o</span>${CH.ui.seg("pessoas", [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5+"]], String(cfg.pessoas || 2), "Pessoas")}</div>
          <div class="ch-campo"><span class="ch-rotulo">Planejar</span>${CH.ui.seg("refeicoes", [["almoco,jantar", "Almo\u00e7o + jantar"], ["jantar", "S\u00f3 jantar"], ["cafe,almoco,jantar", "As tr\u00eas"]], (cfg.refeicoes || ["almoco", "jantar"]).join(","), "Refei\u00e7\u00f5es")}</div>
        </article>

        <article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Privacidade</h2></header>
          <p>${I("shield-check")} Localiza\u00e7\u00e3o (GPS), modelo do celular e data da foto <b>nunca saem do aparelho</b>: a leitura \u00e9 feita aqui, e qualquer c\u00f3pia enviada \u00e9 refeita a partir dos pixels, sem metadados. No servidor, as fotos n\u00e3o s\u00e3o guardadas.</p></article>

        <article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Dados</h2></header>
          <div class="ch-grade-botoes">
            <button class="ch-botao" data-acao="exemplo" type="button">${I("sparkles")} Carregar exemplo</button>
            <button class="ch-botao" data-acao="exportar" type="button">${I("download")} Exportar (JSON)</button>
            <label class="ch-botao">${I("upload")} Importar<input type="file" accept="application/json" data-importar hidden></label>
            <button class="ch-botao ch-botao--perigo" data-acao="apagar" type="button">${I("trash-2")} Apagar tudo</button></div></article>

        <article class="ch-cartao"><header class="ch-cartao-topo"><h2 class="ch-sobrancelha">Este formato</h2>${CH.ui.chip("acento", ({ shiny: "Shiny", quarto: "Quarto", html: "HTML" })[CH.modo])}</header>
          <table class="ch-tabela"><thead><tr><th></th><th>Shiny</th><th>Quarto</th><th>HTML</th></tr></thead><tbody>
            <tr><th>Funciona sem servidor</th><td>\u2013</td><td>\u2713</td><td>\u2713</td></tr>
            <tr><th>Dados entre aparelhos</th><td>\u2713 SQLite</td><td>via planilha</td><td>via planilha</td></tr>
            <tr><th>Validade lida no aparelho</th><td>\u2713</td><td>se inclu\u00edda</td><td>se inclu\u00edda</td></tr>
            <tr><th>IA na nuvem, NFC-e SC</th><td>\u2713</td><td>\u2013</td><td>\u2013</td></tr></tbody></table></article>
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
    } catch (err) { CH.ui.aviso("Arquivo inv\u00e1lido: " + err.message, "erro"); }
  });
  CH.ui.registrar("apagar", () => {
    CH.ui.folha("Apagar tudo?", `<p>Isto apaga estoque, compras, plano e hist\u00f3rico ${CH.modo === "shiny" ? "no servidor (para todos da casa)" : "deste navegador"}. Os ajustes ficam.</p>
      <button class="ch-botao ch-botao--perigo ch-botao--bloco" data-acao="apagar-sim" type="button">Apagar tudo</button>`);
  });
  CH.ui.registrar("apagar-sim", () => { CH.tr.op("tudo.apagar", {}); CH.ui.fecharFolha(); CH.ui.aviso("Tudo apagado.", "ok"); });
})();

/* ---- srcjs/app/70-escanear.js ---- */
// 70-escanear.js: scanning. Label (expiry date), scale label (weight/price), NFC-e SC receipt
// (QR -> SEFAZ-SC on the server), fridge (cloud vision or quick check).
// Everything is read on the device. The cloud only receives a re-encoded copy without metadata, only
// when the device is unsure (or always/never, per Ajustes) and only in the Shiny app.
(() => {
  const I = (n, c) => CH.icone(n, c);
  const MODOS = [["rotulo", "R\u00f3tulo"], ["balanca", "Balan\u00e7a"], ["nota", "Nota SC"], ["geladeira", "Geladeira"]];
  let S = CH.transporte.ler("rascunho", null) || novo("rotulo");
  S.foto = null;                                   // the image never goes into localStorage
  function novo(modo) { return { modo, fase: "inicio", passos: [], leitura: null, produto: {}, balanca: null, nota: null, candidatos: [], textoOcr: "" }; }
  const salvarRascunho = () => { const { foto, ...r } = S; CH.transporte.gravar("rascunho", r.fase === "confirmar" ? r : null); };
  const redesenhar = () => { if (CH.ui.tela === "escanear") CH.ui.render(); salvarRascunho(); };
  const passo = (id, texto, estado = "andando") => {
    const p = S.passos.find((x) => x.id === id);
    if (p) Object.assign(p, { texto, estado }); else S.passos.push({ id, texto, estado });
    redesenhar();
  };

  // ---------- flow ----------
  async function aoEscolher(arquivo) {
    S = { ...novo(S.modo), fase: "lendo" };
    try {
      const f = await CH.foto.abrir(arquivo);
      S.foto = { ...f, url: URL.createObjectURL(arquivo) };
      const removidos = [f.meta.gps && "localiza\u00e7\u00e3o (GPS)", f.meta.aparelho && "modelo do celular", f.meta.data && "data e hora"].filter(Boolean);
      passo("foto", removidos.length ? `Foto aberta no aparelho: ${removidos.join(", ")} n\u00e3o saem daqui` : "Foto aberta no aparelho", "ok");
      if (S.modo === "nota") return lerNota(f);
      if (S.modo === "geladeira") return lerGeladeira(f);
      await lerCodigos(f);
      await lerValidade(f);
      adivinharProduto();
      S.fase = "confirmar";
      redesenhar();
    } catch (e) {
      console.error(e); S.fase = "confirmar"; passo("erro", "Algo falhou: " + e.message + ". Preencha \u00e0 m\u00e3o.", "falhou");
    }
  }

  async function lerCodigos(f) {
    passo("codigo", "Procurando c\u00f3digo de barras\u2026");
    let cods = [];
    try { cods = await CH.foto.codigos(f.img); } catch (e) { passo("codigo", "Leitor de c\u00f3digo de barras indispon\u00edvel", "pulado"); return; }
    const ean = cods.find((c) => /^EAN|UPC/.test(c.formato));
    if (!ean) { passo("codigo", "Nenhum c\u00f3digo de barras leg\u00edvel (tudo bem: pelo texto tamb\u00e9m d\u00e1)", "pulado"); return; }
    aplicarGtin(ean.texto);
  }
  function aplicarGtin(gtin) {
    const bal = CH.core.parseEtiquetaBalanca(gtin);
    if (bal) {
      S.balanca = { ...(S.balanca || {}), total: bal.precoTotal, plu: bal.plu };
      S.produto.preco_total = bal.precoTotal;
      passo("codigo", `Etiqueta de balan\u00e7a ${gtin}: total ${CH.fmt.brl(bal.precoTotal)}`, "ok");
      return;
    }
    S.produto.gtin = gtin;
    const conhecido = (CH.loja.get().produtos || {})[gtin];
    if (conhecido) { Object.assign(S.produto, { ingrediente_id: conhecido.ingrediente_id, descricao: conhecido.descricao, via: "c\u00f3digo (j\u00e1 visto)" });
      if (conhecido.qtd_embalagem) S.produto.quantidade = conhecido.qtd_embalagem; }
    passo("codigo", `C\u00f3digo ${gtin}${conhecido ? `: ${CH.esc(CH.dados.nomeIng(conhecido.ingrediente_id))}` : ""}`, "ok");
    if (!conhecido && CH.tr.capacidades.servidor) {
      CH.tr.consulta("produto.gtin", { gtin }, 8000).then((r) => {
        if (r && r.ingrediente_id && !S.produto.ingrediente_id) { Object.assign(S.produto, { ingrediente_id: r.ingrediente_id, descricao: r.descricao, via: r.fonte }); redesenhar(); }
      }).catch(() => {});
    }
  }

  async function lerValidade(f, roi = null) {
    const cfg = CH.loja.get().config, caps = CH.tr.capacidades;
    let r = null;
    if (CH.foto.ocrDisponivel() && cfg.visao !== "sempre") {
      passo("validade", "Preparando a leitura no aparelho\u2026");
      try {
        await CH.foto.carregarOCR((m) => passo("validade", m));
        const temProduto = (txt) => !!S.produto.ingrediente_id || txt.split("\n").some((l) => { const m = CH.dados.casar(l)[0]; return m && m.escore >= 0.7; });
        r = await globalThis.ComerHojeLeitor.lerRotulo(f.img, { hoje: CH.hoje(), roi, temProduto, progresso: (m) => passo("validade", m) });
        S.textoOcr = (r.textos || []).map((t) => t.texto).join("\n");
        S.linhas = r.linhas || [];
      } catch (e) { console.error(e); passo("validade", "Leitura no aparelho falhou: " + e.message, "falhou"); }
    }
    const duvida = !r || !r.validade || r.confianca < 0.8;
    if (caps.visao && cfg.visao !== "nunca" && (cfg.visao === "sempre" || duvida)) {
      passo("nuvem", "Perguntando \u00e0 IA na nuvem (c\u00f3pia sem metadados)\u2026");
      try {
        const copia = await CH.foto.copiaLimpa(f.img, 1600);
        const v = await CH.tr.consulta("visao.ler", { modo: S.modo, imagem: copia.base64, hoje: CH.hoje() }, 60000);
        const leituraNuvem = { validade: v.validade || null, confianca: v.validade ? Math.min(0.9, v.confianca || 0.8) : 0, trecho: v.trecho || "IA", peso: 1, fabricacao: v.fabricacao || null };
        r = CH.core.votarDatas([...(r ? [{ ...r, peso: 1 }] : []), leituraNuvem]);
        if (v.produto && !S.produto.ingrediente_id) { const m = CH.dados.casar(v.produto); if (m[0] && m[0].escore >= 0.6) Object.assign(S.produto, { ingrediente_id: m[0].id, via: "IA" }); }
        if (v.quantidade && !S.produto.quantidade) Object.assign(S.produto, { quantidade: v.quantidade, unidade: v.unidade });
        passo("nuvem", v.validade ? `IA: validade ${CH.fmt.data(v.validade)}` : "IA tamb\u00e9m n\u00e3o achou a data", v.validade ? "ok" : "pulado");
      } catch (e) { passo("nuvem", "IA indispon\u00edvel: " + e.message, "pulado"); }
    }
    S.leitura = r;
    if (S.modo === "balanca") {
      const b = CH.core.lerBalancaTexto(S.textoOcr);
      S.balanca = { ...(S.balanca || {}), ...Object.fromEntries(Object.entries(b).filter(([, v]) => v != null)) };
      if (!S.balanca.total && b.total) S.produto.preco_total = b.total;
      for (const g of CH.core.gtinsDoTexto(S.textoOcr)) if (!S.produto.preco_total || !S.produto.gtin) aplicarGtin(g);
      if (S.balanca.pesoKg) S.produto.quantidade = S.balanca.pesoKg * 1000;
      else if (S.balanca.total && S.balanca.precoKg) S.produto.quantidade = Math.round((S.balanca.total / S.balanca.precoKg) * 1000);
      S.produto.preco_total = S.produto.preco_total || S.balanca.total || null;
      passo("validade", r && r.pesagem ? `Pesado em ${CH.fmt.data(r.pesagem)}${S.balanca.pesoKg ? ` \u00b7 ${CH.fmt.enxuto(S.balanca.pesoKg)} kg` : ""}${S.balanca.consistente ? " \u00b7 pre\u00e7o confere" : ""}` : "Etiqueta lida", "ok");
      return;
    }
    if (r && r.validade) passo("validade", `Validade ${CH.fmt.data(r.validade)}${r.confianca >= 0.8 ? "" : " (confira)"}`, r.confianca >= 0.8 ? "ok" : "aviso");
    else if (!r && !CH.foto.ocrDisponivel() && !caps.visao) passo("validade", "Leitura autom\u00e1tica n\u00e3o inclu\u00edda neste formato: digite a validade", "pulado");
    else passo("validade", "N\u00e3o achei a validade com seguran\u00e7a: digite ou marque na foto", "aviso");
  }

  // Product from the label text: the LARGEST lines first (names and brands are big type; ingredient
  // lists, full of "cebola, sal, a\u00e7\u00facar", are small). Then synonyms learned from earlier confirmations.
  const maiores = () => [...(S.linhas || [])].sort((a, b) => b.altura - a.altura).slice(0, 10).map((l) => l.texto);
  const ehMarca = (t) => { const n = CH.core.normalizarTermo(t); return n.replace(/[^a-z]/g, "").length >= 5 && !/\b(val|validade|lote|fab|peso|total|kcal)\b/.test(n) ? n : null; };
  function adivinharProduto() {
    if (S.produto.ingrediente_id) return;
    const aprendidos = CH.loja.get().aprendidos || {};
    for (const t of maiores()) {
      const m = CH.dados.casar(t)[0];
      if (m && m.escore >= 0.7) { Object.assign(S.produto, { ingrediente_id: m.id, descricao: t.slice(0, 60), via: "texto do r\u00f3tulo" }); break; }
      const n = ehMarca(t);
      if (n && aprendidos[n]) { Object.assign(S.produto, { ingrediente_id: aprendidos[n], descricao: t.slice(0, 60), via: "r\u00f3tulo j\u00e1 visto" }); break; }
    }
    if (!S.produto.quantidade) {
      const q = S.textoOcr.match(/(?<![\d,.])(\d{2,4}(?:[,.]\d+)?)\s*(kg|g|ml|l)\b/i) || S.textoOcr.match(/(?<![\d,.])(\d{2,4})\s*g[e\u212e]/i);
      if (q) { const v = CH.parseNum(q[1]), u = (q[2] || "g").toLowerCase(); S.produto.quantidade = u === "kg" || u === "l" ? v * 1000 : v; }
    }
  }

  // ---------- NFC-e (Santa Catarina) ----------
  async function lerNota(f) {
    passo("qr", "Lendo o QR code da nota\u2026");
    let cods = [];
    try { cods = await CH.foto.codigos(f.img); } catch (e) { /* no reader */ }
    const qr = cods.find((c) => c.formato === "QRCode");
    const info = CH.core.chaveNfce(qr ? qr.texto : "");
    if (!info) { S.fase = "nota"; passo("qr", "QR code n\u00e3o encontrado. Fotografe s\u00f3 o QR, bem de perto.", "falhou"); return; }
    S.nota = { url: qr.texto, ...info, itens: null };
    passo("qr", `NFC-e ${info.uf === "SC" ? "de Santa Catarina" : "de " + info.uf} \u00b7 n\u00ba ${info.numero} \u00b7 ${info.aamm.slice(2)}/20${info.aamm.slice(0, 2)}${info.valida ? "" : " \u00b7 chave com d\u00edgito inv\u00e1lido"}`, info.valida ? "ok" : "aviso");
    S.fase = "nota";
    if (CH.tr.capacidades.nfce) {
      passo("sefaz", "Buscando os itens na SEFAZ-SC\u2026");
      try {
        const r = await CH.tr.consulta("nfce.consultar", { url: qr.texto }, 30000);
        S.nota.itens = (r.itens || []).map((it) => { const m = CH.dados.casar(it.descricao)[0];
          return { ...it, ingrediente_id: m && m.escore >= 0.6 ? m.id : null, incluir: !!(m && m.escore >= 0.6) }; });
        passo("sefaz", `${S.nota.itens.length} itens encontrados${r.emitente ? " \u00b7 " + CH.esc(r.emitente) : ""}`, "ok");
      } catch (e) { passo("sefaz", "SEFAZ-SC n\u00e3o respondeu: " + e.message, "falhou"); }
    }
    redesenhar();
  }

  // ---------- fridge ----------
  async function lerGeladeira(f) {
    S.fase = "geladeira";
    if (CH.tr.capacidades.visao && CH.loja.get().config.visao !== "nunca") {
      passo("nuvem", "Identificando itens com a IA (c\u00f3pia sem metadados)\u2026");
      try {
        const copia = await CH.foto.copiaLimpa(f.img, 1280);
        const v = await CH.tr.consulta("visao.ler", { modo: "geladeira", imagem: copia.base64, hoje: CH.hoje() }, 90000);
        S.candidatos = (v.itens || []).map((it) => { const m = CH.dados.casar(it.nome)[0];
          return { ...it, ingrediente_id: m && m.escore >= 0.6 ? m.id : null, incluir: it.tipo === "alimento" && !!(m && m.escore >= 0.6) }; });
        passo("nuvem", `${S.candidatos.length} itens vistos na foto`, "ok");
      } catch (e) { passo("nuvem", "IA indispon\u00edvel: " + e.message, "pulado"); }
    } else passo("conf", "Confer\u00eancia r\u00e1pida: confirme o que ainda est\u00e1 na geladeira", "ok");
    redesenhar();
  }

  // ---------- rendering ----------
  function etapas() {
    return `<ol class="ch-passos" aria-live="polite">${S.passos.map((p) => `<li class="ch-passo ch-passo--${p.estado}">${I(
      { ok: "circle-check", falhou: "circle-x", pulado: "circle-minus", aviso: "circle-alert", andando: "loader" }[p.estado] || "circle", p.estado === "andando" ? "ch-gira" : "")}<span>${p.texto}</span></li>`).join("")}</ol>`;
  }
  function confirmar() {
    const p = S.produto, r = S.leitura || {}, g = p.ingrediente_id ? CH.dados.ing(p.ingrediente_id) : null;
    const conf = r.confianca || 0, faixa = !r.validade ? "sem" : conf >= 0.8 ? "ok" : "atencao";
    const alternativas = (r.alternativas || []).filter(Boolean);
    const unidade = p.unidade && g && CH.dados.unidadesPara(g.id).includes(p.unidade) ? p.unidade : g ? g.unidade_base : "g";
    return `<form class="ch-form ch-confirmar" data-form="scan">
      ${S.foto ? `<figure class="ch-foto"><img src="${S.foto.url}" alt="Foto escaneada"><button class="ch-botao ch-botao--pequeno" data-acao="marcar-data" type="button">${I("crop")} Marcar a data na foto</button></figure>` : ""}
      <div class="ch-confirmar-campos">
        <label class="ch-campo ch-autocompletar"><span class="ch-rotulo">Produto ${p.via ? `<small class="ch-suave">\u00b7 pelo ${CH.esc(p.via)}</small>` : ""}</span>
          <input class="ch-entrada" name="item" value="${CH.esc(g ? g.nome : "")}" placeholder="ex.: molho de tomate" autocomplete="off" ${g ? "" : "autofocus"}>
          <input type="hidden" name="ingrediente_id" value="${CH.esc(p.ingrediente_id || "")}"><div class="ch-sugestoes" role="listbox" hidden></div></label>
        <div class="ch-linha">
          <label class="ch-campo"><span class="ch-rotulo">Quantidade</span><input class="ch-entrada" name="quantidade" inputmode="decimal" value="${p.quantidade != null ? CH.esc(CH.fmt.enxuto(p.quantidade)) : ""}"></label>
          <label class="ch-campo"><span class="ch-rotulo">Unidade</span><select class="ch-entrada" name="unidade">${(g ? CH.dados.unidadesPara(g.id) : ["g", "kg", "ml", "l", "un"]).map((u) => `<option ${u === unidade ? "selected" : ""}>${u}</option>`).join("")}</select></label>
        </div>
        <label class="ch-campo"><span class="ch-rotulo">Validade ${r.validade ? CH.ui.chip(faixa, conf >= 0.8 ? "lida no r\u00f3tulo" : "confira") : ""}</span>
          <input class="ch-entrada ch-entrada--data" name="validade" type="date" value="${r.validade || ""}" ${r.validade ? "" : "autofocus"}>
          ${r.trecho ? `<span class="ch-ajuda">lido: <span class="ch-mono">${CH.esc(r.trecho)}</span>${r.votos > 1 ? ` \u00b7 ${r.votos} leituras concordam` : ""}</span>` : ""}
          ${alternativas.length ? `<span class="ch-ajuda">Ou seria: ${alternativas.map((d) => `<button class="ch-chip ch-chip--acento" type="button" data-acao="usar-data" data-data="${d}">${CH.fmt.data(d)}</button>`).join(" ")}</span>` : ""}
          ${r.fabricacao ? `<span class="ch-ajuda">fabrica\u00e7\u00e3o ${CH.fmt.data(r.fabricacao)}</span>` : ""}${r.pesagem ? `<span class="ch-ajuda">pesado em ${CH.fmt.data(r.pesagem)}: a validade vem da embalagem ou do cat\u00e1logo</span>` : ""}</label>
        <div class="ch-campo"><span class="ch-rotulo">Local</span>${CH.ui.seg("scan-local", [["geladeira", "Geladeira"], ["freezer", "Freezer"], ["despensa", "Despensa"], ["fruteira", "Fruteira"]], p.local || (g && g.armazenamento) || "geladeira", "Local")}
          <input type="hidden" name="local" value="${p.local || (g && g.armazenamento) || "geladeira"}"></div>
        <div class="ch-linha">
          <label class="ch-campo"><span class="ch-rotulo">Pre\u00e7o (R$)</span><input class="ch-entrada" name="preco" inputmode="decimal" value="${p.preco_total != null ? CH.fmt.num(p.preco_total, 2) : ""}"></label>
          <label class="ch-check ch-check--campo"><input type="checkbox" name="aberto"><span>J\u00e1 est\u00e1 aberto</span></label>
        </div>
        <div class="ch-botoes"><button class="ch-botao ch-botao--primario ch-botao--grande">${I("check")} Salvar no estoque</button>
          <button class="ch-botao ch-botao--fantasma" data-acao="scan-cancelar" type="button">Descartar leitura</button></div>
      </div></form>`;
  }
  function nota() {
    const n = S.nota;
    if (!n) return `<div class="ch-botoes"><button class="ch-botao" data-acao="scan-cancelar" type="button">Tentar de novo</button></div>`;
    const itens = n.itens || [];
    return `${itens.length ? `<ul class="ch-lista">${itens.map((it, i) => `<li class="ch-compra"><label class="ch-check"><input type="checkbox" data-nota-item="${i}" ${it.incluir ? "checked" : ""}>
        <span>${CH.esc(it.descricao)} <small class="ch-suave">${it.ingrediente_id ? "\u2192 " + CH.esc(CH.dados.nomeIng(it.ingrediente_id)) : "sem correspond\u00eancia"}</small></span></label>
        <span class="ch-num ch-suave">${CH.fmt.enxuto(it.quantidade)} ${CH.esc(it.unidade || "")} \u00b7 ${CH.fmt.brl(it.valor)}</span></li>`).join("")}</ul>
        <button class="ch-botao ch-botao--primario" data-acao="nota-salvar" type="button">Adicionar ${itens.filter((x) => x.incluir).length} itens ao estoque</button>`
      : `<p class="ch-suave">${CH.tr.capacidades.nfce ? "Sem itens." : "A consulta \u00e0 SEFAZ-SC \u00e9 feita pelo app no servidor (Shiny). Aqui voc\u00ea pode abrir a nota e adicionar os itens \u00e0 m\u00e3o."}</p>
         <div class="ch-botoes"><a class="ch-botao" href="${CH.esc(n.url.startsWith("http") ? n.url : "https://sat.sef.sc.gov.br/nfce/consulta?p=" + n.chave)}" target="_blank" rel="noopener noreferrer">${I("external-link")} Abrir a nota (SEFAZ-SC)</a>
         <button class="ch-botao ch-botao--fantasma" data-acao="novo-lote" type="button">${I("plus")} Adicionar item</button></div>`}
      <p class="ch-suave ch-legenda">Chave <span class="ch-mono">${n.chave.replace(/(\d{4})/g, "$1 ").trim()}</span></p>`;
  }
  function geladeira() {
    const noFrio = CH.loja.lotesAtivos().filter((l) => l.local === "geladeira");
    const cand = S.candidatos.length ? `<h3 class="ch-sobrancelha">Vistos na foto</h3><ul class="ch-lista">${S.candidatos.map((c, i) => `<li class="ch-compra"><label class="ch-check">
        <input type="checkbox" data-cand="${i}" ${c.incluir ? "checked" : ""}><span>${CH.esc(c.nome)} ${c.tipo === "recipiente_com_comida_provavel" ? `<small class="ch-suave">(sobra?)</small>` : ""}</span></label>
        <span class="ch-suave">${c.ingrediente_id ? CH.esc(CH.dados.nomeIng(c.ingrediente_id)) : ""}</span></li>`).join("")}</ul>
        <button class="ch-botao ch-botao--primario" data-acao="cand-salvar" type="button">Adicionar os marcados</button>` : "";
    return `${cand}<h3 class="ch-sobrancelha">No estoque como \u201cgeladeira\u201d</h3>
      ${noFrio.length ? `<ul class="ch-lista">${noFrio.map((l) => `<li class="ch-compra"><span>${CH.esc(l.ing.nome)} <small class="ch-suave">${CH.fmt.qtd(l.quantidade, l.ing.unidade_base, l.ingrediente_id)}</small></span>
        <span class="ch-botoes-mini"><button class="ch-botao ch-botao--pequeno" data-acao="conf-tem" data-id="${l.id}" type="button" aria-label="Ainda tem">${I("check")}</button>
        <button class="ch-botao ch-botao--pequeno ch-botao--fantasma" data-acao="conf-acabou" data-id="${l.id}" type="button" aria-label="Acabou">${I("x")} acabou</button></span></li>`).join("")}</ul>`
        : `<p class="ch-suave">Nada registrado na geladeira.</p>`}`;
  }

  CH.telas.escanear = {
    titulo: "Escanear",
    render() {
      const lumen = CH.ap.framework === "lumen";
      const ajuda = { rotulo: "Fotografe a embalagem com a validade vis\u00edvel. N\u00e3o precisa recortar.", balanca: "Fotografe a etiqueta do a\u00e7ougue, padaria ou hortifr\u00fati.",
        nota: "Fotografe o QR code da nota fiscal (NFC-e) de Santa Catarina.", geladeira: "Fotografe a geladeira aberta para conferir o que ainda tem." }[S.modo];
      const captura = `<div class="ch-captura${S.fase !== "inicio" ? " ch-captura--compacta" : ""}">
          <label class="ch-botao ch-botao--primario ch-botao--grande">${I("camera")} ${S.fase === "inicio" ? "Tirar foto" : "Outra foto"}<input type="file" accept="image/*" capture="environment" data-foto hidden></label>
          <label class="ch-botao ch-botao--fantasma ch-botao--grande">${I("image")} Galeria<input type="file" accept="image/*" data-foto hidden></label></div>`;
      const corpo = S.fase === "inicio" ? `<p class="ch-lede ch-lede--pequena">${ajuda}</p>${captura}
          <p class="ch-nota">${I("shield-check")} A foto \u00e9 lida neste aparelho. GPS, modelo do celular e data da foto n\u00e3o s\u00e3o enviados nem guardados.</p>`
        : `${etapas()}${S.fase === "lendo" ? "" : S.fase === "confirmar" ? confirmar() : S.fase === "nota" ? nota() : geladeira()}${S.fase === "lendo" ? "" : captura}`;
      return `${lumen && S.fase === "inicio" ? `<section class="ch-hero ch-hero--pequeno"><h1 class="ch-display ch-display--m">Escaneie, <span class="ch-grad">confira, pronto.</span></h1></section>`
          : `<header class="ch-tela-topo"><div><p class="ch-sobrancelha">Escanear</p><h1 class="ch-titulo">${({ rotulo: "Validade do r\u00f3tulo", balanca: "Etiqueta de balan\u00e7a", nota: "Nota fiscal (NFC-e SC)", geladeira: "Geladeira" })[S.modo]}</h1></div></header>`}
        ${CH.ui.seg("scan-modo", MODOS, S.modo, "Tipo de foto")}
        <div class="ch-cartao ch-cartao--scan">${corpo}</div>`;
    },
  };

  // ---------- events ----------
  CH.bus.on("change", (e) => {
    if (e.target.hasAttribute && e.target.hasAttribute("data-foto") && e.target.files[0]) aoEscolher(e.target.files[0]);
    if (e.target.dataset && e.target.dataset.notaItem != null) S.nota.itens[+e.target.dataset.notaItem].incluir = e.target.checked;
    if (e.target.dataset && e.target.dataset.cand != null) S.candidatos[+e.target.dataset.cand].incluir = e.target.checked;
  });
  CH.bus.on("seg", ({ nome, valor, el }) => {
    if (nome === "scan-modo") { S = novo(valor); redesenhar(); }
    if (nome === "scan-local") { const f = el.closest("form"); f.local.value = valor; CH.$$("[data-nome='scan-local']", f).forEach((b) => b.setAttribute("aria-checked", b.dataset.valor === valor)); S.produto.local = valor; }
  });
  CH.ui.registrar("scan-cancelar", () => { S = novo(S.modo); redesenhar(); });
  CH.ui.registrar("usar-data", (el) => { const f = el.closest("form"); f.validade.value = el.dataset.data; });
  CH.ui.registrar("conf-tem", (el) => { el.closest("li").classList.add("ch-compra--ok"); });
  CH.ui.registrar("conf-acabou", (el) => {
    const l = CH.loja.lotesAtivos().find((x) => x.id === el.dataset.id);
    if (l) CH.tr.op("lote.baixar", { id: l.id, quantidade: l.quantidade, tipo: "consumo", validade_efetiva: l.validade_efetiva });
  });
  CH.bus.on("submit", (e) => {
    const f = e.target; if (f.dataset.form !== "scan") return;
    let ingId = f.ingrediente_id.value;
    if (!ingId) { const m = CH.dados.casar(f.item.value); if (m[0] && m[0].escore >= 0.6) ingId = m[0].id; }
    if (!ingId) return CH.ui.aviso("Escolha o produto na lista.", "erro");
    const q = CH.parseNum(f.quantidade.value) || 1;
    let base; try { base = CH.dados.paraBase(q, f.unidade.value, ingId); } catch (err) { return CH.ui.aviso(err.message, "erro"); }
    const lote = { id: CH.uuid(), ingrediente_id: ingId, descricao: S.produto.descricao || CH.dados.nomeIng(ingId), quantidade: base, local: f.local.value,
      validade: f.validade.value || null, validade_origem: f.validade.value ? (S.leitura && S.leitura.validade === f.validade.value ? "rotulo" : "usuario") : "estimada",
      data_compra: CH.hoje(), aberto_em: f.aberto.checked ? CH.hoje() : null, preco_total: CH.parseNum(f.preco.value),
      gtin: S.produto.gtin || null, origem: S.modo === "balanca" ? "scan_balanca" : "scan_rotulo" };
    CH.tr.op("lote.salvar", { lote });
    if (S.produto.gtin) CH.tr.op("produto.salvar", { gtin: S.produto.gtin, ingrediente_id: ingId, descricao: lote.descricao, qtd_embalagem: base });
    const marca = maiores().map(ehMarca).find(Boolean);          // learn: next time this label is recognised
    if (marca && (CH.loja.get().aprendidos || {})[marca] !== ingId && !(CH.dados.casar(marca)[0] || {}).id) CH.tr.op("sinonimo.aprender", { termo: marca, ingrediente_id: ingId });
    CH.ui.aviso(`${CH.esc(CH.dados.nomeIng(ingId))} salvo${lote.validade ? `: vale at\u00e9 ${CH.fmt.data(lote.validade)}` : ""}.`, "ok");
    S = novo(S.modo); redesenhar();
  });
  CH.ui.registrar("nota-salvar", () => {
    let n = 0;
    for (const it of S.nota.itens.filter((x) => x.incluir && x.ingrediente_id)) {
      const g = CH.dados.ing(it.ingrediente_id);
      let base = it.quantidade;
      try { base = CH.dados.paraBase(it.quantidade, (it.unidade || "").toLowerCase() === "kg" ? "kg" : g.unidade_base === "un" ? "un" : g.unidade_base, g.id); } catch (e) { /* keep */ }
      if ((it.unidade || "").toUpperCase() === "UN" && g.unidade_base !== "un") base = it.quantidade * (CH.dados.idx.conv[`${g.id}|un`] || 1);
      CH.tr.op("lote.salvar", { lote: { id: CH.uuid(), ingrediente_id: g.id, descricao: it.descricao, quantidade: base, local: g.armazenamento, validade: null,
        validade_origem: "estimada", data_compra: CH.hoje(), preco_total: it.valor, origem: "nfce" } });
      n++;
    }
    CH.ui.aviso(`${n} itens da nota no estoque (validade estimada). Escaneie os r\u00f3tulos dos que importam.`, "ok", 5200);
    S = novo("nota"); redesenhar();
  });
  CH.ui.registrar("cand-salvar", () => {
    for (const c of S.candidatos.filter((x) => x.incluir && x.ingrediente_id)) {
      const g = CH.dados.ing(c.ingrediente_id);
      CH.tr.op("lote.salvar", { lote: { id: CH.uuid(), ingrediente_id: g.id, descricao: c.nome, quantidade: c.quantidade_estimada || (g.unidade_base === "un" ? 1 : 500),
        local: "geladeira", validade: null, validade_origem: "estimada", data_compra: CH.hoje(), origem: "visao" } });
    }
    CH.ui.aviso("Itens adicionados com validade estimada.", "ok"); S = novo("geladeira"); redesenhar();
  });

  // ---------- manual crop (ROI) ----------
  CH.ui.registrar("marcar-data", () => {
    if (!S.foto) return;
    const folha = CH.ui.folha("Marque onde est\u00e1 a validade", `<div class="ch-recorte"><img src="${S.foto.url}" alt="" draggable="false"><div class="ch-recorte-caixa" tabindex="0"></div></div>
      <p class="ch-suave">Arraste sobre a data (ex.: \u201cVal.: 29 06 2027\u201d).</p>
      <button class="ch-botao ch-botao--primario ch-botao--bloco" data-acao="ler-recorte" type="button">Ler esta \u00e1rea</button>`, { largura: "larga" });
    const area = CH.$(".ch-recorte", folha), caixa = CH.$(".ch-recorte-caixa", folha);
    let ini = null, roi = { x: 0.2, y: 0.4, w: 0.6, h: 0.15 };
    const pos = () => Object.assign(caixa.style, { left: roi.x * 100 + "%", top: roi.y * 100 + "%", width: roi.w * 100 + "%", height: roi.h * 100 + "%" });
    pos();
    area.addEventListener("pointerdown", (e) => { const r = area.getBoundingClientRect(); ini = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; area.setPointerCapture(e.pointerId); });
    area.addEventListener("pointermove", (e) => { if (!ini) return; const r = area.getBoundingClientRect(); const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      roi = { x: Math.min(ini.x, x), y: Math.min(ini.y, y), w: Math.max(0.02, Math.abs(x - ini.x)), h: Math.max(0.02, Math.abs(y - ini.y)) }; pos(); });
    area.addEventListener("pointerup", () => { ini = null; });
    CH.ui.registrar("ler-recorte", async () => {
      CH.ui.fecharFolha(); S.fase = "lendo"; redesenhar();
      await lerValidade(S.foto, roi); S.fase = "confirmar"; redesenhar();
    });
  });
})();

/* ---- srcjs/app/80-extras.js ---- */
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
      { grupo: "A\u00e7\u00f5es", t: "Escanear validade", icone: "scan-line", fazer: () => (location.hash = "#/escanear") },
      { grupo: "A\u00e7\u00f5es", t: "Adicionar item ao estoque", icone: "plus", fazer: () => CH.formLote() },
      { grupo: "A\u00e7\u00f5es", t: "Gerar plano da semana", icone: "sparkles", fazer: () => { location.hash = "#/plano"; CH.$("[data-acao='gerar-plano']") && CH.$("[data-acao='gerar-plano']").click(); } },
      { grupo: "A\u00e7\u00f5es", t: `Trocar para ${CH.ap.framework === "lumen" ? "Neue" : "Lumen"}`, icone: "palette", fazer: () => { CH.ap.definir("framework", CH.ap.framework === "lumen" ? "neue" : "lumen"); CH.ui.render(); } },
      { grupo: "A\u00e7\u00f5es", t: "Alternar claro/escuro", icone: "sun-moon", fazer: () => CH.$("[data-acao='tema']").click() },
      { grupo: "A\u00e7\u00f5es", t: "Sincronizar planilha", icone: "refresh-cw", fazer: () => CH.$("[data-acao='sync']") ? CH.$("[data-acao='sync']").click() : CH.sync.agora().then(() => CH.ui.aviso("Sincronizado.", "ok"), (e) => CH.ui.aviso(e.message, "erro")) },
      ...CH.loja.lotesAtivos().map((l) => ({ grupo: "Estoque", t: `${l.ing.nome} \u00b7 ${CH.fmt.validade(l.dias)}`, icone: "package", fazer: () => CH.abrirLote(l.id) })),
    ];
    return C;
  }
  function abrirCmd() {
    const f = CH.ui.folha("Buscar ou agir", `<div class="ch-cmd"><label class="ch-busca">${I("search")}<input class="ch-entrada" id="ch-cmd-q" placeholder="Digite: estoque, plano, molho, tema\u2026" autocomplete="off" autofocus></label>
      <ul class="ch-cmd-lista" id="ch-cmd-lista" role="listbox"></ul><p class="ch-suave ch-legenda"><kbd>\u2191</kbd><kbd>\u2193</kbd> escolher \u00b7 <kbd>Enter</kbd> abrir \u00b7 <kbd>Esc</kbd> fechar \u00b7 <kbd>?</kbd> atalhos</p></div>`, { largura: "cmd" });
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
    else if (e.key === "?") CH.ui.folha("Atalhos", `<dl class="ch-detalhes ch-atalhos">${[["Ctrl K  ou  /", "buscar ou agir"], ["1 \u2026 5", "In\u00edcio, Estoque, Escanear, Plano, Compras"], ["n", "novo item"], ["e", "escanear"], ["t", "claro / escuro"], ["Esc", "fechar"]].map(([k, v]) => `<div><dt><kbd>${k}</kbd></dt><dd>${v}</dd></div>`).join("")}</dl>`);
  });

  // ---------- example (stock from the reference photos + a few everyday items), dates relative to today ----------
  CH.ui.registrar("exemplo", () => {
    const h = CH.hoje(), d = (n) => CH.core.somarDias(h, n);
    const L = [
      ["panceta", 482, "geladeira", "2027-01-19", null, 14.89, "Panceta El Corte temperada", "rotulo", "2065840014899"],
      ["nhoque", 500, "despensa", "2027-06-29", null, 12.9, "Gnocchi di patate La Molisana", "rotulo"],
      ["molho_tomate", 240, "geladeira", "2027-03-31", d(-1), 4.49, "Molho de tomate Heinz (sach\u00ea)", "rotulo"],
      ["leite_uht", 1000, "geladeira", "2027-03-19", d(-2), 5.79, "Leite UHT Piracanjuba", "rotulo"],
      ["ovo", 6, "geladeira", d(9), null, 9.9, "Ovos brancos", "usuario"],
      ["peito_frango", 600, "geladeira", d(1), null, 17.4, "Fil\u00e9 de peito de frango", "rotulo"],
      ["alface", 300, "geladeira", null, null, 3.5, "Alface crespa", "estimada", null, d(-3)],
      ["batata", 1000, "despensa", null, null, 6.9, "Batata", "estimada", null, d(-5)],
      ["queijo_mucarela", 150, "geladeira", d(20), d(-2), 8.2, "Mu\u00e7arela fatiada", "rotulo"],
      ["limao", 420, "geladeira", null, null, 4.2, "Lim\u00e3o-taiti", "estimada", null, d(-4)],
      ["manteiga", 200, "geladeira", d(60), d(-10), 12.9, "Manteiga extra com sal Batavo", "rotulo"],
      ["arroz_branco", 2000, "despensa", d(200), d(-20), 11.9, "Arroz tipo 1", "rotulo"],
      ["feijao_preto", 1000, "despensa", d(240), null, 8.5, "Feij\u00e3o preto", "rotulo"],
      ["tainha", 900, "geladeira", d(1), null, 29.9, "Tainha (peixaria)", "usuario"],
      ["pinhao", 500, "geladeira", null, null, 9.0, "Pinh\u00e3o", "estimada", null, d(-2)],
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
    CH.tr.op("compras.salvar", { item: { id: CH.uuid(), ingrediente_id: "queijo_parmesao", descricao: "Queijo parmes\u00e3o", quantidade: 30, unidade: "g", origem: "plano" } });
    CH.tr.op("compras.salvar", { item: { id: CH.uuid(), ingrediente_id: "cebola", descricao: "Cebola", quantidade: 500, unidade: "g", origem: "manual" } });
    CH.tr.op("compras.salvar", { item: { id: CH.uuid(), ingrediente_id: "pao_frances", descricao: "P\u00e3o franc\u00eas", quantidade: 300, unidade: "g", origem: "manual" } });
    CH.ui.fecharFolha();
    CH.ui.aviso("Exemplo carregado: os itens das fotos de refer\u00eancia e alguns do dia a dia.", "ok");
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

/* ---- srcjs/app/90-boot.js ---- */
// 90-boot.js: detects the host (data-mode: html | quarto | shiny), reads the payload, starts the transport.
(() => {
  async function iniciar() {
    const raiz = document.querySelector(".ch[data-mode]");
    if (!raiz || raiz.dataset.iniciado) return;
    raiz.dataset.iniciado = "1";
    CH.raiz = raiz;
    CH.modo = raiz.dataset.mode || "html";
    CH.instancia = raiz.dataset.instancia || "local";
    const payloadEl = document.getElementById(raiz.dataset.payload || "ch-dados");
    const payload = payloadEl ? JSON.parse(payloadEl.textContent) : {};
    CH.recursos = payload.recursos || {};
    CH.dados.carregar(payload.catalogo || {});
    CH.ap.carregar(payload.aparencia || {});
    CH.tr = CH.modo === "shiny" && globalThis.Shiny ? CH.transporte.shiny() : CH.transporte.local();
    CH.ui.montar(raiz);
    try { await CH.tr.iniciar(); } catch (e) { console.error(e); CH.ui.aviso("Sem conex\u00e3o com o servidor: usando os dados guardados neste aparelho.", "info", 6000); }
    CH.ui.render();
    document.documentElement.classList.add("ch-host");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
  // Shiny: the UI may arrive after DOMContentLoaded (renderUI / reconnects)
  document.addEventListener("shiny:connected", iniciar);
})();
