#!/usr/bin/env python3
"""Verify docs/ARCHITECTURE.md: extract the normative artifacts and test them.

Usage:  python3 docs/verification/verify_spec.py [--screens]

Requires: python3 (stdlib), node, sqlite3 (stdlib module). Optional: pandoc, make,
playwright+chromium (for --screens). Does not need R or Quarto and doesn't touch the network.
Exit code 0 = all mandatory checks passed.
"""
import json, re, shutil, sqlite3, subprocess, sys, tempfile, unicodedata, pathlib

RAIZ = pathlib.Path(__file__).resolve().parents[2]
DOC = RAIZ / "docs" / "ARCHITECTURE.md"
txt = DOC.read_text(encoding="utf-8")
resultados = []          # (id, ok, detalhe)


def check(nome, ok, detalhe=""):
    resultados.append((nome, bool(ok), detalhe))
    print(("PASS " if ok else "FAIL ") + nome + (f" — {detalhe}" if detalhe else ""))


# ------------------------------------------------------------------ 1. extraction
def extrair(texto):
    """Blocks preceded by <!-- extract: path --> (supports ``` and ```` fences)."""
    out = {}
    for m in re.finditer(r"<!-- extract: (\S+) -->\n(`{3,})[^\n]*\n", texto):
        caminho, cerca = m.group(1), m.group(2)
        ini = m.end()
        fim = texto.index("\n" + cerca + "\n", ini - 1)
        out[caminho] = texto[ini:fim + 1]
    return out

art = extrair(txt)
tmp = pathlib.Path(tempfile.mkdtemp(prefix="comerhoje_verif_"))
for caminho, corpo in art.items():
    p = tmp / caminho
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(corpo, encoding="utf-8")
check("extract.artifacts", len(art) >= 15, f"{len(art)} files → {tmp}")
check("doc.no_unresolved_placeholders", not re.search(r"\{\{[A-Z_]+", txt))

# ------------------------------------------------------------------ 2. TOC / anchors
def slug(h):  # GitHub-style
    h = h.strip().lower()
    h = re.sub(r"[^\w\- ]", "", h)
    return h.replace(" ", "-")

titulos = [m.group(2) for m in re.finditer(r"^(#{1,6}) (.+)$", txt, re.M)]
slugs = {slug(t) for t in titulos}
links = re.findall(r"\]\(#([^)]+)\)", txt)
quebrados = [l for l in links if l not in slugs]
check("doc.internal_links", not quebrados, f"{len(links)} links, broken: {quebrados}")

# ------------------------------------------------------------------ 3. markdown tables → catalog
def tabelas_com_cabecalho(prefixo):
    linhas = txt.splitlines(); out = []
    for i, l in enumerate(linhas):
        if l.startswith(prefixo) and i + 1 < len(linhas) and linhas[i + 1].startswith("|---"):
            cab = [c.strip() for c in l.strip("|").split("|")]
            j = i + 2
            while j < len(linhas) and linhas[j].startswith("|"):
                out.append(dict(zip(cab, [c.strip() for c in linhas[j].strip().strip("|").split("|")])))
                j += 1
    return out

cats = tabelas_com_cabecalho("| id | nome | secao_mercado | ordem |")
unis = tabelas_com_cabecalho("| codigo | singular | plural | abrev | tipo | fator_base |")
ings = tabelas_com_cabecalho("| id | nome | categoria | base | arm. | val. | aberto | bás. | sinônimos |")
convs = tabelas_com_cabecalho("| ingrediente | unidade | qtd_base | observação |")
recs = tabelas_com_cabecalho("| id | nome | tipo | porções | ingredientes |")
check("catalog.parsed", cats and unis and ings and convs and recs,
      f"{len(cats)} categorias, {len(unis)} unidades, {len(ings)} ingredientes, "
      f"{len(convs)} conversões, {len(recs)} receitas")

def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip()

db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")
try:
    db.executescript((tmp / "data/schema.sql").read_text())
    check("sql.schema_applies", True, "data/schema.sql")
