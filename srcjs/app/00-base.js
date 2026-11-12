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
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const DIAS_LONGOS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
CH.fmt = {
  num(x, dig = 0) {
    if (x == null || isNaN(x)) return "—";
    const [i, d] = Math.abs(x).toFixed(dig).split(".");
    return (x < 0 ? "−" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (d ? "," + d : "");
  },
  enxuto(x) {   // 480 -> "480" · 1.5 -> "1,5" · 0.25 -> "0,25" · 12.34 -> "12,3"
    const dig = Math.abs(x - Math.round(x)) < 1e-9 ? 0 : Math.abs(x) < 1 ? 3 : Math.abs(x) < 10 ? 2 : 1;
    let s = CH.fmt.num(x, dig);
    if (s.includes(",")) s = s.replace(/0+$/, "").replace(/,$/, "");
    return s;
  },
  brl(x) { return x == null ? "—" : "R$ " + CH.fmt.num(x, 2); },
  data(iso, curta = false) { if (!iso) return "—"; const [a, m, d] = iso.slice(0, 10).split("-"); return curta ? `${d}/${m}` : `${d}/${m}/${a}`; },
  diaSemana(iso, longo = false) { const d = CH.core.parseISO(iso); return (longo ? DIAS_LONGOS : DIAS_CURTOS)[d.getUTCDay()]; },
  extenso(iso) { const d = CH.core.parseISO(iso); return `${DIAS_CURTOS[d.getUTCDay()]}, ${d.getUTCDate()} ${MESES[d.getUTCMonth()].slice(0, 3)}`; },
  mes(iso) { return MESES[+iso.slice(5, 7) - 1]; },
  hora(isoDt) { return isoDt ? new Date(isoDt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: CH.fuso }) : "—"; },
  qtd(q, base, ing) {
    if (q == null) return "—";
    if (base === "g") return q >= 1000 ? CH.fmt.enxuto(q / 1000) + " kg" : CH.fmt.enxuto(q) + " g";
    if (base === "ml") return q >= 1000 ? CH.fmt.enxuto(q / 1000) + " L" : CH.fmt.enxuto(q) + " mL";
    if (ing === "ovo" && q >= 12 && q % 12 === 0) return CH.fmt.enxuto(q / 12) + (q === 12 ? " dúzia" : " dúzias");
    return CH.fmt.enxuto(q) + " un";
  },
  validade(dias) {
    if (dias == null) return "sem data";
    if (dias < -1) return `venceu há ${-dias} dias`;
    if (dias === -1) return "venceu ontem";
    if (dias === 0) return "vence hoje";
    if (dias === 1) return "vence amanhã";
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
