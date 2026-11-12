# Operations contract, identical to srcjs/app/20-loja.js (aplicarOp). Each operation is
# {id, op, args, t}: the id is a UUID made on the device, t is an ISO timestamp from the device. The store
# records applied ids (ops_aplicadas), so an operation re-sent after a reconnect is ignored. Parity
# with JS: tests/webr/test-operacoes.R over tests/fixtures/golden_operacoes.json.

.arred <- function(x, casas) floor(x * 10^casas + 0.5) / 10^casas     # same as JS Math.round (not R's banker's rounding)
.dia_br <- function(t) format(as.POSIXct(sub("Z$", "", sub("\\.\\d+", "", t)), tz = "UTC", format = "%Y-%m-%dT%H:%M:%S"),
                              "%Y-%m-%d", tz = Sys.getenv("COMERHOJE_TZ", "America/Sao_Paulo"))
.ou <- function(x, padrao) if (is.null(x) || (length(x) == 1 && is.na(x))) padrao else x

#' Apply one operation to a store
#'
#' Implements the operation contract shared with the browser (`srcjs/app/20-loja.js`): `lote.salvar`,
#' `lote.baixar`, `lote.abrir`, `lote.mover`, `lote.excluir`, `compras.salvar`, `compras.marcar`,
#' `compras.excluir`, `plano.salvar`, `refeicao.marcar`, `sobra.salvar`, `sobra.baixar`,
#' `config.salvar`, `produto.salvar`, `sinonimo.aprender` and `tudo.apagar`. Both implementations
#' reach the same state from the same fixtures.
#'
#' @param store A store created by [repo_sqlite()] or [repo_memoria()].
#' @param op An operation: a list with `id` (UUID made on the device), `op`, `args` and `t` (ISO
#'   timestamp made on the device).
#' @return `TRUE`, invisibly. Errors (unknown lot, discard without reason, unknown operation) abort
#'   the operation.
#' @seealso [aplicar_op_unica()], which adds idempotency and a transaction.
#' @examples
#' st <- repo_memoria()
#' lote <- list(id = "L1", ingrediente_id = "leite_uht", quantidade = 1000)
#' aplicar_op(st, list(id = "o1", op = "lote.salvar", t = "2026-06-01T12:00:00Z",
#'                     args = list(lote = lote)))
#' st$lote("L1")$quantidade
#' @export
aplicar_op <- function(store, op) {
  a <- .ou(op$args, list()); t <- op$t
  switch(op$op,
    "lote.salvar" = {
      l <- a$lote; atual <- store$lote(l$id)
      if (!is.null(atual)) {
        novo <- utils::modifyList(atual, l)
        novo$criado_em <- atual$criado_em; novo$quantidade_inicial <- atual$quantidade_inicial; novo$atualizado_em <- t
        store$lote_gravar(novo)
      } else {
        padrao <- list(status = "ativo", excluido = 0L, local = "geladeira", validade_origem = "usuario", origem = "manual")
        novo <- utils::modifyList(padrao, l)
        novo$quantidade_inicial <- l$quantidade; novo$criado_em <- t; novo$atualizado_em <- t
        store$lote_gravar(novo)
        store$mov_inserir(list(id = paste0(op$id, ":e"), lote_id = l$id, tipo = "entrada", quantidade = l$quantidade, motivo = NULL,
                               valor_estimado = l$preco_total, refeicao_id = NULL, a_tempo = NULL, criado_em = t))
      }
    },
    "lote.baixar" = {
      l <- store$lote(a$id)
      if (is.null(l)) stop("lote inexistente: ", a$id)
      if (identical(a$tipo, "descarte") && is.null(a$motivo)) stop("descarte precisa de motivo")
      q <- min(as.numeric(a$quantidade), l$quantidade)
      l$quantidade <- .arred(l$quantidade - q, 6)
      if (l$quantidade <= 1e-9) { l$quantidade <- 0; l$status <- if (identical(a$tipo, "descarte")) "descartado" else "consumido" }
      l$atualizado_em <- t
      store$lote_gravar(l)
      qi <- .ou(l$quantidade_inicial, 0)
      valor <- if (is.null(l$preco_total) || is.na(l$preco_total) || !qi) NULL else .arred(l$preco_total * q / qi, 2)
      a_tempo <- if (identical(a$tipo, "consumo") && !is.null(a$validade_efetiva)) .dia_br(t) <= a$validade_efetiva else NULL
      store$mov_inserir(list(id = paste0(op$id, ":b"), lote_id = l$id, tipo = a$tipo, quantidade = -q, motivo = a$motivo,
                             valor_estimado = valor, refeicao_id = a$refeicao_id, a_tempo = a_tempo, criado_em = t))
    },
    "lote.abrir" = { l <- store$lote(a$id); if (!is.null(l)) { l$aberto_em <- a$data; l$atualizado_em <- t; store$lote_gravar(l) } },
    "lote.mover" = {
      l <- store$lote(a$id)
      if (!is.null(l)) {
        l$local <- a$local
        if (!is.null(a$validade)) { l$validade <- a$validade; l$validade_origem <- .ou(a$validade_origem, "estimada") }
        l$atualizado_em <- t; store$lote_gravar(l)
      }
    },
    "lote.excluir" = { l <- store$lote(a$id); if (!is.null(l)) { l$excluido <- 1L; l$atualizado_em <- t; store$lote_gravar(l) } },
    "compras.salvar" = {
      it <- a$item; atual <- store$compra(it$id)
      novo <- if (is.null(atual)) utils::modifyList(list(comprado = 0L, excluido = 0L), it) else utils::modifyList(atual, it)
      novo$atualizado_em <- t; store$compra_gravar(novo)
    },
    "compras.marcar" = { it <- store$compra(a$id); if (!is.null(it)) { it$comprado <- if (isTRUE(a$comprado)) 1L else 0L; it$atualizado_em <- t; store$compra_gravar(it) } },
    "compras.excluir" = { it <- store$compra(a$id); if (!is.null(it)) { it$excluido <- 1L; it$atualizado_em <- t; store$compra_gravar(it) } },
    "plano.salvar" = { p <- a$plano; p$criado_em <- t; store$plano_gravar(p) },
    "refeicao.marcar" = {
      p <- store$plano()
      if (!is.null(p)) { for (k in seq_along(p$refeicoes)) if (identical(p$refeicoes[[k]]$id, a$id)) p$refeicoes[[k]]$status <- a$status; store$plano_gravar(p) }
    },
    "sobra.salvar" = {
      s <- a$sobra; atual <- store$sobra(s$id)
      novo <- if (is.null(atual)) utils::modifyList(list(status = "ativa", excluido = 0L, local = "geladeira"), s) else utils::modifyList(atual, s)
      novo$atualizado_em <- t; store$sobra_gravar(novo)
    },
    "sobra.baixar" = {
      s <- store$sobra(a$id)
      if (!is.null(s)) {
        s$porcoes <- max(0, s$porcoes - a$porcoes)
        if (s$porcoes <= 0) s$status <- if (identical(a$tipo, "descarte")) "descartada" else "consumida"
        s$atualizado_em <- t; store$sobra_gravar(s)
      }
    },
    "config.salvar" = store$config_gravar(a$chave, a$valor),
    "produto.salvar" = store$produto_gravar(a$gtin, a$ingrediente_id, a$descricao, a$qtd_embalagem),
    "sinonimo.aprender" = store$aprender(a$termo, a$ingrediente_id),
    "tudo.apagar" = store$apagar_tudo(),
    stop("opera\u00e7\u00e3o desconhecida: ", op$op)
  )
  invisible(TRUE)
}

#' Apply an operation once, in a transaction
#'
#' Ignores operations whose id was already applied (an operation re-sent after a reconnection) and
#' rolls back everything if the operation fails.
#'
#' @inheritParams aplicar_op
#' @return `TRUE` if applied now, `FALSE` if it had already been applied.
#' @examples
#' st <- repo_memoria()
#' op <- list(id = "o1", op = "compras.salvar", t = "2026-06-01T12:00:00Z",
#'            args = list(item = list(id = "c1", descricao = "Tainha")))
#' aplicar_op_unica(st, op)
#' aplicar_op_unica(st, op)
#' @export
aplicar_op_unica <- function(store, op) {
  store$transacao(function() {
    if (store$op_aplicada(op$id)) return(FALSE)
    aplicar_op(store, op)
    store$op_registrar(op$id, op$op)
    TRUE
  })
}
