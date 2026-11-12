"""Checks the SQL of R/repo_sqlite.R against inst/extdata/schema.sql with real SQLite (no R needed):
   1. every column list that repo_sqlite() writes exists in the schema;
   2. the catalog seed (inst/extdata/*.csv, same transformations as catalogo_semear) loads with FKs on;
   3. the JS reference's final state (tests/fixtures/golden_operacoes.json) is inserted with those
      column lists, respects every CHECK, and v_estoque / v_desperdicio_mensal answer correctly."""
import csv, json, re, sqlite3, sys, pathlib, unicodedata
R = pathlib.Path(__file__).resolve().parents[2]
fonte = (R / "R/repo_sqlite.R").read_text(encoding="utf-8")
db = sqlite3.connect(":memory:"); db.execute("PRAGMA foreign_keys = ON")
sql = re.sub(r"--[^\n]*", "", (R / "inst/extdata/schema.sql").read_text(encoding="utf-8"))
for cmd in [c.strip() for c in re.split(r";\s*\n", sql) if c.strip()]: db.execute(cmd)   # same split as .sql_comandos()
ok = 0
def confere(c, msg):
    global ok
    if not c: print("FALHOU:", msg); sys.exit(1)
    ok += 1; print("ok  ", msg)
cols = {n: re.findall(r'"([a-z_]+)"', re.search(rf"{n} <- c\(([^)]*)\)", fonte, re.S).group(1)) for n in ["COLS_LOTE", "COLS_MOV", "COLS_COMPRA", "COLS_SOBRA"]}
tabela = {"COLS_LOTE": "lotes", "COLS_MOV": "movimentos", "COLS_COMPRA": "lista_compras", "COLS_SOBRA": "sobras"}
for k, t in tabela.items():
    existentes = {r[1] for r in db.execute(f"PRAGMA table_info({t})")}
    confere(set(cols[k]) <= existentes, f"{k} ⊂ colunas de {t} ({len(cols[k])} colunas)")
for consulta in re.findall(r'"((?:SELECT|INSERT|DELETE)[^"]+)"', fonte):
    if "%s" in consulta or consulta.strip() in ("DELETE FROM",): continue   # templates / paste(): covered above
    q = consulta
    try: db.execute("EXPLAIN " + q, [None] * q.count("?"))
    except sqlite3.Error as e: confere(False, f"SQL inválido: {q[:60]} ({e})")
confere(True, "todas as consultas literais de repo_sqlite.R compilam no SQLite")

def le(f): return list(csv.DictReader(open(R / "inst/extdata" / f, encoding="utf-8")))
norm = lambda s: re.sub(r" +", " ", re.sub(r"[^a-z0-9]+", " ", "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn"))).strip()
ins = lambda t, rows, cs: db.executemany(f"INSERT OR REPLACE INTO {t} ({','.join(cs)}) VALUES ({','.join('?' * len(cs))})", [[None if r[c] == "" else r[c] for c in cs] for r in rows])
ins("categorias", le("categorias.csv"), ["id", "nome", "secao_mercado", "ordem"])
ins("unidades", le("unidades.csv"), ["codigo", "nome_singular", "nome_plural", "abreviacao", "tipo", "fator_base"])
ing = le("ingredientes.csv")
ins("ingredientes", ing, ["id", "nome", "categoria_id", "unidade_base", "armazenamento", "validade_padrao_dias", "aberto_dias", "basico"])
vistos = set()
for g in ing:
    for t in dict.fromkeys([g["nome"]] + [x.strip() for x in g["sinonimos"].split(";") if x.strip()]):
        n = norm(t)
        if n in vistos: continue
        vistos.add(n); db.execute("INSERT INTO ingrediente_sinonimos VALUES (?, ?, ?, 'seed')", (n, t, g["id"]))