except Exception as e:  # noqa
    check("sql.schema_applies", False, str(e))

erros = []
def ins(sql, vals):
    try:
        db.execute(sql, vals)
    except Exception as e:  # noqa
        erros.append(f"{vals[0]}: {e}")

for c in cats:
    ins("INSERT INTO categorias VALUES (?,?,?,?)", (c["id"], c["nome"], c["secao_mercado"], int(c["ordem"])))
for u in unis:
    ins("INSERT INTO unidades VALUES (?,?,?,?,?,?)", (u["codigo"], u["singular"], u["plural"], u["abrev"],
        u["tipo"], float(u["fator_base"]) if u["fator_base"] else None))
sin_dono = {}
colisoes = []
for g in ings:
    ins("INSERT INTO ingredientes (id,nome,categoria_id,unidade_base,armazenamento,validade_padrao_dias,"
        "aberto_dias,basico) VALUES (?,?,?,?,?,?,?,?)",
        (g["id"], g["nome"], g["categoria"], g["base"], g["arm."], int(g["val."]),
         None if g["aberto"] in ("—", "") else int(g["aberto"]), int(g["bás."])))
    termos = [g["nome"]] + [s.strip() for s in g["sinônimos"].split(";") if s.strip()]
    for t in termos:
        n = norm(t)
        if n in sin_dono and sin_dono[n] != g["id"]:
            colisoes.append(f"'{t}' → {sin_dono[n]} & {g['id']}")
            continue
        if n not in sin_dono:
            sin_dono[n] = g["id"]
            ins("INSERT INTO ingrediente_sinonimos (sinonimo_norm, sinonimo, ingrediente_id) VALUES (?,?,?)",
                (n, t, g["id"]))
for c in convs:
    ins("INSERT INTO conversoes (ingrediente_id, unidade, qtd_base) VALUES (?,?,?)",
        (c["ingrediente"], c["unidade"], float(c["qtd_base"])))
linhas_receita = []
for r in recs:
    ins("INSERT INTO receitas (id,nome,tipo,porcoes) VALUES (?,?,?,?)", (r["id"], r["nome"], r["tipo"], int(r["porções"])))
    for parte in [p.strip() for p in r["ingredientes"].split(";")]:
        m = re.fullmatch(r"([a-z0-9_]+)(\?)? ([0-9.]+) ([a-z_]+)", parte)
        if not m:
            erros.append(f"receita {r['id']}: linha inválida '{parte}'"); continue
        linhas_receita.append((r["id"], m.group(1), float(m.group(3)), m.group(4), 1 if m.group(2) else 0))
        ins("INSERT INTO receita_ingredientes VALUES (?,?,?,?,?)",
            (r["id"], m.group(1), float(m.group(3)), m.group(4), 1 if m.group(2) else 0))
fk = db.execute("PRAGMA foreign_key_check").fetchall()
check("catalog.loads_into_schema", not erros and not fk, f"{len(erros)} insert errors {erros[:5]}, FK violations: {fk[:5]}")
check("catalog.synonyms_unique", not colisoes, f"{len(sin_dono)} normalized terms; collisions: {colisoes[:5]}")
ids = [g["id"] for g in ings]
check("catalog.ids_unique_ascii", len(ids) == len(set(ids)) and all(re.fullmatch(r"[a-z][a-z0-9_]*", i) for i in ids),
      f"{len(ids)} ids")
por_cat = {}
for g in ings:
    por_cat[g["categoria"]] = por_cat.get(g["categoria"], 0) + 1
check("catalog.every_category_used", set(por_cat) == {c["id"] for c in cats}, json.dumps(por_cat, ensure_ascii=False))
basicos = [g["id"] for g in ings if g["bás."] == "1"]
estrang = sum(1 for g in ings for s in g["sinônimos"].split(";")
              if re.search(r"\b(sauce|chilli|chili|seasoning|gnocchi|patate|milk|butter|eggs|rice|garlic|breast|basil|olive oil|spaghetti|fusilli|pancetta|parmigiano|mozzarella|avocado|worcestershire|hot sauce|cream cracker)\b", s))
