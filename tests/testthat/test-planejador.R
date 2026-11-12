P <- fixture("golden_planner.json")
lotes <- lapply(P$lotes, function(l) { l$validade_efetiva <- validade_efetiva(l, P$ingredientes[[l$ingrediente]]); l })
test_that("validade efetiva: molho aberto em 10/11 vale até 13/11", {
  ve <- stats::setNames(vapply(lotes, `[[`, "", "validade_efetiva"), vapply(lotes, `[[`, "", "id"))
  for (k in names(P$esperado$validade_efetiva)) expect_identical(ve[[k]], P$esperado$validade_efetiva[[k]])
})
test_that("planejador guloso igual ao do aparelho", {
  r <- planejar_guloso(lotes, P$receitas, P$slots)
  esperado <- vapply(P$esperado$plano, function(x) if (is.null(x)) NA_character_ else x, "")
  obtido <- vapply(r$plano, function(p) if (is.null(p$receita)) NA_character_ else p$receita, "")
  expect_identical(obtido, esperado)
  expect_equal(unlist(r$compras[order(names(r$compras))]), unlist(P$esperado$compras[order(names(P$esperado$compras))]))
})
