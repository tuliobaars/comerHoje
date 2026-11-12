# SQLite store (the truth of the Shiny app): same state as the in-memory store after the reference
# operations, survives closing and reopening (a dropped session), and re-seeding the catalog keeps
# the synonyms the household taught. Skipped where RSQLite is not installed (webR).
test_that("SQLite chega ao mesmo estado que a mem\u00f3ria e sobrevive a reabrir", {
  skip_if_not_installed("RSQLite")
  G <- fixture("golden_operacoes.json")
  tz <- Sys.getenv("COMERHOJE_TZ"); Sys.setenv(COMERHOJE_TZ = G$fuso); on.exit(Sys.setenv(COMERHOJE_TZ = tz), add = TRUE)
  arq <- tempfile(fileext = ".db")
  s <- repo_sqlite(arq); m <- repo_memoria()
  for (op in G$ops) { expect_true(aplicar_op_unica(s, op)); aplicar_op_unica(m, op) }
  valor <- function(x) if (is.null(x) || (length(x) == 1 && is.na(x))) NA_character_ else if (is.numeric(x)) format(as.numeric(x)) else as.character(x)
  for (l in m$estado()$lotes) for (k in c("quantidade", "quantidade_inicial", "status", "local", "validade", "aberto_em", "excluido", "validade_origem"))
    expect_identical(valor(s$lote(l$id)[[k]]), valor(l[[k]]))
  expect_equal(DBI::dbGetQuery(s$con, "SELECT COUNT(*) AS n FROM movimentos")$n, length(m$estado()$movimentos))
  expect_identical(s$estado()$aprendidos$elcorte, "panceta")
  s$fechar()
  s2 <- repo_sqlite(arq); on.exit(s2$fechar(), add = TRUE)             # "session lost": open the file again
  expect_false(aplicar_op_unica(s2, G$ops[[1]]))                     # re-sent after reconnecting: ignored
  expect_equal(as.numeric(s2$lote("L1")$quantidade), as.numeric(m$lote("L1")$quantidade))
})
test_that("re-semear o cat\u00e1logo preserva sin\u00f4nimos aprendidos", {
  skip_if_not_installed("RSQLite")
  arq <- tempfile(fileext = ".db")
  s <- repo_sqlite(arq)
  s$aprender("elcorte", "panceta")
  DBI::dbExecute(s$con, "UPDATE meta SET valor = 'versao antiga' WHERE chave = 'catalogo'")
  s$fechar()
  s <- repo_sqlite(arq); on.exit(s$fechar())                          # new catalog version: seeds again
  expect_false(identical(DBI::dbGetQuery(s$con, "SELECT valor FROM meta WHERE chave = 'catalogo'")$valor, "versao antiga"))
  expect_identical(casar_ingrediente(s, "elcorte"), "panceta")
  expect_identical(casar_ingrediente(s, "aipim"), "mandioca")
})