ins("conversoes", le("conversoes.csv"), ["ingrediente_id", "unidade", "qtd_base", "observacao"])
ins("receitas", le("receitas.csv"), ["id", "nome", "tipo", "porcoes"])
ins("receita_ingredientes", le("receita_ingredientes.csv"), ["receita_id", "ingrediente_id", "quantidade", "unidade", "opcional"])
confere(not db.execute("PRAGMA foreign_key_check").fetchall(), f"catálogo semeado sem violar FK ({len(ing)} ingredientes, {len(vistos)} termos)")

G = json.loads((R / "tests/fixtures/golden_operacoes.json").read_text(encoding="utf-8"))["esperado"]
def grava(k, linhas):
    t = tabela[k]
    for l in linhas:
        v = [(1 if l.get(c) is True else 0 if l.get(c) is False else l.get(c)) for c in cols[k]]
        db.execute(f"INSERT OR REPLACE INTO {t} ({','.join(cols[k])}) VALUES ({','.join('?' * len(cols[k]))})", v)
grava("COLS_LOTE", G["lotes"]); grava("COLS_MOV", G["movimentos"]); grava("COLS_COMPRA", G["compras"]); grava("COLS_SOBRA", G["sobras"])
confere(not db.execute("PRAGMA foreign_key_check").fetchall(), "estado final do JS gravado com as colunas do R, sem violar FK/CHECK")
try:
    db.execute("INSERT INTO movimentos (id, lote_id, tipo, quantidade, criado_em) VALUES ('x', 'L1', 'descarte', -1, '2026-11-11')"); confere(False, "descarte sem motivo aceito")
except sqlite3.IntegrityError: confere(True, "CHECK: descarte sem motivo é recusado")
ve = dict(db.execute("SELECT id, validade_efetiva FROM v_estoque"))
confere(ve == {"L1": "2027-02-08"}, f"v_estoque: só a panceta ativa, validade do freezer {ve}")
d = db.execute("SELECT mes, descartes, valor_rs FROM v_desperdicio_mensal").fetchall()
confere(d == [("2026-11", 1, 3.5)], f"v_desperdicio_mensal: {d}")
# Re-seeding the catalog (new catalog version) must keep the synonyms the household taught the app.
# catalogo_semear() upserts (ON CONFLICT ... DO UPDATE); INSERT OR REPLACE would delete the old row and
# the ON DELETE CASCADE of ingrediente_sinonimos would drop the learned synonyms with it.
semear = re.search(r"catalogo_semear <- function.*", fonte, re.S).group(0)
confere("ON CONFLICT" in semear and "INSERT OR REPLACE INTO %s" not in semear, "catalogo_semear usa UPSERT (não REPLACE) nas tabelas do catálogo")
db.execute("INSERT OR REPLACE INTO ingrediente_sinonimos VALUES ('elcorte', 'elcorte', 'panceta', 'aprendido')")
cs = ["id", "nome", "categoria_id", "unidade_base", "armazenamento", "validade_padrao_dias", "aberto_dias", "basico"]
upsert = (f"INSERT INTO ingredientes ({','.join(cs)}) VALUES ({','.join('?' * len(cs))}) ON CONFLICT (id) DO UPDATE SET "
          + ", ".join(f"{c} = excluded.{c}" for c in cs[1:]))
db.executemany(upsert, [[None if g[c] == "" else g[c] for c in cs] for g in ing])
confere(db.execute("SELECT ingrediente_id FROM ingrediente_sinonimos WHERE sinonimo_norm = 'elcorte'").fetchone() == ("panceta",),
        "re-semear com UPSERT preserva sinônimo aprendido")
db.execute("SAVEPOINT s")
ins("ingredientes", [g for g in ing if g["id"] == "panceta"], cs)
perdeu = db.execute("SELECT count(*) FROM ingrediente_sinonimos WHERE sinonimo_norm = 'elcorte'").fetchone()[0] == 0
db.execute("ROLLBACK TO s")
confere(perdeu, "(regressão documentada) INSERT OR REPLACE apagaria o sinônimo aprendido via ON DELETE CASCADE")
print(f"\n{ok} verificações ok (SQLite {sqlite3.sqlite_version})")
