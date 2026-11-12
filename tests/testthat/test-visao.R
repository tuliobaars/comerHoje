# Cloud vision: the answer is checked (a model can invent; our parser cannot).
test_that("trecho confirma a data: confiança alta (até 0,9)", {
  r <- visao_validar('{"validade":"2027-06-29","trecho":"Val.: 29 06 2027","produto":"nhoque","quantidade":500,"unidade":"g","confianca":0.95}', hoje = "2026-11-11")
  expect_identical(r$validade, "2027-06-29"); expect_equal(r$confianca, 0.9)
})
test_that("trecho não confirma: confiança limitada a 0,6", {
  r <- visao_validar('Claro! {"validade":"2027-06-20","trecho":"Val.: 29 06 2027","confianca":0.9}', hoje = "2026-11-11")
  expect_lte(r$confianca, 0.6)
})
test_that("data implausível vira NULL; JSON inválido dá erro; geladeira", {
  expect_null(visao_validar('{"validade":"2019-10-01","confianca":0.9}', hoje = "2026-11-11")$validade)
  expect_error(visao_validar("não sei", hoje = "2026-11-11"), "JSON")
  g <- visao_validar('{"itens":[{"nome":"leite UHT","tipo":"alimento"},{"nome":"panela de pressão","tipo":"recipiente_com_comida_provavel"}]}', modo = "geladeira")
  expect_identical(length(g$itens), 2L)
})
