cat <- jsonlite::fromJSON(system.file("extdata", "catalogo.json", package = "comerHoje"), simplifyVector = FALSE)
test_that("toda linha de receita converte para a unidade-base", {
  n <- 0L
  for (r in cat$receitas) for (l in r$ingredientes) { v <- converter_para_base(as.numeric(l$quantidade), l$unidade, l$ingrediente_id, cat); expect_gte(v, 0); n <- n + 1L }
  expect_gte(n, 100L)
})
test_that("sinônimos normalizados não colidem entre ingredientes", {
  dono <- list()
  for (g in cat$ingredientes) for (t in unique(normalizar_termo(c(g$nome, strsplit(g$sinonimos, ";")[[1]])))) {
    if (!nzchar(t)) next
    if (!is.null(dono[[t]])) expect_identical(dono[[t]], g$id) else dono[[t]] <- g$id
  }
  expect_gte(length(dono), length(cat$ingredientes))   # every name is a term (also keeps the test from being "empty" when nothing collides)
})
test_that("normalização igual à do JS (acentos de português)", {
  expect_identical(normalizar_termo("Feijão-fradinho"), "feijao fradinho")
  expect_identical(normalizar_termo("  Açaí (polpa) "), "acai polpa")
  expect_identical(normalizar_termo("Pão de queijo congelado"), "pao de queijo congelado")
})
test_that("itens de Santa Catarina no catálogo", {
  ids <- vapply(cat$ingredientes, `[[`, "", "id")
  for (i in c("tainha", "berbigao", "ostra", "marisco", "pinhao", "nata", "queijo_colonial", "cuca", "chimia", "melado")) expect_true(i %in% ids)
  expect_identical(casar_ingrediente(repo_memoria(), "bergamota"), "tangerina")
  expect_identical(casar_ingrediente(repo_memoria(), "aipim"), "mandioca")
})
