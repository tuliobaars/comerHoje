C <- fixture("golden_codigos.json")
for (e in C$ean) test_that(paste("ean", e$codigo), expect_identical(ean_valido(e$codigo), e$valido))
for (b in C$balanca) test_that(paste("balanca", b$codigo), {
  r <- parse_etiqueta_balanca(b$codigo)
  expect_identical(if (is.null(r)) NULL else r$plu, b$plu)
  expect_equal(if (is.null(r)) NULL else r$preco_total, b$precoTotal)
})
for (n in C$nfce) test_that(paste("nfce", substr(n$chave, nchar(n$chave) - 11, nchar(n$chave))), {
  r <- chave_nfce(n$chave)
  expect_identical(r$valida, n$valida)
  if (!is.null(n$uf)) expect_identical(r$uf, n$uf)
  if (!is.null(n$numero)) expect_identical(r$numero, n$numero)
})
for (b in C$balanca_texto) test_that("etiqueta de balança lida por OCR (porco2.jpeg)", {
  r <- ler_balanca_texto(b$texto)
  expect_equal(r$peso_kg, b$peso_kg); expect_equal(r$preco_kg, b$preco_kg); expect_equal(r$total, b$total)
  expect_identical(r$consistente, b$consistente)
  expect_identical(gtins_do_texto(b$texto), unlist(b$gtins))
})
