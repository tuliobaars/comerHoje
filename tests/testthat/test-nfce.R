# NFC-e SC: parser over a SYNTHETIC page in the common public-consultation layout (txtTit/Rqtd/RUN/RvlUnit/valor).
# [to verify] confirm with a real Santa Catarina receipt (tests/fixtures/nfce/README.md).
html <- paste(readLines(test_path("..", "fixtures", "nfce", "sintetica_layout_comum.html"), encoding = "UTF-8"), collapse = "\n")
test_that("itens da NFC-e (layout comum)", {
  r <- nfce_sc_consultar("https://sat.sef.sc.gov.br/nfce/consulta?p=42261104820467000190650010000123451000123456|2|1|1|abc", html = html)
  expect_identical(r$uf, "SC"); expect_identical(r$numero, "12345"); expect_identical(r$n, 3L)
  expect_identical(r$itens[[1]]$descricao, "PANCETA EL CORTE KG TEMPERADA")
  expect_equal(r$itens[[1]]$quantidade, 0.482); expect_identical(r$itens[[1]]$unidade, "KG"); expect_equal(r$itens[[1]]$valor, 14.89)
  expect_identical(casar_ingrediente(repo_memoria(), r$itens[[2]]$descricao), "molho_tomate")
})
test_that("recusa chave inválida e endereço que não é da SEFAZ-SC", {
  expect_error(nfce_sc_consultar("42261104820467000190650010000123451000123450", html = html), "verificador")
  expect_error(nfce_sc_consultar("https://exemplo.com/?p=42261104820467000190650010000123451000123456"), "SEFAZ-SC")
})
