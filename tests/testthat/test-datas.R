# Dates on labels: the SAME fixtures as the JS core (tests/js/run_golden.js)
D <- fixture("golden_datas.json")
for (caso in D$casos) test_that(paste("datas", caso$id), {
  r <- extrair_datas(caso$texto, D$hoje)
  expect_identical(r$validade, data_ou_na(caso$validade))
  expect_identical(r$fabricacao, data_ou_na(caso$fabricacao))
  expect_identical(r$pesagem, data_ou_na(caso$pesagem))
  if (!is.null(caso$conf_min)) { expect_gte(r$confianca, caso$conf_min); expect_lte(r$confianca, caso$conf_max) }
})
for (v in D$votacao) test_that(paste("votacao", v$id), {
  leit <- lapply(v$leituras, function(l) list(validade = data_ou_na(l$validade), confianca = l$confianca, peso = l$peso))
  r <- votar_datas(leit)
  expect_identical(r$validade, data_ou_na(v$validade))
  expect_gte(r$confianca, v$conf_min); expect_lte(r$confianca, v$conf_max)
  expect_identical(isTRUE(r$conflito), v$conflito)
})
