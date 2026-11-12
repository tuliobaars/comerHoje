#!/usr/bin/env python3
"""Feature screenshots (LUM-K-01 / NEU-K-01): made by a script from the BUILT standalone HTML target
(provenance "live"), Lumen and Neue, light and dark, desktop 1440x900 @2x and iPhone 393x852 @2x,
JPEG q90 4:4:4 -> docs/features/*.jpg + docs/features/manifest.json.
  node tools/build.mjs --html-ocr && python3 tools/screens.py
"""
import json, pathlib, sys
from PIL import Image
from playwright.sync_api import sync_playwright

R = pathlib.Path(__file__).resolve().parents[1]
HTML = (R / "dist/comerhoje-com-leitor.html")
if not HTML.exists(): HTML = R / "inst/standalone/comerhoje.html"
URL = HTML.as_uri()
OUT = R / "docs/features"; OUT.mkdir(parents=True, exist_ok=True)
manifest = []

def salvar(png, nome, titulo, legenda, fw, tema, vp):
    im = Image.open(png).convert("RGB")
    im.save(OUT / f"{nome}.jpg", "JPEG", quality=90, subsampling=0, optimize=True)
    pathlib.Path(png).unlink()
    manifest.append({"arquivo": f"{nome}.jpg", "titulo": titulo, "legenda": legenda, "proveniencia": "live",
                     "fonte": str(HTML.relative_to(R)), "framework": fw, "tema": tema, "viewport": vp})

TELAS = [("inicio", "Início", "O que vence antes, uma sugestão que aproveita esses itens e o desperdício do mês."),
         ("estoque", "Estoque", "Cada embalagem com a sua validade; o molho aberto passa para o topo (3 dias após aberto)."),
         ("plano", "Plano da semana", "Primeiro o que vence antes; o que falta vai para a lista de compras."),
         ("compras", "Compras", "Lista por seção do mercado, a mesma da Planilha Google."),
         ("ajustes", "Ajustes", "Lumen ou Neue, tema, leitura no aparelho ou IA na nuvem, planilha.")]

def preparar(pg, fw, tema):
    pg.add_init_script(f"localStorage.setItem('comerhoje:aparencia', JSON.stringify({{framework:'{fw}', tema:'{tema}', ambiente:'on'}}))")
    pg.goto(URL + "#/inicio"); pg.wait_for_timeout(500)
    pg.click("[data-acao='exemplo']"); pg.wait_for_timeout(4500)                 # wait for the toast to leave
    pg.evaluate("() => { location.hash = '#/plano'; }"); pg.wait_for_timeout(400)
    pg.click("[data-acao='gerar-plano']"); pg.wait_for_timeout(4200)
    pg.add_style_tag(content=".ch .ch-ambiente i { animation: none !important; } .ch .ch-entra { animation: none !important; }")   # capture-friendly (LUM-M-03)

with sync_playwright() as p:
    b = p.chromium.launch()
    for fw in ["lumen", "neue"]:
        for tema in ["claro", "escuro"]:
            for vp, (w, h, dpr) in {"desktop": (1440, 900, 2), "iphone": (393, 852, 2)}.items():
                ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=dpr, is_mobile=vp == "iphone", has_touch=vp == "iphone",
                                    locale="pt-BR", timezone_id="America/Sao_Paulo")
                pg = ctx.new_page(); erros = []
                pg.on("pageerror", lambda e: erros.append(str(e)))
                preparar(pg, fw, tema)
                telas = TELAS if (tema == "claro") else TELAS[:2]
                for tid, titulo, legenda in telas:
                    pg.evaluate(f"() => {{ location.hash = '#/{tid}'; }}"); pg.wait_for_timeout(600)
                    png = f"/tmp/{fw}-{tema}-{vp}-{tid}.png"; pg.screenshot(path=png)
                    salvar(png, f"{fw}-{tema}-{vp}-{tid}", f"{titulo} ({fw.capitalize()}, {tema})", legenda, fw, tema, vp)
                if tema == "claro":
                    pg.evaluate("() => { location.hash = '#/estoque'; }"); pg.wait_for_timeout(400)
                    pg.locator("[data-acao='lote']").nth(3).click(); pg.wait_for_timeout(700)
                    png = f"/tmp/{fw}-{vp}-lote.png"; pg.screenshot(path=png)
                    salvar(png, f"{fw}-claro-{vp}-lote", f"Item (folha de ações, {fw.capitalize()})",
                           "Validade do rótulo, aberto em, vale até: e as ações Usei, Abri, Congelar, Descartar.", fw, tema, vp)
                    pg.keyboard.press("Escape")
                    if "com-leitor" in HTML.name:   # real scan: the gnocchi photo, read on the device
                        pg.evaluate("() => { location.hash = '#/escanear'; }"); pg.wait_for_timeout(400)
                        pg.set_input_files("input[data-foto]:not([capture])", str(R / "references/nhoque.jpeg"))
                        pg.wait_for_selector("form[data-form='scan']", timeout=240000); pg.wait_for_timeout(600)
                        pg.evaluate("() => document.querySelector('form[data-form=scan] input[name=validade]').scrollIntoView({block: 'center'})"); pg.wait_for_timeout(300)
                        png = f"/tmp/{fw}-{vp}-scan.png"; pg.screenshot(path=png)
                        salvar(png, f"{fw}-claro-{vp}-escanear", f"Escanear: validade lida no aparelho ({fw.capitalize()})",
                               "Foto real (nhoque.jpeg): “Val.: 29 06 2027” lida sem recorte; produto e quantidade pelo texto do rótulo. (O campo de data é o nativo do aparelho: num iPhone em português aparece dd/mm/aaaa; o Chromium sem interface das capturas mostra mm/dd.)", fw, tema, vp)
                if vp == "desktop" and fw == "neue" and tema == "claro":
                    pg.evaluate("() => { location.hash = '#/inicio'; }"); pg.wait_for_timeout(300)
                    pg.keyboard.press("Control+k"); pg.keyboard.type("molho"); pg.wait_for_timeout(500)
                    png = "/tmp/neue-cmd.png"; pg.screenshot(path=png)
                    salvar(png, "neue-claro-desktop-comandos", "Barra de comandos (Neue, Ctrl K)", "Ir para, agir, achar um item ou pôr na lista de compras sem tirar a mão do teclado.", fw, tema, vp)
                if erros: print("ERROS", fw, tema, vp, erros); sys.exit(1)
                ctx.close()
    b.close()

# side-by-side comparison for the README: Lumen and Neue, light and dark, on the phone
imgs = [Image.open(OUT / f"{fw}-{t}-iphone-inicio.jpg") for fw in ("lumen", "neue") for t in ("claro", "escuro")]
w = 393 * 2; hh = int(imgs[0].height * w / imgs[0].width)
folha = Image.new("RGB", (w * 4 + 60, hh + 40), "white")
for k, im in enumerate(imgs): folha.paste(im.resize((w, hh)), (20 + k * (w + 7), 20))
folha.save(OUT / "comparacao-lumen-neue.jpg", "JPEG", quality=88, subsampling=0)
manifest.append({"arquivo": "comparacao-lumen-neue.jpg", "titulo": "Lumen x Neue no celular", "legenda": "Lumen claro, Lumen escuro, Neue claro, Neue escuro (Início).",
                 "proveniencia": "live", "fonte": str(HTML.relative_to(R)), "framework": "ambos", "tema": "ambos", "viewport": "iphone"})
(OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{len(manifest)} imagens em docs/features/")