check("catalog.foreign_label_synonyms", estrang >= 10, f"{estrang} EN/IT label synonyms; básicos: {', '.join(basicos)}")

# v_estoque effective-expiry scenario (from the golden planner fixture)
P = json.loads((tmp / "tests/fixtures/golden_planner.json").read_text())
agora = "2026-11-11T12:00:00-03:00"
for l in P["lotes"]:
    db.execute("INSERT INTO lotes (id, ingrediente_id, quantidade, local, validade, validade_origem, aberto_em, "
               "origem, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?)",
               (l["id"], l["ingrediente"], l["qtd"], "geladeira", l["validade"], "rotulo", l.get("aberto_em"),
                "manual", agora, agora))
db.execute("INSERT INTO lotes (id, ingrediente_id, quantidade, local, data_compra, validade_origem, origem, "
           "criado_em, atualizado_em) VALUES ('L8','alface',300,'geladeira','2026-11-10','estimada','manual',?,?)",
           (agora, agora))
ve = dict(db.execute("SELECT id, validade_efetiva FROM v_estoque").fetchall())
esperado = {"L3": "2026-11-13", "L1": "2027-01-19", "L8": "2026-11-15"}
check("sql.v_estoque_effective_expiry", all(ve.get(k) == v for k, v in esperado.items()),
      f"L3 molho aberto → {ve.get('L3')}, L1 panceta → {ve.get('L1')}, L8 alface sem data (compra+5) → {ve.get('L8')}")
try:
    db.execute("INSERT INTO movimentos (lote_id, tipo, quantidade, criado_em) VALUES ('L1','descarte',-10,?)", (agora,))
    check("sql.discard_requires_reason", False, "insert without motivo was accepted")
except sqlite3.IntegrityError:
    check("sql.discard_requires_reason", True, "CHECK rejects descarte sem motivo")

# ------------------------------------------------------------------ 4. JS: syntax, golden tests, recipe conversion
node = shutil.which("node")
if not node:
    check("js.node_available", False, "node not found")
else:
    for f in ["www/js/comerhoje-core.js", "www/js/captura.js", "tests/js/run_golden.js", "docs/apps_script_onEdit.gs"]:
        src = tmp / f
        alvo = src if src.suffix == ".js" else src.with_suffix(".gs.js")
        if alvo != src:
            shutil.copy(src, alvo)
        r = subprocess.run([node, "--check", str(alvo)], capture_output=True, text=True)
        check(f"js.syntax:{f}", r.returncode == 0, r.stderr.strip()[:200])
    r = subprocess.run([node, str(tmp / "tests/js/run_golden.js")], capture_output=True, text=True)
    check("js.golden_fixtures", r.returncode == 0, (r.stdout + r.stderr).strip().splitlines()[-1])
    payload = {
        "unidades": {u["codigo"]: {"tipo": u["tipo"], "fator": float(u["fator_base"]) if u["fator_base"] else None} for u in unis},
        "conversoes": {f'{c["ingrediente"]}|{c["unidade"]}': float(c["qtd_base"]) for c in convs},
        "ingredientes": {g["id"]: {"id": g["id"], "unidade_base": g["base"]} for g in ings},
        "linhas": linhas_receita,
    }
    (tmp / "conv.json").write_text(json.dumps(payload))
    script = """
const c = require(process.argv[2] + '/www/js/comerhoje-core.js');
const P = require(process.argv[2] + '/conv.json'); const falhas = [];
for (const [r, ing, q, un] of P.linhas) {
  try { const v = c.converterParaBase(q, un, P.ingredientes[ing], P.unidades, P.conversoes);
        if (!(v >= 0)) falhas.push(`${r}/${ing}: ${v}`); }
  catch (e) { falhas.push(`${r}/${ing}: ${e.message}`); }
}
console.log(JSON.stringify({n: P.linhas.length, falhas}));
"""
    (tmp / "conv_check.js").write_text(script)
    r = subprocess.run([node, str(tmp / "conv_check.js"), str(tmp)], capture_output=True, text=True)
    res = json.loads(r.stdout or '{"n":0,"falhas":["no output"]}')
    check("catalog.recipe_lines_convertible", not res["falhas"], f"{res['n']} lines; failures: {res['falhas'][:5]}")

