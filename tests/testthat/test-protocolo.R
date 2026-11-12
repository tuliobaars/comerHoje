# Shiny protocol without Shiny: ch_despachar() with the in-memory store.
test_that("op: aplica e responde; reenvio responde aplicada = FALSE", {
  st <- repo_memoria()
  m <- list(id = "u1", tipo = "op", op = "lote.salvar", t = "2026-11-11T12:00:00.000Z",
            args = list(lote = list(id = "L9", ingrediente_id = "nhoque", quantidade = 500, validade = "2027-06-29", validade_origem = "rotulo")))
  expect_true(ch_despachar(st, m)$resultado$aplicada)
  expect_false(ch_despachar(st, m)$resultado$aplicada)
})
test_that("consulta estado.carregar devolve o estado e as capacidades", {
  st <- repo_memoria()
  ch_despachar(st, list(id = "u2", tipo = "op", op = "compras.salvar", t = "2026-11-11T12:00:00.000Z", args = list(item = list(id = "C9", descricao = "Pinhão"))))
  r <- ch_despachar(st, list(id = "q1", tipo = "consulta", op = "estado.carregar", args = list()))
  expect_identical(r$resultado$estado$compras[[1]]$descricao, "Pinhão")
  expect_true(r$resultado$capacidades$servidor)
  expect_identical(r$resultado$capacidades$sync, "servidor")
})
test_that("consulta desconhecida dá erro", expect_error(ch_despachar(repo_memoria(), list(id = "q2", tipo = "consulta", op = "xyz")), "desconhecida"))
