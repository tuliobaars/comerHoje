#!/usr/bin/env python3
"""One-off (already run): converts the catalog tables of docs/historico/ARCHITECTURE-v1.md (§8.2) into inst/extdata/*.csv and
adds the Santa Catarina regional items. From now on the CSVs are the source (the spec quotes them)."""
import csv, re, sys, pathlib
RAIZ = pathlib.Path(__file__).resolve().parents[1]
md = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
def tabelas(cab):
    L = md.splitlines(); out = []
    for i, l in enumerate(L):
        if l.startswith(cab) and L[i + 1].startswith("|---"):
            h = [c.strip() for c in l.strip("|").split("|")]; j = i + 2
            while j < len(L) and L[j].startswith("|"):
                out.append(dict(zip(h, [c.strip() for c in L[j].strip().strip("|").split("|")]))); j += 1
    return out
cats = tabelas("| id | nome | secao_mercado | ordem |")
unis = tabelas("| codigo | singular | plural | abrev | tipo | fator_base |")
ings = tabelas("| id | nome | categoria | base | arm. | val. | aberto | bás. | sinônimos |")
convs = tabelas("| ingrediente | unidade | qtd_base | observação |")
recs = tabelas("| id | nome | tipo | porções | ingredientes |")

# ---- Santa Catarina (and southern) additions ---------------------------------------------------
sc = [  # id, nome, categoria, base, arm, val, aberto, basico, sinonimos
 ("tainha", "Tainha", "peixes", "g", "geladeira", 1, "", 0, "tainha fresca; tainha limpa; ova de tainha"),
 ("berbigao", "Berbigão", "peixes", "g", "geladeira", 1, "", 0, "berbigão limpo"),
 ("ostra", "Ostra", "peixes", "un", "geladeira", 3, "", 0, "ostras; ostra viva; ostra de florianópolis"),
 ("marisco", "Marisco", "peixes", "g", "geladeira", 1, "", 0, "mexilhão; mariscos; marisco desconchado"),
 ("marreco", "Marreco", "carnes", "g", "geladeira", 2, "", 0, "marreco inteiro"),
 ("pinhao", "Pinhão", "verduras_legumes", "g", "geladeira", 20, "", 0, "pinhões; pinhão cru"),
 ("nata", "Nata", "laticinios_ovos", "g", "geladeira", 10, 5, 0, "nata fresca; creme de leite fresco"),
 ("queijo_colonial", "Queijo colonial", "laticinios_ovos", "g", "geladeira", 30, 7, 0, "queijo serrano; queijo de colônia"),
 ("linguica_blumenau", "Linguiça Blumenau", "frios", "g", "geladeira", 30, 7, 0, "linguiça blumenau; linguiça defumada de blumenau"),
 ("chucrute", "Chucrute", "enlatados", "g", "despensa", 365, 14, 0, "repolho fermentado; sauerkraut"),
 ("pao_caseiro", "Pão caseiro", "padaria", "g", "despensa", 4, "", 0, "pão colonial; pão de casa"),
 ("cuca", "Cuca", "padaria", "g", "despensa", 4, "", 0, "cuca alemã; cuca de banana; cuca de uva"),
 ("chimia", "Chimia", "doces", "g", "despensa", 180, 30, 0, "schmier; geleia colonial"),
 ("melado", "Melado", "doces", "g", "despensa", 365, 60, 0, "melado de cana"),
]
extra_sin = {"fuba": "farinha para polenta; polenta", "salame": "salame colonial", "erva_mate": "chimarrão"}
sc_recs = [
 ("tainha_assada", "Tainha assada", "prato_unico", 3, "tainha 900 g; limao 1 un; alho 3 dente; azeite 2 c_sopa; sal 1 c_cha"),
 ("pinhao_cozido", "Pinhão cozido", "cafe_lanche", 4, "pinhao 500 g; sal 1 c_cha"),
 ("berbigao_ensopado", "Berbigão ensopado", "mistura", 3, "berbigao 500 g; tomate 2 un; cebola 1 un; alho 2 dente; cheiro_verde 0.5 maco; azeite 2 c_sopa; sal 1 pitada"),
]
sc_convs = [("ostra", "dz", 12, "dúzia"), ("limao", "un", 70, "")]

ids = {g["id"] for g in ings}
for r in sc:
    assert r[0] not in ids, r[0]
    ings.append(dict(zip(["id", "nome", "categoria", "base", "arm.", "val.", "aberto", "bás.", "sinônimos"], map(str, r))))
for g in ings:
    if g["id"] in extra_sin: g["sinônimos"] = "; ".join(filter(None, [g["sinônimos"], extra_sin[g["id"]]]))
for r in sc_recs: recs.append(dict(zip(["id", "nome", "tipo", "porções", "ingredientes"], map(str, r))))
conv_keys = {(c["ingrediente"], c["unidade"]) for c in convs}
for c in sc_convs:
    if (c[0], c[1]) not in conv_keys: convs.append(dict(zip(["ingrediente", "unidade", "qtd_base", "observação"], map(str, c))))

out = RAIZ / "inst" / "extdata"; out.mkdir(parents=True, exist_ok=True)
def gravar(nome, campos, linhas):
    with open(out / nome, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n"); w.writerow(campos); w.writerows(linhas)
gravar("categorias.csv", ["id", "nome", "secao_mercado", "ordem"], [[c["id"], c["nome"], c["secao_mercado"], c["ordem"]] for c in cats])
gravar("unidades.csv", ["codigo", "nome_singular", "nome_plural", "abreviacao", "tipo", "fator_base"],
       [[u["codigo"], u["singular"], u["plural"], u["abrev"], u["tipo"], u["fator_base"]] for u in unis])
gravar("ingredientes.csv", ["id", "nome", "categoria_id", "unidade_base", "armazenamento", "validade_padrao_dias", "aberto_dias", "basico", "sinonimos"],
       [[g["id"], g["nome"], g["categoria"], g["base"], g["arm."], g["val."], "" if g["aberto"] in ("—", "") else g["aberto"], g["bás."], g["sinônimos"]] for g in ings])
gravar("conversoes.csv", ["ingrediente_id", "unidade", "qtd_base", "observacao"], [[c["ingrediente"], c["unidade"], c["qtd_base"], c["observação"]] for c in convs])
linhas_r = []
for r in recs:
    for parte in [p.strip() for p in r["ingredientes"].split(";")]:
        m = re.fullmatch(r"([a-z0-9_]+)(\?)? ([0-9.]+) ([a-z_]+)", parte); assert m, (r["id"], parte)
        linhas_r.append([r["id"], m.group(1), m.group(3), m.group(4), 1 if m.group(2) else 0])
gravar("receitas.csv", ["id", "nome", "tipo", "porcoes"], [[r["id"], r["nome"], r["tipo"], r["porções"]] for r in recs])
gravar("receita_ingredientes.csv", ["receita_id", "ingrediente_id", "quantidade", "unidade", "opcional"], linhas_r)
print(f"{len(cats)} categorias, {len(unis)} unidades, {len(ings)} ingredientes ({len(sc)} de SC), {len(convs)} conversões, {len(recs)} receitas, {len(linhas_r)} linhas de receita")
