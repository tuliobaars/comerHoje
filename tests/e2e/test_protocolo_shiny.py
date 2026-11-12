"""Shiny protocol with the REAL R server code (webR) and the REAL front end: outbox, disconnect,
reload ("the phone lost the session") and idempotency. Run from the repository root:
  python3 -m http.server 8766 &   then   python3 tests/e2e/test_protocolo_shiny.py"""
import sys
from playwright.sync_api import sync_playwright
import os
BASE = os.environ.get("COMERHOJE_BANCADA", "http://127.0.0.1:8766") + "/tests/e2e/bancada-shiny/servidor.html"
ok = 0
def confere(cond, msg):
    global ok
    if not cond: print("FALHOU:", msg); sys.exit(1)
    ok += 1; print("ok  ", msg)
# preflight: webR comes from node_modules (npm ci). Without it the page would just wait forever.
import time, urllib.request, urllib.error
RAIZ_HTTP = BASE.split("/tests/")[0]
for recurso in ["/node_modules/webr/dist/webr.mjs", "/tests/e2e/bancada-shiny/stubs-node.js", "/R/app.R", "/inst/extdata/catalogo.json"]:
    try: urllib.request.urlopen(urllib.request.Request(RAIZ_HTTP + recurso, method="HEAD"), timeout=10).close()
    except (urllib.error.URLError, OSError) as e:
        print(f"FALHOU: {recurso} indisponível ({e}).")
        if "node_modules" in recurso: print("        webR não está instalado: rode `npm ci` na raiz do repositório.")
        sys.exit(1)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); erros = []; http_falhas = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("response", lambda r: http_falhas.append(f"{r.status} {r.url}") if r.status >= 400 and "favicon" not in r.url else None)
    pg.goto(BASE)
    limite = time.time() + 240                     # webR boot: ~10-60 s; fail fast on any load error instead
    while True:
        estado = pg.evaluate("() => ({pronto: window.__rPronto === true, erro: window.__rErro})")
        if estado["pronto"]: break
        if estado["erro"] or erros or http_falhas:
            print("FALHOU: a bancada não iniciou o R:", estado["erro"] or "", "; ".join(erros + http_falhas[:5]))
            sys.exit(1)
        if time.time() > limite:
            print("FALHOU: webR não iniciou em 240 s (rede lenta? rode de novo; veja o console da página)"); sys.exit(1)
        pg.wait_for_timeout(500)
    cli = lambda: pg.frame_locator("#cliente")
    fr = lambda: pg.frames[1]
    pg.wait_for_timeout(1500)
    confere(fr().evaluate("() => CH.tr.nome") == "servidor", "cliente em modo Shiny (ShinyTransport)")
    cli().locator("[data-acao='exemplo']").first.click()
    pg.wait_for_function("() => document.getElementById('cliente').contentWindow.CH.tr.status().pendentes === 0", timeout=120000)
    n = int(pg.evaluate("() => servidor.r('length(store$estado()$lotes)')"))
    confere(n == 19, f"exemplo gravado no servidor R: {n} lotes (15 ativos + 4 do histórico)")
    # --- connection drops (iPhone locked / tunnel) ---
    pg.evaluate("() => conectar(false)")
    lote = fr().evaluate("() => CH.loja.lotesAtivos().find(l => l.ingrediente_id === 'peito_frango').id")
    fr().evaluate(f"() => {{ CH.tr.op('lote.abrir', {{ id: '{lote}', data: CH.hoje() }}); CH.tr.op('lote.baixar', {{ id: '{lote}', quantidade: 300, tipo: 'consumo', validade_efetiva: CH.hoje() }}); }}")
    pend = fr().evaluate("() => CH.tr.status().pendentes")
    confere(pend == 2, f"offline: 2 operações na fila do aparelho (pendentes = {pend})")
    q_srv = float(pg.evaluate(f"() => servidor.r('store$lote(\"{lote}\")$quantidade')"))
    confere(q_srv == 600, f"servidor ainda não recebeu (600 g no servidor)")
    # --- the session is lost: reload the client while offline ---
    pg.evaluate("() => document.getElementById('cliente').contentWindow.location.reload()"); pg.wait_for_timeout(2500)
    q_cli = fr().evaluate(f"() => CH.loja.get().lotes.find(l => l.id === '{lote}').quantidade")
    pend2 = fr().evaluate("() => CH.tr.status().pendentes")
    confere(q_cli == 300 and pend2 == 2, f"após recarregar offline: aparelho mostra 300 g e mantém 2 pendentes (localStorage)")
    # --- reconnects: the outbox is drained, the server applies it ---
    pg.evaluate("() => conectar(true)")
    pg.wait_for_function("() => document.getElementById('cliente').contentWindow.CH.tr.status().pendentes === 0", timeout=60000)
    q_srv2 = float(pg.evaluate(f"() => servidor.r('store$lote(\"{lote}\")$quantidade')"))
    aberto = pg.evaluate(f"() => servidor.r('store$lote(\"{lote}\")$aberto_em')")
    confere(q_srv2 == 300 and aberto != "NULL", f"reconectado: servidor com 300 g e aberto_em = {aberto}")
    # --- idempotency: re-sending the same operation does nothing ---
    movs = int(pg.evaluate("() => servidor.r('length(store$estado()$movimentos)')"))
    r = pg.evaluate("""() => servidor.despachar(JSON.stringify({id: 'repetida', tipo: 'op', op: 'compras.salvar', t: new Date().toISOString(), args: {item: {id: 'C-rep', descricao: 'Ostra'}}}))
                        .then(() => servidor.despachar(JSON.stringify({id: 'repetida', tipo: 'op', op: 'compras.salvar', t: new Date().toISOString(), args: {item: {id: 'C-rep', descricao: 'Ostra'}}})))""")
    confere('"aplicada":false' in r, "mesma operação reenviada: aplicada = false (idempotência)")
    movs2 = int(pg.evaluate("() => servidor.r('length(store$estado()$movimentos)')"))
    confere(movs2 == movs, "nenhum movimento duplicado")
    # --- the server state comes back to a fresh client ---
    pg.evaluate("() => { const w = document.getElementById('cliente').contentWindow; w.localStorage.clear(); w.location.reload(); }"); pg.wait_for_timeout(3000)
    n_cli = fr().evaluate("() => CH.loja.lotesAtivos().length")
    confere(n_cli == 15, f"aparelho novo (sem cache) recebe o estoque do servidor: {n_cli} itens ativos")
    confere(not erros, f"sem erros de página ({erros})")
    b.close()
print(f"\n{ok} verificações ok: protocolo Shiny (ShinyTransport <-> ch_despachar em R)")
