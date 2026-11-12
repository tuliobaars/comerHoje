"""Date reading on the device, through the REAL UI (file input -> scan -> confirm), on the reference photos.
Needs the HTML with the embedded reader: node tools/build.mjs --html-ocr (-> dist/)."""
import json, pathlib, sys, time
from playwright.sync_api import sync_playwright
R = pathlib.Path(__file__).resolve().parents[2]
URL = (R / "dist/comerhoje-com-leitor.html").as_uri()
ESPERADO = {  # photo: (mode, expiry, product or None = not identifiable in this photo, quantity, price)
    "porco.jpeg": ("rotulo", "2027-01-19", None, "", ""), "nhoque.jpeg": ("rotulo", "2027-06-29", "nhoque", "500", ""),
    "leite.jpeg": ("rotulo", "2027-03-19", None, "", ""), "molho_tomate.jpeg": ("rotulo", "2027-03-31", None, "", ""),
    "porco2.jpeg": ("balanca", "", "panceta", "482", "14,89"), "geladeira.jpeg": ("rotulo", "", None, "", "")}
res, falhas = {}, 0
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 393, "height": 852}, is_mobile=True, has_touch=True, locale="pt-BR")
    pg = ctx.new_page(); erros, rede = [], []
    pg.set_default_timeout(180000)   # OCR runs single-threaded WASM on the page thread: a busy machine can delay clicks
    pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("request", lambda r: rede.append(r.url) if r.url.startswith("http") else None)
    pg.goto(URL + "#/escanear"); pg.wait_for_timeout(400)
    for foto, (modo, val, prod, qtd, preco) in ESPERADO.items():
        pg.click(f"[data-nome='scan-modo'][data-valor='{modo}']"); pg.wait_for_timeout(150)
        t0 = time.time(); pg.set_input_files("input[data-foto]:not([capture])", str(R / "references" / foto))
        pg.wait_for_selector("form[data-form='scan']", timeout=300000)
        v = pg.eval_on_selector("form[data-form='scan']", "f => ({validade: f.validade.value, ing: f.ingrediente_id.value, qtd: f.quantidade.value, preco: f.preco.value})")
        ok = v["validade"] == val and (prod is None or v["ing"] == prod) and (not qtd or v["qtd"] == qtd) and (not preco or v["preco"] == preco)
        falhas += not ok
        res[foto] = {**v, "s": round(time.time() - t0, 1), "ok": ok}
        print(f"{'ok ' if ok else 'XX '} {foto:18s} validade={v['validade'] or '(pergunta)':10s} produto={v['ing'] or '—':8s} qtd={v['qtd'] or '—':4s} preço={v['preco'] or '—':6s} {res[foto]['s']:5.1f} s")
        pg.click("[data-acao='scan-cancelar']"); pg.wait_for_timeout(150)
    # learning: confirm the panceta once, and the second scan recognises it by the label
    pg.click("[data-nome='scan-modo'][data-valor='rotulo']")
    pg.set_input_files("input[data-foto]:not([capture])", str(R / "references/porco.jpeg")); pg.wait_for_selector("form[data-form='scan']", timeout=300000)
    pg.fill("form[data-form='scan'] input[name='item']", "panceta"); pg.wait_for_timeout(200)
    pg.click("[data-acao='escolher-ing'][data-id='panceta']"); pg.fill("form[data-form='scan'] input[name='quantidade']", "500")
    pg.click("form[data-form='scan'] button.ch-botao--primario"); pg.wait_for_timeout(400)
    pg.set_input_files("input[data-foto]:not([capture])", str(R / "references/porco.jpeg")); pg.wait_for_selector("form[data-form='scan']", timeout=300000)
    aprendeu = pg.eval_on_selector("form[data-form='scan']", "f => f.ingrediente_id.value") == "panceta"
    falhas += not aprendeu
    print(f"{'ok ' if aprendeu else 'XX '} aprendizado: 2ª foto da panceta reconhecida pelo rótulo")
    salvo = pg.evaluate("() => CH.loja.lotesAtivos().map(l => [l.ingrediente_id, l.quantidade, l.validade, l.validade_origem])")
    falhas += salvo != [["panceta", 500, "2027-01-19", "rotulo"]]
    print(f"{'ok ' if salvo == [['panceta', 500, '2027-01-19', 'rotulo']] else 'XX '} lote salvo com validade do rótulo: {salvo}")
    print(f"erros de página: {erros} · requisições de rede: {rede}")
    falhas += bool(erros) + bool(rede)
    b.close()
(R / "docs/verification").mkdir(parents=True, exist_ok=True)
(R / "docs/verification/leitura.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
sys.exit(1 if falhas else 0)
