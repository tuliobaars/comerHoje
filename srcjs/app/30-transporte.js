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
      async consulta(nome) { throw new Error(`“${nome}” precisa do app no servidor (Shiny)`); },
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
      if (!enviar(msg)) { clearTimeout(esperando.get(msg.id).timer); esperando.delete(msg.id); falha(new Error("sem conexão com o servidor")); }
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
