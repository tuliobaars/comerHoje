-- comerHoje: SQLite schema v2 (inst/extdata/schema.sql). Dates are TEXT 'AAAA-MM-DD'; timestamps are
-- ISO-8601 TEXT. "Today" is never computed in SQL: date('now') is UTC, and the household's "today" is
-- America/Sao_Paulo (hoje_br()). Ids of lots, movements and list items are UUIDs created on the DEVICE
-- (same operation contract as the browser: srcjs/app/20-loja.js <-> R/operacoes.R).
PRAGMA foreign_keys = ON;

CREATE TABLE meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);

-- ---------- catalog (seed from inst/extdata/*.csv, idempotent) ----------
CREATE TABLE categorias (id TEXT PRIMARY KEY, nome TEXT NOT NULL UNIQUE, secao_mercado TEXT NOT NULL, ordem INTEGER NOT NULL);
CREATE TABLE unidades (
  codigo TEXT PRIMARY KEY, nome_singular TEXT NOT NULL, nome_plural TEXT NOT NULL, abreviacao TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('massa','volume','contagem','especifica','qualitativa')),
  fator_base REAL,
  CHECK ((tipo IN ('massa','volume','contagem') AND fator_base > 0) OR (tipo IN ('especifica','qualitativa') AND fator_base IS NULL)));
CREATE TABLE ingredientes (
  id TEXT PRIMARY KEY CHECK (id GLOB '[a-z]*' AND id NOT GLOB '*[^a-z0-9_]*'),
  nome TEXT NOT NULL UNIQUE,
  categoria_id TEXT NOT NULL REFERENCES categorias(id),
  unidade_base TEXT NOT NULL REFERENCES unidades(codigo) CHECK (unidade_base IN ('g','ml','un')),
  armazenamento TEXT NOT NULL CHECK (armazenamento IN ('geladeira','freezer','despensa','fruteira')),
  validade_padrao_dias INTEGER NOT NULL CHECK (validade_padrao_dias > 0),
  aberto_dias INTEGER CHECK (aberto_dias IS NULL OR aberto_dias > 0),
  basico INTEGER NOT NULL DEFAULT 0 CHECK (basico IN (0,1)),
  kcal_100 REAL, proteina_100 REAL, fonte_nutricional TEXT);
CREATE TABLE ingrediente_sinonimos (
  sinonimo_norm TEXT PRIMARY KEY, sinonimo TEXT NOT NULL,
  ingrediente_id TEXT NOT NULL REFERENCES ingredientes(id) ON DELETE CASCADE,
  origem TEXT NOT NULL DEFAULT 'seed' CHECK (origem IN ('seed','usuario','aprendido')));
CREATE TABLE conversoes (
  ingrediente_id TEXT NOT NULL REFERENCES ingredientes(id) ON DELETE CASCADE,
  unidade TEXT NOT NULL REFERENCES unidades(codigo),
  qtd_base REAL NOT NULL CHECK (qtd_base > 0), observacao TEXT,
  PRIMARY KEY (ingrediente_id, unidade));
CREATE TABLE receitas (id TEXT PRIMARY KEY, nome TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('prato_unico','base','mistura','guarnicao','salada','cafe_lanche')),
  porcoes INTEGER NOT NULL CHECK (porcoes > 0));
CREATE TABLE receita_ingredientes (
  receita_id TEXT NOT NULL REFERENCES receitas(id) ON DELETE CASCADE,
  ingrediente_id TEXT NOT NULL REFERENCES ingredientes(id),
  quantidade REAL NOT NULL CHECK (quantidade >= 0), unidade TEXT NOT NULL REFERENCES unidades(codigo),
  opcional INTEGER NOT NULL DEFAULT 0 CHECK (opcional IN (0,1)),
  PRIMARY KEY (receita_id, ingrediente_id));
CREATE TABLE produtos (                           -- GTIN -> ingredient (learned when the user confirms a scan)
  gtin TEXT PRIMARY KEY CHECK (length(gtin) IN (8,12,13,14)),
  ingrediente_id TEXT REFERENCES ingredientes(id), descricao TEXT, marca TEXT, qtd_embalagem REAL,
  fonte TEXT NOT NULL CHECK (fonte IN ('openfoodfacts','usuario','nfce')), atualizado_em TEXT NOT NULL);

-- ---------- household data ----------
CREATE TABLE lotes (                              -- 1 row = 1 package/portion with ITS OWN expiry date
  id TEXT PRIMARY KEY,
  ingrediente_id TEXT NOT NULL REFERENCES ingredientes(id),
  gtin TEXT, descricao TEXT,
  quantidade REAL NOT NULL CHECK (quantidade >= 0),            -- in the ingredient's base unit
  quantidade_inicial REAL,
  local TEXT NOT NULL CHECK (local IN ('geladeira','freezer','despensa','fruteira')),
  data_compra TEXT,
  validade TEXT CHECK (validade IS NULL OR validade GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  validade_origem TEXT NOT NULL CHECK (validade_origem IN ('rotulo','estimada','usuario')),
  aberto_em TEXT,
  preco_total REAL CHECK (preco_total IS NULL OR preco_total >= 0),
  origem TEXT NOT NULL CHECK (origem IN ('manual','scan_rotulo','scan_balanca','nfce','visao','planilha','sobra','exemplo')),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','consumido','descartado')),
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL,
  excluido INTEGER NOT NULL DEFAULT 0 CHECK (excluido IN (0,1)));
CREATE INDEX idx_lotes_ativos ON lotes(ingrediente_id) WHERE status = 'ativo' AND excluido = 0;

CREATE TABLE movimentos (                         -- ledger: every entry / use / discard
  id TEXT PRIMARY KEY,                            -- "<op id>:e" | "<op id>:b"
  lote_id TEXT NOT NULL REFERENCES lotes(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','consumo','descarte','ajuste')),
  quantidade REAL NOT NULL,                       -- negative = leaves stock
  motivo TEXT CHECK (motivo IS NULL OR motivo IN ('venceu','estragou','sobra_esquecida','nao_gostou','outro')),
  valor_estimado REAL, refeicao_id TEXT,
  a_tempo INTEGER CHECK (a_tempo IS NULL OR a_tempo IN (0,1)),   -- used before the effective expiry?
  criado_em TEXT NOT NULL,
  CHECK (tipo <> 'descarte' OR motivo IS NOT NULL));

CREATE TABLE lista_compras (
  id TEXT PRIMARY KEY, ingrediente_id TEXT REFERENCES ingredientes(id), descricao TEXT NOT NULL,
  quantidade REAL, unidade TEXT, origem TEXT, comprado INTEGER NOT NULL DEFAULT 0 CHECK (comprado IN (0,1)),
  atualizado_em TEXT NOT NULL, excluido INTEGER NOT NULL DEFAULT 0 CHECK (excluido IN (0,1)));

CREATE TABLE planos (id TEXT PRIMARY KEY, json TEXT NOT NULL, criado_em TEXT NOT NULL);   -- latest = current

CREATE TABLE sobras (
  id TEXT PRIMARY KEY, receita_id TEXT REFERENCES receitas(id), descricao TEXT NOT NULL,
  porcoes REAL NOT NULL CHECK (porcoes >= 0), feita_em TEXT NOT NULL, validade TEXT NOT NULL,
  local TEXT NOT NULL DEFAULT 'geladeira' CHECK (local IN ('geladeira','freezer')),
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','consumida','descartada')),
  atualizado_em TEXT NOT NULL, excluido INTEGER NOT NULL DEFAULT 0 CHECK (excluido IN (0,1)));

CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);                  -- JSON values

-- ---------- surviving dropped sessions ----------
CREATE TABLE ops_aplicadas (op_id TEXT PRIMARY KEY, op TEXT NOT NULL, aplicada_em TEXT NOT NULL);   -- idempotency
CREATE TABLE rascunhos (id TEXT PRIMARY KEY, tipo TEXT NOT NULL, json TEXT NOT NULL, atualizado_em TEXT NOT NULL);

-- ---------- Google Sheet ----------
CREATE TABLE sync_base (aba TEXT NOT NULL, id TEXT NOT NULL, hash TEXT NOT NULL, sincronizado_em TEXT NOT NULL, PRIMARY KEY (aba, id));
CREATE TABLE sync_estado (aba TEXT PRIMARY KEY, ultima_revisao INTEGER NOT NULL DEFAULT 0, ultima_sync TEXT, ultimo_erro TEXT);

-- Stock with effective expiry = min(printed or estimated expiry, opened_on + days after opening)
CREATE VIEW v_estoque AS
WITH base AS (
  SELECT l.*, i.nome, i.categoria_id, i.unidade_base, i.aberto_dias, i.basico,
         COALESCE(l.validade, date(COALESCE(l.data_compra, substr(l.criado_em, 1, 10)), '+' || i.validade_padrao_dias || ' days')) AS validade_base,
         CASE WHEN l.aberto_em IS NOT NULL AND i.aberto_dias IS NOT NULL THEN date(l.aberto_em, '+' || i.aberto_dias || ' days') END AS limite_aberto
  FROM lotes l JOIN ingredientes i ON i.id = l.ingrediente_id
  WHERE l.status = 'ativo' AND l.excluido = 0 AND l.quantidade > 0)
SELECT *, CASE WHEN limite_aberto IS NOT NULL AND limite_aberto < validade_base THEN limite_aberto ELSE validade_base END AS validade_efetiva FROM base;

-- Waste per month (R$ and quantity), for "quanto evitamos jogar fora"
CREATE VIEW v_desperdicio_mensal AS
SELECT substr(m.criado_em, 1, 7) AS mes, i.categoria_id, COUNT(*) AS descartes, SUM(-m.quantidade) AS qtd_base, SUM(m.valor_estimado) AS valor_rs
FROM movimentos m JOIN lotes l ON l.id = m.lote_id JOIN ingredientes i ON i.id = l.ingrediente_id
WHERE m.tipo = 'descarte' GROUP BY 1, 2;

INSERT INTO meta (chave, valor) VALUES ('schema_version', '2');
