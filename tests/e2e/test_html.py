"""HTML and Quarto targets in Chromium: Lumen and Neue, light and dark, iPhone and desktop.
No page errors, no network requests, navigation right for the size, no horizontal overflow on any
screen, and the Quarto host (page assembled with the two include files, as Quarto does) in in-flow mode."""
import pathlib, sys, tempfile
from playwright.sync_api import sync_playwright
R = pathlib.Path(__file__).resolve().parents[2]
HTML = (R / "inst/standalone/comerhoje.html").as_uri()
TELAS = ["inicio", "estoque", "escanear", "plano", "compras", "ajustes"]
ok = 0
def confere(c, msg):
    global ok
    if not c: print("FALHOU:", msg); sys.exit(1)
    ok += 1
with sync_playwright() as p:
    b = p.chromium.launch()
    for fw in ["lumen", "neue"]:
        for tema in ["claro", "escuro"]:
            for vp, (w, h) in {"iphone": (393, 852), "iphone-se": (375, 667), "desktop": (1440, 900)}.items():
                ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=vp != "desktop", has_touch=vp != "desktop", locale="pt-BR", timezone_id="America/Sao_Paulo")
                pg = ctx.new_page(); erros, rede = [], []
                pg.on("pageerror", lambda e: erros.append(str(e)))
                pg.on("request", lambda r: rede.append(r.url) if r.url.startswith("http") else None)
                pg.add_init_script(f"localStorage.setItem('comerhoje:aparencia', JSON.stringify({{framework:'{fw}', tema:'{tema}'}}))")
                pg.goto(HTML + "#/inicio"); pg.wait_for_timeout(300)
                confere(pg.evaluate("document.querySelector('.ch').dataset.framework") == fw, f"{fw}/{tema}/{vp}: framework aplicado antes da pintura")
                pg.click("[data-acao='exemplo']"); pg.wait_for_timeout(300)
                for t in TELAS:
                    pg.evaluate(f"() => {{ location.hash = '#/{t}'; }}"); pg.wait_for_timeout(250)
                    confere(len(pg.inner_text("#ch-principal")) > 40, f"{fw}/{tema}/{vp}: tela {t} renderizada")
                    larg = pg.evaluate("() => document.scrollingElement.scrollWidth")
                    confere(larg <= w + 1, f"{fw}/{tema}/{vp}: tela {t} sem rolagem horizontal ({larg} > {w})")
                abas = pg.evaluate("() => getComputedStyle(document.querySelector('.ch-abas-baixo')).display")
                nav = pg.evaluate("() => getComputedStyle(document.querySelector('.ch-nav')).display")
                confere((abas == "none") == (vp == "desktop") and (nav == "none") == (vp != "desktop"), f"{fw}/{tema}/{vp}: navegação certa (abas={abas}, nav={nav})")
                confere(not erros, f"{fw}/{tema}/{vp}: sem erros de página {erros}")
                confere(not rede, f"{fw}/{tema}/{vp}: sem requisições de rede {rede[:2]}")
                ctx.close()
    # ---- NFC-e SC: QR photo (synthetic) in "Nota SC" mode, no server: identifies the receipt and offers SEFAZ-SC ----
    ctx = b.new_context(viewport={"width": 393, "height": 852}, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); pg.goto(HTML + "#/escanear"); pg.wait_for_timeout(300)
    pg.click("[data-nome='scan-modo'][data-valor='nota']")
    pg.set_input_files("input[data-foto]:not([capture])", str(R / "tests/fixtures/fotos/qr_nfce_sc_sintetico.jpg")); pg.wait_for_timeout(3000)
    txt = pg.inner_text("#ch-principal")
    confere("Santa Catarina" in txt and "12345" in txt, "NFC-e: QR lido no aparelho, nota de Santa Catarina nº 12345")
    confere(pg.locator("a[href^='https://sat.sef.sc.gov.br/nfce/consulta']").count() == 1, "NFC-e: link para a consulta da SEFAZ-SC")
    ctx.close()
    # ---- Quarto host: the same page Quarto assembles (header include + prose + body include) ----
    cabeca = (R / "inst/quarto/_comerhoje-head.html").read_text(encoding="utf-8"); corpo = (R / "inst/quarto/_comerhoje-body.html").read_text(encoding="utf-8")
    q = pathlib.Path(tempfile.mkdtemp()) / "quarto.html"
    q.write_text(f"<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'>{cabeca}</head><body><main class='content'><h1>Relatório da cozinha</h1>"
                 f"<p>Texto do autor antes do app.</p></main>{corpo}</body></html>", encoding="utf-8")
    ctx = b.new_context(viewport={"width": 393, "height": 852}, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(q.as_uri()); pg.wait_for_timeout(400)
    confere(pg.evaluate("document.querySelector('.ch').dataset.mode") == "quarto", "Quarto: modo quarto")
    confere(pg.evaluate("getComputedStyle(document.querySelector('.ch-abas-baixo')).display") == "none", "Quarto: sem barra fixa (não cobre o texto do autor)")
    confere(pg.evaluate("getComputedStyle(document.querySelector('.ch-nav')).display") != "none", "Quarto: navegação dentro do fluxo")
    confere(not erros, f"Quarto: sem erros {erros}")
    b.close()
print(f"{ok} verificações ok (HTML: 2 estilos x 2 temas x 3 tamanhos x 6 telas; Quarto)")