# ------------------------------------------------------------------ 5. wireframes
blocos_texto = re.findall(r"```text\n(.*?)\n```", txt, re.S)
wfs = [b for b in blocos_texto if b.startswith(("╭", "┌"))]
tortos = []
for b in wfs:
    larguras = {len(l) for l in b.splitlines()}
    if len(larguras) != 1:
        tortos.append(b.splitlines()[1][:40])
moveis = sum(1 for b in wfs if len(b.splitlines()[0]) == 40)
check("wireframes.frames_aligned", wfs and not tortos,
      f"{len(wfs)} wireframes ({moveis} iPhone @40 cols, {len(wfs) - moveis} desktop/doc); misaligned: {tortos}")
proibidos = [ch for b in wfs for ch in b if unicodedata.east_asian_width(ch) in ("W", "F")]
check("wireframes.no_wide_glyphs", not proibidos, f"wide glyphs: {set(proibidos)}")

# ------------------------------------------------------------------ 6. R blocks (static only: no R here)
def balanco_r(src):
    pilha, pares = [], {")": "(", "]": "[", "}": "{"}
    i, n = 0, len(src)
    while i < n:
        ch = src[i]
        if ch == "#":
            i = src.find("\n", i); i = n if i < 0 else i; continue
        if ch in "\"'`":
            j = i + 1
            while j < n and src[j] != ch:
                j += 2 if src[j] == "\\" else 1
            i = j + 1; continue
        if ch in "([{":
            pilha.append(ch)
        elif ch in ")]}":
            if not pilha or pilha.pop() != pares[ch]:
                return False
        i += 1
    return not pilha

rs = {k: v for k, v in art.items() if k.endswith(".R")}
mal = [k for k, v in rs.items() if not balanco_r(v)]
check("r.brackets_and_quotes_balanced", not mal, f"{len(rs)} R files (not executed — no R in sandbox); bad: {mal}")
qmds = {k: v for k, v in art.items() if k.endswith(".qmd")}
qok = all(v.startswith("---\n") and "\n---\n" in v[4:] and "```{r}" in v for v in qmds.values())
check("quarto.front_matter_present", qok and len(qmds) == 2,
      f"{list(qmds)}; server: shiny in interactive = {'server: shiny' in qmds.get('comerHoje.qmd', '')}; "
      f"embed-resources in offline = {'embed-resources: true' in qmds.get('comerHoje-offline.qmd', '')}")

# ------------------------------------------------------------------ 7. other artifacts
for k, v in art.items():
    if k.endswith(".json"):
        try:
            json.loads(v); ok = True; det = ""
        except Exception as e:  # noqa
            ok, det = False, str(e)
        check(f"json.parses:{k}", ok, det)
if shutil.which("make"):
    r = subprocess.run(["make", "-n", "-f", str(tmp / "Makefile"), "offline"], capture_output=True, text=True, cwd=tmp)
    check("makefile.dry_run", r.returncode == 0, (r.stderr or "ok").strip()[:160])
mer = re.findall(r"```mermaid\n(.*?)\n```", txt, re.S)
tipos = ("flowchart", "sequenceDiagram", "erDiagram", "graph", "classDiagram", "stateDiagram")
check("mermaid.block_types", mer and all(b.lstrip().startswith(tipos) for b in mer), f"{len(mer)} diagrams (syntax not rendered)")

# contrast of the CSS tokens (light + dark)
css = (tmp / "www/comerhoje.css").read_text()
def tokens(bloco):
    return dict(re.findall(r"--(ch-[\w-]+):\s*(#[0-9a-fA-F]{6})", bloco))
