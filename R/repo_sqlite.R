# SQLite store: the truth of the Shiny app. Everything a person does is saved here at once, in a
# transaction, with the operation id recorded (ops_aplicadas). So a dropped session (iPhone locked,
# tunnel, Wi-Fi -> 4G) loses nothing, and a re-sent operation is not applied twice.
# File: COMERHOJE_DB (Docker: volume /data; shinyapps.io: ephemeral disk -> the Google Sheet is the
# durable backup and a cold start restores from it, see sheets.R).

.json <- function(x) if (is.null(x)) NA_character_ else as.character(jsonlite::toJSON(x, auto_unbox = TRUE, null = "null", na = "null", digits = NA))
.dejson <- function(x) if (is.null(x) || is.na(x)) NULL else jsonlite::fromJSON(x, simplifyVector = FALSE)
.linha <- function(df) if (!nrow(df)) NULL else lapply(as.list(df[1, , drop = FALSE]), function(v) if (is.na(v)) NULL else v)
.linhas <- function(df) if (!nrow(df)) list() else lapply(seq_len(nrow(df)), function(i) .linha(df[i, , drop = FALSE]))

#' SQLite store of the household
#'
#' Opens the database, creating it from `inst/extdata/schema.sql` and seeding the catalog when needed
#' ([catalogo_semear()]). Uses WAL journaling and a busy timeout so that several sessions of the same
#' household can write. This is the source of truth of the Shiny app.
#'
#' @param caminho Path of the database file; defaults to the `COMERHOJE_DB` environment variable or
#'   `comerhoje.db`. Use a persistent volume (Docker: `/data`).
#' @return A store with the interface described in [repo_memoria()], plus `con` (the DBI connection).
#'   Call `fechar()` when done.
#' @examples
#' st <- repo_sqlite(tempfile(fileext = ".db"))
#' aplicar_op_unica(st, list(id = "o1", op = "lote.salvar", t = "2026-06-01T12:00:00Z",
#'   args = list(lote = list(id = "L1", ingrediente_id = "leite_uht", quantidade = 1000))))
#' st$lote("L1")$quantidade
#' st$fechar()
#' @export
repo_sqlite <- function(caminho = Sys.getenv("COMERHOJE_DB", "comerhoje.db")) {
  dir.create(dirname(caminho), showWarnings = FALSE, recursive = TRUE)
  con <- DBI::dbConnect(RSQLite::SQLite(), caminho)
  DBI::dbExecute(con, "PRAGMA journal_mode = WAL")
  DBI::dbExecute(con, "PRAGMA busy_timeout = 5000")
  DBI::dbExecute(con, "PRAGMA foreign_keys = ON")
  if (!DBI::dbExistsTable(con, "meta")) {
    sql <- paste(readLines(system.file("extdata", "schema.sql", package = "comerHoje"), encoding = "UTF-8"), collapse = "\n")
    for (s in .sql_comandos(sql)) DBI::dbExecute(con, s)
  }
  catalogo_semear(con)

  COLS_LOTE <- c("id", "ingrediente_id", "gtin", "descricao", "quantidade", "quantidade_inicial", "local", "data_compra", "validade",
                 "validade_origem", "aberto_em", "preco_total", "origem", "status", "criado_em", "atualizado_em", "excluido")
  COLS_MOV <- c("id", "lote_id", "tipo", "quantidade", "motivo", "valor_estimado", "refeicao_id", "a_tempo", "criado_em")
  COLS_COMPRA <- c("id", "ingrediente_id", "descricao", "quantidade", "unidade", "origem", "comprado", "atualizado_em", "excluido")
  COLS_SOBRA <- c("id", "receita_id", "descricao", "porcoes", "feita_em", "validade", "local", "status", "atualizado_em", "excluido")
  gravar <- function(tabela, cols, x) {
    v <- lapply(cols, function(k) { y <- x[[k]]; if (is.null(y) || length(y) == 0) NA else if (is.logical(y)) as.integer(y) else y })
    DBI::dbExecute(con, sprintf("INSERT OR REPLACE INTO %s (%s) VALUES (%s)", tabela, paste(cols, collapse = ","),
                                paste(rep("?", length(cols)), collapse = ",")), params = unname(v))
  }
  um <- function(sql, ...) {                      # RSQLite refuses params = list() for a query without "?"
    p <- list(...)
    .linha(if (length(p)) DBI::dbGetQuery(con, sql, params = p) else DBI::dbGetQuery(con, sql))
  }

  list(
    con = con,
    lote = function(id) um("SELECT * FROM lotes WHERE id = ?", id),
    lote_gravar = function(l) gravar("lotes", COLS_LOTE, l),
    mov_inserir = function(m) gravar("movimentos", COLS_MOV, m),
    compra = function(id) um("SELECT * FROM lista_compras WHERE id = ?", id),
    compra_gravar = function(it) gravar("lista_compras", COLS_COMPRA, it),
    plano = function() { r <- um("SELECT json FROM planos ORDER BY criado_em DESC LIMIT 1"); if (is.null(r)) NULL else .dejson(r$json) },
    plano_gravar = function(p) DBI::dbExecute(con, "INSERT OR REPLACE INTO planos (id, json, criado_em) VALUES (?, ?, ?)",
                                               params = list(p$id, .json(p), .ou(p$criado_em, format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")))),
    sobra = function(id) um("SELECT * FROM sobras WHERE id = ?", id),
    sobra_gravar = function(s) gravar("sobras", COLS_SOBRA, s),
    config_gravar = function(chave, valor) DBI::dbExecute(con, "INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)", params = list(chave, .json(valor))),
    produto_gravar = function(gtin, ing, desc, qtd) DBI::dbExecute(con,
      "INSERT OR REPLACE INTO produtos (gtin, ingrediente_id, descricao, qtd_embalagem, fonte, atualizado_em) VALUES (?, ?, ?, ?, 'usuario', ?)",
      params = list(gtin, ing, .ou(desc, NA), .ou(qtd, NA), format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"))),
    aprender = function(termo, ing) DBI::dbExecute(con,
      "INSERT OR REPLACE INTO ingrediente_sinonimos (sinonimo_norm, sinonimo, ingrediente_id, origem) VALUES (?, ?, ?, 'aprendido')",
      params = list(termo, termo, ing)),
    apagar_tudo = function() for (tb in c("movimentos", "lotes", "lista_compras", "planos", "sobras", "sync_base")) DBI::dbExecute(con, paste("DELETE FROM", tb)),
    op_aplicada = function(id) nrow(DBI::dbGetQuery(con, "SELECT 1 FROM ops_aplicadas WHERE op_id = ?", params = list(id))) > 0,
    op_registrar = function(id, op) DBI::dbExecute(con, "INSERT INTO ops_aplicadas (op_id, op, aplicada_em) VALUES (?, ?, ?)",
                                                   params = list(id, op, format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"))),
    transacao = function(fn) {
      DBI::dbExecute(con, "BEGIN IMMEDIATE")
      ok <- FALSE
      on.exit(if (!ok) try(DBI::dbExecute(con, "ROLLBACK"), silent = TRUE), add = TRUE)
      r <- fn(); DBI::dbExecute(con, "COMMIT"); ok <- TRUE; r
    },
    sync_base = function(aba) .linhas(DBI::dbGetQuery(con, "SELECT id, hash FROM sync_base WHERE aba = ?", params = list(aba))),
    sync_base_gravar = function(aba, lista) {
      DBI::dbExecute(con, "DELETE FROM sync_base WHERE aba = ?", params = list(aba))
      agora <- format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
      for (b in lista) DBI::dbExecute(con, "INSERT INTO sync_base (aba, id, hash, sincronizado_em) VALUES (?, ?, ?, ?)", params = list(aba, b$id, b$hash, agora))
    },
    estado = function(meses_historico = 3) {
      desde <- format(Sys.Date() - 31 * meses_historico)
      cfg <- DBI::dbGetQuery(con, "SELECT chave, valor FROM config")
      prod <- DBI::dbGetQuery(con, "SELECT gtin, ingrediente_id, descricao, qtd_embalagem FROM produtos")
      apr <- DBI::dbGetQuery(con, "SELECT sinonimo_norm, ingrediente_id FROM ingrediente_sinonimos WHERE origem = 'aprendido'")
      list(
        lotes = .linhas(DBI::dbGetQuery(con, "SELECT * FROM lotes WHERE status = 'ativo' OR atualizado_em >= ?", params = list(desde))),
        movimentos = .linhas(DBI::dbGetQuery(con, "SELECT * FROM movimentos WHERE criado_em >= ?", params = list(desde))),
        compras = .linhas(DBI::dbGetQuery(con, "SELECT * FROM lista_compras WHERE excluido = 0")),
        plano = { r <- um("SELECT json FROM planos ORDER BY criado_em DESC LIMIT 1"); if (is.null(r)) NULL else .dejson(r$json) },
        sobras = .linhas(DBI::dbGetQuery(con, "SELECT * FROM sobras WHERE status = 'ativa' AND excluido = 0")),
        produtos = stats::setNames(lapply(seq_len(nrow(prod)), function(i) .linha(prod[i, -1, drop = FALSE])), prod$gtin),
        aprendidos = stats::setNames(as.list(apr$ingrediente_id), apr$sinonimo_norm),
        config = stats::setNames(lapply(cfg$valor, .dejson), cfg$chave))
    },
    fechar = function() DBI::dbDisconnect(con))
}

# Splits a SQL script into commands (respects the BEGIN...END; of views/triggers and comments)
.sql_comandos <- function(sql) {
  sql <- gsub("--[^\n]*", "", sql)
  partes <- strsplit(sql, ";\\s*\n")[[1]]
  partes <- trimws(partes)
  partes[nzchar(partes)]
}

#' Seed the ingredient catalog into the database
#'
#' Loads categories, units, ingredients, synonyms, conversions and recipes from the CSV files in
#' `inst/extdata`, inside a transaction. Idempotent: does nothing when the catalog has not changed.
#' Rows are upserted, so the household's learned synonyms are preserved.
#'
#' @param con A DBI connection to a database created from `schema.sql`.
#' @param pasta Folder with the CSV files.
#' @return `TRUE` invisibly when it seeded, `FALSE` when the catalog was already current.
#' @export
catalogo_semear <- function(con, pasta = system.file("extdata", package = "comerHoje")) {
  le <- function(f) utils::read.csv(file.path(pasta, f), stringsAsFactors = FALSE, encoding = "UTF-8", na.strings = "")
  ing <- le("ingredientes.csv")
  versao <- paste(nrow(ing), tools::md5sum(file.path(pasta, "ingredientes.csv")))
  atual <- DBI::dbGetQuery(con, "SELECT valor FROM meta WHERE chave = 'catalogo'")
  if (nrow(atual) && identical(atual$valor, versao)) return(invisible(FALSE))
  DBI::dbWithTransaction(con, {
    # UPSERT, not INSERT OR REPLACE: REPLACE deletes the old row first, and the ON DELETE CASCADE of
    # ingrediente_sinonimos would silently drop the synonyms the household taught the app.
    ins <- function(tab, df, chave) {
      if (!nrow(df)) return()
      resto <- setdiff(names(df), chave)
      DBI::dbExecute(con, sprintf("INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s) DO %s", tab,
        paste(names(df), collapse = ","), paste(rep("?", ncol(df)), collapse = ","), paste(chave, collapse = ","),
        if (length(resto)) paste("UPDATE SET", paste0(resto, " = excluded.", resto, collapse = ", ")) else "NOTHING"),
        params = unname(as.list(df)))
    }
    ins("categorias", le("categorias.csv"), "id")
    ins("unidades", le("unidades.csv"), "codigo")
    ins("ingredientes", ing[, c("id", "nome", "categoria_id", "unidade_base", "armazenamento", "validade_padrao_dias", "aberto_dias", "basico")], "id")
    sin <- do.call(rbind, lapply(seq_len(nrow(ing)), function(i) {
      termos <- unique(c(ing$nome[i], trimws(strsplit(ifelse(is.na(ing$sinonimos[i]), "", ing$sinonimos[i]), ";")[[1]])))
      termos <- termos[nzchar(termos)]
      data.frame(sinonimo_norm = normalizar_termo(termos), sinonimo = termos, ingrediente_id = ing$id[i], origem = "seed")
    }))
    sin <- sin[!duplicated(sin$sinonimo_norm), ]
    DBI::dbExecute(con, "DELETE FROM ingrediente_sinonimos WHERE origem = 'seed'")
    DBI::dbExecute(con, "INSERT OR IGNORE INTO ingrediente_sinonimos (sinonimo_norm, sinonimo, ingrediente_id, origem) VALUES (?, ?, ?, ?)", params = unname(as.list(sin)))
    ins("conversoes", le("conversoes.csv"), c("ingrediente_id", "unidade"))
    ins("receitas", le("receitas.csv"), "id")
    ins("receita_ingredientes", le("receita_ingredientes.csv"), c("receita_id", "ingrediente_id"))
    DBI::dbExecute(con, "INSERT OR REPLACE INTO meta (chave, valor) VALUES ('catalogo', ?)", params = list(versao))
  })
  invisible(TRUE)
}
