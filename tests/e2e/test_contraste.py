"""WCAG contrast of the tokens AS RENDERED (computed styles), Lumen and Neue, light and dark.
Translucent surfaces (Lumen glass, chip tints) are composited over what is underneath, as the browser paints them.
Rules: text 1/2 and button labels >= 4.5:1 (LUM-V-03/V-04, NEU-A-01/A-02)."""
import json, pathlib, re, sys
from playwright.sync_api import sync_playwright
R = pathlib.Path(__file__).resolve().parents[2]
def rgba(s):
    m = re.match(r"rgba?\(([^)]+)\)", s.strip())
    if m: v = [float(x) for x in m.group(1).replace("/", ",").split(",")]; return (v + [1])[:4]
    s = s.strip().lstrip("#"); s = "".join(c * 2 for c in s) if len(s) == 3 else s
    return [int(s[i:i + 2], 16) for i in (0, 2, 4)] + [1]
def sobre(c, fundo):  # alpha compositing
    a = c[3]; return [c[i] * a + fundo[i] * (1 - a) for i in range(3)] + [1]
def lum(c):
    v = [x / 255 for x in c[:3]]; v = [x / 12.92 if x <= .03928 else ((x + .055) / 1.055) ** 2.4 for x in v]
    return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]
def razao(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + .05) / (lb + .05)
VARS = ["bg", "bg-2", "card", "card-solid", "texto", "texto-2", "acento", "acento-texto", "acento-tinta",
        "bom-tinta", "bom-bg", "aviso-tinta", "aviso-bg", "ruim-tinta", "ruim-bg", "aviso-caixa-bg", "aviso-caixa-texto"]
res, pior = [], 99
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    for fw in ["lumen", "neue"]:
        for tema in ["claro", "escuro"]:
            pg.add_init_script(f"localStorage.setItem('comerhoje:aparencia', JSON.stringify({{framework:'{fw}', tema:'{tema}'}}))")
            pg.goto((R / "inst/standalone/comerhoje.html").as_uri()); pg.wait_for_timeout(300)
            pg.evaluate(f"() => CH.ap.definir('framework', '{fw}') || CH.ap.definir('tema', '{tema}')")
            v = pg.evaluate("(vs) => { const s = getComputedStyle(document.querySelector('.ch')); return Object.fromEntries(vs.map(k => [k, s.getPropertyValue('--ch-' + k).trim()])); }", VARS)
            c = {k: rgba(x) for k, x in v.items()}
            bg = c["bg"]; card = sobre(c["card"], bg); solido = sobre(c["card-solid"], bg)
            pares = [("texto sobre fundo", c["texto"], bg), ("texto sobre cartão", c["texto"], card),
                     ("texto 2 sobre fundo", c["texto-2"], bg), ("texto 2 sobre cartão", c["texto-2"], card), ("texto 2 sobre superfície sólida", c["texto-2"], solido),
                     ("rótulo do botão primário", c["acento-texto"], c["acento"]), ("link / acento sobre cartão", c["acento-tinta"], card),
                     ("chip ok", c["bom-tinta"], sobre(c["bom-bg"], card)), ("chip urgente", c["aviso-tinta"], sobre(c["aviso-bg"], card)),
                     ("chip vencido", c["ruim-tinta"], sobre(c["ruim-bg"], card)), ("chip esta semana", c["texto"], sobre(c["bg-2"], card)),
                     ("aviso (toast)", c["aviso-caixa-texto"], sobre(c["aviso-caixa-bg"], bg))]
            for nome, a, fundo in pares:
                r = round(razao(a, fundo), 2); pior = min(pior, r)
                res.append({"framework": fw, "tema": tema, "par": nome, "razao": r, "ok": r >= 4.5})
    b.close()
falhas = [x for x in res if not x["ok"]]
for x in res: print(f"{'ok ' if x['ok'] else 'XX '} {x['framework']:5s} {x['tema']:6s} {x['par']:32s} {x['razao']:5.2f}:1")
(R / "docs/verification").mkdir(parents=True, exist_ok=True)
(R / "docs/verification/contraste.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"\n{len(res) - len(falhas)}/{len(res)} pares >= 4,5:1 (menor: {pior}:1)")
sys.exit(1 if falhas else 0)
