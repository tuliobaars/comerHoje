S <- fixture("golden_sync.json")
campos <- unlist(S$campos)
for (v in S$vetores) test_that(paste("fnv1a igual ao JS:", substr(v$texto, 1, 16)), expect_identical(fnv1a(v$texto), v$fnv1a))
for (caso in S$casos) test_that(paste("merge de 3 vias:", caso$nome), {
  r <- mesclar_3vias(caso$local, caso$remoto, caso$base, campos)
  for (k in names(caso$esperado)) expect_identical(r[[k]], unlist(caso$esperado[[k]]))
})
test_that("merge é idempotente (aplicar o resultado e mesclar de novo = nada)", {
  L <- list(list(id = "a", item = "Molho", quantidade = 240, unidade = "g", local = "geladeira", validade = "2027-03-31", aberto_em = "", preco_total = 4.49, excluido = 0))
  base <- list(list(id = "a", hash = fnv1a(.canonico(L[[1]], campos))))
  expect_identical(mesclar_3vias(L, L, base, campos)$nada, "a")
})
