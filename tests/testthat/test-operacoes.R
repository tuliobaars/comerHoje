# Parity: R (R/operacoes.R) reaches the same state as the JS reference (srcjs/app/20-loja.js).
G <- fixture("golden_operacoes.json")
Sys.setenv(COMERHOJE_TZ = G$fuso)
st <- repo_memoria()
for (op in G$ops) aplicar_op(st, op)
E <- st$estado()
campo <- function(x, k) { v <- x[[k]]; if (is.null(v) || (length(v) == 1 && is.na(v))) NA else v }
comparar <- function(obt, esp, campos, nome) test_that(nome, {
  expect_identical(length(obt), length(esp))
  for (j in seq_along(esp)) for (k in campos) {
    a <- campo(obt[[j]], k); b <- campo(esp[[j]], k)
    if (is.numeric(b) || is.numeric(a)) expect_equal(as.numeric(a), as.numeric(b)) else expect_identical(as.character(a), as.character(b))
  }
})
comparar(E$lotes, G$esperado$lotes, c("id", "ingrediente_id", "descricao", "quantidade", "quantidade_inicial", "status", "local", "validade",
                                      "validade_origem", "aberto_em", "preco_total", "excluido", "criado_em", "atualizado_em"), "lotes iguais ao JS")
comparar(E$movimentos, G$esperado$movimentos, c("id", "lote_id", "tipo", "quantidade", "motivo", "valor_estimado", "refeicao_id", "a_tempo", "criado_em"), "movimentos iguais ao JS")
comparar(E$compras, G$esperado$compras, c("id", "descricao", "quantidade", "comprado", "excluido", "atualizado_em"), "lista de compras igual ao JS")
comparar(E$sobras, G$esperado$sobras, c("id", "porcoes", "status", "validade"), "sobras iguais ao JS")
test_that("plano, config, produtos e sinônimos aprendidos iguais ao JS", {
  expect_identical(vapply(E$plano$refeicoes, `[[`, "", "status"), vapply(G$esperado$plano$refeicoes, `[[`, "", "status"))
  expect_equal(E$config$pessoas, G$esperado$config$pessoas)
  expect_identical(E$produtos[["7896102503814"]]$ingrediente_id, G$esperado$produtos[["7896102503814"]]$ingrediente_id)
  expect_identical(E$aprendidos$elcorte, G$esperado$aprendidos$elcorte)
})
test_that("erros iguais aos do JS", {
  expect_error(aplicar_op(repo_memoria(), list(id = "x", op = "lote.baixar", t = "2026-11-10T01:15:00.000Z",
                                               args = list(id = "nao-existe", quantidade = 1, tipo = "consumo"))), G$erros$lote_inexistente)
  s2 <- repo_memoria(); aplicar_op(s2, G$ops[[1]])
  expect_error(aplicar_op(s2, list(id = "y", op = "lote.baixar", t = "2026-11-10T02:15:00.000Z", args = list(id = "L1", quantidade = 1, tipo = "descarte"))),
               G$erros$descarte_sem_motivo)
})
test_that("operação reenviada após reconexão é aplicada uma vez só (idempotência)", {
  s3 <- repo_memoria()
  expect_true(aplicar_op_unica(s3, G$ops[[1]]))
  expect_false(aplicar_op_unica(s3, G$ops[[1]]))
  expect_identical(length(s3$estado()$movimentos), 1L)
})
test_that("operação com erro não deixa meia gravação (transação)", {
  s4 <- repo_memoria(); aplicar_op_unica(s4, G$ops[[1]])
  expect_error(aplicar_op_unica(s4, list(id = "z", op = "lote.baixar", t = "2026-11-10T02:15:00.000Z", args = list(id = "L1", quantidade = 1, tipo = "descarte"))))
  expect_equal(s4$lote("L1")$quantidade, 482)
  expect_false(s4$op_aplicada("z"))
})
