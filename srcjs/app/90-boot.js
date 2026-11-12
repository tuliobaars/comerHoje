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
    try { await CH.tr.iniciar(); } catch (e) { console.error(e); CH.ui.aviso("Sem conexão com o servidor: usando os dados guardados neste aparelho.", "info", 6000); }
    CH.ui.render();
    document.documentElement.classList.add("ch-host");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
  // Shiny: the UI may arrive after DOMContentLoaded (renderUI / reconnects)
  document.addEventListener("shiny:connected", iniciar);
})();