claro = tokens(css[css.index(":root {"):css.index("}", css.index(":root {"))])
escuro = {**claro, **tokens(css[css.index("prefers-color-scheme: dark"):css.index("}\n}", css.index("prefers-color-scheme: dark"))])}
def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def contraste(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + 0.05) / (lb + 0.05)
pares = [("ch-texto", "ch-fundo"), ("ch-texto", "ch-superficie"), ("ch-texto-2", "ch-superficie"),
         ("ch-texto-2", "ch-fundo"), ("ch-vencido", "ch-vencido-bg"), ("ch-urgente", "ch-urgente-bg"),
         ("ch-atencao", "ch-atencao-bg"), ("ch-ok", "ch-ok-bg"), ("ch-verde", "ch-superficie"),
         ("ch-sobre-verde", "ch-verde")]
piores = []
for modo, t in (("claro", claro), ("escuro", escuro)):
    for a, b in pares:
        piores.append((round(contraste(t[a], t[b]), 2), modo, a, b))
piores.sort()
check("css.wcag_aa_contrast", piores[0][0] >= 4.5, f"{len(piores)} pairs; lowest {piores[0]}")

# pandoc render
if shutil.which("pandoc"):
    r = subprocess.run(["pandoc", "-f", "gfm", "-t", "html", "--mathjax", str(DOC), "-o", str(tmp / "doc.html")],
                       capture_output=True, text=True)
    check("pandoc.gfm_render", r.returncode == 0 and not r.stderr.strip(), r.stderr.strip()[:200])

# ------------------------------------------------------------------ 8. optional: rendered CSS + JS core in Chromium
if "--screens" in sys.argv:
    try:
        from playwright.sync_api import sync_playwright
        core_js = (tmp / "www/js/comerhoje-core.js").read_text()
        fx = (tmp / "tests/fixtures/golden_planner.json").read_text()
        nomes = {g["id"]: g["nome"] for g in ings}
        html = f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>{css}</style><script>{core_js}</script></head><body>
<header class="ch-topo"><h1>comerHoje</h1><span class="ch-data-hoje">qua, 11 nov</span></header>
<main class="ch-conteudo"><div class="ch-grade">
 <section class="ch-cartao"><h2>Use primeiro</h2><div id="urg"></div></section>
 <section class="ch-cartao"><h2>Sugestão para o jantar</h2><div id="sug"></div>
   <p><button class="ch-botao ch-botao--primario">Vou fazer</button> <button class="ch-botao">Outra ideia</button></p></section>
 <section class="ch-cartao"><h2>Novembro</h2><p>Evitado <b>R$ 42,10</b> · descartado R$ 6,50</p></section>
</div></main>
<nav class="ch-abas" aria-label="Navegação principal"><span class="ch-marca">comerHoje</span>
 <button class="ch-aba" aria-current="page"><span class="ch-aba-icone">⌂</span><span>Início</span></button>
 <button class="ch-aba"><span class="ch-aba-icone">▤</span><span>Estoque</span></button>
 <button class="ch-aba ch-aba--scan"><span class="ch-aba-icone">+</span><span>Escanear</span></button>
 <button class="ch-aba"><span class="ch-aba-icone">▦</span><span>Plano</span></button>
 <button class="ch-aba"><span class="ch-aba-icone">☑</span><span>Compras</span></button>
 <span class="ch-sync">● Planilha sincronizada · 21:04</span></nav>
<script>
const P = {fx}; const N = {json.dumps(nomes, ensure_ascii=False)}; const C = ComerHojeCore;
const lotes = P.lotes.map(l => ({{...l, validade_efetiva: C.validadeEfetiva(l, P.ingredientes[l.ingrediente])}}))
  .sort((a, b) => a.validade_efetiva.localeCompare(b.validade_efetiva));
const dias = (d) => Math.round((Date.parse(d) - Date.parse(P.hoje)) / 864e5);
const chip = (d) => d < 0 ? ['vencido','vencido'] : d <= 3 ? ['urgente', d === 0 ? 'vence hoje' : 'em ' + d + ' dias']
                  : d <= 7 ? ['atencao', 'em ' + d + ' dias'] : ['ok', d.split ? d : ''];
document.getElementById('urg').innerHTML = lotes.slice(0, 4).map(l => {{
  const d = dias(l.validade_efetiva); const [k, t] = chip(d);
  const dd = l.validade_efetiva.slice(8, 10) + '/' + l.validade_efetiva.slice(5, 7);
  return `<div class="ch-lote"><span class="ch-lote-nome">${{N[l.ingrediente]}}</span>
    <span class="ch-chip ch-chip--${{k}}">${{k === 'ok' ? dd : t}}</span>
    <span class="ch-lote-detalhe">${{l.qtd}} ${{l.ingrediente === 'ovo' ? 'un' : l.ingrediente === 'leite_uht' ? 'mL' : 'g'}}${{l.aberto_em ? ' · aberto' : ''}} · até ${{dd}}</span></div>`; }}).join('');
const plano = C.planejarGuloso(lotes, P.receitas, P.slots);
const r = plano.plano[0].receita;
document.getElementById('sug').innerHTML = `<div class="ch-lote"><span class="ch-lote-nome">${{r === 'nhoque_ao_sugo' ? 'Nhoque ao sugo' : r}}</span>
  <span class="ch-chip ch-chip--urgente">salva o molho</span>
  <span class="ch-lote-detalhe">usa: molho (aberto, até 13/11), nhoque · falta: parmesão 30 g</span></div>`;
window.__ok = {{primeiro: lotes[0].id, sugestao: r}};
</script></body></html>"""
        (tmp / "prototipo.html").write_text(html, encoding="utf-8")
        telas = RAIZ / "docs/verification/screens"; telas.mkdir(parents=True, exist_ok=True)
        with sync_playwright() as p:
            b = p.chromium.launch()
            cfgs = [("iphone_393x852.png", dict(viewport={"width": 393, "height": 852}, device_scale_factor=3,
                                                  is_mobile=True, has_touch=True)),
                    ("desktop_1440x900.png", dict(viewport={"width": 1440, "height": 900}))]
            info = {}
            for nome, cfg in cfgs:
                pg = b.new_page(**cfg); erros_js = []
                pg.on("pageerror", lambda e: erros_js.append(str(e)))
                pg.goto((tmp / "prototipo.html").as_uri())
                est = pg.evaluate("""() => { const n = getComputedStyle(document.querySelector('.ch-abas'));
                    return {pos: n.position, top: n.top, bottom: n.bottom, ok: window.__ok,
                            input_font: getComputedStyle(document.body).fontFamily.slice(0, 30)}; }""")
                pg.screenshot(path=str(telas / nome), full_page=False)
                info[nome] = (est, erros_js)
            b.close()
        m, d = info["iphone_393x852.png"][0], info["desktop_1440x900.png"][0]
        sem_erros = not info["iphone_393x852.png"][1] and not info["desktop_1440x900.png"][1]
        check("browser.tabbar_bottom_on_iphone", m["pos"] == "fixed" and m["bottom"] == "0px", json.dumps(m, ensure_ascii=False))
        check("browser.tabbar_top_on_desktop", d["pos"] == "fixed" and d["top"] == "0px", json.dumps({k: d[k] for k in ("pos", "top")}))
        check("browser.core_runs_in_page", sem_erros and m["ok"] == {"primeiro": "L3", "sugestao": "nhoque_ao_sugo"},
              f"first lot {m['ok']}; JS errors: {info['iphone_393x852.png'][1]}")
    except Exception as e:  # noqa
        check("browser.screens", False, f"{type(e).__name__}: {e}")

# ------------------------------------------------------------------ summary
palavras = len(re.findall(r"\w+", txt))
print(f"\nDocument: {len(txt.splitlines())} lines, ~{palavras} words, {len(art)} extracted artifacts")
falhas = [r for r in resultados if not r[1]]
print(f"{len(resultados) - len(falhas)}/{len(resultados)} checks passed")
json.dump([{"check": a, "ok": b, "detalhe": c} for a, b, c in resultados],
          open(RAIZ / "docs/verification/last_run.json", "w"), ensure_ascii=False, indent=1)
sys.exit(1 if falhas else 0)
